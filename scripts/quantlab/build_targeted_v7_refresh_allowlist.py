#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import timedelta
from pathlib import Path
from typing import Iterable, Any

import pyarrow.parquet as pq

import sys

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, local_today_iso, parse_iso_date, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--output-path", required=True)
    p.add_argument("--report-path", default="")
    p.add_argument("--stock-top-n", type=int, default=5000)
    p.add_argument("--etf-top-n", type=int, default=1500)
    p.add_argument("--recent-lookback-calendar-days", type=int, default=28)
    p.add_argument("--stale-grace-calendar-days", type=int, default=3)
    p.add_argument("--min-adv-dollar", type=float, default=0.0)
    p.add_argument("--require-entry-eligible", action="store_true", default=True)
    p.add_argument("--skip-require-entry-eligible", dest="require_entry_eligible", action="store_false")
    p.add_argument("--from-date-floor", default="")
    return p.parse_args(list(argv))


def _latest_q1step1_snapshot_dir(quant_root: Path, requested_snapshot_id: str) -> Path:
    base = quant_root / "data" / "snapshots"
    if requested_snapshot_id:
        snap = base / f"snapshot_id={requested_snapshot_id}"
        if not snap.exists():
            raise FileNotFoundError(f"snapshot not found: {snap}")
        return snap
    candidates = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("snapshot_id=") and "_q1step1" in p.name]
    if not candidates:
        raise FileNotFoundError(f"no q1step1 snapshots found under {base}")
    candidates.sort(key=lambda p: p.name)
    return candidates[-1]


def _select_rows(
    rows: list[dict[str, Any]],
    *,
    asset_class: str,
    top_n: int,
    recent_floor_date: str,
    stale_before_date: str,
    min_adv_dollar: float,
    require_entry_eligible: bool,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for row in rows:
        if str(row.get("asset_class") or "").lower() != asset_class:
            continue
        if require_entry_eligible and not bool(row.get("is_entry_eligible")):
            continue
        adv = float(row.get("adv20_dollar") or 0.0)
        if adv < float(min_adv_dollar):
            continue
        trade_date = str(row.get("last_trade_date") or "").strip()[:10]
        if not trade_date:
            continue
        if trade_date < recent_floor_date:
            continue
        if trade_date >= stale_before_date:
            continue
        selected.append(
            {
                "asset_id": str(row.get("asset_id") or ""),
                "symbol": str(row.get("symbol") or ""),
                "exchange": str(row.get("exchange") or ""),
                "asset_class": asset_class,
                "last_trade_date": trade_date,
                "adv20_dollar": adv,
                "is_entry_eligible": bool(row.get("is_entry_eligible")),
            }
        )
    selected.sort(key=lambda r: (-float(r["adv20_dollar"]), str(r["last_trade_date"]), str(r["asset_id"])))
    return selected[: max(0, int(top_n))]


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    snap_dir = _latest_q1step1_snapshot_dir(quant_root, str(args.snapshot_id or "").strip())
    universe_path = snap_dir / "universe.parquet"
    if not universe_path.exists():
        raise SystemExit(f"FATAL: universe.parquet missing: {universe_path}")

    today = parse_iso_date(local_today_iso())
    recent_floor_date = str(args.from_date_floor or "").strip()
    if not recent_floor_date:
        recent_floor_date = (today - timedelta(days=max(0, int(args.recent_lookback_calendar_days)))).isoformat()
    stale_before_date = (today - timedelta(days=max(0, int(args.stale_grace_calendar_days)))).isoformat()

    table = pq.read_table(
        universe_path,
        columns=["asset_id", "asset_class", "symbol", "exchange", "last_trade_date", "adv20_dollar", "is_entry_eligible"],
    )
    rows = table.to_pylist()

    stock_rows = _select_rows(
        rows,
        asset_class="stock",
        top_n=int(args.stock_top_n),
        recent_floor_date=recent_floor_date,
        stale_before_date=stale_before_date,
        min_adv_dollar=float(args.min_adv_dollar),
        require_entry_eligible=bool(args.require_entry_eligible),
    )
    etf_rows = _select_rows(
        rows,
        asset_class="etf",
        top_n=int(args.etf_top_n),
        recent_floor_date=recent_floor_date,
        stale_before_date=stale_before_date,
        min_adv_dollar=float(args.min_adv_dollar),
        require_entry_eligible=bool(args.require_entry_eligible),
    )
    selected = stock_rows + etf_rows
    selected.sort(key=lambda r: (r["asset_class"], -float(r["adv20_dollar"]), str(r["asset_id"])))
    canonical_ids = [str(row["asset_id"]) for row in selected if str(row.get("asset_id") or "").strip()]

    recommended_from_date = ""
    if selected:
        min_last_trade_date = min(str(row["last_trade_date"]) for row in selected)
        try:
            recommended_from_date = (parse_iso_date(min_last_trade_date) + timedelta(days=1)).isoformat()
        except Exception:
            recommended_from_date = recent_floor_date
    if recent_floor_date and recommended_from_date and recommended_from_date < recent_floor_date:
        recommended_from_date = recent_floor_date

    output_path = Path(args.output_path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(canonical_ids, ensure_ascii=False, indent=2))

    report = {
        "generated_at": utc_now_iso(),
        "quant_root": str(quant_root),
        "snapshot_dir": str(snap_dir),
        "universe_path": str(universe_path),
        "recent_floor_date": recent_floor_date,
        "stale_before_date": stale_before_date,
        "recommended_from_date": recommended_from_date,
        "stock_top_n": int(args.stock_top_n),
        "etf_top_n": int(args.etf_top_n),
        "stock_selected": len(stock_rows),
        "etf_selected": len(etf_rows),
        "selected_total": len(canonical_ids),
        "min_adv_dollar": float(args.min_adv_dollar),
        "require_entry_eligible": bool(args.require_entry_eligible),
        "output_path": str(output_path),
        "samples": {
            "stock": stock_rows[:10],
            "etf": etf_rows[:10],
        },
    }
    report_path = Path(str(args.report_path or "")).expanduser().resolve() if str(args.report_path or "").strip() else output_path.with_suffix(".report.json")
    atomic_write_json(report_path, report)
    print(json.dumps({"ok": True, **report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
