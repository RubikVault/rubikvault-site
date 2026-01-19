export function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

export function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    emaVal = v * k + emaVal * (1 - k);
  }
  return emaVal;
}

export function rsiWilder(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(values) {
  if (!values || values.length < 35) return null;
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  if (!Number.isFinite(ema12) || !Number.isFinite(ema26)) return null;
  const macdLine = ema12 - ema26;
  const macdSeries = [];
  const k = 2 / (9 + 1);
  let emaSignal = 0;
  for (let i = 0; i < values.length; i += 1) {
    const slice = values.slice(0, i + 1);
    if (slice.length < 26) continue;
    const e12 = ema(slice, 12);
    const e26 = ema(slice, 26);
    if (!Number.isFinite(e12) || !Number.isFinite(e26)) continue;
    macdSeries.push(e12 - e26);
  }
  if (!macdSeries.length) return null;
  emaSignal = macdSeries[0];
  for (let i = 1; i < macdSeries.length; i += 1) {
    emaSignal = macdSeries[i] * k + emaSignal * (1 - k);
  }
  return { value: macdLine, signal: emaSignal, histogram: macdLine - emaSignal };
}

export function atrPercent(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || closes.length < period + 1) return null;
  let trSum = 0;
  let count = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    if (i <= 0) continue;
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    if (![high, low, prevClose].every(Number.isFinite)) continue;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
    count += 1;
  }
  if (!count) return null;
  const avgTr = trSum / count;
  const latestClose = closes[closes.length - 1];
  if (!Number.isFinite(latestClose) || latestClose === 0) return null;
  return (avgTr / latestClose) * 100;
}

export function pctChange(latest, previous) {
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) return null;
  return (latest / previous - 1) * 100;
}

export function avg(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / period;
}

export function alphaScore({ close, sma20, sma50, sma200, rsi, macdVal, macdSignal, macdHist, rvol20, prevClose }) {
  let score = 50;
  let setupScore = 0;
  let triggerScore = 0;
  const reasons = [];
  const setupReasons = [];
  const triggerReasons = [];
  
  // Setup Score (0-40): Based on entry conditions (RSI extremes, BB, SMA200 proximity, RVOL, extreme gate)
  if (Number.isFinite(rsi)) {
    if (rsi <= 30) {
      setupScore += 10;
      reasons.push("RSI_OVERSOLD");
      setupReasons.push("RSI_OVERSOLD");
    } else if (rsi > 30 && rsi < 45) {
      setupScore += 5;
      reasons.push("RSI_RECOVERY");
      setupReasons.push("RSI_RECOVERY");
    } else if (rsi >= 45 && rsi <= 65) {
      setupScore += 5;
      reasons.push("RSI_NEUTRAL");
    } else if (rsi > 65 && rsi < 75) {
      reasons.push("RSI_EXTENDED");
    } else if (rsi >= 75) {
      reasons.push("RSI_OVERBOUGHT");
    }
  }
  
  // Near SMA200 (setup condition)
  if (Number.isFinite(close) && Number.isFinite(sma200)) {
    const distFromSma200 = Math.abs((close - sma200) / sma200);
    if (distFromSma200 < 0.05) { // Within 5% of SMA200
      setupScore += 8;
      setupReasons.push("NEAR_SMA200");
    }
  }
  
  // RVOL >= 1.5 (setup condition)
  if (Number.isFinite(rvol20) && rvol20 >= 1.5) {
    setupScore += 7;
    setupReasons.push("RVOL_GE_15");
  }
  
  // Trend strength (affects both setup and trigger)
  if (Number.isFinite(close) && Number.isFinite(sma20) && Number.isFinite(sma50) && Number.isFinite(sma200)) {
    if (close > sma20 && close > sma50 && close > sma200) {
      score += 15;
      triggerScore += 10; // Strong trend helps trigger
      reasons.push("TREND_STRONG");
      triggerReasons.push("TREND_STRONG");
    } else if (close > sma50 && close > sma200) {
      score += 10;
      triggerScore += 5;
      reasons.push("TREND_UP");
      triggerReasons.push("TREND_UP");
    } else if (close > sma200) {
      score += 5;
      reasons.push("TREND_UP_200");
    } else if (close < sma200) {
      score -= 10;
      reasons.push("TREND_DOWN");
    }
  }
  
  // MACD (affects trigger more than setup)
  if (Number.isFinite(macdVal) && Number.isFinite(macdSignal) && Number.isFinite(macdHist)) {
    if (macdVal > macdSignal && macdHist > 0) {
      score += 10;
      triggerScore += 8;
      reasons.push("MACD_POSITIVE");
      triggerReasons.push("MACD_POSITIVE");
    } else if (macdHist < 0) {
      score -= 10;
      reasons.push("MACD_NEGATIVE");
    }
  }
  
  // RVOL confirm (trigger condition)
  if (Number.isFinite(rvol20) && rvol20 > 1.5 && Number.isFinite(close) && Number.isFinite(prevClose) && close > prevClose) {
    score += 5;
    triggerScore += 5;
    reasons.push("RVOL_CONFIRM");
    triggerReasons.push("VOL_CONFIRM_12x");
  }
  
  // Clamp scores
  setupScore = clamp(setupScore, 0, 40);
  triggerScore = clamp(triggerScore, 0, 60);
  const totalScore = clamp(score, 0, 100);
  
  // Ensure totalScore = setupScore + triggerScore (approximately)
  // If they don't add up, adjust triggerScore to match
  const expectedTotal = setupScore + triggerScore;
  if (Math.abs(totalScore - expectedTotal) > 5) {
    // Adjust triggerScore to make totalScore match setupScore + triggerScore
    triggerScore = Math.max(0, Math.min(60, totalScore - setupScore));
  }
  
  return { 
    score: totalScore, 
    setupScore, 
    triggerScore, 
    reasons,
    setupReasons,
    triggerReasons
  };
}

export function deriveRegime({ breadth50, breadth200, prevState }) {
  let newRegime = prevState.currentRegime || "neutral";
  if (breadth50 >= 0.65 && breadth200 >= 0.65) newRegime = "bull";
  else if (breadth50 <= 0.35 && breadth200 <= 0.35) newRegime = "bear";
  else if (breadth50 >= 0.45 && breadth50 <= 0.55 && breadth200 >= 0.45 && breadth200 <= 0.55) newRegime = "neutral";

  let { pendingRegime, pendingCount } = prevState;
  let currentRegime = prevState.currentRegime || "neutral";
  let confidence = "confirmed";
  let daysSinceChange = prevState.daysSinceChange || 0;

  if (newRegime === currentRegime) {
    pendingRegime = null;
    pendingCount = 0;
    daysSinceChange += 1;
  } else {
    if (pendingRegime === newRegime) {
      pendingCount += 1;
    } else {
      pendingRegime = newRegime;
      pendingCount = 1;
    }
    confidence = "tentative";
    if (pendingCount >= 3) {
      currentRegime = newRegime;
      pendingRegime = null;
      pendingCount = 0;
      daysSinceChange = 0;
      confidence = "confirmed";
    }
  }
  return {
    currentRegime,
    pendingRegime,
    pendingCount,
    confidence,
    daysSinceChange
  };
}
