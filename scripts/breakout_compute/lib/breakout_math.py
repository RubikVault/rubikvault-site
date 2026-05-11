from __future__ import annotations

import hashlib
import math
from typing import Any, Iterable, Sequence


def clamp(value: Any, low: float = 0.0, high: float = 1.0) -> float:
    try:
        number = float(value)
    except Exception:
        return low
    if not math.isfinite(number):
        return low
    return max(low, min(high, number))


def safe_div(num: float, den: float, default: float = 0.0) -> float:
    if den is None or not math.isfinite(den) or den == 0:
        return default
    try:
        return float(num) / float(den)
    except Exception:
        return default


def detect_pivots(
    highs: Sequence[float],
    lows: Sequence[float],
    left: int = 3,
    right: int = 3,
) -> tuple[list[float | None], list[float | None]]:
    n = len(highs)
    pivot_high: list[float | None] = [None] * n
    pivot_low: list[float | None] = [None] * n
    if n < left + right + 1:
        return pivot_high, pivot_low
    for i in range(left, n - right):
        hv = highs[i]
        lv = lows[i]
        if hv is None or lv is None:
            continue
        is_ph = True
        is_pl = True
        for j in range(i - left, i + right + 1):
            if j == i:
                continue
            hj = highs[j]
            lj = lows[j]
            if hj is None or lj is None:
                continue
            if hj >= hv:
                is_ph = False
            if lj <= lv:
                is_pl = False
        if is_ph:
            pivot_high[i] = hv
        if is_pl:
            pivot_low[i] = lv
    return pivot_high, pivot_low


def cluster_support_zone(
    pivot_lows: Sequence[float | None],
    atr_pct: float,
    zone_floor_pct: float = 0.025,
    atr_k: float = 0.75,
    lookback: int = 120,
) -> dict[str, Any]:
    """Cluster recent pivot lows into a support zone. Returns center/low/high/test_count."""
    if not pivot_lows:
        return {"detected": False}
    recent_idx = max(0, len(pivot_lows) - lookback)
    lows = [(i, float(p)) for i, p in enumerate(pivot_lows) if p is not None and i >= recent_idx]
    if not lows:
        return {"detected": False}
    width_pct = max(zone_floor_pct, atr_k * float(atr_pct or 0.0))
    # Take median-anchored cluster: lowest 3-5 pivot lows within width.
    lows_sorted = sorted(lows, key=lambda p: p[1])
    anchor = lows_sorted[0][1]
    band_low = anchor * (1.0 - width_pct / 2.0)
    band_high = anchor * (1.0 + width_pct / 2.0)
    cluster = [(i, v) for i, v in lows if band_low <= v <= band_high]
    if len(cluster) < 2:
        # Loosen: use any pivot lows within full width of lowest.
        cluster = [(i, v) for i, v in lows if v <= anchor * (1.0 + width_pct)]
    if len(cluster) < 2:
        return {"detected": False, "test_count": len(cluster)}
    values = [v for _, v in cluster]
    indices = [i for i, _ in cluster]
    center = sum(values) / len(values)
    low = min(values)
    high = max(values)
    first_idx = min(indices)
    last_idx = max(indices)
    return {
        "detected": True,
        "center": round(center, 6),
        "low": round(low, 6),
        "high": round(high, 6),
        "width_pct": round((high - low) / max(center, 1e-9), 6) if center > 0 else 0.0,
        "test_count": len(cluster),
        "first_test_index": first_idx,
        "last_test_index": last_idx,
        "method": "pivot_cluster_atr_adjusted",
    }


def count_failed_lows(
    lows: Sequence[float],
    closes: Sequence[float],
    pivot_lows: Sequence[float | None],
    lookback: int = 80,
    reclaim_tol: float = 0.002,
) -> int:
    """Count failed-low events (wick below prior pivot low but close >= cutoff)."""
    n = len(closes)
    if n == 0:
        return 0
    count = 0
    last_pivot: float | None = None
    for i in range(n):
        pv = pivot_lows[i] if i < len(pivot_lows) else None
        if pv is not None:
            last_pivot = pv
        if last_pivot is None:
            continue
        # Use most recent pivot-low up to (but not including) current bar.
        scan_start = max(0, i - lookback)
        anchor = None
        for j in range(i - 1, scan_start - 1, -1):
            v = pivot_lows[j] if j < len(pivot_lows) else None
            if v is not None:
                anchor = v
                break
        if anchor is None:
            continue
        cutoff = anchor * (1.0 - reclaim_tol)
        if lows[i] is not None and closes[i] is not None:
            if lows[i] < anchor and closes[i] >= cutoff:
                count += 1
    return count


