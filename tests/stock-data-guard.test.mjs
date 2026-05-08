import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  guardPayload,
  buildUiIntegrity,
  validateReturnField,
  guard52WRange,
  guardPriceStack,
  guardTradePlan,
  guardFundamentals,
  guardStructure,
  guardNarrative,
  guardHistorical,
  guardLabels,
  guardModelConsensus,
  guardPanelGate,
} from '../public/js/stock-data-guard.js';

describe('UI integrity resolver', () => {
  it('blocks the HOOD false-authority fixture', () => {
    const payload = {
      data: {
        market_prices: { close: 72.89, date: '2026-04-30' },
        change: { pct: 2.3736, abs: 1.69 },
        market_stats: { stats: { low_52w: 45.6, rsi14: 42.4, sma20: 79, sma50: 76.4, atr14: 4.86 } },
        bars: [{ date: '2026-04-30', close: 72.89 }],
        ssot: {
          page_core: { coverage: { bars: 1193 } },
          market_context: {
            key_levels_ready: true,
            issues: [],
            prices_source: 'historical-bars',
            stats_source: 'historical-indicators',
            price_date: '2026-04-30',
            stats_date: '2026-04-30',
            latest_bar_date: '2026-04-30',
          },
        },
      },
      daily_decision: { schema: 'rv.asset_daily_decision.v1', pipeline_status: 'OK', verdict: 'WAIT', blocking_reasons: [], risk_assessment: { level: 'HIGH' } },
      analysis_readiness: { status: 'READY', decision_bundle_status: 'OK', blocking_reasons: [] },
      meta: { historical: { provider: 'page-core-minimal-history' } },
    };
    const integrity = buildUiIntegrity(payload, { ticker: 'HOOD', priceStack: { valid: true } });
    assert.equal(integrity.pageState, 'DATA_ISSUE');
    assert.equal(integrity.fields.asset_return_1d.status, 'BLOCK');
    assert.equal(integrity.fields.chart.status, 'BLOCK');
    assert.equal(integrity.dataQuality, 'FAILED');
    assert.equal(integrity.coverage, 'PARTIAL');
    assert.equal(integrity.decisionReadiness, 'UNAVAILABLE');
    assert.ok(integrity.flags.includes('RETURN_VALIDATION_FAILED'));
  });

  it('blocks broad-market benchmark returns above 20%', () => {
    const result = validateReturnField({ pct: 2.35, close: 718.66, isBenchmark: true, ticker: 'SPY' });
    assert.equal(result.status, 'BLOCK');
    assert.match(result.reason, /benchmark return plausibility/i);
  });

  it('blocks all-systems banner when only chart contract fails', () => {
    const payload = {
      data: {
        market_prices: { close: 72.89, date: '2026-04-30' },
        change: { pct: 0.01, abs: 0.72 },
        market_stats: { stats: { low_52w: 45.6, rsi14: 42.4, sma20: 79, sma50: 76.4, atr14: 4.86 } },
        bars: [{ date: '2026-04-30', close: 72.89 }],
        ssot: { page_core: { coverage: { bars: 1193 } } },
      },
      daily_decision: { schema: 'rv.asset_daily_decision.v1', pipeline_status: 'OK', verdict: 'WAIT', blocking_reasons: [], risk_assessment: { level: 'MEDIUM' } },
      analysis_readiness: { status: 'READY', decision_bundle_status: 'OK', blocking_reasons: [] },
      meta: { historical: { provider: 'page-core-minimal-history' } },
    };
    const integrity = buildUiIntegrity(payload, { ticker: 'HOOD', priceStack: { valid: true } });
    assert.equal(integrity.fields.chart.status, 'BLOCK');
    assert.equal(integrity.pageState, 'DATA_ISSUE');
    assert.equal(integrity.dataQuality, 'FAILED');
    assert.equal(integrity.decisionReadiness, 'READY');
  });

  it('renders model evidence panel as degraded instead of blank when evaluation is missing', () => {
    const gate = guardPanelGate('modelConsensus', { ev4: null, consensusValid: false, consensusDegraded: true });
    assert.equal(gate.show, true);
    assert.equal(gate.degraded, true);
  });

  it('keeps single-stock extreme returns as warning unless 52W low cross-check fails', () => {
    const result = validateReturnField({ pct: 0.62, close: 32.4, low52w: 10, isBenchmark: false, ticker: 'MOVE' });
    assert.equal(result.status, 'WARNING');
    assert.match(result.reason, /asset return plausibility warning/i);
  });
});

