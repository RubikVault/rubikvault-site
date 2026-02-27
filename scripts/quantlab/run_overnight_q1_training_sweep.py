#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
import json
import os
import shlex
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import polars as pl

from q1_common import (
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--feature-store-version", default="v4_q1panel_overnight")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--panel-max-assets", type=int, default=0)
    p.add_argument("--min-bars", type=int, default=200)
    p.add_argument("--panel-days-list", default="60,90")
    p.add_argument("--top-liquid-list", default="20000,30000,40000,50000")
    p.add_argument("--asof-dates-count", type=int, default=8)
    p.add_argument("--fold-count", type=int, default=3)
    p.add_argument("--test-days", type=int, default=5)
    p.add_argument("--embargo-days", type=int, default=2)
    p.add_argument("--min-train-days", type=int, default=8)
    p.add_argument("--survivors-max", type=int, default=24)
    p.add_argument("--stageb-q1-strict-survivors-max", type=int, default=8)
    p.add_argument("--registry-score-epsilon", type=float, default=0.01)
    p.add_argument("--max-hours", type=float, default=9.5)
    p.add_argument("--task-timeout-minutes", type=float, default=120.0)
    p.add_argument("--task-order", choices=["safe_light_first", "heavy_first"], default="safe_light_first")
    p.add_argument("--task-nice", type=int, default=10)
    p.add_argument("--threads-cap", type=int, default=6)
    p.add_argument("--max-rss-gib", type=float, default=12.0)
    p.add_argument("--monitor-interval-sec", type=float, default=5.0)
    p.add_argument("--metrics-log-interval-sec", type=float, default=30.0)
    p.add_argument("--sleep-between-tasks-sec", type=float, default=20.0)
    p.add_argument("--stop-after-consecutive-failures", type=int, default=3)
    p.add_argument("--job-name", default="")
    p.add_argument("--plan-only", action="store_true")
    p.add_argument("--resume-from", default="")
    p.add_argument("--retry-failed", action="store_true")
    return p.parse_args(list(argv))


@dataclass
class Task:
    task_id: str
    asof_end_date: str
    panel_days: int
    top_liquid_n: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "asof_end_date": self.asof_end_date,
            "panel_days": self.panel_days,
            "top_liquid_n": self.top_liquid_n,
        }


def _parse_csv_ints(value: str) -> list[int]:
    out: list[int] = []
    for part in (value or "").split(","):
        s = part.strip()
        if not s:
            continue
        out.append(int(s))
    return out


def _recent_asof_dates_from_existing_panel(quant_root: Path, count: int) -> list[str]:
    # Prefer the largest cached full panel if present; otherwise fall back to any q1 panel files.
    candidates = [
        quant_root / "features" / "store" / "feature_store_version=v4_q1panel_fullchunk_cached",
        quant_root / "features" / "store" / "feature_store_version=v4_q1panel_fullchunk",
        quant_root / "features" / "store" / "feature_store_version=v4_q1panel_fulltry",
    ]
    panel_root = next((p for p in candidates if p.exists()), None)
    if panel_root is None:
        all_parts = sorted((quant_root / "features" / "store").rglob("part-panel*.parquet"))
    else:
        all_parts = sorted(panel_root.rglob("part-panel*.parquet"))
    if not all_parts:
        raise FileNotFoundError("No panel parquet files found to derive asof dates")
    df = (
        pl.scan_parquet([str(p) for p in all_parts])
        .select(pl.col("asof_date"))
        .unique()
        .sort("asof_date")
        .collect()
    )
    vals = [str(v) for v in df.get_column("asof_date").to_list()]
    if len(vals) <= count:
        return vals
    return vals[-count:]


def _build_tasks(args: argparse.Namespace, quant_root: Path) -> list[Task]:
    panel_days_values = _parse_csv_ints(args.panel_days_list)
    top_values = _parse_csv_ints(args.top_liquid_list)
    asof_dates = _recent_asof_dates_from_existing_panel(quant_root, args.asof_dates_count)
    asof_dates = sorted(asof_dates, reverse=True)
    if args.task_order == "heavy_first":
        panel_days_values = sorted(panel_days_values, reverse=True)
        top_values = sorted(top_values, reverse=True)
    else:
        # Safer default: warm caches and avoid immediate system pressure spikes.
        panel_days_values = sorted(panel_days_values)
        top_values = sorted(top_values)
    tasks: list[Task] = []
    for asof_end_date in asof_dates:
        for panel_days in panel_days_values:
            for top_n in top_values:
                tid = f"asof{asof_end_date}_p{panel_days}_top{top_n}"
                tasks.append(Task(task_id=tid, asof_end_date=asof_end_date, panel_days=panel_days, top_liquid_n=top_n))
    return tasks


