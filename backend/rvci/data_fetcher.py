from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import pandas as pd
import yfinance as yf


def _chunked(items: List[str], size: int) -> List[List[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def default_window(days: int = 420) -> Tuple[datetime, datetime]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start, end


def fetch_ohlcv(
    symbols: List[str],
    start: datetime,
    end: datetime,
    batch_size: int = 200,
) -> Tuple[Dict[str, pd.DataFrame], List[str], List[str]]:
    prices: Dict[str, pd.DataFrame] = {}
    missing: List[str] = []
    errors: List[str] = []

    for batch in _chunked(symbols, batch_size):
        try:
            data = yf.download(
                batch,
                start=start,
                end=end,
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False,
            )
        except Exception as exc:
            errors.append(f"batch_error:{exc}")
            missing.extend(batch)
            continue

        if data is None or data.empty:
            missing.extend(batch)
            continue

        if isinstance(data.columns, pd.MultiIndex):
            for symbol in batch:
                if symbol not in data.columns.levels[0]:
                    missing.append(symbol)
                    continue
                frame = data[symbol].dropna(how="all")
                if frame.empty:
                    missing.append(symbol)
                    continue
                prices[symbol] = frame
        else:
            symbol = batch[0]
            frame = data.dropna(how="all")
            if frame.empty:
                missing.append(symbol)
            else:
                prices[symbol] = frame

    return prices, missing, errors


def fetch_market_proxies(
    start: datetime, end: datetime
) -> Tuple[pd.DataFrame | None, pd.DataFrame | None]:
    spy_df, _, _ = fetch_ohlcv(["SPY"], start, end, batch_size=1)
    vix_df, _, _ = fetch_ohlcv(["^VIX"], start, end, batch_size=1)
    spy = spy_df.get("SPY")
    vix = vix_df.get("^VIX")
    return spy, vix
