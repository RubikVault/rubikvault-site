#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.breakout_compute.lib.breakout_math import compute_component_scores, stable_event_id  # noqa: E402
from scripts.quantlab.q1_common import DEFAULT_QUANT_ROOT, atomic_write_json, read_json, stable_hash_file, utc_now_iso  # noqa: E402


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--input-manifest", required=True)
    return p.parse_args(list(argv))


def safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except Exception:
        return default
    if not math.isfinite(number):
        return default
    return number


def json_value(value: Any) -> Any:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return value


def score_label(score: float, ui_threshold: float) -> str:
    if score >= ui_threshold:
        return "breakout_candidate"
    return "breakout_watchlist"


def build_item(row: dict[str, Any], rank: int, total: int, score_version: str, scoring_config: dict[str, Any]) -> dict[str, Any]:
    components = compute_component_scores(row, scoring_config)
    final_score = float(components["final_signal_score"])
    ui_threshold = float((scoring_config.get("thresholds") or {}).get("ui_candidate_min_score") or 0.55)
    as_of = str(row.get("as_of") or row.get("asof_date") or "")[:10]
    asset_id = str(row.get("asset_id") or "")
    return {
        "event_id": stable_event_id(asset_id, as_of, score_version),
        "asset_id": asset_id,
        "symbol": row.get("symbol") or asset_id,
        "name": row.get("name") or row.get("symbol") or asset_id,
        "asset_class": str(row.get("asset_class") or "").lower(),
        "region": str(row.get("region") or "OTHER").upper(),
        "sector": row.get("sector") or "unknown",
        "as_of": as_of,
        "feature_date": json_value(row.get("date") or row.get("feature_date")),
        "score_version": score_version,
        "scores": {
            "structure_score": components["structure_score"],
            "volume_score": components["volume_score"],
            "compression_score": components["compression_score"],
            "relative_strength_score": components["relative_strength_score"],
            "liquidity_score": components["liquidity_score"],
            "regime_multiplier": components["regime_multiplier"],
            "final_signal_score": components["final_signal_score"],
        },
        "features": {
            "distance_to_resistance_atr": safe_float(row.get("distance_to_resistance_atr")),
            "rvol_percentile_asset_252d": safe_float(row.get("rvol_percentile_asset_252d")),
            "rvol_percentile_sector_252d": safe_float(row.get("rvol_percentile_sector_252d")),
            "atr_compression_percentile_252d": safe_float(row.get("atr_compression_percentile_252d")),
            "sector_relative_strength_63d": safe_float(row.get("sector_relative_strength_63d")),
            "price_position_20d_range": safe_float(row.get("price_position_20d_range")),
            "liquidity_score": safe_float(row.get("liquidity_score")),
            "recent_signal_count_20d": safe_float(row.get("recent_signal_count_20d"), 0.0),
            "market_regime_score": safe_float(row.get("market_regime_score")),
            "sector_breadth_score": safe_float(row.get("sector_breadth_score")),
        },
        "risk": {
            "close": safe_float(row.get("close_raw")),
            "atr14": safe_float(row.get("atr_14")),
            "resistance_level": safe_float(row.get("resistance_level")),
            "adv20_dollar": safe_float(row.get("adv20_dollar")),
        },
        "ui": {
            "label": score_label(final_score, ui_threshold),
            "rank": rank,
            "rank_percentile": round(1.0 - ((rank - 1) / max(1, total)), 6),
        },
        "reasons": components["_reasons"],
        "warnings": components["_warnings"],
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write_json(path, payload)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    input_manifest_path = Path(args.input_manifest).resolve()
    manifest = read_json(input_manifest_path)
    configs = manifest.get("configs") or {}
    scoring_config = configs.get("scoring") or {}
    health_config = configs.get("health") or {}
    score_version = str(scoring_config.get("score_version") or "breakout_scoring_v1.2")
    as_of = str(manifest.get("as_of") or "")[:10]
    quant_root = Path(str(manifest.get("quant_root") or DEFAULT_QUANT_ROOT)).resolve()
    work_dir = Path(str(manifest["work_dir"])).resolve()
    public_dir = Path(str(manifest["candidate_public_dir"])).resolve()
    public_dir.mkdir(parents=True, exist_ok=True)

    feature_metadata = read_json(work_dir / "feature_metadata.json")
    features_path = Path(str((feature_metadata.get("artifacts") or {}).get("features_parquet") or ""))
    excluded_path = Path(str((feature_metadata.get("artifacts") or {}).get("excluded_parquet") or ""))
    if not features_path.exists():
        raise SystemExit(f"FATAL: features parquet missing: {features_path}")

    features = pl.read_parquet(features_path)
    items: list[dict[str, Any]] = []
    if not features.is_empty():
        rows = features.to_dicts()
        ranked = []
        for row in rows:
            components = compute_component_scores(row, scoring_config)
            ranked.append((float(components["final_signal_score"]), row))
        ranked.sort(key=lambda pair: (-pair[0], str(pair[1].get("asset_id") or "")))
        total = len(ranked)
        items = [build_item(row, idx + 1, total, score_version, scoring_config) for idx, (_, row) in enumerate(ranked)]

    thresholds = scoring_config.get("thresholds") or {}
    top_min = float(thresholds.get("top_list_min_score") or 0.65)
    max_top = int(thresholds.get("max_top_items") or 500)
    max_shard = int(thresholds.get("max_shard_items_per_region") or 750)
    top_items = [item for item in items if float(item["scores"]["final_signal_score"]) >= top_min][:max_top]
    if not top_items:
        top_items = items[: min(max_top, len(items))]

    date_part = f"date={as_of}"
    score_root = quant_root / "breakout" / "scores" / date_part
    signal_root = quant_root / "breakout" / "signals" / date_part
    score_root.mkdir(parents=True, exist_ok=True)
    signal_root.mkdir(parents=True, exist_ok=True)
    scores_path = score_root / "scores.parquet"
    signals_path = signal_root / "signals.parquet"

    score_rows = []
    signal_rows = []
    for item in items:
        row = {
            "event_id": item["event_id"],
            "asset_id": item["asset_id"],
            "as_of": item["as_of"],
            "asset_class": item["asset_class"],
            "region": item["region"],
            "score_version": score_version,
            **item["scores"],
        }
        score_rows.append(row)
        signal_rows.append(
            {
                "event_id": item["event_id"],
                "asset_id": item["asset_id"],
                "signal_date": item["as_of"],
                "score_version": score_version,
                "final_signal_score": item["scores"]["final_signal_score"],
                "rank": item["ui"]["rank"],
                "rank_percentile": item["ui"]["rank_percentile"],
                "close": item["risk"]["close"],
                "atr14": item["risk"]["atr14"],
            }
        )
    pl.DataFrame(score_rows).write_parquet(scores_path) if score_rows else pl.DataFrame(schema={"event_id": pl.Utf8}).write_parquet(scores_path)
    pl.DataFrame(signal_rows).write_parquet(signals_path) if signal_rows else pl.DataFrame(schema={"event_id": pl.Utf8}).write_parquet(signals_path)

    counts = feature_metadata.get("counts") or {}
    excluded_reasons = dict(feature_metadata.get("excluded_reasons") or {})
    valid_ratio = (len(items) / max(1, int(counts.get("tradable_eligible") or 0))) if int(counts.get("tradable_eligible") or 0) else 0.0
    hard_fail_cfg = health_config.get("hard_fail") or {}
    hard_fail = False
    hard_fail_reasons: list[str] = []
    if len(items) < int(hard_fail_cfg.get("min_scores_computed") or 1):
        hard_fail = True
        hard_fail_reasons.append("scores_computed_below_min")
    if int(counts.get("tradable_eligible") or 0) and valid_ratio <= 0:
        hard_fail = True
        hard_fail_reasons.append("valid_outputs_ratio_zero")

    coverage = {
        "schema_version": "breakout_coverage_v1",
        "as_of": as_of,
        "scope_total": int(counts.get("scope_total") or 0),
        "ohlcv_available": int(counts.get("ohlcv_available") or 0),
        "history_eligible": int(counts.get("tradable_eligible") or 0),
        "indicator_eligible": int(counts.get("features_computed") or 0),
        "tradable_eligible": int(counts.get("tradable_eligible") or 0),
        "features_computed": int(counts.get("features_computed") or 0),
        "scores_computed": len(items),
        "top_signals": len(top_items),
        "excluded_reasons": excluded_reasons,
        "health": {
            "valid_outputs_ratio_on_tradable": round(valid_ratio, 6),
            "coverage_zscore_vs_30d": None,
            "trigger_count_zscore_vs_30d": None,
            "hard_fail": hard_fail,
            "alert": False,
            "hard_fail_reasons": hard_fail_reasons,
        },
    }
    health = {
        "schema_version": "breakout_health_v1",
        "as_of": as_of,
        "generated_at": utc_now_iso(),
        "status": "failed" if hard_fail else "ok",
        "hard_fail": hard_fail,
        "alert": False,
        "checks": {
            "features_parquet_present": features_path.exists(),
            "scores_computed": len(items),
            "top500_present": True,
            "excluded_parquet_present": excluded_path.exists(),
        },
        "hard_fail_reasons": hard_fail_reasons,
    }
    errors = {
        "schema_version": "breakout_errors_v1",
        "as_of": as_of,
        "errors": [{"code": reason, "message": reason, "severity": "hard_fail"} for reason in hard_fail_reasons],
    }
    top_payload = {
        "schema_version": "breakout_top_scores_v1",
        "as_of": as_of,
        "generated_at": utc_now_iso(),
        "score_version": score_version,
        "count": len(top_items),
        "items": top_items,
    }
    metadata = {
        "schema_version": "breakout_score_metadata_v1",
        "generated_at": utc_now_iso(),
        "as_of": as_of,
        "score_version": score_version,
        "input_manifest_hash": stable_hash_file(input_manifest_path),
        "artifacts": {
            "scores_parquet": str(scores_path),
            "signals_parquet": str(signals_path),
            "features_parquet": str(features_path),
        },
        "counts": {
            "scores_computed": len(items),
            "top_items": len(top_items),
        },
    }

    write_json(public_dir / "coverage.json", coverage)
    write_json(public_dir / "health.json", health)
    write_json(public_dir / "errors.json", errors)
    write_json(public_dir / "top500.json", top_payload)
    write_json(public_dir / "metadata.json", metadata)

    by_region: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        if float(item["scores"]["final_signal_score"]) < float(thresholds.get("ui_candidate_min_score") or 0.55):
            continue
        by_region.setdefault(str(item.get("region") or "OTHER").upper(), []).append(item)
    if not by_region:
        by_region["OTHER"] = []
    shard_files = []
    for region, region_items in sorted(by_region.items()):
        shard_dir = public_dir / "shards" / f"region={region}"
        shard_dir.mkdir(parents=True, exist_ok=True)
        shard_path = shard_dir / "shard_000.json"
        payload = {
            "schema_version": "breakout_top_scores_v1",
            "as_of": as_of,
            "generated_at": utc_now_iso(),
            "score_version": score_version,
            "region": region,
            "count": min(max_shard, len(region_items)),
            "items": region_items[:max_shard],
        }
        write_json(shard_path, payload)
        (shard_dir / "shard_000._SUCCESS").write_text("ok\n", encoding="utf-8")
        shard_files.append(str(shard_path))

    print(json.dumps({"ok": not hard_fail, "coverage": coverage, "shards": shard_files}, sort_keys=True))
    return 1 if hard_fail else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
