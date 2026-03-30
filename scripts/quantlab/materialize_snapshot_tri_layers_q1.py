#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_materialized_snapshot_dir,
    read_json,
    stable_hash_file,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--asof-date", default="")
    p.add_argument("--lookback-calendar-days", type=int, default=420)
    p.add_argument("--max-assets", type=int, default=0)
    p.add_argument("--output-tag", default="q1tri")
    p.add_argument("--use-adjusted-close-for-accounting", action="store_true", default=True)
    p.add_argument("--skip-use-adjusted-close-for-accounting", dest="use_adjusted_close_for_accounting", action="store_false")
    return p.parse_args(list(argv))


def _resolve_snapshot_dir(quant_root: Path, snapshot_id: str) -> Path:
    if snapshot_id:
        return quant_root / "data" / "snapshots" / f"snapshot_id={snapshot_id}"
    return latest_materialized_snapshot_dir(quant_root)


def _parse_classes(value: str) -> list[str]:
    out = []
    for part in (value or "").split(","):
        s = part.strip().lower()
        if s:
            out.append(s)
    return sorted(set(out))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    snap_dir = _resolve_snapshot_dir(quant_root, args.snapshot_id)
    manifest_path = snap_dir / "snapshot_manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"FATAL: snapshot manifest missing: {manifest_path}")
    manifest = read_json(manifest_path)

    bars_root = Path(str((manifest.get("artifacts") or {}).get("bars_dataset_root") or ""))
    universe_path = Path(str((manifest.get("artifacts") or {}).get("universe_parquet") or ""))
    if not bars_root.exists():
        raise SystemExit(f"FATAL: bars_dataset_root missing: {bars_root}")
    if not universe_path.exists():
        raise SystemExit(f"FATAL: universe_parquet missing: {universe_path}")

    include_classes = _parse_classes(args.asset_classes)
    asof_date = str(args.asof_date or manifest.get("asof_date") or "")
    if not asof_date:
        raise SystemExit("FATAL: unable to resolve asof-date")
    try:
        asof_dt = date.fromisoformat(asof_date[:10])
    except Exception as exc:
        raise SystemExit(f"FATAL: invalid asof-date: {asof_date} ({exc})")
    start_dt = asof_dt - timedelta(days=max(1, int(args.lookback_calendar_days)))

    universe = pl.read_parquet(universe_path).filter(pl.col("asset_class").is_in(include_classes))
    if universe.is_empty():
        raise SystemExit("FATAL: empty universe after asset class filter")
    universe = universe.sort(["adv20_dollar", "asset_id"], descending=[True, False])
    if int(args.max_assets) > 0:
        universe = universe.head(int(args.max_assets))
    selected_assets = [str(x) for x in universe.get_column("asset_id").to_list()]
    if not selected_assets:
        raise SystemExit("FATAL: no selected assets")

    bars_lf = (
        pl.scan_parquet(str(bars_root / "**" / "*.parquet"), hive_partitioning=True)
        .select(
            [
                pl.col("asset_id").cast(pl.Utf8),
                pl.col("asset_class").cast(pl.Utf8),
                pl.col("date").cast(pl.Date),
                pl.col("close_raw").cast(pl.Float64),
                pl.col("adjusted_close_raw").cast(pl.Float64),
            ]
        )
        .filter(pl.col("asset_class").is_in(include_classes))
        .filter(pl.col("asset_id").is_in(selected_assets))
        .filter(pl.col("date") >= pl.lit(start_dt))
        .filter(pl.col("date") <= pl.lit(asof_dt))
        .sort(["asset_id", "date"])
    )

    price_for_accounting = (
        pl.when(
            pl.lit(bool(args.use_adjusted_close_for_accounting))
            & pl.col("adjusted_close_raw").is_not_null()
            & (pl.col("adjusted_close_raw") > 0)
        )
        .then(pl.col("adjusted_close_raw"))
        .otherwise(pl.col("close_raw"))
        .alias("_price_accounting")
    )

    tri_lf = (
        bars_lf.with_columns(
            [
                pl.col("close_raw").shift(1).over("asset_id").alias("_prev_close"),
                price_for_accounting,
            ]
        )
        .with_columns(
            [
                (pl.col("close_raw") / pl.col("_prev_close") - 1.0).alias("_ret_close"),
                (pl.col("_price_accounting") / pl.col("_price_accounting").shift(1).over("asset_id") - 1.0).alias("_ret_accounting"),
            ]
        )
        .with_columns(
            [
                ((pl.col("_ret_close").fill_null(0.0) + 1.0).cum_prod().over("asset_id")).alias("tri_signal"),
                ((pl.col("_ret_accounting").fill_null(0.0) + 1.0).cum_prod().over("asset_id")).alias("tri_accounting"),
                pl.when(pl.col("_ret_close").is_null()).then(pl.lit(0.0)).otherwise(pl.col("_ret_close")).alias("ret_1d"),
            ]
        )
        .select(
            [
                "asset_id",
                "asset_class",
                pl.col("date").alias("asof_date"),
                "ret_1d",
                "tri_signal",
                "tri_accounting",
            ]
        )
    )

    tri_df = tri_lf.collect(engine="streaming")
    if tri_df.is_empty():
        raise SystemExit("FATAL: tri layer materialization produced 0 rows")

    out_root = snap_dir / "tri" / f"asof_date={asof_dt.isoformat()}"
    out_root.mkdir(parents=True, exist_ok=True)
    part_path = out_root / f"part-{args.output_tag}.parquet"
    tri_df.write_parquet(part_path, compression="zstd")

    counts_by_class: dict[str, int] = {}
    for row in tri_df.group_by("asset_class").len().to_dicts():
        counts_by_class[str(row.get("asset_class") or "")] = int(row.get("len") or 0)

    tri_manifest = {
        "schema": "quantlab_snapshot_tri_layers_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": str(manifest.get("snapshot_id") or snap_dir.name.split("=", 1)[-1]),
        "asof_date": asof_dt.isoformat(),
        "config": {
            "asset_classes": include_classes,
            "lookback_calendar_days": int(args.lookback_calendar_days),
            "max_assets": int(args.max_assets),
            "use_adjusted_close_for_accounting": bool(args.use_adjusted_close_for_accounting),
        },
        "counts": {
            "selected_assets_total": int(len(selected_assets)),
            "tri_rows_total": int(tri_df.height),
            "tri_rows_by_asset_class": counts_by_class,
        },
        "artifacts": {
            "tri_parquet": str(part_path),
            "tri_root": str(out_root),
            "source_bars_root": str(bars_root),
            "source_universe": str(universe_path),
        },
        "hashes": {
            "tri_parquet_hash": stable_hash_file(part_path),
        },
        "notes": [
            "Q1 Data Truth step: deterministic TRI layers from snapshot bars.",
            "tri_signal and tri_accounting are both preserved for downstream feature/risk paths.",
        ],
    }
    tri_manifest_path = out_root / "tri_layers_manifest.json"
    atomic_write_json(tri_manifest_path, tri_manifest)

    manifest.setdefault("artifacts", {})
    manifest["artifacts"]["tri_layers_manifest"] = str(tri_manifest_path)
    manifest["artifacts"]["tri_parquet"] = str(part_path)
    manifest.setdefault("counts", {})
    manifest["counts"]["tri_rows_total"] = int(tri_df.height)
    manifest["counts"]["tri_rows_by_asset_class"] = counts_by_class
    manifest.setdefault("hashes", {})
    manifest["hashes"]["tri_layers_manifest_hash"] = stable_hash_file(tri_manifest_path)
    manifest["hashes"]["tri_parquet_hash"] = stable_hash_file(part_path)
    atomic_write_json(manifest_path, manifest)

    print(f"snapshot_id={tri_manifest['snapshot_id']}")
    print(f"tri_rows_total={tri_manifest['counts']['tri_rows_total']}")
    print(f"tri_manifest={tri_manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
