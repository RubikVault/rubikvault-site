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

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--stage-a-run-id", default="", help="Default: latest cheapgateA_tsplits_* run")
    p.add_argument("--outputs-subdir", default="outputs")
    p.add_argument("--candidate-limit", type=int, default=8, help="Max candidates to keep for Stage-B prep shortlist")
    p.add_argument("--ic-mean-min", type=float, default=0.01)
    p.add_argument("--ic-min-min", type=float, default=-0.02)
    p.add_argument("--sharpe-mean-min", type=float, default=0.03)
    p.add_argument("--sharpe-min-min", type=float, default=-0.25)
    p.add_argument("--turnover-mean-max", type=float, default=2.0)
    p.add_argument("--maxdd-mean-max", type=float, default=20.0)
    p.add_argument("--bootstrap-neg-sharpe-share-max", type=float, default=0.5)
    return p.parse_args(list(argv))


def _latest_stage_a_run(quant_root: Path) -> str:
    runs_root = quant_root / "runs"
    cands = [p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("run_id=cheapgateA_tsplits_")]
    if not cands:
        raise FileNotFoundError(f"no Stage-A runs under {runs_root}")
    cands.sort(key=lambda p: p.stat().st_mtime_ns)
    return cands[-1].name.split("=", 1)[1]


