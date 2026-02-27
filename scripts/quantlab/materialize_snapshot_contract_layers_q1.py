#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, latest_snapshot_dir, read_json, stable_hash_file, utc_now_iso


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--force-empty", action="store_true", default=False)
    return p.parse_args(list(argv))


def _write_empty_parquet(path: Path, schema: pa.Schema) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tbl = pa.Table.from_pylist([], schema=schema)
    pq.write_table(tbl, path, compression="snappy")


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_snapshot_dir(quant_root)
    manifest_path = snap_dir / "snapshot_manifest.json"
    manifest = read_json(manifest_path)

    corp_schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("effective_date", pa.date32()),
            ("action_type", pa.string()),
            ("split_factor", pa.float64()),
            ("dividend_cash", pa.float64()),
            ("source_confidence", pa.float64()),
            ("ca_id", pa.string()),
        ]
    )
    delist_schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("delist_date", pa.date32()),
            ("delist_code", pa.string()),
            ("delist_return_raw", pa.float64()),
            ("delist_haircut_applied", pa.bool_()),
            ("delist_return_used", pa.float64()),
            ("delist_severity", pa.string()),
        ]
    )

    corp_path = snap_dir / "corp_actions.parquet"
    delist_path = snap_dir / "delistings.parquet"
    corp_rows = 0
    delist_rows = 0
    corp_mode = "empty_contracted_placeholder"
    delist_mode = "empty_contracted_placeholder"
    if args.force_empty:
        _write_empty_parquet(corp_path, corp_schema)
        _write_empty_parquet(delist_path, delist_schema)
    else:
        if corp_path.exists():
            try:
                corp_pf = pq.ParquetFile(corp_path)
                corp_rows = int(corp_pf.metadata.num_rows or 0)
                corp_mode = "preserved_existing_snapshot_layer"
            except Exception:
                _write_empty_parquet(corp_path, corp_schema)
                corp_rows = 0
                corp_mode = "repaired_to_empty_placeholder"
        else:
            _write_empty_parquet(corp_path, corp_schema)
            corp_rows = 0
            corp_mode = "empty_contracted_placeholder"

        if delist_path.exists():
            try:
                delist_pf = pq.ParquetFile(delist_path)
                delist_rows = int(delist_pf.metadata.num_rows or 0)
                delist_mode = "preserved_existing_snapshot_layer"
            except Exception:
                _write_empty_parquet(delist_path, delist_schema)
                delist_rows = 0
                delist_mode = "repaired_to_empty_placeholder"
        else:
            _write_empty_parquet(delist_path, delist_schema)
            delist_rows = 0
            delist_mode = "empty_contracted_placeholder"

    contract_info = {
        "schema": "quantlab_contract_layers_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": manifest.get("snapshot_id"),
        "force_empty": bool(args.force_empty),
        "corp_actions": {
            "path": str(corp_path),
            "rows": int(corp_rows),
            "schema": [{"name": f.name, "type": str(f.type)} for f in corp_schema],
            "source_mode": corp_mode,
            "reason": (
                "Preserved existing snapshot contract layer."
                if corp_mode == "preserved_existing_snapshot_layer"
                else "EODHD plan coverage for corp actions not integrated into Q1 snapshot pipeline yet"
            ),
        },
        "delistings": {
            "path": str(delist_path),
            "rows": int(delist_rows),
            "schema": [{"name": f.name, "type": str(f.type)} for f in delist_schema],
            "source_mode": delist_mode,
            "reason": (
                "Preserved existing snapshot contract layer."
                if delist_mode == "preserved_existing_snapshot_layer"
                else "Delisting feed integration deferred; contract established in Q1"
            ),
        },
    }
    contract_path = snap_dir / "contract_layers_manifest.json"
    atomic_write_json(contract_path, contract_info)

    manifest.setdefault("artifacts", {})
    manifest["artifacts"].update(
        {
            "corp_actions_parquet": str(corp_path),
            "delistings_parquet": str(delist_path),
            "contract_layers_manifest": str(contract_path),
        }
    )
    manifest.setdefault("counts", {})
    manifest["counts"]["corp_actions_rows_total"] = int(corp_rows)
    manifest["counts"]["delistings_rows_total"] = int(delist_rows)
    manifest.setdefault("hashes", {})
    manifest["hashes"]["contract_layers_manifest_hash"] = stable_hash_file(contract_path)
    manifest["hashes"]["corp_actions_hash"] = stable_hash_file(corp_path)
    manifest["hashes"]["delistings_hash"] = stable_hash_file(delist_path)
    atomic_write_json(manifest_path, manifest)

    print(f"snapshot_id={manifest.get('snapshot_id')}")
    print(f"corp_actions_rows={corp_rows} mode={corp_mode} path={corp_path}")
    print(f"delistings_rows={delist_rows} mode={delist_mode} path={delist_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
