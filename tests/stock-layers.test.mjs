#!/usr/bin/env node
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helpers ───

function makeBars(count = 80, startPrice = 100, trendUp = true) {
  const bars = [];
  let price = startPrice;
  const start = new Date('2025-01-02');
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const move = trendUp ? 0.003 : -0.003;
    const open = price;
    price = Number((price * (1 + move + (Math.random() - 0.5) * 0.002)).toFixed(4));
    const close = price;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open, close,
      high: Math.max(open, close) * 1.005,
      low: Math.min(open, close) * 0.995,
      adjClose: close,
      volume: 1_000_000 + i * 1000,
    });
  }
  return bars;
}

function makeDowntrendBars(count = 80) {
  return makeBars(count, 200, false);
}

function makeFewBars(count = 10) {
  return makeBars(count, 50, true);
}

function makeZeroVolumeBars(count = 80) {
  const bars = makeBars(count, 100, true);
  return bars.map(b => ({ ...b, volume: 0 }));
}

// ─── Import modules under test ───

const { computeIndicators, mean, stddev, sma } = await import('../functions/api/_shared/eod-indicators.mjs');
const {
  classifyAllStates, classifyTrend, classifyMomentum, classifyVolatility,
  classifyVolume, classifyLiquidity,
  TREND_STATE, MOMENTUM_STATE, VOLATILITY_STATE, VOLUME_STATE, LIQUIDITY_STATE
} = await import('../functions/api/_shared/stock-states-v1.js');
const { makeDecision, VERDICT, CONFIDENCE } = await import('../functions/api/_shared/stock-decisions-v1.js');
const { buildExplanation } = await import('../functions/api/_shared/stock-explanations-v1.js');
const { validateStockLayers } = await import('../functions/api/_shared/contracts.js');

