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
REFRESH_SCRIPT = REPO_ROOT / "scripts" / "quantlab" / "v5_refresh_predictions.py"
PYTHON_BIN = Path(os.environ.get("PYTHON_BIN", str(REPO_ROOT / "quantlab" / ".venv" / "bin" / "python")))
KEEPER_MODE = os.environ.get("KEEPER_MODE", "night").strip().lower()
GLOBAL_LOCK_NAME = os.environ.get("GLOBAL_LOCK_NAME", "overnight_q1_training_sweep_safe")
JOB_PREFIXES = {
    "day": ("day_q1_safe_",),
    "night": ("overnight_q1_safe10h_", "overnight_q1_safe14h_", "night14_q1_"),
}
MODE_DEFAULTS = {
    "day": {
        "max_hours": float(os.environ.get("DAY_MAX_HOURS", os.environ.get("MAX_HOURS", "3.5"))),
        "watch_hours": float(os.environ.get("DAY_WATCH_HOURS", os.environ.get("WATCH_HOURS", "4.0"))),
        "task_timeout_minutes": float(os.environ.get("DAY_TASK_TIMEOUT_MINUTES", os.environ.get("TASK_TIMEOUT_MINUTES", "150"))),
        "sleep_between_tasks_sec": float(os.environ.get("DAY_SLEEP_BETWEEN_TASKS_SEC", os.environ.get("SLEEP_BETWEEN_TASKS_SEC", "30"))),
        "stop_after_consecutive_failures": int(os.environ.get("DAY_STOP_AFTER_CONSECUTIVE_FAILURES", os.environ.get("STOP_AFTER_CONSECUTIVE_FAILURES", "4"))),
        "start_hour": int(os.environ.get("KEEPER_DAY_START_HOUR", "10")),
        "start_minute": int(os.environ.get("KEEPER_DAY_START_MINUTE", "30")),
        "cutoff_hour": int(os.environ.get("KEEPER_DAY_CUTOFF_HOUR", "18")),
        "cutoff_minute": int(os.environ.get("KEEPER_DAY_CUTOFF_MINUTE", "0")),
    },
    "night": {
        "max_hours": float(os.environ.get("NIGHT_MAX_HOURS", os.environ.get("MAX_HOURS", "8.25"))),
        "watch_hours": float(os.environ.get("NIGHT_WATCH_HOURS", os.environ.get("WATCH_HOURS", "8.6"))),
        "task_timeout_minutes": float(os.environ.get("NIGHT_TASK_TIMEOUT_MINUTES", os.environ.get("TASK_TIMEOUT_MINUTES", "80"))),
        "sleep_between_tasks_sec": float(os.environ.get("NIGHT_SLEEP_BETWEEN_TASKS_SEC", os.environ.get("SLEEP_BETWEEN_TASKS_SEC", "10"))),
        "stop_after_consecutive_failures": int(os.environ.get("NIGHT_STOP_AFTER_CONSECUTIVE_FAILURES", os.environ.get("STOP_AFTER_CONSECUTIVE_FAILURES", "6"))),
        "start_hour": int(os.environ.get("KEEPER_NIGHT_START_HOUR", "23")),
        "start_minute": int(os.environ.get("KEEPER_NIGHT_START_MINUTE", "0")),
        "cutoff_hour": int(os.environ.get("KEEPER_NIGHT_CUTOFF_HOUR", "7")),
        "cutoff_minute": int(os.environ.get("KEEPER_NIGHT_CUTOFF_MINUTE", "30")),
    },
}
THREADS_CAP = int(os.environ.get("THREADS_CAP", "1"))
MAX_RSS_GIB = float(os.environ.get("MAX_RSS_GIB", "8.3"))
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

if KEEPER_MODE not in MODE_DEFAULTS:
    raise SystemExit(f"Unsupported KEEPER_MODE={KEEPER_MODE}")
MODE_CFG = MODE_DEFAULTS[KEEPER_MODE]


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


def latest_job_dirs(mode: str) -> list[Path]:
    out: list[Path] = []
    for prefix in JOB_PREFIXES[mode]:
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
    refresh = None
    refresh_path = job_dir / "v5_refresh_status.json"
    if refresh_path.exists():
        try:
            refresh = read_json(refresh_path)
        except Exception:
            refresh = {"status": "unreadable"}
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
        "refresh": refresh,
    }


def latest_job_summary(mode: str) -> dict[str, Any] | None:
    jobs = latest_job_dirs(mode)
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


def _window(now: datetime, mode: str) -> tuple[datetime, datetime]:
    start = now.replace(hour=MODE_DEFAULTS[mode]["start_hour"], minute=MODE_DEFAULTS[mode]["start_minute"], second=0, microsecond=0)
    cutoff = now.replace(hour=MODE_DEFAULTS[mode]["cutoff_hour"], minute=MODE_DEFAULTS[mode]["cutoff_minute"], second=0, microsecond=0)
    if mode == "night":
        if now < start:
            start -= timedelta(days=1)
        if cutoff <= start:
            cutoff += timedelta(days=1)
    else:
        if cutoff <= start:
            cutoff += timedelta(days=1)
    return start, cutoff


def _find_current_job(now: datetime, mode: str) -> Path | None:
    start, cutoff = _window(now, mode)
    for job_dir in latest_job_dirs(mode):
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
        ["/usr/bin/caffeinate", "-dimsu", "/bin/bash", str(START_SCRIPT), mode],
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=os.environ.copy(),
    )
    return {"mode": mode, "starter_pid": int(proc.pid), "script": str(START_SCRIPT)}


