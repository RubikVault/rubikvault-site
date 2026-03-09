#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--phasea-report", default="")
    p.add_argument("--stagea-report", default="")
    p.add_argument("--stageb-report", default="")
    p.add_argument("--registry-report", default="")
    p.add_argument("--portfolio-report", default="")
    p.add_argument("--redflags-report", default="")
    p.add_argument("--stageb-stability-report", default="")
    p.add_argument("--failure-mode", choices=["hard", "warn"], default="hard")
    p.add_argument("--require-phasea", action="store_true", default=False)
    p.add_argument("--skip-require-phasea", dest="require_phasea", action="store_false")
    p.add_argument("--require-stagea", action="store_true", default=True)
    p.add_argument("--skip-require-stagea", dest="require_stagea", action="store_false")
    p.add_argument("--require-strict-pass-positive", action="store_true", default=True)
    p.add_argument("--skip-require-strict-pass-positive", dest="require_strict_pass_positive", action="store_false")
    p.add_argument("--require-stageb-stability-ratio", action="store_true", default=False)
    p.add_argument(
        "--skip-require-stageb-stability-ratio",
        dest="require_stageb_stability_ratio",
        action="store_false",
    )
    p.add_argument("--stageb-strict-positive-ratio-min", type=float, default=0.15)
    p.add_argument("--require-provider-raw-clean", action="store_true", default=True)
    p.add_argument("--skip-require-provider-raw-clean", dest="require_provider_raw_clean", action="store_false")
    p.add_argument("--require-redflags-clean", action="store_true", default=True)
    p.add_argument("--skip-require-redflags-clean", dest="require_redflags_clean", action="store_false")
    p.add_argument("--require-portfolio-slot-consistency", action="store_true", default=True)
    p.add_argument(
        "--skip-require-portfolio-slot-consistency",
        dest="require_portfolio_slot_consistency",
        action="store_false",
    )
    p.add_argument(
        "--release-strict-profile",
        action="store_true",
        default=False,
        help="Preset for release-strict verification (hard failure mode and all critical requirements enforced).",
    )
    return p.parse_args(list(argv))


def _latest_report(quant_root: Path, pattern: str, filename: str) -> Path | None:
    runs_root = quant_root / "runs"
    cands = sorted(runs_root.glob(pattern), key=lambda p: p.stat().st_mtime_ns, reverse=True)
    if not cands:
        return None
    for cand in cands:
        p = cand / filename
        if p.exists():
            return p
    return None


def _latest_ops_report(quant_root: Path, pattern: str) -> Path | None:
    ops_root = quant_root / "ops"
    if not ops_root.exists():
        return None
    cands = sorted(ops_root.glob(pattern), key=lambda p: p.stat().st_mtime_ns)
    if not cands:
        return None
    return cands[-1] if cands[-1].exists() else None


def _resolve_report_path(quant_root: Path, provided: str, *, pattern: str, filename: str) -> Path | None:
    if str(provided).strip():
        p = Path(str(provided)).resolve()
        return p if p.exists() else None
    return _latest_report(quant_root, pattern, filename)


def _check_report_exists(name: str, path: Path | None, *, required: bool) -> dict[str, Any]:
    exists = bool(path and path.exists())
    ok = exists or (not bool(required))
    return {
        "name": name,
        "ok": ok,
        "reason": ("ok" if exists else "optional_missing") if ok else "missing",
        "required": bool(required),
        "report": str(path) if path else "",
    }


def _report_ok_generic(report: dict[str, Any], *, fallback_artifact_key: str = "") -> bool:
    if "ok" in report:
        return bool(report.get("ok"))
    steps = report.get("steps") or []
    if isinstance(steps, list) and steps:
        step_flags: list[bool] = []
        for s in steps:
            if not isinstance(s, dict) or "ok" not in s:
                continue
            step_flags.append(bool(s.get("ok")))
        if step_flags:
            return all(step_flags)
    if fallback_artifact_key:
        return bool((report.get("artifacts") or {}).get(fallback_artifact_key))
    return False


