#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
QUANT_ROOT = Path(os.environ.get("QUANT_ROOT", "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"))
JOBS_DIR = QUANT_ROOT / "jobs"
LOCK_PATH = JOBS_DIR / "_locks" / "overnight_q1_training_sweep_safe.lock.json"
START_SCRIPT = REPO_ROOT / "scripts" / "quantlab" / "start_q1_operator_safe.sh"
WATCH_SCRIPT = REPO_ROOT / "scripts" / "quantlab" / "watch_overnight_q1_job.py"
PYTHON_BIN = Path(os.environ.get("PYTHON_BIN", str(REPO_ROOT / "quantlab" / ".venv" / "bin" / "python")))
GLOBAL_LOCK_NAME = os.environ.get("GLOBAL_LOCK_NAME", "overnight_q1_training_sweep_safe")
JOB_PREFIXES = ("day_q1_safe_", "overnight_q1_safe10h_", "overnight_q1_safe14h_", "night14_q1_")
TASK_TIMEOUT_MINUTES = float(os.environ.get("TASK_TIMEOUT_MINUTES", "80"))
THREADS_CAP = int(os.environ.get("THREADS_CAP", "1"))
MAX_RSS_GIB = float(os.environ.get("MAX_RSS_GIB", "8.3"))
MAX_HOURS = float(os.environ.get("MAX_HOURS", "8.25"))
WATCH_HOURS = float(os.environ.get("WATCH_HOURS", "8.6"))
CHECK_INTERVAL_SEC = float(os.environ.get("CHECK_INTERVAL_SEC", "60"))
STALE_DRIVER_MINUTES = float(os.environ.get("STALE_DRIVER_MINUTES", "20"))
STALE_STATE_MINUTES = float(os.environ.get("STALE_STATE_MINUTES", "25"))
TASK_NICE = int(os.environ.get("TASK_NICE", "17"))
MONITOR_INTERVAL_SEC = float(os.environ.get("MONITOR_INTERVAL_SEC", "5"))
METRICS_LOG_INTERVAL_SEC = float(os.environ.get("METRICS_LOG_INTERVAL_SEC", "60"))
STALE_HEARTBEAT_MINUTES = float(os.environ.get("STALE_HEARTBEAT_MINUTES", "30"))
STALE_MIN_ELAPSED_MINUTES = float(os.environ.get("STALE_MIN_ELAPSED_MINUTES", "15"))
STALE_CPU_PCT_MAX = float(os.environ.get("STALE_CPU_PCT_MAX", "1.0"))
MAX_LOAD_PER_CORE = float(os.environ.get("MAX_LOAD_PER_CORE", "8.0"))
MIN_FREE_DISK_GB = float(os.environ.get("MIN_FREE_DISK_GB", "12"))
MAX_RETRIES_PER_TASK = int(os.environ.get("MAX_RETRIES_PER_TASK", "1"))
MAX_FAILED_TASK_RESUME_RETRIES = int(os.environ.get("MAX_FAILED_TASK_RESUME_RETRIES", "0"))
RETRYABLE_EXIT_CODES = os.environ.get("RETRYABLE_EXIT_CODES", "124,137,142")
RETRY_COOLDOWN_SEC = float(os.environ.get("RETRY_COOLDOWN_SEC", "45"))
SLEEP_BETWEEN_TASKS_SEC = float(os.environ.get("SLEEP_BETWEEN_TASKS_SEC", "10"))
STOP_AFTER_CONSECUTIVE_FAILURES = int(os.environ.get("STOP_AFTER_CONSECUTIVE_FAILURES", "6"))
KEEPER_NIGHT_START_HOUR = int(os.environ.get("KEEPER_NIGHT_START_HOUR", "23"))
KEEPER_NIGHT_START_MINUTE = int(os.environ.get("KEEPER_NIGHT_START_MINUTE", "0"))
KEEPER_NIGHT_CUTOFF_HOUR = int(os.environ.get("KEEPER_NIGHT_CUTOFF_HOUR", "7"))
KEEPER_NIGHT_CUTOFF_MINUTE = int(os.environ.get("KEEPER_NIGHT_CUTOFF_MINUTE", "30"))


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def active_lock() -> dict[str, Any] | None:
    if not LOCK_PATH.exists():
        return None
    try:
        data = read_json(LOCK_PATH)
        pid = int(data.get("pid") or 0)
    except Exception:
        return None
    if not pid_alive(pid):
        return None
    return {"pid": pid, "lock": data}


