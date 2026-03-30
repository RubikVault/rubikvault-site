#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    build_raw_bars_freshness_summary,
    latest_materialized_snapshot_dir,
    read_json,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--global-lock-name", default="night_q1_block_lock")
    p.add_argument("--min-free-disk-gb", type=float, default=30.0)
    p.add_argument("--run-micro-probe", action="store_true", default=False)
    p.add_argument("--skip-micro-probe", dest="run_micro_probe", action="store_false")
    p.add_argument("--probe-timeout-minutes", type=float, default=25.0)
    p.add_argument("--probe-feature-store-version", default="v4_q1panel_preflight")
    p.add_argument("--probe-asset-classes", default="stock,etf")
    p.add_argument("--probe-lookback-calendar-days", type=int, default=420)
    p.add_argument("--probe-panel-calendar-days", type=int, default=60)
    p.add_argument("--probe-panel-max-assets", type=int, default=3000)
    p.add_argument("--probe-top-liquid-n", type=int, default=2500)
    p.add_argument("--probe-min-bars", type=int, default=200)
    p.add_argument("--probe-fold-count", type=int, default=3)
    p.add_argument("--probe-test-days", type=int, default=5)
    p.add_argument("--probe-embargo-days", type=int, default=2)
    p.add_argument("--probe-min-train-days", type=int, default=8)
    p.add_argument("--probe-survivors-max", type=int, default=24)
    p.add_argument("--probe-redflags-failure-mode", choices=["hard", "warn"], default="warn")
    p.add_argument("--probe-asof-end-date", default="")
    p.add_argument("--probe-v4-final-profile", action="store_true", default=False)
    p.add_argument("--raw-bars-asset-types", default="STOCK,ETF")
    p.add_argument("--raw-bars-reference-date", default="")
    p.add_argument("--raw-bars-provider", default="EODHD")
    p.add_argument("--raw-bars-stale-after-calendar-days", type=int, default=3)
    p.add_argument("--require-fresh-raw-bars", action="store_true", default=True)
    p.add_argument("--skip-require-fresh-raw-bars", dest="require_fresh_raw_bars", action="store_false")
    p.add_argument("--job-name", default="")
    return p.parse_args(list(argv))


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _safe_lock_name(value: str) -> str:
    out = "".join(ch if (ch.isalnum() or ch in {"_", "-", "."}) else "_" for ch in (value or "").strip())
    return out or "overnight_q1_training_sweep"


def _resolve_snapshot(quant_root: Path, snapshot_id: str) -> tuple[str, Path]:
    if snapshot_id:
        sid = str(snapshot_id)
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={sid}"
        if not snap_dir.exists():
            raise FileNotFoundError(f"snapshot not found: {snap_dir}")
        return sid, snap_dir
    snap_dir = latest_materialized_snapshot_dir(quant_root)
    sid = str(snap_dir.name.split("=", 1)[1])
    return sid, snap_dir


def _bars_root_from_manifest(manifest: dict[str, Any], snap_dir: Path) -> Path:
    raw = str(((manifest.get("artifacts") or {}).get("bars_dataset_root")) or "")
    if raw:
        p = Path(raw)
        return p if p.is_absolute() else (snap_dir / p)
    return snap_dir / "bars"


