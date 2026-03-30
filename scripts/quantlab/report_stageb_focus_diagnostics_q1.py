#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, utc_now_iso  # noqa: E402
from scripts.quantlab.q1_common import select_canonical_stageb_reports  # noqa: E402


GATE_GROUPS: dict[str, list[str]] = {
    "psr_dsr_strict": [
        "g_psr_strict",
        "g_dsr_strict",
        "g_psr_cpcv_strict",
        "g_dsr_cpcv_strict",
        "g_psr_strict_any",
        "g_dsr_strict_any",
    ],
    "cpcv_light": [
        "g_cpcv_light_sharpe_min",
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
    ],
    "ic_quality": [
        "g_ic_mean",
        "g_ic_min",
        "g_ic_p10",
        "g_ic_es10",
        "g_ic_tail_any",
    ],
    "stress_lite": [
        "g_stress_lite_sharpe",
        "g_stress_lite_maxdd",
        "g_stress_lite_fail_share",
    ],
    "sharpe_core": [
        "g_sharpe_mean",
        "g_sharpe_min",
    ],
}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--target-asofs", default="2026-02-16,2026-02-17")
    p.add_argument("--reference-asofs", default="2026-02-20,2026-02-23")
    p.add_argument(
        "--profile-mode",
        choices=["any", "v4_final_preferred", "v4_final_only"],
        default="v4_final_preferred",
    )
    p.add_argument("--max-focus-candidates", type=int, default=8)
    p.add_argument("--output-json", default="")
    p.add_argument("--output-md", default="")
    p.add_argument("--print-summary", action="store_true", default=False)
    return p.parse_args(list(argv))


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _default_output_json(quant_root: Path, profile_mode: str) -> Path:
    if str(profile_mode) == "v4_final_only":
        return quant_root / "ops" / "stage_b_diagnostics" / "focus_latest_v4_final.json"
    return quant_root / "ops" / "stage_b_diagnostics" / "focus_latest.json"


def _default_output_md(quant_root: Path, profile_mode: str) -> Path:
    if str(profile_mode) == "v4_final_only":
        return quant_root / "ops" / "stage_b_diagnostics" / "focus_latest_v4_final.md"
    return quant_root / "ops" / "stage_b_diagnostics" / "focus_latest.md"


def _split_csv(text: str) -> list[str]:
    out: list[str] = []
    for part in str(text or "").split(","):
        value = part.strip()
        if value:
            out.append(value)
    return out


def _selected_stageb_row(
    selected_reports: dict[str, dict[str, Any]],
    asof_date: str,
) -> dict[str, Any] | None:
    row = selected_reports.get(asof_date)
    return row


def _stageb_light_report(selected_row: dict[str, Any]) -> dict[str, Any]:
    report = selected_row["report"]
    path = Path(str(((report.get("artifacts") or {}).get("stage_b_light_report")) or "")).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"missing stage_b_light_report for {selected_row.get('asof_date')}: {path}")
    return read_json(path)


def _stageb_candidates_df(light_report: dict[str, Any]) -> pl.DataFrame:
    path = Path(str(((light_report.get("artifacts") or {}).get("stage_b_light_candidates")) or "")).expanduser()
    if not path.exists():
        raise FileNotFoundError(f"missing stage_b_light_candidates: {path}")
    return pl.read_parquet(path)


def _family_summary(df: pl.DataFrame) -> list[dict[str, Any]]:
    return (
        df.group_by("family")
        .agg(
            pl.len().alias("candidates_total"),
            pl.col("stage_b_q1_strict_pass").cast(pl.Int64).sum().alias("strict_pass_total"),
            pl.col("psr_strict").mean().alias("psr_strict_mean"),
            pl.col("dsr_strict").mean().alias("dsr_strict_mean"),
            pl.col("psr_cpcv_strict").mean().alias("psr_cpcv_strict_mean"),
            pl.col("dsr_cpcv_strict").mean().alias("dsr_cpcv_strict_mean"),
            pl.col("cpcv_light_sharpe_min").mean().alias("cpcv_light_sharpe_min_mean"),
        )
        .sort(["strict_pass_total", "candidates_total", "family"], descending=[True, True, False])
        .to_dicts()
    )