def _stagea_ok(report: dict[str, Any]) -> bool:
    if _report_ok_generic(report, fallback_artifact_key="cheap_gate_report"):
        return True
    counts = report.get("counts") or {}
    candidates_total = int(counts.get("candidates_total") or 0)
    folds_total = int(counts.get("folds_total") or 0)
    if candidates_total > 0 and folds_total > 0:
        return True
    artifacts = report.get("artifacts") or {}
    return bool(artifacts.get("candidates")) and bool(artifacts.get("fold_metrics"))


def _warning_union(*values: Any) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        if isinstance(v, list):
            seq = v
        elif v is None:
            seq = []
        else:
            seq = [v]
        for item in seq:
            s = str(item or "").strip()
            if not s or s in seen:
                continue
            seen.add(s)
            out.append(s)
    return out


def _contains_any(values: list[str], needles: list[str]) -> bool:
    up = [str(v).upper() for v in values]
    for v in up:
        for n in needles:
            if str(n).upper() in v:
                return True
    return False


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    if bool(args.release_strict_profile):
        args.failure_mode = "hard"
        args.require_phasea = True
        args.require_stagea = True
        args.require_strict_pass_positive = True
        args.require_stageb_stability_ratio = True
        args.require_provider_raw_clean = True
        args.require_redflags_clean = True
        args.require_portfolio_slot_consistency = True
    quant_root = Path(args.quant_root).resolve()

    phasea_path = _resolve_report_path(
        quant_root,
        str(args.phasea_report),
        pattern="run_id=q1backbone_*/",
        filename="q1_daily_data_backbone_run_report.json",
    )
    stagea_path = _resolve_report_path(
        quant_root,
        str(args.stagea_report),
        pattern="run_id=q1panel_daily_local_*/",
        filename="q1_panel_stagea_daily_run_status.json",
    )
    stageb_path = _resolve_report_path(
        quant_root,
        str(args.stageb_report),
        pattern="run_id=q1stageb_*/",
        filename="stage_b_q1_run_report.json",
    )
    registry_path = _resolve_report_path(
        quant_root,
        str(args.registry_report),
        pattern="run_id=q1registry_*/",
        filename="q1_registry_update_report.json",
    )
    portfolio_path = _resolve_report_path(
        quant_root,
        str(args.portfolio_report),
        pattern="run_id=q1portfolio_*/",
        filename="q1_portfolio_risk_execution_report.json",
    )
    redflags_path = _resolve_report_path(
        quant_root,
        str(args.redflags_report),
        pattern="run_id=q1redflags_*/",
        filename="q1_redflags_invariants_report.json",
    )
    if str(args.stageb_stability_report).strip():
        stageb_stability_path = Path(str(args.stageb_stability_report)).resolve()
        if not stageb_stability_path.exists():
            stageb_stability_path = None
    else:
        stageb_stability_path = quant_root / "ops" / "stage_b_stability" / "latest.json"
        if not stageb_stability_path.exists():
            stageb_stability_path = None
    # Redflags are persisted under ops/red_flags/<YYYY-MM-DD>.json in current runs.
    if redflags_path is None:
        redflags_path = _latest_ops_report(quant_root, "red_flags/*.json")

    checks: list[dict[str, Any]] = []
    checks.append(_check_report_exists("phasea_report_exists", phasea_path, required=bool(args.require_phasea)))
    checks.append(_check_report_exists("stagea_report_exists", stagea_path, required=bool(args.require_stagea)))
    checks.append(_check_report_exists("stageb_report_exists", stageb_path, required=True))
    checks.append(_check_report_exists("registry_report_exists", registry_path, required=True))
    checks.append(_check_report_exists("portfolio_report_exists", portfolio_path, required=True))
    checks.append(_check_report_exists("redflags_report_exists", redflags_path, required=True))
    checks.append(
        _check_report_exists(
            "stageb_stability_report_exists",
            stageb_stability_path,
            required=bool(args.require_stageb_stability_ratio),
        )
    )

    phasea = read_json(phasea_path) if phasea_path and phasea_path.exists() else {}
    stagea = read_json(stagea_path) if stagea_path and stagea_path.exists() else {}
    stageb = read_json(stageb_path) if stageb_path and stageb_path.exists() else {}
    registry = read_json(registry_path) if registry_path and registry_path.exists() else {}
    portfolio = read_json(portfolio_path) if portfolio_path and portfolio_path.exists() else {}
    redflags = read_json(redflags_path) if redflags_path and redflags_path.exists() else {}
    stageb_stability = read_json(stageb_stability_path) if stageb_stability_path and stageb_stability_path.exists() else {}

    checks.append(
        {
            "name": "phasea_ok",
            "ok": _report_ok_generic(phasea) if bool(args.require_phasea) else True,
            "reason": ("ok" if _report_ok_generic(phasea) else "phasea_not_ok") if bool(args.require_phasea) else "optional_phasea_not_required",
            "value": bool(_report_ok_generic(phasea)) if phasea else None,
            "required": bool(args.require_phasea),
        }
    )
    stagea_ok = _stagea_ok(stagea) if stagea else False
    checks.append(
        {
            "name": "stagea_ok",
            "ok": stagea_ok if bool(args.require_stagea) else True,
            "reason": (
                "ok"
                if stagea_ok
                else "stagea_not_ok"
            ) if bool(args.require_stagea) else "optional_stagea_not_required",
            "value": bool(stagea_ok) if stagea else None,
            "required": bool(args.require_stagea),
        }
    )

    strict_pass_total = int(
        ((stageb.get("counts") or {}).get("stage_b_light") or {}).get("stage_b_candidates_strict_pass_total") or 0
    )
    if strict_pass_total <= 0:
        strict_pass_total = int(((stageb.get("stage_b_q1_final") or {}).get("strict_pass_total") or 0))
    checks.append(
        {
            "name": "stageb_strict_pass_positive",
            "ok": (strict_pass_total > 0) if bool(args.require_strict_pass_positive) else True,
            "reason": "ok" if (strict_pass_total > 0 or not bool(args.require_strict_pass_positive)) else "strict_pass_total_zero",
            "value": strict_pass_total,
            "required": bool(args.require_strict_pass_positive),
        }
    )
    stageb_stability_summary = stageb_stability.get("summary") or {}
    strict_positive_ratio = float(
        stageb_stability_summary.get("strict_positive_ratio_all")
        or stageb_stability_summary.get("strict_positive_ratio")
        or stageb_stability.get("strict_positive_ratio")
        or 0.0
    )
    strict_positive_ratio_min = max(0.0, float(args.stageb_strict_positive_ratio_min))
    checks.append(
        {
            "name": "stageb_strict_positive_ratio_min",
            "ok": (strict_positive_ratio >= strict_positive_ratio_min) if bool(args.require_stageb_stability_ratio) else True,
            "reason": (
                "ok"
                if (strict_positive_ratio >= strict_positive_ratio_min or not bool(args.require_stageb_stability_ratio))
                else "strict_positive_ratio_below_min"
            ),
            "value": {
                "strict_positive_ratio": strict_positive_ratio,
                "required_min": strict_positive_ratio_min,
            },
            "required": bool(args.require_stageb_stability_ratio),
        }
    )

    checks.append(
        {
            "name": "registry_ok",
            "ok": bool(registry.get("ok")),
            "reason": "ok" if bool(registry.get("ok")) else "registry_not_ok",
            "value": bool(registry.get("ok")),
        }
    )

    portfolio_failures = list(((portfolio.get("gates") or {}).get("failures") or []))
    checks.append(
        {
            "name": "portfolio_ok",
            "ok": bool(portfolio.get("ok")) and len(portfolio_failures) == 0,
            "reason": "ok" if (bool(portfolio.get("ok")) and len(portfolio_failures) == 0) else "portfolio_not_ok_or_gate_failures",
            "value": {
                "ok": bool(portfolio.get("ok")),
                "failures_total": len(portfolio_failures),
            },
        }
    )
    slot_consistency = (((portfolio.get("governance") or {}).get("slot_consistency") or {}) if portfolio else {})
    slot_checked = bool(slot_consistency.get("checked"))
    slot_mismatches = list(slot_consistency.get("mismatches") or [])
    slot_missing = list(slot_consistency.get("missing_slots") or [])
    slot_ok = slot_checked and not slot_mismatches and not slot_missing
    checks.append(
        {
            "name": "portfolio_slot_consistency",
            "ok": slot_ok if bool(args.require_portfolio_slot_consistency) else True,
            "reason": (
                "ok"
                if (slot_ok or not bool(args.require_portfolio_slot_consistency))
                else "slot_consistency_mismatch_or_missing"
            ),
            "value": {
                "checked": slot_checked,
                "mismatches_total": int(len(slot_mismatches)),
                "missing_slots_total": int(len(slot_missing)),
            },
            "required": bool(args.require_portfolio_slot_consistency),
        }
    )

    portfolio_gov = (portfolio.get("governance") or {}) if portfolio else {}
    portfolio_registry = (portfolio_gov.get("registry") or {}) if isinstance(portfolio_gov, dict) else {}
    allocation_policy = (portfolio_gov.get("allocation_policy") or {}) if isinstance(portfolio_gov, dict) else {}
    alloc_mode = str(allocation_policy.get("mode") or "").strip()
    alloc_reasons = [str(x) for x in (allocation_policy.get("reasons") or [])]
    reg_state_after = str(portfolio_registry.get("state_after") or "").strip().lower()
    reg_freeze = bool(portfolio_registry.get("freeze_mode_active"))
    reg_strict_total = int(portfolio_registry.get("strict_pass_total") or 0)
    reg_hard_failed_total = len(list(portfolio_registry.get("current_live_hard_failed_gate_names") or []))
    expected_defensive = (
        reg_state_after == "live_hold"
        or reg_hard_failed_total > 0
        or (reg_freeze and reg_strict_total <= 0)
    )
    defensive_modes = {"defensive_live_hold", "defensive_shadow_fallback", "defensive_hard_gates"}
    policy_alignment_ok = (alloc_mode in defensive_modes) if expected_defensive else bool(alloc_mode)
    checks.append(
        {
            "name": "portfolio_registry_policy_alignment",
            "ok": policy_alignment_ok,
            "reason": (
                "ok"
                if policy_alignment_ok
                else (
                    "expected_defensive_policy_mode"
                    if expected_defensive
                    else "allocation_policy_mode_missing"
                )
            ),
            "value": {
                "expected_defensive": bool(expected_defensive),
                "registry_state_after": reg_state_after,
                "registry_freeze_mode_active": bool(reg_freeze),
                "registry_strict_pass_total": int(reg_strict_total),
                "registry_hard_failed_total": int(reg_hard_failed_total),
                "allocation_mode": alloc_mode,
                "allocation_reasons": alloc_reasons,
            },
        }
    )

    red_summary = redflags.get("summary") or {}
    kill_switch = bool(red_summary.get("kill_switch"))
    critical_total = int(red_summary.get("critical_total") or 0)
    checks.append(
        {
            "name": "redflags_clean",
            "ok": ((not kill_switch) and critical_total == 0) if bool(args.require_redflags_clean) else True,
            "reason": "ok" if (((not kill_switch) and critical_total == 0) or not bool(args.require_redflags_clean)) else "redflags_kill_or_critical",
            "value": {
                "kill_switch": kill_switch,
                "critical_total": critical_total,
            },
            "required": bool(args.require_redflags_clean),
        }
    )

    phasea_warnings = _warning_union(
        phasea.get("warnings") or [],
        (phasea.get("references") or {}).get("reconciliation_warnings") or [],
    )
    provider_raw_dirty = _contains_any(
        phasea_warnings,
        [
            "DERIVED_CAP_HIT",
            "RAW_EMPTY_FALLBACK",
            "CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW",
            "CONTRACT_DELISTINGS_NOT_PROVIDER_RAW",
        ],
    )
    checks.append(
        {
            "name": "provider_raw_clean",
            "ok": (not provider_raw_dirty) if bool(args.require_provider_raw_clean) else True,
            "reason": "ok" if ((not provider_raw_dirty) or not bool(args.require_provider_raw_clean)) else "provider_raw_warnings_present",
            "value": {
                "provider_raw_dirty": bool(provider_raw_dirty),
                "warnings_sample": phasea_warnings[:20],
            },
            "required": bool(args.require_provider_raw_clean),
        }
    )

    failed = [c for c in checks if not bool(c.get("ok"))]
    ok = len(failed) == 0
    exit_code = 0 if ok or str(args.failure_mode).lower() == "warn" else 73

    run_id = f"q1v4gates_{int(time.time())}"
    run_root = quant_root / "runs" / f"run_id={run_id}"
    run_root.mkdir(parents=True, exist_ok=True)
    report_path = run_root / "q1_v4_final_gate_matrix_report.json"

    report = {
        "schema": "quantlab_q1_v4_final_gate_matrix_report_v1",
        "generated_at": utc_now_iso(),
        "run_id": run_id,
        "ok": bool(ok),
        "exit_code": int(exit_code),
        "failure_mode": str(args.failure_mode),
        "requirements": {
            "require_phasea": bool(args.require_phasea),
            "require_stagea": bool(args.require_stagea),
            "require_strict_pass_positive": bool(args.require_strict_pass_positive),
            "require_stageb_stability_ratio": bool(args.require_stageb_stability_ratio),
            "stageb_strict_positive_ratio_min": strict_positive_ratio_min,
            "require_provider_raw_clean": bool(args.require_provider_raw_clean),
            "require_redflags_clean": bool(args.require_redflags_clean),
            "require_portfolio_slot_consistency": bool(args.require_portfolio_slot_consistency),
            "release_strict_profile": bool(args.release_strict_profile),
        },
        "checks": checks,
        "counts": {
            "checks_total": int(len(checks)),
            "checks_failed_total": int(len(failed)),
        },
        "artifacts": {
            "phasea_report": str(phasea_path) if phasea_path else "",
            "stagea_report": str(stagea_path) if stagea_path else "",
            "stageb_report": str(stageb_path) if stageb_path else "",
            "registry_report": str(registry_path) if registry_path else "",
            "portfolio_report": str(portfolio_path) if portfolio_path else "",
            "redflags_report": str(redflags_path) if redflags_path else "",
            "stageb_stability_report": str(stageb_stability_path) if stageb_stability_path else "",
            "report_json": str(report_path),
        },
        "hashes": {
            "phasea_report_hash": stable_hash_file(phasea_path) if phasea_path and phasea_path.exists() else "",
            "stagea_report_hash": stable_hash_file(stagea_path) if stagea_path and stagea_path.exists() else "",
            "stageb_report_hash": stable_hash_file(stageb_path) if stageb_path and stageb_path.exists() else "",
            "registry_report_hash": stable_hash_file(registry_path) if registry_path and registry_path.exists() else "",
            "portfolio_report_hash": stable_hash_file(portfolio_path) if portfolio_path and portfolio_path.exists() else "",
            "redflags_report_hash": stable_hash_file(redflags_path) if redflags_path and redflags_path.exists() else "",
            "stageb_stability_report_hash": stable_hash_file(stageb_stability_path) if stageb_stability_path and stageb_stability_path.exists() else "",
        },
    }
    atomic_write_json(report_path, report)

    print(f"run_id={run_id}")
    print(f"report={report_path}")
    print(f"ok={str(bool(ok)).lower()}")
    return int(exit_code)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
