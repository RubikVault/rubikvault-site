#!/usr/bin/env python3
from __future__ import annotations

import argparse
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    build_raw_bars_freshness_summary,
    local_today_iso,
    read_json,
    safe_panel_lookback_calendar_days,
    stable_hash_file,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--python", default=str(Path.cwd() / "quantlab" / ".venv" / "bin" / "python"))
    p.add_argument("--run-phasea-backbone", action="store_true")
    p.add_argument("--phasea-include-types", default="STOCK,ETF")
    p.add_argument("--phasea-ingest-date", default="")
    p.add_argument("--phasea-delta-job-name", default="")
    p.add_argument("--phasea-feature-store-version", default="")
    p.add_argument("--phasea-feature-output-tag", default="")
    p.add_argument("--phasea-real-delta-test-mode", action="store_true")
    p.add_argument("--phasea-real-delta-min-emitted-rows", type=int, default=1)
    p.add_argument("--phasea-real-delta-limit-packs", type=int, default=2)
    p.add_argument("--phasea-real-delta-max-emitted-rows", type=int, default=100000)
    p.add_argument("--phasea-run-corp-actions-ingest", action="store_true", default=True)
    p.add_argument("--skip-phasea-run-corp-actions-ingest", dest="phasea_run_corp_actions_ingest", action="store_false")
    p.add_argument("--phasea-run-registry-delistings-ingest", action="store_true", default=True)
    p.add_argument("--skip-phasea-run-registry-delistings-ingest", dest="phasea_run_registry_delistings_ingest", action="store_false")
    p.add_argument("--phasea-corp-actions-max-assets", type=int, default=1000)
    p.add_argument("--phasea-corp-actions-max-calls", type=int, default=2000)
    p.add_argument("--phasea-corp-actions-from-date", default="")
    p.add_argument("--phasea-corp-actions-http-failure-mode", choices=["warn", "hard"], default="warn")
    p.add_argument("--phasea-contract-raw-ingest-date-mode", choices=["latest_available", "match_backbone_ingest"], default="latest_available")
    p.add_argument("--phasea-recon-corp-actions-cap-hit-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--phasea-recon-corp-actions-raw-empty-fallback-failure-mode", choices=["off", "warn", "hard"], default="warn")
    p.add_argument("--phasea-warn-min-delta-rows", type=int, default=0)
    p.add_argument("--phasea-warn-max-delta-rows", type=int, default=0)
    p.add_argument("--phasea-fail-min-delta-rows", type=int, default=0)
    p.add_argument("--phasea-fail-max-delta-rows", type=int, default=0)
    p.add_argument("--phasea-auto-thresholds-from-ledger", action="store_true")
    p.add_argument("--phasea-auto-thresholds-path", default="")
    p.add_argument("--phasea-auto-thresholds-min-history", type=int, default=10)
    p.add_argument("--phasea-ops-ledger-path", default="")
    p.add_argument("--phasea-ops-ledger-disabled", action="store_true")
    p.add_argument("--phasea-production-mode", action="store_true", default=True)
    p.add_argument("--skip-phasea-production-mode", dest="phasea_production_mode", action="store_false")
    p.add_argument("--snapshot-id", required=True)
    p.add_argument("--feature-store-version", default="v4_q1panel_daily_local")
    p.add_argument("--panel-output-tag", default="daily")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--panel-calendar-days", type=int, default=60)
    p.add_argument("--panel-max-assets", type=int, default=10000)
    p.add_argument("--min-bars", type=int, default=200)
    p.add_argument("--top-liquid-n", type=int, default=5000)
    p.add_argument("--fold-count", type=int, default=3)
    p.add_argument("--test-days", type=int, default=5)
    p.add_argument("--embargo-days", type=int, default=2)
    p.add_argument("--min-train-days", type=int, default=8)
    p.add_argument("--survivors-max", type=int, default=24)
    p.add_argument("--candidate-profile", choices=["core8", "core16", "core24"], default="core24")
    p.add_argument("--asof-end-date", default="")
    p.add_argument("--run-stageb-q1", action="store_true")
    p.add_argument("--run-registry-q1", action="store_true")
    p.add_argument("--run-portfolio-q1", action="store_true", default=False)
    p.add_argument("--skip-run-portfolio-q1", dest="run_portfolio_q1", action="store_false")
    p.add_argument("--run-redflags-q1", action="store_true")
    p.add_argument("--redflags-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--stageb-pass-mode", choices=["strict", "proxy_augmented"], default="strict")
    p.add_argument("--stageb-strict-gate-profile", choices=["hard", "broad"], default="hard")
    p.add_argument(
        "--stageb-strict-quality-gate-mode",
        choices=["balanced", "legacy"],
        default="balanced",
    )
    p.add_argument(
        "--stageb-prep-strict-intersection-mode",
        choices=["prefer", "require", "off"],
        default="prefer",
    )
    p.add_argument("--stageb-input-scope", choices=["survivors_a", "all_candidates"], default="survivors_a")
    p.add_argument("--stageb-min-survivors-b-q1", type=int, default=1)
    p.add_argument("--stageb-survivors-b-q1-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--stageb-q1-strict-survivors-max", type=int, default=8)
    p.add_argument("--stageb-psr-strict-min", type=float, default=0.65)
    p.add_argument("--stageb-dsr-strict-min", type=float, default=0.55)
    p.add_argument("--stageb-psr-cpcv-strict-min", type=float, default=0.65)
    p.add_argument("--stageb-dsr-cpcv-strict-min", type=float, default=0.55)
    p.add_argument("--stageb-dsr-trials-total", type=int, default=0)
    p.add_argument("--stageb-cpcv-light-p10-min", type=float, default=-0.03)
    p.add_argument("--stageb-cpcv-light-p25-min", type=float, default=0.00)
    p.add_argument("--stageb-cpcv-light-p05-min", type=float, default=-0.06)
    p.add_argument("--stageb-cpcv-light-es10-min", type=float, default=-0.08)
    p.add_argument("--stageb-cpcv-light-min-combo-size", type=int, default=3)
    p.add_argument("--stageb-cpcv-light-skip-adjacent-folds", action="store_true", default=True)
    p.add_argument("--skip-stageb-cpcv-light-skip-adjacent-folds", dest="stageb_cpcv_light_skip_adjacent_folds", action="store_false")
    p.add_argument("--stageb-cpcv-light-temporal-filter", action="store_true", default=True)
    p.add_argument("--skip-stageb-cpcv-light-temporal-filter", dest="stageb_cpcv_light_temporal_filter", action="store_false")
    p.add_argument("--stageb-cpcv-light-min-test-gap-days", type=int, default=10)
    p.add_argument("--stageb-cpcv-light-min-embargo-gap-days", type=int, default=5)
    p.add_argument("--stageb-cpcv-light-min-effective-paths", type=int, default=5)
    p.add_argument("--stageb-cpcv-light-min-effective-path-ratio", type=float, default=0.75)
    p.add_argument("--stageb-cpcv-light-min-paths-total", type=int, default=5)
    p.add_argument(
        "--stageb-cpcv-light-requirement-mode",
        choices=["feasible_min", "configured_min"],
        default="feasible_min",
    )
    p.add_argument(
        "--stageb-cpcv-light-relaxation-mode",
        choices=["allow", "strict_fail"],
        default="allow",
    )
    p.add_argument("--registry-score-epsilon", type=float, default=0.01)
    p.add_argument("--registry-demotion-shadow-score-gap", type=float, default=0.03)
    p.add_argument("--registry-demotion-retire-score-gap", type=float, default=0.08)
    p.add_argument("--registry-stageb-pass-column", choices=["strict", "selected"], default="strict")
    p.add_argument(
        "--registry-hard-demotion-gates-source",
        choices=["auto", "stageb", "static"],
        default="auto",
    )
    p.add_argument("--registry-live-slot-count", type=int, default=3)
    p.add_argument("--registry-shadow-slot-count", type=int, default=2)
    p.add_argument("--registry-retired-slot-count", type=int, default=1)
    p.add_argument("--registry-max-live-per-family", type=int, default=0)
    p.add_argument("--registry-max-shadow-per-family", type=int, default=0)
    p.add_argument("--registry-max-retired-per-family", type=int, default=0)
    p.add_argument(
        "--registry-slot-family-policy-mode",
        choices=["off", "warn", "hard"],
        default="warn",
    )
    p.add_argument("--registry-include-default-slot-alias", action="store_true", default=True)
    p.add_argument(
        "--skip-registry-include-default-slot-alias",
        dest="registry_include_default_slot_alias",
        action="store_false",
    )
    p.add_argument("--registry-freeze-on-zero-strict-pass", action="store_true", default=True)
    p.add_argument(
        "--skip-registry-freeze-on-zero-strict-pass",
        dest="registry_freeze_on_zero_strict_pass",
        action="store_false",
    )
    p.add_argument("--registry-require-top-survivor-hard-gates-pass", action="store_true", default=True)
    p.add_argument(
        "--skip-registry-require-top-survivor-hard-gates-pass",
        dest="registry_require_top_survivor_hard_gates_pass",
        action="store_false",
    )
    p.add_argument("--portfolio-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--portfolio-feature-store-version", default="")
    p.add_argument("--portfolio-part-glob", default="part-*.parquet")
    p.add_argument("--portfolio-panel-output-tag", default="")
    p.add_argument("--portfolio-min-adv-dollar", type=float, default=250000.0)
    p.add_argument("--portfolio-top-n-long", type=int, default=120)
    p.add_argument("--portfolio-top-n-short", type=int, default=120)
    p.add_argument("--portfolio-allow-shorts", action="store_true", default=True)
    p.add_argument("--skip-portfolio-allow-shorts", dest="portfolio_allow_shorts", action="store_false")
    p.add_argument("--portfolio-target-gross", type=float, default=1.0)
    p.add_argument("--portfolio-max-gross", type=float, default=1.5)
    p.add_argument("--portfolio-max-net", type=float, default=1.0)
    p.add_argument("--portfolio-max-position-weight", type=float, default=0.08)
    p.add_argument("--portfolio-max-long-per-family", type=int, default=0)
    p.add_argument("--portfolio-max-short-per-family", type=int, default=0)
    p.add_argument("--portfolio-max-family-abs-exposure", type=float, default=0.0)
    p.add_argument(
        "--portfolio-family-concentration-failure-mode",
        choices=["off", "warn", "hard"],
        default="warn",
    )
    p.add_argument("--portfolio-min-rebalance-delta", type=float, default=0.002)
    p.add_argument(
        "--portfolio-no-rebalance-orders-failure-mode",
        choices=["off", "warn", "hard"],
        default="off",
    )
    p.add_argument(
        "--portfolio-registry-slot-consistency-failure-mode",
        choices=["off", "warn", "hard"],
        default="warn",
    )
    p.add_argument("--portfolio-require-nonempty", action="store_true", default=True)
    p.add_argument("--skip-portfolio-require-nonempty", dest="portfolio_require_nonempty", action="store_false")
    p.add_argument(
        "--portfolio-candidate-selection-mode",
        choices=["single", "slot_blend"],
        default="slot_blend",
    )
    p.add_argument(
        "--portfolio-registry-slot-blend",
        default="live=1.0,live_alt_1=0.75,live_alt_2=0.50,shadow=0.35",
    )
    p.add_argument("--portfolio-slot-blend-max-candidates", type=int, default=4)
    p.add_argument(
        "--portfolio-registry-state-multipliers",
        default="live=1.0,live_hold=0.85,shadow=0.35,retired=0.0,unknown=0.25",
    )
    p.add_argument("--portfolio-slot-blend-min-effective-weight", type=float, default=0.01)
    p.add_argument("--portfolio-slot-blend-require-live-like", action="store_true", default=True)
    p.add_argument(
        "--skip-portfolio-slot-blend-require-live-like",
        dest="portfolio_slot_blend_require_live_like",
        action="store_false",
    )
    p.add_argument("--portfolio-slot-blend-live-like-states", default="live,live_hold")
    p.add_argument("--run-v4-final-gate-matrix", action="store_true", default=True)
    p.add_argument("--skip-run-v4-final-gate-matrix", dest="run_v4_final_gate_matrix", action="store_false")
    p.add_argument("--v4-final-gate-failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--v4-final-profile", action="store_true", default=False)
    return p.parse_args(list(argv))


