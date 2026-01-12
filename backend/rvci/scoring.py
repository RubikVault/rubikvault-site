from __future__ import annotations

from typing import Dict

import pandas as pd


def _pct(series: pd.Series) -> pd.Series:
    ranked = series.rank(pct=True)
    return ranked.fillna(0.5)


def compute_scores(indicators_by_symbol: Dict[str, dict]) -> pd.DataFrame:
    if not indicators_by_symbol:
        return pd.DataFrame()
    df = pd.DataFrame.from_dict(indicators_by_symbol, orient="index")
    df.index.name = "symbol"

    pct_rsi = _pct(df["rsi14"])
    pct_macd = _pct(df["macdHist"])
    pct_rvol = _pct(df["rvol20"])
    pct_bb = _pct(df["bbPercent"])
    pct_rel = _pct(df["relStrength63d"])
    pct_trend = _pct(df["trendStrength"])
    pct_long = _pct(df["return252d"])
    pct_sma200 = _pct(df["priceVsSma200"])

    df["score_short"] = (
        0.25 * pct_rsi
        + 0.25 * pct_macd
        + 0.25 * pct_rvol
        + 0.25 * pct_bb
    ) * 100
    df["score_mid"] = (
        0.4 * pct_rel + 0.3 * pct_trend + 0.3 * pct_macd
    ) * 100
    df["score_long"] = (
        0.4 * pct_sma200 + 0.3 * pct_long + 0.3 * pct_rel
    ) * 100

    return df