def latest_job_dirs() -> list[Path]:
    out: list[Path] = []
    for prefix in JOB_PREFIXES:
        out.extend(p for p in JOBS_DIR.glob(f"{prefix}*") if p.is_dir())
    return sorted(out, key=lambda p: p.stat().st_mtime, reverse=True)


def _job_summary(job_dir: Path) -> dict[str, Any] | None:
    state_path = job_dir / "state.json"
    if not state_path.exists():
        return {"job_dir": str(job_dir), "state": "missing_state"}
    try:
        state = read_json(state_path)
    except Exception as exc:
        return {"job_dir": str(job_dir), "state": f"unreadable:{type(exc).__name__}"}
    summary = state.get("summary") or {}
    runtime_config = state.get("runtime_config") or {}
    config = state.get("config") or {}
    return {
        "job_dir": str(job_dir),
        "updated_at": state.get("updated_at"),
        "summary": {
            "pending": int(summary.get("pending") or 0),
            "running": int(summary.get("running") or 0),
            "done": int(summary.get("done") or 0),
            "failed": int(summary.get("failed") or 0),
            "failed_by_class": summary.get("failed_by_class") or {},
        },
        "config": {
            "max_rss_gib": runtime_config.get("max_rss_gib", config.get("max_rss_gib")),
            "min_free_disk_gb": runtime_config.get("min_free_disk_gb", config.get("min_free_disk_gb")),
        },
    }


def latest_job_summary() -> dict[str, Any] | None:
    jobs = latest_job_dirs()
    if not jobs:
        return None
    return _job_summary(jobs[0])


def _job_local_dt(job_dir: Path) -> datetime | None:
    m = re.search(r"(\d{8}_\d{6})$", job_dir.name)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y%m%d_%H%M%S")
    except ValueError:
        return None


