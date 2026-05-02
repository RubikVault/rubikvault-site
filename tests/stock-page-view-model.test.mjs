import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageHierarchyPresentation,
  buildRiskPresentation,
  buildCatalystPresentation,
  buildFundamentalsPresentation,
  buildTrustPresentation,
  buildWaitStatePresentation,
  buildExecutiveDecisionPresentation,
  buildHorizonPresentation,
  buildModelConsensusPresentation,
  buildActiveModelConsensusPresentation,
  buildHistoricalModulePresentation,
  buildBreakoutDensityPresentation,
  buildInterpretiveChangePresentation,
  buildBackgroundModulePresentation,
  buildMobileNavigationPresentation,
  classifyHistoricalFreshness,
  validateLevelConsistency,
  buildTradePlanModel,
  computeTooltipFrame,
  buildPageIdentity,
  buildModuleFreshnessPresentation,
  formatOrdinal,
} from '../public/js/stock-page-view-model.js';

describe('formatOrdinal', () => {
  it('formats English ordinal suffixes', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 43].map(formatOrdinal),
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '43rd'],
    );
  });
});

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
    assert.equal(risk.scoreColor, 'var(--yellow)');
    assert.match(risk.scoreHelperText, /better structural quality, not lower final risk/i);
    assert.match(risk.driverText, /Volatility percentile: 100th/i);
    assert.match(risk.contextText, /extremely elevated/i);
    assert.match(risk.overrideDisplayReason, /Risk override active/i);
    assert.match(risk.displaySentence, /final risk is moderated to Elevated/i);
    assert.equal(risk.displayLabel, 'Elevated');
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

describe('buildCatalystPresentation', () => {
  it('uses estimated earnings window for stocks', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'QCOM',
      name: 'Qualcomm Incorporated',
      fundamentals: { nextEarningsDate: '2026-04-29T00:00:00Z' },
    });
    assert.equal(catalyst.renderMode, 'compact');
    assert.match(catalyst.primaryText, /2026-04-29/);
  });

  it('prefers normalized catalyst payload when server-side feed is available', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      fundamentals: { updatedAt: '2026-04-10' },
      catalysts: {
        status: 'confirmed',
        next_earnings_date: '2026-05-02',
        items: [{ type: 'earnings', label: 'Earnings', date: '2026-05-02' }],
      },
    });
    assert.equal(catalyst.renderMode, 'card');
    assert.equal(catalyst.items.length, 1);
  });

  it('does not emit fake earnings fallback for ETFs', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      fundamentals: null,
    });
    assert.equal(catalyst.renderMode, 'inline');
    assert.match(catalyst.primaryText, /No confirmed catalyst currently scheduled/i);
  });

  it('uses unavailable-feed wording for stocks without earnings schedule', () => {
    const catalyst = buildCatalystPresentation({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      fundamentals: { updatedAt: '2026-03-30' },
    });
    assert.equal(catalyst.renderMode, 'inline');
    assert.match(catalyst.primaryText, /Earnings schedule unavailable in current feed/i);
  });
});

