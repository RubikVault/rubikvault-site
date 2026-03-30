#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
import sys

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    read_json,
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
    p.add_argument("--max-candidates", type=int, default=3)
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


def _light_report_path(stageb_report_path: Path, report: dict[str, Any]) -> Path | None:
    artifacts = report.get("artifacts") or {}
    cand = Path(str(artifacts.get("stage_b_light_report") or ""))
    if cand.exists():
        return cand
    fallback = stageb_report_path.parent / "artifacts" / "stage_b_light_report.json"
    return fallback if fallback.exists() else None


def _top_fail_reasons(counts: dict[str, Any], top_n: int = 8) -> list[dict[str, Any]]:
    rows = []
    for gate, count in sorted((counts or {}).items(), key=lambda kv: (-int(kv[1]), str(kv[0]))):
        rows.append({"gate": str(gate), "count": int(count or 0)})
        if len(rows) >= top_n:
            break
    return rows


def _default_output_path(quant_root: Path, profile_mode: str) -> Path:
    if str(profile_mode) == "v4_final_only":
        return quant_root / "ops" / "stage_b_stability" / "zero_strict_near_pass_latest_v4_final.json"
    return quant_root / "ops" / "stage_b_stability" / "zero_strict_near_pass_latest.json"


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    selected = select_canonical_stageb_reports(
        quant_root,
        lookback_runs=int(args.lookback_runs),
        profile_mode=str(args.profile_mode),
    )
    asof_keys = sorted(selected.keys())
    if int(args.asof_lookback) > 0:
        asof_keys = asof_keys[-int(args.asof_lookback) :]

    zero_rows: list[dict[str, Any]] = []
    aggregate_fail_counts: dict[str, int] = {}
    max_candidates = max(1, int(args.max_candidates))
    for asof in asof_keys:
        selected_row = selected[asof]
        report_path = Path(str(selected_row.get("report_path") or "")).resolve()
        report = selected_row["report"]
        strict_total = _strict_pass_total(report)
        if strict_total != 0:
            continue
        light_report_path = _light_report_path(report_path, report)
        light_report = read_json(light_report_path) if light_report_path else {}
        fail_counts = light_report.get("fail_reason_counts") or {}
        for gate, count in fail_counts.items():
            aggregate_fail_counts[str(gate)] = aggregate_fail_counts.get(str(gate), 0) + int(count or 0)
        near_pass = list((light_report.get("near_pass_candidates") or [])[:max_candidates])
        zero_rows.append(
            {
                "asof_date": asof,
                "run_id": str(selected_row.get("run_id") or report_path.parent.name.split("=", 1)[-1]),
                "report_path": str(report_path),
                "light_report_path": str(light_report_path) if light_report_path else "",
                "ok": bool(selected_row.get("ok")),
                "exit_code": int(selected_row.get("exit_code") or 0),
                "v4_final_profile": bool(selected_row.get("v4_final_profile")),
                "feature_store_version": str(selected_row.get("feature_store_version") or ""),
                "panel_output_tag": str(selected_row.get("panel_output_tag") or ""),
                "strict_pass_total": strict_total,
                "survivors_B_q1_total": int(((report.get("stage_b_q1_final") or {}).get("survivors_B_q1_total") or 0)),
                "top_fail_reasons": _top_fail_reasons(fail_counts),
                "near_pass_candidates": near_pass,
            }
        )

    summary = {
        "asof_points_scanned_total": int(len(asof_keys)),
        "zero_strict_asof_total": int(len(zero_rows)),
        "zero_strict_with_near_pass_total": int(sum(1 for row in zero_rows if row.get("near_pass_candidates"))),
        "aggregate_top_fail_reasons": _top_fail_reasons(aggregate_fail_counts),
    }
    report_out = {
        "schema": "quantlab_q1_stageb_zero_strict_near_pass_report_v1",
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "config": {
            "lookback_runs": int(args.lookback_runs),
            "asof_lookback": int(args.asof_lookback),
            "profile_mode": str(args.profile_mode),
            "max_candidates": max_candidates,
        },
        "summary": summary,
        "zero_strict_asofs": zero_rows,
        "hashes": {
            "summary_hash": stable_hash_obj(summary),
        },
    }

    output_path = (
        Path(args.output_path).resolve()
        if str(args.output_path).strip()
        else _default_output_path(quant_root, str(args.profile_mode))
    )
    atomic_write_json(output_path, report_out)

    if bool(args.print_summary):
        print(f"report={output_path}")
        print(f"zero_strict_asof_total={summary['zero_strict_asof_total']}")
        print(f"zero_strict_with_near_pass_total={summary['zero_strict_with_near_pass_total']}")
        for row in zero_rows:
            first = (row.get("near_pass_candidates") or [{}])[0]
            print(
                "asof="
                + str(row.get("asof_date"))
                + f" strict_pass_total={row.get('strict_pass_total')} "
                + f"near_pass_top={first.get('candidate_id','')} "
                + f"strict_gap_total={first.get('strict_gap_total','')}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
