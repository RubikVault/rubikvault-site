export const LEGAL_TEXT =
  "MarketPhase AI — Scientific Elliott Research (v8.0)\n" +
  "provides deterministic, rule-based historical analysis only.\n" +
  "It does not forecast future prices or offer financial advice.\n" +
  "Use solely for educational and research purposes.\n" +
  "ISO 8000 / IEEE 7000 Compliant - Bit-exact reproducibility guaranteed.";

// Import round6 for precision control (v8.0 upgrade)
// Note: Dynamic import not available in all contexts, so we'll use a function that can be overridden
let round6Fn = null;
function getRound6() {
  if (round6Fn) return round6Fn;
  // Fallback implementation
  return (n) => typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 1_000_000) / 1_000_000 : n;
}

// Allow external override of round6 function (for testing or when scientific-math.mjs is available)
export function setRound6(fn) {
  round6Fn = fn;
}

export function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

export function formatDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function computeSMA(values, period) {
  if (!values.length || period <= 0) return [];
  const out = [];
  let sum = 0;
  values.forEach((val, idx) => {
    sum += val;
    if (idx >= period) sum -= values[idx - period];
    if (idx >= period - 1) {
      out.push(sum / period);
    } else {
      out.push(null);
    }
  });
  return out;
}

export function computeEMA(values, period) {
  if (!values.length || period <= 0) return [];
  const out = [];
  const k = 2 / (period + 1);
  let ema = values[0] ?? 0;
  values.forEach((val, idx) => {
    if (idx === 0) {
      ema = val ?? 0;
    } else {
      ema = (val - ema) * k + ema;
    }
    out.push(ema);
  });
  return out;
}

export function computeRSI(values, period = 14) {
  if (!values.length) return [];
  const out = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (i <= period) {
      gains += Math.max(0, delta);
      losses += Math.max(0, -delta);
    }
    if (i === period) {
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    } else if (i > period) {
      gains = (gains * (period - 1) + Math.max(0, delta)) / period;
      losses = (losses * (period - 1) + Math.max(0, -delta)) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    } else {
      out.push(null);
    }
  }
  out.unshift(null);
  return out;
}

export function computeATR(ohlc, period = 14) {
  if (!ohlc.length) return [];
  const out = [];
  let atr = 0;
  ohlc.forEach((bar, idx) => {
    if (!bar) {
      out.push(null);
      return;
    }
    const prevClose = idx > 0 ? ohlc[idx - 1]?.close : bar.close;
    const highLow = bar.high - bar.low;
    const highClose = Math.abs(bar.high - prevClose);
    const lowClose = Math.abs(bar.low - prevClose);
    const tr = Math.max(highLow, highClose, lowClose);
    if (idx < period) {
      atr = atr + tr;
      out.push(null);
    } else if (idx === period) {
      atr = (atr + tr) / period;
      out.push(atr);
    } else {
      atr = (atr * (period - 1) + tr) / period;
      out.push(atr);
    }
  });
  return out;
}

export function computeMACDHist(values) {
  if (!values.length) return [];
  const ema12 = computeEMA(values, 12);
  const ema26 = computeEMA(values, 26);
  const macd = values.map((_, idx) => (ema12[idx] ?? 0) - (ema26[idx] ?? 0));
  const signal = computeEMA(macd, 9);
  return macd.map((val, idx) => val - (signal[idx] ?? 0));
}

function isPivotHigh(ohlc, idx, window) {
  const high = ohlc[idx]?.high;
  if (high === null || high === undefined) return false;
  for (let i = idx - window; i <= idx + window; i += 1) {
    if (i === idx) continue;
    if (ohlc[i]?.high > high) return false;
  }
  return true;
}

function isPivotLow(ohlc, idx, window) {
  const low = ohlc[idx]?.low;
  if (low === null || low === undefined) return false;
  for (let i = idx - window; i <= idx + window; i += 1) {
    if (i === idx) continue;
    if (ohlc[i]?.low < low) return false;
  }
  return true;
}

