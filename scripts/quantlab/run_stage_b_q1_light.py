#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import math
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
    p.add_argument("--strict-survivors-max", type=int, default=8)
    # Stricter Q1 proxy gates (still not full CPCV/DSR/PSR production)
    p.add_argument("--ic-mean-min", type=float, default=0.01)
    p.add_argument("--ic-min-min", type=float, default=-0.02)
    p.add_argument("--sharpe-mean-min", type=float, default=0.03)
    p.add_argument("--sharpe-min-min", type=float, default=-0.25)
    p.add_argument("--turnover-mean-max", type=float, default=2.0)
    p.add_argument("--maxdd-mean-max", type=float, default=20.0)
    p.add_argument("--bootstrap-neg-sharpe-share-max", type=float, default=0.5)
    p.add_argument("--psr-proxy-min", type=float, default=0.60)
    p.add_argument("--dsr-proxy-min", type=float, default=0.50)
    p.add_argument("--cpcv-light-sharpe-min", type=float, default=0.00)
    p.add_argument("--cpcv-light-neg-share-max", type=float, default=0.50)
    return p.parse_args(list(argv))


def _latest_stage_a_run(quant_root: Path) -> str:
    runs_root = quant_root / "runs"
    cands = [p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("run_id=cheapgateA_tsplits_")]
    if not cands:
        raise FileNotFoundError(f"no Stage-A runs under {runs_root}")
    cands.sort(key=lambda p: p.stat().st_mtime_ns)
    return cands[-1].name.split("=", 1)[1]


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


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


def _psr_proxy(sharpes: list[float]) -> float:
    n = len(sharpes)
    if n <= 0:
        return 0.0
    m = sum(sharpes) / n
    if n == 1:
        return 1.0 if m > 0 else 0.0
    var = sum((x - m) ** 2 for x in sharpes) / max(1, n - 1)
    sd = math.sqrt(max(var, 1e-12))
    se = sd / math.sqrt(n)
    z = m / max(se, 1e-12)
    return float(max(0.0, min(1.0, _norm_cdf(z))))


def _dsr_proxy(psr_proxy: float, candidate_count: int, baseline: int | None = None) -> float:
    # Simple multiple-testing penalty proxy. Conservative but deterministic.
    if baseline is None:
        baseline = max(2, int(candidate_count))
    penalty = 0.0
    if candidate_count > 1:
        penalty = min(0.30, 0.05 * math.log2(max(candidate_count, baseline)))
    return float(max(0.0, min(1.0, psr_proxy - penalty)))


