#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
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
    p.add_argument("--top-liquid-n", type=int, default=2000)
    p.add_argument("--survivors-max", type=int, default=24)
    return p.parse_args(list(argv))


def _z(expr: pl.Expr) -> pl.Expr:
    return ((expr - expr.mean()) / expr.std()).fill_nan(0.0).fill_null(0.0)


def _spearman_ic(df: pl.DataFrame, score_col: str, target_col: str) -> float:
    sub = df.select([score_col, target_col]).drop_nulls()
    if sub.height < 20:
        return 0.0
    # rank-based correlation proxy
    ranked = sub.with_columns(
        [
            pl.col(score_col).rank("average").alias("_rs"),
            pl.col(target_col).rank("average").alias("_rt"),
        ]
    )
    rs = ranked["_rs"].to_list()
    rt = ranked["_rt"].to_list()
    n = len(rs)
    if n < 2:
        return 0.0
    m1 = sum(rs) / n
    m2 = sum(rt) / n
    cov = sum((a - m1) * (b - m2) for a, b in zip(rs, rt))
    v1 = sum((a - m1) ** 2 for a in rs)
    v2 = sum((b - m2) ** 2 for b in rt)
    if v1 <= 0 or v2 <= 0:
        return 0.0
    return float(cov / math.sqrt(v1 * v2))


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
        raise SystemExit(f"FATAL: no feature files under {feat_root}")

    df = pl.concat([pl.read_parquet(fp) for fp in files], how="vertical_relaxed")
    df = (
        df.filter(pl.col("asset_class").is_in(["stock", "etf"]))
        .filter(pl.col("adv20_dollar").is_not_null() & (pl.col("adv20_dollar") > 0))
        .sort("adv20_dollar", descending=True)
        .head(args.top_liquid_n)
        .with_columns(
            [
                _z(pl.col("ret_20d")).alias("z_ret_20d"),
                _z(pl.col("ret_5d")).alias("z_ret_5d"),
                _z(pl.col("rsi_14")).alias("z_rsi_14"),
                _z(pl.col("macd_hist")).alias("z_macd_hist"),
                _z(pl.col("atr_pct_14")).alias("z_atr_pct_14"),
                _z(pl.col("ewma_vol_20")).alias("z_vol_20"),
                _z(pl.col("adv20_dollar").log()).alias("z_liq"),
                ((pl.col("close_raw") > pl.col("sma_200")).cast(pl.Int8) * 2 - 1).cast(pl.Float64).alias("trend_gate"),
            ]
        )
    )
    if df.height < 100:
        raise SystemExit("FATAL: insufficient feature rows for cheap gate")

    # Proxy target: prior realized 5d return. Q1 approximation before full walk-forward folds.
    target_col = "ret_5d"

    variants: list[dict] = []
    def add_variant(family: str, vid: str, score_expr: pl.Expr):
        nonlocal df, variants
        score_col = f"_score_{vid}"
        scored = df.with_columns(score_expr.alias(score_col))
        ic = _spearman_ic(scored, score_col, target_col)
        mean_score = float(scored.select(pl.col(score_col).mean()).item() or 0.0)
        std_score = float(scored.select(pl.col(score_col).std()).item() or 0.0)
        top_decile = scored.sort(score_col, descending=True).head(max(10, scored.height // 10))
        bot_decile = scored.sort(score_col).head(max(10, scored.height // 10))
        top_ret = float(top_decile.select(pl.col(target_col).mean()).item() or 0.0)
        bot_ret = float(bot_decile.select(pl.col(target_col).mean()).item() or 0.0)
        spread = top_ret - bot_ret
        turnover_proxy = float(scored.select(pl.col("z_ret_5d").abs().mean()).item() or 0.0)
        maxdd_proxy = float(scored.select(pl.col("z_vol_20").abs().mean()).item() or 0.0) * 10.0
        bootstrap_neg_share_proxy = 0.0 if ic > 0 else 0.8
        variants.append(
            {
                "candidate_id": vid,
                "family": family,
                "ic_5d_proxy": ic,
                "oos_sharpe_proxy": float(spread / (top_decile.select(pl.col(target_col).std()).item() or 1.0)),
                "maxdd_proxy_pct": maxdd_proxy,
                "turnover_proxy": turnover_proxy,
                "bootstrap_neg_sharpe_share_proxy": bootstrap_neg_share_proxy,
                "top_minus_bottom_5d": spread,
                "mean_score": mean_score,
                "std_score": std_score,
            }
        )

    add_variant("TSMOM", "tsmom_20", 0.8 * pl.col("z_ret_20d") + 0.2 * pl.col("trend_gate"))
    add_variant("TSMOM", "tsmom_20_macd", 0.6 * pl.col("z_ret_20d") + 0.4 * pl.col("z_macd_hist"))
    add_variant("CSMOM", "csmom_20_liq", 0.7 * pl.col("z_ret_20d") + 0.3 * pl.col("z_liq"))
    add_variant("MEANREV", "mr_rsi", -pl.col("z_rsi_14"))
    add_variant("MEANREV", "mr_rsi_boll", -0.6 * pl.col("z_rsi_14") - 0.4 * _z(pl.col("boll_z_20")))
    add_variant("BREAKOUT", "breakout_trend", 0.6 * pl.col("trend_gate") + 0.4 * pl.col("z_macd_hist"))
    add_variant("VOL", "vol_contraction", -0.5 * pl.col("z_vol_20") - 0.5 * pl.col("z_atr_pct_14"))
    add_variant("QUALITY", "quality_liq_lowvol", 0.6 * pl.col("z_liq") - 0.4 * pl.col("z_vol_20"))

    cand_df = pl.DataFrame(variants).sort(["ic_5d_proxy", "top_minus_bottom_5d"], descending=True)
    # Cheap gate proxies (Q1 minimal approximations)
    survivors = cand_df.filter(
        (pl.col("ic_5d_proxy") >= 0.0)
        & (pl.col("maxdd_proxy_pct") <= 35.0)
        & (pl.col("turnover_proxy") <= 4.0)
        & (pl.col("bootstrap_neg_sharpe_share_proxy") <= 0.65)
    ).head(args.survivors_max)

    run_id = f"cheapgateA_{args.asof_date}"
    out_dir = quant_root / "runs" / f"run_id={run_id}" / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    cand_path = out_dir / "candidates.parquet"
    surv_path = out_dir / "survivors_A.parquet"
    cand_df.write_parquet(cand_path)
    survivors.write_parquet(surv_path)

    report = {
        "schema": "quantlab_cheap_gate_stage_a_q1_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "asof_date": args.asof_date,
        "feature_store_version": args.feature_store_version,
        "sample": {"top_liquid_n": args.top_liquid_n, "rows_used": int(df.height)},
        "method": {
            "type": "q1_proxy_cross_sectional_stage_a",
            "target": "prior_realized_ret_5d",
            "notes": [
                "Q1 proxy Stage A before full walk-forward fold artifacts.",
                "Use only for pipeline wiring and candidate pruning scaffolding.",
            ],
        },
        "counts": {
            "candidates_total": int(cand_df.height),
            "survivors_A_total": int(survivors.height),
        },
        "gates_proxy": {
            "ic_5d_proxy_min": 0.0,
            "maxdd_proxy_pct_max": 35.0,
            "turnover_proxy_max": 4.0,
            "bootstrap_neg_sharpe_share_proxy_max": 0.65,
        },
        "artifacts": {"candidates": str(cand_path), "survivors_A": str(surv_path)},
    }
    atomic_write_json(out_dir / "cheap_gate_A_report.json", report)

    print(f"run_id={run_id}")
    print(f"candidates_total={cand_df.height}")
    print(f"survivors_A_total={survivors.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
