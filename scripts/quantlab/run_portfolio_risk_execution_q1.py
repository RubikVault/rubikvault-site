#!/usr/bin/env python3
from __future__ import annotations

import argparse
import math
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--feature-store-version", default="v4_q1panel_daily_local")
    p.add_argument("--asof-date", default="")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--part-glob", default="part-*.parquet")
    p.add_argument("--panel-output-tag", default="")
    p.add_argument("--stage-b-report", default="")
    p.add_argument("--registry-report", default="")
    p.add_argument("--registry-slot", default="live")
    p.add_argument("--registry-slot-fallback-order", default="live,default,shadow,retired")
    p.add_argument(
        "--candidate-selection-mode",
        choices=["single", "slot_blend"],
        default="slot_blend",
        help="single selects one candidate strategy; slot_blend blends candidates from registry slots.",
    )
    p.add_argument(
        "--registry-slot-blend",
        default="live=1.0,live_alt_1=0.75,live_alt_2=0.50,shadow=0.35",
        help="Comma-separated slot weights for slot_blend mode, e.g. live=1.0,shadow=0.3",
    )
    p.add_argument("--slot-blend-max-candidates", type=int, default=4)
    p.add_argument(
        "--registry-state-multipliers",
        default="live=1.0,live_hold=0.85,shadow=0.35,retired=0.0,unknown=0.25",
        help="State multipliers applied to slot weights in slot_blend mode.",
    )
    p.add_argument("--slot-blend-min-effective-weight", type=float, default=0.01)
    p.add_argument("--slot-blend-require-live-like", action="store_true", default=True)
    p.add_argument("--skip-slot-blend-require-live-like", dest="slot_blend_require_live_like", action="store_false")
    p.add_argument(
        "--slot-blend-live-like-states",
        default="live,live_hold",
        help="Comma-separated state values accepted as live-like for slot_blend safety checks.",
    )
    p.add_argument("--candidate-id", default="")
    p.add_argument(
        "--candidate-selection-source",
        choices=["registry_then_stageb", "stageb_only", "registry_only"],
        default="registry_then_stageb",
    )
    p.add_argument("--min-adv-dollar", type=float, default=250000.0)
    p.add_argument("--top-n-long", type=int, default=120)
    p.add_argument("--top-n-short", type=int, default=120)
    p.add_argument("--max-long-per-family", type=int, default=0, help="0 disables cap; >0 enforces max long picks per family.")
    p.add_argument("--max-short-per-family", type=int, default=0, help="0 disables cap; >0 enforces max short picks per family.")
    p.add_argument("--max-family-abs-exposure", type=float, default=0.0, help="0 disables cap; >0 enforces max sum(abs(weight)) per family.")
    p.add_argument("--family-concentration-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--v4-final-profile", action="store_true", default=False)
    p.add_argument("--allow-shorts", action="store_true", default=True)
    p.add_argument("--skip-allow-shorts", dest="allow_shorts", action="store_false")
    p.add_argument("--target-gross", type=float, default=1.0)
    p.add_argument("--max-gross", type=float, default=1.5)
    p.add_argument("--max-net", type=float, default=1.0)
    p.add_argument("--max-position-weight", type=float, default=0.08)
    p.add_argument(
        "--weighting-mode",
        choices=["equal", "score_invvol_liq"],
        default="score_invvol_liq",
    )
    p.add_argument("--weight-alpha-score", type=float, default=1.0)
    p.add_argument("--weight-alpha-invvol", type=float, default=0.35)
    p.add_argument("--weight-alpha-liq", type=float, default=0.20)
    p.add_argument("--min-rebalance-delta", type=float, default=0.002)
    p.add_argument("--require-nonempty", action="store_true", default=True)
    p.add_argument("--skip-require-nonempty", dest="require_nonempty", action="store_false")
    p.add_argument("--failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--output-tag", default="q1_portfolio")
    return p.parse_args(list(argv))


def _latest_stageb_report(quant_root: Path) -> Path | None:
    runs = quant_root / "runs"
    cands = sorted(runs.glob("run_id=q1stageb_*/stage_b_q1_run_report.json"), key=lambda p: p.stat().st_mtime_ns)
    return cands[-1] if cands else None


def _latest_registry_report(quant_root: Path) -> Path | None:
    runs = quant_root / "runs"
    cands = sorted(runs.glob("run_id=q1registry_*/q1_registry_update_report.json"), key=lambda p: p.stat().st_mtime_ns)
    return cands[-1] if cands else None


def _extract_registry_candidate(
    registry_report: dict[str, Any],
    *,
    slot: str = "live",
    fallback_order: list[str] | None = None,
) -> tuple[str, str, str]:
    artifacts = registry_report.get("artifacts") or {}
    db_path = Path(str(artifacts.get("registry_db") or ""))
    if not db_path.exists():
        return "", "", ""
    slots: list[str] = []
    if str(slot).strip():
        slots.append(str(slot).strip())
    for s in (fallback_order or []):
        ss = str(s).strip()
        if ss and ss not in slots:
            slots.append(ss)
    if not slots:
        slots = ["live", "default", "shadow", "retired"]
    conn = sqlite3.connect(str(db_path))
    try:
        row = None
        slot_used = ""
        for s in slots:
            row = conn.execute(
                "SELECT candidate_id,family,slot FROM champion_state_q1 WHERE slot=? LIMIT 1",
                (str(s),),
            ).fetchone()
            if row:
                slot_used = str(row[2] or s)
                break
    finally:
        conn.close()
    if not row:
        return "", "", ""
    return str(row[0] or ""), str(row[1] or ""), slot_used


def _parse_slot_blend(spec: str) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for tok in str(spec or "").split(","):
        t = str(tok).strip()
        if not t:
            continue
        if "=" in t:
            slot, w = t.split("=", 1)
        elif ":" in t:
            slot, w = t.split(":", 1)
        else:
            slot, w = t, "1.0"
        slot = str(slot).strip()
        try:
            weight = float(str(w).strip())
        except Exception:
            continue
        if not slot or weight <= 0:
            continue
        out.append((slot, float(weight)))
    dedup: dict[str, float] = {}
    for slot, weight in out:
        if slot not in dedup:
            dedup[slot] = float(weight)
    return [(s, dedup[s]) for s in dedup]


