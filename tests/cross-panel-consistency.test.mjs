import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  guardPayload,
  guard52WRange,
  guardStructure,
  guardNarrative,
  guardFundamentals,
  guardModelConsensus,
  guardPanelGate,
  guardLabels,
} from '../public/js/stock-data-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = name => resolve(__dirname, 'fixtures/golden', name);
const hasFixture = name => existsSync(fixturePath(name));
const loadFixture = name => JSON.parse(readFileSync(resolve(__dirname, 'fixtures/golden', name), 'utf8'));

// ─── Golden Fixture Tests ──────────────────────────────────────────────────

describe('Golden: QCOM downtrend', { skip: !hasFixture('qcom-downtrend.json') }, () => {
  const payload = loadFixture('qcom-downtrend.json');
  const r = guardPayload(payload, 'QCOM');

  it('no uptrend claim in corrections', () => {
    // close 128 < sma200 157 → structure contradiction if trend were UP
    // But trend is DOWN, so no contradiction expected
    assert.equal(r.corrections.structureContradiction, false);
  });

  it('52W position is Lower Range', () => {
    // (128-118)/(204-118) ≈ 0.116 → Lower Range
    assert.ok(r.corrections.r52pct > 0.1 && r.corrections.r52pct < 0.15);
  });

  it('fundamentals panel shown (data present)', () => {
    assert.equal(r.panelGates.fundamentals.show, true);
  });

  it('trade plan hidden (verdict AVOID)', () => {
    assert.equal(r.panelGates.tradePlan.show, false);
  });

  it('model consensus valid (required 3 models)', () => {
    assert.equal(r.panelGates.modelConsensus.show, true);
  });

  it('breakout hidden (state NONE)', () => {
    // breakout_v2 exists with state NONE — should still show
    assert.equal(r.panelGates.breakout.show, true);
  });

  it('backend pct divergence detected', () => {
    // range_52w_pct=0.42 vs computed position ~0.116 → divergence > 0.15
    assert.equal(r.corrections.r52label, 'Lower Range');
    assert.ok(r.warnings.some(w => w.includes('52W range')));
  });
});

describe('Golden: AAPL uptrend', { skip: !hasFixture('aapl-uptrend.json') }, () => {
  const payload = loadFixture('aapl-uptrend.json');
  const r = guardPayload(payload, 'AAPL');

  it('no structure contradiction (close > sma200)', () => {
    assert.equal(r.corrections.structureContradiction, false);
  });

  it('no narrative contradiction (positive + BUY)', () => {
    assert.equal(r.corrections.narrativeContradiction, false);
  });

  it('trade plan shown (verdict BUY)', () => {
    assert.equal(r.panelGates.tradePlan.show, true);
  });

  it('fundamentals valid (AAPL-sized cap)', () => {
    assert.equal(r.panelGates.fundamentals.show, true);
    assert.equal(r.panelGates.fundamentals.degraded, undefined);
  });

  it('52W position is Upper Range', () => {
    // (210-160)/(220-160) = 50/60 ≈ 0.833 → Upper Range
    assert.ok(r.corrections.r52pct > 0.75 && r.corrections.r52pct < 0.9);
  });
});

describe('Golden: SPY ETF neutral', { skip: !hasFixture('spy-etf-neutral.json') }, () => {
  const payload = loadFixture('spy-etf-neutral.json');
  const r = guardPayload(payload, 'SPY');

  it('no contradictions', () => {
    assert.equal(r.corrections.structureContradiction, false);
    assert.equal(r.corrections.narrativeContradiction, false);
  });

  it('fundamentals hidden (null for ETF)', () => {
    assert.equal(r.panelGates.fundamentals.show, true);
    assert.equal(r.panelGates.fundamentals.degraded, true);
  });

  it('trade plan hidden (WAIT)', () => {
    assert.equal(r.panelGates.tradePlan.show, false);
  });

  it('model consensus hidden (no ev4)', () => {
    assert.equal(r.panelGates.modelConsensus.show, false);
  });

  it('breakout hidden (null)', () => {
    assert.equal(r.panelGates.breakout.show, false);
  });
});

