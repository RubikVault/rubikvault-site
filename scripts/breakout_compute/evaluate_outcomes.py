#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.breakout_compute.lib.breakout_math import first_touch_outcome  # noqa: E402
from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, latest_materialized_snapshot_dir, parse_iso_date, read_json, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input-manifest", required=True)
    p.add_argument("--signal-date", default="")
    p.add_argument("--signals-parquet", default="")
    p.add_argument("--replace", action="store_true")
    return p.parse_args(list(argv))


def stable_event_id(asset_id: str, signal_date: str, score_version: str) -> str:
    return hashlib.sha256(f"{asset_id}|{signal_date}|{score_version}".encode("utf-8")).hexdigest()[:32]


def _first_existing(cols: set[str], candidates: list[str]) -> str | None:
    for col in candidates:
        if col in cols:
            return col
    return None


def _expr(cols: set[str], candidates: list[str], alias: str, dtype: pl.DataType = pl.Utf8) -> pl.Expr:
    col = _first_existing(cols, candidates)
    if col:
        return pl.col(col).cast(dtype, strict=False).alias(alias)
    return pl.lit(None, dtype=dtype).alias(alias)


def normalize_signals(signals: pl.DataFrame, signal_date: str) -> pl.DataFrame:
    cols = set(signals.columns)
    if "asset_id" not in cols:
        raise SystemExit("FATAL: signals parquet missing asset_id")
    exprs: list[pl.Expr] = []
    if "event_id" not in cols:
        if "event_hash" in cols:
            exprs.append(pl.col("event_hash").cast(pl.Utf8).str.slice(0, 32).alias("event_id"))
        else:
            score_col = _first_existing(cols, ["score_version"])
            score_version = str(signals[score_col][0]) if score_col and signals.height else "breakout_scoring_v12_incremental_v1"
            exprs.append(
                pl.col("asset_id")
                .cast(pl.Utf8)
                .map_elements(lambda asset_id: stable_event_id(str(asset_id), signal_date, score_version), return_dtype=pl.Utf8)
                .alias("event_id")
            )
    if "close" not in cols:
        close_col = _first_existing(cols, ["close_raw", "close"])
        exprs.append((pl.col(close_col).cast(pl.Float64, strict=False) if close_col else pl.lit(None, dtype=pl.Float64)).alias("close"))
    if "atr14" not in cols:
        atr_col = _first_existing(cols, ["atr_14", "atr14"])
        exprs.append((pl.col(atr_col).cast(pl.Float64, strict=False) if atr_col else pl.lit(None, dtype=pl.Float64)).alias("atr14"))
    if exprs:
        signals = signals.with_columns(exprs)
    return signals


