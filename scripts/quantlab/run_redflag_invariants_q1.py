#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, utc_now_iso


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--phasea-report", default="")
    p.add_argument("--stagea-report", default="")
    p.add_argument("--stageb-report", default="")
    p.add_argument("--registry-report", default="")
    p.add_argument("--portfolio-report", default="")
    p.add_argument("--asof-date", default="")
    return p.parse_args(list(argv))


def _read_json_if_exists(p: str) -> dict[str, Any] | None:
    if not p:
        return None
    path = Path(p)
    if not path.exists():
        return None
    try:
        return read_json(path)
    except Exception:
        return None


def _phasea_delta_noop(phasea: dict[str, Any] | None) -> bool:
    if not phasea:
        return False
    refs = phasea.get("references") or {}
    delta_status = _read_json_if_exists(str(refs.get("daily_delta_ingest.status") or ""))
    if delta_status:
        if str(delta_status.get("reason") or "") == "noop_no_changed_packs":
            return True
        recon = (delta_status.get("extra") or {}).get("reconciliation") or {}
        if bool(recon.get("noop_no_changed_packs")):
            return True
    return False


def _phasea_failed_recon_checks(phasea: dict[str, Any] | None) -> list[str]:
    if not phasea:
        return []
    refs = phasea.get("references") or {}
    recon = _read_json_if_exists(str(refs.get("reconciliation_checks.report") or ""))
    checks = (recon or {}).get("checks") or {}
    failed: list[str] = []
    if isinstance(checks, dict):
      for name, ok in checks.items():
        if ok is False:
          failed.append(str(name))
    return sorted(failed)


def _phasea_recon_report(phasea: dict[str, Any] | None) -> dict[str, Any] | None:
    if not phasea:
        return None
    refs = phasea.get("references") or {}
    return _read_json_if_exists(str(refs.get("reconciliation_checks.report") or ""))


def _latest_recon_report(quant_root: Path) -> dict[str, Any] | None:
    ptr = quant_root / "ops" / "q1_reconciliation" / "latest_success.json"
    if not ptr.exists():
        return None
    try:
        latest = read_json(ptr)
    except Exception:
        return None
    report_path = Path(str(latest.get("report_path") or ""))
    if not report_path.exists():
        return None
    try:
        return read_json(report_path)
    except Exception:
        return None


def _latest_run_report(quant_root: Path, glob_pattern: str) -> dict[str, Any] | None:
    runs_root = quant_root / "runs"
    if not runs_root.exists():
        return None
    matches = sorted(runs_root.glob(glob_pattern), key=lambda p: p.stat().st_mtime_ns)
    if not matches:
        return None
    try:
        return read_json(matches[-1])
    except Exception:
        return None


