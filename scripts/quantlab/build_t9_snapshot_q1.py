#!/usr/bin/env python3
"""
Q1 Snapshot Builder (v4.0 first implementation step)

Builds a deterministic snapshot folder on T9 from the exported raw parquet layer:
  /Volumes/T9/rubikvault-quantlab/data/raw/provider=EODHD/ingest_date=.../asset_class=.../*.parquet

This first step does NOT fully rematerialize bars into a new parquet dataset (to keep runtime/storage bounded).
Instead it writes:
  - snapshot_manifest.json (hashes, counts, source ranges)
  - source_files_manifest.ndjson (all referenced raw parquet files + row counts)
  - universe.parquet (tradeability snapshot scaffold from v7 registry)

The snapshot is reproducible and hash-addressed by source-file metadata + selected classes + asof_date.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"FATAL: pyarrow is required: {exc}")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    tmp.replace(path)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json_hash(obj) -> str:
    return sha256_hex(json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=os.getcwd())
    p.add_argument("--target-root", default="/Volumes/T9/rubikvault-quantlab")
    p.add_argument("--registry", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument("--asof-date", default=date.today().isoformat())
    p.add_argument("--ingest-dates", default="", help="Comma-separated ingest dates; default = all ingest_date dirs")
    p.add_argument(
        "--include-asset-classes",
        default="stock,etf,crypto,forex,bond,index",
        help="Comma-separated asset_class partitions from raw/ (lowercase names)",
    )
    p.add_argument("--snapshot-name", default="", help="Optional suffix label")
    return p.parse_args(list(argv))


@dataclass
class RawFileMeta:
    ingest_date: str
    asset_class: str
    rel_path: str
    abs_path: Path
    size_bytes: int
    mtime_ns: int
    rows: int
    columns: list[str]
    schema_hash: str


def list_raw_parquet_files(raw_provider_root: Path, ingest_dates: list[str], include_classes: set[str]) -> list[RawFileMeta]:
    files: list[RawFileMeta] = []
    for ingest_date in sorted(ingest_dates):
        base = raw_provider_root / f"ingest_date={ingest_date}"
        if not base.exists():
            continue
        for cls_dir in sorted(base.glob("asset_class=*")):
            asset_class = cls_dir.name.split("=", 1)[1].lower()
            if asset_class not in include_classes:
                continue
            for fp in sorted(cls_dir.glob("*.parquet")):
                st = fp.stat()
                pf = pq.ParquetFile(fp)
                schema = pf.schema_arrow
                files.append(
                    RawFileMeta(
                        ingest_date=ingest_date,
                        asset_class=asset_class,
                        rel_path=str(fp.relative_to(raw_provider_root)),
                        abs_path=fp,
                        size_bytes=st.st_size,
                        mtime_ns=st.st_mtime_ns,
                        rows=pf.metadata.num_rows,
                        columns=list(schema.names),
                        schema_hash=sha256_hex(str(schema).encode("utf-8")),
                    )
                )
    return files


def discover_ingest_dates(raw_provider_root: Path) -> list[str]:
    out = []
    for p in sorted(raw_provider_root.glob("ingest_date=*")):
        if p.is_dir():
            out.append(p.name.split("=", 1)[1])
    return out


def _last_num(lst):
    if not isinstance(lst, list) or not lst:
        return None
    for v in reversed(lst):
        try:
            if v is None:
                continue
            return float(v)
        except Exception:
            continue
    return None


def _adv20_dollar_from_row(o: dict) -> float | None:
    closes = o.get("_tmp_recent_closes") or []
    vols = o.get("_tmp_recent_volumes") or []
    vals = []
    if isinstance(closes, list) and isinstance(vols, list):
        for c, v in zip(closes[-20:], vols[-20:]):
            try:
                c = float(c)
                v = float(v)
                if c > 0 and v >= 0:
                    vals.append(c * v)
            except Exception:
                continue
    if vals:
        return float(sum(vals) / len(vals))
    try:
        px = _last_num(closes)
        avgv = float(o.get("avg_volume_30d") or 0.0)
        if px and px > 0 and avgv >= 0:
            return float(px * avgv)
    except Exception:
        return None
    return None


def liquidity_bucket(adv20_dollar: float | None, asset_class: str) -> str:
    if asset_class == "crypto":
        return "crypto"
    if adv20_dollar is None:
        return "unknown"
    if adv20_dollar >= 50_000_000:
        return "mega"
    if adv20_dollar >= 10_000_000:
        return "large"
    if adv20_dollar >= 2_000_000:
        return "mid"
    if adv20_dollar >= 250_000:
        return "small"
    return "micro"


def build_universe_rows(registry_path: Path, asof_date: str, include_classes: set[str], snapshot_id: str) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    counts = {
        "rows_total": 0,
        "rows_selected": 0,
        "by_asset_class": {},
        "eligible_entry": 0,
        "eligible_exit": 0,
    }
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            counts["rows_total"] += 1
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                continue
            type_norm = str(o.get("type_norm") or "").upper()
            asset_class = {
                "STOCK": "stock",
                "ETF": "etf",
                "CRYPTO": "crypto",
                "FOREX": "forex",
                "BOND": "bond",
                "INDEX": "index",
            }.get(type_norm)
            if not asset_class or asset_class not in include_classes:
                continue
            cid = str(o.get("canonical_id") or "").strip()
            if not cid:
                continue
            bars_count = int(o.get("bars_count") or 0)
            price_raw = _last_num(o.get("_tmp_recent_closes"))
            adv20_d = _adv20_dollar_from_row(o)
            history_pack = str(((o.get("pointers") or {}).get("history_pack")) or "").strip()
            has_pack = bool(history_pack)
            if not has_pack:
                elig_reason = "MISSING_HISTORY_PACK_POINTER"
                is_entry = False
                is_exit = False
            elif bars_count < 200:
                elig_reason = "INSUFFICIENT_BARS_LT_200"
                is_entry = False
                is_exit = True
            elif not price_raw or price_raw <= 0:
                elig_reason = "NONPOSITIVE_LATEST_PRICE"
                is_entry = False
                is_exit = True
            else:
                elig_reason = "OK"
                is_entry = True
                is_exit = True
            row = {
                "asset_id": cid,
                "asof_date": asof_date,
                "asset_class": asset_class,
                "symbol": str(o.get("symbol") or ""),
                "exchange": str(o.get("exchange") or ""),
                "currency": str(o.get("currency") or ""),
                "country": str(o.get("country") or ""),
                "price_raw": float(price_raw) if price_raw is not None else None,
                "bars_count": bars_count,
                "last_trade_date": str(o.get("last_trade_date") or ""),
                "adv20_dollar": float(adv20_d) if adv20_d is not None else None,
                "adv20_percentile": None,  # filled later
                "liquidity_bucket": "",    # filled later
                "is_entry_eligible": bool(is_entry),
                "is_exit_eligible": bool(is_exit),
                "eligibility_reason": elig_reason,
                "universe_version": snapshot_id,
                "universe_hash": "",
            }
            rows.append(row)
            counts["rows_selected"] += 1
            counts["by_asset_class"][asset_class] = counts["by_asset_class"].get(asset_class, 0) + 1
            counts["eligible_entry"] += int(is_entry)
            counts["eligible_exit"] += int(is_exit)

    # Percentiles + buckets by asset class
    for cls in sorted({r["asset_class"] for r in rows}):
        idxs = [i for i, r in enumerate(rows) if r["asset_class"] == cls]
        vals = [(i, rows[i]["adv20_dollar"]) for i in idxs if rows[i]["adv20_dollar"] is not None]
        vals_sorted = sorted(vals, key=lambda t: (t[1], rows[t[0]]["asset_id"]))
        n = len(vals_sorted)
        rank_map = {}
        for rank, (i, v) in enumerate(vals_sorted, start=1):
            rank_map[i] = (rank - 1) / (n - 1) if n > 1 else 1.0
        for i in idxs:
            rows[i]["adv20_percentile"] = float(rank_map.get(i)) if i in rank_map else None
            rows[i]["liquidity_bucket"] = liquidity_bucket(rows[i]["adv20_dollar"], cls)

    # Stable universe hash based on key fields
    hash_rows = [
        [
            r["asset_id"],
            r["asset_class"],
            r["last_trade_date"],
            r["bars_count"],
            r["eligibility_reason"],
            r["is_entry_eligible"],
            r["is_exit_eligible"],
        ]
        for r in sorted(rows, key=lambda x: x["asset_id"])
    ]
    uhash = stable_json_hash(hash_rows)
    for r in rows:
        r["universe_hash"] = uhash
    counts["universe_hash"] = uhash
    return rows, counts


def write_universe_parquet(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    schema = pa.schema([
        ("asset_id", pa.string()),
        ("asof_date", pa.string()),
        ("asset_class", pa.string()),
        ("symbol", pa.string()),
        ("exchange", pa.string()),
        ("currency", pa.string()),
        ("country", pa.string()),
        ("price_raw", pa.float64()),
        ("bars_count", pa.int32()),
        ("last_trade_date", pa.string()),
        ("adv20_dollar", pa.float64()),
        ("adv20_percentile", pa.float64()),
        ("liquidity_bucket", pa.string()),
        ("is_entry_eligible", pa.bool_()),
        ("is_exit_eligible", pa.bool_()),
        ("eligibility_reason", pa.string()),
        ("universe_version", pa.string()),
        ("universe_hash", pa.string()),
    ])
    cols = {name: [] for name in schema.names}
    for r in rows:
        for k in cols:
            cols[k].append(r.get(k))
    table = pa.Table.from_pydict(cols, schema=schema)
    pq.write_table(table, path, compression="snappy")


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    target_root = Path(args.target_root).resolve()
    raw_provider_root = target_root / "data" / "raw" / "provider=EODHD"
    registry_path = (repo_root / args.registry).resolve()
    if not raw_provider_root.exists():
        raise SystemExit(f"FATAL: raw root missing: {raw_provider_root}")
    if not registry_path.exists():
        raise SystemExit(f"FATAL: registry missing: {registry_path}")

    include_classes = {x.strip().lower() for x in args.include_asset_classes.split(",") if x.strip()}
    ingest_dates = [x.strip() for x in args.ingest_dates.split(",") if x.strip()] if args.ingest_dates else discover_ingest_dates(raw_provider_root)
    source_files = list_raw_parquet_files(raw_provider_root, ingest_dates, include_classes)
    if not source_files:
        raise SystemExit("FATAL: no raw parquet files found for selected ingest dates/classes")

    source_digest_input = [
        [f.rel_path, f.size_bytes, f.mtime_ns, f.rows, f.schema_hash]
        for f in source_files
    ]
    source_files_hash = stable_json_hash(source_digest_input)
    snapshot_suffix = args.snapshot_name.strip()
    snapshot_key = f"{args.asof_date}_{source_files_hash[:12]}"
    snapshot_id = f"{snapshot_key}_{snapshot_suffix}" if snapshot_suffix else snapshot_key
    snapshot_root = target_root / "data" / "snapshots" / f"snapshot_id={snapshot_id}"
    snapshot_root.mkdir(parents=True, exist_ok=True)

    # source files manifest (referenced raw parquet files)
    source_manifest_path = snapshot_root / "source_files_manifest.ndjson"
    with source_manifest_path.open("w", encoding="utf-8") as fh:
        for f in source_files:
            fh.write(
                json.dumps(
                    {
                        "rel_path": f.rel_path,
                        "ingest_date": f.ingest_date,
                        "asset_class": f.asset_class,
                        "size_bytes": f.size_bytes,
                        "mtime_ns": f.mtime_ns,
                        "rows": f.rows,
                        "schema_hash": f.schema_hash,
                        "columns": f.columns,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    universe_rows, universe_stats = build_universe_rows(registry_path, args.asof_date, include_classes, snapshot_id)
    universe_path = snapshot_root / "universe.parquet"
    write_universe_parquet(universe_path, universe_rows)

    # summary counts from source files
    counts_by_class = {}
    bytes_by_class = {}
    rows_by_class = {}
    minmax_ingest = [None, None]
    for f in source_files:
        counts_by_class[f.asset_class] = counts_by_class.get(f.asset_class, 0) + 1
        bytes_by_class[f.asset_class] = bytes_by_class.get(f.asset_class, 0) + int(f.size_bytes)
        rows_by_class[f.asset_class] = rows_by_class.get(f.asset_class, 0) + int(f.rows)
        if minmax_ingest[0] is None or f.ingest_date < minmax_ingest[0]:
            minmax_ingest[0] = f.ingest_date
        if minmax_ingest[1] is None or f.ingest_date > minmax_ingest[1]:
            minmax_ingest[1] = f.ingest_date

    manifest = {
        "schema": "quantlab_snapshot_manifest_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": snapshot_id,
        "asof_date": args.asof_date,
        "source_provider": "EODHD",
        "snapshot_mode": "referenced_raw_plus_universe",
        "repo_root": str(repo_root),
        "target_root": str(target_root),
        "registry_path": str(registry_path),
        "include_asset_classes": sorted(include_classes),
        "ingest_dates_selected": ingest_dates,
        "source_ranges": {
            "ingest_date_min": minmax_ingest[0],
            "ingest_date_max": minmax_ingest[1],
        },
        "hashes": {
            "source_files_hash": source_files_hash,
            "universe_hash": universe_stats.get("universe_hash"),
            "manifest_hash_self_excluded": None,
        },
        "counts": {
            "source_files_total": len(source_files),
            "source_files_by_asset_class": counts_by_class,
            "source_rows_by_asset_class": rows_by_class,
            "source_bytes_by_asset_class": bytes_by_class,
            "universe_rows_total": len(universe_rows),
            "universe_rows_by_asset_class": universe_stats.get("by_asset_class", {}),
            "eligible_entry": universe_stats.get("eligible_entry", 0),
            "eligible_exit": universe_stats.get("eligible_exit", 0),
        },
        "artifacts": {
            "source_files_manifest": str(source_manifest_path),
            "universe_parquet": str(universe_path),
            "bars_materialized": False,
            "bars_reference_root": str(raw_provider_root),
        },
        "notes": [
            "Q1 step 1: snapshot references raw parquet files and materializes universe only.",
            "Full bars rematerialization and corp_actions/delistings materialization are later steps.",
        ],
    }
    manifest["hashes"]["manifest_hash_self_excluded"] = stable_json_hash(
        {k: v for k, v in manifest.items() if k != "hashes"} | {"hashes": {"source_files_hash": manifest["hashes"]["source_files_hash"], "universe_hash": manifest["hashes"]["universe_hash"]}}
    )
    atomic_write_json(snapshot_root / "snapshot_manifest.json", manifest)

    print(
        json.dumps(
            {
                "snapshot_id": snapshot_id,
                "snapshot_root": str(snapshot_root),
                "source_files_total": len(source_files),
                "source_rows_total": sum(rows_by_class.values()),
                "universe_rows_total": len(universe_rows),
                "include_asset_classes": sorted(include_classes),
                "ingest_dates_selected": ingest_dates,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