def absorption_vol_ratio(
    opens: Sequence[float],
    closes: Sequence[float],
    volumes: Sequence[float],
    window: int = 40,
) -> float:
    n = len(closes)
    if n == 0:
        return 1.0
    start = max(0, n - window)
    down_vols: list[float] = []
    up_vols: list[float] = []
    for i in range(start, n):
        if opens[i] is None or closes[i] is None or volumes[i] is None:
            continue
        if closes[i] < opens[i]:
            down_vols.append(float(volumes[i]))
        elif closes[i] >= opens[i]:
            up_vols.append(float(volumes[i]))
    avg_down = sum(down_vols) / len(down_vols) if down_vols else 1.0
    avg_up = sum(up_vols) / len(up_vols) if up_vols else 1.0
    return safe_div(avg_down, avg_up, 1.0)


def clv_series(
    highs: Sequence[float],
    lows: Sequence[float],
    closes: Sequence[float],
) -> list[float]:
    out: list[float] = []
    for h, l, c in zip(highs, lows, closes):
        if h is None or l is None or c is None:
            out.append(0.0)
            continue
        rng = float(h) - float(l)
        if rng <= 0:
            out.append(0.0)
            continue
        clv = ((float(c) - float(l)) - (float(h) - float(c))) / rng
        out.append(clv)
    return out


def trend_slope(values: Sequence[float], lookback: int = 20) -> float:
    """Simple linear-regression slope on last N values, normalized by mean."""
    n = len(values)
    if n < 3:
        return 0.0
    end = n
    start = max(0, end - lookback)
    seq = [v for v in values[start:end] if v is not None and math.isfinite(v)]
    if len(seq) < 3:
        return 0.0
    m = len(seq)
    xs = list(range(m))
    mean_x = sum(xs) / m
    mean_y = sum(seq) / m
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, seq))
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return 0.0
    slope = num / den
    if mean_y == 0:
        return slope
    return slope / abs(mean_y)


