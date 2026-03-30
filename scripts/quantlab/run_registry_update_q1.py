#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable, Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)

RC = {
    "stage_b_survivor_present": "STAGE_B_SURVIVOR_PRESENT",
    "stage_b_survivors_empty": "STAGE_B_SURVIVORS_EMPTY",
    "no_stage_b_survivors": "NO_STAGE_B_SURVIVORS",
    "current_champion_present": "CURRENT_CHAMPION_PRESENT",
    "no_existing_champion": "NO_EXISTING_CHAMPION",
    "no_existing_champion_promotion_disabled": "NO_EXISTING_CHAMPION_PROMOTION_DISABLED",
    "champion_already_top_survivor": "CHAMPION_ALREADY_TOP_SURVIVOR",
    "score_improved": "Q1_REGISTRY_SCORE_IMPROVED",
    "score_eps_met": "SCORE_EPSILON_MET",
    "score_eps_not_met": "SCORE_EPSILON_NOT_MET",
    "score_improvement_below_epsilon": "SCORE_IMPROVEMENT_BELOW_EPSILON",
    "current_live_champion_missing_in_stage_b_candidates": "CURRENT_LIVE_CHAMPION_MISSING_IN_STAGE_B_CANDIDATES",
    "current_live_champion_demoted_to_shadow": "CURRENT_LIVE_CHAMPION_DEMOTED_TO_SHADOW",
    "current_live_champion_demoted_to_retired": "CURRENT_LIVE_CHAMPION_DEMOTED_TO_RETIRED",
    "first_observed": "FIRST_OBSERVED_IN_CANDIDATE_REGISTRY",
    "stage_b_selected_survivor": "STAGE_B_SELECTED_SURVIVOR",
    "stage_b_fail": "STAGE_B_FAIL",
    "survivor_cap_not_selected": "NOT_SELECTED_IN_SURVIVOR_CAP",
    "not_present_current_stage_b": "NOT_PRESENT_IN_CURRENT_STAGE_B_RUN",
    "current_live_still_survivor": "CURRENT_LIVE_STILL_SURVIVOR",
    "current_live_outside_survivor_cap": "CURRENT_LIVE_OUTSIDE_SURVIVOR_CAP",
    "current_live_stage_b_fail_shadow": "CURRENT_LIVE_STAGE_B_FAIL_SHADOW",
    "current_live_stage_b_fail_retired": "CURRENT_LIVE_STAGE_B_FAIL_RETIRED",
    "demotion_score_gap_small": "DEMOTION_SCORE_GAP_SMALL",
    "demotion_score_gap_large": "DEMOTION_SCORE_GAP_LARGE",
    "hard_stage_b_gate_failed": "HARD_STAGE_B_GATE_FAILED",
    "current_live_hard_gate_failed": "CURRENT_LIVE_HARD_GATE_FAILED",
    "top_survivor_hard_gate_failed": "TOP_SURVIVOR_HARD_GATE_FAILED",
    "promoted_in_this_run": "PROMOTED_IN_THIS_RUN",
    "live_candidate_not_reselected_as_champion": "LIVE_CANDIDATE_NOT_RESELECTED_AS_CHAMPION",
    "live_candidate_failed_or_not_survivor": "LIVE_CANDIDATE_FAILED_OR_NOT_SURVIVOR",
    "selected_as_live_champion": "SELECTED_AS_LIVE_CHAMPION",
    "reentered_stage_b_survivors": "REENTERED_STAGE_B_SURVIVORS",
    "strict_pass_empty_freeze": "STRICT_PASS_EMPTY_FREEZE",
    "strict_pass_empty_no_freeze": "STRICT_PASS_EMPTY_NO_FREEZE",
    "live_hold_strict_pass_empty": "LIVE_HOLD_STRICT_PASS_EMPTY",
    "freeze_hold_prev_state": "FREEZE_HOLD_PREV_STATE",
    "freeze_keep_missing_prev_state": "FREEZE_KEEP_MISSING_PREV_STATE",
    "current_live_champion_to_live_hold": "CURRENT_LIVE_CHAMPION_TO_LIVE_HOLD",
    "current_live_hold_released_to_shadow": "CURRENT_LIVE_HOLD_RELEASED_TO_SHADOW",
    "current_live_hold_released_to_retired": "CURRENT_LIVE_HOLD_RELEASED_TO_RETIRED",
    "live_hold_streak_shadow": "LIVE_HOLD_STREAK_SHADOW",
    "live_hold_streak_retired": "LIVE_HOLD_STREAK_RETIRED",
}

HARD_DEMOTION_GATE_NAMES = {
    "g_fold_policy_valid",
    "g_folds_used",
    "g_sharpe_min",
    "g_maxdd",
    "g_psr_strict_any",
    "g_dsr_strict_any",
    "g_psr_cpcv_strict",
    "g_dsr_cpcv_strict",
    "g_ic_tail_any",
    "g_cpcv_light_sharpe_p10",
    "g_cpcv_light_sharpe_p05",
    "g_cpcv_light_sharpe_es10",
    "g_cpcv_light_effective_paths",
    "g_cpcv_light_effective_ratio",
    "g_cpcv_light_temporal_meta",
    "g_stress_lite_maxdd",
    "g_stress_lite_fail_share",
}


def _uniq_reason_codes(values: Iterable[str]) -> list[str]:
    return sorted({str(v) for v in values if str(v)})


def _extract_failed_gate_names(row: dict[str, Any]) -> list[str]:
    failed: list[str] = []
    for k, v in row.items():
        if not str(k).startswith("g_"):
            continue
        if bool(v):
            continue
        failed.append(str(k))
    return sorted(failed)


def _gate_reason_code(gate_name: str) -> str:
    return f"STAGE_B_GATE_FAIL_{str(gate_name).upper()}"


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--stage-b-run-id", default="", help="Default: latest q1stageb_* run")
    p.add_argument("--registry-root", default="", help="Override registry root; default is <quant-root>/registry")
    p.add_argument("--score-epsilon", type=float, default=0.01)
    p.add_argument("--promote-on-empty", action="store_true", default=True)
    p.add_argument("--no-promote-on-empty", dest="promote_on_empty", action="store_false")
    p.add_argument("--require-top-survivor-hard-gates-pass", action="store_true", default=True)
    p.add_argument("--skip-require-top-survivor-hard-gates-pass", dest="require_top_survivor_hard_gates_pass", action="store_false")
    p.add_argument("--demotion-shadow-score-gap", type=float, default=0.03)
    p.add_argument("--demotion-retire-score-gap", type=float, default=0.08)
    p.add_argument("--freeze-on-zero-strict-pass", action="store_true", default=True)
    p.add_argument("--skip-freeze-on-zero-strict-pass", dest="freeze_on_zero_strict_pass", action="store_false")
    p.add_argument("--live-hold-shadow-after-runs", type=int, default=2)
    p.add_argument("--live-hold-retire-after-runs", type=int, default=4)
    p.add_argument("--live-slot-count", type=int, default=3, help="Number of ranked live slots to materialize: live + live_alt_*")
    p.add_argument("--shadow-slot-count", type=int, default=2, help="Number of ranked shadow slots: shadow + shadow_alt_*")
    p.add_argument("--retired-slot-count", type=int, default=1, help="Number of ranked retired slots: retired + retired_alt_*")
    p.add_argument("--max-live-per-family", type=int, default=0, help="0 disables family cap for live slots; >0 enforces max slots per family.")
    p.add_argument("--max-shadow-per-family", type=int, default=0, help="0 disables family cap for shadow slots; >0 enforces max slots per family.")
    p.add_argument("--max-retired-per-family", type=int, default=0, help="0 disables family cap for retired slots; >0 enforces max slots per family.")
    p.add_argument(
        "--slot-family-policy-mode",
        choices=["off", "warn", "hard"],
        default="warn",
        help="off ignores family caps, warn records slot-family cap events, hard fails run if family-cap constraints cannot be respected.",
    )
    p.add_argument("--v4-final-profile", action="store_true", default=False, help="Enable final profile defaults for slot-family policy.")
    p.add_argument("--include-default-slot-alias", action="store_true", default=True, help="Keep legacy default slot as alias of live.")
    p.add_argument("--skip-include-default-slot-alias", dest="include_default_slot_alias", action="store_false")
    p.add_argument(
        "--stageb-pass-column",
        choices=["strict", "selected"],
        default="strict",
        help="strict=use stage_b_q1_strict_pass for governance; selected=use stage_b_q1_light_pass",
    )
    p.add_argument(
        "--hard-demotion-gates-source",
        choices=["auto", "stageb", "static"],
        default="auto",
        help="auto=prefer Stage-B hard gate set from report; stageb=require report-defined set; static=use local fallback set.",
    )
    return p.parse_args(list(argv))


def _latest_stage_b_run(quant_root: Path) -> str:
    runs_root = quant_root / "runs"
    cands = [p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("run_id=q1stageb_")]
    if not cands:
        raise FileNotFoundError(f"no q1stageb runs under {runs_root}")
    cands.sort(key=lambda p: p.stat().st_mtime_ns)
    return cands[-1].name.split("=", 1)[1]


