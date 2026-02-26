#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Iterable

import pyarrow.dataset as ds
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_snapshot_dir,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--include-asset-classes", default="stock,etf,crypto,forex,bond,index")
    p.add_argument("--output-suffix", default="q1step2bars")
    p.add_argument("--copy-universe", action="store_true", default=True)
    return p.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        src_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        src_dir = latest_snapshot_dir(quant_root)
    src_manifest_path = src_dir / "snapshot_manifest.json"
    src_manifest = read_json(src_manifest_path)
    include_classes = [x.strip().lower() for x in args.include_asset_classes.split(",") if x.strip()]
    include_set = set(include_classes)

    if not src_manifest.get("artifacts", {}).get("bars_reference_root"):
        raise SystemExit(f"FATAL: snapshot has no bars_reference_root: {src_manifest_path}")

    ref_root = Path(src_manifest["artifacts"]["bars_reference_root"]).resolve()
    source_files_manifest = Path(src_manifest["artifacts"]["source_files_manifest"]).resolve()
    if not ref_root.exists() or not source_files_manifest.exists():
        raise SystemExit("FATAL: missing raw reference root or source_files_manifest")

    source_items = []
    with source_files_manifest.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if str(rec.get("asset_class") or "").lower() in include_set:
                source_items.append(rec)

    identity_obj = {
        "parent_snapshot_id": src_manifest["snapshot_id"],
        "source_files_hash": src_manifest["hashes"]["source_files_hash"],
        "include_asset_classes": sorted(include_set),
        "output_suffix": args.output_suffix,
    }
    snapshot_hash = stable_hash_obj(identity_obj)[:12]
    new_snapshot_id = f"{src_manifest['asof_date']}_{snapshot_hash}_{args.output_suffix}"
    dst_dir = quant_root / "data" / "snapshots" / f"snapshot_id={new_snapshot_id}"
    bars_dir = dst_dir / "bars"
    bars_dir.mkdir(parents=True, exist_ok=True)

    # Copy raw parquet files referenced by step1 manifest into snapshot-local bars dataset.
    # We preserve ingest_date/asset_class partition paths for traceability.
    copied = []
    for item in source_items:
        rel = Path(item["rel_path"])
        src_fp = ref_root / rel
        dst_fp = bars_dir / rel
        dst_fp.parent.mkdir(parents=True, exist_ok=True)
        if not dst_fp.exists() or dst_fp.stat().st_size != src_fp.stat().st_size:
            shutil.copy2(src_fp, dst_fp)
        copied.append(
            {
                "rel_path": str(rel),
                "size_bytes": dst_fp.stat().st_size,
                "mtime_ns": dst_fp.stat().st_mtime_ns,
            }
        )

    # Validate readable parquet dataset and capture row counts by class
    row_counts_by_class: dict[str, int] = {}
    bytes_by_class: dict[str, int] = {}
    parquet_files = sorted(bars_dir.rglob("*.parquet"))
    for fp in parquet_files:
        rel = fp.relative_to(bars_dir)
        asset_class = ""
        for part in rel.parts:
            if part.startswith("asset_class="):
                asset_class = part.split("=", 1)[1].lower()
                break
        pf = pq.ParquetFile(fp)
        row_counts_by_class[asset_class] = row_counts_by_class.get(asset_class, 0) + pf.metadata.num_rows
        bytes_by_class[asset_class] = bytes_by_class.get(asset_class, 0) + fp.stat().st_size

    # Write schema contract from actual dataset schema (first file)
    if not parquet_files:
        raise SystemExit("FATAL: no parquet files copied into snapshot bars dataset")
    first_pf = pq.ParquetFile(parquet_files[0])
    schema_contract = {
        "schema": "quantlab_bars_schema_contract_q1_v1",
        "generated_at": utc_now_iso(),
        "source_snapshot_id": src_manifest["snapshot_id"],
        "snapshot_id": new_snapshot_id,
        "columns": [{"name": f.name, "type": str(f.type)} for f in first_pf.schema_arrow],
        "dataset_root": str(bars_dir),
        "partitioning": ["ingest_date", "asset_class"],
        "notes": [
            "Q1 step 2 materialized bars dataset is a snapshot-local copy of raw parquet references.",
            "No row-level transformation is applied in this step.",
        ],
    }
    atomic_write_json(dst_dir / "bars_schema_contract.json", schema_contract)

    # Copy step1 artifacts for continuity
    if args.copy_universe and (src_dir / "universe.parquet").exists():
        shutil.copy2(src_dir / "universe.parquet", dst_dir / "universe.parquet")
    shutil.copy2(source_files_manifest, dst_dir / "source_files_manifest.ndjson")

    # Build manifest
    copied_manifest = {
        "source_snapshot_id": src_manifest["snapshot_id"],
        "snapshot_id": new_snapshot_id,
        "generated_at": utc_now_iso(),
        "copied_files_total": len(copied),
        "files": copied,
    }
    atomic_write_json(dst_dir / "bars_copy_manifest.json", copied_manifest)

    new_manifest = {
        **src_manifest,
        "schema": "quantlab_snapshot_manifest_q1_v2",
        "generated_at": utc_now_iso(),
        "snapshot_id": new_snapshot_id,
        "snapshot_mode": "materialized_bars_plus_universe",
    }
    new_manifest["artifacts"] = dict(src_manifest.get("artifacts") or {})
    new_manifest["artifacts"].update(
        {
            "bars_materialized": True,
            "bars_dataset_root": str(bars_dir),
            "bars_schema_contract": str(dst_dir / "bars_schema_contract.json"),
            "source_files_manifest": str(dst_dir / "source_files_manifest.ndjson"),
            "universe_parquet": str(dst_dir / "universe.parquet"),
            "bars_copy_manifest": str(dst_dir / "bars_copy_manifest.json"),
        }
    )
    new_manifest["counts"] = dict(src_manifest.get("counts") or {})
    new_manifest["counts"]["bars_materialized_rows_by_asset_class"] = row_counts_by_class
    new_manifest["counts"]["bars_materialized_rows_total"] = int(sum(row_counts_by_class.values()))
    new_manifest["counts"]["bars_materialized_bytes_by_asset_class"] = bytes_by_class
    new_manifest["counts"]["bars_materialized_files_total"] = len(parquet_files)
    new_manifest["hashes"] = dict(src_manifest.get("hashes") or {})
    new_manifest["hashes"]["bars_copy_manifest_hash"] = stable_hash_file(dst_dir / "bars_copy_manifest.json")
    new_manifest["hashes"]["bars_schema_contract_hash"] = stable_hash_file(dst_dir / "bars_schema_contract.json")
    # Manifest self hash is written after initial write
    atomic_write_json(dst_dir / "snapshot_manifest.json", new_manifest)
    new_manifest["hashes"]["manifest_hash_self_included"] = stable_hash_file(dst_dir / "snapshot_manifest.json")
    atomic_write_json(dst_dir / "snapshot_manifest.json", new_manifest)

    # Extra sanity: dataset can be scanned
    dataset = ds.dataset(str(bars_dir), format="parquet", partitioning="hive")
    _ = dataset.schema

    print(f"snapshot_id={new_snapshot_id}")
    print(f"snapshot_dir={dst_dir}")
    print(f"bars_files={len(parquet_files)}")
    print(f"bars_rows_total={new_manifest['counts']['bars_materialized_rows_total']}")
    print(f"classes={sorted(row_counts_by_class)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