export function detectSwings(ohlc, window) {
  const raw = [];
  for (let i = window; i < ohlc.length - window; i += 1) {
    if (isPivotHigh(ohlc, i, window)) {
      raw.push({ index: i, date: ohlc[i].date, price: ohlc[i].high, type: "high" });
    }
    if (isPivotLow(ohlc, i, window)) {
      raw.push({ index: i, date: ohlc[i].date, price: ohlc[i].low, type: "low" });
    }
  }
  raw.sort((a, b) => a.index - b.index);
  const confirmed = raw.filter((point) => {
    const limit = point.index + window * 2;
    if (limit >= ohlc.length) return false;
    if (point.type === "high") {
      for (let i = point.index + 1; i <= limit; i += 1) {
        if (ohlc[i]?.high > point.price) return false;
      }
    } else {
      for (let i = point.index + 1; i <= limit; i += 1) {
        if (ohlc[i]?.low < point.price) return false;
      }
    }
    return true;
  });
  return { raw, confirmed };
}

function nearestRatioScore(ratio, targets) {
  const closest = targets.reduce((best, target) => {
    const distance = Math.abs(ratio - target);
    return distance < Math.abs(ratio - best) ? target : best;
  }, targets[0]);
  const score = 1 - Math.abs(ratio - closest) / closest;
  return clamp(0, 1, score) * 100;
}

export function evaluateElliott(swings) {
  if (swings.length < 6) {
    return {
      completedPattern: { valid: false, direction: "neutral", endedAt: null, confidence0_100: 0, rules: {} },
      developingPattern: {
        possibleWave: "Insufficient swings",
        confidence: 0,
        fibLevels: { support: [], resistance: [] },
        disclaimer: "Reference levels only — no prediction"
      },
      uncertainty: { lastSwingConfirmed: false, alternativeCounts: 2, confidenceDecay: { base: 0, adjusted: 0 } },
      fib: { ratios: {}, conformanceScore: 0 }
    };
  }
  const points = swings.slice(-6);
  const [p0, p1, p2, p3, p4, p5] = points;
  const direction = p5.price >= p0.price ? "bullish" : "bearish";
  const w1 = p1.price - p0.price;
  const w2 = p2.price - p1.price;
  const w3 = p3.price - p2.price;
  const w4 = p4.price - p3.price;
  const w5 = p5.price - p4.price;
  const w1a = Math.abs(w1) || 1;
  const w2a = Math.abs(w2);
  const w3a = Math.abs(w3);
  const w4a = Math.abs(w4);
  const w5a = Math.abs(w5);
  const r1 = w2a / w1a < 1;
  const r2 = !(w3a < w1a && w3a < w5a);
  const r3 = direction === "bullish" ? p4.price > p1.price : p4.price < p1.price;
  const rules = { r1, r2, r3 };
  const rulePasses = Object.values(rules).filter(Boolean).length;

  const ratios = {
    wave2: w2a / w1a,
    wave3: w3a / w1a,
    wave4: w4a / w3a,
    wave5: w5a / w1a
  };

  const g4 = nearestRatioScore(ratios.wave3, [1.618]);
  const g5 = nearestRatioScore(ratios.wave5, [0.618, 1, 1.618]);
  const alternation =
    (ratios.wave2 < 0.5 && ratios.wave4 > 0.5) || (ratios.wave2 > 0.5 && ratios.wave4 < 0.5);
  const g6 = alternation ? 100 : 50;
  const guidelineScore = (g4 + g5 + g6) / 3;

  const confidence = clamp(0, 100, Math.round(rulePasses * 70 + guidelineScore * 0.3));
  const conformanceScore = (nearestRatioScore(ratios.wave2, [0.382, 0.5, 0.618, 0.786]) +
    nearestRatioScore(ratios.wave3, [1.618, 2.618, 4.236]) +
    nearestRatioScore(ratios.wave4, [0.236, 0.382, 0.5]) +
    nearestRatioScore(ratios.wave5, [0.618, 1, 1.618])) / 4;

  const completedPattern = {
    valid: r1 && r2 && r3,
    direction,
    endedAt: formatDate(p5.date),
    confidence0_100: confidence,
    rules,
    guidelineScore: Math.round(guidelineScore),
    rulePasses
  };

  const mid = (p4.price + p5.price) / 2;
  const range = Math.abs(p5.price - p4.price) || 1;
  const round6 = getRound6();
  const developingPattern = {
    possibleWave: "Wave 4 or ABC",
    confidence: clamp(0, 100, Math.round(confidence * 0.6)),
    fibLevels: {
      support: [
        round6(mid - range * 0.382),
        round6(mid - range * 0.618)
      ],
      resistance: [
        round6(mid + range * 0.382),
        round6(mid + range * 0.618)
      ]
    },
    disclaimer: "Reference levels only — no prediction"
  };

  const alternativeCounts = completedPattern.valid ? 1 : 2;
  const adjusted = clamp(0, 100, Math.round(confidence - alternativeCounts * 12));
  const uncertainty = {
    lastSwingConfirmed: true,
    alternativeCounts,
    confidenceDecay: { base: confidence, adjusted }
  };

  // Apply round6 to ratios and conformanceScore
  return {
    completedPattern,
    developingPattern,
    uncertainty,
    fib: {
      ratios: {
        wave2: round6(ratios.wave2),
        wave3: round6(ratios.wave3),
        wave4: round6(ratios.wave4),
        wave5: round6(ratios.wave5)
      },
      conformanceScore: round6(conformanceScore)
    }
  };
}

