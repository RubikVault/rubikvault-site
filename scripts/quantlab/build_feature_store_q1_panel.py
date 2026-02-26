#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import sys
from datetime import timedelta
from pathlib import Path
from typing import Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    latest_snapshot_dir,
    parse_iso_date,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)


DEF_PANEL_DAYS = 140
DEF_MIN_BARS = 200
DEF_MAX_ASSETS = 20000


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=str(REPO_ROOT))
    p.add_argument("--registry-rel", default="public/data/universe/v7/registry/registry.ndjson.gz")
    p.add_argument(
        "--registry-packkey-cache-path",
        default="",
        help="Optional JSON cache for canonical_id -> history_pack_key (default: <quant-root>/ops/cache/v7_registry_packkey_cache.json)",
    )
    p.add_argument(
        "--no-registry-packkey-cache",
        action="store_true",
        help="Disable local registry pack-key cache (forces registry scan)",
    )
    p.add_argument(
        "--bars-pack-file-index-cache-path",
        default="",
        help="Optional JSON cache for pack_key -> bars parquet path (default: <quant-root>/ops/cache/v7_bars_pack_file_index.<asset_classes>.json)",
    )
    p.add_argument(
        "--no-bars-pack-file-index-cache",
        action="store_true",
        help="Disable local bars pack file index cache (rebuild in-memory each run)",
    )
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--snapshot-id", default="")
    p.add_argument("--asset-classes", default="stock,etf")
    p.add_argument("--lookback-calendar-days", type=int, default=520)
    p.add_argument("--panel-calendar-days", type=int, default=DEF_PANEL_DAYS)
    p.add_argument("--min-bars", type=int, default=DEF_MIN_BARS)
    p.add_argument("--feature-store-version", default="v4_q1panel")
    p.add_argument("--output-tag", default="panel")
    p.add_argument("--max-assets", type=int, default=DEF_MAX_ASSETS, help="0 = all; otherwise top-liquid assets from snapshot universe")
    p.add_argument(
        "--full-file-batch-size",
        type=int,
        default=256,
        help="Deprecated experimental file-batch chunking (kept for compatibility; asset-chunking is used for correctness)",
    )
    p.add_argument(
        "--full-asset-chunk-size",
        type=int,
        default=10000,
        help="For max-assets=0, process full universe in registry-backed asset chunks (0 disables full chunking)",
    )
    return p.parse_args(list(argv))


def _load_snapshot_context(args: argparse.Namespace):
    quant_root = Path(args.quant_root).resolve()
    if args.snapshot_id:
        snap_dir = quant_root / "data" / "snapshots" / f"snapshot_id={args.snapshot_id}"
    else:
        snap_dir = latest_snapshot_dir(quant_root)
    manifest = read_json(snap_dir / "snapshot_manifest.json")
    snapshot_id = manifest["snapshot_id"]
    asof_date = parse_iso_date(manifest["asof_date"])
    bars_dataset_root_value = (manifest.get("artifacts") or {}).get("bars_dataset_root")
    if not bars_dataset_root_value:
        raise SystemExit(f"FATAL: bars_dataset_root missing in {snap_dir / 'snapshot_manifest.json'}")
    bars_root = Path(str(bars_dataset_root_value))
    if not bars_root.exists():
        raise SystemExit(f"FATAL: bars_dataset_root missing or not found: {bars_root}")
    universe_path = Path((manifest.get("artifacts") or {}).get("universe_parquet") or (snap_dir / "universe.parquet"))
    if not universe_path.exists():
        raise SystemExit(f"FATAL: universe.parquet not found for snapshot {snapshot_id}")
    return quant_root, snap_dir, manifest, snapshot_id, asof_date, bars_root, universe_path


def _build_allowlist(universe_path: Path, include_classes: list[str], max_assets: int) -> list[str] | None:
    if not max_assets or max_assets <= 0:
        return None
    udf = pl.read_parquet(universe_path)
    # Some snapshots may have null adv20_dollar / bars_count; keep deterministic ordering.
    sel = (
        udf.filter(pl.col("asset_class").is_in(include_classes))
        .with_columns(
            [
                pl.col("adv20_dollar").cast(pl.Float64).fill_null(-1.0),
                pl.col("bars_count").cast(pl.Int64).fill_null(0),
            ]
        )
        .sort(["adv20_dollar", "bars_count", "asset_id"], descending=[True, True, False])
        .select("asset_id")
        .head(max_assets)
    )
    return sel["asset_id"].to_list()


def _rel_to_pack_key(rel_pack: str) -> str:
    return hashlib.sha1(rel_pack.encode("utf-8")).hexdigest()[:16]