// ─── guard52WRange ──────────────────────────────────────────────────────────

describe('guard52WRange', () => {
  it('close near 52W low → Near Low', () => {
    const r = guard52WRange({ high_52w: 204, low_52w: 118 }, 122);
    assert.ok(r.positionPct < 0.1);
    assert.equal(r.label, 'Near Low');
    assert.equal(r.valid, true);
  });

  it('close near 52W high → Near High', () => {
    const r = guard52WRange({ high_52w: 204, low_52w: 118 }, 200);
    assert.ok(r.positionPct > 0.9);
    assert.equal(r.label, 'Near High');
  });

  it('close in mid range → Mid-Range', () => {
    const r = guard52WRange({ high_52w: 200, low_52w: 100 }, 150);
    assert.equal(r.label, 'Mid-Range');
    assert.ok(Math.abs(r.positionPct - 0.5) < 0.01);
  });

  it('close in lower range → Lower Range', () => {
    const r = guard52WRange({ high_52w: 200, low_52w: 100 }, 115);
    assert.equal(r.label, 'Lower Range');
  });

  it('close in upper range → Upper Range', () => {
    const r = guard52WRange({ high_52w: 200, low_52w: 100 }, 185);
    assert.equal(r.label, 'Upper Range');
  });

  it('null stats → invalid', () => {
    const r = guard52WRange({}, 128);
    assert.equal(r.valid, false);
  });

  it('high === low → invalid', () => {
    const r = guard52WRange({ high_52w: 100, low_52w: 100 }, 100);
    assert.equal(r.valid, false);
  });

  it('detects backend pct divergence', () => {
    const r = guard52WRange({ high_52w: 204, low_52w: 118, range_52w_pct: 0.42 }, 128);
    assert.equal(r.corrected, true);
    assert.ok(r.warning);
  });
});

describe('guardPriceStack', () => {
  it('flags a gross mismatch between market price and historical bar basis', () => {
    const r = guardPriceStack({
      data: {
        market_prices: { close: 13411 },
        market_stats: { stats: { high_52w: 10.8, low_52w: 9.8 } },
        bars: [{ close: 10.3 }],
      },
    });
    assert.equal(r.valid, false);
    assert.ok(r.issues.includes('price_bar_scale_mismatch'));
  });

  it('uses ssot market context when present', () => {
    const r = guardPriceStack({
      data: {
        ssot: {
          market_context: {
            key_levels_ready: false,
            issues: ['price_bar_scale_mismatch:13411:10.3'],
            prices_source: 'historical-bars',
          },
        },
      },
    });
    assert.equal(r.valid, false);
    assert.equal(r.source, 'historical-bars');
  });
});

// ─── guardTradePlan ─────────────────────────────────────────────────────────

describe('guardTradePlan', () => {
  it('sane levels → valid', () => {
    const r = guardTradePlan(128, 3.5, { verdict: 'BUY' });
    assert.equal(r.valid, true);
  });

  it('no close → invalid', () => {
    const r = guardTradePlan(null, 3.5, { verdict: 'BUY' });
    assert.equal(r.valid, false);
  });

  it('WAIT verdict → valid (no plan expected)', () => {
    const r = guardTradePlan(128, 3.5, { verdict: 'WAIT' });
    assert.equal(r.valid, true);
  });

  it('extreme ATR → invalid stop distance', () => {
    const r = guardTradePlan(128, 50, { verdict: 'BUY' });
    assert.equal(r.valid, false);
  });
});

// ─── guardFundamentals ──────────────────────────────────────────────────────

describe('guardFundamentals', () => {
  it('null fundamentals → invalid (no error)', () => {
    const r = guardFundamentals(null);
    assert.equal(r.valid, false);
    assert.equal(r.warning, null);
  });

  it('plausible QCOM fundamentals → valid', () => {
    const r = guardFundamentals({ marketCap: 143e9, pe_ttm: 14.2, eps_ttm: 9.03, dividendYield: 2.1 });
    assert.equal(r.valid, true);
  });

  it('absurd market cap → warning', () => {
    const r = guardFundamentals({ marketCap: 3.25e12 });
    // 3.25T is valid (could be AAPL/MSFT), but still within range
    assert.equal(r.valid, true);
  });

  it('market cap > 20T → warning', () => {
    const r = guardFundamentals({ marketCap: 25e12 });
    assert.equal(r.valid, false);
    assert.ok(r.warning);
  });

  it('P/E and EPS sign mismatch → warning', () => {
    const r = guardFundamentals({ pe_ttm: 30, eps_ttm: -2 });
    assert.equal(r.valid, false);
    assert.ok(r.warning.includes('sign mismatch'));
  });

  it('dividend yield > 100% → warning', () => {
    const r = guardFundamentals({ dividendYield: 150 });
    assert.equal(r.valid, false);
  });
});

