#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import atomic_write_json, read_json, utc_now_iso  # noqa: E402


TASK_RE = re.compile(r"^asof(?P<asof>\d{4}-\d{2}-\d{2})_p\d+_top(?P<top>\d+)$")


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--job-dir", required=True)
    p.add_argument("--output-json", default="")
    p.add_argument("--output-md", default="")
    p.add_argument("--print-summary", action="store_true", default=False)
    return p.parse_args(list(argv))


def _task_key(task: dict[str, Any]) -> tuple[str, int] | None:
    task_id = str(task.get("task_id") or "")
    match = TASK_RE.match(task_id)
    if not match:
        return None
    return match.group("asof"), int(match.group("top"))


def _task_status(task: dict[str, Any]) -> str:
    if int(task.get("rc") or 0) == 0 and str(task.get("status") or "") == "done":
        return "ok"
    if str(task.get("status") or "") == "failed" or int(task.get("rc") or 0) != 0:
        return "failed"
    return str(task.get("status") or "unknown")


def build_report(job_dir: Path) -> dict[str, Any]:
    state_path = job_dir / "state.json"
    state = read_json(state_path)
    grouped: dict[str, dict[int, dict[str, Any]]] = defaultdict(dict)
    top_success = defaultdict(lambda: {"ok": 0, "failed": 0, "other": 0})

    for task in state.get("tasks") or []:
        key = _task_key(task)
        if key is None:
            continue
        asof_date, top_liquid = key
        status = _task_status(task)
        grouped[asof_date][top_liquid] = {
            "status": status,
            "rc": int(task.get("rc") or 0),
            "failure_class": str(task.get("failure_class") or ""),
        }
        bucket = "ok" if status == "ok" else "failed" if status == "failed" else "other"
        top_success[top_liquid][bucket] += 1

    asof_rows: list[dict[str, Any]] = []
    sweet_spot_asofs: list[str] = []
    for asof_date in sorted(grouped.keys()):
        panel_map = grouped[asof_date]
        ok_top = sorted(top for top, row in panel_map.items() if row["status"] == "ok")
        failed_top = sorted(top for top, row in panel_map.items() if row["status"] == "failed")
        sweet_spot = bool(ok_top and failed_top)
        if sweet_spot:
            sweet_spot_asofs.append(asof_date)
        asof_rows.append(
            {
                "asof_date": asof_date,
                "by_top_liquid": {str(top): panel_map[top] for top in sorted(panel_map.keys())},
                "ok_top_liquid": ok_top,
                "failed_top_liquid": failed_top,
                "sweet_spot": sweet_spot,
            }
        )

    summary = {
        "asofs_total": int(len(asof_rows)),
        "sweet_spot_asofs_total": int(len(sweet_spot_asofs)),
        "sweet_spot_asofs": sweet_spot_asofs,
        "top_liquid_outcomes": {str(top): vals for top, vals in sorted(top_success.items())},
    }
    return {
        "schema": "quantlab_q1_panel_size_sensitivity_report_v1",
        "generated_at": utc_now_iso(),
        "job_dir": str(job_dir),
        "state_path": str(state_path),
        "summary": summary,
        "asof_rows": asof_rows,
    }


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Panel Size Sensitivity",
        "",
        f"- Generated at: `{report['generated_at']}`",
        f"- Job dir: `{report['job_dir']}`",
        f"- Sweet-spot asofs: `{', '.join(report['summary']['sweet_spot_asofs'])}`",
        "",
        "## Asofs",
        "",
    ]
    for row in report["asof_rows"]:
        lines.append(
            f"- {row['asof_date']}: ok=`{','.join(str(x) for x in row['ok_top_liquid']) or '-'}`, failed=`{','.join(str(x) for x in row['failed_top_liquid']) or '-'}`, sweet_spot=`{row['sweet_spot']}`"
        )
    lines.append("")
    return "\n".join(lines)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    job_dir = Path(str(args.job_dir)).expanduser().resolve()
    report = build_report(job_dir)
    output_json = (
        Path(str(args.output_json)).expanduser().resolve()
        if str(args.output_json).strip()
        else job_dir / "panel_size_sensitivity_report.json"
    )
    output_md = (
        Path(str(args.output_md)).expanduser().resolve()
        if str(args.output_md).strip()
        else job_dir / "panel_size_sensitivity_report.md"
    )
    atomic_write_json(output_json, report)
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_md.write_text(build_markdown(report))
    if bool(args.print_summary):
        print(f"report={output_json}")
        print(f"sweet_spot_asofs_total={report['summary']['sweet_spot_asofs_total']}")
        for row in report["asof_rows"]:
            print(
                f"asof={row['asof_date']} ok_top_liquid={','.join(str(x) for x in row['ok_top_liquid']) or '-'} "
                f"failed_top_liquid={','.join(str(x) for x in row['failed_top_liquid']) or '-'}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
