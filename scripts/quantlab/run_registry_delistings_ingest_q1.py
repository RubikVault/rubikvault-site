#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]

if str(REPO_ROOT) not in os.sys.path:
    os.sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, stable_hash_obj, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--include-types", default="STOCK,ETF")
    p.add_argument("--ingest-date", default=date.today().isoformat())
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--min-staleness-bd", type=int, default=20)
    p.add_argument("--delist-return-used", type=float, default=-0.90)
    p.add_argument("--compression", default="snappy")
    p.add_argument("--job-name", default="")
    return p.parse_args(list(argv))


def _normalize_include_types(v: str) -> set[str]:
    return {x.strip().upper() for x in str(v or "").split(",") if x.strip()}


def _is_dead_registry_row(obj: dict[str, Any], min_staleness_bd: int) -> bool:
    comp = obj.get("computed") or {}
    layer = str(comp.get("layer") or "").upper()
    if layer == "L4_DEAD":
        return True
    staleness = comp.get("staleness_bd")
    try:
        if staleness is not None and int(staleness) >= int(min_staleness_bd):
            return True
    except Exception:
        pass
    flags = obj.get("flags")
    if isinstance(flags, list):
        fset = {str(x).strip().lower() for x in flags}
        if {"dead", "delisted", "inactive"} & fset:
            return True
    return False


def _load_registry_delistings(
    registry_path: Path,
    include_types: set[str],
    ingest_date: str,
    max_assets: int,
    min_staleness_bd: int,
    delist_return_used: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not registry_path.exists():
        return rows
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            tnorm = str(obj.get("type_norm") or "").upper()
            if include_types and tnorm not in include_types:
                continue
            if not _is_dead_registry_row(obj, min_staleness_bd=min_staleness_bd):
                continue
            cid = str(obj.get("canonical_id") or "").strip()
            if not cid:
                continue
            d = str(obj.get("last_trade_date") or "").strip()
            if not d:
                d = str(ingest_date)
            d = d[:10]
            code = "unknown"
            meta = obj.get("meta") or {}
            if isinstance(meta, dict):
                for k in ("delist_code", "status"):
                    v = meta.get(k)
                    if v:
                        code = str(v).strip().lower()
                        break
            row = {
                "asset_id": cid,
                "delist_date": d,
                "delist_code": code,
                "delist_return_raw": None,
                "delist_haircut_applied": True,
                "delist_return_used": float(delist_return_used),
                "delist_severity": "critical",
                "source_confidence": 0.70,
                "source_mode": "registry_dead_layer_inferred",
                "ingest_date": str(ingest_date),
            }
            rows.append(row)
            if int(max_assets) > 0 and len(rows) >= int(max_assets):
                break
    # dedup by asset_id latest date
    rows.sort(key=lambda r: (str(r["asset_id"]), str(r["delist_date"])))
    dedup: dict[str, dict[str, Any]] = {}
    for r in rows:
        dedup[str(r["asset_id"])] = r
    out = list(dedup.values())
    out.sort(key=lambda r: (str(r["delist_date"]), str(r["asset_id"])))
    return out


def _write_parquet(path: Path, rows: list[dict[str, Any]], compression: str) -> int:
    schema = pa.schema(
        [
            ("asset_id", pa.string()),
            ("delist_date", pa.string()),
            ("delist_code", pa.string()),
            ("delist_return_raw", pa.float64()),
            ("delist_haircut_applied", pa.bool_()),
            ("delist_return_used", pa.float64()),
            ("delist_severity", pa.string()),
            ("source_confidence", pa.float64()),
            ("source_mode", pa.string()),
            ("ingest_date", pa.string()),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        tbl = pa.Table.from_pylist([], schema=schema)
        pq.write_table(tbl, path, compression=compression)
        return 0
    tbl = pa.Table.from_pylist(rows, schema=schema)
    pq.write_table(tbl, path, compression=compression)
    return int(tbl.num_rows)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    repo_root = Path(args.repo_root).resolve()
    include_types = _normalize_include_types(args.include_types)
    registry_path = (repo_root / str(args.registry)).resolve()

    run_id = f"q1delist_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    status_path = run_root / "q1_registry_delistings_ingest_status.json"

    rows = _load_registry_delistings(
        registry_path=registry_path,
        include_types=include_types,
        ingest_date=str(args.ingest_date),
        max_assets=int(args.max_assets),
        min_staleness_bd=int(args.min_staleness_bd),
        delist_return_used=float(args.delist_return_used),
    )

    out_root = quant_root / "data" / "raw" / "provider=EODHD" / f"ingest_date={args.ingest_date}" / "delistings"
    out_path = out_root / f"part_{stable_hash_obj({'run_id': run_id, 'rows': len(rows)})[:16]}.parquet"
    rows_written = _write_parquet(out_path, rows, compression=str(args.compression))

    manifest = {
        "schema": "quantlab_q1_registry_delistings_ingest_manifest_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": True,
        "inputs": {
            "registry_path": str(registry_path),
            "include_types": sorted(include_types),
            "ingest_date": str(args.ingest_date),
            "min_staleness_bd": int(args.min_staleness_bd),
            "max_assets": int(args.max_assets),
            "delist_return_used": float(args.delist_return_used),
        },
        "stats": {
            "delistings_rows_written": int(rows_written),
        },
        "artifacts": {
            "delistings_parquet": str(out_path),
        },
    }
    job_name = str(args.job_name or f"q1_delistings_{str(args.ingest_date).replace('-', '')}")
    job_root = quant_root / "jobs" / job_name
    job_root.mkdir(parents=True, exist_ok=True)
    manifest_path = job_root / "manifest.json"
    atomic_write_json(manifest_path, manifest)

    status = {
        "schema": "quantlab_q1_registry_delistings_ingest_status_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": True,
        "exit_code": 0,
        "manifest_path": str(manifest_path),
        "stats": manifest["stats"],
        "artifact": str(out_path),
    }
    atomic_write_json(status_path, status)
    latest_ptr = quant_root / "ops" / "q1_registry_delistings_ingest" / "latest_success.json"
    atomic_write_json(
        latest_ptr,
        {
            "schema": "quantlab_q1_registry_delistings_latest_success_v1",
            "updated_at": utc_now_iso(),
            "run_id": run_id,
            "ok": True,
            "manifest_path": str(manifest_path),
            "status_path": str(status_path),
            "delistings_parquet": str(out_path),
        },
    )

    print(f"run_id={run_id}")
    print(f"manifest={manifest_path}")
    print(f"status={status_path}")
    print(f"delistings_rows_written={rows_written}")
    print("ok=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))

