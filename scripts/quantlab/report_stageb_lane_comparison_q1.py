#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    read_json,
    stageb_report_metadata,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--asofs", default="2026-02-15,2026-02-16,2026-02-17")
    p.add_argument("--lane-specs", default="top3500=overnight_p90_top3500,top5000=overnight_p90_top5000")
    p.add_argument(
        "--profile-mode",
        choices=["any", "v4_final_preferred", "v4_final_only"],
        default="v4_final_only",
    )
    p.add_argument("--lookback-runs", type=int, default=0)
    p.add_argument("--baseline-lane", default="")
    p.add_argument("--output-json", default="")
    p.add_argument("--output-md", default="")
    p.add_argument("--print-summary", action="store_true")
    return p.parse_args(list(argv))


def _split_csv(text: str) -> list[str]:
    out: list[str] = []
    for part in str(text or "").split(","):
        value = part.strip()
        if value:
            out.append(value)
    return out


def _parse_lane_specs(spec: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for token in _split_csv(spec):
        if "=" not in token:
            raise SystemExit(f"FATAL: invalid lane spec (need name=pattern): {token}")
        name, pattern = token.split("=", 1)
        lane_name = str(name).strip()
        regex = str(pattern).strip()
        if not lane_name or not regex:
            raise SystemExit(f"FATAL: invalid lane spec (empty name/pattern): {token}")
        out.append({"name": lane_name, "pattern": regex, "regex": re.compile(regex)})
    if not out:
        raise SystemExit("FATAL: no lane specs provided")
    return out


def _selection_key(meta: dict[str, Any], *, profile_mode: str) -> tuple[Any, ...] | None:
    is_v4_final = bool(meta.get("v4_final_profile"))
    mode = str(profile_mode or "v4_final_only")
    if mode == "v4_final_only" and not is_v4_final:
        return None
    profile_pref = 1 if mode == "v4_final_preferred" and is_v4_final else 0
    return (
        profile_pref,
        str(meta.get("generated_at") or ""),
        int(meta.get("report_mtime_ns") or 0),
        str(meta.get("run_id") or ""),
    )


def _top_fail_reasons(light_report: dict[str, Any], top_n: int = 6) -> list[dict[str, Any]]:
    counts = light_report.get("fail_reason_counts") or {}
    rows: list[dict[str, Any]] = []
    for gate, count in sorted(counts.items(), key=lambda kv: (-int(kv[1]), str(kv[0]))):
        rows.append({"gate": str(gate), "count": int(count or 0)})
        if len(rows) >= top_n:
            break
    return rows


def _first_row_value(df: pl.DataFrame, key: str, default: Any) -> Any:
    if df.is_empty() or key not in df.columns:
        return default
    try:
        return df.get_column(key)[0]
    except Exception:
        return default


def _lane_entry(report: dict[str, Any], meta: dict[str, Any], report_path: Path) -> dict[str, Any]:
    light_report_path = Path(str(((report.get("artifacts") or {}).get("stage_b_light_report")) or "")).expanduser()
    light_report = read_json(light_report_path) if light_report_path.exists() else {}
    candidates_path = Path(str(((light_report.get("artifacts") or {}).get("stage_b_light_candidates")) or "")).expanduser()
    candidates_df = pl.read_parquet(candidates_path) if candidates_path.exists() else pl.DataFrame()
    counts = report.get("counts") or {}
    stageb_counts = counts.get("stage_b_light") or {}
    stageb_final = report.get("stage_b_q1_final") or {}
    strict_survivors = []
    if not candidates_df.is_empty() and "stage_b_q1_strict_pass" in candidates_df.columns:
        strict_survivors = (
            candidates_df
            .filter(pl.col("stage_b_q1_strict_pass"))
            .select(["candidate_id", "family"])
            .head(8)
            .to_dicts()
        )
    return {
        "run_id": str(meta.get("run_id") or ""),
        "report_path": str(report_path),
        "generated_at": str(meta.get("generated_at") or ""),
        "panel_output_tag": str(meta.get("panel_output_tag") or ""),
        "feature_store_version": str(meta.get("feature_store_version") or ""),
        "v4_final_profile": bool(meta.get("v4_final_profile")),
        "ok": bool(meta.get("ok")),
        "exit_code": int(meta.get("exit_code") or 0),
        "strict_pass_total": int(stageb_counts.get("stage_b_candidates_strict_pass_total") or 0),
        "survivors_B_q1_total": int(stageb_final.get("survivors_B_q1_total") or 0),
        "stage_a_survivors_A_total": int(stageb_counts.get("stage_a_survivors_A_total") or 0),
        "stage_b_candidates_total": int(stageb_counts.get("stage_b_candidates_total") or 0),
        "input_scope_effective": str((report.get("method") or {}).get("stageb_input_scope_effective") or ""),
        "cpcv_light": {
            "combo_policy": str((light_report.get("method") or {}).get("cpcv_light_combo_policy") or ""),
            "min_combo_size": int((light_report.get("method") or {}).get("cpcv_light_min_combo_size") or 0),
            "min_test_gap_days": int((light_report.get("method") or {}).get("cpcv_light_min_test_gap_days") or 0),
            "min_embargo_gap_days": int((light_report.get("method") or {}).get("cpcv_light_min_embargo_gap_days") or 0),
            "combos_considered_total": int(_first_row_value(candidates_df, "cpcv_light_combos_considered_total", 0)),
            "combos_effective_total": int(_first_row_value(candidates_df, "cpcv_light_combos_effective_total", 0)),
            "paths_total": int(_first_row_value(candidates_df, "cpcv_light_paths_total", 0)),
            "effective_paths_required": int(_first_row_value(candidates_df, "cpcv_light_effective_paths_required", 0)),
            "paths_total_required": int(_first_row_value(candidates_df, "cpcv_light_paths_total_required", 0)),
            "effective_path_ratio": float(_first_row_value(candidates_df, "cpcv_light_effective_path_ratio", 0.0) or 0.0),
            "effective_path_ratio_required": float(_first_row_value(candidates_df, "cpcv_light_effective_path_ratio_required", 0.0) or 0.0),
        },
        "top_fail_reasons": _top_fail_reasons(light_report),
        "near_pass_candidates": list((light_report.get("near_pass_candidates") or [])[:3]),
        "strict_survivors": strict_survivors,
    }


def _build_report(args: argparse.Namespace) -> dict[str, Any]:
    quant_root = Path(str(args.quant_root)).expanduser().resolve()
    asofs = _split_csv(args.asofs)
    lane_specs = _parse_lane_specs(args.lane_specs)
    baseline_lane = str(args.baseline_lane or lane_specs[0]["name"])
    runs_root = quant_root / "runs"
    report_paths = sorted(
        runs_root.glob("run_id=q1stageb_*/stage_b_q1_run_report.json"),
        key=lambda p: p.stat().st_mtime_ns,
    )
    if int(args.lookback_runs) > 0:
        report_paths = report_paths[-int(args.lookback_runs) :]

    selected: dict[tuple[str, str], dict[str, Any]] = {}
    for report_path in report_paths:
        try:
            report = read_json(report_path)
        except Exception:
            continue
        meta = stageb_report_metadata(report, report_path)
        asof_date = str(meta.get("asof_date") or "")
        if asof_date not in asofs:
            continue
        selection_key = _selection_key(meta, profile_mode=str(args.profile_mode))
        if selection_key is None:
            continue
        search_text = " ".join(
            [
                str(meta.get("panel_output_tag") or ""),
                str(meta.get("run_id") or ""),
                str(report_path),
            ]
        )
        for lane in lane_specs:
            if not lane["regex"].search(search_text):
                continue
            row = {
                "report": report,
                "meta": meta,
                "report_path": report_path,
                "_selection_key": selection_key,
            }
            key = (asof_date, str(lane["name"]))
            prev = selected.get(key)
            if prev is None or selection_key > tuple(prev.get("_selection_key") or ()):
                selected[key] = row

    asof_rows: list[dict[str, Any]] = []
    for asof_date in asofs:
        lanes_out: list[dict[str, Any]] = []
        lane_map: dict[str, dict[str, Any]] = {}
        for lane in lane_specs:
            key = (asof_date, str(lane["name"]))
            chosen = selected.get(key)
            if chosen is None:
                continue
            entry = _lane_entry(chosen["report"], chosen["meta"], chosen["report_path"])
            lane_map[str(lane["name"])] = entry
            lanes_out.append({"lane": str(lane["name"]), **entry})
        comparisons: list[dict[str, Any]] = []
        baseline = lane_map.get(baseline_lane)
        if baseline is not None:
            for lane_name, other in lane_map.items():
                if lane_name == baseline_lane:
                    continue
                comparisons.append(
                    {
                        "baseline_lane": baseline_lane,
                        "other_lane": lane_name,
                        "strict_pass_total_delta": int(other["strict_pass_total"]) - int(baseline["strict_pass_total"]),
                        "survivors_B_q1_total_delta": int(other["survivors_B_q1_total"]) - int(baseline["survivors_B_q1_total"]),
                        "stage_a_survivors_A_total_delta": int(other["stage_a_survivors_A_total"]) - int(baseline["stage_a_survivors_A_total"]),
                        "cpcv_effective_paths_delta": int((other["cpcv_light"] or {}).get("combos_effective_total") or 0)
                        - int((baseline["cpcv_light"] or {}).get("combos_effective_total") or 0),
                        "cpcv_paths_total_delta": int((other["cpcv_light"] or {}).get("paths_total") or 0)
                        - int((baseline["cpcv_light"] or {}).get("paths_total") or 0),
                        "top_near_pass_baseline": str(((baseline.get("near_pass_candidates") or [{}])[0]).get("candidate_id") or ""),
                        "top_near_pass_other": str(((other.get("near_pass_candidates") or [{}])[0]).get("candidate_id") or ""),
                    }
                )
        asof_rows.append(
            {
                "asof_date": asof_date,
                "lanes": lanes_out,
                "comparisons": comparisons,
                "missing_lanes": [lane["name"] for lane in lane_specs if lane["name"] not in lane_map],
            }
        )

    return {
        "schema": "quantlab_q1_stageb_lane_comparison_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "config": {
            "asofs": asofs,
            "lane_specs": [{k: v for k, v in lane.items() if k != "regex"} for lane in lane_specs],
            "profile_mode": str(args.profile_mode),
            "baseline_lane": baseline_lane,
            "lookback_runs": int(args.lookback_runs),
        },
        "asof_reports": asof_rows,
    }


