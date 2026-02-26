#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
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
    p.add_argument("--sample-row-counts", action="store_true", help="Read parquet metadata for row counts (default on)", default=True)
    return p.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_snapshot_dir(quant_root)
    manifest_path = snap_dir / "snapshot_manifest.json"
    manifest = read_json(manifest_path)
    bars_root = Path((manifest.get("artifacts") or {}).get("bars_dataset_root") or "")
    if not bars_root.exists():
        raise SystemExit(f"FATAL: bars_dataset_root missing for snapshot {snap_dir}")

    files = sorted([p for p in bars_root.rglob("*.parquet") if p.is_file()])
    if not files:
        raise SystemExit(f"FATAL: no parquet files under {bars_root}")

    entries = []
    by_class_counts: dict[str, int] = {}
    by_class_rows: dict[str, int] = {}
    total_rows = 0
    for fp in files:
        rel = fp.relative_to(bars_root)
        asset_class = "unknown"
        ingest_date = ""
        for part in rel.parts:
            if part.startswith("asset_class="):
                asset_class = part.split("=", 1)[1].lower()
            elif part.startswith("ingest_date="):
                ingest_date = part.split("=", 1)[1]
        st = fp.stat()
        row_count = None
        schema_hash = None
        pf = pq.ParquetFile(fp)
        row_count = pf.metadata.num_rows
        schema_hash = stable_hash_obj([{"name": f.name, "type": str(f.type)} for f in pf.schema_arrow])
        total_rows += int(row_count)
        by_class_rows[asset_class] = by_class_rows.get(asset_class, 0) + int(row_count)
        by_class_counts[asset_class] = by_class_counts.get(asset_class, 0) + 1
        entries.append(
            {
                "rel_path": str(rel),
                "asset_class": asset_class,
                "ingest_date": ingest_date,
                "size_bytes": st.st_size,
                "mtime_ns": st.st_mtime_ns,
                "rows": int(row_count),
                "schema_hash": schema_hash,
                "sha256": stable_hash_file(fp),
            }
        )

    bars_manifest = {
        "schema": "quantlab_bars_dataset_manifest_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": manifest.get("snapshot_id"),
        "bars_dataset_root": str(bars_root),
        "counts": {
            "files_total": len(entries),
            "rows_total": total_rows,
            "files_by_asset_class": by_class_counts,
            "rows_by_asset_class": by_class_rows,
        },
        "entries": entries,
    }
    bars_manifest_path = snap_dir / "bars_dataset_manifest.json"
    atomic_write_json(bars_manifest_path, bars_manifest)

    # Keep ndjson companion for streaming-friendly downstream tooling
    ndjson_path = snap_dir / "bars_files_manifest.ndjson"
    with ndjson_path.open("w", encoding="utf-8") as fh:
        for rec in entries:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    manifest.setdefault("artifacts", {})
    manifest["artifacts"]["bars_dataset_manifest"] = str(bars_manifest_path)
    manifest["artifacts"]["bars_files_manifest_ndjson"] = str(ndjson_path)
    manifest.setdefault("hashes", {})
    manifest["hashes"]["bars_dataset_manifest_hash"] = stable_hash_file(bars_manifest_path)
    manifest["hashes"]["bars_files_manifest_ndjson_hash"] = stable_hash_file(ndjson_path)
    manifest["hashes"]["bars_dataset_content_hash"] = stable_hash_obj(
        [(e["rel_path"], e["size_bytes"], e["rows"], e["schema_hash"], e["sha256"]) for e in entries]
    )
    manifest.setdefault("counts", {})
    manifest["counts"]["bars_materialized_files_total"] = len(entries)
    manifest["counts"]["bars_materialized_rows_total"] = total_rows
    manifest["counts"]["bars_materialized_rows_by_asset_class"] = by_class_rows
    atomic_write_json(manifest_path, manifest)

    print(f"snapshot_id={manifest.get('snapshot_id')}")
    print(f"bars_files={len(entries)}")
    print(f"bars_rows_total={total_rows}")
    print(f"bars_dataset_manifest={bars_manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

