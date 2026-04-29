#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.breakout_compute.lib.breakout_math import clamp  # noqa: E402
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


EU_PREFIXES = {"AS", "BR", "CO", "F", "HE", "LSE", "MC", "MI", "PA", "ST", "SW", "VI", "XETRA"}
ASIA_PREFIXES = {"AU", "HK", "JK", "KO", "KQ", "SHG", "SHE", "TSE", "TO", "TW", "TWO"}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input-manifest", required=True)
    return p.parse_args(list(argv))


def _first_existing(cols: set[str], candidates: list[str]) -> str | None:
    for col in candidates:
        if col in cols:
            return col
    return None


def _expr(cols: set[str], candidates: list[str], alias: str, dtype: pl.DataType = pl.Utf8) -> pl.Expr:
    col = _first_existing(cols, candidates)
    if col:
        return pl.col(col).cast(dtype, strict=False).alias(alias)
    return pl.lit(None, dtype=dtype).alias(alias)


def infer_region(asset_id: str, exchange: str | None = None, region: str | None = None) -> str:
    raw_region = str(region or "").strip().upper()
    if raw_region in {"US", "EU", "ASIA"}:
        return raw_region
    prefix = str(exchange or "").strip().upper()
    if not prefix and ":" in str(asset_id):
        prefix = str(asset_id).split(":", 1)[0].upper()
    if prefix == "US":
        return "US"
    if prefix in EU_PREFIXES:
        return "EU"
    if prefix in ASIA_PREFIXES:
        return "ASIA"
    return "OTHER"


def _normalize_universe(universe_path: Path, include_classes: set[str], max_assets: int) -> pl.DataFrame:
    df = pl.read_parquet(universe_path)
    cols = set(df.columns)
    if "asset_id" not in cols and "canonical_id" in cols:
        df = df.rename({"canonical_id": "asset_id"})
        cols = set(df.columns)
    if "asset_id" not in cols:
        raise SystemExit(f"FATAL: universe missing asset_id/canonical_id: {universe_path}")

    selected = df.select(
        [
            pl.col("asset_id").cast(pl.Utf8),
            _expr(cols, ["asset_class", "type", "asset_type"], "asset_class", pl.Utf8),
            _expr(cols, ["symbol", "ticker"], "symbol", pl.Utf8),
            _expr(cols, ["name"], "name", pl.Utf8),
            _expr(cols, ["exchange", "exchange_code"], "exchange", pl.Utf8),
            _expr(cols, ["region"], "raw_region", pl.Utf8),
            _expr(cols, ["sector", "sector_name", "gics_sector"], "sector", pl.Utf8),
            _expr(cols, ["bars_count", "history_bars"], "registry_bars_count", pl.Int64),
            _expr(cols, ["adv20_dollar", "median_dollar_volume_20d"], "registry_adv20_dollar", pl.Float64),
        ]
    ).with_columns(
        [
            pl.col("asset_class").str.to_lowercase().fill_null("unknown"),
            pl.col("sector").fill_null("unknown"),
            pl.struct(["asset_id", "exchange", "raw_region"]).map_elements(
                lambda row: infer_region(row["asset_id"], row.get("exchange"), row.get("raw_region")),
                return_dtype=pl.Utf8,
            ).alias("region"),
        ]
    )
    selected = selected.filter(pl.col("asset_class").is_in(sorted(include_classes)))
    selected = selected.unique("asset_id", keep="first").sort("asset_id")
    if max_assets and max_assets > 0:
        selected = (
            selected.with_columns(pl.col("registry_adv20_dollar").fill_null(-1.0))
            .sort(["registry_adv20_dollar", "registry_bars_count", "asset_id"], descending=[True, True, False])
            .head(max_assets)
        )
    return selected