def _bool_value(value: Any) -> bool:
    return bool(value)


def _float_value(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _candidate_failed_gates(row: dict[str, Any], gate_names: list[str]) -> list[str]:
    return [gate for gate in gate_names if not _bool_value(row.get(gate))]


def _would_pass_without_group(row: dict[str, Any], gate_names: list[str], group_gate_names: list[str]) -> bool:
    keep = [gate for gate in gate_names if gate not in set(group_gate_names)]
    return all(_bool_value(row.get(gate)) for gate in keep)


def _sensitivity_summary(df: pl.DataFrame, gate_names: list[str]) -> dict[str, Any]:
    rows = df.to_dicts()
    base_pass_total = int(sum(1 for row in rows if _bool_value(row.get("stage_b_q1_strict_pass"))))
    out: dict[str, Any] = {
        "strict_pass_total": base_pass_total,
        "pass_total_without_group": {},
        "additional_pass_total_without_group": {},
    }
    for group_name, group_gate_names in GATE_GROUPS.items():
        pass_total = sum(1 for row in rows if _would_pass_without_group(row, gate_names, group_gate_names))
        out["pass_total_without_group"][group_name] = int(pass_total)
        out["additional_pass_total_without_group"][group_name] = int(max(0, pass_total - base_pass_total))
    return out


def _pairwise_sensitivity_summary(df: pl.DataFrame, gate_names: list[str], limit: int = 5) -> list[dict[str, Any]]:
    rows = df.to_dicts()
    ranked: list[dict[str, Any]] = []
    for group_a, group_b in itertools.combinations(GATE_GROUPS.keys(), 2):
        drop = set(GATE_GROUPS[group_a]) | set(GATE_GROUPS[group_b])
        keep = [gate for gate in gate_names if gate not in drop]
        passed = [
            str(row.get("candidate_id") or "")
            for row in rows
            if all(_bool_value(row.get(gate)) for gate in keep)
        ]
        if not passed:
            continue
        ranked.append(
            {
                "groups": [group_a, group_b],
                "pass_total": int(len(passed)),
                "candidate_ids": passed[:8],
            }
        )
    ranked.sort(key=lambda row: (-int(row["pass_total"]), list(row["groups"])))
    return ranked[: max(1, int(limit))]


def _focus_candidate_ids(target_run_reports: list[dict[str, Any]], max_focus: int) -> list[str]:
    freq: Counter[str] = Counter()
    family_by_id: dict[str, str] = {}
    gap_totals: defaultdict[str, list[float]] = defaultdict(list)
    for report in target_run_reports:
        for row in report.get("near_pass_candidates") or []:
            cid = str(row.get("candidate_id") or "").strip()
            if not cid:
                continue
            freq[cid] += 1
            family_by_id[cid] = str(row.get("family") or "")
            gap_totals[cid].append(_float_value(row.get("strict_gap_total")))
    ranked = sorted(
        freq.keys(),
        key=lambda cid: (
            -int(freq[cid]),
            min(gap_totals.get(cid) or [999999.0]),
            sum(gap_totals.get(cid) or [999999.0]) / max(1, len(gap_totals.get(cid) or [])),
            family_by_id.get(cid, ""),
            cid,
        ),
    )
    return ranked[: max(1, int(max_focus))]


def _candidate_snapshot(row: dict[str, Any], gate_names: list[str]) -> dict[str, Any]:
    failed_gates = _candidate_failed_gates(row, gate_names)
    summary = {
        "candidate_id": str(row.get("candidate_id") or ""),
        "family": str(row.get("family") or ""),
        "stage_b_q1_strict_pass": _bool_value(row.get("stage_b_q1_strict_pass")),
        "failed_gates": failed_gates,
        "failed_gate_total": int(len(failed_gates)),
        "metrics": {
            "psr_strict": _float_value(row.get("psr_strict")),
            "dsr_strict": _float_value(row.get("dsr_strict")),
            "psr_cpcv_strict": _float_value(row.get("psr_cpcv_strict")),
            "dsr_cpcv_strict": _float_value(row.get("dsr_cpcv_strict")),
            "ic_5d_oos_min": _float_value(row.get("ic_5d_oos_min")),
            "ic_5d_oos_es10": _float_value(row.get("ic_5d_oos_es10")),
            "cpcv_light_sharpe_min": _float_value(row.get("cpcv_light_sharpe_min")),
            "cpcv_light_sharpe_p25": _float_value(row.get("cpcv_light_sharpe_p25")),
            "cpcv_light_sharpe_p10": _float_value(row.get("cpcv_light_sharpe_p10")),
            "cpcv_light_sharpe_p05": _float_value(row.get("cpcv_light_sharpe_p05")),
            "cpcv_light_sharpe_es10": _float_value(row.get("cpcv_light_sharpe_es10")),
            "cpcv_light_neg_sharpe_share": _float_value(row.get("cpcv_light_neg_sharpe_share")),
            "cpcv_light_combos_considered_total": _float_value(row.get("cpcv_light_combos_considered_total")),
            "cpcv_light_combos_effective_total": _float_value(row.get("cpcv_light_combos_effective_total")),
            "cpcv_light_effective_path_ratio": _float_value(row.get("cpcv_light_effective_path_ratio")),
        },
        "would_pass_without_group": {},
    }
    for group_name, group_gate_names in GATE_GROUPS.items():
        summary["would_pass_without_group"][group_name] = _would_pass_without_group(row, gate_names, group_gate_names)
    return summary


def _asof_signature(df: pl.DataFrame) -> str:
    cols = [
        "candidate_id",
        "family",
        "psr_strict",
        "dsr_strict",
        "psr_cpcv_strict",
        "dsr_cpcv_strict",
        "ic_5d_oos_min",
        "ic_5d_oos_es10",
        "cpcv_light_sharpe_min",
        "cpcv_light_neg_sharpe_share",
        "stage_b_q1_strict_pass",
    ]
    data = df.select(cols).sort("candidate_id").to_dicts()
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    quant_root = Path(str(args.quant_root)).expanduser().resolve()
    target_asofs = _split_csv(args.target_asofs)
    reference_asofs = _split_csv(args.reference_asofs)
    selected_reports = select_canonical_stageb_reports(
        quant_root,
        lookback_runs=0,
        profile_mode=str(args.profile_mode),
    )
    missing_target_asofs = [asof for asof in target_asofs if _selected_stageb_row(selected_reports, asof) is None]
    missing_reference_asofs = [asof for asof in reference_asofs if _selected_stageb_row(selected_reports, asof) is None]
    target_reports = [
        selected_row["report"]
        for asof in target_asofs
        for selected_row in [_selected_stageb_row(selected_reports, asof)]
        if selected_row is not None
    ]
    focus_candidate_ids = _focus_candidate_ids(target_reports, int(args.max_focus_candidates))

    target_signatures: dict[str, str] = {}
    per_asof: list[dict[str, Any]] = []
    for asof in [*target_asofs, *reference_asofs]:
        selected_row = _selected_stageb_row(selected_reports, asof)
        if selected_row is None:
            continue
        run_report = selected_row["report"]
        light_report = _stageb_light_report(selected_row)
        candidates_df = _stageb_candidates_df(light_report)
        gate_names = list((((light_report.get("gate_sets") or {}).get("strict_gate_names")) or []))
        by_candidate = {
            str(row.get("candidate_id") or ""): row
            for row in candidates_df.to_dicts()
            if str(row.get("candidate_id") or "")
        }
        family_summary = _family_summary(candidates_df)
        sensitivity = _sensitivity_summary(candidates_df, gate_names)
        pairwise_sensitivity = _pairwise_sensitivity_summary(candidates_df, gate_names)
        focus_snapshots: list[dict[str, Any]] = []
        for candidate_id in focus_candidate_ids:
            row = by_candidate.get(candidate_id)
            if row is None:
                continue
            focus_snapshots.append(_candidate_snapshot(row, gate_names))
        entry = {
            "asof_date": asof,
            "run_id": str(selected_row.get("run_id") or run_report.get("run_id") or ""),
            "report_path": str(selected_row.get("report_path") or ""),
            "target_group": "target" if asof in set(target_asofs) else "reference",
            "selection": {
                "profile_mode": str(args.profile_mode),
                "v4_final_profile": bool(selected_row.get("v4_final_profile")),
                "feature_store_version": str(selected_row.get("feature_store_version") or ""),
                "panel_output_tag": str(selected_row.get("panel_output_tag") or ""),
                "stage_a_pipeline_run_id": str(selected_row.get("stage_a_pipeline_run_id") or ""),
            },
            "counts": {
                "stage_a_survivors_A_total": int((((run_report.get("counts") or {}).get("stage_b_prep") or {}).get("stage_a_survivors_A_total") or 0)),
                "stage_b_candidates_total": int((((run_report.get("counts") or {}).get("stage_b_light") or {}).get("stage_b_candidates_total") or 0)),
                "stage_b_candidates_strict_pass_total": int((((run_report.get("counts") or {}).get("stage_b_light") or {}).get("stage_b_candidates_strict_pass_total") or 0)),
                "survivors_B_light_total": int((((run_report.get("counts") or {}).get("stage_b_light") or {}).get("survivors_B_light_total") or 0)),
                "folds_total": int((((run_report.get("counts") or {}).get("stage_b_light") or {}).get("folds_total") or 0)),
            },
            "pipeline_context": {
                key: (run_report.get("references") or {}).get(key)
                for key in [
                    "requested_asof_end_date",
                    "effective_asof_end_date",
                    "panel_max_asof_date",
                    "asof_end_was_clamped_to_panel_max",
                    "panel_output_tag",
                    "stage_a_pipeline_run_id",
                ]
            },
            "stage_b_light_fail_reason_counts": (((run_report.get("counts") or {}).get("stage_b_light_fail_reason_counts")) or {}),
            "family_summary": family_summary,
            "strict_gate_sensitivity": sensitivity,
            "pairwise_gate_sensitivity": pairwise_sensitivity,
            "focus_candidates": focus_snapshots,
            "top_strict_survivors": candidates_df.filter(pl.col("stage_b_q1_strict_pass"))
            .select(["candidate_id", "family", "psr_strict", "dsr_strict", "psr_cpcv_strict", "dsr_cpcv_strict", "cpcv_light_sharpe_min"])
            .sort("candidate_id")
            .head(12)
            .to_dicts(),
        }
        per_asof.append(entry)
        if asof in set(target_asofs):
            target_signatures[asof] = _asof_signature(candidates_df)

    same_targets = False
    if len(target_asofs) >= 2:
        first_sig = target_signatures.get(target_asofs[0], "")
        same_targets = bool(first_sig) and all(target_signatures.get(asof, "") == first_sig for asof in target_asofs[1:])

    candidate_recurring_summary: list[dict[str, Any]] = []
    for candidate_id in focus_candidate_ids:
        per_candidate_asofs: list[dict[str, Any]] = []
        family = ""
        for entry in per_asof:
            found = next((row for row in entry["focus_candidates"] if row.get("candidate_id") == candidate_id), None)
            if not found:
                continue
            family = str(found.get("family") or family)
            per_candidate_asofs.append(
                {
                    "asof_date": entry["asof_date"],
                    "target_group": entry["target_group"],
                    "stage_b_q1_strict_pass": bool(found.get("stage_b_q1_strict_pass")),
                    "failed_gate_total": int(found.get("failed_gate_total") or 0),
                    "failed_gates": list(found.get("failed_gates") or []),
                    "would_pass_without_group": found.get("would_pass_without_group") or {},
                    "metrics": found.get("metrics") or {},
                }
            )
        candidate_recurring_summary.append(
            {
                "candidate_id": candidate_id,
                "family": family,
                "asofs": per_candidate_asofs,
            }
        )

    report = {
        "schema": "quantlab_q1_stageb_focus_diagnostics_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "config": {
            "target_asofs": target_asofs,
            "reference_asofs": reference_asofs,
            "profile_mode": str(args.profile_mode),
            "max_focus_candidates": int(args.max_focus_candidates),
        },
        "summary": {
            "target_asofs_identical_signature": same_targets,
            "focus_candidate_ids": focus_candidate_ids,
            "focus_families": dict(Counter(str(item.get("family") or "") for item in candidate_recurring_summary if item.get("family"))),
            "missing_target_asofs": missing_target_asofs,
            "missing_reference_asofs": missing_reference_asofs,
        },
        "gate_groups": GATE_GROUPS,
        "asof_reports": per_asof,
        "candidate_recurring_summary": candidate_recurring_summary,
    }
    return report


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Stage-B Focus Diagnostics",
        "",
        f"- Generated at: `{report['generated_at']}`",
        f"- Target asofs: `{', '.join(report['config']['target_asofs'])}`",
        f"- Reference asofs: `{', '.join(report['config']['reference_asofs'])}`",
        f"- Target asofs identical signature: `{report['summary']['target_asofs_identical_signature']}`",
        f"- Focus candidates: `{', '.join(report['summary']['focus_candidate_ids'])}`",
        "",
        "## Asof Summary",
        "",
    ]
    for entry in report["asof_reports"]:
        counts = entry["counts"]
        sens = entry["strict_gate_sensitivity"]
        pair = (entry.get("pairwise_gate_sensitivity") or [{}])[0]
        lines.append(
            f"- {entry['asof_date']} ({entry['target_group']}): strict_pass_total=`{counts['stage_b_candidates_strict_pass_total']}`, survivors_A=`{counts['stage_a_survivors_A_total']}`, folds=`{counts['folds_total']}`"
        )
        lines.append(
            "  "
            + f"without_psr_dsr_strict=`{sens['pass_total_without_group']['psr_dsr_strict']}`, "
            + f"without_cpcv_light=`{sens['pass_total_without_group']['cpcv_light']}`, "
            + f"without_ic_quality=`{sens['pass_total_without_group']['ic_quality']}`"
        )
        if pair and pair.get("groups"):
            lines.append(
                "  "
                + f"best_two_group_relief=`{'+'.join(pair['groups'])}` "
                + f"pass_total=`{pair.get('pass_total', 0)}`"
            )
    lines += [
        "",
        "## Focus Candidates",
        "",
    ]
    for item in report["candidate_recurring_summary"]:
        lines.append(f"- {item['candidate_id']} ({item['family']})")
        for row in item["asofs"]:
            metrics = row["metrics"]
            lines.append(
                "  "
                + f"{row['asof_date']} {row['target_group']} strict=`{row['stage_b_q1_strict_pass']}` failed=`{row['failed_gate_total']}` "
                + f"psr=`{metrics.get('psr_strict', 0.0):.6f}` dsr=`{metrics.get('dsr_strict', 0.0):.6f}` "
                + f"psr_cpcv=`{metrics.get('psr_cpcv_strict', 0.0):.6f}` cpcv_min=`{metrics.get('cpcv_light_sharpe_min', 0.0):.6f}`"
            )
    lines.append("")
    return "\n".join(lines)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(str(args.quant_root)).expanduser().resolve()
    output_json = (
        Path(str(args.output_json)).expanduser().resolve()
        if str(args.output_json).strip()
        else _default_output_json(quant_root, str(args.profile_mode))
    )
    output_md = (
        Path(str(args.output_md)).expanduser().resolve()
        if str(args.output_md).strip()
        else _default_output_md(quant_root, str(args.profile_mode))
    )
    report = build_report(args)
    atomic_write_json(output_json, report)
    atomic_write_text(output_md, build_markdown(report))
    if bool(args.print_summary):
        print(f"report={output_json}")
        print(f"target_asofs_identical_signature={report['summary']['target_asofs_identical_signature']}")
        for entry in report["asof_reports"]:
            counts = entry["counts"]
            sens = entry["strict_gate_sensitivity"]
            print(
                f"asof={entry['asof_date']} strict_pass_total={counts['stage_b_candidates_strict_pass_total']} "
                f"without_psr_dsr_strict={sens['pass_total_without_group']['psr_dsr_strict']} "
                f"without_cpcv_light={sens['pass_total_without_group']['cpcv_light']} "
                f"without_ic_quality={sens['pass_total_without_group']['ic_quality']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