def _git_sha(repo_root: Path) -> str:
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True)
            .strip()
        )
    except Exception:
        return "unknown"


def _resolve_snapshot_id(quant_root: Path, snapshot_id_raw: str) -> str:
    raw = str(snapshot_id_raw or "").strip()
    if raw and raw.lower() != "latest":
        return raw
    latest_ptr = quant_root / "ops" / "q1_incremental_snapshot" / "latest_success.json"
    if latest_ptr.exists():
        try:
            obj = read_json(latest_ptr)
            sid = str(obj.get("snapshot_id") or "").strip()
            if sid:
                return sid
            manifest_path_raw = str(obj.get("increment_manifest") or obj.get("manifest_path") or "").strip()
            if manifest_path_raw:
                manifest_path = Path(manifest_path_raw)
                if manifest_path.exists():
                    mobj = read_json(manifest_path)
                    snap = str(mobj.get("snapshot_id") or "").strip()
                    if snap:
                        return snap
        except Exception:
            pass
    snaps_root = quant_root / "data" / "snapshots"
    if snaps_root.exists():
        cands = sorted(p for p in snaps_root.glob("snapshot_id=*") if p.is_dir())
        if cands:
            return cands[-1].name.split("snapshot_id=", 1)[1]
    return raw or "latest"


def _base_inputs(args: argparse.Namespace, snapshot_id_effective: str, v4_final_profile: bool) -> dict[str, Any]:
    return {
        "snapshot_id": snapshot_id_effective,
        "snapshot_id_requested": args.snapshot_id,
        "feature_store_version": args.feature_store_version,
        "panel_output_tag": args.panel_output_tag,
        "asset_classes": args.asset_classes,
        "lookback_calendar_days": int(args.lookback_calendar_days),
        "panel_calendar_days": int(args.panel_calendar_days),
        "min_bars": int(args.min_bars),
        "asof_end_date_requested": str(args.asof_end_date or ""),
        "v4_final_profile": bool(v4_final_profile),
        "run_phasea_backbone": bool(args.run_phasea_backbone),
        "phasea_production_mode": bool(args.phasea_production_mode),
        "phasea_run_corp_actions_ingest": bool(args.phasea_run_corp_actions_ingest),
        "phasea_run_registry_delistings_ingest": bool(args.phasea_run_registry_delistings_ingest),
        "phasea_corp_actions_max_assets": int(args.phasea_corp_actions_max_assets),
        "phasea_corp_actions_max_calls": int(args.phasea_corp_actions_max_calls),
        "phasea_corp_actions_from_date": str(args.phasea_corp_actions_from_date),
        "phasea_corp_actions_http_failure_mode": str(args.phasea_corp_actions_http_failure_mode),
        "phasea_contract_raw_ingest_date_mode": str(args.phasea_contract_raw_ingest_date_mode),
        "phasea_recon_corp_actions_cap_hit_failure_mode": str(args.phasea_recon_corp_actions_cap_hit_failure_mode),
        "phasea_recon_corp_actions_raw_empty_fallback_failure_mode": str(args.phasea_recon_corp_actions_raw_empty_fallback_failure_mode),
        "phasea_warn_min_delta_rows": int(args.phasea_warn_min_delta_rows),
        "phasea_warn_max_delta_rows": int(args.phasea_warn_max_delta_rows),
        "phasea_fail_min_delta_rows": int(args.phasea_fail_min_delta_rows),
        "phasea_fail_max_delta_rows": int(args.phasea_fail_max_delta_rows),
        "run_stageb_q1": bool(args.run_stageb_q1),
        "run_registry_q1": bool(args.run_registry_q1),
        "redflags_failure_mode": str(args.redflags_failure_mode),
        "stageb_pass_mode": str(args.stageb_pass_mode),
        "stageb_strict_gate_profile": str(args.stageb_strict_gate_profile),
        "stageb_strict_quality_gate_mode": str(args.stageb_strict_quality_gate_mode),
        "stageb_prep_strict_intersection_mode": str(args.stageb_prep_strict_intersection_mode),
        "stageb_input_scope": str(args.stageb_input_scope),
        "stageb_cpcv_light_requirement_mode": str(args.stageb_cpcv_light_requirement_mode),
        "stageb_cpcv_light_relaxation_mode": str(args.stageb_cpcv_light_relaxation_mode),
        "panel_max_assets": args.panel_max_assets,
        "top_liquid_n": args.top_liquid_n,
        "fold_count": args.fold_count,
        "test_days": args.test_days,
        "embargo_days": args.embargo_days,
        "min_train_days": args.min_train_days,
        "candidate_profile": str(args.candidate_profile),
        "registry_require_top_survivor_hard_gates_pass": bool(args.registry_require_top_survivor_hard_gates_pass),
        "registry_hard_demotion_gates_source": str(args.registry_hard_demotion_gates_source),
        "registry_live_slot_count": int(args.registry_live_slot_count),
        "registry_shadow_slot_count": int(args.registry_shadow_slot_count),
        "registry_retired_slot_count": int(args.registry_retired_slot_count),
        "registry_max_live_per_family": int(args.registry_max_live_per_family),
        "registry_max_shadow_per_family": int(args.registry_max_shadow_per_family),
        "registry_max_retired_per_family": int(args.registry_max_retired_per_family),
        "registry_slot_family_policy_mode": str(args.registry_slot_family_policy_mode),
        "registry_include_default_slot_alias": bool(args.registry_include_default_slot_alias),
        "portfolio_candidate_selection_mode": str(args.portfolio_candidate_selection_mode),
        "portfolio_registry_slot_blend": str(args.portfolio_registry_slot_blend),
        "portfolio_slot_blend_max_candidates": int(args.portfolio_slot_blend_max_candidates),
        "portfolio_registry_state_multipliers": str(args.portfolio_registry_state_multipliers),
        "portfolio_slot_blend_min_effective_weight": float(args.portfolio_slot_blend_min_effective_weight),
        "portfolio_slot_blend_require_live_like": bool(args.portfolio_slot_blend_require_live_like),
        "portfolio_slot_blend_live_like_states": str(args.portfolio_slot_blend_live_like_states),
        "portfolio_max_long_per_family": int(args.portfolio_max_long_per_family),
        "portfolio_max_short_per_family": int(args.portfolio_max_short_per_family),
        "portfolio_max_family_abs_exposure": float(args.portfolio_max_family_abs_exposure),
        "portfolio_family_concentration_failure_mode": str(args.portfolio_family_concentration_failure_mode),
        "portfolio_no_rebalance_orders_failure_mode": str(args.portfolio_no_rebalance_orders_failure_mode),
        "portfolio_registry_slot_consistency_failure_mode": str(args.portfolio_registry_slot_consistency_failure_mode),
        "run_v4_final_gate_matrix": bool(args.run_v4_final_gate_matrix),
        "v4_final_gate_failure_mode": str(args.v4_final_gate_failure_mode),
    }


