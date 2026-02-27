#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import math
import random
import sys
from datetime import date
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
    p.add_argument("--psr-bootstrap-proxy-min", type=float, default=0.55)
    p.add_argument("--dsr-bootstrap-proxy-min", type=float, default=0.45)
    p.add_argument("--bootstrap-resamples", type=int, default=512)
    p.add_argument("--cpcv-light-sharpe-min", type=float, default=0.00)
    p.add_argument("--cpcv-light-neg-share-max", type=float, default=0.50)
    p.add_argument("--stress-lite-sharpe-mean-min", type=float, default=-0.05)
    p.add_argument("--stress-lite-maxdd-mean-max", type=float, default=28.0)
    p.add_argument("--stress-lite-fail-share-max", type=float, default=0.34)
    p.add_argument("--fold-count-min", type=int, default=3)
    p.add_argument("--embargo-days-min", type=int, default=2)
    p.add_argument("--test-days-min", type=int, default=5)
    p.add_argument("--min-train-days-min", type=int, default=8)
    p.add_argument("--ic-fold-std-max", type=float, default=0.20)
    p.add_argument("--cpcv-light-p25-min", type=float, default=-0.02)
    p.add_argument("--cpcv-light-min-combo-size", type=int, default=1)
    p.add_argument("--require-fold-policy-valid", action="store_true", default=True)
    p.add_argument("--skip-fold-policy-valid", dest="require_fold_policy_valid", action="store_false")
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


def _seed_from_key(key: str) -> int:
    # Deterministic small seed derived from string content (portable across runs).
    acc = 2166136261
    for ch in key:
        acc ^= ord(ch)
        acc = (acc * 16777619) & 0xFFFFFFFF
    return int(acc or 1)


def _psr_bootstrap_proxy(sharpes: list[float], *, resamples: int, seed_key: str) -> float:
    n = len(sharpes)
    if n <= 0:
        return 0.0
    if n == 1:
        return 1.0 if float(sharpes[0]) > 0 else 0.0
    rnd = random.Random(_seed_from_key(seed_key))
    pos = 0
    vals = [float(x) for x in sharpes]
    rs_n = max(32, int(resamples))
    for _ in range(rs_n):
        sample = [vals[rnd.randrange(n)] for _ in range(n)]
        if (sum(sample) / n) > 0:
            pos += 1
    return float(pos / rs_n)


def _dsr_proxy(psr_proxy: float, candidate_count: int, baseline: int | None = None) -> float:
    # Simple multiple-testing penalty proxy. Conservative but deterministic.
    if baseline is None:
        baseline = max(2, int(candidate_count))
    penalty = 0.0
    if candidate_count > 1:
        penalty = min(0.30, 0.05 * math.log2(max(candidate_count, baseline)))
    return float(max(0.0, min(1.0, psr_proxy - penalty)))


