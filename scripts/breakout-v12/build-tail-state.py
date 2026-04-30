#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import resource
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Iterable, Any

import polars as pl


REQUIRED_OUTPUT_COLS = ["asset_id", "date", "asset_class", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw"]


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build initial Breakout V12 rolling tail-state. Manual/backfill job, not nightly.")
    p.add_argument("--history-root", required=True, help="Snapshot bars root or parquet directory/file")
    p.add_argument("--output-root", required=True, help="Output root containing state/tail-bars")
    p.add_argument("--as-of", default=date.today().isoformat())
    p.add_argument("--tail-bars", type=int, default=300)
    p.add_argument("--bucket-count", type=int, default=128)
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--batch-files", type=int, default=int(os.environ.get("RV_BREAKOUT_TAIL_BOOTSTRAP_BATCH_FILES", "4096") or "4096"))
    p.add_argument("--batch-bytes-mb", type=int, default=int(os.environ.get("RV_BREAKOUT_TAIL_BOOTSTRAP_BATCH_BYTES_MB", "128") or "128"))
    p.add_argument("--hard-rss-fail-mb", type=int, default=int(os.environ.get("RV_BREAKOUT_HARD_RSS_FAIL_MB", "5000") or "5000"))
    p.add_argument("--compression", default="zstd")
    p.add_argument("--compression-level", type=int, default=3)
    return p.parse_args(list(argv) if argv is not None else None)


def utc_now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rss_mb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if value > 10_000_000:
        return round(value / 1024 / 1024, 3)
    return round(value / 1024, 3)


def stable_bucket(asset_id: Any, bucket_count: int) -> int:
    h = hashlib.sha256(str(asset_id or "").encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") % int(bucket_count)


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


def parquet_glob(root: Path) -> str:
    if root.is_file():
        return str(root)
    return str(root / "**" / "*.parquet")


def parquet_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return sorted(root.rglob("*.parquet"))


def chunks(items: list[Path], max_files: int, max_bytes: int) -> Iterable[list[Path]]:
    limit_files = max(1, int(max_files or 1))
    limit_bytes = max(1, int(max_bytes or 1))
    batch: list[Path] = []
    batch_bytes = 0
    for item in items:
        try:
            size = item.stat().st_size
        except OSError:
            size = 0
        if batch and (len(batch) >= limit_files or batch_bytes + size > limit_bytes):
            yield batch
            batch = []
            batch_bytes = 0
        batch.append(item)
        batch_bytes += size
    if batch:
        yield batch


def first_existing(cols: set[str], candidates: list[str]) -> str | None:
    for col in candidates:
        if col in cols:
            return col
    return None


def expr(cols: set[str], candidates: list[str], alias: str, dtype: pl.DataType) -> pl.Expr:
    col = first_existing(cols, candidates)
    if col:
        return pl.col(col).cast(dtype, strict=False).alias(alias)
    if alias == "asset_class":
        return pl.lit("unknown", dtype=dtype).alias(alias)
    return pl.lit(None, dtype=dtype).alias(alias)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    started = time.time()
    history_root = Path(args.history_root).expanduser().resolve()
    output_root = Path(args.output_root).expanduser().resolve()
    state_root = output_root / "state" / "tail-bars"
    parts_root = output_root / "state" / ".tail-parts"
    manifest_path = output_root / "state" / "state_manifest.json"
    if not history_root.exists():
        raise SystemExit(f"FATAL: history-root not found: {history_root}")
    if int(args.bucket_count) <= 0:
        raise SystemExit("FATAL: bucket-count must be > 0")

    required = {
        "asset_id": ["asset_id", "canonical_id"],
        "date": ["date", "trading_date", "asof_date"],
        "open_raw": ["open_raw", "open"],
        "high_raw": ["high_raw", "high"],
        "low_raw": ["low_raw", "low"],
        "close_raw": ["close_raw", "close", "adj_close"],
        "volume_raw": ["volume_raw", "volume"],
    }
    files = parquet_files(history_root)
    if not files:
        raise SystemExit(f"FATAL: no parquet files under history-root: {history_root}")
    if parts_root.exists():
        shutil.rmtree(parts_root)
    parts_root.mkdir(parents=True, exist_ok=True)
    selected_assets: set[str] = set()
    max_assets = int(args.max_assets or 0)
    processed_files = 0
    part_counts: dict[int, int] = {}
    max_batch_bytes = int(args.batch_bytes_mb) * 1024 * 1024
    for batch_index, batch in enumerate(chunks(files, int(args.batch_files), max_batch_bytes)):
        scan = pl.scan_parquet(
            [str(p) for p in batch],
            hive_partitioning=True,
            missing_columns="insert",
            extra_columns="ignore",
        )
        cols = set(scan.collect_schema().names())
        missing = [name for name, candidates in required.items() if not first_existing(cols, candidates)]
        if missing:
            raise SystemExit(f"FATAL: history parquet missing columns in batch starting {batch[0]}: {missing}")
        lf = (
            scan.select(
                [
                    expr(cols, required["asset_id"], "asset_id", pl.Utf8),
                    expr(cols, required["date"], "date_raw", pl.Utf8),
                    expr(cols, ["asset_class", "asset_type", "type"], "asset_class", pl.Utf8),
                    expr(cols, required["open_raw"], "open_raw", pl.Float64),
                    expr(cols, required["high_raw"], "high_raw", pl.Float64),
                    expr(cols, required["low_raw"], "low_raw", pl.Float64),
                    expr(cols, required["close_raw"], "close_raw", pl.Float64),
                    expr(cols, required["volume_raw"], "volume_raw", pl.Float64),
                ]
            )
            .with_columns(
                [
                    pl.col("asset_class").str.to_lowercase().fill_null("unknown"),
                    pl.col("date_raw").str.strptime(pl.Date, strict=False).alias("date"),
                ]
            )
            .drop("date_raw")
            .filter(pl.col("asset_id").is_not_null())
            .filter(pl.col("date").is_not_null())
            .filter(pl.col("date") <= pl.lit(str(args.as_of)[:10]).str.strptime(pl.Date))
            .with_columns(
                pl.col("asset_id")
                .map_elements(lambda value: stable_bucket(value, int(args.bucket_count)), return_dtype=pl.Int64)
                .alias("_bucket")
            )
        )
        batch_df = lf.collect(engine="streaming")
        if batch_df.is_empty():
            processed_files += len(batch)
            continue
        if max_assets > 0:
            for asset_id in batch_df.select("asset_id").unique().sort("asset_id")["asset_id"].to_list():
                if len(selected_assets) >= max_assets:
                    break
                selected_assets.add(str(asset_id))
            batch_df = batch_df.filter(pl.col("asset_id").is_in(sorted(selected_assets)))
        batch_df = (
            batch_df.sort(["_bucket", "asset_id", "date"])
            .group_by(["_bucket", "asset_id"], maintain_order=True)
            .tail(int(args.tail_bars))
        )
        for bucket_id in batch_df.select("_bucket").unique()["_bucket"].to_list():
            bucket_int = int(bucket_id)
            next_df = batch_df.filter(pl.col("_bucket") == bucket_int).drop("_bucket").select(REQUIRED_OUTPUT_COLS)
            part_dir = parts_root / f"bucket={bucket_int:03d}"
            part_path = part_dir / f"part={batch_index:06d}.parquet"
            write_parquet_atomic(next_df, part_path, compression=args.compression, compression_level=int(args.compression_level))
            part_counts[bucket_int] = part_counts.get(bucket_int, 0) + 1
        processed_files += len(batch)
        if rss_mb() > float(args.hard_rss_fail_mb):
            raise SystemExit(f"FATAL: hard RSS budget exceeded during bootstrap: rss_mb={rss_mb()} limit_mb={args.hard_rss_fail_mb}")
    bucket_entries: list[dict[str, Any]] = []
    total_rows = 0
    total_assets = 0
    for bucket_id in range(int(args.bucket_count)):
        part_files = sorted((parts_root / f"bucket={bucket_id:03d}").glob("part=*.parquet"))
        if not part_files:
            out_df = pl.DataFrame(schema={
                "asset_id": pl.Utf8,
                "date": pl.Date,
                "asset_class": pl.Utf8,
                "open_raw": pl.Float64,
                "high_raw": pl.Float64,
                "low_raw": pl.Float64,
                "close_raw": pl.Float64,
                "volume_raw": pl.Float64,
            })
        else:
            out_df = (
                pl.scan_parquet([str(p) for p in part_files], missing_columns="insert", extra_columns="ignore")
                .sort(["asset_id", "date"])
                .group_by("asset_id", maintain_order=True)
                .tail(int(args.tail_bars))
                .select(REQUIRED_OUTPUT_COLS)
                .collect(engine="streaming")
            )
        out_path = state_root / f"bucket={bucket_id:03d}.parquet"
        write_parquet_atomic(out_df.select(REQUIRED_OUTPUT_COLS), out_path, compression=args.compression, compression_level=int(args.compression_level))
        rows = int(out_df.height)
        assets = int(out_df.select("asset_id").unique().height) if rows else 0
        total_rows += rows
        total_assets += assets
        bucket_entries.append(
            {
                "bucket": bucket_id,
                "path": str(out_path),
                "rows": rows,
                "assets": assets,
                "sha256": file_sha256(out_path),
                "part_files": int(part_counts.get(bucket_id, 0)),
            }
        )

    manifest = {
        "schema": "breakout_v12_tail_state_manifest_v1",
        "generated_at": utc_now_iso(),
        "mode": "initial_backfill_not_nightly",
        "as_of": str(args.as_of)[:10],
        "history_root": str(history_root),
        "tail_bars": int(args.tail_bars),
        "bucket_count": int(args.bucket_count),
        "batch_files": int(args.batch_files),
        "batch_bytes_mb": int(args.batch_bytes_mb),
        "counts": {
            "rows": total_rows,
            "assets": total_assets,
            "buckets": len(bucket_entries),
            "source_files": len(files),
            "processed_files": processed_files,
            "part_files": sum(part_counts.values()),
        },
        "buckets": bucket_entries,
        "wall_sec": round(time.time() - started, 3),
    }
    atomic_write_json(manifest_path, manifest)
    shutil.rmtree(parts_root, ignore_errors=True)
    print(json.dumps({"ok": True, "manifest": str(manifest_path), "counts": manifest["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
