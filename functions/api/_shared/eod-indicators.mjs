function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  if (!Number.isFinite(m)) return null;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return mean(slice);
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = mean(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) {
    current = values[i] * k + current * (1 - k);
  }
  return current;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  // Wilder smoothing: seed with SMA of first `period` deltas, then smooth forward
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return { macd: null, signal: null, hist: null };
  const macdSeries = [];
  for (let i = 0; i < closes.length; i += 1) {
    const sub = closes.slice(0, i + 1);
    const fastEma = ema(sub, fast);
    const slowEma = ema(sub, slow);
    if (fastEma == null || slowEma == null) continue;
    macdSeries.push(fastEma - slowEma);
  }
  if (macdSeries.length < signal) return { macd: null, signal: null, hist: null };
  const macdValue = macdSeries[macdSeries.length - 1];
  const signalValue = ema(macdSeries, signal);
  const hist = signalValue == null ? null : macdValue - signalValue;
  return { macd: macdValue, signal: signalValue, hist };
}

function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return { mid: null, upper: null, lower: null };
  const window = closes.slice(closes.length - period);
  const mid = mean(window);
  const sd = stddev(window);
  if (mid == null || sd == null) return { mid: null, upper: null, lower: null };
  return { mid, upper: mid + mult * sd, lower: mid - mult * sd };
}

function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  // Wilder smoothing: compute all TRs, seed with SMA of first `period`, then smooth forward
  const trs = [];
  for (let i = 1; i < bars.length; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const high = cur?.high;
    const low = cur?.low;
    const prevClose = prev?.close;
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(prevClose)) return null;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return null;
  let val = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i += 1) {
    val = (val * (period - 1) + trs[i]) / period;
  }
  return val;
}

function returns(closes, days) {
  if (closes.length < days + 1) return { abs: null, pct: null };
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - days];
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return { abs: null, pct: null };
  const abs = last - prev;
  return { abs, pct: abs / prev };
}

function volatility(closes, period = 20) {
  if (closes.length < period + 1) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev === 0) return null;
    rets.push(Math.log(cur / prev));
  }
  return stddev(rets);
}

function adjustedBarForIndicators(bar) {
  const close = Number.isFinite(bar?.close) ? Number(bar.close) : null;
  const adjClose = Number.isFinite(bar?.adjClose) ? Number(bar.adjClose) : close;
  if (!Number.isFinite(adjClose)) return null;

  // Preserve split-adjusted geometry using the close -> adjClose ratio when available.
  const factor = Number.isFinite(close) && close !== 0 ? adjClose / close : 1;
  const open = Number.isFinite(bar?.open) ? Number(bar.open) * factor : null;
  const high = Number.isFinite(bar?.high) ? Number(bar.high) * factor : null;
  const low = Number.isFinite(bar?.low) ? Number(bar.low) * factor : null;

  return {
    ...bar,
    close: adjClose,
    open,
    high,
    low
  };
}