def _resolve_hard_demotion_gate_names(
    stage_b_light_report: dict[str, Any],
    source_mode: str,
) -> tuple[set[str], str, list[str]]:
    gate_sets = stage_b_light_report.get("gate_sets") or {}
    report_names = [
        str(x) for x in (gate_sets.get("hard_strict_gate_names") or [])
        if str(x).startswith("g_")
    ]
    warnings: list[str] = []
    mode = str(source_mode or "auto").lower()
    if mode == "static":
        return set(HARD_DEMOTION_GATE_NAMES), "static", warnings
    if mode == "stageb":
        if report_names:
            return set(report_names), "stageb", warnings
        warnings.append("HARD_DEMOTION_GATES_STAGEB_EMPTY_FALLBACK_STATIC")
        return set(HARD_DEMOTION_GATE_NAMES), "static_fallback", warnings
    # auto
    if report_names:
        return set(report_names), "stageb_auto", warnings
    warnings.append("HARD_DEMOTION_GATES_AUTO_EMPTY_FALLBACK_STATIC")
    return set(HARD_DEMOTION_GATE_NAMES), "static_fallback", warnings


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS runs_stage_b_q1 (
          run_id TEXT PRIMARY KEY,
          generated_at TEXT NOT NULL,
          stage_a_run_id TEXT,
          ok INTEGER NOT NULL,
          exit_code INTEGER NOT NULL,
          reason TEXT,
          report_path TEXT NOT NULL,
          report_hash TEXT NOT NULL,
          stage_b_candidates_total INTEGER,
          stage_b_survivors_total INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stage_b_candidates_q1 (
          run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          q1_registry_score REAL,
          stage_b_pass INTEGER NOT NULL,
          dsr_proxy REAL,
          psr_proxy REAL,
          ic_5d_oos_mean REAL,
          oos_sharpe_proxy_mean REAL,
          turnover_proxy_mean REAL,
          maxdd_proxy_pct_mean REAL,
          cpcv_light_sharpe_min REAL,
          cpcv_light_neg_sharpe_share REAL,
          metrics_json TEXT NOT NULL,
          PRIMARY KEY (run_id, candidate_id)
        );

        CREATE TABLE IF NOT EXISTS champion_state_q1 (
          slot TEXT PRIMARY KEY,
          champion_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          q1_registry_score REAL,
          source_stage_b_run_id TEXT NOT NULL,
          state TEXT NOT NULL,
          promoted_at TEXT NOT NULL,
          metrics_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidate_registry_state_q1 (
          candidate_id TEXT PRIMARY KEY,
          family TEXT,
          state TEXT NOT NULL,
          source_stage_b_run_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          reason_codes_json TEXT NOT NULL,
          q1_registry_score REAL,
          champion_id TEXT,
          metrics_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promotion_decisions_q1 (
          decision_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          champion_before_id TEXT,
          challenger_candidate_id TEXT,
          champion_after_id TEXT,
          reason_codes_json TEXT NOT NULL,
          summary_metrics_json TEXT NOT NULL,
          artifacts_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promotion_events_q1 (
          event_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          event_type TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          old_champion_id TEXT,
          new_champion_id TEXT,
          candidate_id TEXT,
          delta_metrics_json TEXT NOT NULL,
          artifacts_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidate_state_events_q1 (
          event_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          prev_state TEXT,
          new_state TEXT NOT NULL,
          reason_codes_json TEXT NOT NULL,
          details_json TEXT NOT NULL
        );
        """
    )
    def _ensure_columns(table: str, columns: dict[str, str]) -> None:
        existing = {
            str(row[1])
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for name, ddl in columns.items():
            if name in existing:
                continue
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")

    _ensure_columns(
        "stage_b_candidates_q1",
        {
            "stage_b_strict_pass": "INTEGER",
            "dsr_strict": "REAL",
            "psr_strict": "REAL",
            "dsr_cpcv_strict": "REAL",
            "psr_cpcv_strict": "REAL",
        },
    )
    conn.commit()


def _append_jsonl(path: Path, rec: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def _norm01(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    x = (value - lo) / (hi - lo)
    return 0.0 if x < 0 else 1.0 if x > 1 else float(x)


def _candidate_score(row: dict[str, Any]) -> float:
    # Prefer strict Stage-B metrics when available; keep proxy fallback for
    # backward compatibility with older Stage-B artifacts.
    dsr = float(
        row.get("dsr_strict")
        if row.get("dsr_strict") is not None
        else (row.get("dsr_proxy") or 0.0)
    )
    psr = float(
        row.get("psr_strict")
        if row.get("psr_strict") is not None
        else (row.get("psr_proxy") or 0.0)
    )
    sharpe = float(
        row.get("cpcv_light_sharpe_mean")
        if row.get("cpcv_light_sharpe_mean") is not None
        else (row.get("oos_sharpe_proxy_mean") or 0.0)
    )
    ic5 = float(row.get("ic_5d_oos_mean") or 0.0)
    turnover = float(row.get("turnover_proxy_mean") or 0.0)
    maxdd = float(row.get("maxdd_proxy_pct_mean") or 0.0)
    cpcv_min = float(row.get("cpcv_light_sharpe_min") or 0.0)
    cpcv_p10 = float(row.get("cpcv_light_sharpe_p10") or cpcv_min)
    cpcv_p05 = float(row.get("cpcv_light_sharpe_p05") or cpcv_min)
    cpcv_es10 = float(row.get("cpcv_light_sharpe_es10") or cpcv_min)
    stress_worst = float(row.get("stress_lite_worst_mean_sharpe") or 0.0)
    cpcv_tail = (0.35 * cpcv_p10) + (0.35 * cpcv_p05) + (0.30 * cpcv_es10)

    sharpe_norm = _norm01(sharpe, 0.0, 0.25)
    ic_norm = _norm01(ic5, 0.0, 0.08)
    turnover_norm = 1.0 - _norm01(turnover, 0.0, 4.0)
    maxdd_norm = 1.0 - _norm01(maxdd, 0.0, 25.0)
    cpcv_norm = _norm01(cpcv_min, -0.05, 0.10)
    cpcv_tail_norm = _norm01(cpcv_tail, -0.10, 0.08)
    stress_norm = _norm01(stress_worst, -0.10, 0.08)
    score = (
        0.24 * dsr
        + 0.18 * psr
        + 0.12 * sharpe_norm
        + 0.10 * ic_norm
        + 0.10 * turnover_norm
        + 0.10 * maxdd_norm
        + 0.06 * cpcv_norm
        + 0.06 * cpcv_tail_norm
        + 0.04 * stress_norm
    )
    return round(float(score), 6)


def _read_stage_b_candidates(stage_b_light_report: dict[str, Any]) -> tuple[pl.DataFrame, pl.DataFrame]:
    artifacts = stage_b_light_report.get("artifacts") or {}
    cand_path = Path(str(artifacts.get("stage_b_light_candidates") or ""))
    surv_path = Path(str(artifacts.get("survivors_B_light") or ""))
    if not cand_path.exists():
        raise FileNotFoundError(f"missing stage_b_light_candidates.parquet: {cand_path}")
    if not surv_path.exists():
        raise FileNotFoundError(f"missing survivors_B_light.parquet: {surv_path}")
    return pl.read_parquet(cand_path), pl.read_parquet(surv_path)


def _load_champion_slot(conn: sqlite3.Connection, slot: str) -> dict[str, Any] | None:
    cur = conn.execute(
        "SELECT slot,champion_id,candidate_id,family,q1_registry_score,source_stage_b_run_id,state,promoted_at,metrics_json "
        "FROM champion_state_q1 WHERE slot=?",
        (str(slot),),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "slot": str(row[0] or ""),
        "champion_id": row[1],
        "candidate_id": row[2],
        "family": row[3],
        "q1_registry_score": row[4],
        "source_stage_b_run_id": row[5],
        "state": row[6],
        "promoted_at": row[7],
        "metrics": json.loads(row[8]),
    }


def _load_current_champion(conn: sqlite3.Connection) -> dict[str, Any] | None:
    # Prefer explicit live slot; keep legacy default fallback.
    for slot in ("live", "default"):
        row = _load_champion_slot(conn, slot)
        if row is not None:
            return row
    return None


def _upsert_champion_slot(
    conn: sqlite3.Connection,
    *,
    slot: str,
    champion_id: str,
    candidate_id: str,
    family: str,
    q1_registry_score: float,
    source_stage_b_run_id: str,
    state: str,
    promoted_at: str,
    metrics_json: str,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO champion_state_q1
        (slot, champion_id, candidate_id, family, q1_registry_score, source_stage_b_run_id, state, promoted_at, metrics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(slot),
            str(champion_id),
            str(candidate_id),
            str(family),
            float(q1_registry_score),
            str(source_stage_b_run_id),
            str(state),
            str(promoted_at),
            str(metrics_json),
        ),
    )


def _delete_champion_slot(conn: sqlite3.Connection, slot: str) -> None:
    conn.execute("DELETE FROM champion_state_q1 WHERE slot=?", (str(slot),))


def _slot_rows_from_state_rows(
    *,
    state_rows: list[dict[str, Any]],
    current: dict[str, Any] | None,
    stage_b_run_id: str,
    now: str,
    live_slot_count: int = 1,
    shadow_slot_count: int = 1,
    retired_slot_count: int = 1,
    max_live_per_family: int = 0,
    max_shadow_per_family: int = 0,
    max_retired_per_family: int = 0,
    slot_family_policy_mode: str = "warn",
    include_default_slot_alias: bool = True,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    by_state: dict[str, list[dict[str, Any]]] = {"live": [], "live_hold": [], "shadow": [], "retired": []}
    by_id: dict[str, dict[str, Any]] = {}
    for r in state_rows:
        cid = str(r.get("candidate_id") or "")
        if not cid:
            continue
        by_id[cid] = r
        st = str(r.get("state") or "").lower()
        if st in by_state:
            by_state[st].append(r)

    def _rank_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            rows,
            key=lambda x: (
                float(x.get("q1_registry_score") or 0.0),
                str(x.get("candidate_id") or ""),
            ),
            reverse=True,
        )

    def _build_slot_row(slot_name: str, row: dict[str, Any], *, role: str, promoted_at: str, champion_id_override: str = "") -> dict[str, Any]:
        cid = str(row.get("candidate_id") or "")
        return {
            "slot": slot_name,
            "champion_id": champion_id_override or f"q1champ_{role}_{stable_hash_obj({'run': stage_b_run_id, 'slot': slot_name, 'cid': cid, 'ts': now})[:12]}",
            "candidate_id": cid,
            "family": str(row.get("family") or ""),
            "q1_registry_score": float(row.get("q1_registry_score") or 0.0),
            "source_stage_b_run_id": stage_b_run_id,
            "state": str(row.get("state") or role),
            "promoted_at": str(promoted_at),
            "metrics_json": str(row.get("metrics_json") or "{}"),
        }

    slots: dict[str, dict[str, Any]] = {}
    slot_policy_warnings: list[str] = []
    current_cid = str((current or {}).get("candidate_id") or "")
    used_candidate_ids: set[str] = set()
    live_family_counts: dict[str, int] = {}
    shadow_family_counts: dict[str, int] = {}
    retired_family_counts: dict[str, int] = {}
    live_slot_count = max(1, int(live_slot_count))
    shadow_slot_count = max(0, int(shadow_slot_count))
    retired_slot_count = max(0, int(retired_slot_count))
    max_live_per_family = max(0, int(max_live_per_family))
    max_shadow_per_family = max(0, int(max_shadow_per_family))
    max_retired_per_family = max(0, int(max_retired_per_family))
    slot_family_policy_mode = str(slot_family_policy_mode or "warn").lower()

    def _record_family_slot(role: str, family: str) -> None:
        fam = str(family or "")
        if role == "live":
            live_family_counts[fam] = int(live_family_counts.get(fam, 0)) + 1
        elif role == "shadow":
            shadow_family_counts[fam] = int(shadow_family_counts.get(fam, 0)) + 1
        elif role == "retired":
            retired_family_counts[fam] = int(retired_family_counts.get(fam, 0)) + 1

    def _family_allowed(role: str, row: dict[str, Any], slot_name: str) -> bool:
        if slot_family_policy_mode == "off":
            return True
        fam = str(row.get("family") or "")
        if not fam:
            return True
        if role == "live":
            cap = max_live_per_family
            used = int(live_family_counts.get(fam, 0))
        elif role == "shadow":
            cap = max_shadow_per_family
            used = int(shadow_family_counts.get(fam, 0))
        else:
            cap = max_retired_per_family
            used = int(retired_family_counts.get(fam, 0))
        if cap <= 0 or used < cap:
            return True
        slot_policy_warnings.append(f"SLOT_FAMILY_CAP_HIT:{role}:{fam}:{slot_name}:used={used}:cap={cap}")
        return False

    live_pool = list(by_state["live"]) + list(by_state["live_hold"])
    ranked_live_pool = _rank_rows(live_pool)
    chosen_live = None
    if current_cid and current_cid in by_id:
        row = by_id[current_cid]
        if str(row.get("state") or "").lower() in {"live", "live_hold"}:
            chosen_live = row
    if chosen_live is None:
        chosen_live = ranked_live_pool[0] if ranked_live_pool else None
    if chosen_live is not None:
        live_cid = str(chosen_live.get("candidate_id") or "")
        live_family = str(chosen_live.get("family") or "")
        prev_live_id = str((current or {}).get("champion_id") or "")
        if _family_allowed("live", chosen_live, "live"):
            live_row = _build_slot_row(
                "live",
                chosen_live,
                role="live",
                promoted_at=str((current or {}).get("promoted_at") or now),
                champion_id_override=(
                    prev_live_id
                    or f"q1champ_live_{stable_hash_obj({'run': stage_b_run_id, 'cid': live_cid, 'ts': now})[:12]}"
                ),
            )
            slots["live"] = live_row
            used_candidate_ids.add(live_cid)
            _record_family_slot("live", live_family)
            if include_default_slot_alias:
                slots["default"] = dict(live_row, slot="default")

    # Add additional ranked live slots.
    if live_slot_count > 1:
        alt_idx = 1
        for row in ranked_live_pool:
            cid = str(row.get("candidate_id") or "")
            if not cid or cid in used_candidate_ids:
                continue
            slot_name = f"live_alt_{alt_idx}"
            if not _family_allowed("live", row, slot_name):
                continue
            slots[slot_name] = _build_slot_row(slot_name, row, role="live", promoted_at=now)
            used_candidate_ids.add(cid)
            _record_family_slot("live", str(row.get("family") or ""))
            alt_idx += 1
            if alt_idx > (live_slot_count - 1):
                break

    # Shadow slots.
    if shadow_slot_count > 0:
        ranked_shadow = _rank_rows(by_state["shadow"])
        shadow_idx = 0
        for row in ranked_shadow:
            cid = str(row.get("candidate_id") or "")
            if not cid or cid in used_candidate_ids:
                continue
            slot_name = "shadow" if shadow_idx == 0 else f"shadow_alt_{shadow_idx}"
            if not _family_allowed("shadow", row, slot_name):
                continue
            slots[slot_name] = _build_slot_row(slot_name, row, role="shadow", promoted_at=now)
            used_candidate_ids.add(cid)
            _record_family_slot("shadow", str(row.get("family") or ""))
            shadow_idx += 1
            if shadow_idx >= shadow_slot_count:
                break

    # Retired slots.
    if retired_slot_count > 0:
        ranked_retired = _rank_rows(by_state["retired"])
        retired_idx = 0
        for row in ranked_retired:
            cid = str(row.get("candidate_id") or "")
            if not cid or cid in used_candidate_ids:
                continue
            slot_name = "retired" if retired_idx == 0 else f"retired_alt_{retired_idx}"
            if not _family_allowed("retired", row, slot_name):
                continue
            slots[slot_name] = _build_slot_row(slot_name, row, role="retired", promoted_at=now)
            used_candidate_ids.add(cid)
            _record_family_slot("retired", str(row.get("family") or ""))
            retired_idx += 1
            if retired_idx >= retired_slot_count:
                break
    return slots, sorted(set(slot_policy_warnings))


def _sync_champion_slots(
    conn: sqlite3.Connection,
    *,
    state_rows: list[dict[str, Any]],
    current: dict[str, Any] | None,
    stage_b_run_id: str,
    now: str,
    live_slot_count: int = 1,
    shadow_slot_count: int = 1,
    retired_slot_count: int = 1,
    max_live_per_family: int = 0,
    max_shadow_per_family: int = 0,
    max_retired_per_family: int = 0,
    slot_family_policy_mode: str = "warn",
    include_default_slot_alias: bool = True,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    slots, slot_policy_warnings = _slot_rows_from_state_rows(
        state_rows=state_rows,
        current=current,
        stage_b_run_id=stage_b_run_id,
        now=now,
        live_slot_count=live_slot_count,
        shadow_slot_count=shadow_slot_count,
        retired_slot_count=retired_slot_count,
        max_live_per_family=max_live_per_family,
        max_shadow_per_family=max_shadow_per_family,
        max_retired_per_family=max_retired_per_family,
        slot_family_policy_mode=slot_family_policy_mode,
        include_default_slot_alias=include_default_slot_alias,
    )
    target_slots = set(slots.keys())
    existing_slots = {str(r[0] or "") for r in conn.execute("SELECT slot FROM champion_state_q1").fetchall()}
    for slot in sorted(existing_slots - target_slots):
        _delete_champion_slot(conn, slot)
    for slot in sorted(target_slots):
        payload = slots.get(slot)
        if payload is None:
            continue
        _upsert_champion_slot(
            conn,
            slot=slot,
            champion_id=str(payload["champion_id"]),
            candidate_id=str(payload["candidate_id"]),
            family=str(payload["family"]),
            q1_registry_score=float(payload["q1_registry_score"]),
            source_stage_b_run_id=str(payload["source_stage_b_run_id"]),
            state=str(payload["state"]),
            promoted_at=str(payload["promoted_at"]),
            metrics_json=str(payload["metrics_json"]),
        )
    return slots, slot_policy_warnings


def _load_candidate_states(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    cur = conn.execute(
        "SELECT candidate_id,family,state,source_stage_b_run_id,updated_at,reason_codes_json,q1_registry_score,champion_id,metrics_json "
        "FROM candidate_registry_state_q1"
    )
    out: dict[str, dict[str, Any]] = {}
    for row in cur.fetchall():
        cid = str(row[0] or "")
        if not cid:
            continue
        try:
            reasons = json.loads(row[5]) if row[5] else []
        except Exception:
            reasons = []
        out[cid] = {
            "candidate_id": cid,
            "family": row[1],
            "state": row[2],
            "source_stage_b_run_id": row[3],
            "updated_at": row[4],
            "reason_codes": reasons,
            "q1_registry_score": row[6],
            "champion_id": row[7],
        }
        try:
            metrics = json.loads(row[8]) if row[8] else {}
        except Exception:
            metrics = {}
        meta = metrics.get("_registry_state_meta") if isinstance(metrics, dict) else {}
        if not isinstance(meta, dict):
            meta = {}
        out[cid]["state_run_count"] = int(meta.get("state_run_count") or 0)
        out[cid]["live_hold_run_count"] = int(meta.get("live_hold_run_count") or 0)
    return out


def _write_promotion_index(registry_root: Path, decisions_path: Path, events_path: Path) -> Path:
    def _scan(path: Path) -> list[dict[str, Any]]:
        rows = []
        if not path.exists():
            return rows
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ts = str(rec.get("ts") or "")
                rows.append({"ts": ts, "day": ts[:10] if len(ts) >= 10 else "unknown"})
        return rows

    decs = _scan(decisions_path)
    evs = _scan(events_path)
    by_day: dict[str, dict[str, int]] = {}
    for r in decs:
        d = by_day.setdefault(r["day"], {"decisions": 0, "events": 0})
        d["decisions"] += 1
    for r in evs:
        d = by_day.setdefault(r["day"], {"decisions": 0, "events": 0})
        d["events"] += 1
    index_obj = {
        "schema": "quantlab_q1_promotion_index_v1",
        "generated_at": utc_now_iso(),
        "artifacts": {
            "promotion_decisions_ndjson": str(decisions_path),
            "promotion_events_ndjson": str(events_path),
        },
        "counts": {
            "decisions_total": len(decs),
            "events_total": len(evs),
            "days_total": len(by_day),
        },
        "by_day": [{"day": k, **v} for k, v in sorted(by_day.items())],
    }
    out = registry_root / "promotion_index.json"
    atomic_write_json(out, index_obj)
    return out


def _sort_metric_priority(df: pl.DataFrame, selected_pass_col: str) -> pl.DataFrame:
    order = [
        selected_pass_col,
        "q1_registry_score",
        "dsr_strict",
        "psr_strict",
        "dsr_cpcv_strict",
        "psr_cpcv_strict",
        "dsr_proxy",
        "psr_proxy",
        "candidate_id",
    ]
    available = [name for name in order if name in df.columns]
    descending = [False if name == "candidate_id" else True for name in available]
    return df.sort(available, descending=descending)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    v4_final_profile = bool(args.v4_final_profile)
    if v4_final_profile:
        if int(args.max_live_per_family) <= 0:
            args.max_live_per_family = 1
        if int(args.max_shadow_per_family) <= 0:
            args.max_shadow_per_family = 1
        if int(args.max_retired_per_family) <= 0:
            args.max_retired_per_family = 1
        if str(args.slot_family_policy_mode).lower() == "off":
            args.slot_family_policy_mode = "hard"

    quant_root = Path(args.quant_root).resolve()
    stage_b_run_id = args.stage_b_run_id or _latest_stage_b_run(quant_root)
    run_dir = quant_root / "runs" / f"run_id={stage_b_run_id}"
    stage_b_run_report_path = run_dir / "stage_b_q1_run_report.json"
    if not stage_b_run_report_path.exists():
        raise SystemExit(f"FATAL: missing stage_b_q1_run_report.json: {stage_b_run_report_path}")

    stage_b_run_report = read_json(stage_b_run_report_path)
    if not bool(stage_b_run_report.get("ok")):
        raise SystemExit("FATAL: Stage-B Q1 run report not ok")

    artifacts = stage_b_run_report.get("artifacts") or {}
    stage_b_light_report_path = Path(str(artifacts.get("stage_b_light_report") or ""))
    if not stage_b_light_report_path.exists():
        raise SystemExit(f"FATAL: missing stage_b_light_report: {stage_b_light_report_path}")
    stage_b_light_report = read_json(stage_b_light_report_path)
    hard_demotion_gate_names, hard_demotion_gate_source, hard_gate_warnings = _resolve_hard_demotion_gate_names(
        stage_b_light_report=stage_b_light_report,
        source_mode=str(args.hard_demotion_gates_source),
    )

    candidates_df, survivors_light_df = _read_stage_b_candidates(stage_b_light_report)
    survivors_df = survivors_light_df
    selected_survivors_source = "stage_b_light"
    stage_b_q1_survivors_path = Path(str((artifacts.get("survivors_B_q1") or "")))
    if stage_b_q1_survivors_path.exists():
        try:
            survivors_df = pl.read_parquet(stage_b_q1_survivors_path)
            selected_survivors_source = "stage_b_q1_final"
        except Exception:
            selected_survivors_source = "stage_b_light_fallback_read_error"
    if "q1_registry_score" not in candidates_df.columns:
        candidates_df = candidates_df.with_columns(
            pl.struct(pl.all()).map_elements(lambda r: _candidate_score(r), return_dtype=pl.Float64).alias("q1_registry_score")
        )
    if "q1_registry_score" not in survivors_df.columns:
        survivors_df = survivors_df.with_columns(
            pl.struct(pl.all()).map_elements(lambda r: _candidate_score(r), return_dtype=pl.Float64).alias("q1_registry_score")
        )

    governance_warnings: list[str] = list(hard_gate_warnings)
    selected_pass_col = "stage_b_q1_strict_pass" if str(args.stageb_pass_column) == "strict" else "stage_b_q1_light_pass"
    if selected_pass_col not in candidates_df.columns:
        if "stage_b_q1_light_pass" in candidates_df.columns:
            governance_warnings.append(f"GOVERNANCE_PASS_COLUMN_FALLBACK:{selected_pass_col}->stage_b_q1_light_pass")
            selected_pass_col = "stage_b_q1_light_pass"
        else:
            raise SystemExit(
                f"FATAL: stage-b pass column not found: {selected_pass_col}; available={candidates_df.columns}"
            )

    candidates_df = _sort_metric_priority(candidates_df, selected_pass_col)
    if selected_pass_col not in survivors_df.columns:
        survivors_df = survivors_df.with_columns(pl.lit(True).alias(selected_pass_col))
    survivors_df = _sort_metric_priority(survivors_df, selected_pass_col)
    candidate_rows_by_id = {
        str(r.get("candidate_id") or ""): r
        for r in candidates_df.to_dicts()
        if str(r.get("candidate_id") or "")
    }

    registry_root = (
        Path(str(args.registry_root)).resolve()
        if str(args.registry_root or "").strip()
        else (quant_root / "registry")
    )
    registry_root.mkdir(parents=True, exist_ok=True)
    db_path = registry_root / "experiments.db"
    conn = sqlite3.connect(db_path)
    _ensure_schema(conn)

    now = utc_now_iso()
    run_hash = stable_hash_file(stage_b_run_report_path)
    counts = (stage_b_run_report.get("counts") or {})
    b_light_counts = counts.get("stage_b_light") or {}
    conn.execute(
        """
        INSERT OR REPLACE INTO runs_stage_b_q1
        (run_id, generated_at, stage_a_run_id, ok, exit_code, reason, report_path, report_hash,
         stage_b_candidates_total, stage_b_survivors_total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            stage_b_run_id,
            str(stage_b_run_report.get("generated_at") or now),
            str(stage_b_run_report.get("stage_a_run_id") or ""),
            1,
            int(stage_b_run_report.get("exit_code") or 0),
            str(stage_b_run_report.get("reason") or "ok"),
            str(stage_b_run_report_path),
            run_hash,
            int(b_light_counts.get("stage_b_candidates_total") or candidates_df.height),
            int(b_light_counts.get("survivors_B_light_total") or survivors_df.height),
            now,
        ),
    )

    # Upsert candidates
    conn.execute("DELETE FROM stage_b_candidates_q1 WHERE run_id=?", (stage_b_run_id,))
    for row in candidates_df.to_dicts():
        metrics_json = json.dumps(row, sort_keys=True, ensure_ascii=False)
        conn.execute(
            """
            INSERT INTO stage_b_candidates_q1 (
              run_id,candidate_id,family,q1_registry_score,stage_b_pass,stage_b_strict_pass,dsr_proxy,psr_proxy,dsr_strict,psr_strict,dsr_cpcv_strict,psr_cpcv_strict,ic_5d_oos_mean,
              oos_sharpe_proxy_mean,turnover_proxy_mean,maxdd_proxy_pct_mean,cpcv_light_sharpe_min,
              cpcv_light_neg_sharpe_share,metrics_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                stage_b_run_id,
                str(row.get("candidate_id") or ""),
                str(row.get("family") or ""),
                float(row.get("q1_registry_score") or 0.0),
                1 if bool(row.get(selected_pass_col)) else 0,
                1 if bool(row.get("stage_b_q1_strict_pass")) else 0,
                float(row.get("dsr_proxy") or 0.0),
                float(row.get("psr_proxy") or 0.0),
                float(row.get("dsr_strict") or 0.0),
                float(row.get("psr_strict") or 0.0),
                float(row.get("dsr_cpcv_strict") or 0.0),
                float(row.get("psr_cpcv_strict") or 0.0),
                float(row.get("ic_5d_oos_mean") or 0.0),
                float(row.get("oos_sharpe_proxy_mean") or 0.0),
                float(row.get("turnover_proxy_mean") or 0.0),
                float(row.get("maxdd_proxy_pct_mean") or 0.0),
                float(row.get("cpcv_light_sharpe_min") or 0.0),
                float(row.get("cpcv_light_neg_sharpe_share") or 0.0),
                metrics_json,
            ),
        )

    current = _load_current_champion(conn)
    prev_candidate_states = _load_candidate_states(conn)
    strict_pass_col = "stage_b_q1_strict_pass" if "stage_b_q1_strict_pass" in candidates_df.columns else selected_pass_col
    strict_pass_total = int(
        candidates_df.select(pl.col(strict_pass_col).cast(pl.Int64).sum().fill_null(0).alias("v")).to_dicts()[0]["v"]
    ) if candidates_df.height > 0 else 0
    live_hold_shadow_after_runs = max(1, int(args.live_hold_shadow_after_runs))
    live_hold_retire_after_runs = max(live_hold_shadow_after_runs + 1, int(args.live_hold_retire_after_runs))
    freeze_on_zero_strict_pass = bool(
        args.freeze_on_zero_strict_pass and current is not None and int(strict_pass_total) <= 0
    )
    top_survivor = survivors_df.head(1).to_dicts()[0] if survivors_df.height > 0 else None
    top_survivor_failed_gate_names: list[str] = []
    top_survivor_hard_failed_gate_names: list[str] = []
    if top_survivor is not None:
        top_cid = str(top_survivor.get("candidate_id") or "")
        top_row = candidate_rows_by_id.get(top_cid) or {}
        top_survivor_failed_gate_names = _extract_failed_gate_names(top_row) if top_row else []
        top_survivor_hard_failed_gate_names = [g for g in top_survivor_failed_gate_names if g in hard_demotion_gate_names]

    decision = "NO_PROMOTION"
    reason_codes: list[str] = []
    event: dict[str, Any] | None = None
    champion_before_id = current["champion_id"] if current else None
    champion_after_id = champion_before_id
    challenger_candidate_id = str(top_survivor.get("candidate_id")) if top_survivor else None

    if freeze_on_zero_strict_pass:
        decision = "NO_PROMOTION"
        reason_codes.extend(
            [
                RC["strict_pass_empty_freeze"],
                RC["current_champion_present"],
            ]
        )
        if top_survivor is None:
            reason_codes.extend([RC["stage_b_survivors_empty"], RC["no_stage_b_survivors"]])
    elif top_survivor is None:
        reason_codes.extend([RC["stage_b_survivors_empty"], RC["no_stage_b_survivors"]])
    elif current is None:
        reason_codes.append(RC["stage_b_survivor_present"])
        if args.promote_on_empty and (
            (not args.require_top_survivor_hard_gates_pass) or (len(top_survivor_hard_failed_gate_names) == 0)
        ):
            decision = "PROMOTE"
            reason_codes.append(RC["no_existing_champion"])
        elif args.promote_on_empty and args.require_top_survivor_hard_gates_pass and top_survivor_hard_failed_gate_names:
            reason_codes.extend([RC["top_survivor_hard_gate_failed"], RC["hard_stage_b_gate_failed"]])
            reason_codes.extend(_gate_reason_code(g) for g in top_survivor_hard_failed_gate_names)
        else:
            reason_codes.append(RC["no_existing_champion_promotion_disabled"])
    else:
        reason_codes.extend([RC["stage_b_survivor_present"], RC["current_champion_present"]])
        challenger_score = float(top_survivor.get("q1_registry_score") or 0.0)
        champion_score = float(current.get("q1_registry_score") or 0.0)
        if str(current.get("candidate_id")) == str(top_survivor.get("candidate_id")):
            decision = "NO_PROMOTION"
            reason_codes.append(RC["champion_already_top_survivor"])
        elif args.require_top_survivor_hard_gates_pass and top_survivor_hard_failed_gate_names:
            decision = "NO_PROMOTION"
            reason_codes.extend([RC["top_survivor_hard_gate_failed"], RC["hard_stage_b_gate_failed"]])
            reason_codes.extend(_gate_reason_code(g) for g in top_survivor_hard_failed_gate_names)
        elif challenger_score >= champion_score + float(args.score_epsilon):
            decision = "PROMOTE"
            reason_codes.extend([RC["score_improved"], RC["score_eps_met"]])
        else:
            decision = "NO_PROMOTION"
            reason_codes.extend([RC["score_improvement_below_epsilon"], RC["score_eps_not_met"]])

    if int(strict_pass_total) <= 0 and not freeze_on_zero_strict_pass:
        reason_codes.append(RC["strict_pass_empty_no_freeze"])

    if decision == "PROMOTE" and top_survivor is not None:
        champ_payload = {
            "schema": "quantlab_q1_champion_state_v1",
            "generated_at": now,
            "champion_id": f"q1champ_live_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'candidate_id': top_survivor.get('candidate_id'), 'ts': now})[:12]}",
            "candidate_id": str(top_survivor.get("candidate_id")),
            "family": str(top_survivor.get("family") or ""),
            "q1_registry_score": float(top_survivor.get("q1_registry_score") or 0.0),
            "source_stage_b_run_id": stage_b_run_id,
            "state": "live",
            "promoted_at": now,
            "metrics": top_survivor,
        }
        champion_after_id = champ_payload["champion_id"]
        champ_metrics_json = json.dumps(champ_payload["metrics"], sort_keys=True, ensure_ascii=False)
        _upsert_champion_slot(
            conn,
            slot="live",
            champion_id=champ_payload["champion_id"],
            candidate_id=champ_payload["candidate_id"],
            family=champ_payload["family"],
            q1_registry_score=champ_payload["q1_registry_score"],
            source_stage_b_run_id=champ_payload["source_stage_b_run_id"],
            state=champ_payload["state"],
            promoted_at=champ_payload["promoted_at"],
            metrics_json=champ_metrics_json,
        )
        _upsert_champion_slot(
            conn,
            slot="default",
            champion_id=champ_payload["champion_id"],
            candidate_id=champ_payload["candidate_id"],
            family=champ_payload["family"],
            q1_registry_score=champ_payload["q1_registry_score"],
            source_stage_b_run_id=champ_payload["source_stage_b_run_id"],
            state=champ_payload["state"],
            promoted_at=champ_payload["promoted_at"],
            metrics_json=champ_metrics_json,
        )
        champions_dir = registry_root / "champions"
        atomic_write_json(champions_dir / "current_champion.json", champ_payload)
        hist_name = f"{now.replace(':','').replace('-','')}_{champ_payload['candidate_id'].replace('/','_')}.json"
        atomic_write_json(champions_dir / "history" / hist_name, champ_payload)
        event = {
            "schema": "quantlab_q1_promotion_event_v1",
            "event_id": f"ev_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'decision': decision, 'ts': now})[:16]}",
            "ts": now,
            "event_type": "PROMOTION",
            "stage_b_run_id": stage_b_run_id,
            "old_champion_id": champion_before_id,
            "new_champion_id": champion_after_id,
            "candidate_id": champ_payload["candidate_id"],
            "reason_codes": list(reason_codes),
            "delta_metrics": {
                "old_q1_registry_score": float(current.get("q1_registry_score") or 0.0) if current else None,
                "new_q1_registry_score": float(champ_payload["q1_registry_score"]),
            },
            "artifacts": {
                "stage_b_q1_run_report": str(stage_b_run_report_path),
                "stage_b_light_report": str(stage_b_light_report_path),
            },
        }
        conn.execute(
            """
            INSERT OR REPLACE INTO promotion_events_q1
            (event_id, ts, event_type, stage_b_run_id, old_champion_id, new_champion_id, candidate_id, delta_metrics_json, artifacts_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["event_id"],
                event["ts"],
                event["event_type"],
                event["stage_b_run_id"],
                event.get("old_champion_id"),
                event.get("new_champion_id"),
                event.get("candidate_id"),
                    json.dumps(event.get("delta_metrics") or {}, sort_keys=True, ensure_ascii=False),
                    json.dumps(event.get("artifacts") or {}, sort_keys=True, ensure_ascii=False),
                ),
            )

    decision_rec = {
        "schema": "quantlab_q1_promotion_decision_v1",
        "decision_id": f"dec_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'ts': now, 'decision': decision})[:16]}",
        "ts": now,
        "stage_b_run_id": stage_b_run_id,
        "decision": decision,
        "champion_before_id": champion_before_id,
        "challenger_candidate_id": challenger_candidate_id,
        "champion_after_id": champion_after_id,
        "reason_codes": _uniq_reason_codes(reason_codes),
        "summary_metrics": {
            "stage_b_candidates_total": int(candidates_df.height),
            "stage_b_survivors_B_light_total": int(survivors_df.height),
            "challenger_q1_registry_score": (float(top_survivor.get("q1_registry_score")) if top_survivor else None),
            "challenger_dsr_strict": (float(top_survivor.get("dsr_strict") or 0.0) if top_survivor else None),
            "challenger_psr_strict": (float(top_survivor.get("psr_strict") or 0.0) if top_survivor else None),
            "challenger_dsr_cpcv_strict": (float(top_survivor.get("dsr_cpcv_strict") or 0.0) if top_survivor else None),
            "challenger_psr_cpcv_strict": (float(top_survivor.get("psr_cpcv_strict") or 0.0) if top_survivor else None),
            "champion_q1_registry_score_before": (float(current.get("q1_registry_score")) if current else None),
            "champion_dsr_strict_before": (float((current.get("metrics") or {}).get("dsr_strict") or 0.0) if current else None),
            "champion_psr_strict_before": (float((current.get("metrics") or {}).get("psr_strict") or 0.0) if current else None),
            "score_epsilon": float(args.score_epsilon),
            "state_before": (str(current.get("state")) if current else None),
            "state_after": ("live" if decision == "PROMOTE" and top_survivor is not None else (str(current.get("state")) if current else None)),
        },
        "artifacts": {
            "stage_b_q1_run_report": str(stage_b_run_report_path),
            "stage_b_light_report": str(stage_b_light_report_path),
        },
    }

    conn.execute(
        """
        INSERT OR REPLACE INTO promotion_decisions_q1
        (decision_id, ts, stage_b_run_id, decision, champion_before_id, challenger_candidate_id, champion_after_id,
         reason_codes_json, summary_metrics_json, artifacts_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            decision_rec["decision_id"],
            decision_rec["ts"],
            decision_rec["stage_b_run_id"],
            decision_rec["decision"],
            decision_rec.get("champion_before_id"),
            decision_rec.get("challenger_candidate_id"),
            decision_rec.get("champion_after_id"),
            json.dumps(decision_rec.get("reason_codes") or [], sort_keys=True, ensure_ascii=False),
            json.dumps(decision_rec.get("summary_metrics") or {}, sort_keys=True, ensure_ascii=False),
            json.dumps(decision_rec.get("artifacts") or {}, sort_keys=True, ensure_ascii=False),
        ),
    )

    # Candidate registry state (Q1): maintain live/shadow/retired view for the latest observed Stage-B candidate set.
    live_candidate_id = None
    live_champion_id = None
    if decision == "PROMOTE" and top_survivor is not None:
        live_candidate_id = str(top_survivor.get("candidate_id") or "")
        live_champion_id = champion_after_id
    elif current is not None:
        live_candidate_id = str(current.get("candidate_id") or "")
        live_champion_id = str(current.get("champion_id") or "")

    survivor_ids = set(str(x) for x in (survivors_df.get_column("candidate_id").to_list() if "candidate_id" in survivors_df.columns else []))
    current_candidate_ids = set(str(x) for x in (candidates_df.get_column("candidate_id").to_list() if "candidate_id" in candidates_df.columns else []))
    top_survivor_score = float(top_survivor.get("q1_registry_score") or 0.0) if top_survivor is not None else None
    state_rows: list[dict[str, Any]] = []
    for row in candidates_df.to_dicts():
        cid = str(row.get("candidate_id") or "")
        if not cid:
            continue
        prev_row = prev_candidate_states.get(cid) or {}
        prev_state = str(prev_row.get("state") or "")
        prev_state_run_count = int(prev_row.get("state_run_count") or 0)
        prev_live_hold_run_count = int(prev_row.get("live_hold_run_count") or 0)
        is_stage_b_pass = bool(row.get(selected_pass_col))
        row_score = float(row.get("q1_registry_score") or 0.0)
        failed_gate_names = _extract_failed_gate_names(row)
        hard_failed_gate_names = [g for g in failed_gate_names if g in hard_demotion_gate_names]
        if live_candidate_id and cid == live_candidate_id:
            if cid in survivor_ids:
                state = "live"
                state_reasons = [RC["current_live_still_survivor"]]
                if decision == "PROMOTE":
                    state_reasons.append(RC["promoted_in_this_run"])
            elif freeze_on_zero_strict_pass:
                next_live_hold_run_count = (prev_live_hold_run_count + 1) if prev_state == "live_hold" else 1
                if next_live_hold_run_count >= live_hold_retire_after_runs:
                    state = "retired"
                    state_reasons = [
                        RC["current_live_hold_released_to_retired"],
                        RC["live_hold_streak_retired"],
                        RC["strict_pass_empty_freeze"],
                    ]
                elif next_live_hold_run_count >= live_hold_shadow_after_runs:
                    state = "shadow"
                    state_reasons = [
                        RC["current_live_hold_released_to_shadow"],
                        RC["live_hold_streak_shadow"],
                        RC["strict_pass_empty_freeze"],
                    ]
                else:
                    state = "live_hold"
                    state_reasons = [
                        RC["current_live_champion_to_live_hold"],
                        RC["live_hold_strict_pass_empty"],
                        RC["strict_pass_empty_freeze"],
                    ]
            elif is_stage_b_pass:
                state = "shadow"
                state_reasons = [RC["current_live_outside_survivor_cap"], RC["survivor_cap_not_selected"]]
            else:
                score_gap = None if top_survivor_score is None else max(0.0, float(top_survivor_score) - float(row_score))
                if hard_failed_gate_names:
                    state = "retired"
                    state_reasons = [RC["current_live_hard_gate_failed"], RC["current_live_stage_b_fail_retired"], RC["hard_stage_b_gate_failed"]]
                elif score_gap is not None and score_gap >= float(args.demotion_retire_score_gap):
                    state = "retired"
                    state_reasons = [RC["current_live_stage_b_fail_retired"], RC["demotion_score_gap_large"]]
                else:
                    state = "shadow"
                    state_reasons = [RC["current_live_stage_b_fail_shadow"]]
                    if score_gap is not None and score_gap >= float(args.demotion_shadow_score_gap):
                        state_reasons.append(RC["demotion_score_gap_small"])
        elif cid in survivor_ids:
            state = "shadow"
            state_reasons = [RC["stage_b_selected_survivor"]]
        else:
            if freeze_on_zero_strict_pass and prev_state in {"live", "live_hold", "shadow"}:
                state = "live_hold" if prev_state == "live" else prev_state
                state_reasons = [RC["freeze_hold_prev_state"], RC["strict_pass_empty_freeze"]]
            else:
                state = "retired"
                if not is_stage_b_pass:
                    state_reasons = [RC["stage_b_fail"]]
                    if hard_failed_gate_names:
                        state_reasons.append(RC["hard_stage_b_gate_failed"])
                else:
                    state_reasons = [RC["survivor_cap_not_selected"]]
        if failed_gate_names:
            state_reasons.extend(_gate_reason_code(g) for g in failed_gate_names)
        state_run_count = (prev_state_run_count + 1) if prev_state == state else 1
        live_hold_run_count = (
            (prev_live_hold_run_count + 1)
            if (state == "live_hold" and prev_state == "live_hold")
            else (1 if state == "live_hold" else 0)
        )
        metrics_payload = dict(row)
        metrics_payload["_registry_state_meta"] = {
            "state_run_count": int(state_run_count),
            "live_hold_run_count": int(live_hold_run_count),
            "freeze_mode_active": bool(freeze_on_zero_strict_pass),
            "strict_pass_total": int(strict_pass_total),
        }
        state_rows.append(
            {
                "candidate_id": cid,
                "family": str(row.get("family") or ""),
                "state": state,
                "source_stage_b_run_id": stage_b_run_id,
                "updated_at": now,
                "reason_codes_json": json.dumps(_uniq_reason_codes(state_reasons), sort_keys=True, ensure_ascii=False),
                "q1_registry_score": float(row.get("q1_registry_score") or 0.0),
                "champion_id": live_champion_id if state in {"live", "live_hold"} else None,
                "metrics_json": json.dumps(metrics_payload, sort_keys=True, ensure_ascii=False),
                "failed_gate_names": failed_gate_names,
                "hard_failed_gate_names": hard_failed_gate_names,
                "state_run_count": int(state_run_count),
                "live_hold_run_count": int(live_hold_run_count),
            }
        )
    # Emit explicit retired rows for previously tracked candidates not present in current Stage-B run.
    # This closes a correctness gap where old live/shadow candidates could silently persist.
    missing_prev_ids = sorted(set(prev_candidate_states.keys()) - current_candidate_ids)
    for cid in missing_prev_ids:
        prev = prev_candidate_states.get(cid) or {}
        prev_state = str(prev.get("state") or "")
        hold_prev = bool(freeze_on_zero_strict_pass and prev_state in {"live", "live_hold", "shadow"})
        out_state = ("live_hold" if prev_state == "live" else prev_state) if hold_prev else "retired"
        out_reasons = (
            [RC["freeze_keep_missing_prev_state"], RC["strict_pass_empty_freeze"]]
            if hold_prev
            else [RC["not_present_current_stage_b"]]
        )
        state_rows.append(
            {
                "candidate_id": cid,
                "family": str(prev.get("family") or ""),
                "state": out_state,
                "source_stage_b_run_id": stage_b_run_id,
                "updated_at": now,
                "reason_codes_json": json.dumps(out_reasons, sort_keys=True, ensure_ascii=False),
                "q1_registry_score": float(prev.get("q1_registry_score") or 0.0),
                "champion_id": str(prev.get("champion_id") or "") if out_state in {"live", "live_hold"} else None,
                "metrics_json": json.dumps(
                    {
                        "candidate_id": cid,
                        "family": prev.get("family"),
                        "source": "prev_state_only",
                        "_registry_state_meta": {
                            "state_run_count": int((prev.get("state_run_count") or 0) + 1) if prev_state == out_state else 1,
                            "live_hold_run_count": (
                                int((prev.get("live_hold_run_count") or 0) + 1)
                                if (out_state == "live_hold" and prev_state == "live_hold")
                                else (1 if out_state == "live_hold" else 0)
                            ),
                            "freeze_mode_active": bool(freeze_on_zero_strict_pass),
                            "strict_pass_total": int(strict_pass_total),
                        },
                    },
                    sort_keys=True,
                    ensure_ascii=False,
                ),
                "state_run_count": int((prev.get("state_run_count") or 0) + 1) if prev_state == out_state else 1,
                "live_hold_run_count": (
                    int((prev.get("live_hold_run_count") or 0) + 1)
                    if (out_state == "live_hold" and prev_state == "live_hold")
                    else (1 if out_state == "live_hold" else 0)
                ),
            }
        )
    for srow in state_rows:
        conn.execute(
            """
            INSERT OR REPLACE INTO candidate_registry_state_q1
            (candidate_id, family, state, source_stage_b_run_id, updated_at, reason_codes_json, q1_registry_score, champion_id, metrics_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                srow["candidate_id"],
                srow["family"],
                srow["state"],
                srow["source_stage_b_run_id"],
                srow["updated_at"],
                srow["reason_codes_json"],
                srow["q1_registry_score"],
                srow["champion_id"],
                srow["metrics_json"],
            ),
        )
    slot_rows, slot_policy_warnings = _sync_champion_slots(
        conn,
        state_rows=state_rows,
        current=current,
        stage_b_run_id=stage_b_run_id,
        now=now,
        live_slot_count=int(args.live_slot_count),
        shadow_slot_count=int(args.shadow_slot_count),
        retired_slot_count=int(args.retired_slot_count),
        max_live_per_family=int(args.max_live_per_family),
        max_shadow_per_family=int(args.max_shadow_per_family),
        max_retired_per_family=int(args.max_retired_per_family),
        slot_family_policy_mode=str(args.slot_family_policy_mode),
        include_default_slot_alias=bool(args.include_default_slot_alias),
    )
    slot_policy_mode = str(args.slot_family_policy_mode).lower()
    if slot_policy_warnings:
        decision_rec.setdefault("reason_codes", [])
        decision_rec["reason_codes"] = _uniq_reason_codes(
            list(decision_rec.get("reason_codes") or []) + ["SLOT_FAMILY_POLICY_CONSTRAINT_HIT"]
        )
        if slot_policy_mode == "hard":
            conn.rollback()
            raise SystemExit(f"FATAL: slot family policy constraints hit: {slot_policy_warnings}")
    champions_dir = registry_root / "champions"
    live_slot = slot_rows.get("live")
    current_champion_json_path = champions_dir / "current_champion.json"
    if live_slot is not None:
        live_payload = {
            "schema": "quantlab_q1_champion_state_v1",
            "generated_at": now,
            "champion_id": str(live_slot.get("champion_id") or ""),
            "candidate_id": str(live_slot.get("candidate_id") or ""),
            "family": str(live_slot.get("family") or ""),
            "q1_registry_score": float(live_slot.get("q1_registry_score") or 0.0),
            "source_stage_b_run_id": stage_b_run_id,
            "state": str(live_slot.get("state") or "live"),
            "promoted_at": str(live_slot.get("promoted_at") or now),
            "updated_at": now,
            "metrics": json.loads(str(live_slot.get("metrics_json") or "{}")),
        }
        atomic_write_json(current_champion_json_path, live_payload)
    elif current_champion_json_path.exists():
        try:
            current_champion_json_path.unlink()
        except Exception:
            pass
    state_rows_by_id = {str(r["candidate_id"]): r for r in state_rows if str(r.get("candidate_id") or "")}
    if top_survivor is not None:
        top_failed = list(top_survivor_failed_gate_names)
        decision_rec.setdefault("summary_metrics", {})
        decision_rec["summary_metrics"]["top_survivor_failed_gate_names"] = top_failed
        decision_rec["summary_metrics"]["top_survivor_hard_failed_gate_names"] = [
            g for g in top_failed if g in hard_demotion_gate_names
        ]
    if current is not None:
        curr_cid = str(current.get("candidate_id") or "")
        curr_state_row_for_metrics = state_rows_by_id.get(curr_cid) or {}
        decision_rec.setdefault("summary_metrics", {})
        decision_rec["summary_metrics"]["current_live_failed_gate_names"] = list(curr_state_row_for_metrics.get("failed_gate_names") or [])
        decision_rec["summary_metrics"]["current_live_hard_failed_gate_names"] = list(curr_state_row_for_metrics.get("hard_failed_gate_names") or [])

    champion_slot_state_transition: dict[str, Any] | None = None
    # Keep champion_state_q1 consistent with candidate state transitions, even on no-promotion runs.
    if current is not None and decision != "PROMOTE":
        curr_cid = str(current.get("candidate_id") or "")
        curr_state_row = state_rows_by_id.get(curr_cid)
        if curr_state_row:
            new_slot_state = str(curr_state_row.get("state") or current.get("state") or "live")
            if new_slot_state != str(current.get("state") or "live"):
                if new_slot_state == "shadow":
                    if str(current.get("state") or "") == "live_hold":
                        reason_codes.append(RC["current_live_hold_released_to_shadow"])
                    else:
                        reason_codes.append(RC["current_live_champion_demoted_to_shadow"])
                elif new_slot_state == "retired":
                    if str(current.get("state") or "") == "live_hold":
                        reason_codes.append(RC["current_live_hold_released_to_retired"])
                    else:
                        reason_codes.append(RC["current_live_champion_demoted_to_retired"])
                elif new_slot_state == "live_hold":
                    reason_codes.append(RC["current_live_champion_to_live_hold"])
                for g in list(curr_state_row.get("hard_failed_gate_names") or []):
                    reason_codes.append(_gate_reason_code(g))
                conn.execute(
                    """
                    UPDATE champion_state_q1
                    SET state=?, q1_registry_score=?, source_stage_b_run_id=?, metrics_json=?
                    WHERE slot IN ('live','default')
                    """,
                    (
                        new_slot_state,
                        float(curr_state_row.get("q1_registry_score") or current.get("q1_registry_score") or 0.0),
                        stage_b_run_id,
                        str(curr_state_row.get("metrics_json") or json.dumps(current.get("metrics") or {}, sort_keys=True, ensure_ascii=False)),
                    ),
                )
                champion_slot_state_transition = {
                    "champion_id": str(current.get("champion_id") or ""),
                    "candidate_id": curr_cid,
                    "prev_state": str(current.get("state") or "live"),
                    "new_state": new_slot_state,
                    "hard_failed_gate_names": list(curr_state_row.get("hard_failed_gate_names") or []),
                }
                current_champion_json_path = registry_root / "champions" / "current_champion.json"
                if current_champion_json_path.exists():
                    try:
                        champ_obj = read_json(current_champion_json_path)
                        champ_obj["state"] = new_slot_state
                        champ_obj["source_stage_b_run_id"] = stage_b_run_id
                        champ_obj["updated_at"] = now
                        if curr_state_row.get("q1_registry_score") is not None:
                            champ_obj["q1_registry_score"] = float(curr_state_row.get("q1_registry_score") or 0.0)
                        atomic_write_json(current_champion_json_path, champ_obj)
                    except Exception:
                        pass
        else:
            reason_codes.append(RC["current_live_champion_missing_in_stage_b_candidates"])
    # Candidate state transition events (audit trail for demotions/promotions/retirements).
    candidate_state_events: list[dict[str, Any]] = []
    for srow in state_rows:
        cid = str(srow["candidate_id"])
        prev = prev_candidate_states.get(cid)
        prev_state = str(prev.get("state")) if prev else None
        new_state = str(srow["state"])
        if prev_state == new_state:
            continue
        transition_reason_codes: list[str] = []
        try:
            transition_reason_codes.extend(json.loads(srow["reason_codes_json"]))
        except Exception:
            pass
        if prev_state is None:
            event_type = "STATE_DISCOVERED"
            transition_reason_codes.append(RC["first_observed"])
        elif prev_state == "live" and new_state == "live_hold":
            event_type = "FREEZE_TO_LIVE_HOLD"
            transition_reason_codes.append(RC["current_live_champion_to_live_hold"])
        elif prev_state == "live" and new_state == "shadow":
            event_type = "DEMOTION_TO_SHADOW"
            transition_reason_codes.append(RC["live_candidate_not_reselected_as_champion"])
        elif prev_state == "live_hold" and new_state == "shadow":
            event_type = "LIVE_HOLD_TO_SHADOW"
            transition_reason_codes.append(RC["current_live_hold_released_to_shadow"])
        elif prev_state == "live_hold" and new_state == "retired":
            event_type = "LIVE_HOLD_TO_RETIRED"
            transition_reason_codes.append(RC["current_live_hold_released_to_retired"])
        elif prev_state == "live" and new_state == "retired":
            event_type = "DEMOTION_TO_RETIRED"
            transition_reason_codes.append(RC["live_candidate_failed_or_not_survivor"])
        elif prev_state == "shadow" and new_state == "live":
            event_type = "PROMOTION_TO_LIVE"
            transition_reason_codes.append(RC["selected_as_live_champion"])
        elif prev_state == "retired" and new_state == "shadow":
            event_type = "REVIVED_TO_SHADOW"
            transition_reason_codes.append(RC["reentered_stage_b_survivors"])
        else:
            event_type = "STATE_TRANSITION"
        ev = {
            "schema": "quantlab_q1_candidate_state_event_v1",
            "event_id": f"csev_{stable_hash_obj({'cid': cid, 'ts': now, 'from': prev_state, 'to': new_state, 'run': stage_b_run_id})[:20]}",
            "ts": now,
            "stage_b_run_id": stage_b_run_id,
            "event_type": event_type,
            "candidate_id": cid,
            "family": srow.get("family"),
            "prev_state": prev_state,
            "new_state": new_state,
            "reason_codes": _uniq_reason_codes(transition_reason_codes),
            "details": {
                "source_stage_b_run_id": stage_b_run_id,
                "q1_registry_score": srow.get("q1_registry_score"),
                "champion_id": srow.get("champion_id"),
                "prev_source_stage_b_run_id": (prev or {}).get("source_stage_b_run_id"),
                "failed_gate_names": list(srow.get("failed_gate_names") or []),
                "hard_failed_gate_names": list(srow.get("hard_failed_gate_names") or []),
            },
        }
        candidate_state_events.append(ev)
        conn.execute(
            """
            INSERT OR REPLACE INTO candidate_state_events_q1
            (event_id, ts, stage_b_run_id, candidate_id, family, prev_state, new_state, reason_codes_json, details_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ev["event_id"],
                ev["ts"],
                ev["stage_b_run_id"],
                ev["candidate_id"],
                ev.get("family"),
                ev.get("prev_state"),
                ev["new_state"],
                json.dumps(ev.get("reason_codes") or [], sort_keys=True, ensure_ascii=False),
                json.dumps(ev.get("details") or {}, sort_keys=True, ensure_ascii=False),
            ),
        )
    # If the champion slot was demoted without a replacement, emit an explicit governance event.
    if champion_slot_state_transition is not None and decision != "PROMOTE":
        demotion_ev = {
            "schema": "quantlab_q1_promotion_event_v1",
            "event_id": f"ev_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'decision': 'DEMOTION', 'ts': now, 'cid': champion_slot_state_transition['candidate_id']})[:16]}",
            "ts": now,
            "event_type": "DEMOTION",
            "stage_b_run_id": stage_b_run_id,
            "old_champion_id": champion_before_id,
            "new_champion_id": champion_before_id,
            "candidate_id": champion_slot_state_transition["candidate_id"],
            "reason_codes": _uniq_reason_codes(
                [
                    champion_slot_state_transition["new_state"] == "shadow" and RC["current_live_champion_demoted_to_shadow"] or RC["current_live_champion_demoted_to_retired"]
                ]
                + [_gate_reason_code(g) for g in list(champion_slot_state_transition.get("hard_failed_gate_names") or [])]
            ),
            "delta_metrics": {
                "champion_state_before": champion_slot_state_transition["prev_state"],
                "champion_state_after": champion_slot_state_transition["new_state"],
            },
            "artifacts": {
                "stage_b_q1_run_report": str(stage_b_run_report_path),
                "stage_b_light_report": str(stage_b_light_report_path),
            },
        }
        conn.execute(
            """
            INSERT OR REPLACE INTO promotion_events_q1
            (event_id, ts, event_type, stage_b_run_id, old_champion_id, new_champion_id, candidate_id, delta_metrics_json, artifacts_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                demotion_ev["event_id"],
                demotion_ev["ts"],
                demotion_ev["event_type"],
                demotion_ev["stage_b_run_id"],
                demotion_ev.get("old_champion_id"),
                demotion_ev.get("new_champion_id"),
                demotion_ev.get("candidate_id"),
                json.dumps(demotion_ev.get("delta_metrics") or {}, sort_keys=True, ensure_ascii=False),
                json.dumps(demotion_ev.get("artifacts") or {}, sort_keys=True, ensure_ascii=False),
            ),
        )
        # Reuse event ledger append path later by piggybacking on a list in locals.
        extra_promotion_events = [demotion_ev]
    else:
        extra_promotion_events = []
    # Refresh decision ledger payload if demotion-related reason codes/state-after changed post state-eval.
    decision_rec["reason_codes"] = _uniq_reason_codes(reason_codes)
    if champion_slot_state_transition is not None:
        decision_rec.setdefault("summary_metrics", {})
        decision_rec["summary_metrics"]["state_after"] = champion_slot_state_transition.get("new_state")
    conn.execute(
        "UPDATE promotion_decisions_q1 SET reason_codes_json=?, summary_metrics_json=? WHERE decision_id=?",
        (
            json.dumps(decision_rec.get("reason_codes") or [], sort_keys=True, ensure_ascii=False),
            json.dumps(decision_rec.get("summary_metrics") or {}, sort_keys=True, ensure_ascii=False),
            decision_rec["decision_id"],
        ),
    )
    conn.commit()

    ledgers_dir = registry_root / "ledgers"
    decisions_path = ledgers_dir / "promotion_decisions.ndjson"
    events_path = ledgers_dir / "promotion_events.ndjson"
    candidate_state_events_path = ledgers_dir / "candidate_state_events.ndjson"
    _append_jsonl(decisions_path, decision_rec)
    if event:
        _append_jsonl(events_path, event)
    for ev in extra_promotion_events:
        _append_jsonl(events_path, ev)
    for ev in candidate_state_events:
        _append_jsonl(candidate_state_events_path, ev)
    promotion_index_path = _write_promotion_index(registry_root, decisions_path, events_path)
    candidate_any_gate_fail_rows = sum(1 for r in state_rows if len(r.get("failed_gate_names") or []) > 0)
    candidate_hard_gate_fail_rows = sum(1 for r in state_rows if len(r.get("hard_failed_gate_names") or []) > 0)

    out_dir = quant_root / "runs" / f"run_id=q1registry_{stage_b_run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_out = {
        "schema": "quantlab_q1_registry_update_report_v1",
        "generated_at": now,
        "ok": True,
        "exit_code": 0,
        "stage_b_run_id": stage_b_run_id,
        "demotion_policy": {
            "v4_final_profile": bool(v4_final_profile),
            "shadow_score_gap": float(args.demotion_shadow_score_gap),
            "retire_score_gap": float(args.demotion_retire_score_gap),
            "live_hold_shadow_after_runs": int(live_hold_shadow_after_runs),
            "live_hold_retire_after_runs": int(live_hold_retire_after_runs),
            "hard_demotion_gates_source_requested": str(args.hard_demotion_gates_source),
            "hard_demotion_gates_source_used": str(hard_demotion_gate_source),
            "hard_demotion_gate_names": sorted(str(x) for x in hard_demotion_gate_names),
            "require_top_survivor_hard_gates_pass": bool(args.require_top_survivor_hard_gates_pass),
            "stageb_pass_column_requested": str(args.stageb_pass_column),
            "stageb_pass_column_used": str(selected_pass_col),
            "freeze_on_zero_strict_pass": bool(args.freeze_on_zero_strict_pass),
            "strict_pass_col_used": str(strict_pass_col),
            "strict_pass_total": int(strict_pass_total),
            "freeze_mode_active": bool(freeze_on_zero_strict_pass),
            "slot_policy": {
                "live_slot_count": int(args.live_slot_count),
                "shadow_slot_count": int(args.shadow_slot_count),
                "retired_slot_count": int(args.retired_slot_count),
                "max_live_per_family": int(args.max_live_per_family),
                "max_shadow_per_family": int(args.max_shadow_per_family),
                "max_retired_per_family": int(args.max_retired_per_family),
                "slot_family_policy_mode": str(args.slot_family_policy_mode),
                "slot_family_policy_warnings": list(slot_policy_warnings),
                "include_default_slot_alias": bool(args.include_default_slot_alias),
            },
            "sort_priority": [
                str(selected_pass_col),
                "q1_registry_score",
                "dsr_strict",
                "psr_strict",
                "dsr_cpcv_strict",
                "psr_cpcv_strict",
                "dsr_proxy",
                "psr_proxy",
            ],
        },
        "warnings": sorted(set(list(governance_warnings) + list(slot_policy_warnings))),
        "decision": decision_rec,
        "event_written": bool(event),
        "extra_events_written": int(len(extra_promotion_events)),
        "champion_slot_state_transition": champion_slot_state_transition,
        "champion_slots": {
            slot: {
                "candidate_id": str(v.get("candidate_id") or ""),
                "family": str(v.get("family") or ""),
                "state": str(v.get("state") or ""),
                "q1_registry_score": float(v.get("q1_registry_score") or 0.0),
            }
            for slot, v in sorted(slot_rows.items())
        },
        "counts": {
            "stage_b_candidates_total": int(candidates_df.height),
            "stage_b_candidates_pass_total": int(
                candidates_df.select(pl.col(selected_pass_col).cast(pl.Int64).sum().fill_null(0).alias("v")).to_dicts()[0]["v"]
            ),
            "stage_b_candidates_strict_pass_total": int(strict_pass_total),
            "stage_b_survivors_B_light_total": int(survivors_light_df.height),
            "stage_b_survivors_selected_total": int(survivors_df.height),
            "stage_b_survivors_selected_source": selected_survivors_source,
            "candidate_registry_states_written": int(len(state_rows)),
            "candidate_state_events_written": int(len(candidate_state_events)),
            "candidate_prev_missing_rows_retired": int(len(missing_prev_ids)),
            "candidate_any_gate_fail_rows": int(candidate_any_gate_fail_rows),
            "candidate_hard_gate_fail_rows": int(candidate_hard_gate_fail_rows),
            "top_survivor_hard_failed_gate_total": int(len(top_survivor_hard_failed_gate_names)),
            "candidate_registry_state_counts": {
                "live": sum(1 for r in state_rows if r["state"] == "live"),
                "live_hold": sum(1 for r in state_rows if r["state"] == "live_hold"),
                "shadow": sum(1 for r in state_rows if r["state"] == "shadow"),
                "retired": sum(1 for r in state_rows if r["state"] == "retired"),
            },
            "candidate_state_event_type_counts": {
                k: sum(1 for e in candidate_state_events if e["event_type"] == k)
                for k in sorted({e["event_type"] for e in candidate_state_events})
            },
            "champion_slots_total": int(len(slot_rows)),
            "slot_family_policy_warnings_total": int(len(slot_policy_warnings)),
        },
        "artifacts": {
            "registry_root": str(registry_root),
            "registry_db": str(db_path),
            "promotion_decisions_ndjson": str(decisions_path),
            "promotion_events_ndjson": str(events_path),
            "candidate_state_events_ndjson": str(candidate_state_events_path),
            "promotion_index": str(promotion_index_path),
            "stage_b_q1_run_report": str(stage_b_run_report_path),
            "stage_b_light_report": str(stage_b_light_report_path),
            "stage_b_survivors_selected": str(stage_b_q1_survivors_path if stage_b_q1_survivors_path.exists() else Path(str((stage_b_light_report.get('artifacts') or {}).get('survivors_B_light') or ''))),
        },
        "hashes": {
            "stage_b_q1_run_report_hash": stable_hash_file(stage_b_run_report_path),
            "stage_b_light_report_hash": stable_hash_file(stage_b_light_report_path),
            "promotion_index_hash": stable_hash_file(promotion_index_path),
        },
    }
    report_path = out_dir / "q1_registry_update_report.json"
    atomic_write_json(report_path, report_out)

    print(f"stage_b_run_id={stage_b_run_id}")
    print(f"decision={decision_rec['decision']}")
    print(f"report={report_path}")
    print(f"registry_root={registry_root}")
    print(f"registry_db={db_path}")
    print(f"ok=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
