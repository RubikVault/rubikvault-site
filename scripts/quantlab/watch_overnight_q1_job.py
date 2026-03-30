#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--job-dir", required=True)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--global-lock-name", default="overnight_q1_training_sweep_safe")
    p.add_argument("--check-interval-sec", type=float, default=60.0)
    p.add_argument("--stale-driver-minutes", type=float, default=20.0)
    p.add_argument("--stale-state-minutes", type=float, default=25.0)
    p.add_argument("--watch-hours", type=float, default=12.0)
    p.add_argument("--max-restarts", type=int, default=20)
    p.add_argument("--max-hours", type=float, default=9.5)
    p.add_argument("--task-timeout-minutes", type=float, default=210.0)
    p.add_argument("--threads-cap", type=int, default=2)
    p.add_argument("--max-rss-gib", type=float, default=6.5)
    p.add_argument("--task-nice", type=int, default=17)
    p.add_argument("--monitor-interval-sec", type=float, default=5.0)
    p.add_argument("--metrics-log-interval-sec", type=float, default=60.0)
    p.add_argument("--stale-orphan-minutes", type=float, default=8.0)
    p.add_argument("--stale-heartbeat-minutes", type=float, default=30.0)
    p.add_argument("--stale-min-elapsed-minutes", type=float, default=15.0)
    p.add_argument("--stale-cpu-pct-max", type=float, default=1.0)
    p.add_argument("--enforce-system-guardrails", action="store_true", default=True)
    p.add_argument("--skip-enforce-system-guardrails", dest="enforce_system_guardrails", action="store_false")
    p.add_argument("--max-load-per-core", type=float, default=1.20)
    p.add_argument("--min-free-disk-gb", type=float, default=30.0)
    p.add_argument("--system-guard-check-interval-sec", type=float, default=20.0)
    p.add_argument("--max-system-guard-wait-minutes", type=float, default=30.0)
    p.add_argument("--max-retries-per-task", type=int, default=1)
    p.add_argument("--max-failed-task-resume-retries", type=int, default=0)
    p.add_argument("--retryable-exit-codes", default="124,137,142")
    p.add_argument("--retry-cooldown-sec", type=float, default=45.0)
    p.add_argument("--sleep-between-tasks-sec", type=float, default=35.0)
    p.add_argument("--stop-after-consecutive-failures", type=int, default=3)
    p.add_argument("--task-order", choices=["safe_light_first", "heavy_first"], default="safe_light_first")
    p.add_argument("--run-phasea-backbone", action="store_true", default=False)
    p.add_argument("--skip-run-phasea-backbone", dest="run_phasea_backbone", action="store_false")
    p.add_argument("--retry-failed", action="store_true", default=False)
    p.add_argument("--skip-retry-failed", dest="retry_failed", action="store_false")
    args, extra = p.parse_known_args(list(argv))
    args.extra_runner_args = list(extra)
    return args


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _child_pids_recursive(pid: int) -> list[int]:
    seen: set[int] = set()
    queue = [pid]
    while queue:
        parent = queue.pop(0)
        if parent in seen:
            continue
        seen.add(parent)
        try:
            out = subprocess.check_output(["pgrep", "-P", str(parent)], text=True, timeout=2.0).strip()
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


def _terminate_tree(pid: int) -> None:
    pids = list(reversed(_child_pids_recursive(pid)))
    for p in pids:
        try:
            os.kill(p, signal.SIGTERM)
        except Exception:
            pass
    time.sleep(2.0)
    for p in pids:
        if _pid_alive(p):
            try:
                os.kill(p, signal.SIGKILL)
            except Exception:
                pass


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def _orchestrator_pid_from_lock(quant_root: Path, global_lock_name: str) -> int:
    lock_path = quant_root / "jobs" / "_locks" / f"{global_lock_name}.lock.json"
    if not lock_path.exists():
        return 0
    try:
        lock = _read_json(lock_path)
        pid = int(lock.get("pid") or 0)
    except Exception:
        return 0
    if pid > 0 and _pid_alive(pid):
        return pid
    return 0