def _latest_snapshot_manifest(quant_root: Path) -> dict[str, Any] | None:
    snaps_root = quant_root / "data" / "snapshots"
    if not snaps_root.exists():
        return None
    snaps = [p for p in snaps_root.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=")]
    if not snaps:
        return None
    snaps.sort(key=lambda p: p.stat().st_mtime_ns)
    mp = snaps[-1] / "snapshot_manifest.json"
    if not mp.exists():
        return None
    try:
        return read_json(mp)
    except Exception:
        return None


def _flag(flags: list[dict[str, Any]], severity: str, code: str, detail: str, source: str) -> None:
    flags.append(
        {
            "severity": severity,
            "code": code,
            "detail": detail,
            "source": source,
        }
    )


def _resolve_asof_date(args: argparse.Namespace, stagea: dict[str, Any] | None, stageb: dict[str, Any] | None) -> str:
    if args.asof_date:
        return str(args.asof_date)[:10]
    for obj in [stagea, stageb]:
        if not obj:
            continue
        v = str(obj.get("asof_end_date") or obj.get("asof_date") or "")
        if v:
            return v[:10]
    return datetime.now(timezone.utc).date().isoformat()


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    phasea = _read_json_if_exists(args.phasea_report) or _latest_run_report(
        quant_root, "run_id=q1backbone_*/q1_daily_data_backbone_run_report.json"
    )
    stagea = _read_json_if_exists(args.stagea_report) or _latest_run_report(
        quant_root, "run_id=cheapgateA_tsplits_*/cheap_gate_stage_a_time_splits_q1_report.json"
    )
    stageb = _read_json_if_exists(args.stageb_report) or _latest_run_report(
        quant_root, "run_id=q1stageb_*/stage_b_q1_run_report.json"
    )
    registry = _read_json_if_exists(args.registry_report) or _latest_run_report(
        quant_root, "run_id=q1registry_*/q1_registry_update_report.json"
    )
    portfolio = _read_json_if_exists(args.portfolio_report) or _latest_run_report(
        quant_root, "run_id=q1portfolio_*/q1_portfolio_risk_execution_report.json"
    )

    flags: list[dict[str, Any]] = []

    if phasea is not None:
        ms = phasea.get("metrics_summary") or {}
        packs_failed = int(ms.get("packs_failed") or 0)
        recon_failed = int(ms.get("reconciliation_checks_failed_total") or 0)
        delta_noop = _phasea_delta_noop(phasea)
        failed_recon_checks = _phasea_failed_recon_checks(phasea)
        recon_report = _phasea_recon_report(phasea) or {}
        noop_only_recon = delta_noop and set(failed_recon_checks).issubset({
            "delta_rows_emitted_nonzero_when_expected",
            "delta_assets_emitted_nonzero_when_expected",
        })
        if packs_failed > 0:
            _flag(flags, "critical", "PHASEA_PACKS_FAILED", f"packs_failed={packs_failed}", "phasea")
        if recon_failed > 0:
            if noop_only_recon:
                _flag(
                    flags,
                    "warning",
                    "PHASEA_RECON_NOOP_ONLY",
                    f"failed_checks={failed_recon_checks}",
                    "phasea",
                )
            else:
                _flag(flags, "critical", "PHASEA_RECON_FAILED", f"reconciliation_checks_failed_total={recon_failed}", "phasea")
        drift = (ms.get("drift") or {})
        ratio = drift.get("delta_rows_ratio_vs_median")
        if ratio is not None:
            try:
                r = float(ratio)
                if r < 0.25:
                    _flag(flags, "warning", "PHASEA_DELTA_DRIFT_LOW", f"delta_rows_ratio_vs_median={r:.3f}", "phasea")
                if r > 4.0:
                    _flag(flags, "warning", "PHASEA_DELTA_DRIFT_HIGH", f"delta_rows_ratio_vs_median={r:.3f}", "phasea")
            except Exception:
                pass
        recon_checks = recon_report.get("checks") or {}
        if recon_checks:
            if recon_checks.get("tri_asof_matches_snapshot_asof") is False:
                _flag(flags, "critical", "DATA_TRUTH_TRI_ASOF_MISMATCH", "tri_asof_matches_snapshot_asof=false", "data_truth")
            if recon_checks.get("tri_snapshot_id_matches_snapshot_id") is False:
                _flag(flags, "critical", "DATA_TRUTH_TRI_SNAPSHOT_ID_MISMATCH", "tri_snapshot_id_matches_snapshot_id=false", "data_truth")
            if recon_checks.get("tri_selected_assets_consistent") is False:
                _flag(flags, "critical", "DATA_TRUTH_TRI_SELECTED_ASSETS_INCONSISTENT", "tri_selected_assets_consistent=false", "data_truth")
            if recon_checks.get("contract_snapshot_asset_ids_consistent") is False:
                _flag(flags, "critical", "DATA_TRUTH_CONTRACT_ASSET_COUNT_MISMATCH", "contract_snapshot_asset_ids_consistent=false", "data_truth")
            if recon_checks.get("contract_raw_source_dirs_present") is False:
                _flag(flags, "warning", "DATA_TRUTH_RAW_SOURCE_DIR_MISSING", "contract_raw_source_dirs_present=false", "data_truth")
            if recon_checks.get("contract_corp_actions_coverage_min_ok") is False:
                _flag(flags, "warning", "DATA_TRUTH_CORP_ACTIONS_COVERAGE_LOW", "contract_corp_actions_coverage_min_ok=false", "data_truth")
            if recon_checks.get("contract_corp_actions_raw_materialization_ratio_ok") is False:
                _flag(flags, "warning", "DATA_TRUTH_CORP_ACTIONS_RAW_MATERIALIZATION_DROP", "contract_corp_actions_raw_materialization_ratio_ok=false", "data_truth")
            if recon_checks.get("tri_rows_nonzero") is False:
                _flag(flags, "critical", "DATA_TRUTH_TRI_ROWS_EMPTY", "tri_rows_nonzero=false", "data_truth")
        for warning in [str(x) for x in (recon_report.get("warnings") or [])]:
            if warning.startswith("CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_COVERAGE_LOW:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_COVERAGE_LOW", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_PROVIDER_RAW_EMPTY:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_PROVIDER_RAW_EMPTY", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_NOT_PROVIDER_RAW:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_NOT_PROVIDER_RAW", warning, "data_truth")

    latest_recon = _latest_recon_report(quant_root)
    if latest_recon is not None:
        for warning in [str(x) for x in (latest_recon.get("warnings") or [])]:
            if warning.startswith("CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_DERIVED_CAP_NEAR_HIT", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_COVERAGE_LOW:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_COVERAGE_LOW", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_MATERIALIZATION_DROP_HIGH", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_RAW_PRESENT_FALLBACK_USED", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_PROVIDER_RAW_EMPTY:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_PROVIDER_RAW_EMPTY", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_RAW_MATERIALIZATION_DROP_HIGH", warning, "data_truth")
            elif warning.startswith("CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW:"):
                _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW", warning, "data_truth")
            elif warning.startswith("CONTRACT_DELISTINGS_NOT_PROVIDER_RAW:"):
                _flag(flags, "warning", "CONTRACT_DELISTINGS_NOT_PROVIDER_RAW", warning, "data_truth")

    if stagea is not None:
        cheap_counts = (stagea.get("references") or {}).get("cheap_gate_counts") or {}
        top_counts = stagea.get("counts") or {}
        survivors_a = int(
            cheap_counts.get("survivors_A_total")
            or top_counts.get("survivors_A_total")
            or top_counts.get("survivors_total")
            or 0
        )
        if survivors_a <= 0:
            _flag(flags, "critical", "STAGEA_SURVIVORS_EMPTY", "survivors_A_total=0", "stagea")

    if stageb is not None:
        counts = stageb.get("counts") or {}
        final = stageb.get("stage_b_q1_final") or {}
        stageb_light_counts = (counts.get("stage_b_light") or {})
        survivors_b = int(
            final.get("survivors_B_q1_total")
            or stageb_light_counts.get("survivors_B_light_total")
            or counts.get("stage_b_survivors_total")
            or 0
        )
        if survivors_b <= 0:
            _flag(flags, "critical", "STAGEB_SURVIVORS_EMPTY", "survivors_B_q1_total=0", "stageb")
        strict_pass_total = int(stageb_light_counts.get("stage_b_candidates_strict_pass_total") or 0)
        stageb_candidates_total = int(stageb_light_counts.get("stage_b_candidates_total") or 0)
        if stageb_candidates_total > 0 and strict_pass_total <= 0:
            _flag(
                flags,
                "critical",
                "STAGEB_STRICT_PASS_EMPTY",
                f"stage_b_candidates_strict_pass_total={strict_pass_total}/{stageb_candidates_total}",
                "stageb",
            )

    if registry is not None:
        dec = registry.get("decision") or {}
        reasons = [str(x) for x in (dec.get("reason_codes") or [])]
        demotion = registry.get("demotion_policy") or {}
        summary = dec.get("summary_metrics") or {}
        if "CURRENT_LIVE_CHAMPION_DEMOTED_TO_RETIRED" in reasons:
            _flag(flags, "warning", "REGISTRY_DEMOTION_RETIRED", "live champion demoted to retired", "registry")
        if "HARD_STAGE_B_GATE_FAILED" in reasons:
            _flag(flags, "warning", "REGISTRY_HARD_GATE_FAILURE", "hard Stage-B gate failure in decision reasons", "registry")
        if bool(demotion.get("freeze_mode_active")) and int(demotion.get("strict_pass_total") or 0) <= 0:
            _flag(
                flags,
                "warning",
                "REGISTRY_FREEZE_MODE_ACTIVE",
                f"strict_pass_total={int(demotion.get('strict_pass_total') or 0)}",
                "registry",
            )
        if str(summary.get("state_after") or "").lower() == "live_hold":
            _flag(flags, "warning", "REGISTRY_LIVE_HOLD_ACTIVE", "current champion is in live_hold state", "registry")
        hard_failed = [str(x) for x in (summary.get("current_live_hard_failed_gate_names") or [])]
        if hard_failed:
            _flag(
                flags,
                "warning",
                "REGISTRY_CURRENT_LIVE_HARD_GATES_FAILED",
                ",".join(sorted(hard_failed)),
                "registry",
            )

    if portfolio is not None:
        counts = portfolio.get("counts") or {}
        risk = portfolio.get("risk") or {}
        gates = portfolio.get("gates") or {}
        gov = portfolio.get("governance") or {}
        gov_stageb = gov.get("stage_b") or {}
        gov_registry = gov.get("registry") or {}
        alloc = gov.get("allocation_policy") or {}
        cand = portfolio.get("candidate") or {}
        positions_total = int(counts.get("positions_total") or 0)
        orders_total = int(counts.get("orders_total") or 0)
        rebalance_needed_but_no_orders = bool(counts.get("rebalance_needed_but_no_orders"))
        failures_total = int(gates.get("failures_total") or 0)
        gross = float(risk.get("gross_exposure") or 0.0)
        max_abs_weight = float(risk.get("max_abs_weight") or 0.0)
        limits = gates.get("limits") or {}
        max_gross = float(limits.get("max_gross") or 0.0)
        max_position_weight = float(limits.get("max_position_weight") or 0.0)
        if positions_total <= 0:
            _flag(flags, "critical", "PORTFOLIO_EMPTY", "positions_total=0", "portfolio")
        if failures_total > 0:
            _flag(flags, "critical", "PORTFOLIO_GATE_FAILURE", f"failures_total={failures_total}", "portfolio")
        if max_gross > 0 and gross > max_gross + 1e-9:
            _flag(flags, "critical", "PORTFOLIO_GROSS_EXCEEDS_MAX", f"{gross:.6f}>{max_gross:.6f}", "portfolio")
        if max_position_weight > 0 and max_abs_weight > max_position_weight + 1e-9:
            _flag(
                flags,
                "critical",
                "PORTFOLIO_POSITION_EXCEEDS_MAX",
                f"{max_abs_weight:.6f}>{max_position_weight:.6f}",
                "portfolio",
            )
        if orders_total <= 0 and rebalance_needed_but_no_orders:
            _flag(flags, "warning", "PORTFOLIO_NO_REBALANCE_ORDERS", "orders_total=0 with actionable rebalance delta", "portfolio")
        if str(cand.get("source") or "") == "stageb_survivor_top":
            if int(gov_stageb.get("strict_pass_total") or 0) <= 0:
                _flag(flags, "critical", "PORTFOLIO_STAGEB_SOURCE_STRICT_PASS_EMPTY", "stageb source with strict_pass_total=0", "portfolio")
            if int(gov_stageb.get("survivors_b_q1_total") or 0) <= 0:
                _flag(flags, "critical", "PORTFOLIO_STAGEB_SOURCE_SURVIVORS_EMPTY", "stageb source with survivors_b_q1_total=0", "portfolio")
        if str(cand.get("source") or "") in {"registry_champion", "registry_slot_blend"}:
            if bool(gov_registry.get("freeze_mode_active")):
                _flag(flags, "warning", "PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE", "portfolio driven by registry freeze/live-hold mode", "portfolio")
            if int(gov_registry.get("strict_pass_total") or 0) <= 0:
                _flag(flags, "warning", "PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY", "registry champion selected while strict_pass_total=0", "portfolio")
            if str(gov_registry.get("state_after") or "").lower() == "live_hold":
                _flag(flags, "warning", "PORTFOLIO_REGISTRY_LIVE_HOLD", "portfolio driven by live_hold champion", "portfolio")
            if str(alloc.get("mode") or "").startswith("defensive"):
                _flag(
                    flags,
                    "warning",
                    "PORTFOLIO_DEFENSIVE_ALLOCATION_POLICY",
                    f"mode={str(alloc.get('mode') or '')};target_gross_effective={alloc.get('target_gross_effective')}",
                    "portfolio",
                )

    inv_latest_path = quant_root / "ops" / "invalidation_latest.json"
    if inv_latest_path.exists():
        try:
            inv_latest = read_json(inv_latest_path)
            if str(inv_latest.get("severity") or "").lower() == "critical":
                if phasea is not None:
                    _flag(
                        flags,
                        "warning",
                        "INVALIDATION_CRITICAL_PHASEA_RECOMPUTED",
                        f"reason_codes={inv_latest.get('reason_codes') or []}",
                        "invalidation",
                    )
                else:
                    _flag(
                        flags,
                        "critical",
                        "INVALIDATION_CRITICAL",
                        f"reason_codes={inv_latest.get('reason_codes') or []}",
                        "invalidation",
                    )
        except Exception:
            pass

    snap_manifest = _latest_snapshot_manifest(quant_root)
    if snap_manifest is not None:
        contract_layers_manifest_path = str(((snap_manifest.get("artifacts") or {}).get("contract_layers_manifest") or ""))
        tri_layers_manifest_path = str(((snap_manifest.get("artifacts") or {}).get("tri_layers_manifest") or ""))
        if contract_layers_manifest_path:
            clp = Path(contract_layers_manifest_path)
            if clp.exists():
                try:
                    cl = read_json(clp)
                    corp_mode = str(((cl.get("corp_actions") or {}).get("source_mode") or ""))
                    delist_mode = str(((cl.get("delistings") or {}).get("source_mode") or ""))
                    if "placeholder" in corp_mode:
                        _flag(flags, "warning", "CONTRACT_CORP_ACTIONS_PLACEHOLDER", f"source_mode={corp_mode}", "data_truth")
                    if "placeholder" in delist_mode:
                        _flag(flags, "warning", "CONTRACT_DELISTINGS_PLACEHOLDER", f"source_mode={delist_mode}", "data_truth")
                    corp_rows = int(((cl.get("corp_actions") or {}).get("rows")) or 0)
                    max_derived = int(((cl.get("policy") or {}).get("max_derived_corp_events")) or 0)
                    if max_derived > 0 and corp_rows >= max_derived and corp_mode in {"derived_from_adjusted_close_factor", "preserved_existing_snapshot_layer"}:
                        _flag(
                            flags,
                            "warning",
                            "CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT",
                            f"rows={corp_rows};max={max_derived};source_mode={corp_mode}",
                            "data_truth",
                        )
                except Exception:
                    _flag(flags, "warning", "CONTRACT_LAYERS_MANIFEST_UNREADABLE", str(clp), "data_truth")
        if tri_layers_manifest_path:
            tlp = Path(tri_layers_manifest_path)
            if tlp.exists():
                try:
                    tri = read_json(tlp)
                    snap_id = str(snap_manifest.get("snapshot_id") or "")
                    snap_asof = str(snap_manifest.get("asof_date") or "")
                    tri_id = str(tri.get("snapshot_id") or "")
                    tri_asof = str(tri.get("asof_date") or "")
                    if snap_id and tri_id and snap_id != tri_id:
                        _flag(flags, "critical", "DATA_TRUTH_TRI_SNAPSHOT_ID_MISMATCH", f"{tri_id}!={snap_id}", "data_truth")
                    if snap_asof and tri_asof and snap_asof != tri_asof:
                        _flag(flags, "critical", "DATA_TRUTH_TRI_ASOF_MISMATCH", f"{tri_asof}!={snap_asof}", "data_truth")
                except Exception:
                    _flag(flags, "warning", "TRI_LAYERS_MANIFEST_UNREADABLE", str(tlp), "data_truth")

    deduped: list[dict[str, Any]] = []
    seen_flag_keys: set[tuple[str, str, str]] = set()
    for flag in flags:
        key = (str(flag.get("severity") or ""), str(flag.get("code") or ""), str(flag.get("source") or ""))
        if key in seen_flag_keys:
            continue
        seen_flag_keys.add(key)
        deduped.append(flag)
    flags = deduped

    critical_total = sum(1 for f in flags if f.get("severity") == "critical")
    warning_total = sum(1 for f in flags if f.get("severity") == "warning")
    kill_switch = bool(critical_total > 0)

    asof_date = _resolve_asof_date(args, stagea, stageb)
    out_dir = quant_root / "ops" / "red_flags"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{asof_date}.json"
    latest_path = out_dir / "latest.json"

    out = {
        "schema": "quantlab_q1_redflag_invariants_report_v1",
        "generated_at": utc_now_iso(),
        "asof_date": asof_date,
        "summary": {
            "critical_total": int(critical_total),
            "warning_total": int(warning_total),
            "kill_switch": bool(kill_switch),
        },
        "flags": flags,
        "inputs": {
            "phasea_report": str(args.phasea_report or ""),
            "stagea_report": str(args.stagea_report or ""),
            "stageb_report": str(args.stageb_report or ""),
            "registry_report": str(args.registry_report or ""),
            "portfolio_report": str(args.portfolio_report or ""),
        },
        "notes": [
            "Kill-switch is true when at least one critical invariant is violated.",
            "This report is designed for unattended nightly guardrails.",
        ],
    }
    atomic_write_json(out_path, out)
    atomic_write_json(latest_path, out)

    print(f"asof_date={asof_date}")
    print(f"kill_switch={str(kill_switch).lower()}")
    print(f"critical_total={critical_total}")
    print(f"warning_total={warning_total}")
    print(f"report={out_path}")
    return 0 if not kill_switch else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
