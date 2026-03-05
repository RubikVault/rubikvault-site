export const FEATURE_STATES = Object.freeze({
  ENABLED: 'ENABLED',
  NOT_ENABLED: 'NOT_ENABLED',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE'
});

export const HORIZONS = Object.freeze({
  short: { id: 'short', label: 'Short', range: '1-5d' },
  mid: { id: 'mid', label: 'Mid', range: '1-12w' },
  long: { id: 'long', label: 'Long', range: '6-24m' }
});

export const RSI_BUCKETS = Object.freeze([
  { max: 30, key: 'oversold', label: 'Oversold', sentiment: 'bullish', signal: 'Buy' },
  { max: 45, key: 'soft_bearish', label: 'Soft Bearish', sentiment: 'bearish', signal: 'Wait' },
  { max: 55, key: 'neutral', label: 'Neutral', sentiment: 'neutral', signal: 'Wait' },
  { max: 70, key: 'soft_bullish', label: 'Soft Bullish', sentiment: 'bullish', signal: 'Wait' },
  { max: Infinity, key: 'overbought', label: 'Overbought', sentiment: 'bearish', signal: 'Avoid' }
]);

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function adjustedClose(bar) {
  if (!bar || typeof bar !== 'object') return null;
  const adj = toNumber(bar.adjClose);
  if (adj != null) return adj;
  return toNumber(bar.close);
}

function latestClose(close, bars = []) {
  const explicit = toNumber(close);
  if (explicit != null) return explicit;
  if (!Array.isArray(bars) || !bars.length) return null;
  return adjustedClose(bars[bars.length - 1]);
}

function safeRatio(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return part / whole;
}

function pctDistance(target, anchor) {
  if (!Number.isFinite(target) || !Number.isFinite(anchor) || anchor === 0) return null;
  return (target - anchor) / anchor;
}