def _bars_root(manifest: dict[str, Any], quant_root: Path) -> Path:
    value = manifest.get("bars_dataset_root")
    if value:
        path = Path(str(value))
        if path.exists():
            return path
    snap_dir = latest_materialized_snapshot_dir(quant_root)
    snap_manifest = read_json(snap_dir / "snapshot_manifest.json")
    bars_value = (snap_manifest.get("artifacts") or {}).get("bars_dataset_root")
    if not bars_value:
        raise SystemExit("FATAL: bars_dataset_root missing for outcome evaluation")
    bars = Path(str(bars_value))
    if not bars.exists():
        local_bars = snap_dir / "bars"
        if local_bars.exists():
            return local_bars
        raise SystemExit(f"FATAL: bars dataset not found: {bars}")
    return bars


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    manifest = read_json(Path(args.input_manifest).resolve())
    configs = manifest.get("configs") or {}
    outcome_config = configs.get("outcomes") or {}
    quant_root = Path(str(manifest.get("quant_root") or DEFAULT_QUANT_ROOT)).resolve()
    signal_date = str(args.signal_date or manifest.get("as_of") or "")[:10]
    if not signal_date:
        raise SystemExit("FATAL: signal_date missing")
    signals_path = Path(args.signals_parquet or quant_root / "breakout" / "signals" / f"date={signal_date}" / "signals.parquet")
    if not signals_path.exists():
        raise SystemExit(f"FATAL: signals parquet missing: {signals_path}")

    signals = normalize_signals(pl.read_parquet(signals_path), signal_date)
    if signals.is_empty():
        print(json.dumps({"ok": True, "skipped": "empty_signals"}))
        return 0

    horizons = [int(x) for x in outcome_config.get("horizons", [10, 20])]
    max_horizon = max(horizons)
    signal_dt = parse_iso_date(signal_date)
    end_dt = signal_dt + timedelta(days=max_horizon * 3)
    bars_root = _bars_root(manifest, quant_root)
    scan = pl.scan_parquet(str(bars_root / "**" / "*.parquet"), hive_partitioning=True)
    cols = set(scan.collect_schema().names())
    asset_col = _first_existing(cols, ["asset_id", "canonical_id"])
    date_col = _first_existing(cols, ["date", "trading_date", "asof_date"])
    if not asset_col or not date_col:
        raise SystemExit("FATAL: bars parquet missing asset/date columns")

    asset_ids = signals["asset_id"].to_list()
    bars = (
        scan.with_columns(
            [
                pl.col(asset_col).cast(pl.Utf8).alias("asset_id"),
                pl.col(date_col).cast(pl.Utf8).str.strptime(pl.Date, strict=False).alias("date"),
                _expr(cols, ["open_raw", "open"], "open_raw", pl.Float64),
                _expr(cols, ["high_raw", "high"], "high_raw", pl.Float64),
                _expr(cols, ["low_raw", "low"], "low_raw", pl.Float64),
                _expr(cols, ["close_raw", "close", "adj_close"], "close_raw", pl.Float64),
            ]
        )
        .filter(pl.col("asset_id").is_in(asset_ids))
        .filter(pl.col("date") > pl.lit(signal_date).str.strptime(pl.Date))
        .filter(pl.col("date") <= pl.lit(end_dt.isoformat()).str.strptime(pl.Date))
        .select(["asset_id", "date", "open_raw", "high_raw", "low_raw", "close_raw"])
        .sort(["asset_id", "date"])
        .collect(engine="streaming")
    )
    bars_by_asset: dict[str, list[dict[str, Any]]] = {}
    for row in bars.to_dicts():
        bars_by_asset.setdefault(str(row["asset_id"]), []).append(row)

    output_rows: dict[int, list[dict[str, Any]]] = {h: [] for h in horizons}
    target_atr = float(outcome_config.get("target_atr") or 2.0)
    stop_atr = float(outcome_config.get("stop_atr") or 1.0)
    gap_cfg = outcome_config.get("gap_handling") or {}
    gap_threshold = float(gap_cfg.get("gap_event_threshold_atr") or 2.0)

    for signal in signals.to_dicts():
        asset_id = str(signal.get("asset_id") or "")
        forward = bars_by_asset.get(asset_id) or []
        entry = float((forward[0].get("open_raw") if forward else None) or signal.get("close") or 0.0)
        atr = float(signal.get("atr14") or 0.0)
        if atr <= 0 or entry <= 0:
            forward = []
            atr = max(atr, 1.0)
        for horizon in horizons:
            result = first_touch_outcome(
                forward,
                entry_price=entry,
                atr=atr,
                horizon=horizon,
                target_atr=target_atr,
                stop_atr=stop_atr,
                gap_event_threshold_atr=gap_threshold,
            )
            output_rows[horizon].append(
                {
                    "event_id": str(signal.get("event_id") or ""),
                    "signal_date": signal_date,
                    "horizon": int(horizon),
                    "entry_price": float(entry),
                    "target_price": float(entry + atr * target_atr),
                    "stop_price": float(entry - atr * stop_atr),
                    "first_touch": result["first_touch"],
                    "target_hit": bool(result["target_hit"]),
                    "stop_hit": bool(result["stop_hit"]),
                    "time_stop": bool(result["time_stop"]),
                    "mfe_atr": result["mfe_atr"],
                    "mae_atr": result["mae_atr"],
                    "gap_event": bool(result["gap_event"]),
                    "overlap_suppressed": False,
                    "benchmark_adjusted_return": None,
                }
            )

    written: list[str] = []
    for horizon, rows in output_rows.items():
        out_dir = quant_root / "breakout" / "outcomes" / f"horizon={horizon}d" / f"signal_date={signal_date}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "outcomes.parquet"
        if out_path.exists() and not args.replace:
            continue
        pl.DataFrame(rows).write_parquet(out_path)
        atomic_write_json(
            out_dir / "metadata.json",
            {
                "schema_version": "breakout_outcome_metadata_v1",
                "generated_at": utc_now_iso(),
                "signal_date": signal_date,
                "horizon": horizon,
                "rows": len(rows),
                "outcomes_parquet": str(out_path),
                "append_only": True,
            },
        )
        written.append(str(out_path))

    print(json.dumps({"ok": True, "written": written}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
