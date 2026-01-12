from __future__ import annotations

import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas_market_calendars as mcal

try:
    from .data_fetcher import default_window, fetch_ohlcv
    from .exporter import (
        build_envelope,
        write_health,
        write_latest,
        write_top_file,
        write_universe_meta,
    )
    from .indicator_engine import compute_indicators
    from .scoring import compute_scores
    from .trigger import compute_triggers
    from .universe_builder import build_universe
    from .validator import evaluate_coverage
except ImportError:  # pragma: no cover - direct script invocation fallback
    import sys

    ROOT = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(ROOT))
    from backend.rvci.data_fetcher import default_window, fetch_ohlcv
    from backend.rvci.exporter import (
        build_envelope,
        write_health,
        write_latest,
        write_top_file,
        write_universe_meta,
    )
    from backend.rvci.indicator_engine import compute_indicators
    from backend.rvci.scoring import compute_scores
    from backend.rvci.trigger import compute_triggers
    from backend.rvci.universe_builder import build_universe
    from backend.rvci.validator import evaluate_coverage


FEATURE_ID = "rvci-engine"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _determine_regime(spy_indicators: Dict[str, float | None], vix_last: float | None) -> str:
    price_vs_sma200 = spy_indicators.get("priceVsSma200")
    if price_vs_sma200 is None:
        return "Neutral"
    if vix_last is not None and vix_last >= 25:
        return "Bear"
    if price_vs_sma200 > 0:
        return "Bull"
    if price_vs_sma200 < 0:
        return "Bear"
    return "Neutral"


def _extract_latest_date(prices: Dict[str, any]) -> datetime | None:
    latest = None
    for frame in prices.values():
        if frame is None or frame.empty:
            continue
        ts = frame.index.max()
        if isinstance(ts, datetime):
            if latest is None or ts > latest:
                latest = ts
    return latest


def _compute_anomalies(df_scores) -> List[dict]:
    anomalies: List[dict] = []
    if df_scores.empty:
        return anomalies
    for field in ["rsi14", "atr14", "rvol20"]:
        if field not in df_scores:
            continue
        series = df_scores[field].dropna()
        if series.empty:
            continue
        mean = series.mean()
        std = series.std()
        if std == 0 or math.isnan(std):
            continue
        z = (series - mean) / std
        outliers = z[abs(z) > 3]
        for symbol, value in outliers.items():
            anomalies.append(
                {
                    "symbol": symbol,
                    "field": field,
                    "value": float(series.loc[symbol]),
                    "zScore": float(value),
                }
            )
    return anomalies


def _build_entry(symbol: str, score: float, indicators: dict, triggers: List[str]) -> dict:
    return {
        "symbol": symbol,
        "score": round(float(score), 2),
        "trigger": bool(triggers),
        "notes": triggers,
        "signals": {
            "close": indicators.get("close"),
            "changePct": indicators.get("changePct"),
            "rsi14": indicators.get("rsi14"),
            "macdHist": indicators.get("macdHist"),
            "rvol20": indicators.get("rvol20"),
            "bbPercent": indicators.get("bbPercent"),
            "sma20": indicators.get("sma20"),
            "sma50": indicators.get("sma50"),
            "sma200": indicators.get("sma200"),
            "ema20": indicators.get("ema20"),
            "ema50": indicators.get("ema50"),
            "relStrength63d": indicators.get("relStrength63d"),
            "priceVsSma200": indicators.get("priceVsSma200"),
            "trendStrength": indicators.get("trendStrength"),
        },
    }


