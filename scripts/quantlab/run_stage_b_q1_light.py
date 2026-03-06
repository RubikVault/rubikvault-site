#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import math
import random
import sys
from datetime import date
from pathlib import Path
from statistics import NormalDist
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402

_NORM = NormalDist()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--stage-a-run-id", default="", help="Default: latest cheapgateA_tsplits_* run")
    p.add_argument("--outputs-subdir", default="outputs")
    p.add_argument(
        "--input-scope",
        choices=["survivors_a", "all_candidates"],
        default="survivors_a",
        help="survivors_a evaluates only Stage-A survivors; all_candidates evaluates full Stage-A candidate set.",
    )
    p.add_argument("--strict-survivors-max", type=int, default=6)
    # Stricter Q1 proxy gates (still not full CPCV/DSR/PSR production)
    p.add_argument("--ic-mean-min", type=float, default=0.01)
    p.add_argument("--ic-min-min", type=float, default=-0.02)
    p.add_argument("--ic-tail-min", type=float, default=-0.02, help="Tail gate threshold for fold-level IC p10/es10.")
    p.add_argument("--sharpe-mean-min", type=float, default=0.03)
    p.add_argument("--sharpe-min-min", type=float, default=-0.25)
    p.add_argument("--turnover-mean-max", type=float, default=2.0)
    p.add_argument("--maxdd-mean-max", type=float, default=20.0)
    p.add_argument("--bootstrap-neg-sharpe-share-max", type=float, default=0.5)
    p.add_argument("--psr-proxy-min", type=float, default=0.65)
    p.add_argument("--dsr-proxy-min", type=float, default=0.55)
    p.add_argument("--psr-bootstrap-proxy-min", type=float, default=0.60)
    p.add_argument("--dsr-bootstrap-proxy-min", type=float, default=0.50)
    p.add_argument("--bootstrap-resamples", type=int, default=512)
    p.add_argument("--cpcv-light-sharpe-min", type=float, default=0.02)
    p.add_argument("--cpcv-light-p10-min", type=float, default=-0.03)
    p.add_argument("--cpcv-light-p05-min", type=float, default=-0.06)
    p.add_argument("--cpcv-light-es10-min", type=float, default=-0.08)
    p.add_argument("--cpcv-light-neg-share-max", type=float, default=0.35)
    p.add_argument("--cpcv-light-skip-adjacent-folds", action="store_true", default=True)
    p.add_argument("--skip-cpcv-light-skip-adjacent-folds", dest="cpcv_light_skip_adjacent_folds", action="store_false")
    p.add_argument("--cpcv-light-temporal-filter", action="store_true", default=True)
    p.add_argument("--skip-cpcv-light-temporal-filter", dest="cpcv_light_temporal_filter", action="store_false")
    p.add_argument("--cpcv-light-min-test-gap-days", type=int, default=10)
    p.add_argument("--cpcv-light-min-embargo-gap-days", type=int, default=5)
    p.add_argument("--cpcv-light-min-effective-paths", type=int, default=5)
    p.add_argument("--cpcv-light-min-effective-path-ratio", type=float, default=0.75)
    p.add_argument("--cpcv-light-min-paths-total", type=int, default=5)
    p.add_argument("--cpcv-light-min-combos-considered", type=int, default=3)
    p.add_argument("--cpcv-light-forbid-fallback-path", action="store_true", default=True)
    p.add_argument("--allow-cpcv-light-fallback-path", dest="cpcv_light_forbid_fallback_path", action="store_false")
    p.add_argument(
        "--cpcv-light-requirement-mode",
        choices=["feasible_min", "configured_min"],
        default="feasible_min",
        help="feasible_min keeps Q1 behavior (min(configured, combos_considered_floor1)); configured_min enforces configured minima.",
    )
    p.add_argument(
        "--cpcv-light-relaxation-mode",
        choices=["allow", "strict_fail"],
        default="allow",
        help="allow relaxes skip-adjacent/temporal filter if no effective paths; strict_fail forbids policy relaxation.",
    )
    p.add_argument("--stress-lite-sharpe-mean-min", type=float, default=0.00)
    p.add_argument("--stress-lite-maxdd-mean-max", type=float, default=20.0)
    p.add_argument("--stress-lite-fail-share-max", type=float, default=0.20)
    p.add_argument("--fold-count-min", type=int, default=3)
    p.add_argument("--embargo-days-min", type=int, default=2)
    p.add_argument("--test-days-min", type=int, default=5)
    p.add_argument("--min-train-days-min", type=int, default=8)
    p.add_argument("--ic-fold-std-max", type=float, default=0.20)
    p.add_argument("--cpcv-light-p25-min", type=float, default=0.00)
    p.add_argument("--cpcv-light-min-combo-size", type=int, default=3)
    p.add_argument("--psr-strict-min", type=float, default=0.65)
    p.add_argument("--dsr-strict-min", type=float, default=0.55)
    p.add_argument("--psr-cpcv-strict-min", type=float, default=0.65)
    p.add_argument("--dsr-cpcv-strict-min", type=float, default=0.55)
    p.add_argument("--dsr-trials-total", type=int, default=0, help="0 => stage_a_candidates_total")
    p.add_argument("--require-fold-policy-valid", action="store_true", default=True)
    p.add_argument("--skip-fold-policy-valid", dest="require_fold_policy_valid", action="store_false")
    p.add_argument(
        "--pass-mode",
        choices=["strict", "proxy_augmented"],
        default="strict",
        help="strict: Stage-B pass excludes proxy gates; proxy_augmented: includes proxy gates",
    )
    p.add_argument(
        "--strict-gate-profile",
        choices=["hard", "broad"],
        default="hard",
        help="hard: only robust non-proxy gates define strict pass; broad: all non-proxy gates define strict pass",
    )
    p.add_argument(
        "--strict-quality-gate-mode",
        choices=["balanced", "legacy"],
        default="balanced",
        help="balanced keeps strict quality robust while removing redundant strict-cpcv duplication from hard mode; legacy keeps prior hard gate set.",
    )
    p.add_argument(
        "--v4-final-profile",
        action="store_true",
        default=False,
        help="Enable final-method profile defaults (strict pass, hard profile, configured CPCV minima, strict no-relax policy).",
    )
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


def _mean_std(values: list[float]) -> tuple[float, float]:
    n = len(values)
    if n <= 0:
        return 0.0, 0.0
    m = float(sum(values) / n)
    if n <= 1:
        return m, 0.0
    var = sum((x - m) ** 2 for x in values) / max(1, n - 1)
    return m, float(math.sqrt(max(var, 1e-12)))


