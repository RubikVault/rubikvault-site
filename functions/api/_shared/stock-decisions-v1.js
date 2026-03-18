// stock-decisions-v1.js — DECISION LAYER
// Central verdict from states + constraints. Single source of truth for final interpretation.

export const VERDICT = Object.freeze({
  BUY: 'BUY', WAIT: 'WAIT', SELL: 'SELL', AVOID: 'AVOID',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

export const CONFIDENCE = Object.freeze({
  HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', NONE: 'NONE'
});

export const SETUP_TYPE = Object.freeze({
  TREND_FOLLOW: 'TREND_FOLLOW', MEAN_REVERSION: 'MEAN_REVERSION',
  BREAKOUT: 'BREAKOUT', DEFENSIVE: 'DEFENSIVE', NONE: 'NONE'
});

export const STRATEGIC_BIAS = Object.freeze({
  BULLISH: 'BULLISH', NEUTRAL: 'NEUTRAL', BEARISH: 'BEARISH', UNKNOWN: 'UNKNOWN'
});

function fin(v) { return Number.isFinite(v) ? v : null; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

function evaluateHardGates(states) {
  const gates = [];
  const t = states.trend;
  const v = states.volume;
  const l = states.liquidity;
  const vol = states.volatility;

  if ((t === 'DOWN' || t === 'STRONG_DOWN') && (v === 'WEAK' || v === 'DRY')) {
    gates.push('DOWNTREND_WEAK_VOLUME');
  }
  if (l === 'LOW') {
    gates.push('LOW_LIQUIDITY');
  }
  if (vol === 'EXTREME') {
    gates.push('EXTREME_VOLATILITY');
  }
  const unknownCount = Object.values(states).filter(s => s === 'UNKNOWN').length;
  if (unknownCount >= 3) {
    gates.push('INSUFFICIENT_DATA');
  }
  return gates;
}

// Scoring logic ported from stock-insights-v4.js scoreFromStats()
function computeScores(stats, close, states) {
  const sma20 = fin(stats?.sma20);
  const sma50 = fin(stats?.sma50);
  const sma200 = fin(stats?.sma200);
  const rsi = fin(stats?.rsi14);
  const macdHist = fin(stats?.macd_hist);
  const volPct = fin(stats?.volatility_percentile);
  const c = fin(close);

  let trend = 50;
  if (c != null && sma50 != null && sma200 != null) {
    if (c > sma50 && sma50 > sma200) trend = 72;
    else if (c < sma50 && sma50 < sma200) trend = 32;
  }

  let entry = 50;
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 65) entry += 8;
    if (rsi > 75) entry -= 10;
    if (rsi < 25) entry += 4;
  }
  if (macdHist != null) entry += macdHist > 0 ? 8 : -8;
  if (c != null && sma20 != null) entry += c > sma20 ? 6 : -6;

  let risk = 60;
  if (volPct != null) {
    if (volPct > 90) risk = 35;
    else if (volPct > 75) risk = 45;
    else if (volPct < 35) risk = 70;
  }

  let context = 50;

  const composite = Math.round((trend * 0.3 + entry * 0.3 + risk * 0.2 + context * 0.2));

  return {
    trend: clamp(trend, 0, 100),
    entry: clamp(entry, 0, 100),
    risk: clamp(risk, 0, 100),
    context: clamp(context, 0, 100),
    composite: clamp(composite, 0, 100),
  };
}

function deriveSetupType(states, scores) {
  if (states.trend === 'STRONG_UP' || states.trend === 'UP') {
    if (states.momentum === 'BULLISH' || states.momentum === 'NEUTRAL') return SETUP_TYPE.TREND_FOLLOW;
    if (states.momentum === 'OVERSOLD') return SETUP_TYPE.MEAN_REVERSION;
  }
  if (states.volatility === 'COMPRESSED' || states.volatility === 'LOW') {
    return SETUP_TYPE.BREAKOUT;
  }
  if (states.trend === 'DOWN' || states.trend === 'STRONG_DOWN') {
    return SETUP_TYPE.DEFENSIVE;
  }
  return SETUP_TYPE.NONE;
}

export function makeDecision(states, stats, close) {
  const gates = evaluateHardGates(states);
  const scores = computeScores(stats, close, states);

  // INSUFFICIENT_DATA short-circuit
  if (gates.includes('INSUFFICIENT_DATA')) {
    return {
      verdict: VERDICT.INSUFFICIENT_DATA,
      confidence_bucket: CONFIDENCE.NONE,
      setup_type: SETUP_TYPE.NONE,
      strategic_bias: STRATEGIC_BIAS.UNKNOWN,
      tactical_action: 'HOLD',
      trigger_gates: gates,
      constraints_triggered: gates,
      scores,
    };
  }

  // Base verdict from scores (thresholds from stock-insights-v4.js)
  let verdict = VERDICT.WAIT;
  if (scores.trend >= 68 && scores.entry >= 60 && scores.risk >= 45 && scores.context >= 55) {
    verdict = VERDICT.BUY;
  } else if (scores.trend <= 35 && scores.entry <= 40 && scores.risk <= 45) {
    verdict = VERDICT.SELL;
  }

  // Hard gate overrides
  if (gates.includes('DOWNTREND_WEAK_VOLUME') && (verdict === VERDICT.BUY)) {
    verdict = VERDICT.WAIT;
  }
  if (gates.includes('LOW_LIQUIDITY') && verdict === VERDICT.BUY) {
    verdict = VERDICT.WAIT;
  }

  // Confidence
  let confidence = CONFIDENCE.MEDIUM;
  if (gates.includes('EXTREME_VOLATILITY')) {
    confidence = CONFIDENCE.LOW;
  } else if (scores.composite >= 70 && gates.length === 0) {
    confidence = CONFIDENCE.HIGH;
  } else if (scores.composite < 40 || gates.length > 0) {
    confidence = CONFIDENCE.LOW;
  }

  const setup_type = deriveSetupType(states, scores);
  const strategic_bias = scores.trend >= 60 ? STRATEGIC_BIAS.BULLISH
    : scores.trend <= 40 ? STRATEGIC_BIAS.BEARISH
    : STRATEGIC_BIAS.NEUTRAL;
  const tactical_action = verdict === VERDICT.BUY ? 'ENTER_LONG'
    : verdict === VERDICT.SELL ? 'EXIT'
    : verdict === VERDICT.AVOID ? 'REDUCE'
    : 'HOLD';

  return {
    verdict,
    confidence_bucket: confidence,
    setup_type,
    strategic_bias,
    tactical_action,
    trigger_gates: gates,
    constraints_triggered: gates,
    scores,
  };
}