def _cpcv_light_metrics(sharpes: list[float]) -> dict:
    # Q1-light proxy: evaluate all non-trivial combinations from ceil(n/2) to n-1 on fold metrics.
    n = len(sharpes)
    if n <= 1:
        val = sharpes[0] if sharpes else 0.0
        return {
            "paths_total": 1 if sharpes else 0,
            "combo_sizes": [1] if sharpes else [],
            "combo_policy": "single_fold_or_trivial",
            "mean_sharpe_across_paths": float(val),
            "min_sharpe_across_paths": float(val),
            "neg_share_across_paths": 1.0 if val < 0 else 0.0,
            "std_sharpe_across_paths": 0.0,
        }
    combo_sizes = list(range(max(1, (n + 1) // 2), n))
    if not combo_sizes:
        combo_sizes = [1]
    vals: list[float] = []
    for k in combo_sizes:
        for idxs in itertools.combinations(range(n), k):
            avg = sum(sharpes[i] for i in idxs) / len(idxs)
            vals.append(float(avg))
    if not vals:
        vals = [sum(sharpes) / n]
    mean_v = sum(vals) / len(vals)
    neg_share = sum(1 for v in vals if v < 0) / len(vals)
    std_v = 0.0 if len(vals) <= 1 else math.sqrt(sum((v - mean_v) ** 2 for v in vals) / (len(vals) - 1))
    return {
        "paths_total": len(vals),
        "combo_sizes": combo_sizes,
        "combo_policy": "all_combo_sizes_from_ceil_half_to_n_minus_1",
        "mean_sharpe_across_paths": float(mean_v),
        "min_sharpe_across_paths": float(min(vals)),
        "neg_share_across_paths": float(neg_share),
        "std_sharpe_across_paths": float(std_v),
    }


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
            raise SystemExit(f"FATAL: missing Stage-A artifact: {p}")

    report = read_json(report_path)
    folds_manifest = read_json(folds_manifest_path)
    fold_metrics = pl.read_parquet(fold_metrics_path)
    candidates = pl.read_parquet(candidates_path)
    survivors_a = pl.read_parquet(survivors_a_path)

    # Candidate-level fold lists from fold metrics
    per_candidate: dict[str, dict] = {}
    for row in fold_metrics.to_dicts():
        cid = str(row.get("candidate_id") or "")
        fam = str(row.get("family") or "")
        if not cid:
            continue
        bucket = per_candidate.setdefault(
            cid,
            {"candidate_id": cid, "family": fam, "fold_sharpes": [], "fold_ics": [], "fold_ids": []},
        )
        bucket["fold_ids"].append(str(row.get("fold_id") or ""))
        bucket["fold_sharpes"].append(_safe_float(row.get("oos_sharpe_proxy")))
        bucket["fold_ics"].append(_safe_float(row.get("ic_5d")))

    cand_count = max(1, int(candidates.height))
    rows = []
    for row in candidates.to_dicts():
        cid = str(row.get("candidate_id") or "")
        extra = per_candidate.get(cid) or {"fold_sharpes": [], "fold_ics": [], "fold_ids": []}
        fold_sharpes = [float(x) for x in extra.get("fold_sharpes", [])]
        fold_ics = [float(x) for x in extra.get("fold_ics", [])]
        psr = _psr_proxy(fold_sharpes)
        dsr = _dsr_proxy(psr, cand_count)
        cpcv = _cpcv_light_metrics(fold_sharpes)
        rows.append(
            {
                **row,
                "psr_proxy": psr,
                "dsr_proxy": dsr,
                "cpcv_light_paths_total": int(cpcv["paths_total"]),
                "cpcv_light_sharpe_mean": float(cpcv["mean_sharpe_across_paths"]),
                "cpcv_light_sharpe_min": float(cpcv["min_sharpe_across_paths"]),
                "cpcv_light_neg_sharpe_share": float(cpcv["neg_share_across_paths"]),
                "cpcv_light_sharpe_std": float(cpcv["std_sharpe_across_paths"]),
                "ic_fold_std_proxy": float(0.0 if len(fold_ics) <= 1 else pl.Series(fold_ics).std(ddof=1) or 0.0),
                "folds_observed_from_metrics": int(len(fold_sharpes)),
            }
        )

    stageb_df = pl.DataFrame(rows)
    strict_cfg = {
        "folds_used_min": int(max(1, ((folds_manifest.get("config") or {}).get("fold_count_built") or 1))),
        "ic_5d_oos_mean_min": float(args.ic_mean_min),
        "ic_5d_oos_min_min": float(args.ic_min_min),
        "oos_sharpe_proxy_mean_min": float(args.sharpe_mean_min),
        "oos_sharpe_proxy_min_min": float(args.sharpe_min_min),
        "turnover_proxy_mean_max": float(args.turnover_mean_max),
        "maxdd_proxy_pct_mean_max": float(args.maxdd_mean_max),
        "bootstrap_neg_sharpe_share_proxy_max": float(args.bootstrap_neg_sharpe_share_max),
        "psr_proxy_min": float(args.psr_proxy_min),
        "dsr_proxy_min": float(args.dsr_proxy_min),
        "cpcv_light_sharpe_min_min": float(args.cpcv_light_sharpe_min),
        "cpcv_light_neg_sharpe_share_max": float(args.cpcv_light_neg_share_max),
    }
    gate_cols = [
        ("g_folds_used", pl.col("folds_used") >= strict_cfg["folds_used_min"]),
        ("g_ic_mean", pl.col("ic_5d_oos_mean") >= strict_cfg["ic_5d_oos_mean_min"]),
        ("g_ic_min", pl.col("ic_5d_oos_min") >= strict_cfg["ic_5d_oos_min_min"]),
        ("g_sharpe_mean", pl.col("oos_sharpe_proxy_mean") >= strict_cfg["oos_sharpe_proxy_mean_min"]),
        ("g_sharpe_min", pl.col("oos_sharpe_proxy_min") >= strict_cfg["oos_sharpe_proxy_min_min"]),
        ("g_turnover", pl.col("turnover_proxy_mean") <= strict_cfg["turnover_proxy_mean_max"]),
        ("g_maxdd", pl.col("maxdd_proxy_pct_mean") <= strict_cfg["maxdd_proxy_pct_mean_max"]),
        (
            "g_bootstrap_neg_sharpe",
            pl.col("bootstrap_neg_sharpe_share_proxy") <= strict_cfg["bootstrap_neg_sharpe_share_proxy_max"],
        ),
        ("g_psr_proxy", pl.col("psr_proxy") >= strict_cfg["psr_proxy_min"]),
        ("g_dsr_proxy", pl.col("dsr_proxy") >= strict_cfg["dsr_proxy_min"]),
        ("g_cpcv_light_sharpe_min", pl.col("cpcv_light_sharpe_min") >= strict_cfg["cpcv_light_sharpe_min_min"]),
        (
            "g_cpcv_light_neg_share",
            pl.col("cpcv_light_neg_sharpe_share") <= strict_cfg["cpcv_light_neg_sharpe_share_max"],
        ),
    ]
    stageb_df = stageb_df.with_columns([expr.alias(name) for name, expr in gate_cols])
    stageb_df = stageb_df.with_columns(
        pl.all_horizontal([pl.col(name) for name, _ in gate_cols]).alias("stage_b_q1_light_pass")
    )
    stageb_sorted = stageb_df.sort(
        ["stage_b_q1_light_pass", "dsr_proxy", "psr_proxy", "ic_5d_oos_mean", "candidate_id"],
        descending=[True, True, True, True, False],
    )
    survivors_b = stageb_sorted.filter(pl.col("stage_b_q1_light_pass")).head(int(args.strict_survivors_max))

    # Fold summary for report (from folds manifest + fold metrics)
    fold_summary = (
        fold_metrics.group_by("fold_id")
        .agg(
            pl.len().alias("candidate_rows"),
            pl.col("rows").max().alias("rows_max"),
            pl.col("ic_5d").mean().alias("ic_5d_mean"),
            pl.col("oos_sharpe_proxy").mean().alias("oos_sharpe_proxy_mean"),
            pl.col("oos_sharpe_proxy").min().alias("oos_sharpe_proxy_min"),
            pl.col("oos_sharpe_proxy").max().alias("oos_sharpe_proxy_max"),
        )
        .sort("fold_id")
    )

    # Failure reasons
    gate_names = [name for name, _ in gate_cols]
    fail_reason_counts: dict[str, int] = {}
    examples: list[dict] = []
    for row in stageb_sorted.to_dicts():
        if row.get("stage_b_q1_light_pass"):
            continue
        reasons = []
        for g in gate_names:
            if not bool(row.get(g)):
                reasons.append(g)
                fail_reason_counts[g] = fail_reason_counts.get(g, 0) + 1
        if len(examples) < 10:
            examples.append(
                {
                    "candidate_id": row.get("candidate_id"),
                    "family": row.get("family"),
                    "reasons": reasons,
                    "ic_5d_oos_mean": _safe_float(row.get("ic_5d_oos_mean")),
                    "oos_sharpe_proxy_mean": _safe_float(row.get("oos_sharpe_proxy_mean")),
                    "psr_proxy": _safe_float(row.get("psr_proxy")),
                    "dsr_proxy": _safe_float(row.get("dsr_proxy")),
                    "cpcv_light_sharpe_min": _safe_float(row.get("cpcv_light_sharpe_min")),
                    "cpcv_light_neg_sharpe_share": _safe_float(row.get("cpcv_light_neg_sharpe_share")),
                }
            )

    stageb_dir = out_dir / "stage_b_light"
    stageb_dir.mkdir(parents=True, exist_ok=True)
    candidates_out = stageb_dir / "stage_b_light_candidates.parquet"
    survivors_out = stageb_dir / "survivors_B_light.parquet"
    fold_summary_out = stageb_dir / "fold_summary.parquet"
    report_out_path = stageb_dir / "stage_b_light_report.json"
    stageb_sorted.write_parquet(candidates_out)
    survivors_b.write_parquet(survivors_out)
    fold_summary.write_parquet(fold_summary_out)

    report_out = {
        "schema": "quantlab_stage_b_light_q1_v1",
        "generated_at": utc_now_iso(),
        "stage_a_run_id": stage_a_run_id,
        "method": {
            "type": "q1_stage_b_light",
            "fold_policy": "reuses Stage-A anchored folds; CPCV-light combinations on fold metrics only (proxy)",
            "cpcv_light_combo_policy": "all_combo_sizes_from_ceil_half_to_n_minus_1",
            "notes": [
                "This is a Q1-light Stage B approximation, not full CPCV with per-path re-scoring.",
                "Adds stricter gates plus PSR/DSR proxies and combinational fold robustness proxy.",
            ],
        },
        "inputs": {
            "stage_a_report": str(report_path),
            "folds_manifest": str(folds_manifest_path),
            "fold_metrics": str(fold_metrics_path),
            "candidates": str(candidates_path),
            "survivors_A": str(survivors_a_path),
        },
        "strict_gates": strict_cfg,
        "counts": {
            "stage_a_candidates_total": int(candidates.height),
            "stage_a_survivors_A_total": int(survivors_a.height),
            "stage_b_candidates_total": int(stageb_sorted.height),
            "survivors_B_light_total": int(survivors_b.height),
            "folds_total": int(fold_summary.height),
        },
        "folds_summary": {
            "folds_config": folds_manifest.get("config"),
            "folds": fold_summary.to_dicts(),
        },
        "fail_reason_counts": dict(sorted(fail_reason_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "failed_examples": examples,
        "artifacts": {
            "stage_b_light_dir": str(stageb_dir),
            "stage_b_light_candidates": str(candidates_out),
            "survivors_B_light": str(survivors_out),
            "fold_summary": str(fold_summary_out),
        },
        "hashes": {
            "stage_a_report_hash": stable_hash_file(report_path),
            "folds_manifest_hash": stable_hash_file(folds_manifest_path),
            "fold_metrics_hash": stable_hash_file(fold_metrics_path),
            "candidates_hash": stable_hash_file(candidates_path),
            "survivors_A_hash": stable_hash_file(survivors_a_path),
        },
    }
    atomic_write_json(report_out_path, report_out)

    print(f"stage_a_run_id={stage_a_run_id}")
    print(f"survivors_B_light_total={report_out['counts']['survivors_B_light_total']}")
    print(f"report={report_out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