def _default_registry_packkey_cache_path(quant_root: Path) -> Path:
    return quant_root / "ops" / "cache" / "v7_registry_packkey_cache.json"


def _default_bars_pack_file_index_cache_path(quant_root: Path, include_classes: list[str]) -> Path:
    suffix = "_".join(sorted(include_classes)) if include_classes else "all"
    return quant_root / "ops" / "cache" / f"v7_bars_pack_file_index.{suffix}.json"


def _load_or_build_registry_packkey_cache(
    *,
    repo_root: Path,
    registry_rel: str,
    cache_path: Path,
) -> tuple[dict[str, str] | None, dict]:
    registry_path = (repo_root / registry_rel).resolve()
    if not registry_path.exists():
        return None, {
            "enabled": False,
            "status": "registry_missing",
            "registry_path": str(registry_path),
            "cache_path": str(cache_path),
        }

    registry_stat = registry_path.stat()
    registry_size = int(registry_stat.st_size)
    registry_mtime_ns = int(getattr(registry_stat, "st_mtime_ns", int(registry_stat.st_mtime * 1e9)))

    if cache_path.exists():
        try:
            cache_obj = read_json(cache_path)
            meta = cache_obj.get("registry_meta") or {}
            mappings = (cache_obj.get("mappings") or {})
            if (
                str(meta.get("registry_path")) == str(registry_path)
                and int(meta.get("size_bytes") or -1) == registry_size
                and int(meta.get("mtime_ns") or -1) == registry_mtime_ns
                and isinstance(mappings, dict)
            ):
                return {str(k): str(v) for k, v in mappings.items()}, {
                    "enabled": True,
                    "status": "hit",
                    "registry_path": str(registry_path),
                    "cache_path": str(cache_path),
                    "entries_total": len(mappings),
                    "registry_size_bytes": registry_size,
                    "registry_mtime_ns": registry_mtime_ns,
                }
        except Exception as e:
            # Best-effort cache; fall back to rebuild.
            cache_read_error = str(e)
        else:
            cache_read_error = None
    else:
        cache_read_error = None

    mappings: dict[str, str] = {}
    scanned_registry_rows = 0
    missing_pointer_rows = 0
    with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            scanned_registry_rows += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            cid = str(obj.get("canonical_id") or "").strip()
            if not cid:
                continue
            rel_pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
            if not rel_pack:
                missing_pointer_rows += 1
                continue
            mappings[cid] = _rel_to_pack_key(rel_pack)

    cache_payload = {
        "schema": "quantlab_v7_registry_packkey_cache_v1",
        "generated_at": utc_now_iso(),
        "registry_meta": {
            "registry_path": str(registry_path),
            "size_bytes": registry_size,
            "mtime_ns": registry_mtime_ns,
            "rows_scanned": scanned_registry_rows,
            "missing_pointer_rows": missing_pointer_rows,
        },
        "counts": {
            "entries_total": len(mappings),
        },
        "mappings": mappings,
    }
    atomic_write_json(cache_path, cache_payload)
    stats = {
        "enabled": True,
        "status": "rebuilt",
        "registry_path": str(registry_path),
        "cache_path": str(cache_path),
        "entries_total": len(mappings),
        "rows_scanned": scanned_registry_rows,
        "missing_pointer_rows": missing_pointer_rows,
        "registry_size_bytes": registry_size,
        "registry_mtime_ns": registry_mtime_ns,
    }
    if cache_read_error:
        stats["cache_read_error"] = cache_read_error
    return mappings, stats


def _build_bars_pack_file_index(
    *,
    bars_root: Path,
    include_classes: list[str],
) -> tuple[dict[str, str], dict]:
    allowed_class_tokens = {f"asset_class={cls}" for cls in include_classes}
    pack_index: dict[str, str] = {}
    bars_files_total = 0
    selected_files_total = 0
    duplicate_keys = 0
    for fp in bars_root.rglob("part_*.parquet"):
        bars_files_total += 1
        sp = str(fp)
        if not any(tok in sp for tok in allowed_class_tokens):
            continue
        selected_files_total += 1
        name = fp.name
        if not name.startswith("part_") or not name.endswith(".parquet"):
            continue
        pack_key = name[len("part_") : -len(".parquet")]
        if pack_key in pack_index:
            duplicate_keys += 1
        pack_index[pack_key] = sp
    return pack_index, {
        "status": "built",
        "bars_files_total": bars_files_total,
        "bars_files_selected_total": selected_files_total,
        "pack_keys_indexed_total": len(pack_index),
        "duplicate_pack_keys": duplicate_keys,
    }