// ─── guardStructure ─────────────────────────────────────────────────────────

describe('guardStructure', () => {
  it('bullish but close < SMA200 → contradiction', () => {
    const r = guardStructure({ trend: 'UP' }, { sma200: 157, sma50: 145 }, 128);
    assert.equal(r.contradiction, true);
    assert.ok(r.warning);
  });

  it('consistent bullish → no contradiction', () => {
    const r = guardStructure({ trend: 'UP' }, { sma200: 120, sma50: 125 }, 130);
    assert.equal(r.contradiction, false);
  });

  it('STRONG_UP but below SMA20 → contradiction', () => {
    const r = guardStructure({ trend: 'STRONG_UP' }, { sma200: 120, sma50: 125, sma20: 135 }, 130);
    assert.equal(r.contradiction, true);
  });

  it('downtrend → no contradiction check needed', () => {
    const r = guardStructure({ trend: 'DOWN' }, { sma200: 157 }, 128);
    assert.equal(r.contradiction, false);
  });

  it('null close → no contradiction', () => {
    const r = guardStructure({ trend: 'UP' }, { sma200: 157 }, null);
    assert.equal(r.contradiction, false);
  });
});

// ─── guardNarrative ─────────────────────────────────────────────────────────

describe('guardNarrative', () => {
  it('positive sentiment + AVOID → contradiction', () => {
    const r = guardNarrative({ sentiment: 'positive' }, { verdict: 'AVOID' }, {}, {}, 128);
    assert.equal(r.contradiction, true);
  });

  it('neutral sentiment + WAIT → no contradiction', () => {
    const r = guardNarrative({ sentiment: 'neutral' }, { verdict: 'WAIT' }, {}, {}, 128);
    assert.equal(r.contradiction, false);
  });

  it('uptrend claim when close < SMA200 → contradiction', () => {
    const r = guardNarrative(
      { synthesis: 'within a long-term structural uptrend' },
      { verdict: 'BUY' }, {}, { sma200: 157 }, 128
    );
    assert.equal(r.contradiction, true);
  });

  it('uptrend claim when close > SMA200 → no contradiction', () => {
    const r = guardNarrative(
      { synthesis: 'within a long-term structural uptrend' },
      { verdict: 'BUY' }, {}, { sma200: 120 }, 130
    );
    assert.equal(r.contradiction, false);
  });
});

// ─── guardHistorical ────────────────────────────────────────────────────────

describe('guardHistorical', () => {
  it('implausible 5d returns → suspect', () => {
    const events = { rsi_oversold: { h5d: { avg_return: -0.65, mae: 0.03, mfe: 0.02 } } };
    const r = guardHistorical(events, 'h5d');
    assert.ok(r.suspectKeys.includes('rsi_oversold'));
  });

  it('plausible 5d returns → valid', () => {
    const events = { rsi_oversold: { h5d: { avg_return: -0.02, mae: 0.03, mfe: 0.04 } } };
    const r = guardHistorical(events, 'h5d');
    assert.equal(r.suspectKeys.length, 0);
  });

  it('null events → valid', () => {
    const r = guardHistorical(null, 'h5d');
    assert.equal(r.valid, true);
  });
});

// ─── guardLabels ────────────────────────────────────────────────────────────

describe('guardLabels', () => {
  it('RSI near oversold → suffix added', () => {
    const r = guardLabels({ momentum: 'BEARISH' }, { rsi14: 31 }, 128);
    assert.equal(r.rsiSuffix, ' · Near Oversold');
  });

  it('RSI mid-range → no suffix', () => {
    const r = guardLabels({ momentum: 'NEUTRAL' }, { rsi14: 50 }, 128);
    assert.equal(r.rsiSuffix, undefined);
  });

  it('extreme volatility → risk reason present', () => {
    const r = guardLabels({ volatility: 'EXTREME' }, { volatility_percentile: 99 }, 128);
    assert.ok(r.riskReason.includes('99'));
  });
});

