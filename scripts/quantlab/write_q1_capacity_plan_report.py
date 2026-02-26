#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--benchmark-report", required=True)
    p.add_argument("--snapshot-id", required=True)
    return p.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    benchmark_path = Path(args.benchmark_report).resolve()
    snap_id = args.snapshot_id
    bench = read_json(benchmark_path)
    snap_manifest = read_json(quant_root / "data" / "snapshots" / f"snapshot_id={snap_id}" / "snapshot_manifest.json")

    disk_root = shutil.disk_usage("/")
    disk_t9 = shutil.disk_usage("/Volumes/T9") if Path("/Volumes/T9").exists() else None

    scales = bench.get("scales") or []
    best = [s for s in scales if s.get("ok")]
    projections = {}
    # Estimate based on rows scaling from the largest successful scale
    if best:
        largest = sorted(best, key=lambda x: x["max_assets"])[-1]
        rows = float(largest.get("feature_rows_total") or 0)
        max_assets = float(largest.get("max_assets") or 1)
        rows_per_asset = (rows / max_assets) if max_assets > 0 else 0
        full_assets = 95153  # rough stock+etf universe from export/universe counts
        projections = {
            "rows_per_asset_estimate": rows_per_asset,
            "projected_feature_rows_stock_etf_full": int(rows_per_asset * full_assets),
            "scaling_basis_max_assets": int(max_assets),
        }
        if largest.get("elapsed_sec") and max_assets > 0:
            sec_per_asset = largest["elapsed_sec"] / max_assets
            projections["projected_elapsed_sec_linear_full"] = round(sec_per_asset * full_assets, 1)
            projections["projected_elapsed_hours_linear_full"] = round((sec_per_asset * full_assets) / 3600, 2)

    report = {
        "schema": "quantlab_q1_capacity_plan_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "snapshot_id": snap_id,
        "snapshot_counts": {
            "bars_rows_total": (snap_manifest.get("counts") or {}).get("bars_materialized_rows_total"),
            "universe_rows_total": (snap_manifest.get("counts") or {}).get("universe_rows_total"),
            "universe_rows_by_asset_class": (snap_manifest.get("counts") or {}).get("universe_rows_by_asset_class"),
        },
        "storage": {
            "mac_root_free_bytes": disk_root.free,
            "mac_root_free_gib": round(disk_root.free / (1024**3), 2),
            "quant_hot_dir_gib": round(sum(p.stat().st_size for p in quant_root.rglob('*') if p.is_file()) / (1024**3), 2),
            "t9_free_bytes": disk_t9.free if disk_t9 else None,
            "t9_free_tib": round(disk_t9.free / (1024**4), 2) if disk_t9 else None,
        },
        "benchmark_ref": str(benchmark_path),
        "benchmark_scales": scales,
        "projections": projections,
        "recommended_next_steps": [
            "Scale feature store build in stages: 10k -> 20k -> 40k -> full stock+etf, measuring elapsed and RSS each run.",
            "Materialize multi-asof feature partitions next (not only latest row) to support walk-forward folds.",
            "Add fold manifests and replace Q1 proxy cheap-gate target with real time-split evaluation.",
            "Keep raw/snapshots on T9 and active feature/runs on Mac internal for compute speed; archive legacy ndjson on NAS.",
        ],
    }
    out_dir = quant_root / "runs" / "run_id=capacity_plan_latest"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "q1_capacity_plan_report.json"
    atomic_write_json(out_path, report)
    print(f"report={out_path}")
    print(json.dumps(report["storage"], ensure_ascii=False))
    if projections:
        print(json.dumps(projections, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

