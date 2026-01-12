from __future__ import annotations

from typing import Dict, List


def compute_triggers(indicators: Dict[str, float | None]) -> List[str]:
    triggers: List[str] = []
    rsi = indicators.get("rsi14")
    macd = indicators.get("macdHist")
    rvol = indicators.get("rvol20")
    bb = indicators.get("bbPercent")
    price_vs_sma200 = indicators.get("priceVsSma200")

    if rsi is not None and rsi <= 30:
        triggers.append("RSI_OVERSOLD")
    if rsi is not None and rsi >= 70:
        triggers.append("RSI_OVERBOUGHT")
    if macd is not None and macd > 0:
        triggers.append("MACD_BULLISH")
    if rvol is not None and rvol >= 1.5:
        triggers.append("RVOL_SPIKE")
    if bb is not None and bb > 1:
        triggers.append("BB_BREAKOUT")
    if price_vs_sma200 is not None and price_vs_sma200 > 0:
        triggers.append("ABOVE_SMA200")

    return triggers