def _safe_float(v) -> float | None:
    try:
        if v is None:
            return None
        return float(v)
    except Exception:
        return None


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    stage_a_run_id = args.stage_a_run_id or _latest_stage_a_run(quant_root)
    out_dir = quant_root / "runs" / f"run_id={stage_a_run_id}" / args.outputs_subdir
    if not out_dir.exists():
        raise SystemExit(f"FATAL: stage-a outputs dir not found: {out_dir}")

    report_path = out_dir / "cheap_gate_A_time_splits_report.json"
    folds_manifest_path = out_dir / "folds_manifest.json"
    fold_metrics_path = out_dir / "fold_metrics.parquet"
    candidates_path = out_dir / "candidates.parquet"
    survivors_a_path = out_dir / "survivors_A.parquet"

    for p in [report_path, folds_manifest_path, fold_metrics_path, candidates_path, survivors_a_path]:
        if not p.exists():
            raise SystemExit(f"FATAL: required Stage-A artifact missing: {p}")

    report = read_json(report_path)
    folds_manifest = read_json(folds_manifest_path)
    fold_metrics = pl.read_parquet(fold_metrics_path)
    candidates = pl.read_parquet(candidates_path)
    survivors_a = pl.read_parquet(survivors_a_path)

    fold_count_built = int(((folds_manifest.get("config") or {}).get("fold_count_built")) or 0)
    strict_cfg = {
        "folds_used_min": max(1, fold_count_built),
        "ic_5d_oos_mean_min": float(args.ic_mean_min),
        "ic_5d_oos_min_min": float(args.ic_min_min),
        "oos_sharpe_proxy_mean_min": float(args.sharpe_mean_min),
        "oos_sharpe_proxy_min_min": float(args.sharpe_min_min),
        "turnover_proxy_mean_max": float(args.turnover_mean_max),
        "maxdd_proxy_pct_mean_max": float(args.maxdd_mean_max),
        "bootstrap_neg_sharpe_share_proxy_max": float(args.bootstrap_neg_sharpe_share_max),
    }

    # Fold-level summary (robustness lens)
    fold_summary = (
        fold_metrics.group_by(["fold_id"])
        .agg(
            [
                pl.len().alias("candidate_rows"),
                pl.col("rows").max().alias("rows_max"),
                pl.col("rows").min().alias("rows_min"),
                pl.col("ic_5d").mean().alias("ic_5d_mean"),
                pl.col("ic_5d").std(ddof=1).fill_null(0.0).alias("ic_5d_std"),
                pl.col("oos_sharpe_proxy").mean().alias("oos_sharpe_proxy_mean"),
                pl.col("oos_sharpe_proxy").std(ddof=1).fill_null(0.0).alias("oos_sharpe_proxy_std"),
                pl.col("top_minus_bottom_5d").mean().alias("top_minus_bottom_5d_mean"),
                pl.col("turnover_proxy").mean().alias("turnover_proxy_mean"),
                pl.col("maxdd_proxy_pct").mean().alias("maxdd_proxy_pct_mean"),
            ]
        )
        .sort("fold_id")
    )

    # Candidate fold robustness summary from fold metrics
    cand_fold_robust = (
        fold_metrics.group_by(["candidate_id", "family"])
        .agg(
            [
                pl.len().alias("folds_observed"),
                pl.col("ic_5d").mean().alias("ic_5d_fold_mean"),
                pl.col("ic_5d").min().alias("ic_5d_fold_min"),
                pl.col("ic_5d").max().alias("ic_5d_fold_max"),
                pl.col("ic_5d").std(ddof=1).fill_null(0.0).alias("ic_5d_fold_std"),
                pl.col("oos_sharpe_proxy").mean().alias("oos_sharpe_proxy_fold_mean"),
                pl.col("oos_sharpe_proxy").min().alias("oos_sharpe_proxy_fold_min"),
                pl.col("oos_sharpe_proxy").max().alias("oos_sharpe_proxy_fold_max"),
                pl.col("oos_sharpe_proxy").std(ddof=1).fill_null(0.0).alias("oos_sharpe_proxy_fold_std"),
                pl.col("top_minus_bottom_5d").mean().alias("top_minus_bottom_5d_fold_mean"),
                pl.col("top_minus_bottom_5d").min().alias("top_minus_bottom_5d_fold_min"),
                pl.col("top_minus_bottom_5d").max().alias("top_minus_bottom_5d_fold_max"),
                pl.col("maxdd_proxy_pct").mean().alias("maxdd_proxy_pct_fold_mean"),
            ]
        )
        .sort(["candidate_id"])
    )

    # Join with Stage-A candidate aggregate table, apply stricter proxy gates as Stage-B prep
    prep = candidates.join(cand_fold_robust, on=["candidate_id", "family"], how="left")

    prep = prep.with_columns(
        [
            (pl.col("folds_used") >= strict_cfg["folds_used_min"]).alias("g_folds_used"),
            (pl.col("ic_5d_oos_mean") >= strict_cfg["ic_5d_oos_mean_min"]).alias("g_ic_mean"),
            (pl.col("ic_5d_oos_min") >= strict_cfg["ic_5d_oos_min_min"]).alias("g_ic_min"),
            (pl.col("oos_sharpe_proxy_mean") >= strict_cfg["oos_sharpe_proxy_mean_min"]).alias("g_sharpe_mean"),
            (pl.col("oos_sharpe_proxy_min") >= strict_cfg["oos_sharpe_proxy_min_min"]).alias("g_sharpe_min"),
            (pl.col("turnover_proxy_mean") <= strict_cfg["turnover_proxy_mean_max"]).alias("g_turnover"),
            (pl.col("maxdd_proxy_pct_mean") <= strict_cfg["maxdd_proxy_pct_mean_max"]).alias("g_maxdd"),
            (
                pl.col("bootstrap_neg_sharpe_share_proxy") <= strict_cfg["bootstrap_neg_sharpe_share_proxy_max"]
            ).alias("g_bootstrap_neg_sharpe"),
        ]
    )

    gate_cols = [
        "g_folds_used",
        "g_ic_mean",
        "g_ic_min",
        "g_sharpe_mean",
        "g_sharpe_min",
        "g_turnover",
        "g_maxdd",
        "g_bootstrap_neg_sharpe",
    ]
    prep = prep.with_columns(
        [
            pl.all_horizontal([pl.col(c) for c in gate_cols]).alias("stage_b_prep_strict_pass"),
            (
                pl.when(pl.col("ic_5d_fold_std").is_not_null())
                .then(pl.col("ic_5d_fold_std"))
                .otherwise(pl.lit(0.0))
            ).alias("ic_dispersion_proxy"),
            (
                pl.when(pl.col("oos_sharpe_proxy_fold_std").is_not_null())
                .then(pl.col("oos_sharpe_proxy_fold_std"))
                .otherwise(pl.lit(0.0))
            ).alias("sharpe_dispersion_proxy"),
        ]
    )

    # Deterministic sorting for shortlist
    prep_sorted = prep.sort(
        [
            "stage_b_prep_strict_pass",
            "ic_5d_oos_mean",
            "oos_sharpe_proxy_mean",
            "top_minus_bottom_5d_mean",
            "candidate_id",
        ],
        descending=[True, True, True, True, False],
    )
    shortlist = prep_sorted.head(int(args.candidate_limit))
    strict_survivors = prep_sorted.filter(pl.col("stage_b_prep_strict_pass"))

    # Reason breakdown for non-passing candidates
    def fail_reasons_for_row(row: dict) -> list[str]:
        reasons = []
        if not row.get("g_folds_used", False):
            reasons.append("INSUFFICIENT_FOLDS")
        if not row.get("g_ic_mean", False):
            reasons.append("IC_MEAN_BELOW_STRICT")
        if not row.get("g_ic_min", False):
            reasons.append("IC_FOLD_MIN_BELOW_STRICT")
        if not row.get("g_sharpe_mean", False):
            reasons.append("SHARPE_MEAN_BELOW_STRICT")
        if not row.get("g_sharpe_min", False):
            reasons.append("SHARPE_FOLD_MIN_BELOW_STRICT")
        if not row.get("g_turnover", False):
            reasons.append("TURNOVER_TOO_HIGH")
        if not row.get("g_maxdd", False):
            reasons.append("MAXDD_PROXY_TOO_HIGH")
        if not row.get("g_bootstrap_neg_sharpe", False):
            reasons.append("BOOTSTRAP_NEG_SHARPE_SHARE_TOO_HIGH")
        return reasons

    non_pass_reason_counts: dict[str, int] = {}
    failed_examples: list[dict] = []
    for row in prep_sorted.to_dicts():
        if row.get("stage_b_prep_strict_pass"):
            continue
        reasons = fail_reasons_for_row(row)
        for r in reasons:
            non_pass_reason_counts[r] = non_pass_reason_counts.get(r, 0) + 1
        if len(failed_examples) < 10:
            failed_examples.append(
                {
                    "candidate_id": row.get("candidate_id"),
                    "family": row.get("family"),
                    "reasons": reasons,
                    "ic_5d_oos_mean": _safe_float(row.get("ic_5d_oos_mean")),
                    "oos_sharpe_proxy_mean": _safe_float(row.get("oos_sharpe_proxy_mean")),
                    "maxdd_proxy_pct_mean": _safe_float(row.get("maxdd_proxy_pct_mean")),
                    "bootstrap_neg_sharpe_share_proxy": _safe_float(row.get("bootstrap_neg_sharpe_share_proxy")),
                }
            )

    # Output paths
    stageb_dir = out_dir / "stage_b_prep"
    stageb_dir.mkdir(parents=True, exist_ok=True)
    fold_summary_path = stageb_dir / "fold_summary.parquet"
    cand_robust_path = stageb_dir / "candidate_fold_robustness.parquet"
    prep_table_path = stageb_dir / "stage_b_prep_candidates.parquet"
    shortlist_path = stageb_dir / "stage_b_prep_shortlist.parquet"
    strict_survivors_path = stageb_dir / "stage_b_prep_strict_survivors.parquet"
    report_out_path = stageb_dir / "stage_b_prep_report.json"

    fold_summary.write_parquet(fold_summary_path)
    cand_fold_robust.write_parquet(cand_robust_path)
    prep_sorted.write_parquet(prep_table_path)
    shortlist.write_parquet(shortlist_path)
    strict_survivors.write_parquet(strict_survivors_path)

    report_out = {
        "schema": "quantlab_stage_b_prep_report_q1_v1",
        "generated_at": utc_now_iso(),
        "stage_a_run_id": stage_a_run_id,
        "inputs": {
            "stage_a_outputs_dir": str(out_dir),
            "cheap_gate_report": str(report_path),
            "folds_manifest": str(folds_manifest_path),
            "fold_metrics": str(fold_metrics_path),
            "candidates": str(candidates_path),
            "survivors_A": str(survivors_a_path),
        },
        "stage_b_prep_policy": {
            "type": "strict_proxy_gates_before_stage_b_expensive",
            "note": "Preparation layer only; still proxy-based and not a full CPCV/DSR/PSR implementation.",
            "strict_gates": strict_cfg,
            "candidate_limit": int(args.candidate_limit),
        },
        "counts": {
            "stage_a_candidates_total": int(candidates.height),
            "stage_a_survivors_A_total": int(survivors_a.height),
            "fold_metrics_rows_total": int(fold_metrics.height),
            "folds_total": int(fold_summary.height),
            "stage_b_prep_strict_survivors_total": int(strict_survivors.height),
            "shortlist_total": int(shortlist.height),
        },
        "folds_summary": {
            "folds_manifest_config": folds_manifest.get("config"),
            "folds": fold_summary.to_dicts(),
        },
        "gate_fail_reason_counts": dict(sorted(non_pass_reason_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "failed_examples": failed_examples,
        "artifacts": {
            "stage_b_prep_dir": str(stageb_dir),
            "fold_summary": str(fold_summary_path),
            "candidate_fold_robustness": str(cand_robust_path),
            "stage_b_prep_candidates": str(prep_table_path),
            "stage_b_prep_shortlist": str(shortlist_path),
            "stage_b_prep_strict_survivors": str(strict_survivors_path),
        },
        "hashes": {
            "cheap_gate_report_hash": stable_hash_file(report_path),
            "folds_manifest_hash": stable_hash_file(folds_manifest_path),
            "fold_metrics_hash": stable_hash_file(fold_metrics_path),
            "candidates_hash": stable_hash_file(candidates_path),
            "survivors_A_hash": stable_hash_file(survivors_a_path),
        },
    }

    atomic_write_json(report_out_path, report_out)

    print(f"stage_a_run_id={stage_a_run_id}")
    print(f"stage_b_prep_dir={stageb_dir}")
    print(f"strict_survivors_total={report_out['counts']['stage_b_prep_strict_survivors_total']}")
    print(f"shortlist_total={report_out['counts']['shortlist_total']}")
    print(f"report={report_out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
