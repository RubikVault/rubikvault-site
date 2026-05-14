#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import sys
import time
import uuid
from pathlib import Path
from typing import Iterable, Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.breakout_compute.lib.breakout_math import (  # noqa: E402
    absorption_vol_ratio,
    cluster_support_zone,
    clv_series,
    cmf_series,
    count_failed_lows,
    detect_pivots,
    obv_higher_low,
    safe_div,
    trend_slope,
)


BAR_COLS = ["asset_id", "date", "asset_class", "open_raw", "high_raw", "low_raw", "close_raw", "volume_raw"]


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Breakout V12 local daily pass. Reads exact tail+delta bucket files.")
    p.add_argument("--as-of", required=True)
    p.add_argument("--candidate-root", required=True)
    p.add_argument("--last-good-root", required=True)
    p.add_argument("--daily-delta-root", required=True)
    p.add_argument("--bucket-count", type=int, default=128)
    p.add_argument("--tail-bars", type=int, default=300)
    p.add_argument("--bucket", type=int, default=-1, help="Optional single bucket")
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


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def append_ndjson(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, sort_keys=True) + "\n")


def write_parquet_atomic(df: pl.DataFrame, path: Path, *, compression: str, compression_level: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    df.write_parquet(tmp, compression=compression, compression_level=compression_level, statistics=True)
    tmp.replace(path)


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
    for col, dtype in [
        ("asset_id", pl.Utf8),
        ("asset_class", pl.Utf8),
        ("open_raw", pl.Float64),
        ("high_raw", pl.Float64),
        ("low_raw", pl.Float64),
        ("close_raw", pl.Float64),
        ("volume_raw", pl.Float64),
    ]:
        if col not in cols:
            if col == "asset_class":
                df = df.with_columns(pl.lit("unknown", dtype=dtype).alias(col))
            else:
                df = df.with_columns(pl.lit(None, dtype=dtype).alias(col))
    if "date" not in cols:
        for alt in ["trading_date", "asof_date"]:
            if alt in cols:
                df = df.rename({alt: "date"})
                break
    return (
        df.select(BAR_COLS)
        .with_columns(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("asset_class").cast(pl.Utf8).str.to_lowercase().fill_null("unknown"),
                pl.col("date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("open_raw").cast(pl.Float64, strict=False),
                pl.col("high_raw").cast(pl.Float64, strict=False),
                pl.col("low_raw").cast(pl.Float64, strict=False),
                pl.col("close_raw").cast(pl.Float64, strict=False),
                pl.col("volume_raw").cast(pl.Float64, strict=False),
            ]
        )
        .filter(pl.col("asset_id").is_not_null() & pl.col("date").is_not_null())
    )


def empty_features_schema() -> dict[str, pl.DataType]:
    return {
        "asset_id": pl.Utf8,
        "date": pl.Date,
        "as_of": pl.Utf8,
        "asset_class": pl.Utf8,
        "bucket": pl.Int64,
        "open_raw": pl.Float64,
        "high_raw": pl.Float64,
        "low_raw": pl.Float64,
        "close_raw": pl.Float64,
        "volume_raw": pl.Float64,
        "ret_20d": pl.Float64,
        "ret_63d": pl.Float64,
        "sma_50": pl.Float64,
        "sma_200": pl.Float64,
        "atr_14": pl.Float64,
        "atr_pct_14": pl.Float64,
        "adv20_dollar": pl.Float64,
        "rvol20": pl.Float64,
        "resistance_level": pl.Float64,
        "distance_to_resistance_atr": pl.Float64,
        "price_position_20d_range": pl.Float64,
        "rvol_percentile_asset_252d": pl.Float64,
        "atr_compression_percentile_252d": pl.Float64,
        "recent_signal_count_20d": pl.Int64,
        "_rows_in_window": pl.Int64,
        "history_bars_used": pl.Int64,
        "atr_pct_est_history": pl.Float64,
        "support_zone_detected": pl.Boolean,
        "support_zone_center": pl.Float64,
        "support_zone_low": pl.Float64,
        "support_zone_high": pl.Float64,
        "support_zone_width_pct": pl.Float64,
        "support_test_count": pl.Int64,
        "base_age_bars": pl.Int64,
        "failed_low_count": pl.Int64,
        "absorption_vol_ratio": pl.Float64,
        "clv_trend_20": pl.Float64,
        "cmf_recent_20": pl.Float64,
        "obv_higher_low": pl.Boolean,
        "up_down_volume_ratio_20": pl.Float64,
    }


def compute_history_features(data: pl.DataFrame, *, tail_bars: int) -> pl.DataFrame:
    schema = {
        "asset_id": pl.Utf8,
        "history_bars_used": pl.Int64,
        "atr_pct_est_history": pl.Float64,
        "support_zone_detected": pl.Boolean,
        "support_zone_center": pl.Float64,
        "support_zone_low": pl.Float64,
        "support_zone_high": pl.Float64,
        "support_zone_width_pct": pl.Float64,
        "support_test_count": pl.Int64,
        "base_age_bars": pl.Int64,
        "failed_low_count": pl.Int64,
        "absorption_vol_ratio": pl.Float64,
        "clv_trend_20": pl.Float64,
        "cmf_recent_20": pl.Float64,
        "obv_higher_low": pl.Boolean,
        "up_down_volume_ratio_20": pl.Float64,
    }
    if data.is_empty():
        return pl.DataFrame(schema=schema)

    rows: list[dict[str, Any]] = []
    history_df = data.sort(["asset_id", "date"]).group_by("asset_id", maintain_order=True).tail(tail_bars)
    for asset_id, group_df in history_df.group_by("asset_id", maintain_order=True):
        aid = asset_id[0] if isinstance(asset_id, tuple) else asset_id
        opens = group_df["open_raw"].to_list()
        highs = group_df["high_raw"].to_list()
        lows = group_df["low_raw"].to_list()
        closes = group_df["close_raw"].to_list()
        volumes = group_df["volume_raw"].to_list()
        n = len(closes)
        if n < 60:
            rows.append({
                "asset_id": str(aid),
                "history_bars_used": n,
                "atr_pct_est_history": None,
                "support_zone_detected": False,
                "support_zone_center": None,
                "support_zone_low": None,
                "support_zone_high": None,
                "support_zone_width_pct": None,
                "support_test_count": 0,
                "base_age_bars": 0,
                "failed_low_count": 0,
                "absorption_vol_ratio": None,
                "clv_trend_20": None,
                "cmf_recent_20": None,
                "obv_higher_low": False,
                "up_down_volume_ratio_20": None,
            })
            continue

        pivot_high, pivot_low = detect_pivots(highs, lows, left=3, right=3)
        recent_close = closes[-14:]
        recent_high = highs[-14:]
        recent_low = lows[-14:]
        trs: list[float] = []
        for i in range(1, len(recent_close)):
            h = recent_high[i] if recent_high[i] is not None else recent_close[i]
            l = recent_low[i] if recent_low[i] is not None else recent_close[i]
            pc = recent_close[i - 1]
            if h is None or l is None or pc is None:
                continue
            trs.append(max(float(h) - float(l), abs(float(h) - float(pc)), abs(float(l) - float(pc))))
        close_window = [float(c) for c in closes[-20:] if c is not None]
        mean_close = sum(close_window) / max(1, len(close_window))
        atr_pct_est = safe_div(sum(trs) / max(1, len(trs)), mean_close, 0.02)

        zone = cluster_support_zone(pivot_low, atr_pct=atr_pct_est, lookback=min(120, n))
        failed_low_count = count_failed_lows(lows, closes, pivot_low, lookback=80)
        clv = clv_series(highs, lows, closes)
        cmf = cmf_series(highs, lows, closes, volumes, window=20)

        up_v = 0.0
        down_v = 0.0
        for i in range(max(0, n - 20), n):
            o = opens[i]
            c = closes[i]
            v = volumes[i]
            if o is None or c is None or v is None:
                continue
            if float(c) >= float(o):
                up_v += float(v)
            else:
                down_v += float(v)

        base_age = 0
        if zone.get("detected"):
            first_test = int(zone.get("first_test_index") or 0)
            base_age = max(0, n - 1 - first_test)

        rows.append({
            "asset_id": str(aid),
            "history_bars_used": n,
            "atr_pct_est_history": float(atr_pct_est),
            "support_zone_detected": bool(zone.get("detected", False)),
            "support_zone_center": float(zone.get("center")) if zone.get("center") is not None else None,
            "support_zone_low": float(zone.get("low")) if zone.get("low") is not None else None,
            "support_zone_high": float(zone.get("high")) if zone.get("high") is not None else None,
            "support_zone_width_pct": float(zone.get("width_pct") or 0.0),
            "support_test_count": int(zone.get("test_count") or 0),
            "base_age_bars": int(base_age),
            "failed_low_count": int(failed_low_count),
            "absorption_vol_ratio": float(absorption_vol_ratio(opens, closes, volumes, window=40)),
            "clv_trend_20": float(trend_slope(clv, lookback=20)),
            "cmf_recent_20": float(cmf[-1] if cmf else 0.0),
            "obv_higher_low": bool(obv_higher_low(closes, volumes, lookback=60)),
            "up_down_volume_ratio_20": float(safe_div(up_v, down_v, 1.0)),
        })
    return pl.DataFrame(rows, schema=schema) if rows else pl.DataFrame(schema=schema)


def compute_features(data: pl.DataFrame, *, as_of: str, bucket_id: int, tail_bars: int) -> pl.DataFrame:
    if data.is_empty():
        return pl.DataFrame(schema=empty_features_schema())
    data = data.sort(["asset_id", "date"])
    history_features = compute_history_features(data, tail_bars=tail_bars)
    prev_close = pl.col("close_raw").shift(1).over("asset_id")
    tr = pl.max_horizontal(
        (pl.col("high_raw") - pl.col("low_raw")).abs(),
        (pl.col("high_raw") - prev_close).abs(),
        (pl.col("low_raw") - prev_close).abs(),
    )
    vol_base = pl.col("volume_raw").shift(1).rolling_mean(20).over("asset_id")
    high20 = pl.col("high_raw").rolling_max(20).over("asset_id")
    low20 = pl.col("low_raw").rolling_min(20).over("asset_id")
    resistance = pl.col("high_raw").shift(1).rolling_max(63).over("asset_id")
    feat = (
        data.with_columns(
            [
                (pl.col("close_raw") / prev_close - 1.0).alias("ret_1d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(20).over("asset_id") - 1.0).alias("ret_20d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(63).over("asset_id") - 1.0).alias("ret_63d"),
                pl.col("close_raw").rolling_mean(50).over("asset_id").alias("sma_50"),
                pl.col("close_raw").rolling_mean(200).over("asset_id").alias("sma_200"),
                tr.rolling_mean(14).over("asset_id").alias("atr_14"),
                (tr.rolling_mean(14).over("asset_id") / pl.col("close_raw")).alias("atr_pct_14"),
                (pl.col("close_raw") * pl.col("volume_raw")).rolling_mean(20).over("asset_id").alias("adv20_dollar"),
                (pl.col("volume_raw") / pl.when(vol_base > 0).then(vol_base).otherwise(None)).alias("rvol20"),
                resistance.alias("resistance_level"),
                high20.alias("_high20"),
                low20.alias("_low20"),
                pl.len().over("asset_id").alias("_rows_in_window"),
            ]
        )
        .with_columns(
            [
                ((pl.col("resistance_level") - pl.col("close_raw")) / pl.when(pl.col("atr_14") > 0).then(pl.col("atr_14")).otherwise(None)).alias("distance_to_resistance_atr"),
                ((pl.col("close_raw") - pl.col("_low20")) / pl.when((pl.col("_high20") - pl.col("_low20")) > 0).then(pl.col("_high20") - pl.col("_low20")).otherwise(None)).clip(0.0, 1.0).alias("price_position_20d_range"),
            ]
        )
        .with_columns(
            [
                (
                    pl.col("rvol20").rolling_rank(252, min_samples=20).over("asset_id")
                    / pl.when(pl.col("rvol20").is_not_null().cast(pl.Float64).rolling_sum(252).over("asset_id") > 0)
                    .then(pl.col("rvol20").is_not_null().cast(pl.Float64).rolling_sum(252).over("asset_id"))
                    .otherwise(None)
                ).clip(0.0, 1.0).alias("rvol_percentile_asset_252d"),
                (
                    pl.col("atr_pct_14").rolling_rank(252, min_samples=20).over("asset_id")
                    / pl.when(pl.col("atr_pct_14").is_not_null().cast(pl.Float64).rolling_sum(252).over("asset_id") > 0)
                    .then(pl.col("atr_pct_14").is_not_null().cast(pl.Float64).rolling_sum(252).over("asset_id"))
                    .otherwise(None)
                ).clip(0.0, 1.0).alias("atr_compression_percentile_252d"),
                (
                    (
                        (pl.col("distance_to_resistance_atr") <= 0.5)
                        & (pl.col("rvol20") >= 1.2)
                        & (pl.col("price_position_20d_range") >= 0.8)
                    )
                    .cast(pl.Int64)
                    .rolling_sum(20)
                    .over("asset_id")
                ).alias("recent_signal_count_20d"),
            ]
        )
        .filter(pl.col("date") == pl.lit(as_of).str.strptime(pl.Date))
        .with_columns([pl.lit(as_of).alias("as_of"), pl.lit(bucket_id).alias("bucket")])
        .join(history_features, on="asset_id", how="left")
        .select(list(empty_features_schema().keys()))
        .sort("asset_id")
    )
    return feat


def bucket_delta_path(root: Path, as_of: str, bucket_id: int) -> Path:
    dated = root / f"date={as_of}" / f"bucket={bucket_id:03d}.parquet"
    if dated.exists():
        return dated
    return root / f"bucket={bucket_id:03d}.parquet"


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    candidate_root = Path(args.candidate_root).resolve()
    last_good_root = Path(args.last_good_root).resolve()
    daily_delta_root = Path(args.daily_delta_root).resolve()
    resources_path = candidate_root / "resources.ndjson"
    local_manifest_entries: list[dict[str, Any]] = []
    bucket_ids = [int(args.bucket)] if int(args.bucket) >= 0 else list(range(int(args.bucket_count)))

    for bucket_id in bucket_ids:
        started = time.time()
        tail_path = last_good_root / "state" / "tail-bars" / f"bucket={bucket_id:03d}.parquet"
        delta_path = bucket_delta_path(daily_delta_root, str(args.as_of)[:10], bucket_id)
        local_path = candidate_root / "local" / f"date={str(args.as_of)[:10]}" / f"bucket={bucket_id:03d}.parquet"
        next_tail_path = candidate_root / "state" / "tail-bars" / f"bucket={bucket_id:03d}.parquet"
        if not tail_path.exists():
            raise SystemExit(f"FATAL: tail bucket missing: {tail_path}")
        if not delta_path.exists():
            raise SystemExit(f"FATAL: delta bucket missing: {delta_path}")
        tail = normalize(pl.read_parquet(tail_path))
        delta = normalize(pl.read_parquet(delta_path))
        data = pl.concat([tail, delta], how="vertical_relaxed").unique(["asset_id", "date"], keep="last").sort(["asset_id", "date"])
        features = compute_features(data, as_of=str(args.as_of)[:10], bucket_id=bucket_id, tail_bars=int(args.tail_bars))
        next_tail = data.group_by("asset_id", maintain_order=True).tail(int(args.tail_bars)).sort(["asset_id", "date"])

        write_parquet_atomic(features, local_path, compression=args.compression, compression_level=int(args.compression_level))
        write_parquet_atomic(next_tail.select(BAR_COLS), next_tail_path, compression=args.compression, compression_level=int(args.compression_level))
        success_path = local_path.with_suffix("._SUCCESS")
        success_path.write_text("ok\n", encoding="utf-8")
        entry = {
            "bucket": bucket_id,
            "tail_path": str(tail_path),
            "delta_path": str(delta_path),
            "local_path": str(local_path),
            "next_tail_path": str(next_tail_path),
            "rows_in": int(data.height),
            "rows_out": int(features.height),
            "tail_rows_out": int(next_tail.height),
            "asset_count": int(data.select("asset_id").unique().height) if not data.is_empty() else 0,
            "local_sha256": file_sha256(local_path),
            "tail_sha256": file_sha256(next_tail_path),
            "status": "ok",
            "wall_sec": round(time.time() - started, 3),
            "peak_rss_mb": rss_mb(),
        }
        local_manifest_entries.append(entry)
        append_ndjson(resources_path, {"step": "local", **entry})

    manifest = {
        "schema": "breakout_v12_local_manifest_v1",
        "generated_at": utc_now_iso(),
        "as_of": str(args.as_of)[:10],
        "bucket_count": int(args.bucket_count),
        "tail_bars": int(args.tail_bars),
        "buckets": local_manifest_entries,
        "counts": {
            "buckets": len(local_manifest_entries),
            "rows_out": sum(int(x["rows_out"]) for x in local_manifest_entries),
            "tail_rows_out": sum(int(x["tail_rows_out"]) for x in local_manifest_entries),
        },
    }
    write_json_atomic(candidate_root / "local" / f"date={str(args.as_of)[:10]}" / "local_manifest.json", manifest)
    print(json.dumps({"ok": True, "manifest": str(candidate_root / "local" / f"date={str(args.as_of)[:10]}" / "local_manifest.json"), "counts": manifest["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