def _sample_skewness(values: list[float], mean: float, sd: float) -> float:
    n = len(values)
    if n < 3 or sd <= 1e-12:
        return 0.0
    num = sum(((x - mean) / sd) ** 3 for x in values)
    return float((n / ((n - 1) * (n - 2))) * num)


def _sample_excess_kurtosis(values: list[float], mean: float, sd: float) -> float:
    n = len(values)
    if n < 4 or sd <= 1e-12:
        return 0.0
    z4 = sum(((x - mean) / sd) ** 4 for x in values)
    term1 = (n * (n + 1) * z4) / ((n - 1) * (n - 2) * (n - 3))
    term2 = (3 * ((n - 1) ** 2)) / ((n - 2) * (n - 3))
    return float(term1 - term2)


def _psr_strict(sharpes: list[float], sr_benchmark: float = 0.0) -> float:
    n = len(sharpes)
    if n <= 0:
        return 0.0
    if n == 1:
        return 1.0 if float(sharpes[0]) > sr_benchmark else 0.0
    sr_hat, sd = _mean_std(sharpes)
    if sd <= 1e-12:
        return 1.0 if sr_hat > sr_benchmark else 0.0
    skew = _sample_skewness(sharpes, sr_hat, sd)
    ex_kurt = _sample_excess_kurtosis(sharpes, sr_hat, sd)
    # Bailey-style PSR denominator: sqrt(1 - skew*SR + ((kurtosis-1)/4)*SR^2).
    # With excess kurtosis: (kurtosis-1) = ex_kurt + 2.
    denom_term = 1.0 - skew * sr_hat + 0.25 * (ex_kurt + 2.0) * (sr_hat ** 2)
    denom = math.sqrt(max(denom_term, 1e-12))
    z = (sr_hat - float(sr_benchmark)) * math.sqrt(max(1, n - 1)) / denom
    return float(max(0.0, min(1.0, _NORM.cdf(z))))


def _expected_max_sr_proxy(sharpes: list[float], trials_total: int) -> float:
    if len(sharpes) <= 1:
        return 0.0
    _, sd = _mean_std(sharpes)
    if sd <= 1e-12:
        return 0.0
    # DSR benchmark should be based on estimator uncertainty (SE), not raw fold dispersion.
    se = sd / math.sqrt(max(1, len(sharpes)))
    n_trials = max(2, int(trials_total))
    euler_gamma = 0.5772156649
    z1 = _NORM.inv_cdf(1.0 - (1.0 / n_trials))
    z2 = _NORM.inv_cdf(1.0 - (1.0 / (n_trials * math.e)))
    return float(se * (((1.0 - euler_gamma) * z1) + (euler_gamma * z2)))


def _dsr_strict(sharpes: list[float], trials_total: int) -> tuple[float, float]:
    sr_star = _expected_max_sr_proxy(sharpes, trials_total=trials_total)
    dsr = _psr_strict(sharpes, sr_benchmark=sr_star)
    return dsr, sr_star


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