def main() -> int:
    start_time = time.time()
    root = Path(__file__).resolve().parents[2]
    out_dir = root / "public" / "data" / "rvci"
    now = datetime.now(timezone.utc)

    cal = mcal.get_calendar("XNYS")
    today = now.date()
    schedule = cal.schedule(start_date=today, end_date=today)
    if schedule.empty:
        payload = build_envelope(
            feature=FEATURE_ID,
            meta={"status": "SKIPPED_MARKET_CLOSED", "reason": "SKIPPED_MARKET_CLOSED", "generatedAt": _iso(now)},
            data={"status": "SKIPPED_MARKET_CLOSED", "notes": "Market closed (non-trading day)."},
            ok=False,
            warnings=["MARKET_CLOSED"],
            error=None,
        )
        write_health(out_dir, payload)
        return 0

    close_time = schedule["market_close"].iloc[0]
    if now < close_time.to_pydatetime().astimezone(timezone.utc):
        payload = build_envelope(
            feature=FEATURE_ID,
            meta={"status": "SKIPPED_MARKET_CLOSED", "reason": "SKIPPED_MARKET_CLOSED", "generatedAt": _iso(now)},
            data={"status": "SKIPPED_MARKET_CLOSED", "notes": "Market close not reached yet."},
            ok=False,
            warnings=["MARKET_NOT_CLOSED"],
            error=None,
        )
        write_health(out_dir, payload)
        return 0

    universe = build_universe(root)
    tier_a = universe["tiers"]["A"]
    tier_b = universe["tiers"]["B"]

    warnings: List[str] = ["FUNDAMENTALS_DISABLED_FREE_TIER"]
    if universe.get("tierBSampled"):
        warnings.append("TIER_B_SAMPLED")

    fetch_symbols = sorted(set(tier_a + tier_b + ["SPY", "^VIX"]))
    start, end = default_window()
    prices, missing, errors = fetch_ohlcv(fetch_symbols, start, end)

    spy_df = prices.pop("SPY", None)
    vix_df = prices.pop("^VIX", None)

    if spy_df is None:
        warnings.append("SPY_MISSING")
    if vix_df is None:
        warnings.append("VIX_MISSING")

    spy_indicators = compute_indicators(spy_df) if spy_df is not None else {}
    vix_last = None
    if vix_df is not None and not vix_df.empty:
        vix_last = float(vix_df["Close"].iloc[-1])

    indicators_by_symbol: Dict[str, dict] = {}
    triggers_by_symbol: Dict[str, List[str]] = {}
    received_symbols = set()

    for symbol in tier_a + tier_b:
        frame = prices.get(symbol)
        if frame is None or frame.empty:
            continue
        indicators = compute_indicators(frame, spy_df["Close"] if spy_df is not None else None)
        if not indicators:
            continue
        indicators_by_symbol[symbol] = indicators
        triggers_by_symbol[symbol] = compute_triggers(indicators)
        received_symbols.add(symbol)

    score_df = compute_scores(indicators_by_symbol)
    if score_df.empty:
        error_payload = build_envelope(
            feature=FEATURE_ID,
            meta={"status": "ERROR", "reason": "NO_DATA", "generatedAt": _iso(now)},
            data={"message": "No usable price data"},
            ok=False,
            warnings=warnings + ["NO_DATA"],
            error={"code": "NO_DATA", "message": "No usable price data"},
        )
        write_health(out_dir, error_payload)
        return 0

    validation = evaluate_coverage({"A": tier_a, "B": tier_b}, received_symbols)
    meta_status = validation["status"]
    meta_reason = validation["reason"]

    latest_date = _extract_latest_date(prices)
    data_as_of = _iso(latest_date) if latest_date else _iso(now)
    market_date = data_as_of.split("T")[0]
    generated_at = _iso(now)
    regime = _determine_regime(spy_indicators, vix_last)

    meta = {
        "status": meta_status,
        "reason": meta_reason,
        "marketDate": market_date,
        "dataAsOf": data_as_of,
        "generatedAt": generated_at,
        "regime": regime,
        "tierStatus": validation["tierStatus"],
        "coveragePct": validation["coveragePct"],
        "universe": validation["universe"],
        "bias": universe["bias"],
        "source": {"prices": "yfinance", "universe": "data/symbols"},
    }

    def build_top(score_key: str) -> List[dict]:
        subset = score_df.sort_values(by=[score_key, "symbol"], ascending=[False, True]).head(100)
        items: List[dict] = []
        for symbol, row in subset.iterrows():
            indicators = indicators_by_symbol.get(symbol, {})
            triggers = triggers_by_symbol.get(symbol, [])
            items.append(_build_entry(symbol, row[score_key], indicators, triggers))
        return items

    top_short = build_top("score_short")
    top_mid = build_top("score_mid")
    top_long = build_top("score_long")

    triggers_sorted = sorted(
        (
            {
                "symbol": symbol,
                "triggerScore": len(triggers_by_symbol.get(symbol, [])),
                "notes": triggers_by_symbol.get(symbol, []),
            }
            for symbol in received_symbols
        ),
        key=lambda item: (-item["triggerScore"], item["symbol"]),
    )
    top_triggers = [item for item in triggers_sorted if item["triggerScore"] > 0][:100]

    write_top_file(out_dir, "rvci_top_short", FEATURE_ID, meta, top_short, warnings)
    write_top_file(out_dir, "rvci_top_mid", FEATURE_ID, meta, top_mid, warnings)
    write_top_file(out_dir, "rvci_top_long", FEATURE_ID, meta, top_long, warnings)
    write_top_file(out_dir, "rvci_triggers", FEATURE_ID, meta, top_triggers, warnings)

    universe_meta = build_envelope(
        feature=FEATURE_ID,
        meta={"generatedAt": generated_at, "status": meta_status, "reason": meta_reason},
        data={
            "tiers": {"A": tier_a, "B": tier_b},
            "sources": universe["sources"],
            "bias": universe["bias"],
        },
        ok=True,
        warnings=warnings,
        error=None,
    )
    write_universe_meta(out_dir, universe_meta)

    anomalies = _compute_anomalies(score_df)
    runtime_sec = round(time.time() - start_time, 2)
    health_payload = build_envelope(
        feature=FEATURE_ID,
        meta={**meta, "runtimeSec": runtime_sec},
        data={
            "coverage": validation,
            "missingSample": {
                "A": validation["missing"]["A"][:25],
                "B": validation["missing"]["B"][:25],
            },
            "errors": errors,
            "anomalies": anomalies,
        },
        ok=meta_status != "ERROR",
        warnings=warnings,
        error=None if meta_status != "ERROR" else {"code": meta_reason, "message": "RVCI error"},
    )
    write_health(out_dir, health_payload)

    latest_payload = build_envelope(
        feature=FEATURE_ID,
        meta=meta,
        data={
            "paths": {
                "short": "data/rvci/rvci_top_short.json",
                "mid": "data/rvci/rvci_top_mid.json",
                "long": "data/rvci/rvci_top_long.json",
                "triggers": "data/rvci/rvci_triggers.json",
                "health": "data/rvci/health.json",
                "universe": "data/rvci/universe_meta.json",
            },
            "counts": {
                "short": len(top_short),
                "mid": len(top_mid),
                "long": len(top_long),
                "triggers": len(top_triggers),
            },
        },
        ok=meta_status != "ERROR",
        warnings=warnings,
        error=None if meta_status != "ERROR" else {"code": meta_reason, "message": "RVCI error"},
    )
    write_latest(out_dir, latest_payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
