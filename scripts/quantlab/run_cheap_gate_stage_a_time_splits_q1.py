#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--feature-store-version", default="v4_q1panel")
    p.add_argument("--asof-end-date", required=True)
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--part-glob", default="part-*.parquet")
    p.add_argument("--panel-asof-days", type=int, default=120)
    p.add_argument("--top-liquid-n", type=int, default=5000)
    p.add_argument("--fold-count", type=int, default=3)
    p.add_argument("--test-days", type=int, default=20)
    p.add_argument("--embargo-days", type=int, default=5)
    p.add_argument("--min-train-days", type=int, default=60)
    p.add_argument("--survivors-max", type=int, default=24)
    return p.parse_args(list(argv))


def _spearman_ic(df: pl.DataFrame, score_col: str, target_col: str) -> float:
    sub = df.select([score_col, target_col]).drop_nulls()
    if sub.height < 30:
        return 0.0
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


def _safe_float(v, default=0.0) -> float:
    try:
        if v is None:
            return default
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except Exception:
        return default


def _z_expr(col: str, mean: float, std: float, alias: str) -> pl.Expr:
    sd = std if std and std > 1e-12 else 1.0
    return ((pl.col(col) - pl.lit(mean)) / pl.lit(sd)).fill_null(0.0).fill_nan(0.0).alias(alias)


@dataclass
class Candidate:
    family: str
    candidate_id: str
    score_expr_factory: Callable[[], pl.Expr]


def _candidates() -> list[Candidate]:
    return [
        Candidate("TSMOM", "tsmom_20", lambda: 0.8 * pl.col("z_ret_20d") + 0.2 * pl.col("trend_gate")),
        Candidate("TSMOM", "tsmom_20_macd", lambda: 0.6 * pl.col("z_ret_20d") + 0.4 * pl.col("z_macd_hist")),
        Candidate("CSMOM", "csmom_20_liq", lambda: 0.7 * pl.col("z_ret_20d") + 0.3 * pl.col("z_liq")),
        Candidate("MEANREV", "mr_rsi", lambda: -pl.col("z_rsi_14")),
        Candidate("MEANREV", "mr_rsi_boll", lambda: -0.6 * pl.col("z_rsi_14") - 0.4 * pl.col("z_boll_z_20")),
        Candidate("BREAKOUT", "breakout_trend", lambda: 0.6 * pl.col("trend_gate") + 0.4 * pl.col("z_macd_hist")),
        Candidate("VOL", "vol_contraction", lambda: -0.5 * pl.col("z_vol_20") - 0.5 * pl.col("z_atr_pct_14")),
        Candidate("QUALITY", "quality_liq_lowvol", lambda: 0.6 * pl.col("z_liq") - 0.4 * pl.col("z_vol_20")),
    ]


def _build_folds(unique_dates: list[str], fold_count: int, test_days: int, embargo_days: int, min_train_days: int) -> list[dict]:
    n = len(unique_dates)
    if n < (min_train_days + embargo_days + test_days):
        raise SystemExit(
            f"FATAL: insufficient asof dates ({n}) for folds; need at least {min_train_days + embargo_days + test_days}"
        )
    folds: list[dict] = []
    for i in range(fold_count):
        remaining_after = (fold_count - 1 - i) * test_days
        test_end_idx = n - 1 - remaining_after
        test_start_idx = test_end_idx - test_days + 1
        train_end_idx = test_start_idx - embargo_days - 1
        if test_start_idx < 0 or train_end_idx < 0:
            continue
        train_days = train_end_idx + 1
        if train_days < min_train_days:
            continue
        folds.append(
            {
                "fold_id": f"fold_{len(folds)+1}",
                "train_start": unique_dates[0],
                "train_end": unique_dates[train_end_idx],
                "test_start": unique_dates[test_start_idx],
                "test_end": unique_dates[test_end_idx],
                "embargo_days": embargo_days,
                "train_days": train_days,
                "test_days": test_days,
                "train_dates": unique_dates[: train_end_idx + 1],
                "test_dates": unique_dates[test_start_idx : test_end_idx + 1],
            }
        )
    if not folds:
        raise SystemExit("FATAL: no valid folds produced")
    return folds


