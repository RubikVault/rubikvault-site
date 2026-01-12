from __future__ import annotations

from typing import Dict, Optional

import numpy as np
import pandas as pd


def _safe_float(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        if np.isnan(value):
            return None
    except Exception:
        pass
    return float(value)


def _rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0).rolling(window).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window).mean()
    rs = gain / loss.replace({0: np.nan})
    return 100 - (100 / (1 + rs))


def _macd(series: pd.Series) -> pd.Series:
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return macd - signal


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, window: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            (high - low).abs(),
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(window).mean()


def _bollinger(series: pd.Series, window: int = 20, num_std: float = 2.0) -> Dict[str, pd.Series]:
    mid = series.rolling(window).mean()
    std = series.rolling(window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    pct_b = (series - lower) / (upper - lower)
    width = (upper - lower) / mid
    return {"pct_b": pct_b, "width": width}


def compute_indicators(
    df: pd.DataFrame, spy_close: Optional[pd.Series] = None
) -> Dict[str, float | None]:
    if df is None or df.empty:
        return {}
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    volume = df["Volume"].astype(float)

    if len(close) < 20:
        return {}

    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean()
    ema20 = close.ewm(span=20, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()
    rsi14 = _rsi(close, 14)
    macd_hist = _macd(close)
    atr14 = _atr(high, low, close, 14)
    bb = _bollinger(close, 20, 2.0)
    rvol20 = volume / volume.rolling(20).mean()

    change_pct = None
    if len(close) >= 2:
        change_pct = (close.iloc[-1] / close.iloc[-2] - 1) * 100

    rel_strength_63d = None
    if spy_close is not None and not spy_close.empty:
        ratio = close / spy_close.reindex(close.index).ffill()
        if len(ratio) >= 64:
            rel_strength_63d = ratio.iloc[-1] / ratio.iloc[-64] - 1

    long_return = None
    if len(close) >= 252:
        long_return = close.iloc[-1] / close.iloc[-252] - 1

    price_vs_sma200 = None
    if len(sma200.dropna()) > 0:
        price_vs_sma200 = close.iloc[-1] / sma200.iloc[-1] - 1

    trend_strength = None
    if len(sma50.dropna()) >= 21:
        trend_strength = sma50.iloc[-1] / sma50.iloc[-21] - 1

    return {
        "close": _safe_float(close.iloc[-1]),
        "changePct": _safe_float(change_pct),
        "sma20": _safe_float(sma20.iloc[-1]),
        "sma50": _safe_float(sma50.iloc[-1]),
        "sma200": _safe_float(sma200.iloc[-1]),
        "ema20": _safe_float(ema20.iloc[-1]),
        "ema50": _safe_float(ema50.iloc[-1]),
        "rsi14": _safe_float(rsi14.iloc[-1]),
        "macdHist": _safe_float(macd_hist.iloc[-1]),
        "atr14": _safe_float(atr14.iloc[-1]),
        "bbPercent": _safe_float(bb["pct_b"].iloc[-1]),
        "bbWidth": _safe_float(bb["width"].iloc[-1]),
        "rvol20": _safe_float(rvol20.iloc[-1]),
        "relStrength63d": _safe_float(rel_strength_63d),
        "return252d": _safe_float(long_return),
        "priceVsSma200": _safe_float(price_vs_sma200),
        "trendStrength": _safe_float(trend_strength),
    }
