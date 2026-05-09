// stock-states-v1.js — STATE LAYER
// Classifies raw indicators into standardized enum states.
// Each classifier ALWAYS returns a valid enum string, never null/undefined.

export const TREND_STATE = Object.freeze({
  STRONG_UP: 'STRONG_UP', UP: 'UP', RANGE: 'RANGE',
  DOWN: 'DOWN', STRONG_DOWN: 'STRONG_DOWN', UNKNOWN: 'UNKNOWN'
});

export const MOMENTUM_STATE = Object.freeze({
  OVERBOUGHT: 'OVERBOUGHT', BULLISH: 'BULLISH', NEUTRAL: 'NEUTRAL',
  BEARISH: 'BEARISH', OVERSOLD: 'OVERSOLD', UNKNOWN: 'UNKNOWN'
});

export const VOLATILITY_STATE = Object.freeze({
  EXTREME: 'EXTREME', HIGH: 'HIGH', NORMAL: 'NORMAL',
  LOW: 'LOW', COMPRESSED: 'COMPRESSED', UNKNOWN: 'UNKNOWN'
});

export const VOLUME_STATE = Object.freeze({
  SURGE: 'SURGE', ABOVE_AVG: 'ABOVE_AVG', NORMAL: 'NORMAL',
  WEAK: 'WEAK', DRY: 'DRY', UNKNOWN: 'UNKNOWN'
});

export const LIQUIDITY_STATE = Object.freeze({
  HIGH: 'HIGH', MODERATE: 'MODERATE', LOW: 'LOW', UNKNOWN: 'UNKNOWN'
});

function fin(v) { return Number.isFinite(v) ? v : null; }

export function classifyTrend(stats, close) {
  const c = fin(close);
  const s20 = fin(stats?.sma20);
  const s50 = fin(stats?.sma50);
  const s200 = fin(stats?.sma200);
  if (c == null || s20 == null || s50 == null || s200 == null) return TREND_STATE.UNKNOWN;

  const stackBullish = s20 > s50 && s50 > s200;
  const stackBearish = s20 < s50 && s50 < s200;

  if (stackBullish && c > s20) return TREND_STATE.STRONG_UP;
  if (stackBullish && c > s200) return TREND_STATE.UP;
  if (stackBullish) return TREND_STATE.RANGE;
  if (stackBearish && c < s20) return TREND_STATE.STRONG_DOWN;
  if (stackBearish && c < s200) return TREND_STATE.DOWN;
  if (stackBearish) return TREND_STATE.RANGE;
  return TREND_STATE.RANGE;
}

export function classifyMomentum(stats) {
  const rsi = fin(stats?.rsi14);
  const macdHist = fin(stats?.macd_hist);
  if (rsi == null) return MOMENTUM_STATE.UNKNOWN;

  if (rsi >= 80) return MOMENTUM_STATE.OVERBOUGHT;
  if (rsi <= 20) return MOMENTUM_STATE.OVERSOLD;
  if (rsi >= 60 || (rsi >= 50 && macdHist != null && macdHist > 0)) return MOMENTUM_STATE.BULLISH;
  if (rsi <= 40 || (rsi <= 50 && macdHist != null && macdHist < 0)) return MOMENTUM_STATE.BEARISH;
  return MOMENTUM_STATE.NEUTRAL;
}

export function classifyVolatility(stats) {
  const vp = fin(stats?.volatility_percentile);
  if (vp == null) return VOLATILITY_STATE.UNKNOWN;

  if (vp > 90) return VOLATILITY_STATE.EXTREME;
  if (vp > 75) return VOLATILITY_STATE.HIGH;
  if (vp < 10) return VOLATILITY_STATE.COMPRESSED;
  if (vp < 25) return VOLATILITY_STATE.LOW;
  return VOLATILITY_STATE.NORMAL;
}

export function classifyVolume(stats) {
  const vr = fin(stats?.volume_ratio_20d);
  if (vr == null) return VOLUME_STATE.UNKNOWN;

  if (vr > 2.0) return VOLUME_STATE.SURGE;
  if (vr > 1.3) return VOLUME_STATE.ABOVE_AVG;
  if (vr < 0.5) return VOLUME_STATE.DRY;
  if (vr < 0.7) return VOLUME_STATE.WEAK;
  return VOLUME_STATE.NORMAL;
}

export function classifyLiquidity(stats) {
  const ls = fin(stats?.liquidity_score);
  if (ls == null) return LIQUIDITY_STATE.UNKNOWN;

  if (ls > 70) return LIQUIDITY_STATE.HIGH;
  if (ls > 40) return LIQUIDITY_STATE.MODERATE;
  return LIQUIDITY_STATE.LOW;
}

export function classifyAllStates(stats, close) {
  return {
    trend: classifyTrend(stats, close),
    momentum: classifyMomentum(stats),
    volatility: classifyVolatility(stats),
    volume: classifyVolume(stats),
    liquidity: classifyLiquidity(stats),
  };
}
