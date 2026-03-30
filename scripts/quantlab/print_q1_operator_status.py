#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path


QUANT_ROOT = Path(os.environ.get("QUANT_ROOT", "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"))
JOBS_DIR = QUANT_ROOT / "jobs"
LOCK_PATH = JOBS_DIR / "_locks" / "overnight_q1_training_sweep_safe.lock.json"
PREFIXES = ("day_q1_safe_", "overnight_q1_safe10h_", "overnight_q1_safe14h_", "night14_q1_")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def job_dirs() -> list[Path]:
    items = []
    for prefix in PREFIXES:
        items.extend(JOBS_DIR.glob(f"{prefix}*"))
    return sorted((p for p in items if p.is_dir()), key=lambda p: p.stat().st_mtime, reverse=True)


def active_pid() -> int:
    if not LOCK_PATH.exists():
        return 0
    try:
        data = read_json(LOCK_PATH)
        pid = int(data.get("pid") or 0)
    except Exception:
        return 0
    if pid <= 0:
        return 0
    try:
        os.kill(pid, 0)
        return pid
    except OSError:
        return 0


def status_for_job(job_dir: Path) -> dict:
    state_path = job_dir / "state.json"
    if not state_path.exists():
        return {
            "job": str(job_dir),
            "state": "missing_state",
        }
    data = read_json(state_path)
    summary = data.get("summary") or {}
    tasks = data.get("tasks") or []
    running = next((t for t in tasks if t.get("status") == "running"), None)
    return {
        "job": str(job_dir),
        "updated_at": data.get("updated_at"),
        "summary": {
            "pending": summary.get("pending"),
            "running": summary.get("running"),
            "done": summary.get("done"),
            "failed": summary.get("failed"),
            "failed_by_class": summary.get("failed_by_class") or {},
        },
        "running_task": running.get("task_id") if running else None,
        "running_task_current_top_liquid_n": running.get("current_top_liquid_n") if running else None,
        "threads_cap": (data.get("config") or {}).get("threads_cap"),
        "max_rss_gib": (data.get("config") or {}).get("max_rss_gib"),
        "max_hours": (data.get("config") or {}).get("max_hours"),
        "panel_max_assets": (data.get("config") or {}).get("panel_max_assets"),
    }


def print_job(label: str, info: dict) -> None:
    print(label)
    for key in (
        "job",
        "updated_at",
        "running_task",
        "running_task_current_top_liquid_n",
        "threads_cap",
        "max_rss_gib",
        "max_hours",
        "panel_max_assets",
    ):
        if key in info and info[key] is not None:
            print(f"  {key}: {info[key]}")
    if "summary" in info:
        print(f"  summary: {json.dumps(info['summary'], sort_keys=True)}")


def main() -> int:
    pid = active_pid()
    jobs = job_dirs()
    print(f"quant_root: {QUANT_ROOT}")
    print(f"lock_path: {LOCK_PATH}")
    print(f"active_lock_pid: {pid or 'none'}")

    if jobs:
        latest = status_for_job(jobs[0])
        print_job("latest_job:", latest)
        recent = [status_for_job(p) for p in jobs[1:4]]
        if recent:
            print("recent_jobs:")
            for info in recent:
                print(f"  - {info.get('job')}")
                if "summary" in info:
                    print(f"    summary: {json.dumps(info['summary'], sort_keys=True)}")
                if info.get("running_task"):
                    print(f"    running_task: {info['running_task']}")
    else:
        print("latest_job: none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