def _load_snapshot(manifest: dict[str, Any]) -> tuple[Path, dict[str, Any], str, date, Path, Path]:
    quant_root = Path(str(manifest.get("quant_root") or DEFAULT_QUANT_ROOT)).resolve()
    snapshot_id = str(manifest.get("snapshot_id") or "").strip()
    if snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={snapshot_id}"
    else:
        snap_dir = latest_materialized_snapshot_dir(quant_root)
    snap_manifest = read_json(snap_dir / "snapshot_manifest.json")
    asof_s = str(manifest.get("as_of") or snap_manifest.get("asof_date") or "")[:10]
    if not asof_s:
        raise SystemExit("FATAL: missing as_of")
    asof_date = parse_iso_date(asof_s)
    bars_root_value = (manifest.get("bars_dataset_root") or (snap_manifest.get("artifacts") or {}).get("bars_dataset_root"))
    if not bars_root_value:
        raise SystemExit(f"FATAL: bars_dataset_root missing in {snap_dir / 'snapshot_manifest.json'}")
    bars_root = Path(str(bars_root_value))
    if not bars_root.exists():
        local_bars = snap_dir / "bars"
        if local_bars.exists():
            bars_root = local_bars
        else:
            raise SystemExit(f"FATAL: bars dataset not found: {bars_root}")
    universe_value = manifest.get("universe_parquet") or (snap_manifest.get("artifacts") or {}).get("universe_parquet") or str(snap_dir / "universe.parquet")
    universe_path = Path(str(universe_value))
    if not universe_path.exists():
        local_universe = snap_dir / "universe.parquet"
        if local_universe.exists():
            universe_path = local_universe
        else:
            raise SystemExit(f"FATAL: universe parquet not found: {universe_path}")
    return quant_root, snap_manifest, str(snap_manifest.get("snapshot_id") or snap_dir.name), asof_date, bars_root, universe_path


