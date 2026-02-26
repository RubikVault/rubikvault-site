#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, utc_now_iso


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--feature-store-version", default="v4_q1min")
    p.add_argument("--asof-date", required=True)
    p.add_argument("--top-liquid-n", type=int, default=500)
    return p.parse_args(list(argv))


def _pick_regime(metrics: dict) -> tuple[str, float]:
    breadth = metrics.get("breadth_above_sma200") or 0.0
    vol20 = metrics.get("global_vol_20") or 0.0
    vov20 = metrics.get("global_vov_20") or 0.0
    trend = metrics.get("trend_strength") or 0.0
    corr_proxy = metrics.get("corr_proxy_same_sign") or 0.0
    if breadth < 0.35 or corr_proxy > 0.8:
        return ("BREADTH_COLLAPSE" if breadth < 0.35 else "CORRELATED_STRESS", 0.85)
    if trend > 0.6 and vol20 < 0.03:
        return ("TREND_LOWVOL", 0.75)
    if trend > 0.6 and vol20 >= 0.03:
        return ("TREND_HIGHVOL", 0.70)
    if vol20 < 0.02 and vov20 < 0.01:
        return ("MEANREV_LOWVOL", 0.65)
    return ("CORRELATED_STRESS", 0.55 if corr_proxy > 0.65 else 0.50)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    feat_root = (
        quant_root
        / "features"
        / "store"
        / f"feature_store_version={args.feature_store_version}"
        / f"asof_date={args.asof_date}"
    )
    files = list(feat_root.glob("asset_class=*/part-*.parquet"))
    if not files:
        raise SystemExit(f"FATAL: no feature parquet files under {feat_root}")

    df = pl.concat([pl.read_parquet(fp) for fp in files], how="vertical_relaxed")
    if df.is_empty():
        raise SystemExit("FATAL: empty feature store")

    top = (
        df.filter(pl.col("adv20_dollar").is_not_null())
        .sort("adv20_dollar", descending=True)
        .head(args.top_liquid_n)
    )
    if top.is_empty():
        top = df.head(min(args.top_liquid_n, df.height))

    breadth = top.select((pl.col("close_raw") > pl.col("sma_200")).mean().alias("x")).item() or 0.0
    trend_strength = top.select((pl.col("close_raw") > pl.col("sma_50")).mean().alias("x")).item() or 0.0
    global_vol_20 = top.select(pl.col("ewma_vol_20").mean().alias("x")).item()
    global_vov_20 = top.select(pl.col("vov_20").mean().alias("x")).item()
    corr_proxy = top.select(
        ((pl.col("ret_1d") > 0).cast(pl.Int8).mean() - 0.5).abs() * 2
    ).item()

    metrics = {
        "breadth_above_sma200": float(breadth or 0.0),
        "trend_strength": float(trend_strength or 0.0),
        "global_vol_20": float(global_vol_20 or 0.0),
        "global_vov_20": float(global_vov_20 or 0.0),
        "corr_proxy_same_sign": float(corr_proxy or 0.0),
        "sample_assets": int(top.height),
    }
    regime_id, conf = _pick_regime(metrics)

    out_dir = quant_root / "runs" / f"run_id=regime_{args.asof_date}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "quantlab_regime_report_q1_v1",
        "generated_at": utc_now_iso(),
        "asof_date": args.asof_date,
        "feature_store_version": args.feature_store_version,
        "regime": {
            "regime_id": regime_id,
            "regime_confidence": conf,
            "days_in_state": 1,
            "regime_flip_flag": False,
        },
        "inputs": metrics,
        "notes": [
            "Q1 minimal regime engine computes current state only from latest feature snapshot.",
            "No lookahead data used.",
        ],
    }
    atomic_write_json(out_dir / "regime_report.json", report)

    ts_dir = quant_root / "ops"
    ts_dir.mkdir(parents=True, exist_ok=True)
    pl.DataFrame(
        [
            {
                "date": args.asof_date,
                "regime_id": regime_id,
                "regime_confidence": conf,
                "days_in_state": 1,
                "regime_flip_flag": False,
            }
        ]
    ).write_parquet(ts_dir / "regime_timeseries_q1.parquet")

    print(f"asof_date={args.asof_date}")
    print(f"regime_id={regime_id}")
    print(f"regime_confidence={conf:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__('sys').argv[1:]))