def resume_job(job_dir: Path, remaining_hours: float) -> dict[str, Any]:
    max_hours = max(0.25, float(remaining_hours))
    watch_hours = max(0.5, min(float(MODE_CFG["watch_hours"]), max_hours + 0.35))
    cmd = [
        str(PYTHON_BIN),
        str(WATCH_SCRIPT),
        "--repo-root", str(REPO_ROOT),
        "--quant-root", str(QUANT_ROOT),
        "--job-dir", str(job_dir),
        "--python", str(PYTHON_BIN),
        "--global-lock-name", str(GLOBAL_LOCK_NAME),
        "--check-interval-sec", str(CHECK_INTERVAL_SEC),
        "--stale-driver-minutes", str(STALE_DRIVER_MINUTES),
        "--stale-state-minutes", str(STALE_STATE_MINUTES),
        "--watch-hours", str(watch_hours),
        "--max-hours", str(max_hours),
        "--task-timeout-minutes", str(MODE_CFG["task_timeout_minutes"]),
        "--threads-cap", str(THREADS_CAP),
        "--max-rss-gib", str(MAX_RSS_GIB),
        "--task-nice", str(TASK_NICE),
        "--monitor-interval-sec", str(MONITOR_INTERVAL_SEC),
        "--metrics-log-interval-sec", str(METRICS_LOG_INTERVAL_SEC),
        "--stale-heartbeat-minutes", str(STALE_HEARTBEAT_MINUTES),
        "--stale-min-elapsed-minutes", str(STALE_MIN_ELAPSED_MINUTES),
        "--stale-cpu-pct-max", str(STALE_CPU_PCT_MAX),
        "--max-load-per-core", str(MAX_LOAD_PER_CORE),
        "--min-free-disk-gb", str(MIN_FREE_DISK_GB),
        "--max-retries-per-task", str(MAX_RETRIES_PER_TASK),
        "--max-failed-task-resume-retries", str(MAX_FAILED_TASK_RESUME_RETRIES),
        "--retryable-exit-codes", str(RETRYABLE_EXIT_CODES),
        "--retry-cooldown-sec", str(RETRY_COOLDOWN_SEC),
        "--sleep-between-tasks-sec", str(MODE_CFG["sleep_between_tasks_sec"]),
        "--stop-after-consecutive-failures", str(MODE_CFG["stop_after_consecutive_failures"]),
        "--task-order", "safe_light_first",
        "--skip-retry-failed",
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        env=os.environ.copy(),
    )
    return {
        "job_dir": str(job_dir),
        "starter_pid": int(proc.pid),
        "script": str(WATCH_SCRIPT),
        "remaining_hours": round(max_hours, 3),
        "watch_hours": round(watch_hours, 3),
    }


def refresh_completed(job_dir: Path) -> bool:
    path = job_dir / "v5_refresh_status.json"
    try:
        data = read_json(path)
    except Exception:
        return False
    return str(data.get("status") or "").lower() == "completed"


def run_refresh(job_dir: Path) -> dict[str, Any]:
    cmd = [str(PYTHON_BIN), str(REFRESH_SCRIPT), "--mode", KEEPER_MODE, "--job-dir", str(job_dir)]
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), check=False, env=os.environ.copy())
    return {"job_dir": str(job_dir), "script": str(REFRESH_SCRIPT), "returncode": int(proc.returncode)}


def main() -> int:
    now = datetime.now()
    window_start, window_cutoff = _window(now, KEEPER_MODE)
    in_window = window_start <= now < window_cutoff
    payload: dict[str, Any] = {
        "schema": "quantlab_v5_training_keeper_v1",
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "mode": KEEPER_MODE,
        "repo_root": str(REPO_ROOT),
        "quant_root": str(QUANT_ROOT),
        "lock_path": str(LOCK_PATH),
        "session_window": {
            "start_local": window_start.isoformat(timespec="seconds"),
            "cutoff_local": window_cutoff.isoformat(timespec="seconds"),
            "now_local": now.isoformat(timespec="seconds"),
        },
    }

    active = active_lock()
    latest = latest_job_summary(KEEPER_MODE)
    current_job = _find_current_job(now, KEEPER_MODE)
    current_summary = _job_summary(current_job) if current_job is not None else None

    if active:
        payload["action"] = "noop_active_lock"
        payload["active_lock_pid"] = int(active["pid"])
        payload["latest_job"] = latest
        if current_summary is not None:
            payload["current_job"] = current_summary
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    payload["latest_job"] = latest
    if current_summary is not None:
        payload["current_job"] = current_summary
        pending, running, done, failed = _summary_counts(current_summary)
        if pending > 0 or running > 0:
            remaining_hours = max(0.0, (window_cutoff - now).total_seconds() / 3600.0)
            if remaining_hours <= 0.0:
                payload["action"] = "noop_cutoff_reached_with_incomplete_job"
            else:
                payload["action"] = "resume_current_job"
                payload["resume"] = resume_job(current_job, remaining_hours)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        if not refresh_completed(current_job):
            payload["action"] = "refresh_current_job_outputs"
            payload["refresh"] = run_refresh(current_job)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        payload["action"] = "noop_current_job_completed"
        payload["current_job_done"] = done
        payload["current_job_failed"] = failed
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if in_window:
        payload["action"] = "start_safe_operator"
        payload["start"] = start_mode(KEEPER_MODE)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    payload["action"] = "noop_outside_window"
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