function dedupeLevels(levels) {
  const seen = new Set();
  return levels.filter((level) => {
    const price = toNumber(level?.price);
    if (price == null) return false;
    const key = `${level.type || 'level'}:${price.toFixed(4)}:${level.kind || 'generic'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeSwingLevels(bars = [], direction = 'high', radius = 3, lookback = 126, limit = 2) {
  const rows = Array.isArray(bars) ? bars.slice(-Math.max(lookback, radius * 2 + 3)) : [];
  const key = direction === 'low' ? 'low' : 'high';
  const swings = [];
  for (let idx = radius; idx < rows.length - radius; idx += 1) {
    const current = toNumber(rows[idx]?.[key]);
    if (current == null) continue;
    let extreme = true;
    for (let j = idx - radius; j <= idx + radius; j += 1) {
      if (j === idx) continue;
      const compare = toNumber(rows[j]?.[key]);
      if (compare == null) continue;
      if (direction === 'low' ? compare < current : compare > current) {
        extreme = false;
        break;
      }
    }
    if (!extreme) continue;
    swings.push({
      name: direction === 'low' ? 'Swing Low' : 'Swing High',
      kind: direction === 'low' ? 'swing_low' : 'swing_high',
      price: current,
      date: rows[idx]?.date || null,
      type: direction === 'low' ? 'support' : 'resistance',
      weight: 2
    });
  }
  swings.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return swings.slice(0, limit);
}

export function classifyRsi(rsiValue) {
  const rsi = toNumber(rsiValue);
  if (rsi == null) {
    return {
      key: 'unknown',
      label: 'Unknown',
      sentiment: 'neutral',
      signal: 'Wait',
      color: '#94a3b8'
    };
  }
  const bucket = RSI_BUCKETS.find((entry) => rsi <= entry.max) || RSI_BUCKETS[RSI_BUCKETS.length - 1];
  const color = bucket.sentiment === 'bullish'
    ? '#10b981'
    : bucket.sentiment === 'bearish'
      ? '#f87171'
      : '#e5e7eb';
  return { ...bucket, value: rsi, color };
}

export function classifyMaStructure(stats = {}) {
  const sma20 = toNumber(stats.sma20);
  const sma50 = toNumber(stats.sma50);
  const sma200 = toNumber(stats.sma200);
  if (sma20 == null || sma50 == null || sma200 == null) {
    return { key: 'unknown', label: 'Unknown', sentiment: 'neutral' };
  }
  if (sma20 > sma50 && sma50 > sma200) {
    return { key: 'bullish_stack', label: 'Bullish Stack', sentiment: 'bullish' };
  }
  if (sma20 < sma50 && sma50 < sma200) {
    return { key: 'bearish_stack', label: 'Bearish Stack', sentiment: 'bearish' };
  }
  return { key: 'mixed', label: 'Mixed Alignment', sentiment: 'neutral' };
}

export function deriveFeatureStates({ marketScore = null } = {}) {
  return {
    core_technical: FEATURE_STATES.ENABLED,
    market_score: marketScore ? FEATURE_STATES.ENABLED : FEATURE_STATES.DATA_UNAVAILABLE,
    fundamentals: FEATURE_STATES.NOT_ENABLED,
    macro: FEATURE_STATES.NOT_ENABLED,
    peers: FEATURE_STATES.DATA_UNAVAILABLE,
    scientific: FEATURE_STATES.DATA_UNAVAILABLE,
    forecast: FEATURE_STATES.DATA_UNAVAILABLE,
    elliott: FEATURE_STATES.DATA_UNAVAILABLE
  };
}

export function buildSupportResistance({ close, stats = {}, bars = [] } = {}) {
  const current = latestClose(close, bars);
  const atr = toNumber(stats.atr14);
  if (current == null) {
    return {
      current: null,
      support: [],
      resistance: [],
      summary: { trigger: null, invalidation: null, nearest_support: null, nearest_resistance: null }
    };
  }

  const raw = [
    { name: 'BB Lower', kind: 'bb_lower', price: toNumber(stats.bb_lower), type: 'support', weight: 2 },
    { name: 'SMA 20', kind: 'sma20', price: toNumber(stats.sma20), type: 'level', weight: 1 },
    { name: 'SMA 50', kind: 'sma50', price: toNumber(stats.sma50), type: 'level', weight: 2 },
    { name: 'SMA 200', kind: 'sma200', price: toNumber(stats.sma200), type: 'level', weight: 3 },
    { name: 'BB Upper', kind: 'bb_upper', price: toNumber(stats.bb_upper), type: 'resistance', weight: 2 },
    { name: '52W Low', kind: 'low_52w', price: toNumber(stats.low_52w), type: 'support', weight: 1 },
    { name: '52W High', kind: 'high_52w', price: toNumber(stats.high_52w), type: 'resistance', weight: 1 }
  ];

  if (atr != null && atr > 0) {
    raw.push(
      { name: 'ATR -1', kind: 'atr_minus_1', price: current - atr, type: 'support', weight: 1 },
      { name: 'ATR -2', kind: 'atr_minus_2', price: current - atr * 2, type: 'support', weight: 1 },
      { name: 'ATR +1', kind: 'atr_plus_1', price: current + atr, type: 'resistance', weight: 1 },
      { name: 'ATR +2', kind: 'atr_plus_2', price: current + atr * 2, type: 'resistance', weight: 1 }
    );
  }

  raw.push(...computeSwingLevels(bars, 'low'));
  raw.push(...computeSwingLevels(bars, 'high'));

  const levels = dedupeLevels(raw).map((level) => {
    const price = toNumber(level.price);
    const distance_pct = pctDistance(price, current);
    const inferredType = level.type === 'level'
      ? (price <= current ? 'support' : 'resistance')
      : level.type;
    return {
      ...level,
      price,
      type: inferredType,
      distance_pct,
      distance_abs: Math.abs((price ?? current) - current)
    };
  });

  const support = levels
    .filter((level) => level.type === 'support' && level.price <= current)
    .sort((a, b) => a.distance_abs - b.distance_abs || (b.weight || 0) - (a.weight || 0))
    .slice(0, 4);

  const resistance = levels
    .filter((level) => level.type === 'resistance' && level.price >= current)
    .sort((a, b) => a.distance_abs - b.distance_abs || (b.weight || 0) - (a.weight || 0))
    .slice(0, 4);

  const nearestSupport = support[0] || null;
  const nearestResistance = resistance[0] || null;

  return {
    current,
    support,
    resistance,
    summary: {
      nearest_support: nearestSupport,
      nearest_resistance: nearestResistance,
      trigger: nearestResistance
        ? `Close above ${nearestResistance.name}`
        : null,
      invalidation: nearestSupport
        ? `Loss of ${nearestSupport.name}`
        : null
    }
  };
}

function pushReason(list, condition, reason) {
  if (condition && reason) list.push(reason);
}

function buildHorizonVerdict({ score = 0, reasons = [], trigger = null, invalidation = null, label } = {}) {
  const abs = Math.abs(score);
  const verdict = score >= 2 ? 'BUY' : score <= -2 ? 'AVOID' : 'WAIT';
  const sentiment = verdict === 'BUY' ? 'bullish' : verdict === 'AVOID' ? 'bearish' : 'neutral';
  const confidence = abs >= 3 ? 'HIGH' : abs >= 2 ? 'MEDIUM' : 'LOW';
  return {
    label,
    verdict,
    sentiment,
    confidence,
    reasons: reasons.slice(0, 3),
    trigger,
    invalidation,
    score
  };
}

export function buildDecisionPack({ close, stats = {}, bars = [], marketScore = null } = {}) {
  const current = latestClose(close, bars);
  const levels = buildSupportResistance({ close: current, stats, bars });
  const rsi = classifyRsi(stats.rsi14);
  const ma = classifyMaStructure(stats);
  const macdHist = toNumber(stats.macd_hist);
  const bbMid = toNumber(stats.bb_mid);
  const ret20 = toNumber(stats.ret_20d_pct);
  const volPct = toNumber(stats.volatility_percentile);
  const scoreShort = [];
  const scoreMid = [];
  const scoreLong = [];
  let short = 0;
  let mid = 0;
  let long = 0;

  const above20 = current != null && toNumber(stats.sma20) != null ? current > toNumber(stats.sma20) : null;
  const above50 = current != null && toNumber(stats.sma50) != null ? current > toNumber(stats.sma50) : null;
  const above200 = current != null && toNumber(stats.sma200) != null ? current > toNumber(stats.sma200) : null;

  if (above20 === true) { short += 1; pushReason(scoreShort, true, 'Price above SMA20'); }
  if (above20 === false) { short -= 1; pushReason(scoreShort, true, 'Price below SMA20'); }
  if (macdHist != null) {
    if (macdHist > 0) { short += 1; pushReason(scoreShort, true, 'MACD histogram positive'); }
    if (macdHist < 0) { short -= 1; pushReason(scoreShort, true, 'MACD histogram negative'); }
  }
  if (bbMid != null && current != null) {
    if (current >= bbMid) { short += 0.5; pushReason(scoreShort, true, 'Price above Bollinger mid'); }
    else { short -= 0.5; pushReason(scoreShort, true, 'Price below Bollinger mid'); }
  }
  if (rsi.sentiment === 'bullish' && rsi.key === 'oversold') { short += 0.5; pushReason(scoreShort, true, 'RSI oversold bounce setup'); }
  if (rsi.sentiment === 'bearish' && rsi.key === 'overbought') { short -= 0.5; pushReason(scoreShort, true, 'RSI overbought risk'); }
  if (volPct != null && volPct >= 95 && Math.abs(short) < 2) {
    pushReason(scoreShort, true, 'Volatility extremely high');
  }

  if (ma.sentiment === 'bullish') { mid += 2; pushReason(scoreMid, true, 'Bullish MA stack'); }
  if (ma.sentiment === 'bearish') { mid -= 2; pushReason(scoreMid, true, 'Bearish MA stack'); }
  if (above50 === true) { mid += 1; pushReason(scoreMid, true, 'Price above SMA50'); }
  if (above50 === false) { mid -= 1; pushReason(scoreMid, true, 'Price below SMA50'); }
  if (ret20 != null) {
    if (ret20 > 0) { mid += 0.5; pushReason(scoreMid, true, '20d return positive'); }
    if (ret20 < 0) { mid -= 0.5; pushReason(scoreMid, true, '20d return negative'); }
  }
  if (marketScore && Number.isFinite(Number(marketScore.score_mid))) {
    const ms = Number(marketScore.score_mid);
    if (ms >= 70) { mid += 0.5; pushReason(scoreMid, true, 'Market score mid supportive'); }
    if (ms <= 40) { mid -= 0.5; pushReason(scoreMid, true, 'Market score mid weak'); }
  }

  if (above200 === true) { long += 2; pushReason(scoreLong, true, 'Price above SMA200'); }
  if (above200 === false) { long -= 2; pushReason(scoreLong, true, 'Price below SMA200'); }
  if (ma.sentiment === 'bullish') { long += 1; pushReason(scoreLong, true, 'Long-term MA structure constructive'); }
  if (ma.sentiment === 'bearish') { long -= 1; pushReason(scoreLong, true, 'Long-term MA structure weak'); }
  const fromHigh = toNumber(stats.from_52w_high_pct);
  if (fromHigh != null && fromHigh > -0.08) { long += 0.5; pushReason(scoreLong, true, 'Trading near 52W highs'); }
  if (fromHigh != null && fromHigh < -0.25) { long -= 0.5; pushReason(scoreLong, true, 'Deep below 52W highs'); }
  if (marketScore && Number.isFinite(Number(marketScore.score_long))) {
    const ls = Number(marketScore.score_long);
    if (ls >= 70) { long += 0.5; pushReason(scoreLong, true, 'Market score long supportive'); }
    if (ls <= 40) { long -= 0.5; pushReason(scoreLong, true, 'Market score long weak'); }
  }

  return {
    short: buildHorizonVerdict({
      label: HORIZONS.short.label,
      score: short,
      reasons: scoreShort,
      trigger: levels.summary.trigger,
      invalidation: levels.summary.invalidation
    }),
    mid: buildHorizonVerdict({
      label: HORIZONS.mid.label,
      score: mid,
      reasons: scoreMid,
      trigger: levels.summary.trigger,
      invalidation: levels.summary.invalidation
    }),
    long: buildHorizonVerdict({
      label: HORIZONS.long.label,
      score: long,
      reasons: scoreLong,
      trigger: levels.summary.trigger,
      invalidation: levels.summary.invalidation
    })
  };
}
