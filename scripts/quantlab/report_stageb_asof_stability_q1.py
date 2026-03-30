#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, Any

REPO_ROOT = Path(__file__).resolve().parents[2]
import sys

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    select_canonical_stageb_reports,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--lookback-runs", type=int, default=30)
    p.add_argument("--asof-lookback", type=int, default=10)
    p.add_argument(
        "--profile-mode",
        choices=["any", "v4_final_preferred", "v4_final_only"],
        default="v4_final_preferred",
    )
    p.add_argument("--output-path", default="")
    p.add_argument("--print-summary", action="store_true")
    return p.parse_args(list(argv))


def _strict_pass_total(report: dict[str, Any]) -> int:
    counts = (report.get("counts") or {}).get("stage_b_light") or {}
    strict = counts.get("stage_b_candidates_strict_pass_total")
    if strict is None:
        strict = (report.get("stage_b_q1_final") or {}).get("strict_pass_total")
    try:
        return int(strict or 0)
    except Exception:
        return 0


def _survivors_b_q1_total(report: dict[str, Any]) -> int:
    try:
        return int(((report.get("stage_b_q1_final") or {}).get("survivors_B_q1_total") or 0))
    except Exception:
        return 0


def _avg(values: list[int]) -> float | None:
    if not values:
        return None
    return round(sum(values) / float(len(values)), 4)


def _default_output_path(quant_root: Path, profile_mode: str) -> Path:
    if str(profile_mode) == "v4_final_only":
        return quant_root / "ops" / "stage_b_stability" / "latest_v4_final.json"
    return quant_root / "ops" / "stage_b_stability" / "latest.json"


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    rows: list[dict[str, Any]] = []
    selected = select_canonical_stageb_reports(
        quant_root,
        lookback_runs=int(args.lookback_runs),
        profile_mode=str(args.profile_mode),
    )
    for asof in sorted(selected.keys()):
        selected_row = selected[asof]
        report = selected_row["report"]
        row = {
            "report_path": str(selected_row.get("report_path") or ""),
            "run_id": str(selected_row.get("run_id") or ""),
            "generated_at": str(selected_row.get("generated_at") or ""),
            "stage_a_run_id": str(selected_row.get("stage_a_run_id") or ""),
            "asof_date": str(selected_row.get("asof_date") or ""),
            "ok": bool(selected_row.get("ok")),
            "exit_code": int(selected_row.get("exit_code") or 0),
            "v4_final_profile": bool(selected_row.get("v4_final_profile")),
            "feature_store_version": str(selected_row.get("feature_store_version") or ""),
            "panel_output_tag": str(selected_row.get("panel_output_tag") or ""),
            "requested_asof_end_date": str(selected_row.get("requested_asof_end_date") or ""),
            "effective_asof_end_date": str(selected_row.get("effective_asof_end_date") or ""),
            "stage_a_pipeline_run_id": str(selected_row.get("stage_a_pipeline_run_id") or ""),
            "strict_pass_total": _strict_pass_total(report),
            "survivors_B_q1_total": _survivors_b_q1_total(report),
            "input_scope_effective": str((report.get("method") or {}).get("stageb_input_scope_effective") or ""),
            "input_scope_widened": bool((report.get("method") or {}).get("stageb_input_scope_widened")),
        }
        rows.append(row)

    asof_rows = list(rows)
    if int(args.asof_lookback) > 0:
        asof_rows = asof_rows[-int(args.asof_lookback) :]
    run_ok_rows = [r for r in asof_rows if bool(r.get("ok"))]
    strict_values_all = [int(r.get("strict_pass_total") or 0) for r in asof_rows]
    survivors_values_all = [int(r.get("survivors_B_q1_total") or 0) for r in asof_rows]
    strict_values = [int(r.get("strict_pass_total") or 0) for r in run_ok_rows]
    survivors_values = [int(r.get("survivors_B_q1_total") or 0) for r in run_ok_rows]

    summary = {
        "runs_scanned_total": int(len(rows)),
        "asof_points_total": int(len(asof_rows)),
        "asof_points_ok_total": int(len(run_ok_rows)),
        "strict_positive_runs_total_all": int(sum(1 for v in strict_values_all if v > 0)),
        "strict_positive_ratio_all": (
            round(sum(1 for v in strict_values_all if v > 0) / float(len(asof_rows)), 4) if asof_rows else None
        ),
        "strict_positive_runs_total": int(sum(1 for v in strict_values if v > 0)),
        "strict_positive_ratio": (
            round(sum(1 for v in strict_values if v > 0) / float(len(run_ok_rows)), 4)
            if run_ok_rows
            else None
        ),
        "strict_pass_min_all": (min(strict_values_all) if strict_values_all else None),
        "strict_pass_max_all": (max(strict_values_all) if strict_values_all else None),
        "strict_pass_avg_all": _avg(strict_values_all),
        "strict_pass_min": (min(strict_values) if strict_values else None),
        "strict_pass_max": (max(strict_values) if strict_values else None),
        "strict_pass_avg": _avg(strict_values),
        "survivors_min_all": (min(survivors_values_all) if survivors_values_all else None),
        "survivors_max_all": (max(survivors_values_all) if survivors_values_all else None),
        "survivors_avg_all": _avg(survivors_values_all),
        "survivors_min": (min(survivors_values) if survivors_values else None),
        "survivors_max": (max(survivors_values) if survivors_values else None),
        "survivors_avg": _avg(survivors_values),
    }

    report = {
        "schema": "quantlab_q1_stageb_asof_stability_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "config": {
            "lookback_runs": int(args.lookback_runs),
            "asof_lookback": int(args.asof_lookback),
            "profile_mode": str(args.profile_mode),
        },
        "summary": summary,
        "asof_series": asof_rows,
        "hashes": {
            "summary_hash": stable_hash_obj(summary),
        },
    }

    output_path = (
        Path(args.output_path).resolve()
        if str(args.output_path).strip()
        else _default_output_path(quant_root, str(args.profile_mode))
    )
    atomic_write_json(output_path, report)

    if bool(args.print_summary):
        print(f"report={output_path}")
        print(f"asof_points_total={summary['asof_points_total']}")
        print(f"asof_points_ok_total={summary['asof_points_ok_total']}")
        print(f"strict_positive_runs_total_all={summary['strict_positive_runs_total_all']}")
        print(f"strict_positive_ratio_all={summary['strict_positive_ratio_all']}")
        print(f"strict_pass_min_all={summary['strict_pass_min_all']}")
        print(f"strict_pass_max_all={summary['strict_pass_max_all']}")
        print(f"strict_pass_avg_all={summary['strict_pass_avg_all']}")
        print(f"strict_positive_runs_total={summary['strict_positive_runs_total']}")
        print(f"strict_positive_ratio={summary['strict_positive_ratio']}")
        print(f"strict_pass_min={summary['strict_pass_min']}")
        print(f"strict_pass_max={summary['strict_pass_max']}")
        print(f"strict_pass_avg={summary['strict_pass_avg']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
