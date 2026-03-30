#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, utc_now_iso


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--ledger-path", default="")
    p.add_argument("--output-path", default="")
    p.add_argument("--lookback-runs", type=int, default=120)
    p.add_argument("--min-history", type=int, default=10)
    return p.parse_args(list(argv))


def _tail_jsonl(path: Path, limit: int) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    if limit > 0 and len(rows) > limit:
        rows = rows[-limit:]
    return rows


def _quantile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    q = max(0.0, min(1.0, float(q)))
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    idx = int(round(q * (len(sorted_values) - 1)))
    idx = max(0, min(len(sorted_values) - 1, idx))
    return float(sorted_values[idx])


def _stats(values: list[int]) -> dict[str, Any]:
    vals = [float(v) for v in values if v is not None]
    vals.sort()
    n = len(vals)
    if n <= 0:
        return {"count": 0}
    p05 = _quantile(vals, 0.05)
    p10 = _quantile(vals, 0.10)
    p25 = _quantile(vals, 0.25)
    p50 = _quantile(vals, 0.50)
    p75 = _quantile(vals, 0.75)
    p90 = _quantile(vals, 0.90)
    p95 = _quantile(vals, 0.95)
    p99 = _quantile(vals, 0.99)
    mean = sum(vals) / n
    return {
        "count": n,
        "min": float(vals[0]),
        "max": float(vals[-1]),
        "mean": float(mean),
        "p05": p05,
        "p10": p10,
        "p25": p25,
        "p50": p50,
        "p75": p75,
        "p90": p90,
        "p95": p95,
        "p99": p99,
    }


def _recommended_thresholds(delta_stats: dict[str, Any], assets_stats: dict[str, Any]) -> dict[str, int]:
    if int(delta_stats.get("count") or 0) <= 0:
        return {
            "warn_min_delta_rows": 0,
            "warn_max_delta_rows": 0,
            "fail_min_delta_rows": 0,
            "fail_max_delta_rows": 0,
            "warn_min_assets_delta": 0,
            "fail_min_assets_delta": 0,
        }
    if float(delta_stats.get("p50") or 0.0) <= 0.0:
        warn_min_delta = 0
        fail_min_delta = 0
    else:
        warn_min_delta = max(1, int(math.floor(float(delta_stats.get("p10") or 0.0))))
        fail_min_delta = max(1, int(math.floor(float(delta_stats.get("p05") or 0.0))))
    warn_max_delta = int(math.ceil(max(float(delta_stats.get("p90") or 0.0), float(delta_stats.get("p75") or 0.0) * 1.5)))
    fail_max_delta = int(math.ceil(max(float(delta_stats.get("p95") or 0.0), float(delta_stats.get("p90") or 0.0) * 1.5)))

    warn_min_assets = 0
    fail_min_assets = 0
    if int(assets_stats.get("count") or 0) > 0:
        if float(assets_stats.get("p50") or 0.0) > 0.0:
            warn_min_assets = max(1, int(math.floor(float(assets_stats.get("p10") or 0.0))))
            fail_min_assets = max(1, int(math.floor(float(assets_stats.get("p05") or 0.0))))

    return {
        "warn_min_delta_rows": int(warn_min_delta),
        "warn_max_delta_rows": int(warn_max_delta),
        "fail_min_delta_rows": int(fail_min_delta),
        "fail_max_delta_rows": int(fail_max_delta),
        "warn_min_assets_delta": int(warn_min_assets),
        "fail_min_assets_delta": int(fail_min_assets),
    }


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    ledger_path = Path(args.ledger_path).resolve() if args.ledger_path else (quant_root / "ops" / "daily_backbone_metrics.ndjson")
    output_path = Path(args.output_path).resolve() if args.output_path else (quant_root / "ops" / "q1_daily_delta_thresholds_recommended.json")

    rows = _tail_jsonl(ledger_path, limit=max(1, int(args.lookback_runs)))
    delta_values: list[int] = []
    assets_values: list[int] = []
    for rec in rows:
        d = rec.get("delta") or {}
        try:
            delta_values.append(int(d.get("bars_rows_emitted_delta") or 0))
        except Exception:
            pass
        try:
            assets_values.append(int(d.get("assets_emitted_delta") or 0))
        except Exception:
            pass

    delta_stats = _stats(delta_values)
    assets_stats = _stats(assets_values)
    rec = _recommended_thresholds(delta_stats, assets_stats)

    ok = int(delta_stats.get("count") or 0) >= int(args.min_history)
    out = {
        "schema": "quantlab_q1_daily_delta_thresholds_recommended_v1",
        "generated_at": utc_now_iso(),
        "ok": bool(ok),
        "history": {
            "ledger_path": str(ledger_path),
            "runs_total": int(delta_stats.get("count") or 0),
            "lookback_runs": int(args.lookback_runs),
            "min_history_required": int(args.min_history),
        },
        "stats": {
            "delta_rows": delta_stats,
            "assets_delta": assets_stats,
        },
        "recommended": rec,
        "notes": [
            "Use as baseline thresholds for run_q1_daily_data_backbone_q1 auto-threshold mode.",
            "Thresholds are robust quantile-based and should be recalibrated periodically.",
        ],
    }
    atomic_write_json(output_path, out)

    print(f"ok={str(bool(ok)).lower()}")
    print(f"output={output_path}")
    print(f"runs_total={int(delta_stats.get('count') or 0)}")
    print("recommended_flags=" + " ".join([
        f"--warn-min-delta-rows {rec['warn_min_delta_rows']}",
        f"--warn-max-delta-rows {rec['warn_max_delta_rows']}",
        f"--fail-min-delta-rows {rec['fail_min_delta_rows']}",
        f"--fail-max-delta-rows {rec['fail_max_delta_rows']}",
    ]))
    return 0 if ok else 3


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
