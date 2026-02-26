#!/usr/bin/env python3
from __future__ import annotations

import argparse
import atexit
import json
import os
import shlex
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
    # Heaviest first for best overnight utilization if time ends early.
    panel_days_values = sorted(panel_days_values, reverse=True)
    top_values = sorted(top_values, reverse=True)
    asof_dates = sorted(asof_dates, reverse=True)
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

    if args.resume_from and state_path.exists():
        state = json.loads(state_path.read_text())
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
        state["summary"].update({"pending": pending, "running": running, "done": done, "failed": failed, "stopped_due_to_time_limit": False})
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
            row["status"] = "running"
            row["attempts"] = int(row.get("attempts") or 0) + 1
            row["started_at"] = utc_now_iso()
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
            rc = 1
            with task_log.open("a") as tlog:
                tlog.write(f"[{utc_now_iso()}] START {task.task_id}\n")
                tlog.flush()
                try:
                    proc_run = subprocess.run(
                        cmd,
                        stdout=tlog,
                        stderr=subprocess.STDOUT,
                        text=True,
                        timeout=max(60.0, float(args.task_timeout_minutes) * 60.0),
                        check=False,
                    )
                    rc = int(proc_run.returncode)
                except subprocess.TimeoutExpired:
                    rc = 124
                    tlog.write(f"[{utc_now_iso()}] TIMEOUT task_timeout_minutes={args.task_timeout_minutes}\n")
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
            row["status"] = "done" if rc == 0 and row["ok"] is not False else "failed"
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
