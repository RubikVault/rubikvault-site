import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRiskPresentation,
  buildFundamentalsPresentation,
  buildCatalystPresentation,
  buildModelEvidencePresentation,
  classifyHistoricalFreshness,
  validateLevelConsistency,
  buildTradePlanModel,
  computeTooltipFrame,
  buildPageIdentity,
} from '../public/js/stock-page-view-model.js';

describe('buildRiskPresentation', () => {
  it('keeps final risk and raw score semantics separate', () => {
    const risk = buildRiskPresentation({
      decision: { scores: { risk: 70 } },
      states: { volatility: 'LOW' },
      stats: { volatility_percentile: 100 },
    });
    assert.equal(risk.scoreLabel, 'Risk Quality');
    assert.equal(risk.finalState, 'Elevated');
    assert.equal(risk.overrideApplied, true);
    assert.equal(risk.scoreColor, 'rgba(245,158,11,0.72)');
    assert.match(risk.scoreHelperText, /better structural quality, not lower final risk/i);
    assert.match(risk.driverText, /100th percentile/i);
    assert.match(risk.contextText, /override applied/i);
    assert.match(risk.displaySentence, /final risk is moderated to Elevated/i);
    assert.equal(risk.displayLabel, 'Elevated (override)');
  });

  it('shows direct final risk when no override exists', () => {
    const risk = buildRiskPresentation({
      decision: { scores: { risk: 42 } },
      states: { volatility: 'HIGH' },
      stats: { volatility_percentile: 88 },
    });
    assert.equal(risk.finalState, 'High');
    assert.equal(risk.overrideApplied, false);
  });
});

describe('buildFundamentalsPresentation', () => {
  it('hides empty fundamentals cards behind inline unavailable state', () => {
    const view = buildFundamentalsPresentation({
      fundamentals: {
        marketCap: null,
        pe_ttm: null,
        eps_ttm: null,
        dividendYield: null,
      },
      meta: { status: 'error' },
    });
    assert.equal(view.renderMode, 'inline');
    assert.match(view.helperText, /source unavailable/i);
  });

  it('renders compact mode for a single useful metric', () => {
    const view = buildFundamentalsPresentation({
      fundamentals: { marketCap: 1_200_000_000 },
      meta: { status: 'ok' },
    });
    assert.equal(view.renderMode, 'compact');
    assert.equal(view.metrics.length, 1);
  });
});

describe('buildCatalystPresentation', () => {
  it('uses estimated earnings window for stocks', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'QCOM',
      name: 'Qualcomm Incorporated',
      fundamentals: { nextEarningsDate: '2026-04-29T00:00:00Z' },
    });
    assert.equal(catalyst.renderMode, 'compact');
    assert.match(catalyst.secondaryText, /2026-04-29/);
  });

  it('does not emit fake earnings fallback for ETFs', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      fundamentals: null,
    });
    assert.equal(catalyst.renderMode, 'hidden');
  });

  it('uses explicit unavailable copy when the fundamentals feed errors', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'QCOM',
      name: 'Qualcomm Incorporated',
      fundamentals: null,
      fundamentalsMeta: { status: 'error' },
    });
    assert.equal(catalyst.renderMode, 'inline');
    assert.match(catalyst.primaryText, /currently unavailable/i);
  });
});

describe('buildModelEvidencePresentation', () => {
  it('hides the section when no consensus module and no breakout evidence exists', () => {
    const view = buildModelEvidencePresentation({ evaluationV4: null, breakout: { state: 'NONE', scores: { total: 0 } } });
    assert.equal(view.showSection, false);
  });
});

describe('classifyHistoricalFreshness', () => {
  it('marks >2 business-day-old regime as stale and muted', () => {
    const freshness = classifyHistoricalFreshness('2026-03-11', new Date('2026-03-27T12:00:00Z'));
    assert.equal(freshness.status, 'stale');
    assert.equal(freshness.opacity <= 0.6, true);
    assert.equal(freshness.badge, 'STALE');
  });

  it('adds a stronger warning when regime data is very stale', () => {
    const freshness = classifyHistoricalFreshness('2026-03-01', new Date('2026-03-27T12:00:00Z'));
    assert.equal(freshness.status, 'stale');
    assert.equal(freshness.opacity <= 0.5, true);
    assert.match(freshness.subtitle, /background context only/i);
    assert.match(freshness.warningText, /may not reflect current market conditions/i);
  });
});

describe('validateLevelConsistency', () => {
  it('flags canonical close above 5D high', () => {
    const result = validateLevelConsistency([
      { label: '5D High', price: 100 },
      { label: '5D Low', price: 95 },
      { label: '20D High', price: 110 },
      { label: '20D Low', price: 90 },
    ], 101);
    assert.equal(result.valid, false);
    assert.match(result.issues[0], /5D High/);
  });
});

describe('buildTradePlanModel', () => {
  it('returns unavailable when BUY geometry is incomplete', () => {
    const plan = buildTradePlanModel({
      verdict: 'BUY',
      close: 100,
      atr: 5,
      levels: [{ label: '5D Low', kind: 'support', price: 97 }],
    });
    assert.equal(plan.status, 'unavailable');
  });

  it('builds SELL plan with directional target below entry', () => {
    const plan = buildTradePlanModel({
      verdict: 'SELL',
      close: 100,
      atr: 5,
      levels: [
        { label: 'Pivot', kind: 'support', price: 96 },
        { label: '20D Low', kind: 'support', price: 92 },
      ],
    });
    assert.equal(plan.status, 'ready');
    assert.equal(plan.target < plan.entry, true);
    assert.equal(plan.stop > plan.entry, true);
  });
});

describe('computeTooltipFrame', () => {
  it('clamps tooltip inside chart container', () => {
    const frame = computeTooltipFrame({
      pointX: 395,
      pointY: 20,
      containerRect: { width: 400, height: 180 },
      tooltipWidth: 120,
      tooltipHeight: 48,
    });
    assert.equal(frame.left <= 272, true);
    assert.equal(frame.top >= 8, true);
  });
});

describe('buildPageIdentity', () => {
  it('prefers company name and canonical as-of', () => {
    const identity = buildPageIdentity({
      data: {
        ticker: 'QCOM',
        name: 'Qualcomm Incorporated',
        market_prices: { close: 155.12, date: '2026-03-26' },
      },
      metadata: {
        request: { normalized_ticker: 'QCOM' },
      },
    }, 'QCOM');
    assert.equal(identity.name, 'Qualcomm Incorporated');
    assert.equal(identity.pageAsOf, '2026-03-26');
  });

  it('falls back to universe name before ticker-only rendering', () => {
    const identity = buildPageIdentity({
      data: {
        ticker: 'QCOM',
        market_prices: { close: 155.12, date: '2026-03-26' },
      },
      universe: {
        name: 'Qualcomm Incorporated',
      },
      metadata: {
        request: { normalized_ticker: 'QCOM' },
      },
    }, 'QCOM');
    assert.equal(identity.name, 'Qualcomm Incorporated');
  });
});
