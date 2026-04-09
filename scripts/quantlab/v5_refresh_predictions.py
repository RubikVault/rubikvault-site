#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
QUANT_ROOT = Path(os.environ.get("QUANT_ROOT", "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"))
LOCK_DIR = QUANT_ROOT / "jobs" / "_locks"
OPS_ROOT = QUANT_ROOT / "ops" / "v5_training"
SNAPSHOT_PATH = REPO_ROOT / "public" / "data" / "snapshots" / "best-setups-v4.json"
LEARNING_REPORT_PATH = REPO_ROOT / "public" / "data" / "reports" / "learning-report-latest.json"
ETF_DIAG_PATH = REPO_ROOT / "public" / "data" / "reports" / "best-setups-etf-diagnostic-latest.json"
CALIBRATION_PATH = REPO_ROOT / "mirrors" / "forecast" / "champion" / "calibration_latest.json"
PARITY_REPORT_PATH = REPO_ROOT / "mirrors" / "learning" / "reports" / "best-setups-ssot-parity-latest.json"
STABILITY_5D_PATH = REPO_ROOT / "public" / "data" / "reports" / "learning-stability-5d-latest.json"
FORECAST_STATUS_PATH = REPO_ROOT / "public" / "data" / "forecast" / "system" / "status.json"
FORECAST_LATEST_PATH = REPO_ROOT / "public" / "data" / "forecast" / "latest.json"

STEPS = [
    ("forecast_run_daily", ["node", "scripts/forecast/run_daily.mjs"]),
    ("forecast_backfill_outcomes", ["node", "scripts/forecast/backfill_outcomes.mjs"]),
    ("forecast_calibration", ["node", "scripts/forecast/calibrate_forecast.mjs"]),
    ("build_best_setups", ["node", "scripts/build-best-setups-v4.mjs"]),
    ("etf_diagnostic", ["node", "scripts/learning/diagnose-best-setups-etf-drop.mjs"]),
    ("analyzer_backfill", ["node", "scripts/learning/backfill-stock-analyzer-history.mjs"]),
    ("learning_daily", ["node", "scripts/learning/run-daily-learning-cycle.mjs"]),
    ("learning_weekly", ["node", "scripts/learning/run-weekly-learning-cycle.mjs"]),
    ("learning_monthly", ["node", "scripts/learning/run-monthly-learning-cycle.mjs"]),
    ("stability_5d", ["node", "scripts/learning/run-5day-stability-observation.mjs"]),
    ("ssot_parity_validation", ["node", "scripts/validate/best-setups-ssot-local-parity.mjs"]),
]

STEP_ENV_OVERRIDES = {
    "forecast_run_daily": {
        "FORECAST_SKIP_MATURED_EVAL": "1",
        "NODE_OPTIONS": "--max-old-space-size=12288",
    },
    "forecast_backfill_outcomes": {
        "NODE_OPTIONS": "--max-old-space-size=8192",
    },
    "forecast_calibration": {
        "NODE_OPTIONS": "--max-old-space-size=8192",
    },
    "build_best_setups": {
        "NODE_OPTIONS": "--max-old-space-size=12288",
    },
    "analyzer_backfill": {
        "NODE_OPTIONS": "--max-old-space-size=8192",
    },
}


def now_utc() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def acquire_lock(lock_path: Path, payload: dict[str, Any]) -> tuple[bool, dict[str, Any] | None]:
    existing = read_json(lock_path) if lock_path.exists() else None
    existing_pid = int((existing or {}).get("pid") or 0)
    if existing_pid > 0 and pid_alive(existing_pid) and existing_pid != os.getpid():
        return False, existing
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(lock_path, payload)
    return True, existing


def release_lock(lock_path: Path) -> None:
    try:
        current = read_json(lock_path) or {}
        if int(current.get("pid") or 0) == os.getpid():
            lock_path.unlink(missing_ok=True)
    except Exception:
        pass


