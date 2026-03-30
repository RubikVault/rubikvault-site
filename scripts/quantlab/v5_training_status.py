#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
QUANT_ROOT = Path(os.environ.get("QUANT_ROOT", "/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab"))
JOBS_DIR = QUANT_ROOT / "jobs"
LOCK_PATH = JOBS_DIR / "_locks" / "overnight_q1_training_sweep_safe.lock.json"
JOB_PREFIXES = {
    "day": ("day_q1_safe_",),
    "night": ("overnight_q1_safe10h_", "overnight_q1_safe14h_", "night14_q1_"),
}
PATHS = {
    "snapshot": REPO_ROOT / "public" / "data" / "snapshots" / "best-setups-v4.json",
    "learning": REPO_ROOT / "public" / "data" / "reports" / "learning-report-latest.json",
    "weekly": REPO_ROOT / "public" / "data" / "reports" / "learning-weekly-latest.json",
    "monthly": REPO_ROOT / "public" / "data" / "reports" / "learning-monthly-latest.json",
    "etf_diag": REPO_ROOT / "public" / "data" / "reports" / "best-setups-etf-diagnostic-latest.json",
    "calibration": REPO_ROOT / "mirrors" / "forecast" / "champion" / "calibration_latest.json",
    "parity": REPO_ROOT / "mirrors" / "learning" / "reports" / "best-setups-ssot-parity-latest.json",
}


def read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def recent_job_dirs(mode: str, count: int = 5) -> list[Path]:
    out: list[Path] = []
    for prefix in JOB_PREFIXES[mode]:
        out.extend(p for p in JOBS_DIR.glob(f"{prefix}*") if p.is_dir())
    if not out:
        return []
    return sorted(out, key=lambda p: p.stat().st_mtime, reverse=True)[:count]


def job_summary(path: Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    state = read_json(path / "state.json") or {}
    refresh = read_json(path / "v5_refresh_status.json")
    return {
        "job_dir": str(path),
        "updated_at": state.get("updated_at"),
        "summary": state.get("summary") or {},
        "refresh": refresh,
    }


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def active_lock() -> dict[str, Any] | None:
    data = read_json(LOCK_PATH)
    if not data:
        return None
    pid = int(data.get("pid") or 0)
    if not pid_alive(pid):
        return None
    return {"pid": pid, "lock": data}


def main() -> int:
    snapshot = read_json(PATHS["snapshot"]) or {}
    meta = snapshot.get("meta") or {}
    learning = ((read_json(PATHS["learning"]) or {}).get("features") or {}).get("stock_analyzer") or {}
    weekly = read_json(PATHS["weekly"]) or {}
    monthly = read_json(PATHS["monthly"]) or {}
    etf = read_json(PATHS["etf_diag"]) or {}
    calibration = read_json(PATHS["calibration"]) or {}
    parity = read_json(PATHS["parity"]) or {}

    payload = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "repo_root": str(REPO_ROOT),
        "quant_root": str(QUANT_ROOT),
        "active_lock": active_lock(),
        "jobs": {
            "day": [job_summary(p) for p in recent_job_dirs("day")],
            "night": [job_summary(p) for p in recent_job_dirs("night")],
        },
        "snapshot": {
            "path": str(PATHS["snapshot"]),
            "source": meta.get("source"),
            "forecast_asof": meta.get("forecast_asof"),
            "verified_counts": meta.get("verified_counts") or {},
            "rejection_counts": meta.get("rejection_counts") or {},
        },
        "learning": {
            "path": str(PATHS["learning"]),
            "learning_status": learning.get("learning_status"),
            "precision_10": learning.get("precision_10"),
            "precision_50": learning.get("precision_50"),
            "accuracy_all": learning.get("accuracy_all"),
            "coverage_7d": learning.get("coverage_7d"),
            "false_positive_classes_30d": learning.get("false_positive_classes_30d") or {},
            "safety_switch": learning.get("safety_switch") or {},
        },
        "etf_diagnostic": {
            "path": str(PATHS["etf_diag"]),
            "diagnosis": etf.get("diagnosis") or {},
        },
        "forecast_calibration": {
            "path": str(PATHS["calibration"]),
            "end_date": calibration.get("end_date"),
            "horizons": calibration.get("horizons") or {},
        },
        "weekly": {"path": str(PATHS["weekly"]), "summary": weekly},
        "monthly": {"path": str(PATHS["monthly"]), "summary": monthly},
        "ssot_parity": {"path": str(PATHS["parity"]), "summary": parity.get("summary") or {}},
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
