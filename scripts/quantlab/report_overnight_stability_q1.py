#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, stable_hash_obj, utc_now_iso


def _parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--job-name-prefix", default="overnight_q1_training_sweep_safe_")
    p.add_argument("--lookback-jobs", type=int, default=7)
    p.add_argument("--output-path", default="")
    p.add_argument("--history-dir", default="")
    p.add_argument("--print-summary", action="store_true")
    return p.parse_args(list(argv))


def _parse_iso(ts: str) -> datetime | None:
    s = (ts or "").strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _read_watchdog_stats(watchdog_log: Path) -> dict[str, int]:
    if not watchdog_log.exists():
        return {
            "restart_total": 0,
            "restart_stale_driver": 0,
            "restart_no_pid": 0,
            "watchdog_stop_max_restarts": 0,
        }
    restart_total = 0
    restart_stale_driver = 0
    restart_no_pid = 0
    watchdog_stop_max_restarts = 0
    try:
        for line in watchdog_log.read_text(errors="replace").splitlines():
            if "restart reason=" in line:
                restart_total += 1
                if "reason=stale_driver_log" in line:
                    restart_stale_driver += 1
                if "reason=no_orchestrator_pid" in line:
                    restart_no_pid += 1
            if "stop reason=max_restarts_reached" in line:
                watchdog_stop_max_restarts += 1
    except Exception:
        pass
    return {
        "restart_total": restart_total,
        "restart_stale_driver": restart_stale_driver,
        "restart_no_pid": restart_no_pid,
        "watchdog_stop_max_restarts": watchdog_stop_max_restarts,
    }


def _discover_jobs(quant_root: Path, prefix: str) -> list[Path]:
    jobs_dir = quant_root / "jobs"
    if not jobs_dir.exists():
        return []
    out: list[Path] = []
    for p in jobs_dir.iterdir():
        if not p.is_dir():
            continue
        if prefix and not p.name.startswith(prefix):
            continue
        if not (p / "state.json").exists():
            continue
        out.append(p)
    return out


def _job_created_at(job_dir: Path, state: dict) -> datetime:
    created = _parse_iso(str(state.get("created_at") or ""))
    if created is not None:
        return created.astimezone(timezone.utc)
    return datetime.fromtimestamp(job_dir.stat().st_mtime, tz=timezone.utc)


def _safe_int(v: object) -> int:
    try:
        return int(v or 0)
    except Exception:
        return 0


def _compute_stability_score(jobs: list[dict]) -> float:
    if not jobs:
        return 0.0
    jobs_total = float(len(jobs))
    completed_jobs = sum(1 for j in jobs if bool(j.get("completed")))
    failed_jobs = sum(1 for j in jobs if bool(j.get("failed_job")))
    jobs_with_restarts = sum(1 for j in jobs if _safe_int(j.get("restart_total")) > 0)
    task_done = sum(_safe_int(j.get("tasks_done")) for j in jobs)
    task_failed = sum(_safe_int(j.get("tasks_failed")) for j in jobs)
    task_attempted = task_done + task_failed

    completed_ratio = completed_jobs / jobs_total
    failed_job_ratio = failed_jobs / jobs_total
    restart_job_ratio = jobs_with_restarts / jobs_total
    task_fail_ratio = (task_failed / float(task_attempted)) if task_attempted > 0 else 0.0

    score = (
        100.0
        - 35.0 * (1.0 - completed_ratio)
        - 20.0 * failed_job_ratio
        - 20.0 * restart_job_ratio
        - 25.0 * task_fail_ratio
    )
    return round(max(0.0, min(100.0, score)), 2)