def _train_stats(train_df: pl.DataFrame) -> dict[str, tuple[float, float]]:
    train_df = train_df.with_columns(pl.col("adv20_dollar").clip(lower_bound=1e-9).log().alias("_log_adv20"))
    cols = [
        ("ret_20d", "ret_20d"),
        ("ret_5d", "ret_5d"),
        ("rsi_14", "rsi_14"),
        ("macd_hist", "macd_hist"),
        ("atr_pct_14", "atr_pct_14"),
        ("ewma_vol_20", "ewma_vol_20"),
        ("boll_z_20", "boll_z_20"),
        ("_log_adv20", "log_adv20"),
    ]
    stats: dict[str, tuple[float, float]] = {}
    for src_col, stat_key in cols:
        s = train_df.select([
            pl.col(src_col).cast(pl.Float64).mean().alias("m"),
            pl.col(src_col).cast(pl.Float64).std().alias("s"),
        ]).row(0)
        stats[stat_key] = (_safe_float(s[0], 0.0), max(_safe_float(s[1], 1.0), 1e-12))
    return stats


def _prepare_test_features(test_df: pl.DataFrame, stats: dict[str, tuple[float, float]]) -> pl.DataFrame:
    # Cast and derive z columns using training stats only (time-split-safe normalization).
    test_df = test_df.with_columns(pl.col("adv20_dollar").clip(lower_bound=1e-9).log().alias("_log_adv20"))
    exprs = [
        _z_expr("ret_20d", *stats["ret_20d"], alias="z_ret_20d"),
        _z_expr("ret_5d", *stats["ret_5d"], alias="z_ret_5d"),
        _z_expr("rsi_14", *stats["rsi_14"], alias="z_rsi_14"),
        _z_expr("macd_hist", *stats["macd_hist"], alias="z_macd_hist"),
        _z_expr("atr_pct_14", *stats["atr_pct_14"], alias="z_atr_pct_14"),
        _z_expr("ewma_vol_20", *stats["ewma_vol_20"], alias="z_vol_20"),
        _z_expr("boll_z_20", *stats["boll_z_20"], alias="z_boll_z_20"),
        _z_expr("_log_adv20", *stats["log_adv20"], alias="z_liq"),
        ((pl.col("close_raw") > pl.col("sma_200")).cast(pl.Int8) * 2 - 1).cast(pl.Float64).alias("trend_gate"),
    ]
    return test_df.with_columns(exprs)


