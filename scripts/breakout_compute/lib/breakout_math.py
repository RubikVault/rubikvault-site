from __future__ import annotations

import hashlib
import math
from typing import Any


def clamp(value: Any, low: float = 0.0, high: float = 1.0) -> float:
    try:
        number = float(value)
    except Exception:
        return low
    if not math.isfinite(number):
        return low
    return max(low, min(high, number))


def stable_event_id(asset_id: str, signal_date: str, score_version: str) -> str:
    return f"{asset_id}|{signal_date}|{score_version}"


def stable_hash_text(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def normalize_distance_to_resistance(distance_atr: Any) -> float:
    """Higher score when close is just below or slightly above resistance."""
    try:
        distance = float(distance_atr)
    except Exception:
        return 0.0
    if not math.isfinite(distance):
        return 0.0
    if distance < -0.75:
        return 0.45
    if distance <= 0:
        return 1.0
    return clamp(1.0 - (distance / 2.0))


def compute_component_scores(feature: dict[str, Any], scoring_config: dict[str, Any]) -> dict[str, float]:
    clamps = scoring_config.get("clamps") or {}
    thresholds = scoring_config.get("reason_thresholds") or {}
    min_regime = float(clamps.get("regime_multiplier_min", 0.70))
    max_regime = float(clamps.get("regime_multiplier_max", 1.15))

    structure_score = clamp(
        0.55 * normalize_distance_to_resistance(feature.get("distance_to_resistance_atr"))
        + 0.45 * clamp(feature.get("price_position_20d_range"))
    )
    volume_score = clamp(
        0.55 * clamp(feature.get("rvol_percentile_asset_252d"))
        + 0.45 * clamp(feature.get("rvol_percentile_sector_252d"))
    )
    compression_score = clamp(1.0 - clamp(feature.get("atr_compression_percentile_252d")))
    relative_strength_score = clamp(feature.get("sector_relative_strength_63d"))
    liquidity_score = clamp(feature.get("liquidity_score"))

    raw_regime = feature.get("regime_multiplier")
    try:
        regime_multiplier = float(raw_regime)
    except Exception:
        regime_multiplier = 1.0
    if not math.isfinite(regime_multiplier):
        regime_multiplier = 1.0
    regime_multiplier = max(min_regime, min(max_regime, regime_multiplier))

    weights = scoring_config.get("weights") or {}
    weighted = (
        float(weights.get("structure", 0.30)) * structure_score
        + float(weights.get("volume", 0.25)) * volume_score
        + float(weights.get("compression", 0.15)) * compression_score
        + float(weights.get("relative_strength", 0.15)) * relative_strength_score
        + float(weights.get("liquidity", 0.10)) * liquidity_score
        + float(weights.get("regime", 0.05)) * clamp((regime_multiplier - min_regime) / max(0.0001, max_regime - min_regime))
    )
    final_signal_score = clamp(weighted * regime_multiplier)

    reasons: list[str] = []
    warnings: list[str] = []
    if normalize_distance_to_resistance(feature.get("distance_to_resistance_atr")) >= 0.75:
        reasons.append("near_resistance")
    if clamp(feature.get("rvol_percentile_sector_252d")) >= float(thresholds.get("high_volume_percentile", 0.80)):
        reasons.append("sector_relative_rvol_high")
    if clamp(feature.get("atr_compression_percentile_252d")) <= float(thresholds.get("compressed_atr_percentile_max", 0.35)):
        reasons.append("atr_compression_present")
    if relative_strength_score >= float(thresholds.get("relative_strength_min", 0.65)):
        reasons.append("sector_strength_positive")
    if liquidity_score < float(thresholds.get("liquidity_min", 0.60)):
        warnings.append("liquidity_score_low")

    return {
        "structure_score": round(structure_score, 6),
        "volume_score": round(volume_score, 6),
        "compression_score": round(compression_score, 6),
        "relative_strength_score": round(relative_strength_score, 6),
        "liquidity_score": round(liquidity_score, 6),
        "regime_multiplier": round(regime_multiplier, 6),
        "final_signal_score": round(final_signal_score, 6),
        "_reasons": reasons,
        "_warnings": warnings,
    }


def first_touch_outcome(
    forward_bars: list[dict[str, Any]],
    *,
    entry_price: float,
    atr: float,
    horizon: int,
    target_atr: float,
    stop_atr: float,
    gap_event_threshold_atr: float,
) -> dict[str, Any]:
    target_price = entry_price + (atr * target_atr)
    stop_price = entry_price - (atr * stop_atr)
    mfe = 0.0
    mae = 0.0
    gap_event = False

    for bar in forward_bars[:horizon]:
        high = float(bar.get("high") or bar.get("high_raw") or bar.get("close") or bar.get("close_raw") or entry_price)
        low = float(bar.get("low") or bar.get("low_raw") or bar.get("close") or bar.get("close_raw") or entry_price)
        open_price = float(bar.get("open") or bar.get("open_raw") or entry_price)
        mfe = max(mfe, (high - entry_price) / atr if atr else 0.0)
        mae = min(mae, (low - entry_price) / atr if atr else 0.0)
        if atr and abs(open_price - entry_price) / atr >= gap_event_threshold_atr:
            gap_event = True
        hit_stop = low <= stop_price
        hit_target = high >= target_price
        if hit_stop and hit_target:
            return {
                "first_touch": "stop",
                "target_hit": False,
                "stop_hit": True,
                "time_stop": False,
                "mfe_atr": round(mfe, 6),
                "mae_atr": round(mae, 6),
                "gap_event": gap_event,
            }
        if hit_target:
            return {
                "first_touch": "target",
                "target_hit": True,
                "stop_hit": False,
                "time_stop": False,
                "mfe_atr": round(mfe, 6),
                "mae_atr": round(mae, 6),
                "gap_event": gap_event,
            }
        if hit_stop:
            return {
                "first_touch": "stop",
                "target_hit": False,
                "stop_hit": True,
                "time_stop": False,
                "mfe_atr": round(mfe, 6),
                "mae_atr": round(mae, 6),
                "gap_event": gap_event,
            }

    return {
        "first_touch": "time" if forward_bars else "missing_forward_data",
        "target_hit": False,
        "stop_hit": False,
        "time_stop": bool(forward_bars),
        "mfe_atr": round(mfe, 6) if forward_bars else None,
        "mae_atr": round(mae, 6) if forward_bars else None,
        "gap_event": gap_event,
    }