def _build_report(args: argparse.Namespace) -> dict:
    quant_root = Path(args.quant_root).resolve()
    jobs = _discover_jobs(quant_root, str(args.job_name_prefix or ""))

    rows: list[dict] = []
    for job_dir in jobs:
        state = _read_json(job_dir / "state.json")
        summary = (state.get("summary") or {}) if isinstance(state, dict) else {}
        tasks_total = len((state.get("tasks") or [])) if isinstance(state, dict) else 0
        tasks_done = _safe_int(summary.get("done"))
        tasks_failed = _safe_int(summary.get("failed"))
        tasks_pending = _safe_int(summary.get("pending"))
        tasks_running = _safe_int(summary.get("running"))
        attempted = tasks_done + tasks_failed
        task_success_rate = (tasks_done / attempted) if attempted > 0 else 0.0

        ws = _read_watchdog_stats(job_dir / "logs" / "watchdog.log")
        created_at = _job_created_at(job_dir, state)
        completed = (tasks_pending == 0 and tasks_running == 0 and tasks_done > 0)
        failed_job = (tasks_done == 0 and tasks_failed > 0)

        rows.append(
            {
                "job_name": job_dir.name,
                "job_dir": str(job_dir),
                "created_at": created_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                "updated_at": str(state.get("updated_at") or ""),
                "tasks_total": tasks_total,
                "tasks_done": tasks_done,
                "tasks_failed": tasks_failed,
                "tasks_pending": tasks_pending,
                "tasks_running": tasks_running,
                "task_success_rate": round(task_success_rate, 4),
                "completed": completed,
                "failed_job": failed_job,
                "stopped_due_to_time_limit": bool(summary.get("stopped_due_to_time_limit")),
                "stopped_due_to_consecutive_failures": bool(summary.get("stopped_due_to_consecutive_failures")),
                "restart_total": _safe_int(ws.get("restart_total")),
                "restart_stale_driver": _safe_int(ws.get("restart_stale_driver")),
                "restart_no_pid": _safe_int(ws.get("restart_no_pid")),
                "watchdog_stop_max_restarts": _safe_int(ws.get("watchdog_stop_max_restarts")),
            }
        )

    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    lookback = max(1, int(args.lookback_jobs))
    rows = rows[:lookback]

    jobs_total = len(rows)
    tasks_total = sum(_safe_int(r.get("tasks_total")) for r in rows)
    tasks_done = sum(_safe_int(r.get("tasks_done")) for r in rows)
    tasks_failed = sum(_safe_int(r.get("tasks_failed")) for r in rows)
    tasks_pending = sum(_safe_int(r.get("tasks_pending")) for r in rows)
    completed_jobs = sum(1 for r in rows if bool(r.get("completed")))
    failed_jobs = sum(1 for r in rows if bool(r.get("failed_job")))
    jobs_with_restarts = sum(1 for r in rows if _safe_int(r.get("restart_total")) > 0)
    restart_total = sum(_safe_int(r.get("restart_total")) for r in rows)

    task_success_rate = (tasks_done / float(tasks_done + tasks_failed)) if (tasks_done + tasks_failed) > 0 else 0.0
    completion_rate = (completed_jobs / float(jobs_total)) if jobs_total > 0 else 0.0
    score = _compute_stability_score(rows)

    report = {
        "schema": "quantlab_q1_overnight_stability_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "config": {
            "job_name_prefix": str(args.job_name_prefix),
            "lookback_jobs": lookback,
        },
        "summary": {
            "jobs_total": jobs_total,
            "completed_jobs": completed_jobs,
            "failed_jobs": failed_jobs,
            "jobs_with_restarts": jobs_with_restarts,
            "restart_total": restart_total,
            "tasks_total": tasks_total,
            "tasks_done": tasks_done,
            "tasks_failed": tasks_failed,
            "tasks_pending": tasks_pending,
            "task_success_rate": round(task_success_rate, 4),
            "completion_rate": round(completion_rate, 4),
            "stability_score_0_100": score,
        },
        "jobs": rows,
    }
    report["hashes"] = {"report_hash": stable_hash_obj(report.get("summary"))}
    return report


def main(argv: Iterable[str]) -> int:
    args = _parse_args(argv)
    report = _build_report(args)
    quant_root = Path(args.quant_root).resolve()

    output_path = Path(args.output_path).resolve() if args.output_path else (quant_root / "ops" / "overnight_stability" / "latest.json")
    history_dir = Path(args.history_dir).resolve() if args.history_dir else (quant_root / "ops" / "overnight_stability" / "history")

    atomic_write_json(output_path, report)
    history_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    atomic_write_json(history_dir / f"report_{ts}.json", report)

    if args.print_summary:
        s = report.get("summary") or {}
        print(f"report={output_path}")
        print(f"jobs_total={s.get('jobs_total')}")
        print(f"completed_jobs={s.get('completed_jobs')}")
        print(f"failed_jobs={s.get('failed_jobs')}")
        print(f"jobs_with_restarts={s.get('jobs_with_restarts')}")
        print(f"restart_total={s.get('restart_total')}")
        print(f"task_success_rate={s.get('task_success_rate')}")
        print(f"completion_rate={s.get('completion_rate')}")
        print(f"stability_score_0_100={s.get('stability_score_0_100')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