describe('buildFundamentalsPresentation', () => {
  it('marks partial fundamentals as limited data', () => {
    const view = buildFundamentalsPresentation({
      ticker: 'AAPL',
      name: 'Apple Inc.',
      fundamentals: { marketCap: 3.1e12, pe_ttm: 31.8, updatedAt: '2026-03-31T00:00:00Z' },
    });
    assert.equal(view.status, 'degraded');
    assert.equal(view.title, 'Fundamentals (limited data)');
    assert.match(view.secondaryText, /Available:/);
    assert.match(view.secondaryText, /Unavailable:/);
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

describe('buildTrustPresentation', () => {
  it('summarizes coverage and dates in one trust sentence', () => {
    const trust = buildTrustPresentation({
      decisionAsOf: '2026-03-31',
      priceAsOf: '2026-03-31',
      moduleFreshness: [{ label: 'Historical', state: 'stale', ageDays: 4 }],
      fundamentalsStatus: 'degraded',
      modelEvidenceLimited: true,
    });
    assert.equal(trust.coverageLabel, 'partial');
    assert.match(trust.historicalState, /delayed by 4 trading days/i);
    assert.match(trust.summaryText, /Analysis & Price as-of: 2026-03-31/i);
  });
});

describe('buildModuleFreshnessPresentation', () => {
  it('treats Friday data as fresh on Monday using business days', () => {
    const freshness = buildModuleFreshnessPresentation({
      data: {
        market_prices: { date: '2026-03-06' },
        bars: [{ date: '2026-03-06', close: 100 }],
        module_freshness: {
          historical_as_of: '2026-03-06',
        },
      },
    }, new Date('2026-03-09T12:00:00Z'));

    const historical = freshness.find((item) => item.label === 'Historical');
    assert.equal(historical?.ageDays, 1);
    assert.equal(historical?.state, 'fresh');
  });
});

describe('buildWaitStatePresentation', () => {
  it('creates actionable WAIT-state guidance', () => {
    const waitView = buildWaitStatePresentation({
      decision: { scores: { composite: 62 }, trigger_gates: ['EXTREME_VOLATILITY'] },
      states: { trend: 'RANGE', volatility: 'EXTREME', volume: 'DRY', momentum: 'NEUTRAL' },
      stats: { sma20: 257.1, volatility_percentile: 100 },
      close: 250,
    });
    assert.equal(waitView.headline, 'No clean setup right now');
    assert.match(waitView.subheadline, /Stand aside/i);
    assert.equal(waitView.whyBullets.length >= 3, true);
    assert.match(waitView.nextActions[0], /SMA20/i);
  });
});

describe('buildModelConsensusPresentation', () => {
  it('marks partial model coverage as not actionable', () => {
    const view = buildModelConsensusPresentation({
      evaluation: {},
      decision: { verdict: 'WAIT' },
      missingModels: ['forecast', 'scientific'],
    });
    assert.equal(view.coverageCount, 1);
    assert.match(view.actionableText, /Consensus not actionable/i);
    assert.match(view.availabilityText, /Only 1 of 3 models available/i);
  });
});

describe('buildExecutiveDecisionPresentation', () => {
  it('prioritizes why, blocker, and next action for WAIT', () => {
    const view = buildExecutiveDecisionPresentation({
      decision: { verdict: 'WAIT', scores: { composite: 62 }, trigger_gates: ['EXTREME_VOLATILITY'] },
      states: { trend: 'RANGE', volatility: 'EXTREME', volume: 'DRY', momentum: 'NEUTRAL' },
      stats: { sma20: 254, volatility_percentile: 100 },
      close: 250,
      effectiveVerdict: 'WAIT',
    });
    assert.equal(view.summaryLine, 'Sit on hands. No clean setup yet.');
    assert.equal(view.whyNotNow.length >= 3, true);
    assert.match(view.blocker, /volatility|trend/i);
    assert.match(view.primaryNextAction, /SMA20/i);
    assert.match(view.setupQualityNote, /pattern quality only/i);
  });
});

describe('buildHorizonPresentation', () => {
  it('collapses horizons when every verdict matches', () => {
    const view = buildHorizonPresentation([
      { v: { l: 'WAIT' } },
      { v: { l: 'WAIT' } },
      { v: { l: 'WAIT' } },
    ]);
    assert.equal(view.showCards, false);
    assert.equal(view.compactText, 'Across all horizons: WAIT');
  });
});

describe('buildActiveModelConsensusPresentation', () => {
  it('filters inactive models out of the active grid', () => {
    const view = buildActiveModelConsensusPresentation({
      evaluation: {},
      decision: { verdict: 'WAIT' },
      missingModels: ['forecast', 'scientific'],
      modelStates: { quantlab: 'neutral', elliott: 'bullish' },
    });
    assert.equal(view.coverageCount, 1);
    assert.deepEqual(view.activeModels.map((item) => item.key), ['quantlab']);
    assert.match(view.finalInterpretation, /Not actionable/i);
  });
});

describe('buildBreakoutDensityPresentation', () => {
  it('demotes weak breakout states into compact mode', () => {
    const view = buildBreakoutDensityPresentation({
      breakout: { state: 'SETUP', scores: { total: 35 } },
      verdict: 'WAIT',
    });
    assert.equal(view.mode, 'compact');
    assert.match(view.headline, /not actionable yet/i);
  });
});

describe('buildInterpretiveChangePresentation', () => {
  it('leads with an interpretive summary sentence', () => {
    const view = buildInterpretiveChangePresentation({
      timeframe: '1D',
      close: 250,
      stats: { sma20: 254, rsi14: 47.4 },
      change: { pct: 0.029 },
      trendLabel: 'Sideways',
      maStack: 'Mixed',
      riskLabel: 'High',
      rsiZone: 'Neutral',
    });
    assert.match(view.summary, /Momentum improved slightly|structure remains weak/i);
    assert.equal(Array.isArray(view.items), true);
    assert.equal(view.items.length >= 3, true);
  });
});

describe('buildBackgroundModulePresentation', () => {
  it('marks historical modules as background context', () => {
    const view = buildBackgroundModulePresentation({
      title: 'Historical signal profile',
      freshnessStatus: 'stale',
      dimOpacity: 0.6,
      collapsedByDefault: true,
    });
    assert.equal(view.tone, 'background');
    assert.match(view.contextLabel, /background context/i);
  });
});

describe('buildMobileNavigationPresentation', () => {
  it('enables segmented tabs on mobile viewports', () => {
    const view = buildMobileNavigationPresentation({ viewportWidth: 390 });
    assert.equal(view.enabled, true);
    assert.deepEqual(view.tabs.map((tab) => tab.label), ['Overview', 'Technicals', 'Evidence']);
  });
});

describe('buildPageHierarchyPresentation', () => {
  it('defines decision, evidence, and background layers', () => {
    const view = buildPageHierarchyPresentation();
    assert.deepEqual(view.sections.map((section) => section.label), ['Decision Layer', 'Evidence Layer', 'Background Layer']);
  });
});

describe('buildHistoricalModulePresentation', () => {
  it('qualifies stale historical modules as background context only', () => {
    const freshness = classifyHistoricalFreshness('2026-03-01', new Date('2026-03-27T12:00:00Z'));
    const view = buildHistoricalModulePresentation(freshness);
    assert.match(view.subtitle, /background context only/i);
    assert.match(view.confidenceLabel, /historical only/i);
    assert.match(view.regimeLabel, /Historical regime snapshot/i);
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

  it('flags canonical close above 52W high', () => {
    const result = validateLevelConsistency([
      { label: '52W High', price: 10.8 },
      { label: '52W Low', price: 9.8 },
    ], 13411);
    assert.equal(result.valid, false);
    assert.match(result.issues[0], /52W High/);
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

  it('ignores ticker-placeholder names when a richer fundamentals name exists', () => {
    const identity = buildPageIdentity({
      data: {
        ticker: 'AAPL',
        name: 'AAPL',
        fundamentals: { companyName: 'Apple Inc.' },
        market_prices: { close: 200.12, date: '2026-03-31' },
      },
      metadata: {
        request: { normalized_ticker: 'AAPL' },
      },
    }, 'AAPL');
    assert.equal(identity.name, 'Apple Inc.');
  });
});