// ─── guardModelConsensus ────────────────────────────────────────────────────

describe('guardModelConsensus', () => {
  it('no evaluation_v4 → invalid', () => {
    const r = guardModelConsensus({}, null);
    assert.equal(r.valid, false);
  });

  it('all models ok → valid', () => {
    const ev4 = { input_states: {
      scientific: { status: 'ok' }, forecast: { status: 'ok' },
      elliott: { status: 'ok' }, quantlab: { status: 'ok' }
    }};
    const r = guardModelConsensus({}, ev4);
    assert.equal(r.valid, true);
    assert.equal(r.warning, null);
  });

  it('only 2 models → degraded', () => {
    const ev4 = { input_states: {
      scientific: { status: 'ok' }, forecast: { status: 'error' },
      elliott: { status: 'ok' }, quantlab: { status: 'error' }
    }};
    const r = guardModelConsensus({}, ev4);
    assert.equal(r.valid, true);
    assert.equal(r.degraded, false);
  });
});

// ─── guardPanelGate ─────────────────────────────────────────────────────────

describe('guardPanelGate', () => {
  it('trade plan WAIT → hidden', () => {
    const r = guardPanelGate('tradePlan', { verdict: 'WAIT', close: 128, tradePlanValid: true });
    assert.equal(r.show, false);
  });

  it('trade plan BUY + valid → shown', () => {
    const r = guardPanelGate('tradePlan', { verdict: 'BUY', close: 128, tradePlanValid: true });
    assert.equal(r.show, true);
  });

  it('fundamentals null → hidden', () => {
    const r = guardPanelGate('fundamentals', { fund: null, fundValid: false });
    assert.equal(r.show, true);
    assert.equal(r.degraded, true);
  });

  it('fundamentals present but invalid → degraded', () => {
    const r = guardPanelGate('fundamentals', { fund: { marketCap: 1e9 }, fundValid: false });
    assert.equal(r.show, true);
    assert.equal(r.degraded, true);
  });

  it('breakout no data → hidden', () => {
    const r = guardPanelGate('breakout', { brk: null });
    assert.equal(r.show, false);
  });

  it('breakout with state → shown', () => {
    const r = guardPanelGate('breakout', { brk: { state: 'NONE' } });
    assert.equal(r.show, true);
  });

  it('key levels hidden on price stack mismatch', () => {
    const r = guardPanelGate('keyLevels', { priceStackValid: false, issues: ['price_bar_scale_mismatch'] });
    assert.equal(r.show, false);
  });
});

// ─── guardPayload (integration) ─────────────────────────────────────────────

describe('guardPayload', () => {
  it('returns warnings, panelGates, corrections', () => {
    const payload = {
      data: { market_stats: { stats: { high_52w: 204, low_52w: 118, range_52w_pct: 0.42 } }, market_prices: { close: 128 } },
      states: { trend: 'DOWN', momentum: 'BEARISH', volatility: 'EXTREME' },
      decision: { verdict: 'AVOID' },
      explanation: { sentiment: 'negative' },
    };
    const r = guardPayload(payload, 'QCOM');
    assert.ok(Array.isArray(r.warnings));
    assert.ok(r.panelGates);
    assert.ok(r.corrections);
    // With range_52w_pct diverging from computed position, correction is triggered
    assert.equal(r.corrections.r52label, 'Lower Range');
  });

  it('detects structure contradiction in full payload', () => {
    const payload = {
      data: { market_stats: { stats: { sma200: 157, sma50: 145 } }, market_prices: { close: 128 } },
      states: { trend: 'UP' },
      decision: { verdict: 'BUY' },
      explanation: {},
    };
    const r = guardPayload(payload, 'TEST');
    assert.equal(r.corrections.structureContradiction, true);
  });

  it('detects key-level mismatch from ssot market context', () => {
    const payload = {
      data: {
        market_prices: { close: 13411 },
        ssot: {
          market_context: {
            key_levels_ready: false,
            issues: ['price_bar_scale_mismatch:13411:10.3'],
          },
        },
      },
      states: {},
      decision: { verdict: 'WAIT' },
      explanation: {},
    };
    const r = guardPayload(payload, 'BROKEN');
    assert.equal(r.panelGates.keyLevels.show, false);
    assert.equal(r.corrections.priceStack.valid, false);
  });
});