def _parse_day(s: str) -> date | None:
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _validate_folds_manifest(
    folds_manifest: dict,
    *,
    fold_count_min: int,
    embargo_days_min: int,
    test_days_min: int,
    min_train_days_min: int,
) -> dict:
    cfg = folds_manifest.get("config") or {}
    folds = list(folds_manifest.get("folds") or [])
    errors: list[str] = []
    warnings: list[str] = []
    built = int(cfg.get("fold_count_built") or len(folds) or 0)
    if built != len(folds):
        warnings.append(f"fold_count_built_mismatch:{built}!={len(folds)}")
    if len(folds) <= 0:
        errors.append("NO_FOLDS")
    if built < int(fold_count_min):
        errors.append(f"FOLD_COUNT_BELOW_MIN:{built}<{int(fold_count_min)}")
    cfg_test_days = int(cfg.get("test_days") or 0)
    if cfg_test_days and cfg_test_days < int(test_days_min):
        errors.append(f"TEST_DAYS_BELOW_MIN:{cfg_test_days}<{int(test_days_min)}")
    cfg_emb = int(cfg.get("embargo_days") or 0)
    if cfg_emb and cfg_emb < int(embargo_days_min):
        errors.append(f"EMBARGO_DAYS_BELOW_MIN:{cfg_emb}<{int(embargo_days_min)}")
    cfg_min_train = int(cfg.get("min_train_days") or 0)
    if cfg_min_train and cfg_min_train < int(min_train_days_min):
        errors.append(f"MIN_TRAIN_DAYS_BELOW_MIN:{cfg_min_train}<{int(min_train_days_min)}")
    prev_test_end = None
    anchor_train_start = None
    seen_fold_ids: set[str] = set()
    for idx, f in enumerate(folds, start=1):
        fid = str(f.get("fold_id") or f"fold_{idx}")
        if fid in seen_fold_ids:
            errors.append(f"DUPLICATE_FOLD_ID:{fid}")
        seen_fold_ids.add(fid)
        train_start = _parse_day(f.get("train_start"))
        train_end = _parse_day(f.get("train_end"))
        test_start = _parse_day(f.get("test_start"))
        test_end = _parse_day(f.get("test_end"))
        if not all([train_start, train_end, test_start, test_end]):
            errors.append(f"MISSING_OR_INVALID_DATES:{fid}")
            continue
        if not (train_start <= train_end < test_start <= test_end):
            errors.append(f"NON_MONOTONIC_WINDOWS:{fid}")
        if anchor_train_start is None:
            anchor_train_start = train_start
        elif train_start != anchor_train_start:
            warnings.append(f"ANCHOR_DRIFT:{fid}")
        if prev_test_end is not None and test_start <= prev_test_end:
            errors.append(f"TEST_WINDOW_OVERLAP:{fid}")
        prev_test_end = test_end
        cfg_test_days = int(cfg.get("test_days") or 0)
        if cfg_test_days and int(f.get("test_days") or 0) != cfg_test_days:
            warnings.append(f"TEST_DAYS_MISMATCH:{fid}")
        if int(f.get("test_days") or 0) < int(test_days_min):
            errors.append(f"TEST_DAYS_BELOW_MIN_PER_FOLD:{fid}")
        if int(f.get("train_days") or 0) < int(min_train_days_min):
            errors.append(f"TRAIN_DAYS_BELOW_MIN_PER_FOLD:{fid}")
        cfg_emb = int(cfg.get("embargo_days") or 0)
        if cfg_emb and int(f.get("embargo_days") or 0) != cfg_emb:
            warnings.append(f"EMBARGO_DAYS_MISMATCH:{fid}")
        if int(f.get("embargo_days") or 0) < int(embargo_days_min):
            errors.append(f"EMBARGO_DAYS_BELOW_MIN_PER_FOLD:{fid}")
        # Calendar-day gap is a lower-confidence proxy because folds are as-of trading dates.
        cal_gap = (test_start - train_end).days - 1
        if cfg_emb and cal_gap < 0:
            errors.append(f"NEGATIVE_EMBARGO_GAP:{fid}")
        if cal_gap < int(embargo_days_min):
            warnings.append(f"LOW_CALENDAR_EMBARGO_GAP:{fid}:{cal_gap}")
    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "folds_total": len(folds),
            "fold_ids_unique": len(seen_fold_ids),
        },
        "config": cfg,
        "requirements": {
            "fold_count_min": int(fold_count_min),
            "embargo_days_min": int(embargo_days_min),
            "test_days_min": int(test_days_min),
            "min_train_days_min": int(min_train_days_min),
        },
    }


def _quantile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    q = max(0.0, min(1.0, float(q)))
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    idx = int(round(q * (len(sorted_values) - 1)))
    idx = max(0, min(len(sorted_values) - 1, idx))
    return float(sorted_values[idx])