def summarize_outputs() -> dict[str, Any]:
    snapshot = read_json(SNAPSHOT_PATH) or {}
    learning = read_json(LEARNING_REPORT_PATH) or {}
    etf = read_json(ETF_DIAG_PATH) or {}
    calibration = read_json(CALIBRATION_PATH) or {}
    parity = read_json(PARITY_REPORT_PATH) or {}
    stability = read_json(STABILITY_5D_PATH) or {}

    analyzer = ((learning.get("features") or {}).get("stock_analyzer") or {})
    meta = snapshot.get("meta") or {}
    verified = meta.get("verified_counts") or {}
    return {
        "snapshot": {
            "path": str(SNAPSHOT_PATH),
            "stocks": verified.get("stocks") or {},
            "etfs": verified.get("etfs") or {},
            "source": meta.get("source"),
            "forecast_asof": meta.get("forecast_asof"),
        },
        "learning": {
            "path": str(LEARNING_REPORT_PATH),
            "learning_status": analyzer.get("learning_status"),
            "precision_10": analyzer.get("precision_10"),
            "precision_50": analyzer.get("precision_50"),
            "accuracy_all": analyzer.get("accuracy_all"),
            "coverage_7d": analyzer.get("coverage_7d"),
            "predictions_today": analyzer.get("predictions_today"),
            "safety_level": ((analyzer.get("safety_switch") or {}).get("level")),
        },
        "etf_diagnostic": {
            "path": str(ETF_DIAG_PATH),
            "code": (((etf.get("diagnosis") or {}).get("code"))),
            "severity": (((etf.get("diagnosis") or {}).get("severity"))),
        },
        "forecast_calibration": {
            "path": str(CALIBRATION_PATH),
            "end_date": calibration.get("end_date"),
            "horizons": calibration.get("horizons") or {},
        },
        "ssot_parity": {
            "path": str(PARITY_REPORT_PATH),
            "summary": parity.get("summary") or {},
        },
        "stability_5d": {
            "path": str(STABILITY_5D_PATH),
            "days_covered": stability.get("days_covered"),
        },
    }


def forecast_daily_already_current() -> bool:
    status = read_json(FORECAST_STATUS_PATH) or {}
    latest = read_json(FORECAST_LATEST_PATH) or {}
    last_run = str(status.get("last_run") or "")[:10]
    status_value = str(status.get("status") or "").lower()
    generated_at = str((latest.get("meta") or {}).get("generated_at") or "")[:10]
    today = now_utc()[:10]
    if last_run != today:
        return False
    if generated_at and generated_at != today:
        return False
    return status_value in {"ok", "stale"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh V5 prediction artifacts after train runs.")
    parser.add_argument("--mode", choices=["day", "night"], required=True)
    parser.add_argument("--job-dir")
    args = parser.parse_args()

    job_dir = Path(args.job_dir).resolve() if args.job_dir else None
    state_path = (job_dir / "v5_refresh_status.json") if job_dir else (OPS_ROOT / "refresh" / args.mode / datetime.now().strftime("%Y-%m-%d") / "status.json")
    lock_path = LOCK_DIR / f"v5_refresh_{args.mode}.lock.json"
    lock_payload = {
        "pid": os.getpid(),
        "mode": args.mode,
        "job_dir": str(job_dir) if job_dir else None,
        "started_at": now_utc(),
        "state_path": str(state_path),
    }
    acquired, existing = acquire_lock(lock_path, lock_payload)
    if not acquired:
        print(json.dumps({"ok": True, "action": "noop_locked", "lock": existing or {}}, ensure_ascii=False))
        return 0

    state = read_json(state_path) or {
        "schema": "rv.v5.refresh.status.v1",
        "mode": args.mode,
        "job_dir": str(job_dir) if job_dir else None,
        "repo_root": str(REPO_ROOT),
        "quant_root": str(QUANT_ROOT),
        "created_at": now_utc(),
        "steps": {},
    }
    state["started_at"] = now_utc()
    state["status"] = "running"
    write_json(state_path, state)

    try:
        for step_name, command in STEPS:
            prior = (state.get("steps") or {}).get(step_name) or {}
            if prior.get("status") == "completed":
                continue
            if step_name == "forecast_run_daily" and forecast_daily_already_current():
                state.setdefault("steps", {})[step_name] = {
                    "status": "completed",
                    "started_at": now_utc(),
                    "finished_at": now_utc(),
                    "returncode": 0,
                    "command": command,
                    "external_completion": True,
                }
                write_json(state_path, state)
                continue
            step_state = {
                "status": "running",
                "started_at": now_utc(),
                "command": command,
            }
            state.setdefault("steps", {})[step_name] = step_state
            write_json(state_path, state)

            env = os.environ.copy()
            env.update(STEP_ENV_OVERRIDES.get(step_name, {}))
            proc = subprocess.run(command, cwd=str(REPO_ROOT), check=False, env=env)
            step_state["finished_at"] = now_utc()
            step_state["returncode"] = int(proc.returncode)
            step_state["status"] = "completed" if proc.returncode == 0 else "failed"
            state["steps"][step_name] = step_state
            write_json(state_path, state)
            if proc.returncode != 0:
                state["status"] = "failed"
                state["failed_step"] = step_name
                state["finished_at"] = now_utc()
                state["outputs"] = summarize_outputs()
                write_json(state_path, state)
                return proc.returncode

        state["status"] = "completed"
        state["finished_at"] = now_utc()
        state["outputs"] = summarize_outputs()
        write_json(state_path, state)
        print(json.dumps({"ok": True, "status": "completed", "state_path": str(state_path), "outputs": state["outputs"]}, ensure_ascii=False))
        return 0
    finally:
        release_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main())