def _parse_state_multipliers(spec: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for tok in str(spec or "").split(","):
        t = str(tok).strip()
        if not t:
            continue
        if "=" in t:
            key, val = t.split("=", 1)
        elif ":" in t:
            key, val = t.split(":", 1)
        else:
            continue
        key = str(key).strip().lower()
        if not key:
            continue
        try:
            num = float(str(val).strip())
        except Exception:
            continue
        out[key] = max(0.0, float(num))
    if "unknown" not in out:
        out["unknown"] = 1.0
    return out


def _extract_registry_candidates_for_blend(
    registry_report: dict[str, Any],
    *,
    slot_weights: list[tuple[str, float]],
    state_multipliers: dict[str, float] | None = None,
    min_effective_weight: float = 0.0,
    max_candidates: int = 4,
) -> list[dict[str, Any]]:
    artifacts = registry_report.get("artifacts") or {}
    db_path = Path(str(artifacts.get("registry_db") or ""))
    if not db_path.exists():
        return []
    rows: list[dict[str, Any]] = []
    conn = sqlite3.connect(str(db_path))
    try:
        state_mult_map = {str(k).lower(): float(v) for k, v in (state_multipliers or {}).items()}
        unknown_mult = float(state_mult_map.get("unknown", 1.0))
        min_eff = max(0.0, float(min_effective_weight))
        for slot, weight in slot_weights:
            row = conn.execute(
                "SELECT candidate_id,family,slot,q1_registry_score,state FROM champion_state_q1 WHERE slot=? LIMIT 1",
                (str(slot),),
            ).fetchone()
            if not row:
                continue
            cid = str(row[0] or "")
            if not cid:
                continue
            state = str(row[4] or "").strip().lower()
            state_mult = float(state_mult_map.get(state, unknown_mult))
            eff_weight = float(weight) * float(state_mult)
            if eff_weight <= min_eff:
                continue
            rows.append(
                {
                    "slot": str(row[2] or slot),
                    "candidate_id": cid,
                    "family": str(row[1] or ""),
                    "slot_weight": float(weight),
                    "state_multiplier": float(state_mult),
                    "effective_slot_weight": float(eff_weight),
                    "q1_registry_score": float(row[3] or 0.0),
                    "state": state,
                }
            )
    finally:
        conn.close()
    seen: set[str] = set()
    dedup_rows: list[dict[str, Any]] = []
    for r in rows:
        cid = str(r.get("candidate_id") or "")
        if not cid or cid in seen:
            continue
        seen.add(cid)
        dedup_rows.append(r)
        if len(dedup_rows) >= max(1, int(max_candidates)):
            break
    return dedup_rows


def _extract_stageb_candidate(stageb_report: dict[str, Any]) -> tuple[str, str]:
    artifacts = stageb_report.get("artifacts") or {}
    survivors_path = Path(str(artifacts.get("survivors_B_q1") or ""))
    if not survivors_path.exists():
        stageb_light_report = Path(str(artifacts.get("stage_b_light_report") or ""))
        if stageb_light_report.exists():
            try:
                lrep = read_json(stageb_light_report)
                survivors_path = Path(str((lrep.get("artifacts") or {}).get("survivors_B_light") or ""))
            except Exception:
                survivors_path = Path("")
    if not survivors_path.exists():
        return "", ""
    df = pl.read_parquet(survivors_path)
    if df.is_empty() or "candidate_id" not in df.columns:
        return "", ""
    sort_cols = [c for c in ["q1_registry_score", "dsr_strict", "psr_strict"] if c in df.columns]
    if sort_cols:
        df = df.sort(sort_cols, descending=[True] * len(sort_cols))
    row = df.select(
        [
            pl.col("candidate_id").cast(pl.Utf8),
            (pl.col("family").cast(pl.Utf8) if "family" in df.columns else pl.lit("")),
        ]
    ).row(0)
    return str(row[0] or ""), str(row[1] or "")


def _extract_stageb_governance(stageb_report: dict[str, Any]) -> dict[str, Any]:
    counts = stageb_report.get("counts") or {}
    stageb_light = counts.get("stage_b_light") or {}
    final = stageb_report.get("stage_b_q1_final") or {}
    post_gate = stageb_report.get("post_gate") or {}
    return {
        "run_ok": bool(stageb_report.get("ok")),
        "run_reason": str(stageb_report.get("reason") or ""),
        "strict_pass_total": int(stageb_light.get("stage_b_candidates_strict_pass_total") or 0),
        "candidates_total": int(stageb_light.get("stage_b_candidates_total") or 0),
        "survivors_b_light_total": int(stageb_light.get("survivors_B_light_total") or 0),
        "survivors_b_q1_total": int(
            final.get("survivors_B_q1_total")
            or stageb_light.get("survivors_B_light_total")
            or counts.get("stage_b_survivors_total")
            or 0
        ),
        "selection_mode": str(final.get("selection_mode") or ""),
        "post_gate_failure_mode": str(post_gate.get("failure_mode") or ""),
        "post_gate_failures": [str(x) for x in (post_gate.get("failures") or [])],
        "post_gate_warnings": [str(x) for x in (post_gate.get("warnings") or [])],
    }


def _extract_registry_governance(registry_report: dict[str, Any]) -> dict[str, Any]:
    decision = registry_report.get("decision") or {}
    summary = decision.get("summary_metrics") or {}
    demotion = registry_report.get("demotion_policy") or {}
    return {
        "run_ok": bool(registry_report.get("ok")),
        "decision": str(decision.get("decision") or ""),
        "reason_codes": [str(x) for x in (decision.get("reason_codes") or [])],
        "state_before": str(summary.get("state_before") or ""),
        "state_after": str(summary.get("state_after") or ""),
        "freeze_mode_active": bool(demotion.get("freeze_mode_active")),
        "strict_pass_total": int(demotion.get("strict_pass_total") or 0),
        "stageb_pass_column_used": str(demotion.get("stageb_pass_column_used") or ""),
        "current_live_failed_gate_names": [str(x) for x in (summary.get("current_live_failed_gate_names") or [])],
        "current_live_hard_failed_gate_names": [str(x) for x in (summary.get("current_live_hard_failed_gate_names") or [])],
        "top_survivor_failed_gate_names": [str(x) for x in (summary.get("top_survivor_failed_gate_names") or [])],
        "top_survivor_hard_failed_gate_names": [str(x) for x in (summary.get("top_survivor_hard_failed_gate_names") or [])],
    }


def _feature_files(feature_root: Path, asof_date: str, asset_classes: list[str], part_glob: str) -> list[Path]:
    out: list[Path] = []
    for cls in asset_classes:
        cls_dir = feature_root / f"asof_date={asof_date}" / f"asset_class={cls}"
        if not cls_dir.exists():
            continue
        out.extend(sorted(cls_dir.glob(part_glob)))
    return out


def _apply_family_pick_cap(df: pl.DataFrame, *, max_rows: int, cap_per_family: int, side_label: str) -> tuple[pl.DataFrame, list[str]]:
    max_rows = max(0, int(max_rows))
    cap_per_family = max(0, int(cap_per_family))
    if max_rows <= 0 or df.is_empty():
        return df.head(0), []
    if cap_per_family <= 0 or "family" not in df.columns:
        return df.head(max_rows), []
    picked: list[dict[str, Any]] = []
    fam_counts: dict[str, int] = {}
    skipped_due_cap = 0
    for row in df.to_dicts():
        fam = str(row.get("family") or "")
        used = int(fam_counts.get(fam, 0))
        if used >= cap_per_family:
            skipped_due_cap += 1
            continue
        picked.append(row)
        fam_counts[fam] = used + 1
        if len(picked) >= max_rows:
            break
    warnings: list[str] = []
    if skipped_due_cap > 0:
        warnings.append(
            f"FAMILY_CAP_APPLIED:{side_label}:cap={cap_per_family}:skipped={skipped_due_cap}:picked={len(picked)}"
        )
    return pl.DataFrame(picked) if picked else df.head(0), warnings


def _candidate_expr(candidate_id: str) -> tuple[str, pl.Expr] | None:
    # Keep candidate math aligned with Stage-A family formulas.
    mapping: dict[str, tuple[str, pl.Expr]] = {
        "tsmom_20": ("TSMOM", 0.8 * pl.col("z_ret_20d") + 0.2 * pl.col("trend_gate")),
        "tsmom_20_macd": ("TSMOM", 0.6 * pl.col("z_ret_20d") + 0.4 * pl.col("z_macd_hist")),
        "csmom_20_liq": ("CSMOM", 0.7 * pl.col("z_ret_20d") + 0.3 * pl.col("z_liq")),
        "mr_rsi": ("MEANREV", -pl.col("z_rsi_14")),
        "mr_rsi_boll": ("MEANREV", -0.6 * pl.col("z_rsi_14") - 0.4 * pl.col("z_boll_z_20")),
        "breakout_trend": ("BREAKOUT", 0.6 * pl.col("trend_gate") + 0.4 * pl.col("z_macd_hist")),
        "vol_contraction": ("VOL", -0.5 * pl.col("z_vol_20") - 0.5 * pl.col("z_atr_pct_14")),
        "quality_liq_lowvol": ("QUALITY", 0.6 * pl.col("z_liq") - 0.4 * pl.col("z_vol_20")),
        "tsmom_20_riskadj": ("TSMOM", 0.55 * pl.col("z_ret_20d") + 0.25 * pl.col("z_macd_hist") - 0.20 * pl.col("z_vol_20")),
        "tsmom_trend_quality": ("TSMOM", 0.50 * pl.col("trend_gate") + 0.35 * pl.col("z_ret_20d") + 0.15 * pl.col("z_liq")),
        "csmom_20_trend_liq": ("CSMOM", 0.55 * pl.col("z_ret_20d") + 0.25 * pl.col("trend_gate") + 0.20 * pl.col("z_liq")),
        "csmom_20_macd_liq": ("CSMOM", 0.50 * pl.col("z_ret_20d") + 0.25 * pl.col("z_macd_hist") + 0.25 * pl.col("z_liq")),
        "mr_rsi_trendfilter": ("MEANREV", -0.70 * pl.col("z_rsi_14") - 0.30 * pl.col("trend_gate")),
        "mr_boll_vol": ("MEANREV", -0.60 * pl.col("z_boll_z_20") - 0.40 * pl.col("z_vol_20")),
        "breakout_trend_volfilter": ("BREAKOUT", 0.50 * pl.col("trend_gate") + 0.35 * pl.col("z_macd_hist") - 0.15 * pl.col("z_vol_20")),
        "quality_liq_lowvol_macd": ("QUALITY", 0.45 * pl.col("z_liq") - 0.35 * pl.col("z_vol_20") + 0.20 * pl.col("z_macd_hist")),
        "tsmom_trend_quality_v2": ("TSMOM", 0.42 * pl.col("trend_gate") + 0.38 * pl.col("z_ret_20d") + 0.20 * pl.col("z_liq")),
        "tsmom_trend_macd_lowvol": ("TSMOM", 0.40 * pl.col("trend_gate") + 0.30 * pl.col("z_macd_hist") + 0.20 * pl.col("z_ret_20d") - 0.10 * pl.col("z_vol_20")),
        "tsmom_ret_macd_liq": ("TSMOM", 0.45 * pl.col("z_ret_20d") + 0.30 * pl.col("z_macd_hist") + 0.25 * pl.col("z_liq")),
        "tsmom_trend_quality_v3": ("TSMOM", 0.45 * pl.col("trend_gate") + 0.30 * pl.col("z_ret_20d") + 0.15 * pl.col("z_liq") + 0.10 * pl.col("z_macd_hist")),
        "tsmom_trend_defensive": ("TSMOM", 0.45 * pl.col("trend_gate") + 0.25 * pl.col("z_ret_20d") + 0.20 * pl.col("z_macd_hist") + 0.20 * pl.col("z_liq") - 0.10 * pl.col("z_vol_20")),
        "csmom_trend_liq_v2": ("CSMOM", 0.42 * pl.col("trend_gate") + 0.33 * pl.col("z_ret_20d") + 0.25 * pl.col("z_liq")),
        "csmom_trend_macd_liq": ("CSMOM", 0.35 * pl.col("trend_gate") + 0.30 * pl.col("z_ret_20d") + 0.20 * pl.col("z_macd_hist") + 0.15 * pl.col("z_liq")),
        "csmom_ret5_ret20_liq": ("CSMOM", 0.45 * pl.col("z_ret_20d") + 0.25 * pl.col("z_ret_5d") + 0.30 * pl.col("z_liq")),
        "csmom_trend_macd_liq_v2": ("CSMOM", 0.40 * pl.col("trend_gate") + 0.22 * pl.col("z_ret_20d") + 0.18 * pl.col("z_macd_hist") + 0.20 * pl.col("z_liq")),
        "csmom_trend_macd_liq_v3": ("CSMOM", 0.46 * pl.col("trend_gate") + 0.20 * pl.col("z_ret_20d") + 0.14 * pl.col("z_macd_hist") + 0.20 * pl.col("z_liq")),
        "quality_trend_liq_lowvol": ("QUALITY", 0.35 * pl.col("trend_gate") + 0.35 * pl.col("z_liq") - 0.30 * pl.col("z_vol_20")),
        "breakout_trend_macd_liq": ("BREAKOUT", 0.45 * pl.col("trend_gate") + 0.35 * pl.col("z_macd_hist") + 0.20 * pl.col("z_liq")),
        "breakout_trend_macd_liq_v2": ("BREAKOUT", 0.50 * pl.col("trend_gate") + 0.30 * pl.col("z_macd_hist") + 0.10 * pl.col("z_liq") - 0.10 * pl.col("z_vol_20")),
        "breakout_trend_macd_liq_v3": ("BREAKOUT", 0.55 * pl.col("trend_gate") + 0.25 * pl.col("z_macd_hist") + 0.20 * pl.col("z_liq")),
    }
    return mapping.get(str(candidate_id))


def _z_expr(col: str, alias: str) -> pl.Expr:
    mean_expr = pl.col(col).mean().over("asset_class")
    std_expr = pl.col(col).std().over("asset_class")
    return (
        pl.when(std_expr.abs() > 1e-12)
        .then((pl.col(col) - mean_expr) / std_expr)
        .otherwise(0.0)
        .cast(pl.Float64)
        .alias(alias)
    )


def _prepare_scoring_frame(df: pl.DataFrame) -> pl.DataFrame:
    out = df.with_columns(pl.col("adv20_dollar").clip(lower_bound=1e-9).log().alias("_log_adv20")).with_columns(
        [
            _z_expr("ret_20d", "z_ret_20d"),
            _z_expr("ret_5d", "z_ret_5d"),
            _z_expr("rsi_14", "z_rsi_14"),
            _z_expr("macd_hist", "z_macd_hist"),
            _z_expr("atr_pct_14", "z_atr_pct_14"),
            _z_expr("ewma_vol_20", "z_vol_20"),
            _z_expr("boll_z_20", "z_boll_z_20"),
            _z_expr("_log_adv20", "z_liq"),
            ((pl.col("close_raw") > pl.col("sma_200")).cast(pl.Int8) * 2 - 1).cast(pl.Float64).alias("trend_gate"),
        ]
    )
    return out


def _build_side_positions(
    df: pl.DataFrame,
    *,
    side: str,
    weighting_mode: str,
    alpha_score: float,
    alpha_invvol: float,
    alpha_liq: float,
) -> pl.DataFrame:
    if df.is_empty():
        return df.head(0)
    out = df.with_row_index("_row_idx")
    if str(weighting_mode) == "equal":
        raw = out.with_columns(pl.lit(1.0).alias("_raw_weight"))
    else:
        descending = True if side == "LONG" else False
        rank_expr = (
            pl.col("signal_score")
            .rank(method="ordinal", descending=descending)
            .cast(pl.Float64)
        )
        n = max(1, int(out.height))
        score_component = (pl.lit(float(n + 1)) - rank_expr).clip(lower_bound=1.0)
        invvol_component = (1.0 / pl.col("ewma_vol_20").clip(lower_bound=1e-6)).clip(lower_bound=1e-6)
        liq_component = pl.col("adv20_dollar").clip(lower_bound=1.0).log1p().clip(lower_bound=1e-6)
        raw = out.with_columns(
            (
                score_component.pow(float(max(0.0, alpha_score)))
                * invvol_component.pow(float(max(0.0, alpha_invvol)))
                * liq_component.pow(float(max(0.0, alpha_liq)))
            ).alias("_raw_weight")
        )
    raw_sum = float(raw.select(pl.col("_raw_weight").sum()).item() or 0.0)
    if raw_sum <= 0:
        raw = raw.with_columns(pl.lit(1.0).alias("_raw_weight"))
        raw_sum = float(raw.height)
    sign = 1.0 if side == "LONG" else -1.0
    return raw.with_columns(
        [
            pl.lit(side).alias("side"),
            (pl.col("_raw_weight") / float(raw_sum) * float(sign)).alias("target_weight_raw"),
        ]
    ).drop(["_row_idx", "_raw_weight"])


def _current_positions(path: Path) -> pl.DataFrame:
    empty = pl.DataFrame(
        {
            "asset_id": pl.Series("asset_id", [], dtype=pl.Utf8),
            "old_weight": pl.Series("old_weight", [], dtype=pl.Float64),
        }
    )
    if not path.exists():
        return empty
    try:
        df = pl.read_parquet(path)
        if "asset_id" not in df.columns:
            return empty
        w_col = "target_weight" if "target_weight" in df.columns else ("weight" if "weight" in df.columns else None)
        if not w_col:
            return empty
        return df.select([pl.col("asset_id").cast(pl.Utf8), pl.col(w_col).cast(pl.Float64).alias("old_weight")])
    except Exception:
        return empty


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    v4_final_profile = bool(args.v4_final_profile)
    if v4_final_profile:
        if int(args.max_long_per_family) <= 0:
            args.max_long_per_family = 16
        if int(args.max_short_per_family) <= 0:
            args.max_short_per_family = 16
        if float(args.max_family_abs_exposure) <= 0.0:
            args.max_family_abs_exposure = 0.35
        if str(args.family_concentration_failure_mode).lower() == "off":
            args.family_concentration_failure_mode = "hard"

    quant_root = Path(args.quant_root).resolve()
    run_id = f"q1portfolio_{int(time.time())}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_portfolio_risk_execution_report.json"

    stageb_report_path = Path(args.stage_b_report).resolve() if str(args.stage_b_report).strip() else _latest_stageb_report(quant_root)
    registry_report_path = Path(args.registry_report).resolve() if str(args.registry_report).strip() else _latest_registry_report(quant_root)
    stageb_report = read_json(stageb_report_path) if (stageb_report_path and stageb_report_path.exists()) else {}
    registry_report = read_json(registry_report_path) if (registry_report_path and registry_report_path.exists()) else {}
    stageb_governance = _extract_stageb_governance(stageb_report) if stageb_report else {}
    registry_governance = _extract_registry_governance(registry_report) if registry_report else {}

    candidate_id = str(args.candidate_id or "").strip()
    candidate_family = ""
    candidate_source = "cli_override" if candidate_id else "unresolved"
    registry_slot_used = ""
    blend_candidates: list[dict[str, Any]] = []
    blend_weight_total = 0.0
    blend_selection_warnings: list[str] = []
    registry_slot_fallback_order = [x.strip() for x in str(args.registry_slot_fallback_order or "").split(",") if x.strip()]
    slot_blend_live_like_states = {
        x.strip().lower() for x in str(args.slot_blend_live_like_states or "").split(",") if x.strip()
    }
    if not slot_blend_live_like_states:
        slot_blend_live_like_states = {"live", "live_hold"}
    if not candidate_id and args.candidate_selection_source in {"registry_then_stageb", "registry_only"} and registry_report:
        if str(args.candidate_selection_mode) == "slot_blend":
            slot_weights = _parse_slot_blend(str(args.registry_slot_blend or ""))
            state_multipliers = _parse_state_multipliers(str(args.registry_state_multipliers or ""))
            blend_candidates = _extract_registry_candidates_for_blend(
                registry_report,
                slot_weights=slot_weights,
                state_multipliers=state_multipliers,
                min_effective_weight=float(args.slot_blend_min_effective_weight),
                max_candidates=int(args.slot_blend_max_candidates),
            )
            supported_blend: list[dict[str, Any]] = []
            for bc in blend_candidates:
                cid = str(bc.get("candidate_id") or "")
                expr_info = _candidate_expr(cid)
                if expr_info is None:
                    continue
                supported_blend.append(
                    {
                        **bc,
                        "family": str(expr_info[0] or bc.get("family") or ""),
                    }
                )
            blend_candidates = supported_blend
            if bool(args.slot_blend_require_live_like):
                has_live_like = any(
                    str(x.get("state") or "").lower() in slot_blend_live_like_states for x in blend_candidates
                )
                if not has_live_like:
                    blend_selection_warnings.append("SLOT_BLEND_NO_LIVE_LIKE_STATE_FALLBACK_TO_SINGLE")
                    blend_candidates = []
            blend_weight_total = float(sum(float(x.get("effective_slot_weight") or 0.0) for x in blend_candidates))
            if blend_candidates and blend_weight_total > 0:
                candidate_source = "registry_slot_blend"
                candidate_family = "BLEND"
                registry_slot_used = ",".join(str(x.get("slot") or "") for x in blend_candidates)
            else:
                cid, fam, slot_used = _extract_registry_candidate(
                    registry_report,
                    slot=str(args.registry_slot),
                    fallback_order=registry_slot_fallback_order,
                )
                if cid:
                    candidate_id, candidate_family, candidate_source = cid, fam, "registry_champion"
                    registry_slot_used = str(slot_used or "")
        else:
            cid, fam, slot_used = _extract_registry_candidate(
                registry_report,
                slot=str(args.registry_slot),
                fallback_order=registry_slot_fallback_order,
            )
            if cid:
                candidate_id, candidate_family, candidate_source = cid, fam, "registry_champion"
                registry_slot_used = str(slot_used or "")
    if (
        not candidate_id
        and not blend_candidates
        and args.candidate_selection_source in {"registry_then_stageb", "stageb_only"}
        and stageb_report
    ):
        cid, fam = _extract_stageb_candidate(stageb_report)
        if cid:
            candidate_id, candidate_family, candidate_source = cid, fam, "stageb_survivor_top"

    expr_info = _candidate_expr(candidate_id) if candidate_id else None
    if not blend_candidates and expr_info is None:
        report = {
            "schema": "quantlab_q1_portfolio_risk_execution_report_v1",
            "generated_at": utc_now_iso(),
            "run_id": run_id,
            "ok": False,
            "exit_code": 52,
            "reason": "candidate_unresolved_or_unsupported",
            "candidate_id": candidate_id,
            "candidate_source": candidate_source,
            "inputs": {
                "stage_b_report": str(stageb_report_path) if stageb_report_path else "",
                "registry_report": str(registry_report_path) if registry_report_path else "",
                "feature_store_version": str(args.feature_store_version),
            },
        }
        atomic_write_json(report_path, report)
        print(f"run_id={run_id}")
        print(f"report={report_path}")
        print("ok=false")
        return 52

    candidate_family = candidate_family or (expr_info[0] if expr_info is not None else "BLEND")

    allow_shorts_effective = bool(args.allow_shorts)
    target_gross_effective = min(float(args.target_gross), float(args.max_gross))
    max_position_weight_effective = float(args.max_position_weight)
    top_n_long_effective = int(args.top_n_long)
    top_n_short_effective = int(args.top_n_short) if allow_shorts_effective else 0
    weighting_mode_effective = str(args.weighting_mode)
    weight_alpha_score_effective = float(args.weight_alpha_score)
    weight_alpha_invvol_effective = float(args.weight_alpha_invvol)
    weight_alpha_liq_effective = float(args.weight_alpha_liq)
    allocation_policy = {
        "mode": "normal",
        "reasons": [],
    }
    registry_state_after = str(registry_governance.get("state_after") or "").lower()
    registry_hard_failed = [str(x) for x in (registry_governance.get("current_live_hard_failed_gate_names") or [])]
    if candidate_source in {"registry_champion", "registry_slot_blend"} and (
        registry_state_after == "live_hold"
        or (
            bool(registry_governance.get("freeze_mode_active"))
            and int(registry_governance.get("strict_pass_total") or 0) <= 0
        )
    ):
        allocation_policy["mode"] = "defensive_live_hold"
        allocation_policy["reasons"] = ["registry_live_hold", "strict_pass_empty_freeze"]
        allow_shorts_effective = False
        target_gross_effective = min(target_gross_effective, 0.35)
        max_position_weight_effective = min(max_position_weight_effective, 0.04)
        top_n_long_effective = min(top_n_long_effective, 60)
        top_n_short_effective = 0
        weighting_mode_effective = "score_invvol_liq"
        weight_alpha_score_effective = min(weight_alpha_score_effective, 0.75)
        weight_alpha_invvol_effective = max(weight_alpha_invvol_effective, 0.60)
        weight_alpha_liq_effective = max(weight_alpha_liq_effective, 0.30)
    if candidate_source in {"registry_champion", "registry_slot_blend"} and registry_hard_failed:
        allocation_policy["mode"] = "defensive_hard_gates"
        allocation_policy["reasons"] = sorted({"current_live_hard_gates_failed", *allocation_policy.get("reasons", [])})
        allow_shorts_effective = False
        target_gross_effective = min(target_gross_effective, 0.20)
        max_position_weight_effective = min(max_position_weight_effective, 0.03)
        top_n_long_effective = min(top_n_long_effective, 40)
        top_n_short_effective = 0
        weighting_mode_effective = "score_invvol_liq"
        weight_alpha_score_effective = min(weight_alpha_score_effective, 0.60)
        weight_alpha_invvol_effective = max(weight_alpha_invvol_effective, 0.80)
        weight_alpha_liq_effective = max(weight_alpha_liq_effective, 0.40)
    if candidate_source in {"registry_champion", "registry_slot_blend"} and registry_state_after == "shadow" and bool(registry_governance.get("freeze_mode_active")):
        allocation_policy["mode"] = "defensive_shadow_fallback"
        allocation_policy["reasons"] = sorted({"registry_shadow_fallback", *allocation_policy.get("reasons", [])})
        allow_shorts_effective = False
        target_gross_effective = min(target_gross_effective, 0.10)
        max_position_weight_effective = min(max_position_weight_effective, 0.025)
        top_n_long_effective = min(top_n_long_effective, 25)
        top_n_short_effective = 0
        weighting_mode_effective = "score_invvol_liq"
        weight_alpha_score_effective = min(weight_alpha_score_effective, 0.50)
        weight_alpha_invvol_effective = max(weight_alpha_invvol_effective, 0.90)
        weight_alpha_liq_effective = max(weight_alpha_liq_effective, 0.45)

    feature_root = quant_root / "features" / "store" / f"feature_store_version={args.feature_store_version}"
    if not feature_root.exists():
        raise SystemExit(f"FATAL: feature store missing: {feature_root}")
    asof_dirs = sorted([p for p in feature_root.glob("asof_date=*") if p.is_dir()], key=lambda p: p.name)
    if not asof_dirs:
        raise SystemExit(f"FATAL: no asof_date partitions under {feature_root}")
    asof_date = str(args.asof_date or "").strip() or asof_dirs[-1].name.split("=", 1)[1]

    asset_classes = [x.strip().lower() for x in str(args.asset_classes or "").split(",") if x.strip()]
    part_glob = str(args.part_glob)
    if str(args.panel_output_tag).strip() and part_glob == "part-*.parquet":
        part_glob = f"part-{str(args.panel_output_tag).strip()}*.parquet"
    files = _feature_files(feature_root, asof_date=asof_date, asset_classes=asset_classes, part_glob=part_glob)
    if not files:
        raise SystemExit(f"FATAL: no feature files for asof_date={asof_date} part_glob={part_glob}")

    required_cols = [
        "asof_date",
        "asset_id",
        "asset_class",
        "close_raw",
        "sma_200",
        "adv20_dollar",
        "ret_20d",
        "ret_5d",
        "rsi_14",
        "macd_hist",
        "atr_pct_14",
        "ewma_vol_20",
        "boll_z_20",
    ]
    df = pl.scan_parquet([str(x) for x in files]).select([pl.col(c) for c in required_cols]).collect(engine="streaming")
    df = df.with_columns(
        [
            pl.col("asset_id").cast(pl.Utf8),
            pl.col("asset_class").cast(pl.Utf8).str.to_lowercase(),
            pl.col("asof_date").cast(pl.Utf8),
            pl.col("close_raw").cast(pl.Float64),
            pl.col("sma_200").cast(pl.Float64),
            pl.col("adv20_dollar").cast(pl.Float64),
            pl.col("ret_20d").cast(pl.Float64),
            pl.col("ret_5d").cast(pl.Float64),
            pl.col("rsi_14").cast(pl.Float64),
            pl.col("macd_hist").cast(pl.Float64),
            pl.col("atr_pct_14").cast(pl.Float64),
            pl.col("ewma_vol_20").cast(pl.Float64),
            pl.col("boll_z_20").cast(pl.Float64),
        ]
    )
    df = df.filter(pl.col("asof_date") == asof_date).filter(pl.col("asset_class").is_in(asset_classes))
    df = df.filter((pl.col("close_raw") > 0) & (pl.col("adv20_dollar") >= float(args.min_adv_dollar)))
    df = df.drop_nulls(
        [
            "close_raw",
            "sma_200",
            "adv20_dollar",
            "ret_20d",
            "ret_5d",
            "rsi_14",
            "macd_hist",
            "atr_pct_14",
            "ewma_vol_20",
            "boll_z_20",
        ]
    )
    # Keep one deterministic row per asset if duplicated by historical run tags.
    df = df.sort(["asset_id", "adv20_dollar"], descending=[False, True]).unique(subset=["asset_id"], keep="first")
    if df.is_empty():
        raise SystemExit("FATAL: no eligible assets after filtering")

    scored = _prepare_scoring_frame(df)
    if blend_candidates and blend_weight_total > 0:
        blend_expr_terms: list[pl.Expr] = []
        for idx, bc in enumerate(blend_candidates):
            cid = str(bc.get("candidate_id") or "")
            expr_info_bc = _candidate_expr(cid)
            if expr_info_bc is None:
                continue
            alias = f"_sig_{idx}_{cid}"
            scored = scored.with_columns(expr_info_bc[1].alias(alias))
            w = float(bc.get("effective_slot_weight") or 0.0) / float(blend_weight_total)
            blend_expr_terms.append(pl.col(alias) * float(w))
        if not blend_expr_terms:
            raise SystemExit("FATAL: slot_blend resolved no supported candidate expressions")
        blend_expr = blend_expr_terms[0]
        for e in blend_expr_terms[1:]:
            blend_expr = blend_expr + e
        scored = scored.with_columns(blend_expr.alias("signal_score"))
    else:
        if expr_info is None:
            raise SystemExit("FATAL: candidate expression missing in single mode")
        scored = scored.with_columns(expr_info[1].alias("signal_score"))
    scored = scored.drop_nulls(["signal_score"])
    if scored.is_empty():
        raise SystemExit("FATAL: no scored assets")

    n_long_target = max(0, int(top_n_long_effective))
    n_short_target = max(0, int(top_n_short_effective)) if bool(allow_shorts_effective) else 0
    long_sorted = scored.sort("signal_score", descending=True)
    long_df, long_family_cap_warnings = _apply_family_pick_cap(
        long_sorted,
        max_rows=n_long_target,
        cap_per_family=int(args.max_long_per_family),
        side_label="LONG",
    )
    short_sorted = scored.sort("signal_score")
    short_df, short_family_cap_warnings = _apply_family_pick_cap(
        short_sorted,
        max_rows=n_short_target,
        cap_per_family=int(args.max_short_per_family),
        side_label="SHORT",
    )
    if short_df.height > 0 and long_df.height > 0:
        long_ids = set(str(x) for x in long_df.get_column("asset_id").to_list())
        short_df = short_df.filter(~pl.col("asset_id").is_in(sorted(long_ids)))
    n_long = int(long_df.height)
    n_short = int(short_df.height)

    long_pos = _build_side_positions(
        long_df,
        side="LONG",
        weighting_mode=weighting_mode_effective,
        alpha_score=weight_alpha_score_effective,
        alpha_invvol=weight_alpha_invvol_effective,
        alpha_liq=weight_alpha_liq_effective,
    )
    short_pos = _build_side_positions(
        short_df,
        side="SHORT",
        weighting_mode=weighting_mode_effective,
        alpha_score=weight_alpha_score_effective,
        alpha_invvol=weight_alpha_invvol_effective,
        alpha_liq=weight_alpha_liq_effective,
    )
    positions = pl.concat([long_pos, short_pos], how="diagonal") if short_pos.height else long_pos

    gross_raw = float(positions.select(pl.col("target_weight_raw").abs().sum()).item() or 0.0) if positions.height else 0.0
    gross_target = float(target_gross_effective)
    scale = (gross_target / gross_raw) if gross_raw > 1e-12 else 1.0
    positions = positions.with_columns(
        (pl.col("target_weight_raw") * float(scale))
        .clip(lower_bound=-float(max_position_weight_effective), upper_bound=float(max_position_weight_effective))
        .alias("target_weight")
    )

    gross = float(positions.select(pl.col("target_weight").abs().sum()).item() or 0.0) if positions.height else 0.0
    net = float(positions.select(pl.col("target_weight").sum()).item() or 0.0) if positions.height else 0.0
    max_abs_weight = float(positions.select(pl.col("target_weight").abs().max()).item() or 0.0) if positions.height else 0.0
    long_exposure = float(positions.select(pl.col("target_weight").clip(lower_bound=0.0).sum()).item() or 0.0) if positions.height else 0.0
    short_exposure = float((-positions.select(pl.col("target_weight").clip(upper_bound=0.0).sum()).item()) or 0.0) if positions.height else 0.0
    hhi = float(positions.select((pl.col("target_weight") ** 2).sum()).item() or 0.0) if positions.height else 0.0
    weighted_vol_proxy = (
        math.sqrt(
            float(
                positions.select(((pl.col("target_weight") ** 2) * (pl.col("ewma_vol_20") ** 2)).sum()).item() or 0.0
            )
        )
        if positions.height
        else 0.0
    )

    prev_positions_path = quant_root / "ops" / "portfolio_q1" / "latest_positions.parquet"
    prev = _current_positions(prev_positions_path)
    now = positions.select([pl.col("asset_id").cast(pl.Utf8), pl.col("target_weight").cast(pl.Float64), pl.col("side"), pl.col("signal_score"), pl.col("asset_class"), pl.col("adv20_dollar"), pl.col("ewma_vol_20")])
    reb = (
        now.join(prev, on="asset_id", how="full")
        .with_columns(pl.coalesce([pl.col("asset_id"), pl.col("asset_id_right")]).cast(pl.Utf8).alias("asset_id"))
        .drop(["asset_id_right"])
        .with_columns(
            [
                pl.col("target_weight").fill_null(0.0),
                pl.col("old_weight").fill_null(0.0),
            ]
        )
        .with_columns((pl.col("target_weight") - pl.col("old_weight")).alias("delta_weight"))
    )
    orders = reb.filter(pl.col("delta_weight").abs() >= float(args.min_rebalance_delta)).with_columns(
        [
            pl.when((pl.col("old_weight") == 0) & (pl.col("target_weight") != 0))
            .then(pl.lit("OPEN"))
            .when((pl.col("old_weight") != 0) & (pl.col("target_weight") == 0))
            .then(pl.lit("CLOSE"))
            .when(pl.col("old_weight") * pl.col("target_weight") < 0)
            .then(pl.lit("FLIP"))
            .when(pl.col("target_weight").abs() > pl.col("old_weight").abs())
            .then(pl.lit("INCREASE"))
            .otherwise(pl.lit("DECREASE"))
            .alias("action")
        ]
    ).sort("delta_weight", descending=True)

    failures: list[str] = []
    warnings: list[str] = []
    warnings.extend(long_family_cap_warnings)
    warnings.extend(short_family_cap_warnings)
    warnings.extend([f"SLOT_BLEND_POLICY:{x}" for x in blend_selection_warnings])
    if candidate_source == "stageb_survivor_top":
        if stageb_governance:
            if not bool(stageb_governance.get("run_ok")):
                failures.append("PORTFOLIO_STAGEB_REPORT_NOT_OK")
            if int(stageb_governance.get("strict_pass_total") or 0) <= 0:
                failures.append("PORTFOLIO_STAGEB_STRICT_PASS_EMPTY")
            if int(stageb_governance.get("survivors_b_q1_total") or 0) <= 0:
                failures.append("PORTFOLIO_STAGEB_SURVIVORS_EMPTY")
            for msg in [str(x) for x in (stageb_governance.get("post_gate_failures") or [])]:
                failures.append(f"PORTFOLIO_STAGEB_POST_GATE_FAIL:{msg}")
            for msg in [str(x) for x in (stageb_governance.get("post_gate_warnings") or [])]:
                warnings.append(f"PORTFOLIO_STAGEB_POST_GATE_WARN:{msg}")
    if candidate_source in {"registry_champion", "registry_slot_blend"}:
        if registry_governance:
            state_after = str(registry_governance.get("state_after") or "").lower()
            shadow_fallback_active = state_after == "shadow" and bool(registry_governance.get("freeze_mode_active"))
            if shadow_fallback_active:
                warnings.append("PORTFOLIO_REGISTRY_SHADOW_FALLBACK_ACTIVE")
            elif state_after not in {"", "live", "live_hold"}:
                failures.append(f"PORTFOLIO_REGISTRY_CHAMPION_NOT_LIVE:{registry_governance.get('state_after')}")
            if bool(registry_governance.get("freeze_mode_active")):
                warnings.append("PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE")
            if int(registry_governance.get("strict_pass_total") or 0) <= 0:
                warnings.append("PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY")
            hard_failed = [str(x) for x in (registry_governance.get("current_live_hard_failed_gate_names") or [])]
            if hard_failed:
                warnings.append("PORTFOLIO_REGISTRY_CURRENT_LIVE_HARD_GATES_FAILED:" + ",".join(sorted(hard_failed)))
    if bool(args.require_nonempty) and positions.height <= 0:
        failures.append("PORTFOLIO_EMPTY")
    if gross <= 0:
        failures.append("PORTFOLIO_GROSS_ZERO")
    if gross > float(args.max_gross) + 1e-9:
        failures.append(f"PORTFOLIO_GROSS_EXCEEDS_MAX:{gross:.6f}>{float(args.max_gross):.6f}")
    if abs(net) > float(args.max_net) + 1e-9:
        failures.append(f"PORTFOLIO_NET_EXCEEDS_MAX:{abs(net):.6f}>{float(args.max_net):.6f}")
    if max_abs_weight > float(args.max_position_weight) + 1e-9:
        failures.append(
            f"PORTFOLIO_POSITION_EXCEEDS_MAX:{max_abs_weight:.6f}>{float(args.max_position_weight):.6f}"
        )
    if weighted_vol_proxy <= 0:
        warnings.append("WEIGHTED_VOL_PROXY_NONPOSITIVE")
    if int(orders.height) == 0:
        warnings.append("NO_REBALANCE_ORDERS_EMITTED")

    family_exposure_table: list[dict[str, Any]] = []
    family_cap_breaches: list[dict[str, Any]] = []
    if positions.height > 0 and "family" in positions.columns:
        fam_df = (
            positions.group_by("family")
            .agg(
                [
                    pl.col("target_weight").sum().alias("net_weight"),
                    pl.col("target_weight").abs().sum().alias("abs_weight"),
                    pl.len().alias("positions_count"),
                    (pl.col("side") == "LONG").sum().alias("long_count"),
                    (pl.col("side") == "SHORT").sum().alias("short_count"),
                ]
            )
            .sort("abs_weight", descending=True)
        )
        family_exposure_table = [
            {
                "family": str(r.get("family") or ""),
                "net_weight": float(r.get("net_weight") or 0.0),
                "abs_weight": float(r.get("abs_weight") or 0.0),
                "positions_count": int(r.get("positions_count") or 0),
                "long_count": int(r.get("long_count") or 0),
                "short_count": int(r.get("short_count") or 0),
            }
            for r in fam_df.to_dicts()
        ]
        max_family_abs_exposure = float(args.max_family_abs_exposure or 0.0)
        if max_family_abs_exposure > 0.0:
            for rec in family_exposure_table:
                if float(rec.get("abs_weight") or 0.0) > max_family_abs_exposure + 1e-9:
                    family_cap_breaches.append(rec)
            if family_cap_breaches:
                breach_msg = (
                    "PORTFOLIO_FAMILY_ABS_EXPOSURE_BREACH:"
                    + ",".join(
                        f"{str(x.get('family') or '')}:{float(x.get('abs_weight') or 0.0):.6f}>{max_family_abs_exposure:.6f}"
                        for x in family_cap_breaches
                    )
                )
                fam_mode = str(args.family_concentration_failure_mode or "warn").lower()
                if fam_mode == "hard":
                    failures.append(breach_msg)
                elif fam_mode == "warn":
                    warnings.append(breach_msg)

    artifacts_dir = run_root / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    positions_path = artifacts_dir / "portfolio_positions.parquet"
    orders_path = artifacts_dir / "execution_orders.parquet"
    positions.write_parquet(positions_path)
    orders.write_parquet(orders_path)

    ops_root = quant_root / "ops" / "portfolio_q1"
    ops_root.mkdir(parents=True, exist_ok=True)
    latest_report_path = ops_root / "latest_report.json"
    latest_positions_path = ops_root / "latest_positions.parquet"
    positions.write_parquet(latest_positions_path)

    ok = not failures or str(args.failure_mode).lower() == "warn"
    exit_code = 0 if ok else 44
    if failures and str(args.failure_mode).lower() == "warn":
        warnings.extend([f"WARN_ONLY:{x}" for x in failures])

    report = {
        "schema": "quantlab_q1_portfolio_risk_execution_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": bool(ok),
        "exit_code": int(exit_code),
        "asof_date": asof_date,
        "candidate": {
            "candidate_id": candidate_id,
            "family": candidate_family,
            "source": candidate_source,
            "selection_mode": str(args.candidate_selection_mode),
            "registry_slot_requested": str(args.registry_slot),
            "registry_slot_used": str(registry_slot_used or args.registry_slot),
            "registry_slot_fallback_order": registry_slot_fallback_order,
            "registry_slot_blend": str(args.registry_slot_blend),
            "blend_candidates_total": int(len(blend_candidates)),
            "blend_candidates": [
                {
                    "slot": str(x.get("slot") or ""),
                    "candidate_id": str(x.get("candidate_id") or ""),
                    "family": str(x.get("family") or ""),
                    "slot_weight": float(x.get("slot_weight") or 0.0),
                    "state_multiplier": float(x.get("state_multiplier") or 0.0),
                    "effective_slot_weight": float(x.get("effective_slot_weight") or 0.0),
                    "q1_registry_score": float(x.get("q1_registry_score") or 0.0),
                    "state": str(x.get("state") or ""),
                }
                for x in blend_candidates
            ],
        },
        "governance": {
            "stage_b": stageb_governance,
            "registry": registry_governance,
            "allocation_policy": {
                **allocation_policy,
                "allow_shorts_effective": bool(allow_shorts_effective),
                "target_gross_effective": float(target_gross_effective),
                "max_position_weight_effective": float(max_position_weight_effective),
                "top_n_long_effective": int(top_n_long_effective),
                "top_n_short_effective": int(top_n_short_effective),
                "weighting_mode_effective": str(weighting_mode_effective),
                "weight_alpha_score_effective": float(weight_alpha_score_effective),
                "weight_alpha_invvol_effective": float(weight_alpha_invvol_effective),
                "weight_alpha_liq_effective": float(weight_alpha_liq_effective),
            },
            "slot_blend_policy": {
                "state_multipliers": _parse_state_multipliers(str(args.registry_state_multipliers or "")),
                "min_effective_weight": float(max(0.0, args.slot_blend_min_effective_weight)),
                "require_live_like": bool(args.slot_blend_require_live_like),
                "live_like_states": sorted(slot_blend_live_like_states),
                "selection_warnings": list(blend_selection_warnings),
            },
        },
        "inputs": {
            "feature_store_version": str(args.feature_store_version),
            "asset_classes": asset_classes,
            "part_glob": part_glob,
            "stage_b_report": str(stageb_report_path) if stageb_report_path else "",
            "registry_report": str(registry_report_path) if registry_report_path else "",
            "min_adv_dollar": float(args.min_adv_dollar),
            "top_n_long": int(args.top_n_long),
            "top_n_short": int(args.top_n_short),
            "allow_shorts": bool(args.allow_shorts),
            "max_long_per_family": int(args.max_long_per_family),
            "max_short_per_family": int(args.max_short_per_family),
            "max_family_abs_exposure": float(args.max_family_abs_exposure),
            "family_concentration_failure_mode": str(args.family_concentration_failure_mode),
            "v4_final_profile": bool(v4_final_profile),
            "registry_state_multipliers": str(args.registry_state_multipliers),
            "slot_blend_min_effective_weight": float(args.slot_blend_min_effective_weight),
            "slot_blend_require_live_like": bool(args.slot_blend_require_live_like),
            "slot_blend_live_like_states": sorted(slot_blend_live_like_states),
        },
        "counts": {
            "feature_files_total": int(len(files)),
            "eligible_assets_total": int(scored.height),
            "positions_total": int(positions.height),
            "long_positions_total": int(n_long),
            "short_positions_total": int(n_short),
            "orders_total": int(orders.height),
        },
        "risk": {
            "gross_exposure": float(gross),
            "net_exposure": float(net),
            "long_exposure": float(long_exposure),
            "short_exposure": float(short_exposure),
            "max_abs_weight": float(max_abs_weight),
            "concentration_hhi": float(hhi),
            "weighted_vol_proxy": float(weighted_vol_proxy),
            "max_family_abs_exposure_effective": float(args.max_family_abs_exposure),
            "family_exposure_table": family_exposure_table[:32],
            "family_exposure_cap_breaches_total": int(len(family_cap_breaches)),
        },
        "gates": {
            "failure_mode": str(args.failure_mode),
            "failures_total": int(len(failures)),
            "failures": failures,
            "warnings": warnings,
            "limits": {
                "target_gross": float(args.target_gross),
                "max_gross": float(args.max_gross),
                "max_net": float(args.max_net),
                "max_position_weight": float(args.max_position_weight),
                "weighting_mode": str(args.weighting_mode),
                "weight_alpha_score": float(args.weight_alpha_score),
                "weight_alpha_invvol": float(args.weight_alpha_invvol),
                "weight_alpha_liq": float(args.weight_alpha_liq),
                "min_rebalance_delta": float(args.min_rebalance_delta),
                "max_long_per_family": int(args.max_long_per_family),
                "max_short_per_family": int(args.max_short_per_family),
                "max_family_abs_exposure": float(args.max_family_abs_exposure),
                "family_concentration_failure_mode": str(args.family_concentration_failure_mode),
            },
        },
        "artifacts": {
            "run_dir": str(run_root),
            "positions_parquet": str(positions_path),
            "orders_parquet": str(orders_path),
            "latest_positions_parquet": str(latest_positions_path),
        },
        "hashes": {
            "positions_hash": stable_hash_file(positions_path),
            "orders_hash": stable_hash_file(orders_path),
        },
    }
    atomic_write_json(report_path, report)
    report["artifacts"]["report_json"] = str(report_path)
    report["hashes"]["report_hash"] = stable_hash_file(report_path)
    atomic_write_json(latest_report_path, report)

    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"positions={positions_path}")
    print(f"orders={orders_path}")
    print(f"ok={str(bool(ok)).lower()}")
    return int(exit_code)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