def _cpcv_light_metrics(sharpes: list[float], *, min_combo_size: int = 1) -> dict:
    # Q1-light proxy: evaluate combinations from min_combo_size to n-1 on fold metrics.
    n = len(sharpes)
    if n <= 1:
        val = sharpes[0] if sharpes else 0.0
        return {
            "paths_total": 1 if sharpes else 0,
            "combo_sizes": [1] if sharpes else [],
            "combo_policy": "single_fold_or_trivial",
            "mean_sharpe_across_paths": float(val),
            "min_sharpe_across_paths": float(val),
            "p25_sharpe_across_paths": float(val),
            "p10_sharpe_across_paths": float(val),
            "neg_share_across_paths": 1.0 if val < 0 else 0.0,
            "std_sharpe_across_paths": 0.0,
        }
    combo_sizes = list(range(max(1, int(min_combo_size)), n))
    if not combo_sizes:
        combo_sizes = [1]
    vals: list[float] = []
    for k in combo_sizes:
        for idxs in itertools.combinations(range(n), k):
            avg = sum(sharpes[i] for i in idxs) / len(idxs)
            vals.append(float(avg))
    if not vals:
        vals = [sum(sharpes) / n]
    vals_sorted = sorted(vals)
    mean_v = sum(vals) / len(vals)
    neg_share = sum(1 for v in vals if v < 0) / len(vals)
    std_v = 0.0 if len(vals) <= 1 else math.sqrt(sum((v - mean_v) ** 2 for v in vals) / (len(vals) - 1))
    return {
        "paths_total": len(vals),
        "combo_sizes": combo_sizes,
        "combo_policy": "all_combo_sizes_from_min_combo_size_to_n_minus_1",
        "mean_sharpe_across_paths": float(mean_v),
        "min_sharpe_across_paths": float(min(vals_sorted)),
        "p25_sharpe_across_paths": _quantile(vals_sorted, 0.25),
        "p10_sharpe_across_paths": _quantile(vals_sorted, 0.10),
        "neg_share_across_paths": float(neg_share),
        "std_sharpe_across_paths": float(std_v),
    }