def _parse_runner_stdout(lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in lines:
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        k = key.strip()
        if k in {"run_id", "status", "orchestrator_report", "ok"}:
            out[k] = value.strip()
    return out


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _acquire_job_lock(job_dir: Path) -> Path:
    lock_path = job_dir / "job_lock.json"
    if lock_path.exists():
        try:
            lock = json.loads(lock_path.read_text())
        except Exception:
            lock = {}
        pid = int(lock.get("pid") or 0)
        if pid > 0 and _pid_alive(pid):
            raise RuntimeError(f"job_lock_active pid={pid} path={lock_path}")
    lock_obj = {
        "schema": "quantlab_q1_overnight_job_lock_v1",
        "pid": os.getpid(),
        "acquired_at": utc_now_iso(),
        "job_dir": str(job_dir),
    }
    atomic_write_json(lock_path, lock_obj)

    def _release() -> None:
        try:
            if not lock_path.exists():
                return
            curr = json.loads(lock_path.read_text())
            if int(curr.get("pid") or 0) == os.getpid():
                lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    atexit.register(_release)
    return lock_path


def _task_cmd(args: argparse.Namespace, task: Task, quant_root: Path, snapshot_id: str) -> list[str]:
    repo_root = Path.cwd()
    runner = repo_root / "scripts" / "quantlab" / "run_q1_panel_stage_a_daily_local.py"
    panel_tag = f"overnight_p{task.panel_days}_top{task.top_liquid_n}_{task.asof_end_date}"
    return [
        args.python,
        str(runner),
        "--quant-root",
        str(quant_root),
        "--snapshot-id",
        snapshot_id,
        "--feature-store-version",
        args.feature_store_version,
        "--panel-output-tag",
        panel_tag,
        "--asset-classes",
        args.asset_classes,
        "--lookback-calendar-days",
        str(args.lookback_calendar_days),
        "--panel-calendar-days",
        str(task.panel_days),
        "--panel-max-assets",
        str(args.panel_max_assets),
        "--min-bars",
        str(args.min_bars),
        "--top-liquid-n",
        str(task.top_liquid_n),
        "--fold-count",
        str(args.fold_count),
        "--test-days",
        str(args.test_days),
        "--embargo-days",
        str(args.embargo_days),
        "--min-train-days",
        str(args.min_train_days),
        "--survivors-max",
        str(args.survivors_max),
        "--asof-end-date",
        task.asof_end_date,
        "--run-stageb-q1",
        "--run-registry-q1",
        "--stageb-q1-strict-survivors-max",
        str(args.stageb_q1_strict_survivors_max),
        "--registry-score-epsilon",
        str(args.registry_score_epsilon),
    ]


def _subprocess_env(args: argparse.Namespace) -> dict[str, str]:
    env = os.environ.copy()
    tc = str(max(1, int(args.threads_cap)))
    env.setdefault("POLARS_MAX_THREADS", tc)
    env.setdefault("OMP_NUM_THREADS", tc)
    env.setdefault("OPENBLAS_NUM_THREADS", tc)
    env.setdefault("MKL_NUM_THREADS", tc)
    env.setdefault("VECLIB_MAXIMUM_THREADS", tc)
    env.setdefault("NUMEXPR_NUM_THREADS", tc)
    env.setdefault("RAYON_NUM_THREADS", tc)
    return env


def _rss_kib_for_pid(pid: int) -> int | None:
    try:
        out = subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True).strip()
        if not out:
            return None
        return int(out.splitlines()[0].strip())
    except Exception:
        return None


def _child_pids_recursive(pid: int) -> list[int]:
    seen: set[int] = set()
    queue = [pid]
    while queue:
        parent = queue.pop(0)
        if parent in seen:
            continue
        seen.add(parent)
        try:
            out = subprocess.check_output(["pgrep", "-P", str(parent)], text=True).strip()
        except Exception:
            out = ""
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                child = int(line)
            except ValueError:
                continue
            if child not in seen:
                queue.append(child)
    return sorted(seen)