def _driver_stale_seconds(driver_log: Path) -> float:
    if not driver_log.exists():
        return float("inf")
    return max(0.0, time.time() - float(driver_log.stat().st_mtime))


def _iso_to_epoch_seconds(value: str) -> float | None:
    if not value:
        return None
    try:
        norm = value.strip()
        if norm.endswith("Z"):
            norm = norm[:-1] + "+00:00"
        dt = datetime.fromisoformat(norm)
        return float(dt.timestamp())
    except Exception:
        return None


def _build_resume_cmd(args: argparse.Namespace) -> list[str]:
    state_path = Path(args.job_dir).resolve() / "state.json"
    resume_overrides: dict[str, object] = {}
    if state_path.exists():
        try:
            state = _read_json(state_path)
            cfg = state.get("config") or {}
            if state.get("snapshot_id"):
                resume_overrides["snapshot_id"] = str(state.get("snapshot_id"))
            if state.get("feature_store_version"):
                resume_overrides["feature_store_version"] = str(state.get("feature_store_version"))
            if cfg.get("panel_max_assets") is not None:
                resume_overrides["panel_max_assets"] = int(cfg.get("panel_max_assets"))
            if cfg.get("redflags_failure_mode"):
                resume_overrides["redflags_failure_mode"] = str(cfg.get("redflags_failure_mode"))
        except Exception:
            resume_overrides = {}

    cmd = [
        args.python,
        str(Path(args.repo_root) / "scripts" / "quantlab" / "run_overnight_q1_training_sweep.py"),
        "--quant-root",
        str(Path(args.quant_root).resolve()),
        "--resume-from",
        str(Path(args.job_dir).resolve()),
        "--max-hours",
        str(args.max_hours),
        "--task-timeout-minutes",
        str(args.task_timeout_minutes),
        "--threads-cap",
        str(args.threads_cap),
        "--max-rss-gib",
        str(args.max_rss_gib),
        "--task-nice",
        str(args.task_nice),
        "--monitor-interval-sec",
        str(args.monitor_interval_sec),
        "--metrics-log-interval-sec",
        str(args.metrics_log_interval_sec),
        "--stale-orphan-minutes",
        str(args.stale_orphan_minutes),
        "--stale-heartbeat-minutes",
        str(args.stale_heartbeat_minutes),
        "--stale-min-elapsed-minutes",
        str(args.stale_min_elapsed_minutes),
        "--stale-cpu-pct-max",
        str(args.stale_cpu_pct_max),
        "--max-load-per-core",
        str(args.max_load_per_core),
        "--min-free-disk-gb",
        str(args.min_free_disk_gb),
        "--system-guard-check-interval-sec",
        str(args.system_guard_check_interval_sec),
        "--max-system-guard-wait-minutes",
        str(args.max_system_guard_wait_minutes),
        "--max-retries-per-task",
        str(args.max_retries_per_task),
        "--max-failed-task-resume-retries",
        str(args.max_failed_task_resume_retries),
        "--retryable-exit-codes",
        str(args.retryable_exit_codes),
        "--retry-cooldown-sec",
        str(args.retry_cooldown_sec),
        "--sleep-between-tasks-sec",
        str(args.sleep_between_tasks_sec),
        "--stop-after-consecutive-failures",
        str(args.stop_after_consecutive_failures),
        "--task-order",
        str(args.task_order),
        "--global-lock-name",
        str(args.global_lock_name),
    ]
    if resume_overrides.get("snapshot_id"):
        cmd += ["--snapshot-id", str(resume_overrides["snapshot_id"])]
    if resume_overrides.get("feature_store_version"):
        cmd += ["--feature-store-version", str(resume_overrides["feature_store_version"])]
    if "panel_max_assets" in resume_overrides:
        cmd += ["--panel-max-assets", str(int(resume_overrides["panel_max_assets"]))]
    if resume_overrides.get("redflags_failure_mode"):
        cmd += ["--redflags-failure-mode", str(resume_overrides["redflags_failure_mode"])]
    if bool(args.enforce_system_guardrails):
        cmd.append("--enforce-system-guardrails")
    else:
        cmd.append("--skip-enforce-system-guardrails")
    if bool(args.run_phasea_backbone):
        cmd.append("--run-phasea-backbone")
    else:
        cmd.append("--skip-run-phasea-backbone")
    if args.retry_failed:
        cmd.append("--retry-failed")
    extra_runner_args = getattr(args, "extra_runner_args", None) or []
    if extra_runner_args:
        cmd.extend(str(x) for x in extra_runner_args)
    return cmd


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root = Path(args.quant_root).resolve()
    job_dir = Path(args.job_dir).resolve()
    state_path = job_dir / "state.json"
    driver_log = job_dir / "logs" / "driver.log"
    watchdog_log = job_dir / "logs" / "watchdog.log"
    watchdog_log.parent.mkdir(parents=True, exist_ok=True)
    stale_limit_sec = max(300.0, float(args.stale_driver_minutes) * 60.0)
    stale_state_limit_sec = max(300.0, float(args.stale_state_minutes) * 60.0)
    check_interval = max(10.0, float(args.check_interval_sec))
    max_watch_sec = max(900.0, float(args.watch_hours) * 3600.0)
    max_restarts = max(0, int(args.max_restarts))
    restarts = 0
    started = time.time()
    cmd = _build_resume_cmd(args)

    def _log(msg: str) -> None:
        line = f"[{utc_now_iso()}] {msg}\n"
        with watchdog_log.open("a") as fh:
            fh.write(line)
            fh.flush()

    _log(
        f"start watch job_dir={job_dir} stale_driver_limit_sec={stale_limit_sec} "
        f"stale_state_limit_sec={stale_state_limit_sec} max_watch_sec={max_watch_sec}"
    )

    while True:
        elapsed = time.time() - started
        if elapsed > max_watch_sec:
            _log("stop reason=watch_hours_limit_reached")
            break

        if state_path.exists():
            try:
                state = _read_json(state_path)
                summary = state.get("summary") or {}
                pending = int(summary.get("pending") or 0)
                running = int(summary.get("running") or 0)
                if pending == 0 and running == 0:
                    _log("stop reason=job_completed")
                    break
            except Exception:
                pass

        pid = _orchestrator_pid_from_lock(quant_root, args.global_lock_name)
        stale_sec = _driver_stale_seconds(driver_log)
        stale_state_sec = float("inf")
        if state_path.exists():
            try:
                state = _read_json(state_path)
                upd = _iso_to_epoch_seconds(str(state.get("updated_at") or ""))
                if upd is not None:
                    stale_state_sec = max(0.0, time.time() - upd)
            except Exception:
                stale_state_sec = float("inf")

        if pid <= 0:
            if restarts >= max_restarts:
                _log("stop reason=max_restarts_reached_no_pid")
                break
            subprocess.Popen(
                cmd,
                cwd=repo_root,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            restarts += 1
            _log(f"restart reason=no_orchestrator_pid restart_count={restarts}")
            time.sleep(check_interval)
            continue

        if stale_sec > stale_limit_sec:
            if restarts >= max_restarts:
                _log(f"stop reason=max_restarts_reached_stale stale_sec={round(stale_sec,1)}")
                break
            _terminate_tree(pid)
            time.sleep(2.0)
            subprocess.Popen(
                cmd,
                cwd=repo_root,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            restarts += 1
            _log(f"restart reason=stale_driver_log stale_sec={round(stale_sec,1)} restart_count={restarts}")
            time.sleep(check_interval)
            continue

        if stale_state_sec > stale_state_limit_sec:
            if restarts >= max_restarts:
                _log(
                    f"stop reason=max_restarts_reached_stale_state stale_state_sec={round(stale_state_sec,1)}"
                )
                break
            _terminate_tree(pid)
            time.sleep(2.0)
            subprocess.Popen(
                cmd,
                cwd=repo_root,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            restarts += 1
            _log(
                f"restart reason=stale_state_heartbeat stale_state_sec={round(stale_state_sec,1)} restart_count={restarts}"
            )
            time.sleep(check_interval)
            continue

        _log(f"ok pid={pid} stale_driver_sec={round(stale_sec,1)} stale_state_sec={round(stale_state_sec,1)}")
        time.sleep(check_interval)

    _log("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