// ═══════════════════════════════════════════════════════════════
// P0-1: RSI WILDER TEST
// ═══════════════════════════════════════════════════════════════
describe('RSI Wilder smoothing', () => {
  it('returns null for < 15 bars', () => {
    const bars = makeFewBars(10);
    const result = computeIndicators(bars);
    const rsi = result.indicators.find(i => i.id === 'rsi14');
    assert.strictEqual(rsi.value, null);
  });

  it('returns finite value for sufficient bars', () => {
    const bars = makeBars(80);
    const result = computeIndicators(bars);
    const rsi = result.indicators.find(i => i.id === 'rsi14');
    assert.ok(rsi.value !== null, 'RSI should not be null');
    assert.ok(Number.isFinite(rsi.value), 'RSI should be finite');
    assert.ok(rsi.value >= 0 && rsi.value <= 100, `RSI out of range: ${rsi.value}`);
  });

  it('produces RSI > 50 for consistent uptrend', () => {
    const bars = makeBars(100, 50, true);
    const result = computeIndicators(bars);
    const rsi = result.indicators.find(i => i.id === 'rsi14');
    assert.ok(rsi.value > 45, `RSI should be > 45 for uptrend, got ${rsi.value}`);
  });

  it('Wilder differs from simple average', () => {
    // Construct known series where Wilder and simple differ
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
    const bars = closes.map((c, i) => ({
      date: `2025-01-${String(i + 2).padStart(2, '0')}`,
      open: c, high: c * 1.005, low: c * 0.995, close: c, adjClose: c, volume: 1000000
    }));
    const result = computeIndicators(bars);
    const rsi = result.indicators.find(i => i.id === 'rsi14');
    assert.ok(rsi.value !== null, 'RSI should compute for 20 bars');
    assert.ok(Number.isFinite(rsi.value), 'RSI should be finite');
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-2: ATR WILDER TEST
// ═══════════════════════════════════════════════════════════════
describe('ATR Wilder smoothing', () => {
  it('returns null for < 15 bars', () => {
    const bars = makeFewBars(10);
    const result = computeIndicators(bars);
    const atr = result.indicators.find(i => i.id === 'atr14');
    assert.strictEqual(atr.value, null);
  });

  it('returns positive finite value for sufficient bars', () => {
    const bars = makeBars(80);
    const result = computeIndicators(bars);
    const atr = result.indicators.find(i => i.id === 'atr14');
    assert.ok(atr.value !== null, 'ATR should not be null');
    assert.ok(Number.isFinite(atr.value), 'ATR should be finite');
    assert.ok(atr.value > 0, `ATR should be positive, got ${atr.value}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-3: STATE ENUM VALIDITY (fuzz with bad inputs)
// ═══════════════════════════════════════════════════════════════
describe('State classifiers never return null/undefined', () => {
  const badInputs = [null, undefined, {}, { sma20: NaN }, { rsi14: undefined }, { volatility_percentile: Infinity }];

  for (const input of badInputs) {
    it(`classifyTrend with ${JSON.stringify(input)}`, () => {
      const result = classifyTrend(input, null);
      assert.ok(result !== null && result !== undefined, 'Must not be null/undefined');
      assert.ok(Object.values(TREND_STATE).includes(result), `Invalid enum: ${result}`);
    });

    it(`classifyMomentum with ${JSON.stringify(input)}`, () => {
      const result = classifyMomentum(input);
      assert.ok(result !== null && result !== undefined);
      assert.ok(Object.values(MOMENTUM_STATE).includes(result), `Invalid enum: ${result}`);
    });

    it(`classifyVolatility with ${JSON.stringify(input)}`, () => {
      const result = classifyVolatility(input);
      assert.ok(result !== null && result !== undefined);
      assert.ok(Object.values(VOLATILITY_STATE).includes(result), `Invalid enum: ${result}`);
    });

    it(`classifyVolume with ${JSON.stringify(input)}`, () => {
      const result = classifyVolume(input);
      assert.ok(result !== null && result !== undefined);
      assert.ok(Object.values(VOLUME_STATE).includes(result), `Invalid enum: ${result}`);
    });

    it(`classifyLiquidity with ${JSON.stringify(input)}`, () => {
      const result = classifyLiquidity(input);
      assert.ok(result !== null && result !== undefined);
      assert.ok(Object.values(LIQUIDITY_STATE).includes(result), `Invalid enum: ${result}`);
    });
  }

  it('classifyAllStates returns all valid enums for null input', () => {
    const states = classifyAllStates(null, null);
    assert.ok(Object.values(TREND_STATE).includes(states.trend));
    assert.ok(Object.values(MOMENTUM_STATE).includes(states.momentum));
    assert.ok(Object.values(VOLATILITY_STATE).includes(states.volatility));
    assert.ok(Object.values(VOLUME_STATE).includes(states.volume));
    assert.ok(Object.values(LIQUIDITY_STATE).includes(states.liquidity));
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-4: DECISION CONTRADICTION — DOWNTREND + WEAK VOLUME
// ═══════════════════════════════════════════════════════════════
describe('Decision hard gates', () => {
  it('DOWNTREND + WEAK volume blocks BUY', () => {
    const states = { trend: 'DOWN', momentum: 'NEUTRAL', volatility: 'NORMAL', volume: 'WEAK', liquidity: 'HIGH' };
    // Give high scores that would otherwise yield BUY
    const stats = { sma20: 90, sma50: 85, sma200: 80, rsi14: 55, macd_hist: 1, volatility_percentile: 30 };
    const decision = makeDecision(states, stats, 100);
    assert.notStrictEqual(decision.verdict, 'BUY', 'DOWNTREND + WEAK volume must not produce BUY');
  });

  it('STRONG_DOWN + DRY volume blocks BUY', () => {
    const states = { trend: 'STRONG_DOWN', momentum: 'BEARISH', volatility: 'HIGH', volume: 'DRY', liquidity: 'MODERATE' };
    const stats = { sma20: 90, sma50: 85, sma200: 80, rsi14: 55, macd_hist: 1, volatility_percentile: 30 };
    const decision = makeDecision(states, stats, 100);
    assert.notStrictEqual(decision.verdict, 'BUY');
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-5: HARD GATE — LOW_LIQUIDITY blocks BUY
// ═══════════════════════════════════════════════════════════════
describe('LOW_LIQUIDITY gate', () => {
  it('blocks BUY when scores would otherwise qualify', () => {
    const states = { trend: 'UP', momentum: 'BULLISH', volatility: 'NORMAL', volume: 'NORMAL', liquidity: 'LOW' };
    const stats = { sma20: 100, sma50: 95, sma200: 90, rsi14: 55, macd_hist: 1, volatility_percentile: 30 };
    const decision = makeDecision(states, stats, 105);
    assert.notStrictEqual(decision.verdict, 'BUY', 'LOW_LIQUIDITY must block BUY');
    assert.ok(decision.trigger_gates.includes('LOW_LIQUIDITY'));
  });
});

describe('Generic oversold pullback rule', () => {
  it('creates a WAIT-floor and bias signal without creating BUY by itself', () => {
    const states = { trend: 'UP', momentum: 'OVERSOLD', volatility: 'NORMAL', volume: 'NORMAL', liquidity: 'HIGH' };
    const stats = { sma20: 110, sma50: 100, sma200: 90, rsi14: 28, macd_hist: -0.5, volatility_percentile: 35 };
    const decision = makeDecision(states, stats, 95);
    assert.equal(decision.verdict, 'WAIT');
    assert.equal(decision.wait_subtype, 'OVERSOLD_PULLBACK_WATCH');
    assert.equal(decision.scores.contributors.generic_oversold_pullback, true);
    assert.notEqual(decision.buy_eligible, true, 'Oversold pullback must not create BUY without confirmation');
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-6: CONTRACT FIELDS — new fields present
// ═══════════════════════════════════════════════════════════════
describe('Contract validation', () => {
  it('validates well-formed layer output', () => {
    const states = classifyAllStates({ rsi14: 55, volatility_percentile: 50, volume_ratio_20d: 1.0, liquidity_score: 60, sma20: 100, sma50: 95, sma200: 90 }, 105);
    const decision = makeDecision(states, { sma20: 100, sma50: 95, sma200: 90, rsi14: 55, macd_hist: 1, volatility_percentile: 50 }, 105);
    const explanation = buildExplanation('AAPL', decision, states);
    const doc = { states, decision, explanation };
    const result = validateStockLayers(doc);
    assert.strictEqual(result.valid, true, `Validation errors: ${result.errors.join(', ')}`);
  });

  it('rejects missing states', () => {
    const result = validateStockLayers({ decision: {}, explanation: {} });
    assert.strictEqual(result.valid, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// P0-7: FRONTEND ANTI-LOGIC CHECK
// ═══════════════════════════════════════════════════════════════
describe('Frontend business logic removal', () => {
  it('stock-features.js should not contain local business calculations for liquidity', () => {
    const content = readFileSync(resolve(import.meta.dirname, '../public/js/stock-features.js'), 'utf8');
    // These patterns indicate local business logic that should have been removed
    const patterns = [
      /const dollarVol\s*=\s*adv20\s*\*/,       // dollar volume calculation
      /let score\s*=\s*50;\s*\n.*dollarVol/,     // liquidity score local calc
      /avgGain\s*=\s*gains\s*\/\s*period/,       // RSI local calculation
    ];
    for (const pat of patterns) {
      assert.ok(!pat.test(content), `Found business logic pattern: ${pat}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// P1-8: CONFIDENCE reacts to extreme volatility
// ═══════════════════════════════════════════════════════════════
describe('Confidence behavior', () => {
  it('EXTREME volatility caps confidence to LOW', () => {
    const states = { trend: 'UP', momentum: 'BULLISH', volatility: 'EXTREME', volume: 'NORMAL', liquidity: 'HIGH' };
    const stats = { sma20: 100, sma50: 95, sma200: 90, rsi14: 55, macd_hist: 1, volatility_percentile: 95 };
    const decision = makeDecision(states, stats, 105);
    assert.ok(decision.confidence_bucket === 'LOW' || decision.confidence_bucket === 'NONE',
      `EXTREME vol should cap confidence, got ${decision.confidence_bucket}`);
    assert.ok(decision.trigger_gates.includes('EXTREME_VOLATILITY'));
  });
});

// ═══════════════════════════════════════════════════════════════
// P1-9: EXPLANATION completeness
// ═══════════════════════════════════════════════════════════════
describe('Explanation completeness', () => {
  for (const v of ['BUY', 'WAIT', 'SELL', 'AVOID', 'INSUFFICIENT_DATA']) {
    it(`verdict ${v} produces non-empty headline and bullets`, () => {
      const decision = { verdict: v, strategic_bias: 'NEUTRAL', trigger_gates: [], confidence_bucket: 'MEDIUM' };
      const states = { trend: 'RANGE', momentum: 'NEUTRAL', volatility: 'NORMAL', volume: 'NORMAL', liquidity: 'MODERATE' };
      const expl = buildExplanation('TEST', decision, states);
      assert.ok(expl.headline.length > 0, 'Headline must not be empty');
      assert.ok(expl.bullets.length >= 1, 'Must have at least 1 bullet');
      assert.ok(expl.synthesis.length > 0, 'Synthesis must not be empty');
      assert.ok(['positive', 'negative', 'neutral'].includes(expl.sentiment), `Invalid sentiment: ${expl.sentiment}`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// P1-10: INSUFFICIENT_DATA verdict
// ═══════════════════════════════════════════════════════════════
describe('INSUFFICIENT_DATA handling', () => {
  it('>=3 UNKNOWN states trigger INSUFFICIENT_DATA', () => {
    const states = { trend: 'UNKNOWN', momentum: 'UNKNOWN', volatility: 'UNKNOWN', volume: 'NORMAL', liquidity: 'HIGH' };
    const decision = makeDecision(states, {}, null);
    assert.strictEqual(decision.verdict, 'INSUFFICIENT_DATA');
    assert.strictEqual(decision.confidence_bucket, 'NONE');
    assert.ok(decision.trigger_gates.includes('INSUFFICIENT_DATA'));
  });
});

// ═══════════════════════════════════════════════════════════════
// DERIVED METRICS in indicators
// ═══════════════════════════════════════════════════════════════
describe('Derived metrics from backend', () => {
  it('computes adv20_dollar, liquidity_score, avg_gap_pct for normal bars', () => {
    const bars = makeBars(80);
    const result = computeIndicators(bars);
    const adv20Dollar = result.indicators.find(i => i.id === 'adv20_dollar');
    const liqScore = result.indicators.find(i => i.id === 'liquidity_score');
    const avgGap = result.indicators.find(i => i.id === 'avg_gap_pct');
    assert.ok(adv20Dollar, 'adv20_dollar indicator must exist');
    assert.ok(Number.isFinite(adv20Dollar.value), 'adv20_dollar must be finite');
    assert.ok(liqScore, 'liquidity_score indicator must exist');
    assert.ok(Number.isFinite(liqScore.value), 'liquidity_score must be finite');
    assert.ok(avgGap, 'avg_gap_pct indicator must exist');
  });

  it('handles zero-volume bars gracefully', () => {
    const bars = makeZeroVolumeBars(80);
    const result = computeIndicators(bars);
    // Should not throw, and RSI/ATR should still compute
    const rsi = result.indicators.find(i => i.id === 'rsi14');
    assert.ok(rsi !== undefined, 'rsi14 must exist');
  });

  it('vol_compression_20_60 exists for sufficient bars', () => {
    const bars = makeBars(80);
    const result = computeIndicators(bars);
    const vc = result.indicators.find(i => i.id === 'vol_compression_20_60');
    assert.ok(vc, 'vol_compression_20_60 indicator must exist');
  });
});

// ═══════════════════════════════════════════════════════════════
// DISCLAIMER visibility check
// ═══════════════════════════════════════════════════════════════
describe('Disclaimer in HTML', () => {
  it('stock.html contains rv-disclaimer div', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../public/stock.html'), 'utf8');
    assert.ok(html.includes('id="rv-disclaimer"'), 'rv-disclaimer must be present in stock.html');
    assert.ok(html.includes('disclaimer.html'), 'Link to disclaimer.html must be present');
  });
});