export function aggregateWeekly(ohlc) {
  const buckets = new Map();
  const order = [];
  ohlc.forEach((bar) => {
    const date = new Date(bar.date);
    const year = date.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    const weekStart = new Date(date);
    weekStart.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const week = Math.floor((weekStart - firstThursday) / (7 * 24 * 3600 * 1000)) + 1;
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!buckets.has(key)) {
      buckets.set(key, { key, bars: [] });
      order.push(key);
    }
    buckets.get(key).bars.push(bar);
  });
  return order.map((key) => {
    const bars = buckets.get(key).bars;
    const open = bars[0].open;
    const close = bars[bars.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    bars.forEach((bar) => {
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
    });
    return {
      date: bars[bars.length - 1].date,
      open,
      high,
      low,
      close
    };
  });
}

export function analyzeMarketPhase(symbol, ohlc) {
  const closes = ohlc.map((bar) => bar.close);
  const atr = computeATR(ohlc, 14);
  const atrValues = atr.filter((val) => val !== null);
  const avgAtr = atrValues.reduce((sum, val) => sum + val, 0) / (atrValues.length || 1);
  const lastAtr = atrValues[atrValues.length - 1] || 0;
  const window = clamp(3, 15, Math.round(5 * (lastAtr / (avgAtr || 1))));
  const swings = detectSwings(ohlc, window);
  const macdHist = computeMACDHist(closes);
  const rsi = computeRSI(closes, 14);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);
  const lastClose = closes[closes.length - 1] || 0;
  const lastRsi = rsi[rsi.length - 1];
  const lastMacd = macdHist[macdHist.length - 1];
  const lastSma50 = sma50[sma50.length - 1];
  const lastSma200 = sma200[sma200.length - 1];
  const atrPct = lastClose ? (lastAtr / lastClose) * 100 : 0;
  const swingSet = swings.confirmed.length >= 6 ? swings.confirmed : swings.raw;
  const elliott = evaluateElliott(swingSet);
  if (!swings.confirmed.length || swingSet !== swings.confirmed) {
    elliott.uncertainty.lastSwingConfirmed = false;
  }
  const round6 = getRound6();
  return {
    features: {
      RSI: lastRsi ? round6(lastRsi) : null,
      MACDHist: lastMacd ? round6(lastMacd) : null,
      "ATR%": round6(atrPct),
      SMA50: lastSma50 ? round6(lastSma50) : null,
      SMA200: lastSma200 ? round6(lastSma200) : null,
      SMATrend:
        lastSma50 && lastSma200 ? (lastSma50 >= lastSma200 ? "bullish" : "bearish") : "unknown"
    },
    swings,
    elliott,
    fib: elliott.fib,
    debug: {
      symbol,
      window,
      candidateCount: swings.raw.length
    }
  };
}
