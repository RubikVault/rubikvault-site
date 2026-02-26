#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Any

import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--delta-manifest", default="")
    p.add_argument("--increment-snapshot-manifest", default="")
    p.add_argument("--increment-feature-manifest", default="")
    p.add_argument("--max-delta-files", type=int, default=0)
    return p.parse_args(list(argv))


def _resolve_latest_ptr(quant_root: Path, sub: str, key: str) -> Path:
    ptr = quant_root / "ops" / sub / "latest_success.json"
    if not ptr.exists():
        raise FileNotFoundError(f"latest pointer missing: {ptr}")
    data = read_json(ptr)
    p = data.get(key) or data.get("manifest_path")
    if not p:
        raise RuntimeError(f"{key}/manifest_path missing in {ptr}")
    return Path(str(p))


def _resolve_path(quant_root: Path, explicit: str, default_ptr_sub: str, key: str) -> Path:
    if explicit:
        p = Path(explicit)
        return p if p.is_absolute() else (quant_root / p)
    return _resolve_latest_ptr(quant_root, default_ptr_sub, key)


def _iter_delta_files(delta_manifest: dict[str, Any]) -> list[Path]:
    packs_manifest = Path(str(delta_manifest.get("packs_manifest_path") or ""))
    out: list[Path] = []
    if not packs_manifest.exists():
        return out
    for line in packs_manifest.read_text().splitlines():
        if not line.strip():
            continue
        try:
            ev = json.loads(line)
        except Exception:
            continue
        for item in (ev.get("outputs") or []):
            p = item.get("path")
            if p:
                out.append(Path(str(p)))
    return out


def _scan_delta_quality(delta_files: list[Path], max_files: int = 0) -> dict[str, Any]:
    total_rows = 0
    dup_keys = 0
    future_dates = 0
    invalid_ohlcv = 0
    seen = set()
    today = date.today().isoformat()
    files_scanned = 0
    for fp in delta_files:
        if max_files and files_scanned >= max_files:
            break
        if not fp.exists():
            continue
        pf = pq.ParquetFile(fp)
        tbl = pf.read(columns=["asset_id", "date", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw"])
        d = tbl.to_pydict()
        aids = d.get("asset_id") or []
        dates = d.get("date") or []
        opens = d.get("open_raw") or []
        highs = d.get("high_raw") or []
        lows = d.get("low_raw") or []
        closes = d.get("close_raw") or []
        vols = d.get("volume_raw") or []
        files_scanned += 1
        total_rows += len(aids)
        for aid, dt, o, h, l, c, v in zip(aids, dates, opens, highs, lows, closes, vols):
            key = (aid, dt)
            if key in seen:
                dup_keys += 1
            else:
                seen.add(key)
            if dt and str(dt) > today:
                future_dates += 1
            try:
                if (
                    o is None or h is None or l is None or c is None or v is None or
                    float(c) <= 0 or float(o) <= 0 or float(h) < float(l) or float(v) < 0
                ):
                    invalid_ohlcv += 1
            except Exception:
                invalid_ohlcv += 1
    return {
        "delta_files_scanned": files_scanned,
        "delta_rows_scanned": total_rows,
        "duplicate_keys_detected": dup_keys,
        "future_dates_detected": future_dates,
        "invalid_ohlcv_rows_detected": invalid_ohlcv,
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    delta_manifest_path = _resolve_path(quant_root, args.delta_manifest, "q1_daily_delta_ingest", "manifest_path")
    inc_snap_manifest_path = _resolve_path(quant_root, args.increment_snapshot_manifest, "q1_incremental_snapshot", "increment_manifest")
    inc_feat_manifest_path = _resolve_path(quant_root, args.increment_feature_manifest, "q1_incremental_feature_update", "manifest_path")

    delta_manifest = read_json(delta_manifest_path)
    inc_snap_manifest = read_json(inc_snap_manifest_path)
    inc_feat_manifest = read_json(inc_feat_manifest_path)

    run_id = f"q1recon_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_reconciliation_report.json"

    delta_files = _iter_delta_files(delta_manifest)
    quality = _scan_delta_quality(delta_files, max_files=int(args.max_delta_files or 0))

    delta_stats = (delta_manifest.get("stats") or {})
    delta_recon = (delta_manifest.get("reconciliation") or {})
    snap_counts = (inc_snap_manifest.get("counts") or {})
    snap_recon = (inc_snap_manifest.get("reconciliation") or {})
    feat_counts = (inc_feat_manifest.get("counts") or {})
    feat_recon = (inc_feat_manifest.get("reconciliation") or {})

    checks = {
        "delta_rows_emitted_matches_keys": bool(delta_recon.get("rows_emitted_matches_keys", False)),
        "snapshot_rows_declared_matches_scanned": bool(snap_recon.get("rows_declared_matches_scanned", False)),
        "delta_rows_scanned_consistent": int(quality.get("delta_rows_scanned", 0)) == int(snap_counts.get("delta_rows_scanned_total", 0)),
        "no_duplicate_keys_in_delta": int(quality.get("duplicate_keys_detected", 0)) == 0,
        "no_future_dates_in_delta": int(quality.get("future_dates_detected", 0)) == 0,
        "no_invalid_ohlcv_in_delta": int(quality.get("invalid_ohlcv_rows_detected", 0)) == 0,
        "feature_changed_assets_not_exceed_snapshot_changed": int(feat_counts.get("changed_assets_total", 0)) <= int(snap_counts.get("changed_assets_total", 0)),
        "feature_reconciliation_ok": bool(feat_recon.get("ok", False)),
    }
    all_ok = all(checks.values())

    report = {
        "schema": "quantlab_q1_reconciliation_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": all_ok,
        "inputs": {
            "delta_manifest": str(delta_manifest_path),
            "increment_snapshot_manifest": str(inc_snap_manifest_path),
            "increment_feature_manifest": str(inc_feat_manifest_path),
        },
        "checks": checks,
        "stats": {
            "delta_manifest_stats": {
                "selected_packs_total": delta_stats.get("selected_packs_total"),
                "packs_done": delta_stats.get("packs_done"),
                "bars_rows_emitted_delta": delta_stats.get("bars_rows_emitted_delta"),
                "assets_emitted_delta": delta_stats.get("assets_emitted_delta"),
                "rows_skipped_old_or_known": delta_stats.get("rows_skipped_old_or_known"),
            },
            "delta_quality_scan": quality,
            "increment_snapshot_counts": snap_counts,
            "increment_feature_counts": feat_counts,
        },
        "hashes": {
            "delta_manifest_hash": stable_hash_file(delta_manifest_path),
            "increment_snapshot_manifest_hash": stable_hash_file(inc_snap_manifest_path),
            "increment_feature_manifest_hash": stable_hash_file(inc_feat_manifest_path),
        },
    }
    atomic_write_json(report_path, report)
    latest_ptr = quant_root / "ops" / "q1_reconciliation" / "latest_success.json"
    atomic_write_json(latest_ptr, {"schema": "quantlab_q1_reconciliation_latest_success_v1", "updated_at": utc_now_iso(), "run_id": run_id, "report_path": str(report_path), "ok": all_ok, "checks": checks})

    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={all_ok}")
    if not all_ok:
        failed = [k for k,v in checks.items() if not v]
        print(f"failed_checks={','.join(failed)}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
