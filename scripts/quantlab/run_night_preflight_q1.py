#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, latest_materialized_snapshot_dir, utc_now_iso
from scripts.quantlab.q1_common import build_raw_bars_freshness_summary


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--global-lock-name", default="overnight_q1_training_sweep")
    p.add_argument("--min-free-disk-gb", type=float, default=30.0)
    p.add_argument("--max-rss-gib", type=float, default=6.5)
    p.add_argument("--max-rss-mem-fraction", type=float, default=0.8)
    p.add_argument("--skip-lock-check", action="store_true", default=False)
    p.add_argument("--failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--raw-bars-asset-types", default="STOCK,ETF")
    p.add_argument("--raw-bars-reference-date", default="")
    p.add_argument("--raw-bars-provider", default="EODHD")
    p.add_argument("--raw-bars-stale-after-calendar-days", type=int, default=3)
    p.add_argument("--require-fresh-raw-bars", action="store_true", default=True)
    p.add_argument("--skip-require-fresh-raw-bars", dest="require_fresh_raw_bars", action="store_false")
    return p.parse_args(list(argv))


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _disk_free_gb(path: Path) -> float:
    st = os.statvfs(str(path))
    return float(st.f_bavail * st.f_frsize) / float(1024 ** 3)


def _total_mem_gib() -> float:
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return float(pages * page_size) / float(1024 ** 3)
    except Exception:
        try:
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True, timeout=3.0).strip()
            return float(int(out)) / float(1024 ** 3)
        except Exception:
            return 0.0