def _write_status(
    status_path: Path,
    status: dict[str, Any],
    *,
    state_value: str | None = None,
    current_step: str | None = None,
    heartbeat_note: str | None = None,
) -> None:
    status["generated_at"] = utc_now_iso()
    if state_value is not None:
        status["state"] = str(state_value)
    if current_step is not None:
        status["current_step"] = str(current_step)
    if heartbeat_note is not None:
        status["heartbeat"] = {
            "at": utc_now_iso(),
            "note": str(heartbeat_note),
        }
    atomic_write_json(status_path, status)


def _run_subprocess_with_status_heartbeat(
    cmd: list[str],
    *,
    cwd: Path,
    status: dict[str, Any],
    status_path: Path,
    current_step: str,
    heartbeat_sec: float = 60.0,
    proc_holder: dict[str, subprocess.Popen[str] | None] | None = None,
) -> tuple[subprocess.Popen[str], float, str, str]:
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc_holder is not None:
        proc_holder["proc"] = proc
    t0 = time.time()
    stdout = ""
    stderr = ""
    wait_sec = max(10.0, float(heartbeat_sec))
    while True:
        try:
            stdout, stderr = proc.communicate(timeout=wait_sec)
            break
        except subprocess.TimeoutExpired:
            _write_status(
                status_path,
                status,
                state_value="running",
                current_step=current_step,
                heartbeat_note=f"{current_step}_running",
            )
    elapsed = round(time.time() - t0, 3)
    if proc_holder is not None:
        proc_holder["proc"] = None
    return proc, elapsed, stdout or "", stderr or ""


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    v4_final_profile = bool(args.v4_final_profile)
    if v4_final_profile:
        if int(args.panel_calendar_days) < 90:
            args.panel_calendar_days = 90
        safe_lookback = safe_panel_lookback_calendar_days(
            min_bars=int(args.min_bars),
            panel_days=int(args.panel_calendar_days),
            minimum=420,
        )
        if int(args.lookback_calendar_days) < safe_lookback:
            args.lookback_calendar_days = safe_lookback
        if int(args.fold_count) < 4:
            args.fold_count = 4
        if int(args.min_train_days) < 8:
            args.min_train_days = 8
        if int(args.top_liquid_n) < 2500:
            args.top_liquid_n = 2500
        if str(args.candidate_profile) == "core8":
            args.candidate_profile = "core24"
        args.stageb_pass_mode = "strict"
        args.stageb_strict_gate_profile = "hard"
        args.stageb_strict_quality_gate_mode = "balanced"
        args.stageb_input_scope = "survivors_a"
        args.stageb_cpcv_light_requirement_mode = "feasible_min"
        args.stageb_cpcv_light_relaxation_mode = "strict_fail"
        args.registry_hard_demotion_gates_source = "auto"
        if int(args.registry_max_live_per_family) <= 0:
            args.registry_max_live_per_family = 1
        if int(args.registry_max_shadow_per_family) <= 0:
            args.registry_max_shadow_per_family = 1
        if int(args.registry_max_retired_per_family) <= 0:
            args.registry_max_retired_per_family = 1
        if str(args.registry_slot_family_policy_mode).lower() == "off":
            args.registry_slot_family_policy_mode = "hard"
        if int(args.portfolio_max_long_per_family) <= 0:
            args.portfolio_max_long_per_family = 16
        if int(args.portfolio_max_short_per_family) <= 0:
            args.portfolio_max_short_per_family = 16
        if float(args.portfolio_max_family_abs_exposure) <= 0.0:
            args.portfolio_max_family_abs_exposure = 0.35
        if str(args.portfolio_family_concentration_failure_mode).lower() == "off":
            args.portfolio_family_concentration_failure_mode = "hard"
        if str(args.portfolio_no_rebalance_orders_failure_mode).lower() == "off":
            args.portfolio_no_rebalance_orders_failure_mode = "hard"
        if str(args.portfolio_registry_slot_consistency_failure_mode).lower() != "hard":
            args.portfolio_registry_slot_consistency_failure_mode = "hard"
    quant_root = Path(args.quant_root).resolve()
    snapshot_id_effective = _resolve_snapshot_id(quant_root, args.snapshot_id)
    py = args.python
    orchestrator = REPO_ROOT / "scripts" / "quantlab" / "run_q1_panel_stage_a_pipeline.py"
    phasea_runner = REPO_ROOT / "scripts" / "quantlab" / "run_q1_daily_data_backbone_q1.py"
    phasea_calibrator = REPO_ROOT / "scripts" / "quantlab" / "calibrate_daily_delta_thresholds_q1.py"
    stageb_runner = REPO_ROOT / "scripts" / "quantlab" / "run_stage_b_q1.py"
    registry_runner = REPO_ROOT / "scripts" / "quantlab" / "run_registry_update_q1.py"
    redflags_runner = REPO_ROOT / "scripts" / "quantlab" / "run_redflag_invariants_q1.py"
    portfolio_runner = REPO_ROOT / "scripts" / "quantlab" / "run_portfolio_risk_execution_q1.py"
    final_gate_runner = REPO_ROOT / "scripts" / "quantlab" / "run_v4_final_gate_matrix_q1.py"

    run_id = f"q1panel_daily_local_{int(time.time())}"
    out_dir = quant_root / "runs" / f"run_id={run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    status_path = out_dir / "q1_panel_stagea_daily_run_status.json"
    raw_bars_freshness = build_raw_bars_freshness_summary(
        quant_root,
        asset_types=[part.strip() for part in str(args.phasea_include_types or args.asset_classes or "").split(",") if part.strip()],
        reference_date=str(args.phasea_ingest_date or local_today_iso()),
        stale_after_calendar_days=3 if bool(args.phasea_production_mode or v4_final_profile) else 7,
    )
    status: dict[str, Any] = {
        "schema": "quantlab_q1_panel_stagea_daily_local_run_status_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "git_sha": _git_sha(REPO_ROOT),
        "ok": None,
        "exit_code": None,
        "mode": "local_daily_q1_panel_stageA",
        "state": "starting",
        "current_step": "bootstrap",
        "inputs": _base_inputs(args, snapshot_id_effective, v4_final_profile),
        "steps": [],
        "artifacts": {
            "orchestrator_run_report": None,
        },
        "environment": {
            "raw_bars_freshness": raw_bars_freshness,
        },
        "stdout_tail": [],
        "stderr_tail": [],
        "failure_reason_codes": [],
    }
    _write_status(status_path, status, state_value="starting", current_step="bootstrap", heartbeat_note="bootstrap")
    print(f"run_id={run_id}", flush=True)
    print(f"status={status_path}", flush=True)

    active_child: dict[str, subprocess.Popen[str] | None] = {"proc": None}
    signal_finalize_once = {"done": False}

    def _finalize_interrupted_run(signum: int) -> None:
        if signal_finalize_once["done"]:
            raise SystemExit(128 + int(signum))
        signal_finalize_once["done"] = True
        status["ok"] = False
        status["exit_code"] = 128 + int(signum)
        status["state"] = "failed"
        status["current_step"] = str(status.get("current_step") or "unknown")
        status.setdefault("failure_reason_codes", [])
        for code in [
            "RUNNER_TERMINATED_BY_SIGNAL",
            f"RUNNER_SIGNAL_{int(signum)}",
        ]:
            if code not in status["failure_reason_codes"]:
                status["failure_reason_codes"].append(code)
        msg = f"RUNNER_TERMINATED_BY_SIGNAL:{int(signum)} current_step={status['current_step']}"
        stderr_tail = list(status.get("stderr_tail") or [])
        if msg not in stderr_tail:
            stderr_tail = [*stderr_tail[-19:], msg]
        status["stderr_tail"] = stderr_tail
        proc = active_child.get("proc")
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
        _write_status(
            status_path,
            status,
            state_value="failed",
            current_step=str(status.get("current_step") or "unknown"),
            heartbeat_note=f"terminated_signal_{int(signum)}",
        )
        print("ok=False", flush=True)
        raise SystemExit(128 + int(signum))

    signal.signal(signal.SIGTERM, lambda signum, frame: _finalize_interrupted_run(signum))
    signal.signal(signal.SIGINT, lambda signum, frame: _finalize_interrupted_run(signum))

    phasea_report_path: Path | None = None
    phasea_stdout = ""
    phasea_stderr = ""
    phasea_elapsed = 0.0
    phasea_cmd: list[str] | None = None
    phasea_calibration_step: dict | None = None
    if args.run_phasea_backbone:
        if args.phasea_auto_thresholds_from_ledger and not args.phasea_auto_thresholds_path:
            cal_cmd = [
                py,
                str(phasea_calibrator),
                "--quant-root",
                str(quant_root),
                "--min-history",
                str(int(args.phasea_auto_thresholds_min_history)),
            ]
            t0_cal = time.time()
            cal_proc = subprocess.run(cal_cmd, cwd=REPO_ROOT, capture_output=True, text=True)
            cal_elapsed = round(time.time() - t0_cal, 3)
            phasea_calibration_step = {
                "name": "calibrate_daily_delta_thresholds_q1",
                "ok": cal_proc.returncode == 0,
                "exit_code": int(cal_proc.returncode),
                "elapsed_sec": cal_elapsed,
                "cmd": cal_cmd,
                "stdout_tail": (cal_proc.stdout or "").splitlines()[-20:],
                "stderr_tail": (cal_proc.stderr or "").splitlines()[-20:],
            }
        phasea_rc = 0
        phasea_cmd = [
            py,
            str(phasea_runner),
            "--quant-root",
            str(quant_root),
            "--include-types",
            args.phasea_include_types,
            "--feature-store-version",
            (args.phasea_feature_store_version or args.feature_store_version),
            "--redflags-failure-mode",
            str(args.redflags_failure_mode),
        ]
        if bool(v4_final_profile):
            phasea_cmd += ["--v4-final-profile"]
        if args.phasea_ingest_date:
            phasea_cmd += ["--ingest-date", args.phasea_ingest_date]
        if args.phasea_delta_job_name:
            phasea_cmd += ["--delta-job-name", args.phasea_delta_job_name]
        if args.phasea_feature_output_tag:
            phasea_cmd += ["--feature-output-tag", args.phasea_feature_output_tag]
        if args.phasea_real_delta_test_mode:
            phasea_cmd += [
                "--real-delta-test-mode",
                "--real-delta-min-emitted-rows",
                str(args.phasea_real_delta_min_emitted_rows),
                "--real-delta-limit-packs",
                str(args.phasea_real_delta_limit_packs),
                "--real-delta-max-emitted-rows",
                str(args.phasea_real_delta_max_emitted_rows),
            ]
        for flag_name, val in [
            ("--warn-min-delta-rows", args.phasea_warn_min_delta_rows),
            ("--warn-max-delta-rows", args.phasea_warn_max_delta_rows),
            ("--fail-min-delta-rows", args.phasea_fail_min_delta_rows),
            ("--fail-max-delta-rows", args.phasea_fail_max_delta_rows),
        ]:
            if int(val or 0) > 0:
                phasea_cmd += [flag_name, str(int(val))]
        if args.phasea_ops_ledger_path:
            phasea_cmd += ["--ops-ledger-path", args.phasea_ops_ledger_path]
        if args.phasea_auto_thresholds_from_ledger:
            phasea_cmd += ["--auto-thresholds-from-ledger"]
            phasea_cmd += ["--auto-thresholds-min-history", str(int(args.phasea_auto_thresholds_min_history))]
            if args.phasea_auto_thresholds_path:
                phasea_cmd += ["--auto-thresholds-path", args.phasea_auto_thresholds_path]
        if bool(args.phasea_production_mode):
            phasea_cmd += ["--production-mode"]
        if args.phasea_ops_ledger_disabled:
            phasea_cmd += ["--ops-ledger-disabled"]
        if bool(args.phasea_run_corp_actions_ingest):
            phasea_cmd += ["--run-corp-actions-ingest"]
        else:
            phasea_cmd += ["--skip-run-corp-actions-ingest"]
        if bool(args.phasea_run_registry_delistings_ingest):
            phasea_cmd += ["--run-registry-delistings-ingest"]
        else:
            phasea_cmd += ["--skip-run-registry-delistings-ingest"]
        phasea_cmd += [
            "--corp-actions-max-assets",
            str(int(args.phasea_corp_actions_max_assets)),
            "--corp-actions-max-calls",
            str(int(args.phasea_corp_actions_max_calls)),
            "--corp-actions-http-failure-mode",
            str(args.phasea_corp_actions_http_failure_mode),
            "--contract-raw-ingest-date-mode",
            str(args.phasea_contract_raw_ingest_date_mode),
            "--corp-actions-cap-hit-failure-mode",
            str(args.phasea_recon_corp_actions_cap_hit_failure_mode),
            "--corp-actions-raw-empty-fallback-failure-mode",
            str(args.phasea_recon_corp_actions_raw_empty_fallback_failure_mode),
        ]
        if str(args.phasea_corp_actions_from_date or "").strip():
            phasea_cmd += ["--corp-actions-from-date", str(args.phasea_corp_actions_from_date).strip()]
        _write_status(
            status_path,
            status,
            state_value="running",
            current_step="run_q1_daily_data_backbone_q1",
            heartbeat_note="phasea_start",
        )
        phasea_proc, phasea_elapsed, phasea_stdout, phasea_stderr = _run_subprocess_with_status_heartbeat(
            phasea_cmd,
            cwd=REPO_ROOT,
            status=status,
            status_path=status_path,
            current_step="run_q1_daily_data_backbone_q1",
            proc_holder=active_child,
        )
        phasea_kv: dict[str, str] = {}
        for line in phasea_stdout.splitlines():
            if "=" in line and not line.startswith("["):
                k, v = line.split("=", 1)
                if k and v:
                    phasea_kv[k.strip()] = v.strip()
        if "report" in phasea_kv:
            phasea_report_path = Path(phasea_kv["report"])
        phasea_rc = int(phasea_proc.returncode)
        if phasea_proc.returncode != 0:
            status["ok"] = False
            status["exit_code"] = int(phasea_proc.returncode)
            status["state"] = "failed"
            status["current_step"] = "run_q1_daily_data_backbone_q1"
            status["steps"] = [
                *([phasea_calibration_step] if phasea_calibration_step is not None else []),
                {
                    "name": "run_q1_daily_data_backbone_q1",
                    "ok": False,
                    "exit_code": phasea_rc,
                    "elapsed_sec": phasea_elapsed,
                    "cmd": phasea_cmd,
                    "stdout_tail": phasea_stdout.splitlines()[-20:],
                    "stderr_tail": phasea_stderr.splitlines()[-20:],
                },
            ]
            status["artifacts"]["phasea_backbone_run_report"] = str(phasea_report_path) if phasea_report_path else None
            status["stdout_tail"] = phasea_stdout.splitlines()[-20:]
            status["stderr_tail"] = phasea_stderr.splitlines()[-20:]
            if phasea_report_path and phasea_report_path.exists():
                status["hashes"] = {"phasea_backbone_run_report_hash": stable_hash_file(phasea_report_path)}
            _write_status(
                status_path,
                status,
                state_value="failed",
                current_step="run_q1_daily_data_backbone_q1",
                heartbeat_note="phasea_failed",
            )
            print("ok=False", flush=True)
            return int(phasea_proc.returncode)

    cmd = [
        py,
        str(orchestrator),
        "--quant-root",
        str(quant_root),
        "--snapshot-id",
        snapshot_id_effective,
        "--feature-store-version",
        args.feature_store_version,
        "--panel-output-tag",
        args.panel_output_tag,
        "--asset-classes",
        args.asset_classes,
        "--lookback-calendar-days",
        str(args.lookback_calendar_days),
        "--panel-calendar-days",
        str(args.panel_calendar_days),
        "--min-bars",
        str(args.min_bars),
        "--panel-max-assets",
        str(args.panel_max_assets),
        "--top-liquid-n",
        str(args.top_liquid_n),
        "--fold-count",
        str(args.fold_count),
        "--test-days",
        str(args.test_days),
        "--embargo-days",
        str(args.embargo_days),
        "--min-train-days",
        str(args.min_train_days),
        "--survivors-max",
        str(args.survivors_max),
        "--candidate-profile",
        str(args.candidate_profile),
    ]
    if args.asof_end_date:
        cmd.extend(["--asof-end-date", args.asof_end_date])

    _write_status(
        status_path,
        status,
        state_value="running",
        current_step="run_q1_panel_stage_a_pipeline",
        heartbeat_note="stagea_start",
    )
    proc, elapsed, orchestrator_stdout, orchestrator_stderr = _run_subprocess_with_status_heartbeat(
        cmd,
        cwd=REPO_ROOT,
        status=status,
        status_path=status_path,
        current_step="run_q1_panel_stage_a_pipeline",
        proc_holder=active_child,
    )

    # Parse orchestrator stdout for report path
    orch_report_path: Path | None = None
    for line in orchestrator_stdout.splitlines():
        if line.startswith("report="):
            orch_report_path = Path(line.split("=", 1)[1].strip())
    status["ok"] = proc.returncode == 0
    status["exit_code"] = int(proc.returncode)
    status["artifacts"]["orchestrator_run_report"] = str(orch_report_path) if orch_report_path else None
    status["stdout_tail"] = orchestrator_stdout.splitlines()[-20:]
    status["stderr_tail"] = orchestrator_stderr.splitlines()[-20:]
    if args.run_phasea_backbone:
        if phasea_calibration_step is not None:
            status["steps"].append(phasea_calibration_step)
        status["steps"].append(
            {
                "name": "run_q1_daily_data_backbone_q1",
                "ok": True,
                "exit_code": int(phasea_rc),
                "elapsed_sec": phasea_elapsed,
                "cmd": phasea_cmd,
                "stdout_tail": phasea_stdout.splitlines()[-20:],
                "stderr_tail": phasea_stderr.splitlines()[-20:],
            }
        )
        status["artifacts"]["phasea_backbone_run_report"] = str(phasea_report_path) if phasea_report_path else None
        _write_status(
            status_path,
            status,
            state_value="running",
            current_step="run_q1_panel_stage_a_pipeline",
            heartbeat_note="phasea_completed",
        )
    status["steps"].append(
        {
            "name": "run_q1_panel_stage_a_pipeline",
            "ok": proc.returncode == 0,
            "exit_code": int(proc.returncode),
            "elapsed_sec": elapsed,
            "cmd": cmd,
            "stdout_tail": orchestrator_stdout.splitlines()[-20:],
            "stderr_tail": orchestrator_stderr.splitlines()[-20:],
        }
    )
    _write_status(
        status_path,
        status,
        state_value="running" if proc.returncode == 0 else "failed",
        current_step="run_q1_panel_stage_a_pipeline",
        heartbeat_note="stagea_completed",
    )
    if proc.returncode != 0:
        status.setdefault("failure_reason_codes", [])
        if "STAGE_A_PIPELINE_EXIT_NONZERO" not in status["failure_reason_codes"]:
            status["failure_reason_codes"].append("STAGE_A_PIPELINE_EXIT_NONZERO")

    if orch_report_path and orch_report_path.exists():
        orch = read_json(orch_report_path)
        status["references"] = {
            "orchestrator_run_id": orch.get("run_id"),
            "panel_manifest": (orch.get("artifacts") or {}).get("panel_manifest"),
            "cheap_gate_report": (orch.get("artifacts") or {}).get("cheap_gate_report"),
            "folds_manifest": (orch.get("artifacts") or {}).get("folds_manifest"),
            "panel_counts": (orch.get("references") or {}).get("panel_counts"),
            "cheap_gate_counts": (orch.get("references") or {}).get("cheap_gate_counts"),
            "panel_part_glob_hint": (orch.get("references") or {}).get("panel_part_glob_hint"),
            "requested_asof_end_date": (orch.get("references") or {}).get("requested_asof_end_date"),
            "effective_asof_end_date": (orch.get("references") or {}).get("effective_asof_end_date"),
            "panel_max_asof_date": (orch.get("references") or {}).get("panel_max_asof_date"),
            "asof_end_was_clamped_to_panel_max": bool((orch.get("references") or {}).get("asof_end_was_clamped_to_panel_max")),
            "asof_end_clamp_reason": (orch.get("references") or {}).get("asof_end_clamp_reason"),
        }
        effective_asof_end_date = str(status["references"].get("effective_asof_end_date") or effective_asof_end_date)
        status["hashes"] = {
            "orchestrator_run_report_hash": stable_hash_file(orch_report_path),
        }
        if args.run_phasea_backbone and phasea_report_path and phasea_report_path.exists():
            status["hashes"]["phasea_backbone_run_report_hash"] = stable_hash_file(phasea_report_path)
            phasea = read_json(phasea_report_path)
            status["references"]["phasea"] = {
                "run_id": phasea.get("run_id"),
                "ok": phasea.get("ok"),
                "exit_code": phasea.get("exit_code"),
                "real_delta_test_mode": ((phasea.get("config") or {}).get("real_delta_test_mode")),
                "real_delta_min_emitted_rows": ((phasea.get("config") or {}).get("real_delta_min_emitted_rows")),
                "warnings": phasea.get("warnings") or [],
                "threshold_failures": phasea.get("threshold_failures") or [],
                "metrics_summary": phasea.get("metrics_summary") or {},
                "step_names": [str((s or {}).get("name")) for s in (phasea.get("steps") or [])],
                "phasea_references": phasea.get("references") or {},
                "source_freshness": phasea.get("source_freshness") or {},
            }
            if phasea.get("source_freshness"):
                status["environment"]["phasea_source_freshness"] = phasea.get("source_freshness")
        for key in ("panel_manifest", "cheap_gate_report", "folds_manifest"):
            ref_value = status["references"].get(key)
            if not ref_value:
                continue
            p = Path(str(ref_value))
            if p.exists() and p.is_file():
                status["hashes"][f"{key}_hash"] = stable_hash_file(p)
        _write_status(
            status_path,
            status,
            state_value="running" if proc.returncode == 0 else "failed",
            current_step="post_stagea_references",
            heartbeat_note="stagea_references_loaded",
        )
    elif args.run_phasea_backbone and phasea_report_path and phasea_report_path.exists():
        status["hashes"] = {
            "phasea_backbone_run_report_hash": stable_hash_file(phasea_report_path),
        }
    elif proc.returncode != 0:
        status.setdefault("failure_reason_codes", [])
        if "STAGE_A_ORCHESTRATOR_REPORT_MISSING" not in status["failure_reason_codes"]:
            status["failure_reason_codes"].append("STAGE_A_ORCHESTRATOR_REPORT_MISSING")

    # Optional Stage-B/Registry steps integrated into the same run status (preferred over shell-only post-steps).
    stage_a_run_id = None
    if (args.run_stageb_q1 or args.run_registry_q1) and (status.get("references") or {}).get("cheap_gate_report"):
        cheap_path = str((status.get("references") or {}).get("cheap_gate_report") or "")
        if "/runs/run_id=" in cheap_path:
            frag = cheap_path.split("/runs/run_id=", 1)[1]
            stage_a_run_id = frag.split("/", 1)[0]

    # Preserve the orchestrator-resolved effective as-of date. This may already
    # be clamped to the panel max date and must not be overwritten by the raw
    # requested date before Stage-B / portfolio / final-gate steps run.
    effective_asof_end_date = str(effective_asof_end_date or args.asof_end_date or "").strip()
    stage_b_run_id = None
    stage_b_report_path: Path | None = None
    reg_report_path: Path | None = None
    portfolio_report_path: Path | None = None
    red_report_path: Path | None = None
    final_gate_report_path: Path | None = None
    stagea_ok = bool(proc.returncode == 0)
    if not stagea_ok:
        status.setdefault("failure_reason_codes", [])
        if "STAGE_A_PIPELINE_FAILED" not in status["failure_reason_codes"]:
            status["failure_reason_codes"].append("STAGE_A_PIPELINE_FAILED")

    if args.run_stageb_q1:
        if not stagea_ok:
            status["steps"].append(
                {
                    "name": "run_stage_b_q1",
                    "ok": True,
                    "skipped": True,
                    "skip_reason": "upstream_stage_a_failed",
                    "exit_code": 0,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["STAGE_B_Q1_SKIPPED_UPSTREAM_STAGE_A_FAILED"],
                }
            )
        elif not stage_a_run_id:
            status["ok"] = False
            status["exit_code"] = 93
            status.setdefault("failure_reason_codes", [])
            if "STAGE_A_RUN_ID_MISSING" not in status["failure_reason_codes"]:
                status["failure_reason_codes"].append("STAGE_A_RUN_ID_MISSING")
            status["steps"].append(
                {
                    "name": "run_stage_b_q1",
                    "ok": False,
                    "exit_code": 93,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["STAGE_B_Q1_SKIPPED_MISSING_STAGE_A_RUN_ID"],
                }
            )
        else:
            stageb_cmd = [
                py, str(stageb_runner),
                "--quant-root", str(quant_root),
                "--stage-a-run-id", stage_a_run_id,
                "--strict-survivors-max", str(args.stageb_q1_strict_survivors_max),
                "--psr-strict-min", str(args.stageb_psr_strict_min),
                "--dsr-strict-min", str(args.stageb_dsr_strict_min),
                "--psr-cpcv-strict-min", str(args.stageb_psr_cpcv_strict_min),
                "--dsr-cpcv-strict-min", str(args.stageb_dsr_cpcv_strict_min),
                "--cpcv-light-p10-min", str(args.stageb_cpcv_light_p10_min),
                "--cpcv-light-p25-min", str(args.stageb_cpcv_light_p25_min),
                "--cpcv-light-p05-min", str(args.stageb_cpcv_light_p05_min),
                "--cpcv-light-es10-min", str(args.stageb_cpcv_light_es10_min),
                "--cpcv-light-min-combo-size", str(args.stageb_cpcv_light_min_combo_size),
                "--cpcv-light-min-test-gap-days", str(args.stageb_cpcv_light_min_test_gap_days),
                "--cpcv-light-min-embargo-gap-days", str(args.stageb_cpcv_light_min_embargo_gap_days),
                "--cpcv-light-min-effective-paths", str(args.stageb_cpcv_light_min_effective_paths),
                "--cpcv-light-min-effective-path-ratio", str(args.stageb_cpcv_light_min_effective_path_ratio),
                "--cpcv-light-min-paths-total", str(args.stageb_cpcv_light_min_paths_total),
                "--cpcv-light-requirement-mode", str(args.stageb_cpcv_light_requirement_mode),
                "--cpcv-light-relaxation-mode", str(args.stageb_cpcv_light_relaxation_mode),
                "--stageb-pass-mode", str(args.stageb_pass_mode),
                "--stageb-strict-gate-profile", str(args.stageb_strict_gate_profile),
                "--stageb-strict-quality-gate-mode", str(args.stageb_strict_quality_gate_mode),
                "--prep-strict-intersection-mode", str(args.stageb_prep_strict_intersection_mode),
                "--stageb-input-scope", str(args.stageb_input_scope),
                "--min-survivors-b-q1", str(args.stageb_min_survivors_b_q1),
                "--survivors-b-q1-failure-mode", str(args.stageb_survivors_b_q1_failure_mode),
            ]
            if bool(args.stageb_cpcv_light_skip_adjacent_folds):
                stageb_cmd += ["--cpcv-light-skip-adjacent-folds"]
            else:
                stageb_cmd += ["--skip-cpcv-light-skip-adjacent-folds"]
            if bool(args.stageb_cpcv_light_temporal_filter):
                stageb_cmd += ["--cpcv-light-temporal-filter"]
            else:
                stageb_cmd += ["--skip-cpcv-light-temporal-filter"]
            if int(args.stageb_dsr_trials_total) > 0:
                stageb_cmd += ["--dsr-trials-total", str(int(args.stageb_dsr_trials_total))]
            if bool(v4_final_profile):
                stageb_cmd += ["--v4-final-profile"]
            _write_status(
                status_path,
                status,
                state_value="running",
                current_step="run_stage_b_q1",
                heartbeat_note="stageb_start",
            )
            stageb_proc, stageb_elapsed, stageb_stdout, stageb_stderr = _run_subprocess_with_status_heartbeat(
                stageb_cmd,
                cwd=REPO_ROOT,
                status=status,
                status_path=status_path,
                current_step="run_stage_b_q1",
            )
            stageb_kv = {}
            for line in stageb_stdout.splitlines():
                if "=" in line and not line.startswith("["):
                    k, v = line.split("=", 1)
                    if k and v:
                        stageb_kv[k.strip()] = v.strip()
            stage_b_report_path = Path(stageb_kv["report"]) if stageb_kv.get("report") else None
            stage_b_run_id = stageb_kv.get("run_id")
            status["steps"].append(
                {
                    "name": "run_stage_b_q1",
                    "ok": stageb_proc.returncode == 0,
                    "exit_code": int(stageb_proc.returncode),
                    "elapsed_sec": stageb_elapsed,
                    "cmd": stageb_cmd,
                    "stdout_tail": stageb_stdout.splitlines()[-20:],
                    "stderr_tail": stageb_stderr.splitlines()[-20:],
                }
            )
            if stage_b_report_path and stage_b_report_path.exists():
                status["artifacts"]["stage_b_q1_run_report"] = str(stage_b_report_path)
                status.setdefault("hashes", {})["stage_b_q1_run_report_hash"] = stable_hash_file(stage_b_report_path)
                try:
                    sb = read_json(stage_b_report_path)
                    status.setdefault("references", {})["stage_b_q1"] = {
                        "run_id": sb.get("run_id"),
                        "ok": sb.get("ok"),
                        "counts": sb.get("counts") or {},
                        "stage_b_q1_final": sb.get("stage_b_q1_final") or {},
                        "artifacts": sb.get("artifacts") or {},
                    }
                    if not stage_b_run_id:
                        stage_b_run_id = str(sb.get("run_id") or "")
                except Exception:
                    pass
            if stageb_proc.returncode != 0:
                status["ok"] = False
                status["exit_code"] = int(stageb_proc.returncode)
            _write_status(
                status_path,
                status,
                state_value="running" if status.get("ok") is not False else "failed",
                current_step="run_stage_b_q1",
                heartbeat_note="stageb_completed",
            )

    if args.run_registry_q1:
        if not stage_b_run_id and stage_a_run_id:
            stage_b_run_id = f"q1stageb_{stage_a_run_id}"
        if not stagea_ok:
            status["steps"].append(
                {
                    "name": "run_registry_update_q1",
                    "ok": True,
                    "skipped": True,
                    "skip_reason": "upstream_stage_a_failed",
                    "exit_code": 0,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["REGISTRY_Q1_SKIPPED_UPSTREAM_STAGE_A_FAILED"],
                }
            )
        elif not status.get("ok", True):
            status["steps"].append(
                {
                    "name": "run_registry_update_q1",
                    "ok": True,
                    "skipped": True,
                    "skip_reason": "upstream_step_failed",
                    "exit_code": 0,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["REGISTRY_Q1_SKIPPED_UPSTREAM_STEP_FAILED"],
                }
            )
        elif not stage_b_run_id:
            status["ok"] = False
            status["exit_code"] = 94
            status.setdefault("failure_reason_codes", [])
            if "STAGE_B_RUN_ID_MISSING" not in status["failure_reason_codes"]:
                status["failure_reason_codes"].append("STAGE_B_RUN_ID_MISSING")
            status["steps"].append(
                {
                    "name": "run_registry_update_q1",
                    "ok": False,
                    "exit_code": 94,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["REGISTRY_Q1_SKIPPED_MISSING_STAGE_B_RUN_ID"],
                }
            )
        else:
            reg_cmd = [
                py, str(registry_runner),
                "--quant-root", str(quant_root),
                "--stage-b-run-id", stage_b_run_id,
                "--score-epsilon", str(args.registry_score_epsilon),
                "--demotion-shadow-score-gap", str(args.registry_demotion_shadow_score_gap),
                "--demotion-retire-score-gap", str(args.registry_demotion_retire_score_gap),
                "--stageb-pass-column", str(args.registry_stageb_pass_column),
                "--hard-demotion-gates-source", str(args.registry_hard_demotion_gates_source),
                "--live-slot-count", str(int(args.registry_live_slot_count)),
                "--shadow-slot-count", str(int(args.registry_shadow_slot_count)),
                "--retired-slot-count", str(int(args.registry_retired_slot_count)),
                "--max-live-per-family", str(int(args.registry_max_live_per_family)),
                "--max-shadow-per-family", str(int(args.registry_max_shadow_per_family)),
                "--max-retired-per-family", str(int(args.registry_max_retired_per_family)),
                "--slot-family-policy-mode", str(args.registry_slot_family_policy_mode),
            ]
            if bool(args.registry_freeze_on_zero_strict_pass):
                reg_cmd += ["--freeze-on-zero-strict-pass"]
            else:
                reg_cmd += ["--skip-freeze-on-zero-strict-pass"]
            if bool(args.registry_require_top_survivor_hard_gates_pass):
                reg_cmd += ["--require-top-survivor-hard-gates-pass"]
            else:
                reg_cmd += ["--skip-require-top-survivor-hard-gates-pass"]
            if bool(args.registry_include_default_slot_alias):
                reg_cmd += ["--include-default-slot-alias"]
            else:
                reg_cmd += ["--skip-include-default-slot-alias"]
            if bool(v4_final_profile):
                reg_cmd += ["--v4-final-profile"]
            _write_status(
                status_path,
                status,
                state_value="running",
                current_step="run_registry_update_q1",
                heartbeat_note="registry_start",
            )
            reg_proc, reg_elapsed, reg_stdout, reg_stderr = _run_subprocess_with_status_heartbeat(
                reg_cmd,
                cwd=REPO_ROOT,
                status=status,
                status_path=status_path,
                current_step="run_registry_update_q1",
                proc_holder=active_child,
            )
            reg_kv = {}
            for line in reg_stdout.splitlines():
                if "=" in line and not line.startswith("["):
                    k, v = line.split("=", 1)
                    if k and v:
                        reg_kv[k.strip()] = v.strip()
            reg_report_path = Path(reg_kv["report"]) if reg_kv.get("report") else None
            status["steps"].append(
                {
                    "name": "run_registry_update_q1",
                    "ok": reg_proc.returncode == 0,
                    "exit_code": int(reg_proc.returncode),
                    "elapsed_sec": reg_elapsed,
                    "cmd": reg_cmd,
                    "stdout_tail": reg_stdout.splitlines()[-20:],
                    "stderr_tail": reg_stderr.splitlines()[-20:],
                }
            )
            if reg_report_path and reg_report_path.exists():
                status["artifacts"]["q1_registry_update_report"] = str(reg_report_path)
                status.setdefault("hashes", {})["q1_registry_update_report_hash"] = stable_hash_file(reg_report_path)
                try:
                    rr = read_json(reg_report_path)
                    status.setdefault("references", {})["q1_registry"] = {
                        "ok": rr.get("ok"),
                        "stage_b_run_id": rr.get("stage_b_run_id"),
                        "decision": ((rr.get("decision") or {}).get("decision")),
                        "reason_codes": ((rr.get("decision") or {}).get("reason_codes") or []),
                        "counts": rr.get("counts") or {},
                        "artifacts": rr.get("artifacts") or {},
                    }
                except Exception:
                    pass
            if reg_proc.returncode != 0:
                status["ok"] = False
                status["exit_code"] = int(reg_proc.returncode)
            _write_status(
                status_path,
                status,
                state_value="running" if status.get("ok") is not False else "failed",
                current_step="run_registry_update_q1",
                heartbeat_note="registry_completed",
            )

    if args.run_portfolio_q1 and status.get("ok", True):
        portfolio_cmd = [
            py,
            str(portfolio_runner),
            "--quant-root",
            str(quant_root),
            "--feature-store-version",
            str(args.portfolio_feature_store_version or args.feature_store_version),
            "--asof-date",
            str(effective_asof_end_date or ""),
            "--asset-classes",
            str(args.asset_classes),
            "--part-glob",
            str(args.portfolio_part_glob),
            "--panel-output-tag",
            str(args.portfolio_panel_output_tag or args.panel_output_tag or ""),
            "--min-adv-dollar",
            str(float(args.portfolio_min_adv_dollar)),
            "--top-n-long",
            str(int(args.portfolio_top_n_long)),
            "--top-n-short",
            str(int(args.portfolio_top_n_short)),
            "--target-gross",
            str(float(args.portfolio_target_gross)),
            "--max-gross",
            str(float(args.portfolio_max_gross)),
            "--max-net",
            str(float(args.portfolio_max_net)),
            "--max-position-weight",
            str(float(args.portfolio_max_position_weight)),
            "--max-long-per-family",
            str(int(args.portfolio_max_long_per_family)),
            "--max-short-per-family",
            str(int(args.portfolio_max_short_per_family)),
            "--max-family-abs-exposure",
            str(float(args.portfolio_max_family_abs_exposure)),
            "--family-concentration-failure-mode",
            str(args.portfolio_family_concentration_failure_mode),
            "--min-rebalance-delta",
            str(float(args.portfolio_min_rebalance_delta)),
            "--no-rebalance-orders-failure-mode",
            str(args.portfolio_no_rebalance_orders_failure_mode),
            "--registry-slot-consistency-failure-mode",
            str(args.portfolio_registry_slot_consistency_failure_mode),
            "--failure-mode",
            str(args.portfolio_failure_mode),
            "--candidate-selection-mode",
            str(args.portfolio_candidate_selection_mode),
            "--registry-slot-blend",
            str(args.portfolio_registry_slot_blend),
            "--slot-blend-max-candidates",
            str(int(args.portfolio_slot_blend_max_candidates)),
            "--registry-state-multipliers",
            str(args.portfolio_registry_state_multipliers),
            "--slot-blend-min-effective-weight",
            str(float(args.portfolio_slot_blend_min_effective_weight)),
            "--slot-blend-live-like-states",
            str(args.portfolio_slot_blend_live_like_states),
        ]
        if bool(args.portfolio_slot_blend_require_live_like):
            portfolio_cmd += ["--slot-blend-require-live-like"]
        else:
            portfolio_cmd += ["--skip-slot-blend-require-live-like"]
        if stage_b_report_path and stage_b_report_path.exists():
            portfolio_cmd += ["--stage-b-report", str(stage_b_report_path)]
        if reg_report_path and reg_report_path.exists():
            portfolio_cmd += ["--registry-report", str(reg_report_path)]
        if bool(args.portfolio_allow_shorts):
            portfolio_cmd += ["--allow-shorts"]
        else:
            portfolio_cmd += ["--skip-allow-shorts"]
        if bool(args.portfolio_require_nonempty):
            portfolio_cmd += ["--require-nonempty"]
        else:
            portfolio_cmd += ["--skip-require-nonempty"]
        if bool(v4_final_profile):
            portfolio_cmd += ["--v4-final-profile"]

        _write_status(
            status_path,
            status,
            state_value="running",
            current_step="run_portfolio_risk_execution_q1",
            heartbeat_note="portfolio_start",
        )
        portfolio_proc, portfolio_elapsed, portfolio_stdout, portfolio_stderr = _run_subprocess_with_status_heartbeat(
            portfolio_cmd,
            cwd=REPO_ROOT,
            status=status,
            status_path=status_path,
            current_step="run_portfolio_risk_execution_q1",
            proc_holder=active_child,
        )
        portfolio_kv = {}
        for line in portfolio_stdout.splitlines():
            if "=" in line and not line.startswith("["):
                k, v = line.split("=", 1)
                if k and v:
                    portfolio_kv[k.strip()] = v.strip()
        portfolio_report_path = Path(portfolio_kv["report"]) if portfolio_kv.get("report") else None
        status["steps"].append(
            {
                "name": "run_portfolio_risk_execution_q1",
                "ok": portfolio_proc.returncode == 0,
                "exit_code": int(portfolio_proc.returncode),
                "elapsed_sec": portfolio_elapsed,
                "cmd": portfolio_cmd,
                "stdout_tail": portfolio_stdout.splitlines()[-20:],
                "stderr_tail": portfolio_stderr.splitlines()[-20:],
            }
        )
        if portfolio_report_path and portfolio_report_path.exists():
            status["artifacts"]["q1_portfolio_report"] = str(portfolio_report_path)
            status.setdefault("hashes", {})["q1_portfolio_report_hash"] = stable_hash_file(portfolio_report_path)
            try:
                pr = read_json(portfolio_report_path)
                status.setdefault("references", {})["q1_portfolio"] = {
                    "ok": bool(pr.get("ok")),
                    "candidate": pr.get("candidate") or {},
                    "counts": pr.get("counts") or {},
                    "risk": pr.get("risk") or {},
                    "gates": pr.get("gates") or {},
                    "artifacts": pr.get("artifacts") or {},
                }
            except Exception:
                pass
        if portfolio_proc.returncode != 0:
            if str(args.portfolio_failure_mode).lower() == "warn":
                status.setdefault("warnings", []).append("PORTFOLIO_Q1_WARN_ONLY_FAILURE")
                status.setdefault("references", {}).setdefault("q1_portfolio", {})["treated_as_warning"] = True
            else:
                status["ok"] = False
                status["exit_code"] = int(portfolio_proc.returncode)
        _write_status(
            status_path,
            status,
            state_value="running" if status.get("ok") is not False else "failed",
            current_step="run_portfolio_risk_execution_q1",
            heartbeat_note="portfolio_completed",
        )

    if args.run_redflags_q1 and status.get("ok", True):
        red_cmd = [
            py,
            str(redflags_runner),
            "--quant-root",
            str(quant_root),
            "--asof-date",
            str(effective_asof_end_date or ""),
        ]
        if phasea_report_path and phasea_report_path.exists():
            red_cmd += ["--phasea-report", str(phasea_report_path)]
        if orch_report_path and orch_report_path.exists():
            red_cmd += ["--stagea-report", str(orch_report_path)]
        if stage_b_report_path and stage_b_report_path.exists():
            red_cmd += ["--stageb-report", str(stage_b_report_path)]
        if reg_report_path and reg_report_path.exists():
            red_cmd += ["--registry-report", str(reg_report_path)]
        if portfolio_report_path and portfolio_report_path.exists():
            red_cmd += ["--portfolio-report", str(portfolio_report_path)]
        _write_status(
            status_path,
            status,
            state_value="running",
            current_step="run_redflag_invariants_q1",
            heartbeat_note="redflags_start",
        )
        red_proc, red_elapsed, red_stdout, red_stderr = _run_subprocess_with_status_heartbeat(
            red_cmd,
            cwd=REPO_ROOT,
            status=status,
            status_path=status_path,
            current_step="run_redflag_invariants_q1",
            proc_holder=active_child,
        )
        red_kv = {}
        for line in red_stdout.splitlines():
            if "=" in line and not line.startswith("["):
                k, v = line.split("=", 1)
                if k and v:
                    red_kv[k.strip()] = v.strip()
        red_report_path = Path(red_kv["report"]) if red_kv.get("report") else None
        status["steps"].append(
            {
                "name": "run_redflag_invariants_q1",
                "ok": red_proc.returncode == 0,
                "exit_code": int(red_proc.returncode),
                "elapsed_sec": red_elapsed,
                "cmd": red_cmd,
                "stdout_tail": red_stdout.splitlines()[-20:],
                "stderr_tail": red_stderr.splitlines()[-20:],
            }
        )
        if red_report_path and red_report_path.exists():
            status["artifacts"]["q1_redflags_report"] = str(red_report_path)
            status.setdefault("hashes", {})["q1_redflags_report_hash"] = stable_hash_file(red_report_path)
            try:
                red = read_json(red_report_path)
                status.setdefault("references", {})["q1_redflags"] = {
                    "kill_switch": bool(((red.get("summary") or {}).get("kill_switch"))),
                    "critical_total": int(((red.get("summary") or {}).get("critical_total") or 0)),
                    "warning_total": int(((red.get("summary") or {}).get("warning_total") or 0)),
                }
            except Exception:
                pass
        if red_proc.returncode != 0:
            if str(args.redflags_failure_mode).lower() == "warn":
                status.setdefault("warnings", []).append("REDFLAG_KILL_SWITCH_WARN_ONLY")
                status.setdefault("references", {}).setdefault("q1_redflags", {})["treated_as_warning"] = True
            else:
                status["ok"] = False
                status["exit_code"] = int(red_proc.returncode)
        _write_status(
            status_path,
            status,
            state_value="running" if status.get("ok") is not False else "failed",
            current_step="run_redflag_invariants_q1",
            heartbeat_note="redflags_completed",
        )

    if args.run_v4_final_gate_matrix:
        if not args.run_portfolio_q1:
            status["steps"].append(
                {
                    "name": "run_v4_final_gate_matrix_q1",
                    "ok": True,
                    "skipped": True,
                    "skip_reason": "portfolio_step_disabled",
                    "exit_code": 0,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["V4_FINAL_GATES_SKIPPED_PORTFOLIO_STEP_DISABLED"],
                }
            )
            status.setdefault("warnings", []).append("V4_FINAL_GATES_SKIPPED_PORTFOLIO_STEP_DISABLED")
        elif not stagea_ok:
            status["steps"].append(
                {
                    "name": "run_v4_final_gate_matrix_q1",
                    "ok": True,
                    "skipped": True,
                    "skip_reason": "upstream_stage_a_failed",
                    "exit_code": 0,
                    "elapsed_sec": 0.0,
                    "cmd": [],
                    "stderr_tail": ["V4_FINAL_GATES_SKIPPED_UPSTREAM_STAGE_A_FAILED"],
                }
            )
        else:
            v4_cmd = [
                py,
                str(final_gate_runner),
                "--quant-root",
                str(quant_root),
                "--failure-mode",
                str(args.v4_final_gate_failure_mode),
            ]
            if bool(args.run_phasea_backbone):
                v4_cmd += ["--require-phasea"]
            if phasea_report_path and phasea_report_path.exists():
                v4_cmd += ["--phasea-report", str(phasea_report_path)]
            if orch_report_path and orch_report_path.exists():
                v4_cmd += ["--stagea-report", str(orch_report_path)]
            if stage_b_report_path and stage_b_report_path.exists():
                v4_cmd += ["--stageb-report", str(stage_b_report_path)]
            if reg_report_path and reg_report_path.exists():
                v4_cmd += ["--registry-report", str(reg_report_path)]
            if portfolio_report_path and portfolio_report_path.exists():
                v4_cmd += ["--portfolio-report", str(portfolio_report_path)]
            if red_report_path and red_report_path.exists():
                v4_cmd += ["--redflags-report", str(red_report_path)]
            if bool(v4_final_profile):
                v4_cmd += [
                    "--require-strict-pass-positive",
                    "--require-provider-raw-clean",
                    "--require-redflags-clean",
                ]
            _write_status(
                status_path,
                status,
                state_value="running",
                current_step="run_v4_final_gate_matrix_q1",
                heartbeat_note="final_gates_start",
            )
            v4_proc, v4_elapsed, v4_stdout, v4_stderr = _run_subprocess_with_status_heartbeat(
                v4_cmd,
                cwd=REPO_ROOT,
                status=status,
                status_path=status_path,
                current_step="run_v4_final_gate_matrix_q1",
                proc_holder=active_child,
            )
            v4_kv = {}
            for line in v4_stdout.splitlines():
                if "=" in line and not line.startswith("["):
                    k, v = line.split("=", 1)
                    if k and v:
                        v4_kv[k.strip()] = v.strip()
            final_gate_report_path = Path(v4_kv["report"]) if v4_kv.get("report") else None
            status["steps"].append(
                {
                    "name": "run_v4_final_gate_matrix_q1",
                    "ok": v4_proc.returncode == 0,
                    "exit_code": int(v4_proc.returncode),
                    "elapsed_sec": v4_elapsed,
                    "cmd": v4_cmd,
                    "stdout_tail": v4_stdout.splitlines()[-20:],
                    "stderr_tail": v4_stderr.splitlines()[-20:],
                }
            )
            if final_gate_report_path and final_gate_report_path.exists():
                status["artifacts"]["q1_v4_final_gate_matrix_report"] = str(final_gate_report_path)
                status.setdefault("hashes", {})["q1_v4_final_gate_matrix_report_hash"] = stable_hash_file(final_gate_report_path)
                try:
                    v4r = read_json(final_gate_report_path)
                    status.setdefault("references", {})["q1_v4_final_gate_matrix"] = {
                        "ok": bool(v4r.get("ok")),
                        "counts": v4r.get("counts") or {},
                        "failed_checks": [
                            str((x or {}).get("name"))
                            for x in (v4r.get("checks") or [])
                            if not bool((x or {}).get("ok"))
                        ],
                    }
                except Exception:
                    pass
            if v4_proc.returncode != 0:
                if str(args.v4_final_gate_failure_mode).lower() == "warn":
                    status.setdefault("warnings", []).append("V4_FINAL_GATES_WARN_ONLY")
                    status.setdefault("references", {}).setdefault("q1_v4_final_gate_matrix", {})["treated_as_warning"] = True
                else:
                    status["ok"] = False
                    status["exit_code"] = int(v4_proc.returncode)
            _write_status(
                status_path,
                status,
                state_value="running" if status.get("ok") is not False else "failed",
                current_step="run_v4_final_gate_matrix_q1",
                heartbeat_note="final_gates_completed",
            )

    _write_status(
        status_path,
        status,
        state_value="completed" if bool(status["ok"]) else "failed",
        current_step="complete",
        heartbeat_note="run_complete",
    )
    if orch_report_path:
        print(f"orchestrator_report={orch_report_path}", flush=True)
    print(f"ok={status['ok']}", flush=True)
    return 0 if status["ok"] else int(status["exit_code"])


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