def _load_or_build_bars_pack_file_index_cache(
    *,
    bars_root: Path,
    include_classes: list[str],
    snapshot_id: str,
    cache_path: Path,
) -> tuple[dict[str, str], dict]:
    bars_root_s = str(bars_root)
    include_classes_norm = sorted([str(x).lower() for x in include_classes])

    if cache_path.exists():
        try:
            cache_obj = read_json(cache_path)
            meta = cache_obj.get("meta") or {}
            mappings = cache_obj.get("mappings") or {}
            if (
                str(meta.get("bars_root")) == bars_root_s
                and str(meta.get("snapshot_id")) == str(snapshot_id)
                and sorted([str(x).lower() for x in (meta.get("asset_classes") or [])]) == include_classes_norm
                and isinstance(mappings, dict)
            ):
                return {str(k): str(v) for k, v in mappings.items()}, {
                    "enabled": True,
                    "status": "hit",
                    "cache_path": str(cache_path),
                    "bars_root": bars_root_s,
                    "snapshot_id": str(snapshot_id),
                    "asset_classes": include_classes_norm,
                    "pack_keys_indexed_total": len(mappings),
                }
        except Exception as e:
            cache_read_error = str(e)
        else:
            cache_read_error = None
    else:
        cache_read_error = None

    pack_index, stats = _build_bars_pack_file_index(bars_root=bars_root, include_classes=include_classes_norm)
    payload = {
        "schema": "quantlab_v7_bars_pack_file_index_cache_v1",
        "generated_at": utc_now_iso(),
        "meta": {
            "bars_root": bars_root_s,
            "snapshot_id": str(snapshot_id),
            "asset_classes": include_classes_norm,
        },
        "counts": {
            "pack_keys_indexed_total": len(pack_index),
            "bars_files_selected_total": int(stats.get("bars_files_selected_total", 0)),
            "bars_files_total": int(stats.get("bars_files_total", 0)),
            "duplicate_pack_keys": int(stats.get("duplicate_pack_keys", 0)),
        },
        "mappings": pack_index,
    }
    atomic_write_json(cache_path, payload)
    out_stats = {
        "enabled": True,
        "status": "rebuilt",
        "cache_path": str(cache_path),
        "bars_root": bars_root_s,
        "snapshot_id": str(snapshot_id),
        "asset_classes": include_classes_norm,
        **stats,
    }
    if cache_read_error:
        out_stats["cache_read_error"] = cache_read_error
    return pack_index, out_stats