def _stress_lite_metrics(fold_sharpes: list[float], fold_turnovers: list[float], fold_maxdds: list[float]) -> dict:
    n = len(fold_sharpes)
    if n <= 0:
        return {
            "scenario_count": 0,
            "worst_mean_sharpe": 0.0,
            "worst_mean_maxdd": 0.0,
            "fail_share": 1.0,
            "scenario_failures": [],
        }
    sharpes = [float(x) for x in fold_sharpes]
    turnovers = [float(x) for x in fold_turnovers[:n]] + [0.0] * max(0, n - len(fold_turnovers))
    maxdds = [float(x) for x in fold_maxdds[:n]] + [0.0] * max(0, n - len(fold_maxdds))
    scenarios = [
        {"id": "slippage_x2", "sharpe_penalty_base": 0.03, "turnover_mult": 8.0, "maxdd_mult": 1.15},
        {"id": "slippage_x3_spreadfloor", "sharpe_penalty_base": 0.06, "turnover_mult": 14.0, "maxdd_mult": 1.30},
        {"id": "liquidity_shock_adv50", "sharpe_penalty_base": 0.08, "turnover_mult": 18.0, "maxdd_mult": 1.45},
        {"id": "correlation_spike", "sharpe_penalty_base": 0.05, "turnover_mult": 10.0, "maxdd_mult": 1.35},
    ]
    failures: list[str] = []
    worst_mean_sharpe = None
    worst_mean_maxdd = None
    scenario_rows = []
    for sc in scenarios:
        stressed_sharpes = []
        stressed_maxdds = []
        for sh, to, dd in zip(sharpes, turnovers, maxdds):
            penalty = float(sc["sharpe_penalty_base"] + sc["turnover_mult"] * max(0.0, to))
            stressed_sharpes.append(float(sh - penalty))
            stressed_maxdds.append(float(dd * float(sc["maxdd_mult"])))
        mean_sh = sum(stressed_sharpes) / len(stressed_sharpes)
        mean_dd = sum(stressed_maxdds) / len(stressed_maxdds)
        scenario_rows.append({"scenario_id": sc["id"], "mean_sharpe": mean_sh, "mean_maxdd": mean_dd})
        if worst_mean_sharpe is None or mean_sh < worst_mean_sharpe:
            worst_mean_sharpe = mean_sh
        if worst_mean_maxdd is None or mean_dd > worst_mean_maxdd:
            worst_mean_maxdd = mean_dd
    return {
        "scenario_count": len(scenarios),
        "worst_mean_sharpe": float(worst_mean_sharpe or 0.0),
        "worst_mean_maxdd": float(worst_mean_maxdd or 0.0),
        "fail_share": 0.0,  # filled by caller after thresholds are known
        "scenario_rows": scenario_rows,
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
    fold_policy_validation = _validate_folds_manifest(
        folds_manifest,
        fold_count_min=int(args.fold_count_min),
        embargo_days_min=int(args.embargo_days_min),
        test_days_min=int(args.test_days_min),
        min_train_days_min=int(args.min_train_days_min),
    )
    fold_metrics = pl.read_parquet(fold_metrics_path)
    candidates = pl.read_parquet(candidates_path)
    survivors_a = pl.read_parquet(survivors_a_path)
    if args.require_fold_policy_valid and not bool(fold_policy_validation.get("ok")):
        raise SystemExit(f"FATAL: invalid folds manifest policy: {fold_policy_validation.get('errors')}")

    # Candidate-level fold lists from fold metrics
    per_candidate: dict[str, dict] = {}
    for row in fold_metrics.to_dicts():
        cid = str(row.get("candidate_id") or "")
        fam = str(row.get("family") or "")
        if not cid:
            continue
        bucket = per_candidate.setdefault(
            cid,
            {
                "candidate_id": cid,
                "family": fam,
                "fold_sharpes": [],
                "fold_ics": [],
                "fold_ids": [],
                "fold_turnovers": [],
                "fold_maxdds": [],
            },
        )
        bucket["fold_ids"].append(str(row.get("fold_id") or ""))
        bucket["fold_sharpes"].append(_safe_float(row.get("oos_sharpe_proxy")))
        bucket["fold_ics"].append(_safe_float(row.get("ic_5d")))
        bucket["fold_turnovers"].append(_safe_float(row.get("turnover_proxy")))
        bucket["fold_maxdds"].append(_safe_float(row.get("maxdd_proxy_pct")))

    cand_count = max(1, int(candidates.height))
    rows = []
    stress_rows = []
    for row in candidates.to_dicts():
        cid = str(row.get("candidate_id") or "")
        extra = per_candidate.get(cid) or {"fold_sharpes": [], "fold_ics": [], "fold_ids": [], "fold_turnovers": [], "fold_maxdds": []}
        fold_sharpes = [float(x) for x in extra.get("fold_sharpes", [])]
        fold_ics = [float(x) for x in extra.get("fold_ics", [])]
        fold_turnovers = [float(x) for x in extra.get("fold_turnovers", [])]
        fold_maxdds = [float(x) for x in extra.get("fold_maxdds", [])]
        psr = _psr_proxy(fold_sharpes)
        dsr = _dsr_proxy(psr, cand_count)
        psr_boot = _psr_bootstrap_proxy(
            fold_sharpes,
            resamples=max(32, int(args.bootstrap_resamples)),
            seed_key=f"{stage_a_run_id}:{cid}:psr_boot",
        )
        dsr_boot = _dsr_proxy(psr_boot, cand_count)
        cpcv = _cpcv_light_metrics(
            fold_sharpes,
            min_combo_size=max(1, int(args.cpcv_light_min_combo_size)),
        )
        stress = _stress_lite_metrics(fold_sharpes, fold_turnovers, fold_maxdds)
        rows.append(
            {
                **row,
                "psr_proxy": psr,
                "dsr_proxy": dsr,
                "psr_bootstrap_proxy": psr_boot,
                "dsr_bootstrap_proxy": dsr_boot,
                "cpcv_light_paths_total": int(cpcv["paths_total"]),
                "cpcv_light_sharpe_mean": float(cpcv["mean_sharpe_across_paths"]),
                "cpcv_light_sharpe_min": float(cpcv["min_sharpe_across_paths"]),
                "cpcv_light_sharpe_p25": float(cpcv["p25_sharpe_across_paths"]),
                "cpcv_light_sharpe_p10": float(cpcv["p10_sharpe_across_paths"]),
                "cpcv_light_neg_sharpe_share": float(cpcv["neg_share_across_paths"]),
                "cpcv_light_sharpe_std": float(cpcv["std_sharpe_across_paths"]),
                "ic_fold_std_proxy": float(0.0 if len(fold_ics) <= 1 else pl.Series(fold_ics).std(ddof=1) or 0.0),
                "folds_observed_from_metrics": int(len(fold_sharpes)),
                "stress_lite_scenarios_total": int(stress["scenario_count"]),
                "stress_lite_worst_mean_sharpe": float(stress["worst_mean_sharpe"]),
                "stress_lite_worst_mean_maxdd": float(stress["worst_mean_maxdd"]),
            }
        )
        for sr in stress.get("scenario_rows", []):
            stress_rows.append(
                {
                    "candidate_id": cid,
                    "family": str(row.get("family") or ""),
                    "scenario_id": str(sr.get("scenario_id") or ""),
                    "mean_sharpe": float(sr.get("mean_sharpe") or 0.0),
                    "mean_maxdd": float(sr.get("mean_maxdd") or 0.0),
                }
            )

    stageb_df = pl.DataFrame(rows)
    strict_cfg = {
        "folds_used_min": int(max(int(args.fold_count_min), ((folds_manifest.get("config") or {}).get("fold_count_built") or 1))),
        "fold_count_min": int(args.fold_count_min),
        "embargo_days_min": int(args.embargo_days_min),
        "test_days_min": int(args.test_days_min),
        "min_train_days_min": int(args.min_train_days_min),
        "ic_5d_oos_mean_min": float(args.ic_mean_min),
        "ic_5d_oos_min_min": float(args.ic_min_min),
        "ic_fold_std_proxy_max": float(args.ic_fold_std_max),
        "oos_sharpe_proxy_mean_min": float(args.sharpe_mean_min),
        "oos_sharpe_proxy_min_min": float(args.sharpe_min_min),
        "turnover_proxy_mean_max": float(args.turnover_mean_max),
        "maxdd_proxy_pct_mean_max": float(args.maxdd_mean_max),
        "bootstrap_neg_sharpe_share_proxy_max": float(args.bootstrap_neg_sharpe_share_max),
        "psr_proxy_min": float(args.psr_proxy_min),
        "dsr_proxy_min": float(args.dsr_proxy_min),
        "psr_bootstrap_proxy_min": float(args.psr_bootstrap_proxy_min),
        "dsr_bootstrap_proxy_min": float(args.dsr_bootstrap_proxy_min),
        "cpcv_light_sharpe_min_min": float(args.cpcv_light_sharpe_min),
        "cpcv_light_sharpe_p25_min": float(args.cpcv_light_p25_min),
        "cpcv_light_neg_sharpe_share_max": float(args.cpcv_light_neg_share_max),
        "stress_lite_sharpe_mean_min": float(args.stress_lite_sharpe_mean_min),
        "stress_lite_maxdd_mean_max": float(args.stress_lite_maxdd_mean_max),
    }
    if stress_rows:
        stress_df = pl.DataFrame(stress_rows)
        stress_summary = (
            stress_df.group_by("candidate_id")
            .agg(
                pl.col("family").first().alias("family"),
                pl.len().alias("stress_lite_scenarios_total"),
                pl.col("mean_sharpe").min().alias("stress_lite_worst_mean_sharpe"),
                pl.col("mean_maxdd").max().alias("stress_lite_worst_mean_maxdd"),
                (pl.col("mean_sharpe") < strict_cfg["stress_lite_sharpe_mean_min"]).sum().alias("_stress_fail_sharpe"),
                (pl.col("mean_maxdd") > strict_cfg["stress_lite_maxdd_mean_max"]).sum().alias("_stress_fail_maxdd"),
            )
            .with_columns(
                (pl.col("_stress_fail_sharpe") + pl.col("_stress_fail_maxdd")).alias("_stress_fail_any"),
                (
                    (pl.col("_stress_fail_sharpe") + pl.col("_stress_fail_maxdd")).cast(pl.Float64)
                    / (2.0 * pl.col("stress_lite_scenarios_total").clip(lower_bound=1))
                ).alias("stress_lite_fail_share"),
            )
            .drop(["_stress_fail_sharpe", "_stress_fail_maxdd", "_stress_fail_any"])
        )
        stageb_df = stageb_df.join(stress_summary, on="candidate_id", how="left", suffix="_stress")
    else:
        stress_df = pl.DataFrame(
            schema={"candidate_id": pl.Utf8, "family": pl.Utf8, "scenario_id": pl.Utf8, "mean_sharpe": pl.Float64, "mean_maxdd": pl.Float64}
        )
        stageb_df = stageb_df.with_columns(
            pl.lit(0).alias("stress_lite_scenarios_total"),
            pl.lit(0.0).alias("stress_lite_fail_share"),
            pl.lit(0.0).alias("stress_lite_worst_mean_sharpe"),
            pl.lit(0.0).alias("stress_lite_worst_mean_maxdd"),
        )
    fold_policy_gate_ok = bool(fold_policy_validation.get("ok")) or (not bool(args.require_fold_policy_valid))
    gate_cols = [
        ("g_fold_policy_valid", pl.lit(fold_policy_gate_ok)),
        ("g_folds_used", pl.col("folds_used") >= strict_cfg["folds_used_min"]),
        ("g_ic_mean", pl.col("ic_5d_oos_mean") >= strict_cfg["ic_5d_oos_mean_min"]),
        ("g_ic_min", pl.col("ic_5d_oos_min") >= strict_cfg["ic_5d_oos_min_min"]),
        ("g_ic_fold_std", pl.col("ic_fold_std_proxy") <= strict_cfg["ic_fold_std_proxy_max"]),
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
        ("g_psr_bootstrap_proxy", pl.col("psr_bootstrap_proxy") >= strict_cfg["psr_bootstrap_proxy_min"]),
        ("g_dsr_bootstrap_proxy", pl.col("dsr_bootstrap_proxy") >= strict_cfg["dsr_bootstrap_proxy_min"]),
        ("g_cpcv_light_sharpe_min", pl.col("cpcv_light_sharpe_min") >= strict_cfg["cpcv_light_sharpe_min_min"]),
        ("g_cpcv_light_sharpe_p25", pl.col("cpcv_light_sharpe_p25") >= strict_cfg["cpcv_light_sharpe_p25_min"]),
        (
            "g_cpcv_light_neg_share",
            pl.col("cpcv_light_neg_sharpe_share") <= strict_cfg["cpcv_light_neg_sharpe_share_max"],
        ),
        ("g_stress_lite_sharpe", pl.col("stress_lite_worst_mean_sharpe") >= strict_cfg["stress_lite_sharpe_mean_min"]),
        ("g_stress_lite_maxdd", pl.col("stress_lite_worst_mean_maxdd") <= strict_cfg["stress_lite_maxdd_mean_max"]),
        ("g_stress_lite_fail_share", pl.col("stress_lite_fail_share") <= float(args.stress_lite_fail_share_max)),
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
                    "cpcv_light_sharpe_p25": _safe_float(row.get("cpcv_light_sharpe_p25")),
                    "cpcv_light_neg_sharpe_share": _safe_float(row.get("cpcv_light_neg_sharpe_share")),
                }
            )

    stageb_dir = out_dir / "stage_b_light"
    stageb_dir.mkdir(parents=True, exist_ok=True)
    candidates_out = stageb_dir / "stage_b_light_candidates.parquet"
    survivors_out = stageb_dir / "survivors_B_light.parquet"
    fold_summary_out = stageb_dir / "fold_summary.parquet"
    stress_candidates_out = stageb_dir / "stress_lite_candidate_summary.parquet"
    stress_folds_out = stageb_dir / "stress_lite_fold_scenarios.parquet"
    fold_policy_validation_out = stageb_dir / "fold_policy_validation.json"
    report_out_path = stageb_dir / "stage_b_light_report.json"
    stageb_sorted.write_parquet(candidates_out)
    survivors_b.write_parquet(survivors_out)
    fold_summary.write_parquet(fold_summary_out)
    stageb_sorted.select(
        [
            "candidate_id",
            "family",
            "stress_lite_scenarios_total",
            "stress_lite_fail_share",
            "stress_lite_worst_mean_sharpe",
            "stress_lite_worst_mean_maxdd",
        ]
    ).write_parquet(stress_candidates_out)
    stress_df.write_parquet(stress_folds_out)
    atomic_write_json(fold_policy_validation_out, fold_policy_validation)

    report_out = {
        "schema": "quantlab_stage_b_light_q1_v1",
        "generated_at": utc_now_iso(),
        "stage_a_run_id": stage_a_run_id,
        "method": {
            "type": "q1_stage_b_light",
            "fold_policy": "reuses Stage-A anchored folds with stricter fold-policy minima and CPCV-light combinations on fold metrics",
            "cpcv_light_combo_policy": "all_combo_sizes_from_min_combo_size_to_n_minus_1",
            "cpcv_light_min_combo_size": int(max(1, args.cpcv_light_min_combo_size)),
            "bootstrap_resamples": int(max(32, args.bootstrap_resamples)),
            "notes": [
                "This is still a Q1-light Stage B approximation, but with stricter fold-policy requirements and stronger CPCV-light gates.",
                "Adds bootstrap-based PSR/DSR proxies, CPCV-light robustness quantiles, and stress-lite summaries.",
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
        "fold_policy_validation": fold_policy_validation,
        "stress_lite_summary": {
            "scenarios_total": int(stress_df.get_column("scenario_id").n_unique() if stress_df.height else 0),
            "rows_total": int(stress_df.height),
        },
        "fail_reason_counts": dict(sorted(fail_reason_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "failed_examples": examples,
        "artifacts": {
            "stage_b_light_dir": str(stageb_dir),
            "stage_b_light_candidates": str(candidates_out),
            "survivors_B_light": str(survivors_out),
            "fold_summary": str(fold_summary_out),
            "fold_policy_validation": str(fold_policy_validation_out),
            "stress_lite_candidate_summary": str(stress_candidates_out),
            "stress_lite_fold_scenarios": str(stress_folds_out),
        },
        "hashes": {
            "stage_a_report_hash": stable_hash_file(report_path),
            "folds_manifest_hash": stable_hash_file(folds_manifest_path),
            "fold_metrics_hash": stable_hash_file(fold_metrics_path),
            "candidates_hash": stable_hash_file(candidates_path),
            "survivors_A_hash": stable_hash_file(survivors_a_path),
            "fold_policy_validation_hash": stable_hash_file(fold_policy_validation_out),
            "stress_lite_candidate_summary_hash": stable_hash_file(stress_candidates_out),
            "stress_lite_fold_scenarios_hash": stable_hash_file(stress_folds_out),
        },
    }
    atomic_write_json(report_out_path, report_out)

    print(f"stage_a_run_id={stage_a_run_id}")
    print(f"survivors_B_light_total={report_out['counts']['survivors_B_light_total']}")
    print(f"report={report_out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