def _build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Stage-B Lane Comparison",
        "",
        f"- Generated at: `{report['generated_at']}`",
        f"- Profile mode: `{report['config']['profile_mode']}`",
        f"- Baseline lane: `{report['config']['baseline_lane']}`",
        "",
    ]
    for asof in report.get("asof_reports") or []:
        lines.append(f"## {asof['asof_date']}")
        lines.append("")
        for lane in asof.get("lanes") or []:
            top_near = ((lane.get("near_pass_candidates") or [{}])[0]).get("candidate_id") or ""
            cpcv = lane.get("cpcv_light") or {}
            lines.append(
                f"- `{lane['lane']}` strict=`{lane['strict_pass_total']}` survivors_B=`{lane['survivors_B_q1_total']}` "
                f"survivors_A=`{lane['stage_a_survivors_A_total']}` "
                f"cpcv_effective=`{cpcv.get('combos_effective_total', 0)}`/{cpcv.get('combos_considered_total', 0)} "
                f"combo_size=`{cpcv.get('min_combo_size', 0)}` top_near=`{top_near}`"
            )
        for comp in asof.get("comparisons") or []:
            lines.append(
                f"- compare `{comp['other_lane']}` vs `{comp['baseline_lane']}`: "
                f"strict_delta=`{comp['strict_pass_total_delta']}` "
                f"survivors_B_delta=`{comp['survivors_B_q1_total_delta']}` "
                f"cpcv_effective_delta=`{comp['cpcv_effective_paths_delta']}` "
                f"top_near=`{comp['top_near_pass_baseline']}` -> `{comp['top_near_pass_other']}`"
            )
        missing = asof.get("missing_lanes") or []
        if missing:
            lines.append(f"- missing_lanes: `{', '.join(missing)}`")
        lines.append("")
    return "\n".join(lines)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(str(args.quant_root)).expanduser().resolve()
    report = _build_report(args)
    output_json = (
        Path(str(args.output_json)).expanduser().resolve()
        if str(args.output_json).strip()
        else quant_root / "ops" / "stage_b_diagnostics" / "lane_comparison_latest.json"
    )
    output_md = (
        Path(str(args.output_md)).expanduser().resolve()
        if str(args.output_md).strip()
        else quant_root / "ops" / "stage_b_diagnostics" / "lane_comparison_latest.md"
    )
    atomic_write_json(output_json, report)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_md.write_text(_build_markdown(report))
    if bool(args.print_summary):
        print(f"report={output_json}")
        for asof in report.get("asof_reports") or []:
            lane_parts = []
            for lane in asof.get("lanes") or []:
                cpcv = lane.get("cpcv_light") or {}
                lane_parts.append(
                    f"{lane['lane']}:strict={lane['strict_pass_total']}:cpcv_effective={cpcv.get('combos_effective_total', 0)}"
                )
            print(f"asof={asof['asof_date']} lanes={' | '.join(lane_parts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