def _select_bars_files_from_registry_allowlist(
    *,
    repo_root: Path,
    registry_rel: str,
    bars_root: Path,
    include_classes: list[str],
    allow_asset_ids: list[str] | None,
    registry_packkey_cache: dict[str, str] | None = None,
    bars_pack_file_index: dict[str, str] | None = None,
) -> tuple[list[str] | None, dict]:
    """
    Pre-prune scanned parquet files by mapping allowlisted asset_ids -> history_pack -> pack_key.
    This avoids scanning the full bars dataset tree for panel builds on top-liquid subsets.
    Returns (file_paths_or_none, stats). If allowlist is None, returns (None, {"mode":"full_scan"}).
    """
    if not allow_asset_ids:
        return None, {"mode": "full_scan", "allowlist_assets_total": 0}

    allow_set = set(allow_asset_ids)
    selected_pack_keys: set[str] = set()
    selected_assets_found = 0
    missing_pointer_assets = 0
    scanned_registry_rows = 0
    registry_path = (repo_root / registry_rel).resolve()
    registry_lookup_mode = "direct_registry_scan"
    if registry_packkey_cache is not None:
        registry_lookup_mode = "registry_packkey_cache"
        for cid in allow_asset_ids:
            pack_key = registry_packkey_cache.get(cid)
            if pack_key:
                selected_assets_found += 1
                selected_pack_keys.add(pack_key)
            else:
                missing_pointer_assets += 1
    else:
        if not registry_path.exists():
            return None, {
                "mode": "full_scan_registry_missing",
                "allowlist_assets_total": len(allow_asset_ids),
                "registry_path": str(registry_path),
            }
        with gzip.open(registry_path, "rt", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                scanned_registry_rows += 1
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cid = str(obj.get("canonical_id") or "").strip()
                if cid not in allow_set:
                    continue
                selected_assets_found += 1
                rel_pack = str(((obj.get("pointers") or {}).get("history_pack")) or "").strip()
                if not rel_pack:
                    missing_pointer_assets += 1
                    continue
                selected_pack_keys.add(_rel_to_pack_key(rel_pack))

    if not selected_pack_keys:
        return None, {
            "mode": "full_scan_no_selected_pack_keys",
            "allowlist_assets_total": len(allow_asset_ids),
            "allowlist_assets_found_in_registry": selected_assets_found,
            "allowlist_assets_missing_pointer": missing_pointer_assets,
            "registry_path": str(registry_path),
            "registry_rows_scanned": scanned_registry_rows,
        }

    selected_files: list[str] = []
    bars_files_total = 0
    if bars_pack_file_index is not None:
        selected_files = [bars_pack_file_index[k] for k in sorted(selected_pack_keys) if k in bars_pack_file_index]
        bars_files_total = len(bars_pack_file_index)
    else:
        allowed_class_tokens = {f"asset_class={cls}" for cls in include_classes}
        for fp in bars_root.rglob("part_*.parquet"):
            bars_files_total += 1
            sp = str(fp)
            if not any(tok in sp for tok in allowed_class_tokens):
                continue
            name = fp.name
            if not name.startswith("part_") or not name.endswith(".parquet"):
                continue
            pack_key = name[len("part_") : -len(".parquet")]
            if pack_key in selected_pack_keys:
                selected_files.append(sp)
        selected_files.sort()
    if not selected_files:
        return None, {
            "mode": "full_scan_no_files_matched_pack_keys",
            "allowlist_assets_total": len(allow_asset_ids),
            "allowlist_assets_found_in_registry": selected_assets_found,
            "allowlist_assets_missing_pointer": missing_pointer_assets,
            "selected_pack_keys_total": len(selected_pack_keys),
            "bars_files_total": bars_files_total,
            "registry_lookup_mode": registry_lookup_mode,
            "bars_file_lookup_mode": "pack_index" if bars_pack_file_index is not None else "scan",
        }

    return selected_files, {
        "mode": "prepruned_files",
        "allowlist_assets_total": len(allow_asset_ids),
        "allowlist_assets_found_in_registry": selected_assets_found,
        "allowlist_assets_missing_pointer": missing_pointer_assets,
        "selected_pack_keys_total": len(selected_pack_keys),
        "bars_files_total": bars_files_total,
        "bars_files_selected_total": len(selected_files),
        "registry_path": str(registry_path),
        "registry_lookup_mode": registry_lookup_mode,
        "bars_file_lookup_mode": "pack_index" if bars_pack_file_index is not None else "scan",
    }


def _list_bars_files_for_classes(bars_root: Path, include_classes: list[str]) -> tuple[list[str], dict]:
    allowed_class_tokens = {f"asset_class={cls}" for cls in include_classes}
    selected_files: list[str] = []
    bars_files_total = 0
    for fp in bars_root.rglob("part_*.parquet"):
        bars_files_total += 1
        sp = str(fp)
        if not any(tok in sp for tok in allowed_class_tokens):
            continue
        selected_files.append(sp)
    selected_files.sort()
    return selected_files, {
        "mode": "class_file_pruned_full",
        "bars_files_total": bars_files_total,
        "bars_files_selected_total": len(selected_files),
    }


def _scan_and_build_panel(
    bars_files: list[str] | None,
    bars_root: Path,
    include_classes: list[str],
    allow_asset_ids: list[str] | None,
    asof_date,
    lookback_calendar_days: int,
    panel_calendar_days: int,
    min_bars: int,
) -> pl.LazyFrame:
    start_date = (asof_date - timedelta(days=lookback_calendar_days)).isoformat()
    panel_start = (asof_date - timedelta(days=panel_calendar_days)).isoformat()
    asof_s = asof_date.isoformat()

    bars_scan_input: str | list[str]
    bars_scan_input = bars_files if bars_files else str(bars_root / "**" / "*.parquet")
    lf = (
        pl.scan_parquet(bars_scan_input, hive_partitioning=True)
        .with_columns(
            [
                pl.col("asset_class").str.to_lowercase(),
                pl.col("date").cast(pl.Utf8).str.strptime(pl.Date, strict=False),
                pl.col("open_raw").cast(pl.Float64),
                pl.col("high_raw").cast(pl.Float64),
                pl.col("low_raw").cast(pl.Float64),
                pl.col("close_raw").cast(pl.Float64),
                pl.col("volume_raw").cast(pl.Float64),
            ]
        )
        .filter(pl.col("asset_class").is_in(include_classes))
        .filter(pl.col("date") >= pl.lit(start_date).str.strptime(pl.Date))
        .filter(pl.col("date") < pl.lit(asof_s).str.strptime(pl.Date))
        .sort(["asset_id", "date"])
    )
    if allow_asset_ids:
        lf = lf.filter(pl.col("asset_id").is_in(allow_asset_ids))

    prev_close = pl.col("close_raw").shift(1).over("asset_id")
    next_1 = pl.col("close_raw").shift(-1).over("asset_id")
    next_5 = pl.col("close_raw").shift(-5).over("asset_id")
    next_20 = pl.col("close_raw").shift(-20).over("asset_id")

    delta = (pl.col("close_raw") - prev_close)
    gain = pl.when(delta > 0).then(delta).otherwise(0.0)
    loss = pl.when(delta < 0).then(-delta).otherwise(0.0)
    tr = pl.max_horizontal(
        (pl.col("high_raw") - pl.col("low_raw")).abs(),
        (pl.col("high_raw") - prev_close).abs(),
        (pl.col("low_raw") - prev_close).abs(),
    )
    dollar_vol = pl.col("close_raw") * pl.col("volume_raw")

    feat = (
        lf.with_columns(
            [
                (pl.col("close_raw") / prev_close - 1.0).alias("ret_1d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(5).over("asset_id") - 1.0).alias("ret_5d"),
                (pl.col("close_raw") / pl.col("close_raw").shift(20).over("asset_id") - 1.0).alias("ret_20d"),
                (next_1 / pl.col("close_raw") - 1.0).alias("fwd_ret_1d"),
                (next_5 / pl.col("close_raw") - 1.0).alias("fwd_ret_5d"),
                (next_20 / pl.col("close_raw") - 1.0).alias("fwd_ret_20d"),
                pl.col("close_raw").log().diff().over("asset_id").alias("logret_1d"),
                pl.col("close_raw").rolling_mean(20).over("asset_id").alias("sma_20"),
                pl.col("close_raw").rolling_mean(50).over("asset_id").alias("sma_50"),
                pl.col("close_raw").rolling_mean(200).over("asset_id").alias("sma_200"),
                pl.col("close_raw").ewm_mean(span=12, adjust=False).over("asset_id").alias("ema_12"),
                pl.col("close_raw").ewm_mean(span=26, adjust=False).over("asset_id").alias("ema_26"),
                gain.rolling_mean(14).over("asset_id").alias("_avg_gain_14"),
                loss.rolling_mean(14).over("asset_id").alias("_avg_loss_14"),
                tr.rolling_mean(14).over("asset_id").alias("atr_14"),
                dollar_vol.rolling_mean(20).over("asset_id").alias("adv20_dollar"),
                ((pl.col("high_raw") - pl.col("low_raw")) / pl.col("close_raw")).alias("range_pct"),
                (pl.col("open_raw") / prev_close - 1.0).alias("gap_open"),
                pl.col("volume_raw").rolling_mean(20).over("asset_id").alias("_vol_ma20"),
                pl.col("date").cum_count().over("asset_id").alias("_bars_seen"),
            ]
        )
        .with_columns([(pl.col("ema_12") - pl.col("ema_26")).alias("macd")])
        .with_columns(
            [
                (pl.col("macd").ewm_mean(span=9, adjust=False).over("asset_id")).alias("macd_signal"),
                (
                    100
                    - (
                        100
                        / (
                            1
                            + (
                                pl.col("_avg_gain_14")
                                / pl.when(pl.col("_avg_loss_14") > 0).then(pl.col("_avg_loss_14")).otherwise(None)
                            )
                        )
                    )
                ).alias("rsi_14"),
            ]
        )
        .with_columns(
            [
                (pl.col("macd") - pl.col("macd_signal")).alias("macd_hist"),
                ((pl.col("close_raw") - pl.col("sma_20")) / (pl.col("close_raw").rolling_std(20).over("asset_id"))).alias("boll_z_20"),
                ((pl.col("close_raw") / pl.col("sma_50")) - 1.0).alias("dist_vwap_20"),  # q1 proxy
                (pl.col("atr_14") / pl.col("close_raw")).alias("atr_pct_14"),
                (pl.col("_vol_ma20") / pl.col("volume_raw").rolling_mean(60).over("asset_id")).alias("turnover_ratio"),
                pl.col("close_raw").rolling_std(20).over("asset_id").alias("_px_vol_20"),
                pl.col("close_raw").rolling_std(60).over("asset_id").alias("_px_vol_60"),
            ]
        )
        .with_columns(
            [
                pl.col("_px_vol_20").rolling_std(20).over("asset_id").alias("vov_20"),
                (pl.col("close_raw") <= 0).alias("_bad_close"),
                (pl.col("date").is_null()).alias("_bad_date"),
                pl.col("logret_1d").rolling_std(20).over("asset_id").alias("ewma_vol_20"),
                pl.col("logret_1d").rolling_std(60).over("asset_id").alias("ewma_vol_60"),
            ]
        )
        .with_columns(
            [
                (pl.col("_bad_close") | pl.col("_bad_date")).alias("ca_suspicious_flag"),
                pl.col("close_raw").is_null().alias("has_missing_bars_lookback"),
                pl.col("date").max().over("asset_id").alias("_asset_latest_date"),
            ]
        )
        .filter(pl.col("date") >= pl.lit(panel_start).str.strptime(pl.Date))
        .filter(pl.col("_bars_seen") >= min_bars)
        .filter(pl.col("fwd_ret_5d").is_not_null())
        .select(
            [
                pl.col("asset_id"),
                pl.col("date").alias("asof_date"),
                pl.col("date").alias("feature_date"),
                pl.col("asset_class"),
                "ret_1d",
                "ret_5d",
                "ret_20d",
                "fwd_ret_1d",
                "fwd_ret_5d",
                "fwd_ret_20d",
                "logret_1d",
                "close_raw",
                "sma_20",
                "sma_50",
                "sma_200",
                "ema_12",
                "ema_26",
                "macd",
                "macd_signal",
                "macd_hist",
                "rsi_14",
                "boll_z_20",
                "dist_vwap_20",
                "atr_14",
                "atr_pct_14",
                "ewma_vol_20",
                "ewma_vol_60",
                "vov_20",
                "adv20_dollar",
                "turnover_ratio",
                "range_pct",
                "gap_open",
                "has_missing_bars_lookback",
                "ca_suspicious_flag",
                pl.col("_bars_seen").alias("bars_seen"),
            ]
        )
    )
    return feat


def _partition_key_to_date_str(key) -> str:
    if isinstance(key, tuple):
        key = key[0]
    if hasattr(key, "isoformat"):
        return key.isoformat()
    return str(key)


def _partition_to_output(
    panel_df: pl.DataFrame,
    *,
    root: Path,
    output_tag: str,
    chunk_index: int | None = None,
) -> tuple[list[str], dict[str, int], dict[str, int], list[str]]:
    files_written: list[str] = []
    rows_by_asset_class: dict[str, int] = {}
    rows_by_asof: dict[str, int] = {}
    distinct_asof_dates: list[str] = []
    suffix = f".chunk{chunk_index:04d}" if chunk_index is not None else ""
    part_name = f"part-{output_tag}{suffix}.parquet"

    for asof_key, per_day in panel_df.partition_by("asof_date", as_dict=True).items():
        asof_s = _partition_key_to_date_str(asof_key)
        distinct_asof_dates.append(asof_s)
        rows_by_asof[asof_s] = rows_by_asof.get(asof_s, 0) + int(per_day.height)
        base_dir = root / f"asof_date={asof_s}"
        for cls_key, per_cls in per_day.partition_by("asset_class", as_dict=True).items():
            cls = _partition_key_to_date_str(cls_key)
            cls_dir = base_dir / f"asset_class={cls}"
            cls_dir.mkdir(parents=True, exist_ok=True)
            fp = cls_dir / part_name
            per_cls.write_parquet(fp)
            n = int(per_cls.height)
            files_written.append(str(fp))
            rows_by_asset_class[cls] = rows_by_asset_class.get(cls, 0) + n
    distinct_asof_dates.sort()
    return files_written, rows_by_asset_class, rows_by_asof, distinct_asof_dates


def _merge_int_dict(dst: dict[str, int], src: dict[str, int]) -> None:
    for k, v in src.items():
        dst[k] = int(dst.get(k, 0) + int(v))


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    repo_root = Path(args.repo_root).resolve()
    quant_root, snap_dir, snap_manifest, snapshot_id, asof_date, bars_root, universe_path = _load_snapshot_context(args)
    include_classes = [x.strip().lower() for x in args.asset_classes.split(",") if x.strip()]
    if not include_classes:
        raise SystemExit("FATAL: no asset classes provided")

    allow_asset_ids = _build_allowlist(universe_path, include_classes, args.max_assets)
    registry_packkey_cache: dict[str, str] | None = None
    registry_cache_stats: dict = {"enabled": False, "status": "disabled"}
    if not args.no_registry_packkey_cache:
        cache_path = Path(args.registry_packkey_cache_path).resolve() if args.registry_packkey_cache_path else _default_registry_packkey_cache_path(quant_root)
        registry_packkey_cache, registry_cache_stats = _load_or_build_registry_packkey_cache(
            repo_root=repo_root,
            registry_rel=args.registry_rel,
            cache_path=cache_path,
        )
    bars_pack_file_index: dict[str, str] | None = None
    bars_pack_index_stats: dict = {"enabled": False, "status": "disabled"}
    selected_bars_files, preprune_stats = _select_bars_files_from_registry_allowlist(
        repo_root=repo_root,
        registry_rel=args.registry_rel,
        bars_root=bars_root,
        include_classes=include_classes,
        allow_asset_ids=allow_asset_ids,
        registry_packkey_cache=registry_packkey_cache,
        bars_pack_file_index=bars_pack_file_index,
    )
    root = quant_root / "features" / "store" / f"feature_store_version={args.feature_store_version}"
    root.mkdir(parents=True, exist_ok=True)
    # For full-universe panel builds, we can either scan all class files or chunk by full asset universe.
    if allow_asset_ids is None:
        selected_bars_files, preprune_stats = _list_bars_files_for_classes(bars_root, include_classes)

    rows_total = 0
    files_written: list[str] = []
    rows_by_asset_class: dict[str, int] = {c: 0 for c in include_classes}
    rows_by_asof: dict[str, int] = {}
    distinct_asof_set: set[str] = set()
    chunking_enabled = False
    chunking_batches_total = 0
    chunking_batch_size = 0
    chunking_mode = "none"

    can_chunk_full = (
        allow_asset_ids is None
        and args.full_asset_chunk_size > 0
    )

    if can_chunk_full:
        # Build deterministic full-universe allowlist and process in asset chunks.
        full_asset_ids = _build_allowlist(universe_path, include_classes, max_assets=10_000_000_000)
        if full_asset_ids:
            chunking_enabled = True
            chunking_batch_size = int(args.full_asset_chunk_size)
            chunking_mode = "asset_chunks_via_registry_pointer"
            asset_chunks = [
                full_asset_ids[i : i + chunking_batch_size]
                for i in range(0, len(full_asset_ids), chunking_batch_size)
            ]
            chunking_batches_total = len(asset_chunks)
            if registry_packkey_cache is not None:
                if args.no_bars_pack_file_index_cache:
                    bars_pack_file_index, bars_pack_index_stats_built = _build_bars_pack_file_index(
                        bars_root=bars_root,
                        include_classes=include_classes,
                    )
                    bars_pack_index_stats = {"enabled": True, "cache_enabled": False, **bars_pack_index_stats_built}
                else:
                    bars_pack_idx_cache_path = (
                        Path(args.bars_pack_file_index_cache_path).resolve()
                        if args.bars_pack_file_index_cache_path
                        else _default_bars_pack_file_index_cache_path(quant_root, include_classes)
                    )
                    bars_pack_file_index, bars_pack_index_stats = _load_or_build_bars_pack_file_index_cache(
                        bars_root=bars_root,
                        include_classes=include_classes,
                        snapshot_id=snapshot_id,
                        cache_path=bars_pack_idx_cache_path,
                    )
            first_chunk_preprune: dict | None = None
            for idx, asset_chunk in enumerate(asset_chunks):
                chunk_files, chunk_preprune = _select_bars_files_from_registry_allowlist(
                    repo_root=repo_root,
                    registry_rel=args.registry_rel,
                    bars_root=bars_root,
                    include_classes=include_classes,
                    allow_asset_ids=asset_chunk,
                    registry_packkey_cache=registry_packkey_cache,
                    bars_pack_file_index=bars_pack_file_index,
                )
                if first_chunk_preprune is None:
                    first_chunk_preprune = dict(chunk_preprune)
                feat_lf = _scan_and_build_panel(
                    bars_files=chunk_files,
                    bars_root=bars_root,
                    include_classes=include_classes,
                    allow_asset_ids=asset_chunk,
                    asof_date=asof_date,
                    lookback_calendar_days=args.lookback_calendar_days,
                    panel_calendar_days=args.panel_calendar_days,
                    min_bars=args.min_bars,
                )
                panel_df = feat_lf.collect(engine="streaming")
                if panel_df.is_empty():
                    continue
                rows_total += int(panel_df.height)
                fw, rbc, rba, distinct = _partition_to_output(panel_df, root=root, output_tag=args.output_tag, chunk_index=idx)
                files_written.extend(fw)
                _merge_int_dict(rows_by_asset_class, rbc)
                _merge_int_dict(rows_by_asof, rba)
                distinct_asof_set.update(distinct)
            # Preserve top-level preprune info for manifest, but annotate that chunking was used.
            preprune_stats = {
                "mode": "chunked_full_asset_registry_preprune",
                "chunks_total": chunking_batches_total,
                "asset_chunk_size": chunking_batch_size,
                "allowlist_assets_total": len(full_asset_ids),
                "sample_first_chunk_preprune": first_chunk_preprune or {},
            }
        else:
            chunking_mode = "asset_chunks_empty"
    else:
        feat_lf = _scan_and_build_panel(
            bars_files=selected_bars_files,
            bars_root=bars_root,
            include_classes=include_classes,
            allow_asset_ids=allow_asset_ids,
            asof_date=asof_date,
            lookback_calendar_days=args.lookback_calendar_days,
            panel_calendar_days=args.panel_calendar_days,
            min_bars=args.min_bars,
        )
        panel_df = feat_lf.collect(engine="streaming")
        if panel_df.is_empty():
            raise SystemExit("FATAL: panel feature build produced 0 rows")
        rows_total = int(panel_df.height)
        fw, rbc, rba, distinct = _partition_to_output(panel_df, root=root, output_tag=args.output_tag, chunk_index=None)
        files_written.extend(fw)
        _merge_int_dict(rows_by_asset_class, rbc)
        _merge_int_dict(rows_by_asof, rba)
        distinct_asof_set.update(distinct)

    if rows_total <= 0 or not files_written or not distinct_asof_set:
        raise SystemExit("FATAL: panel feature build produced 0 rows/files")

    distinct_asof_dates = sorted(distinct_asof_set)
    part_glob_hint = f"part-{args.output_tag}*.parquet" if chunking_enabled else f"part-{args.output_tag}.parquet"
    out_manifest = {
        "schema": "quantlab_feature_panel_manifest_q1_v1",
        "generated_at": utc_now_iso(),
        "snapshot_id": snapshot_id,
        "snapshot_manifest": str(snap_dir / "snapshot_manifest.json"),
        "snapshot_manifest_hash": stable_hash_file(snap_dir / "snapshot_manifest.json"),
        "feature_store_version": args.feature_store_version,
        "build_mode": "panel_features_multi_asof_from_materialized_bars_windowed",
        "asset_classes": include_classes,
        "lookback_calendar_days": args.lookback_calendar_days,
        "panel_calendar_days": args.panel_calendar_days,
        "min_bars": args.min_bars,
        "max_assets": args.max_assets,
        "counts": {
            "rows_total": int(rows_total),
            "files_total": len(files_written),
            "asof_dates_total": len(distinct_asof_dates),
            "rows_by_asset_class": rows_by_asset_class,
            "rows_by_asof_sample_head": {k: rows_by_asof[k] for k in distinct_asof_dates[:5]},
            "rows_by_asof_sample_tail": {k: rows_by_asof[k] for k in distinct_asof_dates[-5:]},
            "allowlist_assets_total": len(allow_asset_ids or []),
            "allowlist_mode": "top_liquid" if allow_asset_ids is not None else "full",
            "bars_files_scan_selected_total": len(selected_bars_files or []),
        },
        "ranges": {
            "panel_min_asof_date": distinct_asof_dates[0],
            "panel_max_asof_date": distinct_asof_dates[-1],
            "snapshot_asof_date": asof_date.isoformat(),
        },
        "artifacts": {
            "feature_store_root": str(root),
            "files": files_written,
            "part_glob_hint": part_glob_hint,
        },
        "scan_plan": {
            "bars_root": str(bars_root),
            "bars_scan_mode": preprune_stats.get("mode"),
            "preprune": preprune_stats,
            "registry_packkey_cache": registry_cache_stats,
            "bars_pack_file_index": bars_pack_index_stats,
            "chunking": {
                "enabled": bool(chunking_enabled),
                "file_batch_size": int(chunking_batch_size),
                "asset_chunk_size": int(chunking_batch_size) if chunking_mode == "asset_chunks_via_registry_pointer" else 0,
                "batches_total": int(chunking_batches_total),
                "mode": chunking_mode,
            },
        },
        "hashes": {
            "files_size_hash": stable_hash_obj(sorted((Path(p).name, Path(p).stat().st_size) for p in files_written)),
        },
        "notes": [
            "Each asof_date partition corresponds to feature rows computed from data available through that same feature_date (Q1 convention).",
            "Forward returns are included for time-split evaluation scaffolding.",
        ],
    }
    manifest_path = root / "feature_panel_manifest.json"
    atomic_write_json(manifest_path, out_manifest)

    print(f"snapshot_id={snapshot_id}")
    print(f"feature_store_version={args.feature_store_version}")
    print(f"rows_total={rows_total}")
    print(f"asof_dates_total={len(distinct_asof_dates)}")
    print(f"panel_range={distinct_asof_dates[0]}..{distinct_asof_dates[-1]}")
    print(f"manifest={manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__('sys').argv[1:]))
