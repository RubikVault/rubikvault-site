#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    parse_iso_date,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--increment-manifest", default="", help="Path to q1 incremental snapshot manifest; default latest success pointer")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--feature-store-version", default="v4_q1inc")
    p.add_argument("--output-tag", default="")
    p.add_argument("--min-rows-window", type=int, default=200)
    return p.parse_args(list(argv))


def _resolve_increment_manifest(quant_root: Path, explicit: str) -> Path:
    if explicit:
        p = Path(explicit)
        return p if p.is_absolute() else (quant_root / p)
    latest_ptr = quant_root / "ops" / "q1_incremental_snapshot" / "latest_success.json"
    if not latest_ptr.exists():
        raise FileNotFoundError(f"q1 incremental snapshot pointer missing: {latest_ptr}")
    ptr = read_json(latest_ptr)
    path = ptr.get("increment_manifest")
    if not path:
        raise RuntimeError(f"increment_manifest missing in {latest_ptr}")
    return Path(str(path))


def _read_changed_assets(changed_assets_parquet: Path, include_classes: list[str]) -> list[str]:
    if not changed_assets_parquet.exists():
        return []
    df = pl.read_parquet(changed_assets_parquet)
    if df.is_empty():
        return []
    return (
        df.filter(pl.col("asset_class").str.to_lowercase().is_in(include_classes))
        .select("asset_id")
        .unique()
        .sort("asset_id")
        ["asset_id"]
        .to_list()
    )


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    include_classes = [x.strip().lower() for x in args.asset_classes.split(",") if x.strip()]
    include_set = set(include_classes)
    inc_manifest_path = _resolve_increment_manifest(quant_root, args.increment_manifest).resolve()
    if not inc_manifest_path.exists():
        raise SystemExit(f"FATAL: incremental snapshot manifest not found: {inc_manifest_path}")
    inc_manifest = read_json(inc_manifest_path)
    ingest_date = str(inc_manifest.get("ingest_date") or "")
    if not ingest_date:
        raise SystemExit("FATAL: ingest_date missing in incremental snapshot manifest")

    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_id = str(inc_manifest.get("snapshot_id") or "")
        snap_dir = (quant_root / "data" / "snapshots" / f"snapshot_id={snap_id}") if snap_id else latest_materialized_snapshot_dir(quant_root)
        if not snap_dir.exists():
            snap_dir = latest_materialized_snapshot_dir(quant_root)
    if not snap_dir.exists():
        raise SystemExit(f"FATAL: snapshot not found: {snap_dir}")

    snap_manifest = read_json(snap_dir / "snapshot_manifest.json")
    snapshot_id = str(snap_manifest.get("snapshot_id") or snap_dir.name.split("=", 1)[-1])
    asof_date = parse_iso_date(str(snap_manifest.get("asof_date") or date.today().isoformat()))
    bars_root_value = ((snap_manifest.get("artifacts") or {}).get("bars_dataset_root") or "")
    if not bars_root_value:
        raise SystemExit("FATAL: bars_dataset_root missing in snapshot manifest")
    bars_root = Path(str(bars_root_value))
    if not bars_root.exists():
        raise SystemExit(f"FATAL: bars_dataset_root not found: {bars_root}")

    changed_assets_path = Path(str((inc_manifest.get("artifacts") or {}).get("changed_assets_parquet") or ""))
    changed_assets = _read_changed_assets(changed_assets_path, include_classes)

    run_id = f"q1featinc_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    run_status_path = run_root / "q1_incremental_feature_update_run_status.json"

    tag = args.output_tag or f"delta_{ingest_date}"
    out_dir = (
        quant_root
        / "features"
        / "store"
        / f"feature_store_version={args.feature_store_version}"
        / f"asof_date={asof_date.isoformat()}"
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / f"feature_manifest.{tag}.json"

    def write_status(stage: str, ok=None, exit_code=None, reason=None, extra: dict[str, Any] | None = None):
        atomic_write_json(
            run_status_path,
            {
                "schema": "quantlab_q1_incremental_feature_update_run_status_v1",
                "generated_at": utc_now_iso(),
                "run_id": run_id,
                "ok": ok,
                "exit_code": exit_code,
                "reason": reason,
                "stage": stage,
                "snapshot_id": snapshot_id,
                "ingest_date": ingest_date,
                "paths": {
                    "increment_manifest": str(inc_manifest_path),
                    "snapshot_manifest": str(snap_dir / 'snapshot_manifest.json'),
                    "feature_root": str(out_dir),
                    "feature_manifest": str(manifest_path),
                },
                "extra": extra or {},
            },
        )

    write_status("bootstrap", extra={"changed_assets_total": len(changed_assets)})
    if not changed_assets:
        manifest = {
            "schema": "quantlab_q1_incremental_feature_manifest_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "snapshot_id": snapshot_id,
            "ingest_date": ingest_date,
            "asof_date": asof_date.isoformat(),
            "feature_store_version": args.feature_store_version,
            "mode": "incremental_latest_only_noop",
            "counts": {"changed_assets_total": 0, "feature_rows_total": 0, "files_total": 0},
            "artifacts": {"files": []},
            "inputs": {"increment_manifest": str(inc_manifest_path)},
            "reconciliation": {"changed_assets_total": 0, "feature_rows_total": 0, "ok": True},
        }
        atomic_write_json(manifest_path, manifest)
        latest_ptr = quant_root / "ops" / "q1_incremental_feature_update" / "latest_success.json"
        atomic_write_json(latest_ptr, {"schema": "quantlab_q1_incremental_feature_update_latest_success_v1", "updated_at": utc_now_iso(), "run_id": run_id, "manifest_path": str(manifest_path), "run_status": str(run_status_path), "counts": manifest["counts"]})
        write_status("completed", ok=True, exit_code=0, reason="ok_noop", extra={"manifest": str(manifest_path)})
        print(f"run_id={run_id}")
        print("changed_assets_total=0")
        print(f"manifest={manifest_path}")
        return 0

    start_date = (asof_date - timedelta(days=args.lookback_calendar_days)).isoformat()
    asof_s = asof_date.isoformat()
    bars_glob = str(bars_root / "**" / "*.parquet")

    # Build feature expressions (mirrors Q1 minimal latest-only, but restricted to changed assets)
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
        .filter(pl.col("asset_id").is_in(changed_assets))
        .filter(pl.col("date") >= pl.lit(start_date).str.strptime(pl.Date))
        .filter(pl.col("date") < pl.lit(asof_s).str.strptime(pl.Date))
        .sort(["asset_id", "date"])
    )

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
                ((pl.col("close_raw") / pl.col("sma_50")) - 1.0).alias("dist_vwap_20"),
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
                pl.len().over("asset_id").alias("_rows_in_window"),
                pl.col("date").max().over("asset_id").alias("_asset_latest_date"),
            ]
        )
        .filter(pl.col("date") == pl.col("_asset_latest_date"))
        .filter(pl.col("_rows_in_window") >= int(args.min_rows_window))
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

    row_counts: dict[str, int] = {}
    file_paths: list[str] = []
    changed_assets_with_features = 0
    for asset_class in include_classes:
        cls_df = feat.filter(pl.col("asset_class") == asset_class).collect(engine="streaming")
        if cls_df.is_empty():
            continue
        cls_dir = out_dir / f"asset_class={asset_class}"
        cls_dir.mkdir(parents=True, exist_ok=True)
        fp = cls_dir / f"delta-{tag}.parquet"
        cls_df.write_parquet(fp)
        row_counts[asset_class] = cls_df.height
        changed_assets_with_features += cls_df.select("asset_id").unique().height
        file_paths.append(str(fp))

    changed_assets_total = len(changed_assets)
    feature_rows_total = int(sum(row_counts.values()))
    reconciliation = {
        "changed_assets_total": changed_assets_total,
        "changed_assets_with_features": changed_assets_with_features,
        "changed_assets_without_features": int(max(0, changed_assets_total - changed_assets_with_features)),
        "feature_rows_total": feature_rows_total,
        "ok": True,
    }

    manifest = {
        "schema": "quantlab_q1_incremental_feature_manifest_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "snapshot_id": snapshot_id,
        "ingest_date": ingest_date,
        "asof_date": asof_s,
        "feature_store_version": args.feature_store_version,
        "mode": "incremental_latest_only_changed_assets",
        "inputs": {
            "increment_manifest": str(inc_manifest_path),
            "snapshot_manifest": str(snap_dir / 'snapshot_manifest.json'),
            "changed_assets_parquet": str(changed_assets_path),
        },
        "config": {
            "asset_classes": include_classes,
            "lookback_calendar_days": int(args.lookback_calendar_days),
            "min_rows_window": int(args.min_rows_window),
            "output_tag": tag,
        },
        "counts": {
            "changed_assets_total": changed_assets_total,
            "changed_assets_with_features": changed_assets_with_features,
            "rows_by_asset_class": row_counts,
            "feature_rows_total": feature_rows_total,
            "files_total": len(file_paths),
        },
        "artifacts": {
            "feature_partition_root": str(out_dir),
            "files": file_paths,
        },
        "reconciliation": reconciliation,
    }
    atomic_write_json(manifest_path, manifest)
    manifest.setdefault("hashes", {})
    manifest["hashes"]["manifest_hash"] = stable_hash_file(manifest_path)
    manifest["hashes"]["feature_files_hash"] = stable_hash_obj(sorted((Path(p).name, Path(p).stat().st_size) for p in file_paths))
    atomic_write_json(manifest_path, manifest)

    latest_ptr = quant_root / "ops" / "q1_incremental_feature_update" / "latest_success.json"
    atomic_write_json(latest_ptr, {"schema": "quantlab_q1_incremental_feature_update_latest_success_v1", "updated_at": utc_now_iso(), "run_id": run_id, "manifest_path": str(manifest_path), "run_status": str(run_status_path), "counts": manifest["counts"]})

    write_status("completed", ok=True, exit_code=0, reason="ok", extra={"manifest": str(manifest_path), "reconciliation": reconciliation})
    print(f"run_id={run_id}")
    print(f"manifest={manifest_path}")
    print(f"feature_rows_total={feature_rows_total}")
    print(f"changed_assets_total={changed_assets_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