export function computeIndicators(bars) {
  const issues = [];
  const cleanBars = Array.isArray(bars) ? bars.filter(Boolean) : [];
  if (cleanBars.length < 2) {
    issues.push('INSUFFICIENT_HISTORY');
  }

  const barsForCalc = cleanBars.map(adjustedBarForIndicators).filter(Boolean);
  const closes = barsForCalc.map((b) => b.close).filter((v) => Number.isFinite(v));
  const volumes = cleanBars.map((b) => b.volume).filter((v) => Number.isFinite(v));
  const latest = barsForCalc.length ? barsForCalc[barsForCalc.length - 1] : null;
  const latestRaw = cleanBars.length ? cleanBars[cleanBars.length - 1] : null;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const macdOut = macd(closes, 12, 26, 9);
  const bb = bollinger(closes, 20, 2);
  const atr14 = atr(barsForCalc, 14);
  const ret1 = returns(closes, 1);
  const ret5 = returns(closes, 5);
  const ret20 = returns(closes, 20);
  const vol20 = volatility(closes, 20);

  const lookback252 = barsForCalc.slice(Math.max(0, barsForCalc.length - 252));
  const highs = lookback252.map((b) => Number.isFinite(b.high) ? b.high : b.close).filter((v) => Number.isFinite(v));
  const lows = lookback252.map((b) => Number.isFinite(b.low) ? b.low : b.close).filter((v) => Number.isFinite(v));
  const high52w = highs.length ? Math.max(...highs) : null;
  const low52w = lows.length ? Math.min(...lows) : null;
  const range52wWidthPct =
    Number.isFinite(high52w) && Number.isFinite(low52w) && high52w !== 0 ? (high52w - low52w) / high52w : null;
  const close = closes.length ? closes[closes.length - 1] : null;
  const position52w = (high52w > low52w && Number.isFinite(close))
    ? (close - low52w) / (high52w - low52w)
    : null;

  const avgVol20 = sma(volumes, 20);
  const volumeRatio20 =
    Number.isFinite(latestRaw?.volume) && Number.isFinite(avgVol20) && avgVol20 !== 0 ? latestRaw.volume / avgVol20 : null;

  const closeToSma20Pct =
    Number.isFinite(latest?.close) && Number.isFinite(sma20) && sma20 !== 0 ? (latest.close - sma20) / sma20 : null;
  const closeToSma200Pct =
    Number.isFinite(latest?.close) && Number.isFinite(sma200) && sma200 !== 0
      ? (latest.close - sma200) / sma200
      : null;

  // === NEW SCIENTIFIC INDICATORS ===

  // Rolling Std (20d) — standard deviation of close prices
  const rollingStd20 = closes.length >= 20 ? stddev(closes.slice(closes.length - 20)) : null;

  // Log Return (1d) — natural log of price ratio
  const logReturn1d = closes.length >= 2
    ? (() => {
      const cur = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
      return Math.log(cur / prev);
    })()
    : null;

  // Lag-1 Autocorrelation — AR(1) correlation of log returns
  const lag1Autocorrelation = (() => {
    if (closes.length < 22) return null;
    const logReturns = [];
    for (let i = closes.length - 21; i < closes.length; i++) {
      const prev = closes[i - 1];
      const cur = closes[i];
      if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0) continue;
      logReturns.push(Math.log(cur / prev));
    }
    if (logReturns.length < 10) return null;
    const returnsT = logReturns.slice(0, -1);
    const returnsTM1 = logReturns.slice(1);
    const n = Math.min(returnsT.length, returnsTM1.length);
    if (n < 5) return null;
    const meanT = returnsT.reduce((sum, v) => sum + v, 0) / n;
    const meanTM1 = returnsTM1.reduce((sum, v) => sum + v, 0) / n;
    let cov = 0, varT = 0, varTM1 = 0;
    for (let i = 0; i < n; i++) {
      cov += (returnsT[i] - meanT) * (returnsTM1[i] - meanTM1);
      varT += (returnsT[i] - meanT) ** 2;
      varTM1 += (returnsTM1[i] - meanTM1) ** 2;
    }
    const denom = Math.sqrt(varT * varTM1);
    return denom > 0 ? cov / denom : null;
  })();

  // Volume MA (20d) — rolling average of volume
  const volumeMa20 = volumes.length >= 20 ? mean(volumes.slice(volumes.length - 20)) : null;

  // Volatility Percentile (252d) — ATR percentile rank
  const volatilityPercentile = (() => {
    if (!Number.isFinite(atr14) || cleanBars.length < 60) return null;
    const atrValues = [];
    for (let i = 14; i < Math.min(cleanBars.length, 252); i++) {
      const atrVal = atr(barsForCalc.slice(0, i + 1), 14);
      if (Number.isFinite(atrVal)) atrValues.push(atrVal);
    }
    if (atrValues.length < 30) return null;
    const countBelow = atrValues.filter((v) => v < atr14).length;
    return (countBelow / atrValues.length) * 100;
  })();

  // === END NEW SCIENTIFIC INDICATORS ===

  // === DERIVED METRICS (moved from frontend) ===

  // ADV20 Dollar Volume
  const adv20Dollar = Number.isFinite(avgVol20) && Number.isFinite(latest?.close)
    ? avgVol20 * latest.close : null;

  // Liquidity Score (ported from stock-features.js buildLiquidityScore)
  const liquidityScore = (() => {
    if (!Number.isFinite(adv20Dollar)) return null;
    let score = 50;
    if (adv20Dollar > 1e9) score += 30;
    else if (adv20Dollar > 1e8) score += 20;
    else if (adv20Dollar > 1e7) score += 10;
    // Gap risk
    const gapBars = barsForCalc.slice(-60);
    if (gapBars.length > 1) {
      const gaps = [];
      for (let i = 1; i < gapBars.length; i++) {
        const prev = gapBars[i - 1].close;
        const cur = gapBars[i].open;
        if (Number.isFinite(prev) && Number.isFinite(cur) && prev !== 0) {
          gaps.push(Math.abs((cur - prev) / prev));
        }
      }
      if (gaps.length > 0) {
        const avgGap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
        if (avgGap < 0.005) score += 15;
        else if (avgGap > 0.02) score -= 15;
      }
    }
    if (Number.isFinite(avgVol20) && avgVol20 > 1e6) score += 5;
    return Math.max(0, Math.min(100, score));
  })();

  // Average Gap Percentage
  const avgGapPct = (() => {
    const gapBars = barsForCalc.slice(-60);
    if (gapBars.length < 2) return null;
    const gaps = [];
    for (let i = 1; i < gapBars.length; i++) {
      const prev = gapBars[i - 1].close;
      const cur = gapBars[i].open;
      if (Number.isFinite(prev) && Number.isFinite(cur) && prev !== 0) {
        gaps.push(Math.abs((cur - prev) / prev));
      }
    }
    return gaps.length > 0 ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;
  })();

  // Trend Duration (consecutive days in current trend phase)
  const trendDurationDays = (() => {
    if (closes.length < 210) return null;
    const sma20Arr = [], sma50Arr = [], sma200Arr = [];
    for (let i = 199; i < closes.length; i++) {
      sma20Arr.push(mean(closes.slice(i - 19, i + 1)));
      sma50Arr.push(mean(closes.slice(Math.max(0, i - 49), i + 1)));
      sma200Arr.push(mean(closes.slice(i - 199, i + 1)));
    }
    let currentState = null, duration = 0;
    for (let i = 0; i < sma20Arr.length; i++) {
      const c = closes[i + 199];
      const s20 = sma20Arr[i], s50 = sma50Arr[i], s200 = sma200Arr[i];
      if (!Number.isFinite(s20) || !Number.isFinite(s50) || !Number.isFinite(s200)) continue;
      const slope = s50 !== 0 ? (s20 - s50) / s50 : 0;
      let state;
      if (c > s20 && s20 > s50 && s50 > s200 && slope > 0) state = 'UP';
      else if (c < s20 && s20 < s50 && s50 < s200 && slope < 0) state = 'DOWN';
      else state = 'RANGE';
      if (state === currentState) duration++;
      else { currentState = state; duration = 1; }
    }
    return duration;
  })();

  // Volatility Compression Ratio (20d/60d)
  const volCompression2060 = (() => {
    if (closes.length < 61) return null;
    const rets20 = [], rets60 = [];
    for (let i = closes.length - 20; i < closes.length; i++) {
      if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1]) && closes[i - 1] !== 0) {
        rets20.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    for (let i = closes.length - 60; i < closes.length; i++) {
      if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1]) && closes[i - 1] !== 0) {
        rets60.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    const std20 = stddev(rets20);
    const std60 = stddev(rets60);
    if (!Number.isFinite(std20) || !Number.isFinite(std60) || std60 === 0) return null;
    return std20 / std60;
  })();

  // Breakout Energy (ported from frontend)
  const breakoutEnergy = (() => {
    if (closes.length < 61 || volumes.length < 21) return null;
    const rets20 = [], rets60 = [];
    for (let i = closes.length - 20; i < closes.length; i++) {
      if (closes[i - 1] > 0) rets20.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    for (let i = closes.length - 60; i < closes.length; i++) {
      if (closes[i - 1] > 0) rets60.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const std20 = stddev(rets20);
    const std60 = stddev(rets60);
    if (!Number.isFinite(std20) || !Number.isFinite(std60) || std60 === 0) return null;
    const compression = std20 / std60;

    const volRecent = volumes.slice(-5);
    const volPrior = volumes.slice(-20, -5);
    const avgRecent = volRecent.reduce((a, b) => a + b, 0) / 5;
    const avgPrior = volPrior.reduce((a, b) => a + b, 0) / 15;
    const volDryUp = avgPrior > 0 ? avgRecent / avgPrior : 1;

    const isEventDay = compression > 1.3;
    return isEventDay
      ? Math.max(0, Math.min(100, Math.round(50 + (compression - 1) * 30 + (volDryUp > 1.5 ? 20 : 0))))
      : Math.max(0, Math.min(100, Math.round((1 - compression) * 50 + (1 - Math.min(1, volDryUp)) * 50)));
  })();

  // Z-Score vs SMA50 (ported from frontend)
  const zScoreSma50 = (() => {
    if (closes.length < 60 || !Number.isFinite(sma50)) return null;
    const priceSeries = closes.slice(-60);
    const priceStd = stddev(priceSeries);
    if (!Number.isFinite(priceStd) || priceStd <= 0) return null;
    const latestClose = closes[closes.length - 1];
    return (latestClose - sma50) / priceStd;
  })();

  // Reversion Hint (oversold near support or overbought near resistance)
  const reversionHint = (() => {
    if (!Number.isFinite(rsi14) || !Number.isFinite(sma20) || !Number.isFinite(sma200)) return 0;
    const c = closes[closes.length - 1];
    if (!Number.isFinite(c)) return 0;
    if (rsi14 < 30 && c < sma20 && c > sma200) return 1;
    if (rsi14 > 70 && c > sma20 && c < sma200) return 1;
    return 0;
  })();

  // Volume Dry-Up ratio (recent 5d avg volume / prior 15d avg)
  const volDryUpRatio = (() => {
    if (volumes.length < 20) return null;
    const volRecent = volumes.slice(-5);
    const volPrior = volumes.slice(-20, -5);
    const avgRecent = volRecent.reduce((a, b) => a + b, 0) / 5;
    const avgPrior = volPrior.reduce((a, b) => a + b, 0) / 15;
    return avgPrior > 0 ? avgRecent / avgPrior : 1;
  })();

  // Volume Dry-Up flag (volume and volatility both contracting)
  const volDryUp = (() => {
    if (!Number.isFinite(volumeRatio20) || !Number.isFinite(volCompression2060)) return 0;
    return (volumeRatio20 < 0.5 && volCompression2060 < 0.7) ? 1 : 0;
  })();

  // === END DERIVED METRICS ===

  const indicatorList = [
    // Price & Averages
    { id: 'sma20', value: sma20 },
    { id: 'sma50', value: sma50 },
    { id: 'sma200', value: sma200 },
    { id: 'ema12', value: ema12 },
    { id: 'ema26', value: ema26 },
    // Volatility & Scale
    { id: 'atr14', value: atr14 },
    { id: 'volatility_20d', value: vol20 },
    { id: 'rolling_std_20', value: rollingStd20 },
    { id: 'volatility_percentile', value: volatilityPercentile },
    // Trend & Direction
    { id: 'log_return_1d', value: logReturn1d },
    { id: 'lag1_autocorrelation', value: lag1Autocorrelation },
    // Bollinger Bands
    { id: 'bb_mid', value: bb.mid },
    { id: 'bb_upper', value: bb.upper },
    { id: 'bb_lower', value: bb.lower },
    // Momentum
    { id: 'rsi14', value: rsi14 },
    { id: 'macd', value: macdOut.macd },
    { id: 'macd_signal', value: macdOut.signal },
    { id: 'macd_hist', value: macdOut.hist },
    // Returns
    { id: 'ret_1d_abs', value: ret1.abs },
    { id: 'ret_1d_pct', value: ret1.pct },
    { id: 'ret_5d_abs', value: ret5.abs },
    { id: 'ret_5d_pct', value: ret5.pct },
    { id: 'ret_20d_abs', value: ret20.abs },
    { id: 'ret_20d_pct', value: ret20.pct },
    // 52-Week Range
    { id: 'high_52w', value: high52w },
    { id: 'low_52w', value: low52w },
    { id: 'range_52w_pct', value: position52w },
    { id: 'range_52w_width_pct', value: range52wWidthPct },
    { id: 'position_in_52w_range', value: position52w },
    // Volume
    { id: 'avg_volume_20d', value: avgVol20 },
    { id: 'volume_ma_20', value: volumeMa20 },
    { id: 'volume_ratio_20d', value: volumeRatio20 },
    // Distance to SMAs
    { id: 'close_to_sma20_pct', value: closeToSma20Pct },
    { id: 'close_to_sma200_pct', value: closeToSma200Pct },
    // Derived Metrics (moved from frontend)
    { id: 'adv20_dollar', value: adv20Dollar },
    { id: 'liquidity_score', value: liquidityScore },
    { id: 'avg_gap_pct', value: avgGapPct },
    { id: 'trend_duration_days', value: trendDurationDays },
    { id: 'vol_compression_20_60', value: volCompression2060 },
    { id: 'breakout_energy', value: breakoutEnergy },
    { id: 'z_score_sma50', value: zScoreSma50 },
    { id: 'reversion_hint', value: reversionHint },
    { id: 'vol_dry_up', value: volDryUp },
    { id: 'vol_dry_up_ratio', value: volDryUpRatio }
  ];

  const nullCount = indicatorList.filter((i) => i.value == null || !Number.isFinite(i.value)).length;
  if (nullCount > 0) {
    issues.push('INSUFFICIENT_HISTORY');
  }

  const normalizedIndicators = indicatorList.map((item) => {
    const value = Number.isFinite(item.value) ? item.value : null;
    return { id: item.id, value };
  });

  return { indicators: normalizedIndicators, issues: [...new Set(issues)] };
}

export { mean, stddev, sma };