def _tail_mean(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    q = max(0.0, min(1.0, float(q)))
    n = len(sorted_values)
    k = max(1, int(math.ceil(n * q)))
    return float(sum(sorted_values[:k]) / k)


def _has_adjacent_indices(indices: tuple[int, ...]) -> bool:
    if len(indices) <= 1:
        return False
    prev = indices[0]
    for curr in indices[1:]:
        if (curr - prev) <= 1:
            return True
        prev = curr
    return False


def _calendar_gap_days(a_start: date, a_end: date, b_start: date, b_end: date) -> int:
    if a_end < b_start:
        return int((b_start - a_end).days - 1)
    if b_end < a_start:
        return int((a_start - b_end).days - 1)
    return -1


def _combo_temporally_valid(
    indices: tuple[int, ...],
    fold_windows: list[dict | None],
    *,
    min_test_gap_days: int,
    min_embargo_gap_days: int,
) -> bool:
    if len(indices) <= 1:
        return True
    for i_pos in range(len(indices)):
        wi = fold_windows[indices[i_pos]] if indices[i_pos] < len(fold_windows) else None
        if wi is None:
            return False
        for j_pos in range(i_pos + 1, len(indices)):
            wj = fold_windows[indices[j_pos]] if indices[j_pos] < len(fold_windows) else None
            if wj is None:
                return False
            gap = _calendar_gap_days(wi["test_start"], wi["test_end"], wj["test_start"], wj["test_end"])
            if gap < 0:
                return False
            required_gap = max(
                int(min_test_gap_days),
                int(max(int(wi.get("embargo_days") or 0), int(wj.get("embargo_days") or 0)) + int(min_embargo_gap_days)),
            )
            if gap < required_gap:
                return False
    return True


def _cpcv_light_metrics(
    sharpes: list[float],
    *,
    fold_windows: list[dict | None] | None = None,
    min_combo_size: int = 1,
    skip_adjacent_folds: bool = True,
    temporal_filter: bool = True,
    min_test_gap_days: int = 5,
    min_embargo_gap_days: int = 1,
    relaxation_mode: str = "allow",
) -> dict:
    # Q1-light proxy: evaluate combinations from min_combo_size to n-1 on fold metrics.
    n = len(sharpes)
    if n <= 1:
        val = sharpes[0] if sharpes else 0.0
        return {
            "paths_total": 1 if sharpes else 0,
            "combo_sizes": [1] if sharpes else [],
            "combo_policy": "single_fold_or_trivial",
            "path_sharpes": [float(val)] if sharpes else [],
            "fallback_to_mean_path": False,
            "mean_sharpe_across_paths": float(val),
            "min_sharpe_across_paths": float(val),
            "p25_sharpe_across_paths": float(val),
            "p10_sharpe_across_paths": float(val),
            "p05_sharpe_across_paths": float(val),
            "es10_sharpe_across_paths": float(val),
            "neg_share_across_paths": 1.0 if val < 0 else 0.0,
            "std_sharpe_across_paths": 0.0,
            "combos_considered_total": 1 if sharpes else 0,
            "combos_skipped_adjacent_total": 0,
            "combos_skipped_temporal_total": 0,
            "combos_effective_total": 1 if sharpes else 0,
            "effective_path_ratio": 1.0 if sharpes else 0.0,
            "temporal_filter_applied": bool(temporal_filter and bool(fold_windows)),
        }
    requested_min_combo_size = max(1, int(min_combo_size))
    combo_sizes = list(range(requested_min_combo_size, n))
    if not combo_sizes:
        # Never silently fall back to single-fold proxies when a stricter minimum combo
        # size was requested; use the strongest feasible size for current fold count.
        combo_sizes = [max(1, n - 1)]
    requested_combo_sizes = list(combo_sizes)
    policy_relaxations: list[str] = []

    def _eval_combo_policy(*, combo_sizes_eval: list[int], skip_adjacent_eval: bool, temporal_filter_eval: bool) -> dict:
        vals_eval: list[float] = []
        combos_considered_eval = 0
        combos_skipped_adjacent_eval = 0
        combos_skipped_temporal_eval = 0
        for k in combo_sizes_eval:
            for idxs in itertools.combinations(range(n), k):
                combos_considered_eval += 1
                if skip_adjacent_eval and _has_adjacent_indices(idxs):
                    combos_skipped_adjacent_eval += 1
                    continue
                if temporal_filter_eval and fold_windows:
                    if not _combo_temporally_valid(
                        idxs,
                        fold_windows,
                        min_test_gap_days=max(0, int(min_test_gap_days)),
                        min_embargo_gap_days=max(0, int(min_embargo_gap_days)),
                    ):
                        combos_skipped_temporal_eval += 1
                        continue
                avg = sum(sharpes[i] for i in idxs) / len(idxs)
                vals_eval.append(float(avg))
        return {
            "vals": vals_eval,
            "combos_considered_total": int(combos_considered_eval),
            "combos_skipped_adjacent_total": int(combos_skipped_adjacent_eval),
            "combos_skipped_temporal_total": int(combos_skipped_temporal_eval),
            "combos_effective_total": int(len(vals_eval)),
        }

    used_skip_adjacent = bool(skip_adjacent_folds)
    used_temporal_filter = bool(temporal_filter)
    relax_mode = str(relaxation_mode or "allow")
    policy_eval = _eval_combo_policy(
        combo_sizes_eval=combo_sizes,
        skip_adjacent_eval=used_skip_adjacent,
        temporal_filter_eval=used_temporal_filter,
    )
    if relax_mode == "allow" and policy_eval["combos_effective_total"] <= 0 and used_skip_adjacent:
        used_skip_adjacent = False
        policy_relaxations.append("disable_skip_adjacent_when_no_effective_paths")
        policy_eval = _eval_combo_policy(
            combo_sizes_eval=combo_sizes,
            skip_adjacent_eval=used_skip_adjacent,
            temporal_filter_eval=used_temporal_filter,
        )
    if relax_mode == "allow" and policy_eval["combos_effective_total"] <= 0 and used_temporal_filter:
        used_temporal_filter = False
        policy_relaxations.append("disable_temporal_filter_when_no_effective_paths")
        policy_eval = _eval_combo_policy(
            combo_sizes_eval=combo_sizes,
            skip_adjacent_eval=used_skip_adjacent,
            temporal_filter_eval=used_temporal_filter,
        )

    vals = list(policy_eval["vals"])
    combos_considered = int(policy_eval["combos_considered_total"])
    combos_skipped_adjacent = int(policy_eval["combos_skipped_adjacent_total"])
    combos_skipped_temporal = int(policy_eval["combos_skipped_temporal_total"])
    effective_paths = int(policy_eval["combos_effective_total"])
    fallback_to_mean_path = False
    if not vals and relax_mode == "allow":
        vals = [sum(sharpes) / n]
        fallback_to_mean_path = True
    vals_sorted = sorted(vals)
    mean_v = (sum(vals) / len(vals)) if vals else 0.0
    neg_share = (sum(1 for v in vals if v < 0) / len(vals)) if vals else 1.0
    std_v = 0.0 if len(vals) <= 1 else math.sqrt(sum((v - mean_v) ** 2 for v in vals) / (len(vals) - 1))
    return {
        "paths_total": len(vals),
        "combo_sizes": combo_sizes,
        "requested_combo_sizes": requested_combo_sizes,
        "combo_policy": (
            "all_combo_sizes_from_min_combo_size_to_n_minus_1"
            + ("_skip_adjacent" if used_skip_adjacent else "")
            + ("_temporal_filter" if used_temporal_filter and bool(fold_windows) else "")
        ),
        "combos_considered_total": int(combos_considered),
        "combos_skipped_adjacent_total": int(combos_skipped_adjacent),
        "combos_skipped_temporal_total": int(combos_skipped_temporal),
        "combos_effective_total": int(effective_paths),
        "effective_path_ratio": float(1.0 if combos_considered <= 0 else effective_paths / combos_considered),
        "temporal_filter_applied": bool(used_temporal_filter and bool(fold_windows)),
        "requested_skip_adjacent_folds": bool(skip_adjacent_folds),
        "used_skip_adjacent_folds": bool(used_skip_adjacent),
        "requested_temporal_filter": bool(temporal_filter),
        "used_temporal_filter": bool(used_temporal_filter),
        "policy_relaxed": bool(policy_relaxations),
        "relaxation_mode": relax_mode,
        "policy_relaxations": policy_relaxations,
        "path_sharpes": [float(v) for v in vals],
        "fallback_to_mean_path": bool(fallback_to_mean_path),
        "mean_sharpe_across_paths": float(mean_v),
        "min_sharpe_across_paths": float(min(vals_sorted)) if vals_sorted else 0.0,
        "p25_sharpe_across_paths": _quantile(vals_sorted, 0.25) if vals_sorted else 0.0,
        "p10_sharpe_across_paths": _quantile(vals_sorted, 0.10) if vals_sorted else 0.0,
        "p05_sharpe_across_paths": _quantile(vals_sorted, 0.05) if vals_sorted else 0.0,
        "es10_sharpe_across_paths": _tail_mean(vals_sorted, 0.10) if vals_sorted else 0.0,
        "neg_share_across_paths": float(neg_share),
        "std_sharpe_across_paths": float(std_v),
    }


def _stress_lite_metrics(
    fold_sharpes: list[float],
    fold_turnovers: list[float],
    fold_maxdds: list[float],
    fold_spreads: list[float],
) -> dict:
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
    spreads = [float(x) for x in fold_spreads[:n]] + [0.0] * max(0, n - len(fold_spreads))
    scenarios = [
        {"id": "slippage_x2", "base_bps": 5.0, "turnover_bps_per_pct": 2.0, "maxdd_mult": 1.15},
        {"id": "slippage_x3_spreadfloor", "base_bps": 10.0, "turnover_bps_per_pct": 4.0, "maxdd_mult": 1.30},
        {"id": "liquidity_shock_adv50", "base_bps": 15.0, "turnover_bps_per_pct": 6.0, "maxdd_mult": 1.45},
        {"id": "correlation_spike", "base_bps": 8.0, "turnover_bps_per_pct": 3.0, "maxdd_mult": 1.35},
    ]
    failures: list[str] = []
    worst_mean_sharpe = None
    worst_mean_maxdd = None
    scenario_rows = []
    for sc in scenarios:
        stressed_sharpes = []
        stressed_maxdds = []
        for sh, to, dd, spread in zip(sharpes, turnovers, maxdds, spreads):
            # Stress costs are expressed in bps on spread and mapped back via per-fold sigma proxy.
            sigma_proxy = abs(spread) / max(abs(sh), 1e-6)
            cost_spread = (
                float(sc["base_bps"]) * 1e-4
                + float(sc["turnover_bps_per_pct"]) * 1e-4 * max(0.0, to * 100.0)
            )
            stressed_spread = float(spread - cost_spread)
            stressed_sharpes.append(float(stressed_spread / max(sigma_proxy, 1e-6)))
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
    v4_final_profile = bool(args.v4_final_profile)
    if v4_final_profile:
        args.pass_mode = "strict"
        args.strict_gate_profile = "hard"
        args.cpcv_light_requirement_mode = "feasible_min"
        args.cpcv_light_relaxation_mode = "strict_fail"
        args.cpcv_light_forbid_fallback_path = True
        args.cpcv_light_temporal_filter = True
        args.cpcv_light_skip_adjacent_folds = True
        args.fold_count_min = 2
        args.cpcv_light_min_combos_considered = 2
        args.cpcv_light_min_effective_paths = 2
        args.cpcv_light_min_paths_total = 2

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
    eval_candidates = survivors_a if str(args.input_scope) == "survivors_a" else candidates
    input_scope_effective = str(args.input_scope)
    if eval_candidates.height <= 0:
        eval_candidates = candidates
        input_scope_effective = "all_candidates_fallback_empty_survivors_a"
    if args.require_fold_policy_valid and not bool(fold_policy_validation.get("ok")):
        raise SystemExit(f"FATAL: invalid folds manifest policy: {fold_policy_validation.get('errors')}")

    fold_entries = list(folds_manifest.get("folds") or [])
    fold_order: dict[str, int] = {}
    fold_windows_by_id: dict[str, dict | None] = {}
    for idx, f in enumerate(fold_entries):
        fid = str(f.get("fold_id") or f"fold_{idx + 1}")
        fold_order[fid] = idx
        ts = _parse_day(f.get("test_start"))
        te = _parse_day(f.get("test_end"))
        if not ts or not te:
            fold_windows_by_id[fid] = None
            continue
        fold_windows_by_id[fid] = {
            "fold_id": fid,
            "order": idx,
            "test_start": ts,
            "test_end": te,
            "embargo_days": int(f.get("embargo_days") or 0),
        }

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
                "fold_rows": [],
            },
        )
        bucket["fold_rows"].append(
            {
                "fold_id": str(row.get("fold_id") or ""),
                "sharpe": _safe_float(row.get("oos_sharpe_proxy")),
                "ic_5d": _safe_float(row.get("ic_5d")),
                "turnover": _safe_float(row.get("turnover_proxy")),
                "maxdd": _safe_float(row.get("maxdd_proxy_pct")),
                "spread": _safe_float(row.get("top_minus_bottom_5d")),
            }
        )

    cand_count = max(1, int(eval_candidates.height))
    dsr_trials_total = int(args.dsr_trials_total) if int(args.dsr_trials_total) > 0 else int(cand_count)
    rows = []
    stress_rows = []
    temporal_filter_on = bool(args.cpcv_light_temporal_filter)
    for row in eval_candidates.to_dicts():
        cid = str(row.get("candidate_id") or "")
        extra = per_candidate.get(cid) or {"fold_rows": []}
        fold_rows = sorted(
            list(extra.get("fold_rows") or []),
            key=lambda fr: (fold_order.get(str(fr.get("fold_id") or ""), 10**9), str(fr.get("fold_id") or "")),
        )
        fold_ids = [str(fr.get("fold_id") or "") for fr in fold_rows]
        fold_sharpes = [float(fr.get("sharpe") or 0.0) for fr in fold_rows]
        fold_ics = [float(fr.get("ic_5d") or 0.0) for fr in fold_rows]
        fold_ics_sorted = sorted(fold_ics)
        ic_p10 = _quantile(fold_ics_sorted, 0.10)
        ic_p05 = _quantile(fold_ics_sorted, 0.05)
        ic_es10 = _tail_mean(fold_ics_sorted, 0.10)
        fold_turnovers = [float(fr.get("turnover") or 0.0) for fr in fold_rows]
        fold_maxdds = [float(fr.get("maxdd") or 0.0) for fr in fold_rows]
        fold_spreads = [float(fr.get("spread") or 0.0) for fr in fold_rows]
        fold_windows = [fold_windows_by_id.get(fid) for fid in fold_ids]
        temporal_meta_missing = sum(1 for fw in fold_windows if fw is None)
        psr = _psr_proxy(fold_sharpes)
        dsr = _dsr_proxy(psr, cand_count)
        psr_strict = _psr_strict(fold_sharpes, sr_benchmark=0.0)
        dsr_strict, sr_star_trials_proxy = _dsr_strict(fold_sharpes, trials_total=dsr_trials_total)
        psr_boot = _psr_bootstrap_proxy(
            fold_sharpes,
            resamples=max(32, int(args.bootstrap_resamples)),
            seed_key=f"{stage_a_run_id}:{cid}:psr_boot",
        )
        dsr_boot = _dsr_proxy(psr_boot, cand_count)
        cpcv = _cpcv_light_metrics(
            fold_sharpes,
            fold_windows=fold_windows,
            min_combo_size=max(1, int(args.cpcv_light_min_combo_size)),
            skip_adjacent_folds=bool(args.cpcv_light_skip_adjacent_folds),
            temporal_filter=temporal_filter_on,
            min_test_gap_days=max(0, int(args.cpcv_light_min_test_gap_days)),
            min_embargo_gap_days=max(0, int(args.cpcv_light_min_embargo_gap_days)),
            relaxation_mode=str(args.cpcv_light_relaxation_mode),
        )
        effective_paths_required = (
            int(max(1, args.cpcv_light_min_effective_paths))
            if str(args.cpcv_light_requirement_mode) == "configured_min"
            else int(
                min(
                    max(1, int(args.cpcv_light_min_effective_paths)),
                    max(1, int(cpcv["combos_considered_total"])),
                )
            )
        )
        paths_total_required = (
            int(max(1, args.cpcv_light_min_paths_total))
            if str(args.cpcv_light_requirement_mode) == "configured_min"
            else int(
                min(
                    max(1, int(args.cpcv_light_min_paths_total)),
                    max(1, int(cpcv["combos_considered_total"])),
                )
            )
        )
        combos_considered_required = (
            int(max(1, args.cpcv_light_min_combos_considered))
            if str(args.cpcv_light_requirement_mode) == "configured_min"
            else int(
                min(
                    max(1, int(args.cpcv_light_min_combos_considered)),
                    max(1, int(cpcv["combos_considered_total"])),
                )
            )
        )
        cpcv_path_sharpes = [float(x) for x in (cpcv.get("path_sharpes") or [])]
        cpcv_trials_total = max(int(cand_count), int(cpcv.get("paths_total") or 0), 2)
        psr_cpcv_strict = _psr_strict(cpcv_path_sharpes, sr_benchmark=0.0) if cpcv_path_sharpes else 0.0
        dsr_cpcv_strict, sr_star_cpcv_trials_proxy = (
            _dsr_strict(cpcv_path_sharpes, trials_total=cpcv_trials_total) if cpcv_path_sharpes else (0.0, 0.0)
        )
        stress = _stress_lite_metrics(fold_sharpes, fold_turnovers, fold_maxdds, fold_spreads)
        rows.append(
            {
                **row,
                "psr_proxy": psr,
                "dsr_proxy": dsr,
                "psr_strict": psr_strict,
                "dsr_strict": dsr_strict,
                "psr_cpcv_strict": float(psr_cpcv_strict),
                "dsr_cpcv_strict": float(dsr_cpcv_strict),
                "sr_star_cpcv_trials_proxy": float(sr_star_cpcv_trials_proxy),
                "sr_star_trials_proxy": sr_star_trials_proxy,
                "psr_bootstrap_proxy": psr_boot,
                "dsr_bootstrap_proxy": dsr_boot,
                "cpcv_light_paths_total": int(cpcv["paths_total"]),
                "cpcv_light_sharpe_mean": float(cpcv["mean_sharpe_across_paths"]),
                "cpcv_light_sharpe_min": float(cpcv["min_sharpe_across_paths"]),
                "cpcv_light_sharpe_p25": float(cpcv["p25_sharpe_across_paths"]),
                "cpcv_light_sharpe_p10": float(cpcv["p10_sharpe_across_paths"]),
                "cpcv_light_sharpe_p05": float(cpcv["p05_sharpe_across_paths"]),
                "cpcv_light_sharpe_es10": float(cpcv["es10_sharpe_across_paths"]),
                "cpcv_light_neg_sharpe_share": float(cpcv["neg_share_across_paths"]),
                "cpcv_light_sharpe_std": float(cpcv["std_sharpe_across_paths"]),
                "cpcv_light_combos_considered_total": int(cpcv["combos_considered_total"]),
                "cpcv_light_combos_skipped_adjacent_total": int(cpcv["combos_skipped_adjacent_total"]),
                "cpcv_light_combos_skipped_temporal_total": int(cpcv["combos_skipped_temporal_total"]),
                "cpcv_light_combos_effective_total": int(cpcv["combos_effective_total"]),
                "cpcv_light_fallback_to_mean_path": 1 if bool(cpcv["fallback_to_mean_path"]) else 0,
                "cpcv_light_effective_path_ratio": float(cpcv["effective_path_ratio"]),
                "cpcv_light_temporal_filter_applied": 1 if bool(cpcv["temporal_filter_applied"]) else 0,
                "cpcv_light_requested_skip_adjacent_folds": 1 if bool(cpcv["requested_skip_adjacent_folds"]) else 0,
                "cpcv_light_used_skip_adjacent_folds": 1 if bool(cpcv["used_skip_adjacent_folds"]) else 0,
                "cpcv_light_requested_temporal_filter": 1 if bool(cpcv["requested_temporal_filter"]) else 0,
                "cpcv_light_used_temporal_filter": 1 if bool(cpcv["used_temporal_filter"]) else 0,
                "cpcv_light_policy_relaxed": 1 if bool(cpcv["policy_relaxed"]) else 0,
                "cpcv_light_effective_paths_required": int(effective_paths_required),
                "cpcv_light_paths_total_required": int(paths_total_required),
                "cpcv_light_combos_considered_required": int(combos_considered_required),
                "cpcv_light_temporal_meta_missing_total": int(temporal_meta_missing),
                "ic_fold_std_proxy": float(0.0 if len(fold_ics) <= 1 else pl.Series(fold_ics).std(ddof=1) or 0.0),
                "ic_5d_oos_p10": float(ic_p10),
                "ic_5d_oos_p05": float(ic_p05),
                "ic_5d_oos_es10": float(ic_es10),
                "folds_observed_from_metrics": int(len(fold_rows)),
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
    folds_built_total = int(((folds_manifest.get("config") or {}).get("fold_count_built") or 1))
    folds_observed_total = int(
        fold_metrics.select(pl.col("fold_id").n_unique().alias("n")).to_dicts()[0].get("n", 0)
    ) if fold_metrics.height > 0 else 0
    folds_effective_total = max(1, min(int(folds_built_total), int(folds_observed_total or folds_built_total)))
    strict_cfg = {
        "folds_used_min": int(max(1, min(int(args.fold_count_min), int(folds_effective_total)))),
        "folds_built_total": int(folds_built_total),
        "folds_observed_total": int(folds_observed_total),
        "folds_effective_total": int(folds_effective_total),
        "fold_count_min": int(args.fold_count_min),
        "embargo_days_min": int(args.embargo_days_min),
        "test_days_min": int(args.test_days_min),
        "min_train_days_min": int(args.min_train_days_min),
        "ic_5d_oos_mean_min": float(args.ic_mean_min),
        "ic_5d_oos_min_min": float(args.ic_min_min),
        "ic_5d_oos_tail_min": float(args.ic_tail_min),
        "ic_fold_std_proxy_max": float(args.ic_fold_std_max),
        "oos_sharpe_proxy_mean_min": float(args.sharpe_mean_min),
        "oos_sharpe_proxy_min_min": float(args.sharpe_min_min),
        "turnover_proxy_mean_max": float(args.turnover_mean_max),
        "maxdd_proxy_pct_mean_max": float(args.maxdd_mean_max),
        "bootstrap_neg_sharpe_share_proxy_max": float(args.bootstrap_neg_sharpe_share_max),
        "psr_proxy_min": float(args.psr_proxy_min),
        "dsr_proxy_min": float(args.dsr_proxy_min),
        "psr_strict_min": float(args.psr_strict_min),
        "dsr_strict_min": float(args.dsr_strict_min),
        "psr_cpcv_strict_min": float(args.psr_cpcv_strict_min),
        "dsr_cpcv_strict_min": float(args.dsr_cpcv_strict_min),
        "dsr_trials_total": int(dsr_trials_total),
        "psr_bootstrap_proxy_min": float(args.psr_bootstrap_proxy_min),
        "dsr_bootstrap_proxy_min": float(args.dsr_bootstrap_proxy_min),
        "cpcv_light_sharpe_min_min": float(args.cpcv_light_sharpe_min),
        "cpcv_light_sharpe_p25_min": float(args.cpcv_light_p25_min),
        "cpcv_light_sharpe_p10_min": float(args.cpcv_light_p10_min),
        "cpcv_light_sharpe_p05_min": float(args.cpcv_light_p05_min),
        "cpcv_light_sharpe_es10_min": float(args.cpcv_light_es10_min),
        "cpcv_light_neg_sharpe_share_max": float(args.cpcv_light_neg_share_max),
        "cpcv_light_effective_paths_min": int(max(1, args.cpcv_light_min_effective_paths)),
        "cpcv_light_effective_path_ratio_min": float(max(0.0, min(1.0, args.cpcv_light_min_effective_path_ratio))),
        "cpcv_light_paths_total_min": int(max(1, args.cpcv_light_min_paths_total)),
        "cpcv_light_min_combos_considered": int(max(1, args.cpcv_light_min_combos_considered)),
        "cpcv_light_forbid_fallback_path": bool(args.cpcv_light_forbid_fallback_path),
        "cpcv_light_requirement_mode": str(args.cpcv_light_requirement_mode),
        "cpcv_light_relaxation_mode": str(args.cpcv_light_relaxation_mode),
        "cpcv_light_temporal_filter": temporal_filter_on,
        "cpcv_light_min_test_gap_days": int(max(0, args.cpcv_light_min_test_gap_days)),
        "cpcv_light_min_embargo_gap_days": int(max(0, args.cpcv_light_min_embargo_gap_days)),
        "cpcv_light_skip_adjacent_folds": bool(args.cpcv_light_skip_adjacent_folds),
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
        ("g_ic_p10", pl.col("ic_5d_oos_p10") >= strict_cfg["ic_5d_oos_tail_min"]),
        ("g_ic_es10", pl.col("ic_5d_oos_es10") >= strict_cfg["ic_5d_oos_tail_min"]),
        ("g_ic_tail_any", (pl.col("ic_5d_oos_min") >= strict_cfg["ic_5d_oos_min_min"]) | (pl.col("ic_5d_oos_es10") >= strict_cfg["ic_5d_oos_tail_min"])),
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
        ("g_psr_strict", pl.col("psr_strict") >= strict_cfg["psr_strict_min"]),
        ("g_dsr_strict", pl.col("dsr_strict") >= strict_cfg["dsr_strict_min"]),
        ("g_psr_cpcv_strict", pl.col("psr_cpcv_strict") >= strict_cfg["psr_cpcv_strict_min"]),
        ("g_dsr_cpcv_strict", pl.col("dsr_cpcv_strict") >= strict_cfg["dsr_cpcv_strict_min"]),
        ("g_psr_strict_any", (pl.col("psr_strict") >= strict_cfg["psr_strict_min"]) | (pl.col("psr_cpcv_strict") >= strict_cfg["psr_cpcv_strict_min"])),
        ("g_dsr_strict_any", (pl.col("dsr_strict") >= strict_cfg["dsr_strict_min"]) | (pl.col("dsr_cpcv_strict") >= strict_cfg["dsr_cpcv_strict_min"])),
        ("g_psr_bootstrap_proxy", pl.col("psr_bootstrap_proxy") >= strict_cfg["psr_bootstrap_proxy_min"]),
        ("g_dsr_bootstrap_proxy", pl.col("dsr_bootstrap_proxy") >= strict_cfg["dsr_bootstrap_proxy_min"]),
        ("g_cpcv_light_sharpe_min", pl.col("cpcv_light_sharpe_min") >= strict_cfg["cpcv_light_sharpe_min_min"]),
        ("g_cpcv_light_sharpe_p25", pl.col("cpcv_light_sharpe_p25") >= strict_cfg["cpcv_light_sharpe_p25_min"]),
        ("g_cpcv_light_sharpe_p10", pl.col("cpcv_light_sharpe_p10") >= strict_cfg["cpcv_light_sharpe_p10_min"]),
        ("g_cpcv_light_sharpe_p05", pl.col("cpcv_light_sharpe_p05") >= strict_cfg["cpcv_light_sharpe_p05_min"]),
        ("g_cpcv_light_sharpe_es10", pl.col("cpcv_light_sharpe_es10") >= strict_cfg["cpcv_light_sharpe_es10_min"]),
        (
            "g_cpcv_light_effective_paths",
            pl.col("cpcv_light_combos_effective_total") >= pl.col("cpcv_light_effective_paths_required"),
        ),
        (
            "g_cpcv_light_effective_ratio",
            pl.col("cpcv_light_effective_path_ratio") >= strict_cfg["cpcv_light_effective_path_ratio_min"],
        ),
        (
            "g_cpcv_light_paths_total",
            pl.col("cpcv_light_paths_total") >= pl.col("cpcv_light_paths_total_required"),
        ),
        (
            "g_cpcv_light_combos_considered",
            pl.col("cpcv_light_combos_considered_total") >= pl.col("cpcv_light_combos_considered_required"),
        ),
        (
            "g_cpcv_light_no_fallback_path",
            (pl.col("cpcv_light_fallback_to_mean_path") == 0)
            if bool(strict_cfg["cpcv_light_forbid_fallback_path"])
            else pl.lit(True),
        ),
        (
            "g_cpcv_light_temporal_meta",
            (pl.col("cpcv_light_temporal_meta_missing_total") == 0)
            if temporal_filter_on
            else pl.lit(True),
        ),
        (
            "g_cpcv_light_policy_relaxed",
            (
                pl.col("cpcv_light_policy_relaxed") == 0
                if str(args.cpcv_light_relaxation_mode) == "strict_fail"
                else pl.lit(True)
            ),
        ),
        (
            "g_cpcv_light_neg_share",
            pl.col("cpcv_light_neg_sharpe_share") <= strict_cfg["cpcv_light_neg_sharpe_share_max"],
        ),
        ("g_stress_lite_sharpe", pl.col("stress_lite_worst_mean_sharpe") >= strict_cfg["stress_lite_sharpe_mean_min"]),
        ("g_stress_lite_maxdd", pl.col("stress_lite_worst_mean_maxdd") <= strict_cfg["stress_lite_maxdd_mean_max"]),
        ("g_stress_lite_fail_share", pl.col("stress_lite_fail_share") <= float(args.stress_lite_fail_share_max)),
    ]
    stageb_df = stageb_df.with_columns([expr.alias(name) for name, expr in gate_cols])
    proxy_gate_names = [
        "g_bootstrap_neg_sharpe",
        "g_psr_proxy",
        "g_dsr_proxy",
        "g_psr_bootstrap_proxy",
        "g_dsr_bootstrap_proxy",
    ]
    broad_strict_gate_names = [name for name, _ in gate_cols if name not in set(proxy_gate_names)]
    hard_strict_gate_names_balanced = [
        "g_fold_policy_valid",
        "g_folds_used",
        "g_ic_mean",
        "g_ic_fold_std",
        "g_sharpe_mean",
        "g_sharpe_min",
        "g_turnover",
        "g_maxdd",
        "g_psr_strict_any",
        "g_dsr_strict_any",
        "g_cpcv_light_sharpe_p25",
        "g_cpcv_light_sharpe_p10",
        "g_cpcv_light_sharpe_p05",
        "g_cpcv_light_sharpe_es10",
        "g_cpcv_light_effective_paths",
        "g_cpcv_light_effective_ratio",
        "g_cpcv_light_paths_total",
        "g_cpcv_light_combos_considered",
        "g_cpcv_light_no_fallback_path",
        "g_cpcv_light_temporal_meta",
        "g_cpcv_light_policy_relaxed",
        "g_cpcv_light_neg_share",
        "g_stress_lite_sharpe",
        "g_stress_lite_maxdd",
        "g_stress_lite_fail_share",
    ]
    hard_strict_gate_names_legacy = [
        "g_fold_policy_valid",
        "g_folds_used",
        "g_ic_mean",
        "g_ic_fold_std",
        "g_sharpe_mean",
        "g_sharpe_min",
        "g_turnover",
        "g_maxdd",
        "g_dsr_strict_any",
        "g_dsr_cpcv_strict",
        "g_cpcv_light_sharpe_p25",
        "g_cpcv_light_sharpe_p10",
        "g_cpcv_light_sharpe_p05",
        "g_cpcv_light_sharpe_es10",
        "g_cpcv_light_effective_paths",
        "g_cpcv_light_effective_ratio",
        "g_cpcv_light_paths_total",
        "g_cpcv_light_combos_considered",
        "g_cpcv_light_no_fallback_path",
        "g_cpcv_light_temporal_meta",
        "g_cpcv_light_policy_relaxed",
        "g_cpcv_light_neg_share",
        "g_stress_lite_sharpe",
        "g_stress_lite_maxdd",
        "g_stress_lite_fail_share",
    ]
    hard_strict_gate_names = (
        hard_strict_gate_names_legacy
        if str(args.strict_quality_gate_mode) == "legacy"
        else hard_strict_gate_names_balanced
    )
    strict_gate_names = hard_strict_gate_names if str(args.strict_gate_profile) == "hard" else broad_strict_gate_names
    stageb_df = stageb_df.with_columns(
        [
            pl.all_horizontal([pl.col(name) for name in strict_gate_names]).alias("stage_b_q1_strict_pass"),
            pl.all_horizontal([pl.col(name) for name, _ in gate_cols]).alias("stage_b_q1_proxy_augmented_pass"),
        ]
    )
    selected_pass_col = "stage_b_q1_strict_pass" if args.pass_mode == "strict" else "stage_b_q1_proxy_augmented_pass"
    stageb_df = stageb_df.with_columns(
        pl.col(selected_pass_col).alias("stage_b_q1_light_pass")
    )
    gate_summary: dict[str, dict[str, float | int]] = {}
    total_candidates = int(stageb_df.height)
    for gname, _ in gate_cols:
        pass_count = int(
            stageb_df.select(pl.col(gname).cast(pl.Int64).sum().fill_null(0).alias("v")).to_dicts()[0]["v"]
        )
        fail_count = int(max(0, total_candidates - pass_count))
        gate_summary[gname] = {
            "pass_count": pass_count,
            "fail_count": fail_count,
            "pass_rate": float(0.0 if total_candidates <= 0 else round(pass_count / total_candidates, 6)),
        }
    stageb_sorted = stageb_df.sort(
        [
            "stage_b_q1_light_pass",
            "dsr_cpcv_strict",
            "psr_cpcv_strict",
            "dsr_strict",
            "psr_strict",
            "dsr_proxy",
            "psr_proxy",
            "ic_5d_oos_mean",
            "candidate_id",
        ],
        descending=[True, True, True, True, True, True, True, True, False],
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
    near_pass_candidates: list[dict] = []
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
                    "psr_strict": _safe_float(row.get("psr_strict")),
                    "dsr_strict": _safe_float(row.get("dsr_strict")),
                    "psr_cpcv_strict": _safe_float(row.get("psr_cpcv_strict")),
                    "dsr_cpcv_strict": _safe_float(row.get("dsr_cpcv_strict")),
                    "sr_star_trials_proxy": _safe_float(row.get("sr_star_trials_proxy")),
                    "sr_star_cpcv_trials_proxy": _safe_float(row.get("sr_star_cpcv_trials_proxy")),
                    "cpcv_light_sharpe_min": _safe_float(row.get("cpcv_light_sharpe_min")),
                    "cpcv_light_sharpe_p25": _safe_float(row.get("cpcv_light_sharpe_p25")),
                    "cpcv_light_sharpe_p10": _safe_float(row.get("cpcv_light_sharpe_p10")),
                    "cpcv_light_sharpe_p05": _safe_float(row.get("cpcv_light_sharpe_p05")),
                    "cpcv_light_sharpe_es10": _safe_float(row.get("cpcv_light_sharpe_es10")),
                    "cpcv_light_neg_sharpe_share": _safe_float(row.get("cpcv_light_neg_sharpe_share")),
                    "ic_5d_oos_p10": _safe_float(row.get("ic_5d_oos_p10")),
                    "ic_5d_oos_es10": _safe_float(row.get("ic_5d_oos_es10")),
                }
            )
        gaps = {
            "psr_strict_gap": max(0.0, float(strict_cfg["psr_strict_min"]) - _safe_float(row.get("psr_strict"))),
            "dsr_strict_gap": max(0.0, float(strict_cfg["dsr_strict_min"]) - _safe_float(row.get("dsr_strict"))),
            "psr_cpcv_strict_gap": max(0.0, float(strict_cfg["psr_cpcv_strict_min"]) - _safe_float(row.get("psr_cpcv_strict"))),
            "dsr_cpcv_strict_gap": max(0.0, float(strict_cfg["dsr_cpcv_strict_min"]) - _safe_float(row.get("dsr_cpcv_strict"))),
            "ic_min_gap": max(0.0, float(strict_cfg["ic_5d_oos_min_min"]) - _safe_float(row.get("ic_5d_oos_min"))),
            "ic_tail_gap": max(0.0, float(strict_cfg["ic_5d_oos_tail_min"]) - _safe_float(row.get("ic_5d_oos_es10"))),
            "stress_lite_sharpe_gap": max(
                0.0,
                float(strict_cfg["stress_lite_sharpe_mean_min"]) - _safe_float(row.get("stress_lite_worst_mean_sharpe")),
            ),
            "stress_lite_fail_share_gap": max(
                0.0,
                _safe_float(row.get("stress_lite_fail_share")) - float(args.stress_lite_fail_share_max),
            ),
            "cpcv_combos_considered_gap": max(
                0.0,
                float(strict_cfg["cpcv_light_min_combos_considered"]) - _safe_float(row.get("cpcv_light_combos_considered_total")),
            ),
            "cpcv_fallback_path_gap": (
                1.0
                if (
                    bool(strict_cfg["cpcv_light_forbid_fallback_path"])
                    and int(row.get("cpcv_light_fallback_to_mean_path") or 0) != 0
                )
                else 0.0
            ),
            "cpcv_policy_relaxed_gap": (
                1.0
                if (
                    str(args.cpcv_light_relaxation_mode) == "strict_fail"
                    and int(row.get("cpcv_light_policy_relaxed") or 0) != 0
                )
                else 0.0
            ),
        }
        near_pass_candidates.append(
            {
                "candidate_id": str(row.get("candidate_id") or ""),
                "family": str(row.get("family") or ""),
                "failed_gate_total": int(len(reasons)),
                "failed_gate_names": list(reasons),
                "strict_gap_total": float(round(sum(gaps.values()), 8)),
                "strict_gap_components": gaps,
                "psr_strict": _safe_float(row.get("psr_strict")),
                "dsr_strict": _safe_float(row.get("dsr_strict")),
                "psr_cpcv_strict": _safe_float(row.get("psr_cpcv_strict")),
                "dsr_cpcv_strict": _safe_float(row.get("dsr_cpcv_strict")),
                "stress_lite_worst_mean_sharpe": _safe_float(row.get("stress_lite_worst_mean_sharpe")),
                "stress_lite_fail_share": _safe_float(row.get("stress_lite_fail_share")),
            }
        )

    near_pass_candidates = sorted(
        near_pass_candidates,
        key=lambda x: (
            float(x.get("strict_gap_total") or 0.0),
            int(x.get("failed_gate_total") or 0),
            str(x.get("candidate_id") or ""),
        ),
    )[:8]

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
            "input_scope_requested": str(args.input_scope),
            "input_scope_effective": input_scope_effective,
            "pass_mode": args.pass_mode,
            "strict_quality_gate_mode": str(args.strict_quality_gate_mode),
            "v4_final_profile": bool(v4_final_profile),
            "selected_pass_column": selected_pass_col,
            "fold_policy": "reuses Stage-A anchored folds with stricter fold-policy minima and CPCV-light combinations on fold metrics",
            "cpcv_light_combo_policy": (
                "all_combo_sizes_from_min_combo_size_to_n_minus_1"
                + ("_skip_adjacent" if bool(args.cpcv_light_skip_adjacent_folds) else "")
                + ("_temporal_filter" if temporal_filter_on else "")
            ),
            "cpcv_light_min_combo_size": int(max(1, args.cpcv_light_min_combo_size)),
            "cpcv_light_skip_adjacent_folds": bool(args.cpcv_light_skip_adjacent_folds),
            "cpcv_light_temporal_filter": temporal_filter_on,
            "cpcv_light_min_test_gap_days": int(max(0, args.cpcv_light_min_test_gap_days)),
            "cpcv_light_min_embargo_gap_days": int(max(0, args.cpcv_light_min_embargo_gap_days)),
            "cpcv_light_min_effective_paths": int(max(1, args.cpcv_light_min_effective_paths)),
            "cpcv_light_min_effective_path_ratio": float(max(0.0, min(1.0, args.cpcv_light_min_effective_path_ratio))),
            "cpcv_light_min_paths_total": int(max(1, args.cpcv_light_min_paths_total)),
            "cpcv_light_min_combos_considered": int(max(1, args.cpcv_light_min_combos_considered)),
            "cpcv_light_requirement_mode": str(args.cpcv_light_requirement_mode),
            "cpcv_light_relaxation_mode": str(args.cpcv_light_relaxation_mode),
            "cpcv_light_forbid_fallback_path": bool(args.cpcv_light_forbid_fallback_path),
            "cpcv_light_effective_paths_requirement_mode": (
                "configured_min"
                if str(args.cpcv_light_requirement_mode) == "configured_min"
                else "min(configured_min, combos_considered_total_floor1)"
            ),
            "cpcv_light_paths_total_requirement_mode": (
                "configured_min"
                if str(args.cpcv_light_requirement_mode) == "configured_min"
                else "min(configured_min, combos_considered_total_floor1)"
            ),
            "bootstrap_resamples": int(max(32, args.bootstrap_resamples)),
            "dsr_trials_total": int(dsr_trials_total),
            "notes": [
                "This is still a Q1-light Stage B approximation, but with stricter fold-policy requirements and stronger CPCV-light gates.",
                "Adds strict PSR/DSR estimates with higher-moment adjustment plus bootstrap proxies.",
                "Adds CPCV-light robustness quantiles (p25/p10/p05 + ES10), temporal fold-separation filtering and stress-lite summaries.",
                "CPCV-light relaxation behavior is controlled by cpcv_light_relaxation_mode (allow|strict_fail).",
                "Pass mode 'strict' excludes proxy gates from final pass/fail decisions while keeping proxy metrics for diagnostics.",
                "strict_quality_gate_mode='balanced' avoids redundant strict-cpcv duplication while preserving strict quality requirements.",
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
            "stage_b_input_candidates_total": int(eval_candidates.height),
            "stage_b_candidates_total": int(stageb_sorted.height),
            "stage_b_candidates_strict_pass_total": int(
                stageb_sorted.select(pl.col("stage_b_q1_strict_pass").cast(pl.Int64).sum().fill_null(0).alias("v")).to_dicts()[0]["v"]
            ),
            "stage_b_candidates_proxy_augmented_pass_total": int(
                stageb_sorted.select(pl.col("stage_b_q1_proxy_augmented_pass").cast(pl.Int64).sum().fill_null(0).alias("v")).to_dicts()[0]["v"]
            ),
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
        "gate_summary": gate_summary,
        "gate_sets": {
            "strict_gate_names": strict_gate_names,
            "hard_strict_gate_names": hard_strict_gate_names,
            "hard_strict_gate_names_balanced": hard_strict_gate_names_balanced,
            "hard_strict_gate_names_legacy": hard_strict_gate_names_legacy,
            "broad_strict_gate_names": broad_strict_gate_names,
            "proxy_gate_names": proxy_gate_names,
            "strict_gate_profile": str(args.strict_gate_profile),
            "selected_mode": args.pass_mode,
            "strict_quality_gate_mode": str(args.strict_quality_gate_mode),
        },
        "fail_reason_counts": dict(sorted(fail_reason_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "failed_examples": examples,
        "near_pass_candidates": near_pass_candidates,
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