def _candidate_metrics_on_fold(test_scored: pl.DataFrame, score_col: str, target_col: str = "fwd_ret_5d") -> dict:
    ic = _spearman_ic(test_scored, score_col, target_col)
    n = test_scored.height
    if n <= 0:
        return {
            "rows": 0,
            "ic_5d": 0.0,
            "oos_sharpe_proxy": 0.0,
            "top_minus_bottom_5d": 0.0,
            "turnover_proxy": 0.0,
            "maxdd_proxy_pct": 0.0,
        }
    decile_n = max(20, n // 10)
    top_dec = test_scored.sort(score_col, descending=True).head(decile_n)
    bot_dec = test_scored.sort(score_col).head(decile_n)
    top_ret = _safe_float(top_dec.select(pl.col(target_col).mean()).item(), 0.0)
    bot_ret = _safe_float(bot_dec.select(pl.col(target_col).mean()).item(), 0.0)
    spread = top_ret - bot_ret
    top_std = _safe_float(top_dec.select(pl.col(target_col).std()).item(), 1.0)
    if abs(top_std) < 1e-12:
        top_std = 1.0
    turnover_proxy = _safe_float(test_scored.select(pl.col("z_ret_5d").abs().mean()).item(), 0.0)
    maxdd_proxy = _safe_float(test_scored.select(pl.col("z_vol_20").abs().mean()).item(), 0.0) * 10.0
    return {
        "rows": int(n),
        "ic_5d": float(ic),
        "oos_sharpe_proxy": float(spread / top_std),
        "top_minus_bottom_5d": float(spread),
        "turnover_proxy": float(turnover_proxy),
        "maxdd_proxy_pct": float(maxdd_proxy),
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    feature_root = quant_root / "features" / "store" / f"feature_store_version={args.feature_store_version}"
    if not feature_root.exists():
        raise SystemExit(f"FATAL: feature store not found: {feature_root}")

    include_classes = [x.strip().lower() for x in args.asset_classes.split(",") if x.strip()]
    asof_dirs = sorted([p for p in feature_root.glob("asof_date=*") if p.is_dir()], key=lambda p: p.name)
    if not asof_dirs:
        raise SystemExit(f"FATAL: no asof partitions under {feature_root}")

    all_dates = [p.name.split("=", 1)[1] for p in asof_dirs]
    all_dates = [d for d in all_dates if d <= args.asof_end_date]
    if not all_dates:
        raise SystemExit(f"FATAL: no asof partitions <= {args.asof_end_date}")
    selected_dates = all_dates[-args.panel_asof_days :]
    selected_date_set = set(selected_dates)

    files: list[Path] = []
    for d in selected_dates:
        for cls in include_classes:
            files.extend(sorted((feature_root / f"asof_date={d}" / f"asset_class={cls}").glob(args.part_glob)))
    if not files:
        raise SystemExit("FATAL: no panel feature files found for selected dates/classes")

    df = pl.concat([pl.read_parquet(fp) for fp in files], how="vertical_relaxed")
    df = (
        df.with_columns(
            [
                pl.col("asof_date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("feature_date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("asset_class").str.to_lowercase(),
                pl.col("adv20_dollar").cast(pl.Float64),
                pl.col("fwd_ret_5d").cast(pl.Float64),
            ]
        )
        .filter(pl.col("asset_class").is_in(include_classes))
        .drop_nulls(["asof_date", "asset_id", "adv20_dollar", "fwd_ret_5d"])
        .filter(pl.col("adv20_dollar") > 0)
    )
    if df.is_empty():
        raise SystemExit("FATAL: empty panel dataframe after filtering")

    # Top-liquid subset for tractable stage-A runs: rank by median ADV over selected panel.
    liq_rank = (
        df.group_by("asset_id")
        .agg(
            [
                pl.col("adv20_dollar").median().alias("adv20_median"),
                pl.col("asset_class").first().alias("asset_class"),
                pl.len().alias("rows_n"),
            ]
        )
        .sort(["adv20_median", "rows_n", "asset_id"], descending=[True, True, False])
        .head(args.top_liquid_n)
        .select("asset_id")
    )
    allow_ids = set(liq_rank["asset_id"].to_list())
    df = df.filter(pl.col("asset_id").is_in(list(allow_ids)))
    if df.height < 1000:
        raise SystemExit(f"FATAL: insufficient rows after top_liquid_n filter ({df.height})")

    unique_dates = sorted({d.isoformat() for d in df["asof_date"].to_list()})
    folds = _build_folds(unique_dates, args.fold_count, args.test_days, args.embargo_days, args.min_train_days)

    candidates = _candidates()
    fold_metric_rows: list[dict] = []
    by_candidate: dict[str, dict] = {
        c.candidate_id: {
            "candidate_id": c.candidate_id,
            "family": c.family,
            "fold_metrics": [],
        }
        for c in candidates
    }

    # Pre-split per date strings to reduce repeated casts in filters.
    df = df.with_columns(pl.col("asof_date").dt.strftime("%Y-%m-%d").alias("_asof_s"))

    for fold in folds:
        train_dates = set(fold["train_dates"])
        test_dates = set(fold["test_dates"])
        train_df = df.filter(pl.col("_asof_s").is_in(list(train_dates)))
        test_df = df.filter(pl.col("_asof_s").is_in(list(test_dates)))
        if train_df.height < 500 or test_df.height < 200:
            fold["skipped"] = True
            fold["skip_reason"] = f"insufficient_rows train={train_df.height} test={test_df.height}"
            continue
        stats = _train_stats(train_df)
        test_prepped = _prepare_test_features(test_df, stats)

        for cand in candidates:
            score_col = f"_score_{cand.candidate_id}"
            scored = test_prepped.with_columns(cand.score_expr_factory().alias(score_col))
            m = _candidate_metrics_on_fold(scored, score_col, target_col="fwd_ret_5d")
            row = {
                "fold_id": fold["fold_id"],
                "candidate_id": cand.candidate_id,
                "family": cand.family,
                **m,
            }
            fold_metric_rows.append(row)
            by_candidate[cand.candidate_id]["fold_metrics"].append(m)

    if not fold_metric_rows:
        raise SystemExit("FATAL: no fold metrics generated")

    cand_rows: list[dict] = []
    for cand in candidates:
        metrics = by_candidate[cand.candidate_id]["fold_metrics"]
        if not metrics:
            continue
        ic_vals = [float(m["ic_5d"]) for m in metrics]
        sharpe_vals = [float(m["oos_sharpe_proxy"]) for m in metrics]
        spread_vals = [float(m["top_minus_bottom_5d"]) for m in metrics]
        turnover_vals = [float(m["turnover_proxy"]) for m in metrics]
        dd_vals = [float(m["maxdd_proxy_pct"]) for m in metrics]
        neg_share = sum(1 for v in sharpe_vals if v < 0) / max(1, len(sharpe_vals))
        cand_rows.append(
            {
                "candidate_id": cand.candidate_id,
                "family": cand.family,
                "folds_used": len(metrics),
                "ic_5d_oos_mean": statistics.fmean(ic_vals),
                "ic_5d_oos_min": min(ic_vals),
                "oos_sharpe_proxy_mean": statistics.fmean(sharpe_vals),
                "oos_sharpe_proxy_min": min(sharpe_vals),
                "top_minus_bottom_5d_mean": statistics.fmean(spread_vals),
                "turnover_proxy_mean": statistics.fmean(turnover_vals),
                "maxdd_proxy_pct_mean": statistics.fmean(dd_vals),
                "bootstrap_neg_sharpe_share_proxy": neg_share,
            }
        )

    cand_df = pl.DataFrame(cand_rows).sort(["ic_5d_oos_mean", "top_minus_bottom_5d_mean"], descending=True)
    survivors = cand_df.filter(
        (pl.col("ic_5d_oos_mean") >= 0.0)
        & (pl.col("maxdd_proxy_pct_mean") <= 35.0)
        & (pl.col("turnover_proxy_mean") <= 4.0)
        & (pl.col("bootstrap_neg_sharpe_share_proxy") <= 0.65)
    ).head(args.survivors_max)

    run_id = f"cheapgateA_tsplits_{args.asof_end_date}"
    out_dir = quant_root / "runs" / f"run_id={run_id}" / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)
    cand_path = out_dir / "candidates.parquet"
    surv_path = out_dir / "survivors_A.parquet"
    fold_metrics_path = out_dir / "fold_metrics.parquet"
    folds_manifest_path = out_dir / "folds_manifest.json"
    report_path = out_dir / "cheap_gate_A_time_splits_report.json"

    cand_df.write_parquet(cand_path)
    survivors.write_parquet(surv_path)
    pl.DataFrame(fold_metric_rows).write_parquet(fold_metrics_path)

    folds_manifest = {
        "schema": "quantlab_folds_manifest_q1_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "feature_store_version": args.feature_store_version,
        "asof_end_date": args.asof_end_date,
        "fold_method": "anchored_time_splits_with_embargo",
        "target": "fwd_ret_5d",
        "config": {
            "panel_asof_days": args.panel_asof_days,
            "fold_count_requested": args.fold_count,
            "fold_count_built": len(folds),
            "test_days": args.test_days,
            "embargo_days": args.embargo_days,
            "min_train_days": args.min_train_days,
            "top_liquid_n": args.top_liquid_n,
        },
        "panel": {
            "selected_dates_total": len(unique_dates),
            "selected_dates_min": unique_dates[0],
            "selected_dates_max": unique_dates[-1],
            "rows_total": int(df.height),
            "assets_total": int(df.select(pl.col("asset_id").n_unique()).item()),
        },
        "folds": [
            {
                k: v
                for k, v in fold.items()
                if k not in {"train_dates", "test_dates"}
            }
            for fold in folds
        ],
        "artifacts": {
            "fold_metrics": str(fold_metrics_path),
            "candidates": str(cand_path),
            "survivors_A": str(surv_path),
        },
    }
    atomic_write_json(folds_manifest_path, folds_manifest)

    report = {
        "schema": "quantlab_cheap_gate_stage_a_time_splits_q1_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "asof_end_date": args.asof_end_date,
        "feature_store_version": args.feature_store_version,
        "method": {
            "type": "anchored_time_splits_stage_a_q1",
            "target": "fwd_ret_5d",
            "normalization": "train_fold_stats_only",
            "notes": [
                "Q1 upgrade from proxy-only single-slice to real temporal folds with fold artifacts.",
                "Still a Cheap Gate Stage A approximation (no CPCV, no expensive stress suite yet).",
            ],
        },
        "inputs": {
            "part_glob": args.part_glob,
        },
        "counts": {
            "panel_rows_used": int(df.height),
            "panel_assets_used": int(df.select(pl.col("asset_id").n_unique()).item()),
            "candidates_total": int(cand_df.height),
            "survivors_A_total": int(survivors.height),
            "folds_total": len(folds),
            "fold_metrics_rows": len(fold_metric_rows),
        },
        "gates_proxy": {
            "ic_5d_oos_mean_min": 0.0,
            "maxdd_proxy_pct_mean_max": 35.0,
            "turnover_proxy_mean_max": 4.0,
            "bootstrap_neg_sharpe_share_proxy_max": 0.65,
        },
        "artifacts": {
            "folds_manifest": str(folds_manifest_path),
            "fold_metrics": str(fold_metrics_path),
            "candidates": str(cand_path),
            "survivors_A": str(surv_path),
        },
    }
    atomic_write_json(report_path, report)

    print(f"run_id={run_id}")
    print(f"panel_rows_used={report['counts']['panel_rows_used']}")
    print(f"candidates_total={cand_df.height}")
    print(f"survivors_A_total={survivors.height}")
    print(f"folds_total={len(folds)}")
    print(f"folds_manifest={folds_manifest_path}")
    print(f"report={report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