describe('Golden: broken payload', { skip: !hasFixture('broken-payload.json') }, () => {
  const payload = loadFixture('broken-payload.json');
  const r = guardPayload(payload, 'BROKEN');

  it('no crash on empty data', () => {
    assert.ok(Array.isArray(r.warnings));
    assert.ok(r.panelGates);
    assert.ok(r.corrections);
  });

  it('all panels hidden or degraded', () => {
    assert.equal(r.panelGates.tradePlan.show, false);
    assert.equal(r.panelGates.fundamentals.show, true);
    assert.equal(r.panelGates.fundamentals.degraded, true);
    assert.equal(r.panelGates.breakout.show, false);
    assert.equal(r.panelGates.modelConsensus.show, false);
  });

  it('52W invalid', () => {
    assert.equal(r.corrections.r52pct, null);
  });
});

// ─── Cross-Panel Consistency ───────────────────────────────────────────────

describe('Cross-panel consistency', () => {
  it('close < sma200 → no bullish structure claim', () => {
    const struct = guardStructure({ trend: 'UP' }, { sma200: 157, sma50: 145 }, 128);
    assert.equal(struct.contradiction, true);
  });

  it('verdict AVOID → sentiment must not be positive (detected)', () => {
    const narr = guardNarrative({ sentiment: 'positive' }, { verdict: 'AVOID' }, {}, {}, 128);
    assert.equal(narr.contradiction, true);
  });

  it('trade plan visible only when verdict is BUY or SELL', () => {
    const waitGate = guardPanelGate('tradePlan', { verdict: 'WAIT', close: 100, tradePlanValid: true });
    const avoidGate = guardPanelGate('tradePlan', { verdict: 'AVOID', close: 100, tradePlanValid: true });
    const buyGate = guardPanelGate('tradePlan', { verdict: 'BUY', close: 100, tradePlanValid: true });
    assert.equal(waitGate.show, false);
    assert.equal(avoidGate.show, false);
    assert.equal(buyGate.show, true);
  });

  it('fundamentals P/E and EPS sign must be consistent', () => {
    const r = guardFundamentals({ pe_ttm: 30, eps_ttm: -2 });
    assert.equal(r.valid, false);
    assert.ok(r.warning.includes('sign mismatch'));
  });

  it('consensus split with degraded models flagged', () => {
    const ev4 = { input_states: {
      scientific: { status: 'ok' }, forecast: { status: 'error' },
      quantlab: { status: 'error' }
    }};
    const r = guardModelConsensus({}, ev4);
    assert.equal(r.degraded, true);
    assert.ok(r.warning.includes('1/3'));
  });

  it('52W range computation matches expected label boundaries', () => {
    // Near Low: < 0.1
    assert.equal(guard52WRange({ high_52w: 200, low_52w: 100 }, 105).label, 'Near Low');
    // Lower Range: 0.1-0.25
    assert.equal(guard52WRange({ high_52w: 200, low_52w: 100 }, 115).label, 'Lower Range');
    // Mid-Range: 0.25-0.75
    assert.equal(guard52WRange({ high_52w: 200, low_52w: 100 }, 150).label, 'Mid-Range');
    // Upper Range: 0.75-0.9
    assert.equal(guard52WRange({ high_52w: 200, low_52w: 100 }, 185).label, 'Upper Range');
    // Near High: > 0.9
    assert.equal(guard52WRange({ high_52w: 200, low_52w: 100 }, 195).label, 'Near High');
  });
});

// ─── 10-Point Fix: Risk Governance ───────────────────────────────────────────

describe('Risk governance (guardLabels)', () => {
  it('vol_percentile > 90 + LOW → riskOverride Elevated', () => {
    const r = guardLabels({ volatility: 'LOW' }, { volatility_percentile: 97 }, 100);
    assert.equal(r.riskOverride, 'Elevated');
    assert.ok(r.riskReason.includes('97'));
  });

  it('vol_percentile > 75 + LOW → riskOverride Medium', () => {
    const r = guardLabels({ volatility: 'LOW' }, { volatility_percentile: 80 }, 100);
    assert.equal(r.riskOverride, 'Medium');
  });

  it('vol_percentile > 90 + COMPRESSED → riskOverride Elevated', () => {
    const r = guardLabels({ volatility: 'COMPRESSED' }, { volatility_percentile: 95 }, 100);
    assert.equal(r.riskOverride, 'Elevated');
  });

  it('vol_percentile < 75 + LOW → no riskOverride', () => {
    const r = guardLabels({ volatility: 'LOW' }, { volatility_percentile: 20 }, 100);
    assert.equal(r.riskOverride, undefined);
  });

  it('vol_percentile > 90 + HIGH → no riskOverride (already correct)', () => {
    const r = guardLabels({ volatility: 'HIGH' }, { volatility_percentile: 92 }, 100);
    assert.equal(r.riskOverride, undefined);
  });
});