def _build_feature_frame(
    *,
    bars_root: Path,
    universe_df: pl.DataFrame,
    asof_date: date,
    feature_config: dict[str, Any],
) -> pl.DataFrame:
    input_cfg = feature_config.get("input") or {}
    lookback_days = int(input_cfg.get("lookback_calendar_days") or 520)
    feature_days = int(input_cfg.get("feature_history_days") or 252)
    resistance_window = int(input_cfg.get("resistance_window_days") or 63)
    range_window = int(input_cfg.get("range_window_days") or 20)
    rs_days = int(input_cfg.get("relative_strength_days") or 63)
    recent_window = int(input_cfg.get("recent_signal_window_days") or 20)
    atr_period = int(input_cfg.get("atr_period_days") or 14)
    rvol_period = int(input_cfg.get("rvol_period_days") or 20)

    start_date = date.fromordinal(asof_date.toordinal() - lookback_days).isoformat()
    asof_s = asof_date.isoformat()
    bars_glob = str(bars_root / "**" / "*.parquet")
    scan = pl.scan_parquet(bars_glob, hive_partitioning=True)
    cols = set(scan.collect_schema().names())
    required = {
        "asset_id": ["asset_id", "canonical_id"],
        "date": ["date", "trading_date", "asof_date"],
        "open_raw": ["open_raw", "open"],
        "high_raw": ["high_raw", "high"],
        "low_raw": ["low_raw", "low"],
        "close_raw": ["close_raw", "close", "adj_close"],
        "volume_raw": ["volume_raw", "volume"],
        "asset_class": ["asset_class", "asset_type", "type"],
    }
    missing = [name for name, candidates in required.items() if not _first_existing(cols, candidates)]
    if missing:
        raise SystemExit(f"FATAL: bars parquet missing required columns: {missing}")

    asset_ids = universe_df["asset_id"].to_list()
    meta = universe_df.select(["asset_id", "asset_class", "symbol", "name", "exchange", "region", "sector"]).lazy()
    prev_close = pl.col("close_raw").shift(1).over("asset_id")
    tr = pl.max_horizontal(
        (pl.col("high_raw") - pl.col("low_raw")).abs(),
        (pl.col("high_raw") - prev_close).abs(),
        (pl.col("low_raw") - prev_close).abs(),
    )
    vol_base = pl.col("volume_raw").shift(1).rolling_mean(rvol_period).over("asset_id")
    high20 = pl.col("high_raw").rolling_max(range_window).over("asset_id")
    low20 = pl.col("low_raw").rolling_min(range_window).over("asset_id")
    resistance = pl.col("high_raw").shift(1).rolling_max(resistance_window).over("asset_id")

    lf = (
        scan.with_columns(
            [
                _expr(cols, required["asset_id"], "asset_id", pl.Utf8),
                _expr(cols, required["asset_class"], "bar_asset_class", pl.Utf8),
                _expr(cols, required["date"], "date_raw", pl.Utf8),
                _expr(cols, required["open_raw"], "open_raw", pl.Float64),
                _expr(cols, required["high_raw"], "high_raw", pl.Float64),
                _expr(cols, required["low_raw"], "low_raw", pl.Float64),
                _expr(cols, required["close_raw"], "close_raw", pl.Float64),
                _expr(cols, required["volume_raw"], "volume_raw", pl.Float64),
            ]
        )
        .with_columns(
            [
                pl.col("bar_asset_class").str.to_lowercase(),
                pl.col("date_raw").str.strptime(pl.Date, strict=False).alias("date"),
            ]
        )
        .filter(pl.col("asset_id").is_in(asset_ids))
        .filter(pl.col("date") >= pl.lit(start_date).str.strptime(pl.Date))
        .filter(pl.col("date") <= pl.lit(asof_s).str.strptime(pl.Date))
        .sort(["asset_id", "date"])
        .join(meta, on="asset_id", how="left")
        .with_columns(
            [
                (pl.col("close_raw") / prev_close - 1.0).alias("ret_1d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(20).over("asset_id") - 1.0).alias("ret_20d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(rs_days).over("asset_id") - 1.0).alias("ret_63d"),
                pl.col("close_raw").rolling_mean(20).over("asset_id").alias("sma_20"),
                pl.col("close_raw").rolling_mean(50).over("asset_id").alias("sma_50"),
                pl.col("close_raw").rolling_mean(200).over("asset_id").alias("sma_200"),
                tr.rolling_mean(atr_period).over("asset_id").alias("atr_14"),
                (tr.rolling_mean(atr_period).over("asset_id") / pl.col("close_raw")).alias("atr_pct_14"),
                (pl.col("close_raw") * pl.col("volume_raw")).rolling_mean(20).over("asset_id").alias("adv20_dollar"),
                (pl.col("volume_raw") / pl.when(vol_base > 0).then(vol_base).otherwise(None)).alias("rvol20"),
                resistance.alias("resistance_level"),
                high20.alias("_high20"),
                low20.alias("_low20"),
                pl.len().over("asset_id").alias("_rows_in_window"),
                pl.col("date").max().over("asset_id").alias("_asset_latest_date"),
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
                    pl.col("rvol20").rolling_rank(feature_days, min_samples=20).over("asset_id")
                    / pl.when(pl.col("rvol20").is_not_null().cast(pl.Float64).rolling_sum(feature_days).over("asset_id") > 0)
                    .then(pl.col("rvol20").is_not_null().cast(pl.Float64).rolling_sum(feature_days).over("asset_id"))
                    .otherwise(None)
                ).clip(0.0, 1.0).alias("rvol_percentile_asset_252d"),
                (
                    pl.col("atr_pct_14").rolling_rank(feature_days, min_samples=20).over("asset_id")
                    / pl.when(pl.col("atr_pct_14").is_not_null().cast(pl.Float64).rolling_sum(feature_days).over("asset_id") > 0)
                    .then(pl.col("atr_pct_14").is_not_null().cast(pl.Float64).rolling_sum(feature_days).over("asset_id"))
                    .otherwise(None)
                ).clip(0.0, 1.0).alias("atr_compression_percentile_252d"),
                (
                    (
                        (pl.col("distance_to_resistance_atr") <= 0.5)
                        & (pl.col("rvol20") >= 1.2)
                        & (pl.col("price_position_20d_range") >= 0.8)
                    )
                    .cast(pl.Int64)
                    .rolling_sum(recent_window)
                    .over("asset_id")
                ).alias("recent_signal_count_20d"),
            ]
        )
        .filter(pl.col("date") == pl.col("_asset_latest_date"))
        .with_columns(
            [
                pl.when(pl.col("sector").is_null() | (pl.col("sector") == "")).then(pl.lit("unknown")).otherwise(pl.col("sector")).alias("sector_key"),
                (pl.col("rvol20").rank("average").over("sector") / pl.len().over("sector")).clip(0.0, 1.0).alias("rvol_percentile_sector_252d"),
                (pl.col("ret_63d").rank("average").over("sector") / pl.len().over("sector")).clip(0.0, 1.0).alias("sector_relative_strength_63d"),
                (pl.col("adv20_dollar").log1p().rank("average") / pl.len()).clip(0.0, 1.0).alias("liquidity_score"),
            ]
        )
    )
    feature_df = lf.collect(engine="streaming")
    if feature_df.is_empty():
        return feature_df

    market_base = feature_df.filter(pl.col("sma_200").is_not_null() & pl.col("close_raw").is_not_null())
    if market_base.is_empty():
        market_regime_score = 0.5
    else:
        above_200 = float(market_base.select((pl.col("close_raw") > pl.col("sma_200")).cast(pl.Float64).mean()).item() or 0.0)
        ret20_positive = float(market_base.select((pl.col("ret_20d") > 0).cast(pl.Float64).mean()).item() or 0.0)
        market_regime_score = clamp(0.7 * above_200 + 0.3 * ret20_positive)
    regime_multiplier = clamp(0.75 + (market_regime_score * 0.45), 0.70, 1.15)

    breadth = (
        feature_df.with_columns((pl.col("close_raw") > pl.col("sma_50")).cast(pl.Float64).alias("_above_50"))
        .group_by("sector_key")
        .agg(pl.col("_above_50").mean().fill_null(0.5).alias("sector_breadth_score"))
    )
    return (
        feature_df.join(breadth, on="sector_key", how="left")
        .with_columns(
            [
                pl.lit(asof_date.isoformat()).alias("as_of"),
                pl.lit("breakout_feature_engine_v1.2").alias("engine_version"),
                pl.lit("breakout_features_v1.2").alias("schema_version"),
                pl.lit(float(market_regime_score)).alias("market_regime_score"),
                pl.lit(float(regime_multiplier)).alias("regime_multiplier"),
            ]
        )
        .sort("asset_id")
    )