def _run_micro_probe(args: argparse.Namespace, quant_root: Path, snapshot_id: str) -> tuple[bool, dict[str, Any]]:
    ts = int(time.time())
    tag = f"night_preflight_{ts}"
    effective_panel_days = (
        max(int(args.probe_panel_calendar_days), 90)
        if bool(args.probe_v4_final_profile)
        else int(args.probe_panel_calendar_days)
    )
    effective_top_liquid = (
        max(int(args.probe_top_liquid_n), 2500)
        if bool(args.probe_v4_final_profile)
        else int(args.probe_top_liquid_n)
    )
    cmd = [
        str(args.python),
        str(REPO_ROOT / "scripts/quantlab/run_q1_panel_stage_a_daily_local.py"),
        "--quant-root",
        str(quant_root),
        "--snapshot-id",
        snapshot_id,
        "--feature-store-version",
        str(args.probe_feature_store_version),
        "--panel-output-tag",
        tag,
        "--asset-classes",
        str(args.probe_asset_classes),
        "--lookback-calendar-days",
        str(int(args.probe_lookback_calendar_days)),
        "--panel-calendar-days",
        str(effective_panel_days),
        "--panel-max-assets",
        str(int(args.probe_panel_max_assets)),
        "--min-bars",
        str(int(args.probe_min_bars)),
        "--top-liquid-n",
        str(effective_top_liquid),
        "--fold-count",
        str(int(args.probe_fold_count)),
        "--test-days",
        str(int(args.probe_test_days)),
        "--embargo-days",
        str(int(args.probe_embargo_days)),
        "--min-train-days",
        str(int(args.probe_min_train_days)),
        "--survivors-max",
        str(int(args.probe_survivors_max)),
        "--run-stageb-q1",
        "--run-registry-q1",
        "--run-redflags-q1",
        "--redflags-failure-mode",
        str(args.probe_redflags_failure_mode),
        "--stageb-pass-mode",
        "strict",
        "--stageb-strict-gate-profile",
        "hard",
        "--stageb-min-survivors-b-q1",
        "0",
        "--stageb-survivors-b-q1-failure-mode",
        "warn",
        "--stageb-cpcv-light-min-paths-total",
        "2",
        "--registry-freeze-on-zero-strict-pass",
    ]
    if bool(args.probe_v4_final_profile):
        cmd += ["--v4-final-profile"]
    if args.probe_asof_end_date:
        cmd += ["--asof-end-date", str(args.probe_asof_end_date)]

    t0 = time.time()
    timeout_sec = max(60.0, float(args.probe_timeout_minutes) * 60.0)
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, timeout=timeout_sec)
    elapsed = round(time.time() - t0, 3)
    parsed: dict[str, str] = {}
    for line in (proc.stdout or "").splitlines():
        if "=" in line and not line.startswith("["):
            k, v = line.split("=", 1)
            if k and v:
                parsed[k.strip()] = v.strip()

    meta = {
        "ok": bool(proc.returncode == 0),
        "exit_code": int(proc.returncode),
        "elapsed_sec": elapsed,
        "cmd": cmd,
        "stdout_tail": (proc.stdout or "").splitlines()[-40:],
        "stderr_tail": (proc.stderr or "").splitlines()[-40:],
        "parsed": parsed,
    }
    return proc.returncode == 0, meta


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    now = utc_now_iso()
    ts = int(time.time())
    job_name = str(args.job_name or f"night_preflight_{ts}")
    preflight_root = quant_root / "jobs" / job_name
    preflight_root.mkdir(parents=True, exist_ok=True)
    report_path = preflight_root / "q1_night_preflight_report.json"

    checks: dict[str, bool] = {}
    details: dict[str, Any] = {"warnings": []}
    failed: list[str] = []

    checks["python_executable"] = Path(args.python).exists() and os.access(str(args.python), os.X_OK)
    if not checks["python_executable"]:
        failed.append("python_executable")

    checks["quant_root_exists"] = quant_root.exists() and quant_root.is_dir()
    if not checks["quant_root_exists"]:
        failed.append("quant_root_exists")

    try:
        sid, snap_dir = _resolve_snapshot(quant_root, str(args.snapshot_id))
        details["snapshot_id"] = sid
        details["snapshot_dir"] = str(snap_dir)
        checks["snapshot_exists"] = True
    except Exception as exc:
        details["snapshot_error"] = str(exc)
        checks["snapshot_exists"] = False
        failed.append("snapshot_exists")
        sid = ""
        snap_dir = quant_root

    manifest: dict[str, Any] | None = None
    manifest_path = snap_dir / "snapshot_manifest.json"
    checks["snapshot_manifest_exists"] = manifest_path.exists()
    if not checks["snapshot_manifest_exists"]:
        failed.append("snapshot_manifest_exists")
    else:
        try:
            manifest = read_json(manifest_path)
            checks["snapshot_manifest_readable"] = True
        except Exception as exc:
            checks["snapshot_manifest_readable"] = False
            details["snapshot_manifest_error"] = str(exc)
            failed.append("snapshot_manifest_readable")

    bars_root = _bars_root_from_manifest(manifest or {}, snap_dir) if manifest is not None else (snap_dir / "bars")
    checks["bars_root_exists"] = bars_root.exists()
    if not checks["bars_root_exists"]:
        failed.append("bars_root_exists")
    details["bars_root"] = str(bars_root)
    first_bar_file = next(bars_root.rglob("*.parquet"), None) if bars_root.exists() else None
    checks["bars_parquet_present"] = first_bar_file is not None
    if not checks["bars_parquet_present"]:
        failed.append("bars_parquet_present")
    details["bars_sample_file"] = str(first_bar_file) if first_bar_file is not None else ""

    raw_bars_freshness = build_raw_bars_freshness_summary(
        quant_root,
        asset_types=[v.strip() for v in str(args.raw_bars_asset_types).split(",") if v.strip()],
        reference_date=str(args.raw_bars_reference_date or "").strip(),
        provider=str(args.raw_bars_provider),
        stale_after_calendar_days=int(args.raw_bars_stale_after_calendar_days),
    )
    details["raw_bars_freshness"] = raw_bars_freshness
    checks["raw_bars_freshness_ok"] = bool(raw_bars_freshness.get("required_asset_types_fresh")) or (not bool(args.require_fresh_raw_bars))
    if not checks["raw_bars_freshness_ok"]:
        failed.append("raw_bars_freshness_ok")

    du = shutil.disk_usage(quant_root)
    free_gb = float(du.free) / (1024 ** 3)
    details["disk_free_gb"] = round(free_gb, 3)
    checks["disk_free_ok"] = free_gb >= float(args.min_free_disk_gb)
    if not checks["disk_free_ok"]:
        failed.append("disk_free_ok")

    safe_lock = _safe_lock_name(str(args.global_lock_name))
    lock_path = quant_root / "jobs" / "_locks" / f"{safe_lock}.lock.json"
    details["global_lock_path"] = str(lock_path)
    lock_active = False
    lock_pid = 0
    if lock_path.exists():
        try:
            lock_obj = json.loads(lock_path.read_text())
            lock_pid = int(lock_obj.get("pid") or 0)
            lock_active = _pid_alive(lock_pid)
        except Exception:
            lock_active = True
    details["global_lock_pid"] = int(lock_pid)
    checks["global_lock_not_active"] = not lock_active
    if not checks["global_lock_not_active"]:
        failed.append("global_lock_not_active")

    dep_cmd = [str(args.python), "-c", "import polars, pyarrow; print('ok')"]
    dep_proc = subprocess.run(dep_cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    checks["python_dependencies_ok"] = dep_proc.returncode == 0
    details["python_dep_stdout"] = (dep_proc.stdout or "").strip()
    details["python_dep_stderr"] = (dep_proc.stderr or "").strip()
    if not checks["python_dependencies_ok"]:
        failed.append("python_dependencies_ok")

    opt_dep_cmd = [str(args.python), "-c", "import psutil; print('ok')"]
    opt_dep_proc = subprocess.run(opt_dep_cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    checks["python_optional_psutil_ok"] = opt_dep_proc.returncode == 0
    details["python_optional_psutil_stdout"] = (opt_dep_proc.stdout or "").strip()
    details["python_optional_psutil_stderr"] = (opt_dep_proc.stderr or "").strip()
    if not checks["python_optional_psutil_ok"]:
        details["warnings"].append("OPTIONAL_DEP_MISSING:psutil")

    micro_probe: dict[str, Any] = {"requested": bool(args.run_micro_probe), "executed": False}
    if not failed and bool(args.run_micro_probe):
        try:
            ok_probe, probe_meta = _run_micro_probe(args, quant_root, sid)
            micro_probe["executed"] = True
            micro_probe.update(probe_meta)
            checks["micro_probe_ok"] = bool(ok_probe)
            if not ok_probe:
                failed.append("micro_probe_ok")
        except subprocess.TimeoutExpired as exc:
            checks["micro_probe_ok"] = False
            micro_probe["executed"] = True
            micro_probe["ok"] = False
            micro_probe["exit_code"] = 124
            micro_probe["error"] = f"timeout after {exc.timeout}s"
            failed.append("micro_probe_ok")
        except Exception as exc:
            checks["micro_probe_ok"] = False
            micro_probe["executed"] = True
            micro_probe["ok"] = False
            micro_probe["exit_code"] = 1
            micro_probe["error"] = str(exc)
            failed.append("micro_probe_ok")

    ok = len(failed) == 0
    report = {
        "schema": "quantlab_q1_night_preflight_report_v1",
        "generated_at": now,
        "ok": bool(ok),
        "checks": checks,
        "failed_checks": sorted(set(failed)),
        "config": {
            "quant_root": str(quant_root),
            "python": str(args.python),
            "snapshot_id": str(details.get("snapshot_id") or ""),
            "global_lock_name": str(args.global_lock_name),
            "min_free_disk_gb": float(args.min_free_disk_gb),
            "raw_bars_asset_types": [v.strip() for v in str(args.raw_bars_asset_types).split(",") if v.strip()],
            "raw_bars_provider": str(args.raw_bars_provider),
            "raw_bars_stale_after_calendar_days": int(args.raw_bars_stale_after_calendar_days),
            "require_fresh_raw_bars": bool(args.require_fresh_raw_bars),
            "run_micro_probe": bool(args.run_micro_probe),
            "probe_timeout_minutes": float(args.probe_timeout_minutes),
        },
        "details": details,
        "micro_probe": micro_probe,
    }
    atomic_write_json(report_path, report)
    latest_ptr = quant_root / "jobs" / "night_preflight" / "latest.json"
    atomic_write_json(
        latest_ptr,
        {
            "schema": "quantlab_q1_night_preflight_latest_v1",
            "updated_at": utc_now_iso(),
            "ok": bool(ok),
            "snapshot_id": str(details.get("snapshot_id") or ""),
            "report_path": str(report_path),
        },
    )

    print(f"snapshot_id={details.get('snapshot_id') or ''}")
    print(f"report={report_path}")
    print(f"ok={str(ok).lower()}")
    if not ok:
        print(f"failed_checks={','.join(sorted(set(failed)))}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