def obv_higher_low(closes: Sequence[float], volumes: Sequence[float], lookback: int = 60) -> bool:
    """OBV makes a higher low vs N bars ago — bullish participation signal."""
    n = len(closes)
    if n < lookback + 5:
        return False
    obv: list[float] = [0.0] * n
    for i in range(1, n):
        if closes[i] is None or closes[i - 1] is None or volumes[i] is None:
            obv[i] = obv[i - 1]
            continue
        if closes[i] > closes[i - 1]:
            obv[i] = obv[i - 1] + float(volumes[i])
        elif closes[i] < closes[i - 1]:
            obv[i] = obv[i - 1] - float(volumes[i])
        else:
            obv[i] = obv[i - 1]
    recent_min = min(obv[-lookback // 2:])
    prior_min = min(obv[-lookback:-lookback // 2])
    return recent_min > prior_min


def cmf_series(
    highs: Sequence[float],
    lows: Sequence[float],
    closes: Sequence[float],
    volumes: Sequence[float],
    window: int = 20,
) -> list[float]:
    """Chaikin Money Flow over rolling window."""
    n = len(closes)
    mfv: list[float] = []
    for h, l, c, v in zip(highs, lows, closes, volumes):
        if h is None or l is None or c is None or v is None:
            mfv.append(0.0)
            continue
        rng = float(h) - float(l)
        if rng <= 0:
            mfv.append(0.0)
            continue
        clv = ((float(c) - float(l)) - (float(h) - float(c))) / rng
        mfv.append(clv * float(v))
    out: list[float] = [0.0] * n
    for i in range(window - 1, n):
        slice_vol = sum(v for v in volumes[i - window + 1 : i + 1] if v is not None)
        slice_mfv = sum(mfv[i - window + 1 : i + 1])
        out[i] = safe_div(slice_mfv, slice_vol, 0.0)
    return out


def selling_exhaustion_score(
    absorption_ratio: float,
    failed_low_count: int,
    obv_higher_low_flag: bool,
    cmf_recent: float,
) -> float:
    """0..1 score: higher = stronger selling exhaustion."""
    parts: list[float] = []
    # absorption_ratio > 1.0 means down-volume > up-volume → high selling. We want this DECREASING.
    # Map ratio: <0.8 → strong exhaustion, >1.4 → no exhaustion.
    if absorption_ratio <= 0.8:
        parts.append(1.0)
    elif absorption_ratio >= 1.4:
        parts.append(0.0)
    else:
        parts.append(clamp(1.0 - (absorption_ratio - 0.8) / 0.6))
    parts.append(clamp(failed_low_count / 4.0))  # 4+ failed lows = strong
    parts.append(1.0 if obv_higher_low_flag else 0.3)
    parts.append(clamp(0.5 + cmf_recent * 2.0))  # CMF +0.25 → 1.0
    return round(sum(parts) / len(parts), 6)


def accumulation_proxy_score(
    clv_trend: float,
    cmf_recent: float,
    obv_higher_low_flag: bool,
    up_down_volume_ratio: float,
) -> float:
    """0..1 score: higher = stronger accumulation proxies."""
    parts: list[float] = []
    # clv_trend positive over base = improving demand. Range typically -0.05..+0.05.
    parts.append(clamp(0.5 + clv_trend * 10.0))
    parts.append(clamp(0.5 + cmf_recent * 2.0))
    parts.append(1.0 if obv_higher_low_flag else 0.3)
    # up_down_volume_ratio > 1.0 = more up-volume.
    if up_down_volume_ratio is None or not math.isfinite(up_down_volume_ratio):
        parts.append(0.5)
    elif up_down_volume_ratio >= 1.5:
        parts.append(1.0)
    elif up_down_volume_ratio <= 0.7:
        parts.append(0.0)
    else:
        parts.append(clamp((up_down_volume_ratio - 0.7) / 0.8))
    return round(sum(parts) / len(parts), 6)


# 9-state status enum.
STATUS_UNELIGIBLE = "UNELIGIBLE"
STATUS_DATA_INSUFFICIENT = "DATA_INSUFFICIENT"
STATUS_NO_SETUP = "NO_SETUP"
STATUS_EARLY_ACCUMULATION = "EARLY_ACCUMULATION"
STATUS_RIGHT_SIDE_BASE = "RIGHT_SIDE_BASE"
STATUS_BREAKOUT_READY = "BREAKOUT_READY"
STATUS_BREAKOUT_CONFIRMED = "BREAKOUT_CONFIRMED"
STATUS_FAILED_BREAKOUT = "FAILED_BREAKOUT"
STATUS_INVALIDATED = "INVALIDATED"

ALL_STATUSES = (
    STATUS_UNELIGIBLE,
    STATUS_DATA_INSUFFICIENT,
    STATUS_NO_SETUP,
    STATUS_EARLY_ACCUMULATION,
    STATUS_RIGHT_SIDE_BASE,
    STATUS_BREAKOUT_READY,
    STATUS_BREAKOUT_CONFIRMED,
    STATUS_FAILED_BREAKOUT,
    STATUS_INVALIDATED,
)


def _finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except Exception:
        return None
    return number if math.isfinite(number) else None


def legacy_state_from_v13(
    status: str,
    close: Any = None,
    resistance: Any = None,
    atr14: Any = None,
    rvol: Any = None,
    recent_signal_count_20d: Any = None,
    distance_to_resistance_atr: Any = None,
) -> str:
    if status in {STATUS_UNELIGIBLE, STATUS_DATA_INSUFFICIENT, STATUS_NO_SETUP}:
        return "NONE"
    if status in {STATUS_EARLY_ACCUMULATION, STATUS_RIGHT_SIDE_BASE}:
        return "SETUP"
    if status == STATUS_BREAKOUT_READY:
        close_v = _finite_float(close)
        resistance_v = _finite_float(resistance)
        atr_v = _finite_float(atr14)
        rvol_v = _finite_float(rvol)
        dist_v = _finite_float(distance_to_resistance_atr)
        # TRIGGERED transient: either close already crossed pivot with vol not yet confirmed,
        # OR price within 0.1 ATR of pivot (about-to-trigger).
        if close_v is not None and resistance_v is not None and atr_v is not None and rvol_v is not None:
            if close_v > resistance_v and rvol_v < 1.5:
                return "TRIGGERED"
        if dist_v is not None and 0 <= dist_v <= 0.1:
            return "TRIGGERED"
        return "ARMED"
    if status == STATUS_BREAKOUT_CONFIRMED:
        return "CONFIRMED"
    if status in {STATUS_FAILED_BREAKOUT, STATUS_INVALIDATED}:
        return "FAILED"
    return "NONE"


def classify_status(feature: dict[str, Any]) -> tuple[str, list[str]]:
    """Map a feature row to one of the 9 statuses. Returns (status, reasons[])."""
    reasons: list[str] = []
    eligible = bool(feature.get("eligible", True))
    if not eligible:
        return STATUS_UNELIGIBLE, ["asset_not_eligible"]

    rows = int(feature.get("_rows_in_window") or feature.get("rows_in_window") or 0)
    close = feature.get("close_raw")
    atr14 = feature.get("atr_14")
    if rows < 60 or close is None or atr14 is None or not math.isfinite(float(close or 0)) or not math.isfinite(float(atr14 or 0)):
        return STATUS_DATA_INSUFFICIENT, ["short_history_or_nan_features"]

    support_low = feature.get("support_zone_low")
    support_high = feature.get("support_zone_high")
    support_detected = bool(feature.get("support_zone_detected"))
    test_count = int(feature.get("support_test_count") or 0)
    base_age = int(feature.get("base_age_bars") or 0)
    failed_lows = int(feature.get("failed_low_count") or 0)
    resistance = feature.get("resistance_level")
    dist_atr = feature.get("distance_to_resistance_atr")
    rvol = feature.get("rvol20") or 0.0
    atr_pct = feature.get("atr_pct_14") or 0.0
    atr_compression = feature.get("atr_compression_percentile_252d")
    rs = feature.get("sector_relative_strength_63d")
    selling_exh = feature.get("selling_exhaustion_score") or 0.0
    accum = feature.get("accumulation_proxy_score") or 0.0
    structure_raw = feature.get("structure_score") or 0.0
    price_pos = feature.get("price_position_20d_range") or 0.0
    volume_pctl_asset = feature.get("rvol_percentile_asset_252d") or 0.0

    # Invalidation: close decisively below support zone.
    if support_detected and support_low is not None and close is not None and atr14:
        invalidation_buffer = 0.5 * float(atr14)
        if float(close) < float(support_low) - invalidation_buffer:
            return STATUS_INVALIDATED, ["close_below_support_minus_atr_buffer"]

    # Confirmed breakout: close above resistance + buffer, strong volume.
    if resistance is not None and close is not None and atr14:
        buffer = max(0.01 * float(close), 0.25 * float(atr14))
        if float(close) > float(resistance) + buffer and float(rvol) >= 1.5 and float(volume_pctl_asset) >= 0.70:
            reasons.append("close_above_pivot_plus_buffer_volume_confirmed")
            return STATUS_BREAKOUT_CONFIRMED, reasons

    # Failed breakout: was triggered recently but back inside range.
    recent_signals = int(feature.get("recent_signal_count_20d") or 0)
    if recent_signals >= 2 and resistance is not None and close is not None and float(close) < float(resistance):
        if support_detected and support_low is not None and float(close) > float(support_low):
            reasons.append("prior_trigger_now_back_in_range")
            return STATUS_FAILED_BREAKOUT, reasons

    # Breakout ready: near pivot, compression, RS not weak.
    distance_pct = None
    if resistance is not None and close is not None and float(close) > 0:
        distance_pct = (float(resistance) - float(close)) / float(close)
    near_pivot = False
    if dist_atr is not None and math.isfinite(float(dist_atr)) and 0 <= float(dist_atr) <= 0.5:
        near_pivot = True
    elif distance_pct is not None and 0 <= distance_pct <= 0.03:
        near_pivot = True
    compression_ok = atr_compression is not None and float(atr_compression) <= 0.35
    rs_ok = rs is not None and float(rs) >= 0.45
    accum_ok = float(accum) >= 0.55
    if near_pivot and compression_ok and rs_ok and accum_ok and support_detected and test_count >= 2:
        reasons.append("near_pivot_compressed_rs_ok_accum_strong")
        return STATUS_BREAKOUT_READY, reasons

    # Right-side base: base mature, demand improving.
    if support_detected and test_count >= 2 and base_age >= 30 and float(accum) >= 0.45 and float(selling_exh) >= 0.45 and float(price_pos) >= 0.55:
        reasons.append("base_mature_demand_improving")
        return STATUS_RIGHT_SIDE_BASE, reasons

    # Early accumulation: base forming, failed lows present.
    if support_detected and test_count >= 2 and failed_lows >= 1 and base_age >= 20:
        reasons.append("early_base_failed_lows_present")
        return STATUS_EARLY_ACCUMULATION, reasons

    return STATUS_NO_SETUP, ["no_base_or_demand_signal"]


def compute_invalidation(feature: dict[str, Any]) -> dict[str, Any] | None:
    support_low = feature.get("support_zone_low")
    atr14 = feature.get("atr_14")
    if support_low is None or atr14 is None:
        return None
    try:
        buffer = 0.5 * float(atr14)
        level = float(support_low) - buffer
    except Exception:
        return None
    return {
        "close_below": round(level, 6),
        "method": "support_zone_low_minus_0.5_atr",
    }


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