def _rule_for(asset_class: str, region: str, rules: dict[str, Any]) -> dict[str, Any]:
    key = f"{asset_class}_{str(region or 'other').lower()}"
    return rules.get(key) or rules.get(f"{asset_class}_other") or {}


def _finite(value: Any) -> bool:
    try:
        number = float(value)
    except Exception:
        return False
    return math.isfinite(number)


def _build_eligibility(
    universe_df: pl.DataFrame,
    feature_df: pl.DataFrame,
    universe_config: dict[str, Any],
    asof_date: date,
) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame, dict[str, int]]:
    minimums = universe_config.get("minimums") or {}
    liquidity_rules = universe_config.get("liquidity_rules") or {}
    signal_asset_classes = {str(x).lower() for x in universe_config.get("signal_asset_classes", ["stock", "etf"])}
    min_history = int(minimums.get("min_history_bars") or 252)
    min_completeness = float(minimums.get("min_data_completeness_252d") or 0.85)
    max_stale_days = int(minimums.get("max_stale_calendar_days") or 7)

    feature_rows = {row["asset_id"]: row for row in feature_df.to_dicts()}
    eligible_rows: list[dict[str, Any]] = []
    excluded_rows: list[dict[str, Any]] = []
    reason_counts: dict[str, int] = {}

    for row in universe_df.to_dicts():
        asset_id = str(row.get("asset_id") or "")
        asset_class = str(row.get("asset_class") or "unknown").lower()
        region = str(row.get("region") or "OTHER").upper()
        feature = feature_rows.get(asset_id)
        reasons: list[str] = []

        if asset_class not in signal_asset_classes:
            reasons.append("non_signal_asset_type")
            if asset_class == "index":
                reasons.append("benchmark_only")

        if not feature:
            reasons.append("no_ohlcv")
        else:
            rows_in_window = int(feature.get("_rows_in_window") or 0)
            completeness = min(1.0, rows_in_window / max(1, min_history))
            if rows_in_window < min_history:
                reasons.append("short_history")
            if completeness < min_completeness:
                reasons.append("incomplete_history")
            feature_date = str(feature.get("date") or feature.get("_asset_latest_date") or "")[:10]
            try:
                stale_days = asof_date.toordinal() - parse_iso_date(feature_date).toordinal()
            except Exception:
                stale_days = max_stale_days + 1
            if stale_days > max_stale_days:
                reasons.append("stale_price")
            close = feature.get("close_raw")
            if bool(minimums.get("require_positive_close", True)) and (not _finite(close) or float(close) <= 0):
                reasons.append("invalid_price")
            volume = feature.get("volume_raw")
            if bool(minimums.get("require_volume_for_signals", True)) and asset_class in signal_asset_classes and (not _finite(volume) or float(volume) <= 0):
                reasons.append("missing_volume")
            rule = _rule_for(asset_class, region, liquidity_rules)
            min_price = float(rule.get("min_price") or 0.0)
            min_dollar_vol = float(rule.get("min_median_dollar_volume_20d") or 0.0)
            adv20 = feature.get("adv20_dollar")
            if asset_class in signal_asset_classes:
                if _finite(close) and float(close) < min_price:
                    reasons.append("low_liquidity")
                if (not _finite(adv20)) or float(adv20) < min_dollar_vol:
                    reasons.append("low_liquidity")

        reasons = sorted(set(reasons))
        if reasons:
            for reason in reasons:
                reason_counts[reason] = reason_counts.get(reason, 0) + 1
            excluded_rows.append(
                {
                    **row,
                    "eligible": False,
                    "exclusion_reasons": ";".join(reasons),
                }
            )
        else:
            eligible_rows.append({**row, "eligible": True, "exclusion_reasons": ""})

    eligible_df = pl.DataFrame(eligible_rows) if eligible_rows else pl.DataFrame(schema={**universe_df.schema, "eligible": pl.Boolean, "exclusion_reasons": pl.Utf8})
    excluded_df = pl.DataFrame(excluded_rows) if excluded_rows else pl.DataFrame(schema={**universe_df.schema, "eligible": pl.Boolean, "exclusion_reasons": pl.Utf8})
    eligible_ids = set(eligible_df["asset_id"].to_list()) if not eligible_df.is_empty() else set()
    eligible_features = feature_df.filter(pl.col("asset_id").is_in(sorted(eligible_ids))) if eligible_ids else feature_df.head(0)
    return eligible_df, excluded_df, eligible_features, reason_counts


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    input_manifest_path = Path(args.input_manifest).resolve()
    manifest = read_json(input_manifest_path)
    work_dir = Path(str(manifest["work_dir"])).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    configs = manifest.get("configs") or {}
    universe_config = configs.get("tradable_universe") or {}
    feature_config = configs.get("features") or {}
    include_classes = {str(x).lower() for x in universe_config.get("asset_classes", ["stock", "etf", "index"])}
    max_assets = int(manifest.get("max_assets") or 0)

    quant_root, snap_manifest, snapshot_id, asof_date, bars_root, universe_path = _load_snapshot(manifest)
    universe_df = _normalize_universe(universe_path, include_classes, max_assets)
    feature_df = _build_feature_frame(
        bars_root=bars_root,
        universe_df=universe_df,
        asof_date=asof_date,
        feature_config=feature_config,
    )
    eligible_df, excluded_df, eligible_features, reason_counts = _build_eligibility(universe_df, feature_df, universe_config, asof_date)

    output_root = quant_root / "breakout"
    date_part = f"date={asof_date.isoformat()}"
    universe_out = output_root / "universe" / date_part
    features_out = output_root / "features" / date_part
    universe_out.mkdir(parents=True, exist_ok=True)
    features_out.mkdir(parents=True, exist_ok=True)
    eligible_path = universe_out / "eligible.parquet"
    excluded_path = universe_out / "excluded.parquet"
    features_path = features_out / "features.parquet"
    eligible_df.write_parquet(eligible_path)
    excluded_df.write_parquet(excluded_path)
    eligible_features.write_parquet(features_path)

    metadata = {
        "schema_version": "breakout_feature_metadata_v1",
        "generated_at": utc_now_iso(),
        "as_of": asof_date.isoformat(),
        "snapshot_id": snapshot_id,
        "snapshot_manifest_hash": stable_hash_obj(snap_manifest),
        "input_manifest_hash": stable_hash_file(input_manifest_path),
        "engine_version": feature_config.get("engine_version") or "breakout_feature_engine_v1.2",
        "counts": {
            "scope_total": int(universe_df.height),
            "ohlcv_available": int(feature_df.height),
            "tradable_eligible": int(eligible_df.height),
            "features_computed": int(eligible_features.height),
            "excluded_total": int(excluded_df.height),
        },
        "excluded_reasons": reason_counts,
        "artifacts": {
            "eligible_parquet": str(eligible_path),
            "excluded_parquet": str(excluded_path),
            "features_parquet": str(features_path),
        },
        "sources": {
            "quant_root": str(quant_root),
            "bars_root": str(bars_root),
            "universe_parquet": str(universe_path),
        },
    }
    atomic_write_json(work_dir / "feature_metadata.json", metadata)
    print(json.dumps({"ok": True, "metadata": metadata}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