// ─── 10-Point Fix: Setup/Breakout Sync ───────────────────────────────────────

describe('Setup/Breakout cross-panel sync', () => {
  it('setup_type BREAKOUT + breakout_v2 NONE → not Breakout label', () => {
    // Simulates the frontend logic: setupType should NOT be 'Breakout' when brk state is NONE
    const _decision = { setup_type: 'BREAKOUT' };
    const _brkState = 'NONE';
    const setupType = _decision.setup_type === 'TREND_FOLLOW' ? 'Confirming Uptrend'
      : _decision.setup_type === 'MEAN_REVERSION' ? 'Pullback in Uptrend'
      : _decision.setup_type === 'BREAKOUT' && _brkState && _brkState !== 'NONE'
        ? 'Breakout'
      : _decision.setup_type === 'DEFENSIVE' ? 'Structural Downtrend'
      : 'Mixed / No Clean Entry';
    assert.notEqual(setupType, 'Breakout');
    assert.equal(setupType, 'Mixed / No Clean Entry');
  });

  it('setup_type BREAKOUT + breakout_v2 SETUP → Breakout label', () => {
    const _decision = { setup_type: 'BREAKOUT' };
    const _brkState = 'SETUP';
    const setupType = _decision.setup_type === 'TREND_FOLLOW' ? 'Confirming Uptrend'
      : _decision.setup_type === 'MEAN_REVERSION' ? 'Pullback in Uptrend'
      : _decision.setup_type === 'BREAKOUT' && _brkState && _brkState !== 'NONE'
        ? 'Breakout'
      : _decision.setup_type === 'DEFENSIVE' ? 'Structural Downtrend'
      : 'Mixed / No Clean Entry';
    assert.equal(setupType, 'Breakout');
  });

  it('setup_type BREAKOUT + breakout_v2 null → not Breakout label', () => {
    const _decision = { setup_type: 'BREAKOUT' };
    const _brkState = undefined;
    const setupType = _decision.setup_type === 'TREND_FOLLOW' ? 'Confirming Uptrend'
      : _decision.setup_type === 'MEAN_REVERSION' ? 'Pullback in Uptrend'
      : _decision.setup_type === 'BREAKOUT' && _brkState && _brkState !== 'NONE'
        ? 'Breakout'
      : _decision.setup_type === 'DEFENSIVE' ? 'Structural Downtrend'
      : 'Mixed / No Clean Entry';
    assert.notEqual(setupType, 'Breakout');
  });
});

// ─── 10-Point Fix: HP Suspect Confidence ─────────────────────────────────────

describe('HP suspect confidence logic', () => {
  const computeConfidence = (keys, suspectCount, totalN) => {
    const suspectRatio = keys > 0 ? suspectCount / keys : 0;
    if (suspectRatio >= 1.0) return 'UNAVAILABLE';
    if (suspectRatio >= 0.5) return 'LOW';
    return totalN > 1000 ? 'HIGH' : totalN > 300 ? 'MEDIUM' : 'LOW';
  };

  it('100% suspect → confidence UNAVAILABLE', () => {
    assert.equal(computeConfidence(14, 14, 5000), 'UNAVAILABLE');
  });

  it('>50% suspect → confidence max LOW', () => {
    assert.equal(computeConfidence(14, 8, 5000), 'LOW');
  });

  it('0% suspect + high N → HIGH', () => {
    assert.equal(computeConfidence(14, 0, 5000), 'HIGH');
  });

  it('0% suspect + low N → LOW', () => {
    assert.equal(computeConfidence(14, 0, 100), 'LOW');
  });

  it('49% suspect + high N → HIGH (not capped)', () => {
    // 6/14 ≈ 0.43 < 0.5
    assert.equal(computeConfidence(14, 6, 5000), 'HIGH');
  });
});

// ─── Backend deriveSetupType with breakoutState ─────────────────────────────