def run_preflight_checks(
    *,
    quant_root: Path,
    python_bin: Path,
    snapshot_dir: Path,
    global_lock_name: str,
    min_free_disk_gb: float,
    max_rss_gib: float,
    max_rss_mem_fraction: float,
    skip_lock_check: bool = False,
    raw_bars_asset_types: Iterable[str] = (),
    raw_bars_reference_date: str = "",
    raw_bars_provider: str = "EODHD",
    raw_bars_stale_after_calendar_days: int = 3,
    require_fresh_raw_bars: bool = True,
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    # Snapshot presence
    snap_ok = snapshot_dir.exists()
    checks.append(
        {
            "name": "snapshot_present",
            "ok": bool(snap_ok),
            "snapshot_dir": str(snapshot_dir),
            "reason": None if snap_ok else "snapshot_missing",
        }
    )

    # Disk free
    free_gb = _disk_free_gb(quant_root)
    disk_ok = free_gb >= float(min_free_disk_gb)
    checks.append(
        {
            "name": "disk_free",
            "ok": bool(disk_ok),
            "free_gb": round(free_gb, 3),
            "min_free_gb": float(min_free_disk_gb),
            "reason": None if disk_ok else "disk_below_min",
        }
    )

    # RSS budget sanity
    mem_gib = _total_mem_gib()
    rss_limit = float(max_rss_gib)
    mem_fraction_limit = float(max_rss_mem_fraction) * mem_gib if mem_gib > 0 else 0.0
    rss_ok = (rss_limit > 0.0) and (mem_gib <= 0.0 or rss_limit <= mem_fraction_limit)
    checks.append(
        {
            "name": "rss_budget",
            "ok": bool(rss_ok),
            "max_rss_gib": float(rss_limit),
            "host_mem_gib": round(mem_gib, 3),
            "max_allowed_gib_by_fraction": round(mem_fraction_limit, 3) if mem_gib > 0 else None,
            "fraction_cap": float(max_rss_mem_fraction),
            "reason": None if rss_ok else "rss_budget_exceeds_fraction_cap",
        }
    )

    # Python health (runtime + polars import)
    py_cmd = [
        str(python_bin),
        "-c",
        "import sys,platform,polars; print('PY_OK'); print(sys.version.split()[0]); print(platform.platform())",
    ]
    py_ok = False
    py_stdout: list[str] = []
    py_stderr: list[str] = []
    try:
        py = subprocess.run(py_cmd, capture_output=True, text=True, timeout=20.0)
        py_ok = py.returncode == 0 and ("PY_OK" in (py.stdout or ""))
        py_stdout = (py.stdout or "").splitlines()[-8:]
        py_stderr = (py.stderr or "").splitlines()[-8:]
    except Exception as exc:
        py_ok = False
        py_stderr = [f"python_health_exception={type(exc).__name__}:{exc}"]
    checks.append(
        {
            "name": "python_health",
            "ok": bool(py_ok),
            "python": str(python_bin),
            "stdout_tail": py_stdout,
            "stderr_tail": py_stderr,
            "reason": None if py_ok else "python_runtime_unhealthy",
        }
    )

    # Raw bars freshness
    freshness = build_raw_bars_freshness_summary(
        quant_root,
        asset_types=list(raw_bars_asset_types or []),
        reference_date=str(raw_bars_reference_date or "").strip(),
        provider=str(raw_bars_provider),
        stale_after_calendar_days=int(raw_bars_stale_after_calendar_days),
    )
    freshness_ok = bool(freshness.get("required_asset_types_fresh"))
    enforced = bool(require_fresh_raw_bars)
    checks.append(
        {
            "name": "raw_bars_freshness",
            "ok": bool(freshness_ok or (not enforced)),
            "enforced": enforced,
            "provider": str(raw_bars_provider),
            "freshness": freshness,
            "reason": None if (freshness_ok or (not enforced)) else ",".join(str(v) for v in (freshness.get("reason_codes") or [])),
        }
    )

    # Lock check
    if not skip_lock_check:
        lock_path = quant_root / "jobs" / "_locks" / f"{global_lock_name}.lock.json"
        lock_ok = True
        lock_reason = None
        active_pid = 0
        stale = False
        if lock_path.exists():
            try:
                lock_obj = json.loads(lock_path.read_text())
            except Exception:
                lock_obj = {}
            active_pid = int(lock_obj.get("pid") or 0)
            if active_pid > 0 and _pid_alive(active_pid):
                lock_ok = False
                lock_reason = "active_named_lock"
            else:
                stale = True
        checks.append(
            {
                "name": "named_lock",
                "ok": bool(lock_ok),
                "lock_path": str(lock_path),
                "active_pid": int(active_pid),
                "stale_lock_detected": bool(stale),
                "reason": lock_reason,
            }
        )

    failed = [c for c in checks if not c.get("ok")]
    return {
        "schema": "quantlab_q1_night_preflight_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "snapshot_dir": str(snapshot_dir),
        "checks": checks,
        "ok": len(failed) == 0,
        "failed_checks": [str(c.get("name")) for c in failed],
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    snapshot_dir = (
        quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
        if str(args.snapshot_id or "").strip()
        else latest_materialized_snapshot_dir(quant_root)
    )
    report = run_preflight_checks(
        quant_root=quant_root,
        python_bin=Path(args.python),
        snapshot_dir=snapshot_dir,
        global_lock_name=str(args.global_lock_name),
        min_free_disk_gb=float(args.min_free_disk_gb),
        max_rss_gib=float(args.max_rss_gib),
        max_rss_mem_fraction=float(args.max_rss_mem_fraction),
        skip_lock_check=bool(args.skip_lock_check),
        raw_bars_asset_types=[v.strip() for v in str(args.raw_bars_asset_types).split(",") if v.strip()],
        raw_bars_reference_date=str(args.raw_bars_reference_date or "").strip(),
        raw_bars_provider=str(args.raw_bars_provider),
        raw_bars_stale_after_calendar_days=int(args.raw_bars_stale_after_calendar_days),
        require_fresh_raw_bars=bool(args.require_fresh_raw_bars),
    )

    out_dir = quant_root / "ops" / "preflight"
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
    report_path = out_dir / f"night_preflight_{ts}.json"
    latest_path = out_dir / "night_preflight_latest.json"
    atomic_write_json(report_path, report)
    atomic_write_json(latest_path, report)

    print(f"report={report_path}")
    print(f"ok={str(report.get('ok')).lower()}")
    if not report.get("ok"):
        print(f"failed_checks={','.join(report.get('failed_checks') or [])}")

    if report.get("ok") or str(args.failure_mode).lower() == "warn":
        return 0
    return 96


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
