#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Iterable, Any

import polars as pl
import pyarrow.parquet as pq


BAR_COLS = ["asset_id", "date", "asset_class", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw"]
SOURCE_CANDIDATES = {
    "asset_id": ["asset_id", "canonical_id"],
    "date": ["date", "trading_date", "asof_date"],
    "asset_class": ["asset_class"],
    "open_raw": ["open_raw", "open"],
    "high_raw": ["high_raw", "high"],
    "low_raw": ["low_raw", "low"],
    "close_raw": ["close_raw", "close", "adj_close"],
    "volume_raw": ["volume_raw", "volume"],
}


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bucket Q1 daily delta rows for Breakout V12 local pass.")
    p.add_argument("--as-of", required=True)
    p.add_argument("--quant-root", default=os.environ.get("QUANT_ROOT", ""))
    p.add_argument("--delta-manifest", default="")
    p.add_argument("--raw-ingest-root", default="")
    p.add_argument("--output-root", required=True, help="Breakout daily-delta root; writes date=YYYY-MM-DD/bucket=NNN.parquet")
    p.add_argument("--bucket-count", type=int, default=128)
    p.add_argument("--compression", default="zstd")
    p.add_argument("--compression-level", type=int, default=3)
    p.add_argument("--batch-files", type=int, default=512)
    return p.parse_args(list(argv) if argv is not None else None)


def utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stable_bucket(asset_id: Any, bucket_count: int) -> int:
    h = hashlib.sha256(str(asset_id or "").encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") % int(bucket_count)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def write_parquet_atomic(df: pl.DataFrame, path: Path, *, compression: str, compression_level: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    df.write_parquet(tmp, compression=compression, compression_level=compression_level, statistics=True)
    tmp.replace(path)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve_delta_manifest(args: argparse.Namespace) -> Path:
    if args.delta_manifest:
        p = Path(args.delta_manifest)
        return p if p.is_absolute() else Path(args.quant_root) / p
    if not args.quant_root:
        raise FileNotFoundError("quant-root required when delta-manifest is not explicit")
    ptr = Path(args.quant_root) / "ops" / "q1_daily_delta_ingest" / "latest_success.json"
    if not ptr.exists():
        raise FileNotFoundError(f"q1 delta latest pointer missing: {ptr}")
    payload = read_json(ptr)
    manifest_path = payload.get("manifest_path")
    if not manifest_path:
        raise RuntimeError(f"manifest_path missing in {ptr}")
    return Path(str(manifest_path))


def normalize(df: pl.DataFrame) -> pl.DataFrame:
    cols = set(df.columns)
    rename = {}
    for src, dst in [
        ("canonical_id", "asset_id"),
        ("open", "open_raw"),
        ("high", "high_raw"),
        ("low", "low_raw"),
        ("close", "close_raw"),
        ("adj_close", "close_raw"),
        ("volume", "volume_raw"),
    ]:
        if dst not in cols and src in cols:
            rename[src] = dst
    if rename:
        df = df.rename(rename)
        cols = set(df.columns)
    if "date" not in cols:
        for alt in ["trading_date", "asof_date"]:
            if alt in cols:
                df = df.rename({alt: "date"})
                break
    for col, dtype in [
        ("asset_id", pl.Utf8),
        ("asset_class", pl.Utf8),
        ("date", pl.Utf8),
        ("open_raw", pl.Float64),
        ("high_raw", pl.Float64),
        ("low_raw", pl.Float64),
        ("close_raw", pl.Float64),
        ("volume_raw", pl.Float64),
    ]:
        if col not in df.columns:
            df = df.with_columns(pl.lit("unknown" if col == "asset_class" else None, dtype=dtype).alias(col))
    return (
        df.select(BAR_COLS)
        .with_columns(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("asset_class").cast(pl.Utf8).str.to_lowercase().fill_null("unknown"),
                pl.col("date").cast(pl.Utf8).str.slice(0, 10),
                pl.col("open_raw").cast(pl.Float64, strict=False),
                pl.col("high_raw").cast(pl.Float64, strict=False),
                pl.col("low_raw").cast(pl.Float64, strict=False),
                pl.col("close_raw").cast(pl.Float64, strict=False),
                pl.col("volume_raw").cast(pl.Float64, strict=False),
            ]
        )
        .filter(pl.col("asset_id").is_not_null() & pl.col("date").is_not_null())
    )


def read_delta_file(path: Path) -> pl.DataFrame:
    parquet = pq.ParquetFile(path)
    schema_names = set(parquet.schema_arrow.names)
    columns: set[str] = set()
    for candidates in SOURCE_CANDIDATES.values():
        for candidate in candidates:
            if candidate in schema_names:
                columns.add(candidate)
                break
    if not columns:
        return pl.DataFrame(schema=empty_schema())
    return normalize(pl.from_arrow(parquet.read(columns=sorted(columns))))


def empty_schema() -> dict[str, pl.DataType]:
    return {
        "asset_id": pl.Utf8,
        "date": pl.Utf8,
        "asset_class": pl.Utf8,
        "open_raw": pl.Float64,
        "high_raw": pl.Float64,
        "low_raw": pl.Float64,
        "close_raw": pl.Float64,
        "volume_raw": pl.Float64,
    }


def part_schema() -> dict[str, pl.DataType]:
    schema = empty_schema()
    schema["_bucket"] = pl.Int64
    schema["_source_order"] = pl.Int64
    return schema


def flush_parts(
    frames: list[pl.DataFrame],
    parts_root: Path,
    part_counts: dict[int, int],
    *,
    compression: str,
    compression_level: int,
) -> int:
    if not frames:
        return 0
    batch = pl.concat(frames, how="vertical_relaxed")
    rows = int(batch.height)
    if rows <= 0:
        return 0
    for bucket in sorted(batch["_bucket"].unique().to_list()):
        bucket_int = int(bucket)
        part_idx = int(part_counts.get(bucket_int, 0))
        out_path = parts_root / f"bucket={bucket_int:03d}" / f"part={part_idx:06d}.parquet"
        out_df = batch.filter(pl.col("_bucket") == bucket_int)
        write_parquet_atomic(
            out_df,
            out_path,
            compression=compression,
            compression_level=compression_level,
        )
        part_counts[bucket_int] = part_idx + 1
    return rows


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    started = time.time()
    manifest_path = resolve_delta_manifest(args).resolve()
    manifest = read_json(manifest_path)
    raw_root = Path(args.raw_ingest_root or manifest.get("raw_ingest_root") or "")
    if not raw_root.exists():
        raise SystemExit(f"FATAL: raw ingest root missing: {raw_root}")
    files = sorted(raw_root.glob("asset_class=*/delta_*.parquet"))
    if not files:
        raise SystemExit(f"FATAL: no q1 daily delta parquet files under {raw_root}")
    output_date_root = Path(args.output_root).resolve() / f"date={str(args.as_of)[:10]}"
    parts_root = output_date_root / ".parts" / f"prepare_{os.getpid()}_{uuid.uuid4().hex}"
    frames: list[pl.DataFrame] = []
    part_counts: dict[int, int] = {}
    total_rows = 0
    for idx, file in enumerate(files):
        df = read_delta_file(file).filter(pl.col("date") == str(args.as_of)[:10])
        if not df.is_empty():
            frames.append(
                df.with_columns(
                    [
                        pl.col("asset_id")
                        .map_elements(lambda value: stable_bucket(value, int(args.bucket_count)), return_dtype=pl.Int64)
                        .alias("_bucket"),
                        pl.lit(idx, dtype=pl.Int64).alias("_source_order"),
                    ]
                )
            )
        if len(frames) >= max(1, int(args.batch_files)):
            total_rows += flush_parts(
                frames,
                parts_root,
                part_counts,
                compression=args.compression,
                compression_level=int(args.compression_level),
            )
            frames = []
    total_rows += flush_parts(
        frames,
        parts_root,
        part_counts,
        compression=args.compression,
        compression_level=int(args.compression_level),
    )
    buckets = []
    for bucket in range(int(args.bucket_count)):
        part_glob = str(parts_root / f"bucket={bucket:03d}" / "part=*.parquet")
        if part_counts.get(bucket, 0):
            out_df = (
                pl.scan_parquet(part_glob)
                .select(BAR_COLS + ["_source_order"])
                .sort(["asset_id", "date", "_source_order"])
                .unique(["asset_id", "date"], keep="last")
                .drop("_source_order")
                .select(BAR_COLS)
                .collect()
            )
        else:
            out_df = pl.DataFrame(schema=empty_schema())
        out_path = output_date_root / f"bucket={bucket:03d}.parquet"
        write_parquet_atomic(out_df, out_path, compression=args.compression, compression_level=int(args.compression_level))
        buckets.append({"bucket": bucket, "path": str(out_path), "rows": int(out_df.height), "sha256": file_sha256(out_path)})
    try:
        shutil.rmtree(parts_root)
        parent = parts_root.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass
    summary = {
        "schema": "breakout_v12_daily_delta_manifest_v1",
        "generated_at": utc_now_iso(),
        "as_of": str(args.as_of)[:10],
        "source_delta_manifest": str(manifest_path),
        "raw_ingest_root": str(raw_root),
        "bucket_count": int(args.bucket_count),
        "counts": {"source_files": len(files), "rows": int(total_rows), "buckets": len(buckets)},
        "buckets": buckets,
        "wall_sec": round(time.time() - started, 3),
    }
    atomic_write_json(output_date_root / "daily_delta_manifest.json", summary)
    print(json.dumps({"ok": True, "manifest": str(output_date_root / "daily_delta_manifest.json"), "counts": summary["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