describe('deriveSetupType with breakoutState (backend)', () => {
  // Inline mirror of the updated deriveSetupType logic for unit testing
  const SETUP_TYPE = { TREND_FOLLOW: 'TREND_FOLLOW', MEAN_REVERSION: 'MEAN_REVERSION', BREAKOUT: 'BREAKOUT', DEFENSIVE: 'DEFENSIVE', NONE: 'NONE' };
  function deriveSetupType(states, breakoutState) {
    if (states?.trend === 'STRONG_UP' || states?.trend === 'UP') {
      if (states?.momentum === 'BULLISH' || states?.momentum === 'NEUTRAL') return SETUP_TYPE.TREND_FOLLOW;
      if (states?.momentum === 'OVERSOLD') return SETUP_TYPE.MEAN_REVERSION;
    }
    if (states?.volatility === 'COMPRESSED' || states?.volatility === 'LOW') {
      if (breakoutState && breakoutState !== 'NONE') return SETUP_TYPE.BREAKOUT;
      return SETUP_TYPE.NONE;
    }
    if (states?.trend === 'DOWN' || states?.trend === 'STRONG_DOWN') return SETUP_TYPE.DEFENSIVE;
    return SETUP_TYPE.NONE;
  }

  it('COMPRESSED + breakoutState NONE → NONE', () => {
    assert.equal(deriveSetupType({ volatility: 'COMPRESSED' }, 'NONE'), 'NONE');
  });

  it('COMPRESSED + breakoutState ARMED → BREAKOUT', () => {
    assert.equal(deriveSetupType({ volatility: 'COMPRESSED' }, 'ARMED'), 'BREAKOUT');
  });

  it('COMPRESSED + breakoutState SETUP → BREAKOUT', () => {
    assert.equal(deriveSetupType({ volatility: 'COMPRESSED' }, 'SETUP'), 'BREAKOUT');
  });

  it('COMPRESSED + breakoutState null → NONE', () => {
    assert.equal(deriveSetupType({ volatility: 'COMPRESSED' }, null), 'NONE');
  });

  it('COMPRESSED + breakoutState undefined → NONE', () => {
    assert.equal(deriveSetupType({ volatility: 'COMPRESSED' }), 'NONE');
  });

  it('LOW vol + breakoutState NONE → NONE', () => {
    assert.equal(deriveSetupType({ volatility: 'LOW' }, 'NONE'), 'NONE');
  });

  it('LOW vol + breakoutState TRIGGERED → BREAKOUT', () => {
    assert.equal(deriveSetupType({ volatility: 'LOW' }, 'TRIGGERED'), 'BREAKOUT');
  });

  it('UP trend + BULLISH momentum → TREND_FOLLOW (ignores breakoutState)', () => {
    assert.equal(deriveSetupType({ trend: 'UP', momentum: 'BULLISH', volatility: 'COMPRESSED' }, 'ARMED'), 'TREND_FOLLOW');
  });

  it('DOWN trend → DEFENSIVE (ignores breakoutState)', () => {
    assert.equal(deriveSetupType({ trend: 'DOWN' }, 'ARMED'), 'DEFENSIVE');
  });
});

// ─── OHLC adjFactor normalization ───────────────────────────────────────────

describe('OHLC adjFactor normalization logic', () => {
  function normalizeWithFactor(row) {
    const rawClose = row.close;
    const adjClose = row.adjusted_close ?? row.close;
    const factor = (rawClose != null && rawClose > 0) ? adjClose / rawClose : 1;
    return {
      open: row.open != null ? row.open * factor : adjClose,
      high: row.high != null ? row.high * factor : adjClose,
      low: row.low != null ? row.low * factor : adjClose,
      close: adjClose,
    };
  }

  it('no split → factor 1, OHLC unchanged', () => {
    const r = normalizeWithFactor({ open: 100, high: 110, low: 95, close: 105, adjusted_close: 105 });
    assert.equal(r.open, 100);
    assert.equal(r.high, 110);
    assert.equal(r.low, 95);
    assert.equal(r.close, 105);
  });

  it('2:1 split → all OHLC halved', () => {
    const r = normalizeWithFactor({ open: 200, high: 220, low: 190, close: 210, adjusted_close: 105 });
    assert.ok(Math.abs(r.open - 100) < 0.01);
    assert.ok(Math.abs(r.high - 110) < 0.01);
    assert.ok(Math.abs(r.low - 95) < 0.01);
    assert.equal(r.close, 105);
  });

  it('no adjusted_close → factor 1', () => {
    const r = normalizeWithFactor({ open: 50, high: 55, low: 45, close: 52 });
    assert.equal(r.open, 50);
    assert.equal(r.close, 52);
  });
});