def _night_window(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(
        hour=KEEPER_NIGHT_START_HOUR,
        minute=KEEPER_NIGHT_START_MINUTE,
        second=0,
        microsecond=0,
    )
    if now < start:
        start -= timedelta(days=1)
    cutoff = start.replace(
        hour=KEEPER_NIGHT_CUTOFF_HOUR,
        minute=KEEPER_NIGHT_CUTOFF_MINUTE,
        second=0,
        microsecond=0,
    )
    if cutoff <= start:
        cutoff += timedelta(days=1)
    return start, cutoff


def _find_current_night_job(now: datetime) -> Path | None:
    start, cutoff = _night_window(now)
    for job_dir in latest_job_dirs():
        dt = _job_local_dt(job_dir)
        if dt is not None and start <= dt < cutoff:
            return job_dir
    return None


def _summary_counts(summary: dict[str, Any] | None) -> tuple[int, int, int, int]:
    row = summary.get("summary") if isinstance(summary, dict) else {}
    return (
        int(row.get("pending") or 0),
        int(row.get("running") or 0),
        int(row.get("done") or 0),
        int(row.get("failed") or 0),
    )


def start_mode(mode: str) -> dict[str, Any]:
    proc = subprocess.Popen(
        [str(START_SCRIPT), mode],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {"mode": mode, "starter_pid": int(proc.pid), "script": str(START_SCRIPT)}


def resume_job(job_dir: Path, remaining_hours: float) -> dict[str, Any]:
    max_hours = max(0.25, float(remaining_hours))
    watch_hours = max(0.5, min(float(WATCH_HOURS), max_hours + 0.35))
    cmd = [
        str(PYTHON_BIN),
        str(WATCH_SCRIPT),
        "--repo-root",
        str(REPO_ROOT),
        "--quant-root",
        str(QUANT_ROOT),
        "--job-dir",
        str(job_dir),
        "--python",
        str(PYTHON_BIN),
        "--global-lock-name",
        str(GLOBAL_LOCK_NAME),
        "--check-interval-sec",
        str(CHECK_INTERVAL_SEC),
        "--stale-driver-minutes",
        str(STALE_DRIVER_MINUTES),
        "--stale-state-minutes",
        str(STALE_STATE_MINUTES),
        "--watch-hours",
        str(watch_hours),
        "--max-hours",
        str(max_hours),
        "--task-timeout-minutes",
        str(TASK_TIMEOUT_MINUTES),
        "--threads-cap",
        str(THREADS_CAP),
        "--max-rss-gib",
        str(MAX_RSS_GIB),
        "--task-nice",
        str(TASK_NICE),
        "--monitor-interval-sec",
        str(MONITOR_INTERVAL_SEC),
        "--metrics-log-interval-sec",
        str(METRICS_LOG_INTERVAL_SEC),
        "--stale-heartbeat-minutes",
        str(STALE_HEARTBEAT_MINUTES),
        "--stale-min-elapsed-minutes",
        str(STALE_MIN_ELAPSED_MINUTES),
        "--stale-cpu-pct-max",
        str(STALE_CPU_PCT_MAX),
        "--max-load-per-core",
        str(MAX_LOAD_PER_CORE),
        "--min-free-disk-gb",
        str(MIN_FREE_DISK_GB),
        "--max-retries-per-task",
        str(MAX_RETRIES_PER_TASK),
        "--max-failed-task-resume-retries",
        str(MAX_FAILED_TASK_RESUME_RETRIES),
        "--retryable-exit-codes",
        str(RETRYABLE_EXIT_CODES),
        "--retry-cooldown-sec",
        str(RETRY_COOLDOWN_SEC),
        "--sleep-between-tasks-sec",
        str(SLEEP_BETWEEN_TASKS_SEC),
        "--stop-after-consecutive-failures",
        str(STOP_AFTER_CONSECUTIVE_FAILURES),
        "--task-order",
        "safe_light_first",
        "--skip-retry-failed",
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {
        "job_dir": str(job_dir),
        "starter_pid": int(proc.pid),
        "script": str(WATCH_SCRIPT),
        "remaining_hours": round(max_hours, 3),
        "watch_hours": round(watch_hours, 3),
    }


def main() -> int:
    now = datetime.now()
    window_start, window_cutoff = _night_window(now)
    in_night_window = window_start <= now < window_cutoff
    payload: dict[str, Any] = {
        "schema": "quantlab_keeper_local_v1",
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "repo_root": str(REPO_ROOT),
        "quant_root": str(QUANT_ROOT),
        "lock_path": str(LOCK_PATH),
        "night_window": {
            "start_local": window_start.isoformat(timespec="seconds"),
            "cutoff_local": window_cutoff.isoformat(timespec="seconds"),
            "now_local": now.isoformat(timespec="seconds"),
        },
    }

    active = active_lock()
    latest = latest_job_summary()
    current_night_job = _find_current_night_job(now)
    current_night_summary = _job_summary(current_night_job) if current_night_job is not None else None
    if active:
        payload["action"] = "noop_active_lock"
        payload["active_lock_pid"] = int(active["pid"])
        payload["latest_job"] = latest
        if current_night_summary is not None:
            payload["current_night_job"] = current_night_summary
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    payload["latest_job"] = latest
    if current_night_summary is not None:
        payload["current_night_job"] = current_night_summary
        pending, running, done, failed = _summary_counts(current_night_summary)
        if pending > 0 or running > 0:
            remaining_hours = max(0.0, (window_cutoff - now).total_seconds() / 3600.0)
            if remaining_hours <= 0.0:
                payload["action"] = "noop_cutoff_reached_with_incomplete_job"
            else:
                payload["action"] = "resume_current_night_job"
                payload["resume"] = resume_job(current_night_job, remaining_hours)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        payload["action"] = "noop_current_night_job_completed"
        payload["current_night_job_done"] = done
        payload["current_night_job_failed"] = failed
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if in_night_window:
        payload["action"] = "start_safe_operator"
        payload["start"] = start_mode("night")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    payload["action"] = "noop_outside_night_window"
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
