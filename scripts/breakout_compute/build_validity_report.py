#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quant-root", default=os.environ.get("QUANT_ROOT", str(DEFAULT_QUANT_ROOT)))
    parser.add_argument("--public-root", default="public/data/breakout")
    parser.add_argument("--min-outcomes", type=int, default=100)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args(list(argv))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def summarize_outcomes(paths: list[str]) -> tuple[list[dict], int]:
    if not paths:
        return [], 0
    frame = pl.scan_parquet(paths).with_columns(
        [
            pl.col("target_hit").cast(pl.Float64, strict=False).alias("target_hit_num"),
            pl.col("stop_hit").cast(pl.Float64, strict=False).alias("stop_hit_num"),
            pl.col("time_stop").cast(pl.Float64, strict=False).alias("time_stop_num"),
            pl.col("gap_event").cast(pl.Float64, strict=False).alias("gap_event_num"),
        ]
    )
    summary = (
        frame.group_by("horizon")
        .agg(
            [
                pl.len().alias("outcomes"),
                pl.col("target_hit_num").mean().alias("target_hit_rate"),
                pl.col("stop_hit_num").mean().alias("stop_hit_rate"),
                pl.col("time_stop_num").mean().alias("time_stop_rate"),
                pl.col("gap_event_num").mean().alias("gap_event_rate"),
                pl.col("mfe_atr").mean().alias("avg_mfe_atr"),
                pl.col("mae_atr").mean().alias("avg_mae_atr"),
            ]
        )
        .sort("horizon")
        .collect()
    )
    rows = []
    total = 0
    for row in summary.to_dicts():
        outcomes = int(row.get("outcomes") or 0)
        total += outcomes
        rows.append(
            {
                "horizon": int(row.get("horizon") or 0),
                "outcomes": outcomes,
                "target_hit_rate": row.get("target_hit_rate"),
                "stop_hit_rate": row.get("stop_hit_rate"),
                "time_stop_rate": row.get("time_stop_rate"),
                "gap_event_rate": row.get("gap_event_rate"),
                "avg_mfe_atr": row.get("avg_mfe_atr"),
                "avg_mae_atr": row.get("avg_mae_atr"),
            }
        )
    return rows, total


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    public_root = Path(args.public_root).resolve()
    outcomes_root = quant_root / "breakout" / "outcomes"
    paths = sorted(str(path) for path in outcomes_root.glob("horizon=*/signal_date=*/outcomes.parquet"))
    summaries, total = summarize_outcomes(paths)
    status = "ok" if total >= args.min_outcomes else "insufficient_matured_outcomes"
    report = {
        "schema_version": "breakout_v12_validity_report_v1",
        "generated_at": utc_now_iso(),
        "status": status,
        "outcome_count": total,
        "min_outcomes": args.min_outcomes,
        "horizons": summaries,
        "legacy_vs_v12_deciles": {
            "status": "pending" if total < args.min_outcomes else "ready_for_research_join",
            "reason": "Requires promoted V12 signals joined to matured append-only outcomes.",
        },
        "append_only_outcomes": True,
        "signal_mutation": False,
    }
    out_path = public_root / "reports" / "validity" / "latest.json"
    write_json(out_path, report)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"BREAKOUT_V12_VALIDITY_REPORT status={status} outcomes={total} path={out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