def _rss_kib_for_pid_tree(pid: int) -> int:
    total = 0
    for p in _child_pids_recursive(pid):
        total += _rss_kib_for_pid(p) or 0
    return total


def _child_preexec_nice(task_nice: int):
    def _fn() -> None:
        try:
            if task_nice:
                os.nice(int(task_nice))
        except Exception:
            pass
    return _fn


def _run_task_with_monitor(
    cmd: list[str],
    task_log: Path,
    args: argparse.Namespace,
    driver,
) -> tuple[int, dict[str, Any]]:
    env = _subprocess_env(args)
    max_rss_kib = int(float(args.max_rss_gib) * 1024 * 1024)
    monitor_interval = max(1.0, float(args.monitor_interval_sec))
    metrics_interval = max(monitor_interval, float(args.metrics_log_interval_sec))
    timeout_sec = max(60.0, float(args.task_timeout_minutes) * 60.0)

    peak_rss_kib = 0
    samples = 0
    timed_out = False
    killed_for_rss = False
    start = time.monotonic()
    next_metrics_log = start + metrics_interval

    with task_log.open("a") as tlog:
        proc = subprocess.Popen(
            cmd,
            stdout=tlog,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            preexec_fn=_child_preexec_nice(int(args.task_nice)),
            start_new_session=True,
        )
        tlog.write(
            f"[{utc_now_iso()}] MONITOR start pid={proc.pid} "
            f"task_nice={args.task_nice} threads_cap={args.threads_cap} max_rss_gib={args.max_rss_gib}\n"
        )
        tlog.flush()

        rc: int | None = None
        while True:
            rc = proc.poll()
            now = time.monotonic()
            rss_kib = _rss_kib_for_pid_tree(proc.pid)
            if rss_kib > peak_rss_kib:
                peak_rss_kib = rss_kib
            samples += 1

            if now >= next_metrics_log:
                msg = (
                    f"[{utc_now_iso()}] MONITOR rss_gib={rss_kib / (1024*1024):.3f} "
                    f"peak_rss_gib={peak_rss_kib / (1024*1024):.3f} elapsed_sec={round(now-start,1)}"
                )
                tlog.write(msg + "\n")
                tlog.flush()
                driver.write(msg + "\n")
                driver.flush()
                next_metrics_log = now + metrics_interval

            if rc is not None:
                break

            if rss_kib > 0 and rss_kib > max_rss_kib:
                killed_for_rss = True
                tlog.write(
                    f"[{utc_now_iso()}] MONITOR kill reason=max_rss_exceeded "
                    f"rss_gib={rss_kib/(1024*1024):.3f} limit_gib={args.max_rss_gib}\n"
                )
                tlog.flush()
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    pass
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except Exception:
                        pass
                rc = proc.poll()
                break

            if (now - start) > timeout_sec:
                timed_out = True
                tlog.write(f"[{utc_now_iso()}] TIMEOUT task_timeout_minutes={args.task_timeout_minutes}\n")
                tlog.flush()
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    pass
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except Exception:
                        pass
                rc = proc.poll()
                break

            time.sleep(monitor_interval)

        if timed_out:
            final_rc = 124
        elif killed_for_rss:
            final_rc = 137
        else:
            final_rc = int(rc or 0)
        return final_rc, {
            "peak_rss_kib": peak_rss_kib,
            "peak_rss_gib": round(peak_rss_kib / (1024 * 1024), 3),
            "samples": samples,
            "timed_out": timed_out,
            "killed_for_rss": killed_for_rss,
            "threads_cap": int(args.threads_cap),
            "task_nice": int(args.task_nice),
        }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root)
    snapshot_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}" if args.snapshot_id else latest_materialized_snapshot_dir(quant_root)
    if not snapshot_dir.exists():
        raise FileNotFoundError(f"snapshot not found: {snapshot_dir}")
    snapshot_id = snapshot_dir.name.split("=", 1)[1]

    tasks = _build_tasks(args, quant_root)
    plan_hash = stable_hash_obj([t.to_dict() for t in tasks])
    now = int(time.time())
    job_name = args.job_name or f"overnight_q1_training_sweep_{now}"
    if args.resume_from:
        job_dir = Path(args.resume_from)
    else:
        job_dir = quant_root / "jobs" / job_name
    job_dir.mkdir(parents=True, exist_ok=True)
    _acquire_job_lock(job_dir)
    logs_dir = job_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    state_path = job_dir / "state.json"
    stdout_log = logs_dir / "driver.log"

    state_config = {
        "task_order": args.task_order,
        "task_nice": int(args.task_nice),
        "threads_cap": int(args.threads_cap),
        "max_rss_gib": float(args.max_rss_gib),
        "monitor_interval_sec": float(args.monitor_interval_sec),
        "metrics_log_interval_sec": float(args.metrics_log_interval_sec),
        "sleep_between_tasks_sec": float(args.sleep_between_tasks_sec),
        "stop_after_consecutive_failures": int(args.stop_after_consecutive_failures),
        "task_timeout_minutes": float(args.task_timeout_minutes),
        "max_hours": float(args.max_hours),
    }
    if args.resume_from and state_path.exists():
        state = json.loads(state_path.read_text())
        state["config"] = state.get("config") or state_config
        # Recover from prior crashed/killed orchestrator: no task should stay "running" across process restarts.
        for row in state.get("tasks", []):
            if row.get("status") == "running":
                row["status"] = "pending"
                row["finished_at"] = utc_now_iso()
                row.setdefault("recovered_notes", []).append("reset_from_running_on_resume")
            if args.retry_failed and row.get("status") == "failed":
                row["status"] = "pending"
                row["finished_at"] = None
                row["rc"] = None
                row["ok"] = None
                row.setdefault("recovered_notes", []).append("reset_from_failed_on_retry_resume")
        # Recompute summary after recovery.
        pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
        running = sum(1 for t in state["tasks"] if t["status"] == "running")
        done = sum(1 for t in state["tasks"] if t["status"] == "done")
        failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
        state["summary"].update(
            {
                "pending": pending,
                "running": running,
                "done": done,
                "failed": failed,
                "stopped_due_to_time_limit": False,
                "stopped_due_to_consecutive_failures": False,
            }
        )
        state["updated_at"] = utc_now_iso()
        atomic_write_json(state_path, state)
    else:
        state = {
            "schema": "quantlab_q1_overnight_training_sweep_state_v1",
            "job_name": job_name,
            "created_at": utc_now_iso(),
            "updated_at": utc_now_iso(),
            "quant_root": str(quant_root),
            "snapshot_id": snapshot_id,
            "feature_store_version": args.feature_store_version,
            "plan_hash": plan_hash,
            "max_hours": args.max_hours,
            "config": state_config,
            "tasks": [
                {
                    **t.to_dict(),
                    "status": "pending",
                    "attempts": 0,
                    "started_at": None,
                    "finished_at": None,
                    "elapsed_sec": None,
                    "rc": None,
                    "runner_run_id": None,
                    "status_path": None,
                    "orchestrator_report": None,
                    "ok": None,
                    "log_file": None,
                }
                for t in tasks
            ],
            "summary": {
                "pending": len(tasks),
                "running": 0,
                "done": 0,
                "failed": 0,
                "stopped_due_to_time_limit": False,
                "stopped_due_to_consecutive_failures": False,
            },
        }
        atomic_write_json(state_path, state)

    if args.plan_only:
        print(f"job_dir={job_dir}")
        print(f"snapshot_id={snapshot_id}")
        print(f"tasks_total={len(state['tasks'])}")
        print(f"plan_hash={state['plan_hash']}")
        for row in state["tasks"][:20]:
            print(f"- {row['task_id']} status={row['status']}")
        if len(state["tasks"]) > 20:
            print(f"... ({len(state['tasks']) - 20} more tasks)")
        return 0

    start_monotonic = time.monotonic()
    consecutive_failures = 0
    with stdout_log.open("a") as driver:
        driver.write(f"[{utc_now_iso()}] start snapshot_id={snapshot_id} tasks={len(state['tasks'])} max_hours={args.max_hours}\n")
        driver.flush()
        for row in state["tasks"]:
            if row["status"] == "done":
                continue
            elapsed_hours = (time.monotonic() - start_monotonic) / 3600.0
            if elapsed_hours >= args.max_hours:
                state["summary"]["stopped_due_to_time_limit"] = True
                break
            if int(args.stop_after_consecutive_failures) > 0 and consecutive_failures >= int(args.stop_after_consecutive_failures):
                state["summary"]["stopped_due_to_consecutive_failures"] = True
                break
            row["status"] = "running"
            row["attempts"] = int(row.get("attempts") or 0) + 1
            row["started_at"] = utc_now_iso()
            # Keep summary counters truthful while a task is active.
            pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
            running = sum(1 for t in state["tasks"] if t["status"] == "running")
            done = sum(1 for t in state["tasks"] if t["status"] == "done")
            failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
            state["summary"].update({"pending": pending, "running": running, "done": done, "failed": failed})
            state["updated_at"] = utc_now_iso()
            atomic_write_json(state_path, state)

            task = Task(
                task_id=row["task_id"],
                asof_end_date=row["asof_end_date"],
                panel_days=int(row["panel_days"]),
                top_liquid_n=int(row["top_liquid_n"]),
            )
            cmd = _task_cmd(args, task, quant_root, snapshot_id)
            task_log = logs_dir / f"{task.task_id}.log"
            row["log_file"] = str(task_log)
            atomic_write_json(state_path, state)
            row_start = time.monotonic()
            driver.write(f"[{utc_now_iso()}] START {task.task_id} cmd={shlex.join(cmd)}\n")
            driver.flush()
            lines: list[str] = []
            with task_log.open("a") as tlog:
                tlog.write(f"[{utc_now_iso()}] START {task.task_id}\n")
                tlog.flush()
            rc, monitor_meta = _run_task_with_monitor(cmd, task_log, args, driver)
            with task_log.open("a") as tlog:
                tlog.write(f"[{utc_now_iso()}] END rc={rc}\n")
                tlog.flush()
            try:
                # Parse stdout markers from the task log after completion.
                lines = task_log.read_text(errors="replace").splitlines()[-400:]
            except Exception:
                lines = []
            parsed = _parse_runner_stdout(lines)
            row["rc"] = rc
            row["finished_at"] = utc_now_iso()
            row["elapsed_sec"] = round(time.monotonic() - row_start, 3)
            row["runner_run_id"] = parsed.get("run_id")
            row["status_path"] = parsed.get("status")
            row["orchestrator_report"] = parsed.get("orchestrator_report")
            row["ok"] = (parsed.get("ok", "").lower() == "true")
            row["monitor"] = monitor_meta
            row["peak_rss_gib"] = monitor_meta.get("peak_rss_gib")
            row["status"] = "done" if rc == 0 and row["ok"] is not False else "failed"
            if row["status"] == "failed":
                consecutive_failures += 1
            else:
                consecutive_failures = 0
            state["updated_at"] = utc_now_iso()
            # recompute summary
            pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
            running = sum(1 for t in state["tasks"] if t["status"] == "running")
            done = sum(1 for t in state["tasks"] if t["status"] == "done")
            failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
            state["summary"].update({"pending": pending, "running": running, "done": done, "failed": failed})
            atomic_write_json(state_path, state)
            driver.write(
                f"[{utc_now_iso()}] END {task.task_id} rc={rc} ok={row['ok']} elapsed_sec={row['elapsed_sec']} "
                f"done={done} failed={failed} pending={pending}\n"
            )
            driver.flush()
            if float(args.sleep_between_tasks_sec) > 0 and row["status"] == "done":
                time.sleep(float(args.sleep_between_tasks_sec))
        # final summary
        state["updated_at"] = utc_now_iso()
        pending = sum(1 for t in state["tasks"] if t["status"] == "pending")
        running = sum(1 for t in state["tasks"] if t["status"] == "running")
        done = sum(1 for t in state["tasks"] if t["status"] == "done")
        failed = sum(1 for t in state["tasks"] if t["status"] == "failed")
        state["summary"].update({"pending": pending, "running": running, "done": done, "failed": failed})
        atomic_write_json(state_path, state)
        driver.write(f"[{utc_now_iso()}] FINAL summary={json.dumps(state['summary'], sort_keys=True)}\n")
        driver.flush()

    # Exit non-zero only if every attempted task failed and none succeeded.
    if state["summary"]["done"] == 0 and state["summary"]["failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
