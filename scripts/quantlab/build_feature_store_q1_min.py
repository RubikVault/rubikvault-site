#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, latest_snapshot_dir, parse_iso_date, read_json, stable_hash_file, stable_hash_obj, utc_now_iso


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--feature-store-version", default="v4_q1min")
    p.add_argument("--output-tag", default="latest_only")
    p.add_argument("--max-assets", type=int, default=20000, help="0 = all; otherwise top-liquid assets from universe.parquet")
    return p.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_snapshot_dir(quant_root)
    manifest = read_json(snap_dir / "snapshot_manifest.json")
    snapshot_id = manifest["snapshot_id"]
    asof_date = parse_iso_date(manifest["asof_date"])
    include_classes = [x.strip().lower() for x in args.asset_classes.split(",") if x.strip()]
    include_set = set(include_classes)
    bars_dataset_root_value = (manifest.get("artifacts") or {}).get("bars_dataset_root")
    if not bars_dataset_root_value:
        raise SystemExit(f"FATAL: bars_dataset_root missing in {snap_dir / 'snapshot_manifest.json'}")
    bars_root = Path(str(bars_dataset_root_value))
    if not bars_root.exists():
        raise SystemExit(f"FATAL: bars_dataset_root missing or not found in {snap_dir / 'snapshot_manifest.json'}")
    universe_path = Path((manifest.get("artifacts") or {}).get("universe_parquet") or (snap_dir / "universe.parquet"))
    if not universe_path.exists():
        raise SystemExit(f"FATAL: universe.parquet not found for snapshot {snapshot_id}")

    allow_asset_ids: list[str] | None = None
    if args.max_assets and args.max_assets > 0:
        udf = pl.read_parquet(universe_path)
        udf = (
            udf.filter(pl.col("asset_class").is_in(include_classes))
            .with_columns(pl.col("adv20_dollar").fill_null(-1.0))
            .sort(["adv20_dollar", "bars_count"], descending=[True, True])
            .select("asset_id")
            .head(args.max_assets)
        )
        allow_asset_ids = udf["asset_id"].to_list()

    start_date = (asof_date - timedelta(days=args.lookback_calendar_days)).isoformat()
    asof_s = asof_date.isoformat()
    bars_glob = str(bars_root / "**" / "*.parquet")

    lf = (
        pl.scan_parquet(bars_glob, hive_partitioning=True)
        .with_columns(
            [
                pl.col("asset_class").str.to_lowercase(),
                pl.col("date").str.strptime(pl.Date, strict=False),
                pl.col("open_raw").cast(pl.Float64),
                pl.col("high_raw").cast(pl.Float64),
                pl.col("low_raw").cast(pl.Float64),
                pl.col("close_raw").cast(pl.Float64),
                pl.col("volume_raw").cast(pl.Float64),
            ]
        )
        .filter(pl.col("asset_class").is_in(include_classes))
        .filter(pl.col("date") >= pl.lit(start_date).str.strptime(pl.Date))
        .filter(pl.col("date") < pl.lit(asof_s).str.strptime(pl.Date))
        .sort(["asset_id", "date"])
    )
    if allow_asset_ids:
        lf = lf.filter(pl.col("asset_id").is_in(allow_asset_ids))

    prev_close = pl.col("close_raw").shift(1).over("asset_id")
    delta = (pl.col("close_raw") - prev_close)
    gain = pl.when(delta > 0).then(delta).otherwise(0.0)
    loss = pl.when(delta < 0).then(-delta).otherwise(0.0)
    tr = pl.max_horizontal(
        (pl.col("high_raw") - pl.col("low_raw")).abs(),
        (pl.col("high_raw") - prev_close).abs(),
        (pl.col("low_raw") - prev_close).abs(),
    )
    dollar_vol = pl.col("close_raw") * pl.col("volume_raw")

    feat = (
        lf.with_columns(
            [
                (pl.col("close_raw") / prev_close - 1.0).alias("ret_1d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(5).over("asset_id") - 1.0).alias("ret_5d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(20).over("asset_id") - 1.0).alias("ret_20d"),
                pl.col("close_raw").log().diff().over("asset_id").alias("logret_1d"),
                pl.col("close_raw").rolling_mean(20).over("asset_id").alias("sma_20"),
                pl.col("close_raw").rolling_mean(50).over("asset_id").alias("sma_50"),
                pl.col("close_raw").rolling_mean(200).over("asset_id").alias("sma_200"),
                pl.col("close_raw").ewm_mean(span=12, adjust=False).over("asset_id").alias("ema_12"),
                pl.col("close_raw").ewm_mean(span=26, adjust=False).over("asset_id").alias("ema_26"),
                gain.rolling_mean(14).over("asset_id").alias("_avg_gain_14"),
                loss.rolling_mean(14).over("asset_id").alias("_avg_loss_14"),
                tr.rolling_mean(14).over("asset_id").alias("atr_14"),
                dollar_vol.rolling_mean(20).over("asset_id").alias("adv20_dollar"),
                ((pl.col("high_raw") - pl.col("low_raw")) / pl.col("close_raw")).alias("range_pct"),
                (pl.col("open_raw") / prev_close - 1.0).alias("gap_open"),
                pl.col("volume_raw").rolling_mean(20).over("asset_id").alias("_vol_ma20"),
            ]
        )
        .with_columns([(pl.col("ema_12") - pl.col("ema_26")).alias("macd")])
        .with_columns(
            [
                (pl.col("macd").ewm_mean(span=9, adjust=False).over("asset_id")).alias("macd_signal"),
                (
                    100
                    - (100 / (1 + (pl.col("_avg_gain_14") / pl.when(pl.col("_avg_loss_14") > 0).then(pl.col("_avg_loss_14")).otherwise(None))))
                ).alias("rsi_14"),
            ]
        )
        .with_columns(
            [
                (pl.col("macd") - pl.col("macd_signal")).alias("macd_hist"),
                ((pl.col("close_raw") - pl.col("sma_20")) / (pl.col("close_raw").rolling_std(20).over("asset_id"))).alias("boll_z_20"),
                ((pl.col("close_raw") / pl.col("sma_50")) - 1.0).alias("dist_vwap_20"),  # placeholder proxy
                (pl.col("atr_14") / pl.col("close_raw")).alias("atr_pct_14"),
                (pl.col("_vol_ma20") / pl.col("volume_raw").rolling_mean(60).over("asset_id")).alias("turnover_ratio"),
                pl.col("close_raw").rolling_std(20).over("asset_id").alias("_px_vol_20"),
                pl.col("close_raw").rolling_std(60).over("asset_id").alias("_px_vol_60"),
            ]
        )
        .with_columns(
            [
                pl.col("_px_vol_20").rolling_std(20).over("asset_id").alias("vov_20"),
                (pl.col("close_raw") <= 0).alias("_bad_close"),
                (pl.col("date").is_null()).alias("_bad_date"),
                pl.col("logret_1d").rolling_std(20).over("asset_id").alias("ewma_vol_20"),
                pl.col("logret_1d").rolling_std(60).over("asset_id").alias("ewma_vol_60"),
            ]
        )
        .with_columns(
            [
                (pl.col("_bad_close") | pl.col("_bad_date")).alias("ca_suspicious_flag"),
                pl.col("close_raw").is_null().alias("has_missing_bars_lookback"),
            ]
        )
        .with_columns(
            [
                pl.len().over("asset_id").alias("_rows_in_window"),
                pl.col("date").max().over("asset_id").alias("_asset_latest_date"),
            ]
        )
        .filter(pl.col("date") == pl.col("_asset_latest_date"))
        .filter(pl.col("_rows_in_window") >= 200)
        .select(
            [
                pl.col("asset_id"),
                pl.lit(asof_s).str.strptime(pl.Date).alias("asof_date"),
                pl.col("date").alias("feature_date"),
                pl.col("asset_class"),
                "ret_1d",
                "ret_5d",
                "ret_20d",
                "logret_1d",
                "close_raw",
                "sma_20",
                "sma_50",
                "sma_200",
                "ema_12",
                "ema_26",
                "macd",
                "macd_signal",
                "macd_hist",
                "rsi_14",
                "boll_z_20",
                "dist_vwap_20",
                "atr_14",
                "atr_pct_14",
                "ewma_vol_20",
                "ewma_vol_60",
                "vov_20",
                "adv20_dollar",
                "turnover_ratio",
                "range_pct",
                "gap_open",
                "has_missing_bars_lookback",
                "ca_suspicious_flag",
                "_rows_in_window",
            ]
        )
    )

    out_dir = (
        quant_root
        / "features"
        / "store"
        / f"feature_store_version={args.feature_store_version}"
        / f"asof_date={asof_s}"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    row_counts: dict[str, int] = {}
    file_paths: list[str] = []
    for asset_class in include_classes:
        cls_df = feat.filter(pl.col("asset_class") == asset_class).collect(engine="streaming")
        if cls_df.is_empty():
            continue
        cls_dir = out_dir / f"asset_class={asset_class}"
        cls_dir.mkdir(parents=True, exist_ok=True)
        fp = cls_dir / f"part-{args.output_tag}.parquet"
        cls_df.write_parquet(fp)
        row_counts[asset_class] = cls_df.height
        file_paths.append(str(fp))

    manifest = {
        "schema": "quantlab_feature_manifest_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": snapshot_id,
        "asof_date": asof_s,
        "feature_store_version": args.feature_store_version,
        "build_mode": "latest_features_from_materialized_bars_windowed",
        "lookback_calendar_days": args.lookback_calendar_days,
        "max_assets": args.max_assets,
        "asset_classes": include_classes,
        "counts": {
            "rows_by_asset_class": row_counts,
            "rows_total": int(sum(row_counts.values())),
            "files_total": len(file_paths),
            "allowlist_assets_total": len(allow_asset_ids or []),
        },
        "artifacts": {
            "feature_partition_root": str(out_dir),
            "files": file_paths,
        },
        "hashes": {
            "manifest_hash_self_excluded": "",
            "feature_files_hash": stable_hash_obj(sorted((Path(p).name, Path(p).stat().st_size) for p in file_paths)),
        },
    }
    manifest_path = out_dir / "feature_manifest.json"
    atomic_write_json(manifest_path, manifest)
    manifest["hashes"]["manifest_hash_self_included"] = stable_hash_file(manifest_path)
    atomic_write_json(manifest_path, manifest)

    print(f"snapshot_id={snapshot_id}")
    print(f"asof_date={asof_s}")
    print(f"feature_root={out_dir}")
    print(f"rows_total={manifest['counts']['rows_total']}")
    print(f"rows_by_asset_class={row_counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
