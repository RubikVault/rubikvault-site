import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformV2ToStockShape,
  fetchV2StockPage,
  fetchWithFallback,
  evaluateV2PromotionGate,
} from '../public/js/rv-v2-client.js';

const originalFetch = global.fetch;

describe('transformV2ToStockShape', () => {
  it('preserves name, bars, governance, and fundamentals', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'QCOM',
        name: 'Qualcomm Incorporated',
        market_prices: { close: 155.12, date: '2026-03-26' },
        market_stats: { stats: { atr14: 4.1 } },
        change: { pct: 0.01 },
        states: { volatility: 'LOW' },
        decision: { verdict: 'WAIT' },
        explanation: { headline: 'headline' },
      },
      { data_date: '2026-03-26', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 154 }, { date: '2026-03-26', close: 155.12 }],
        breakout_v2: { state: 'NONE' },
      },
      {
        universe: { name: 'Qualcomm Incorporated' },
        evaluation_v4: { id: 'ev4' },
      },
      {
        companyName: 'Qualcomm Incorporated',
        nextEarningsDate: '2026-04-29',
      },
      {
        historical: { data_date: '2026-03-26' },
        governance: { data_date: '2026-03-26' },
      }
    );

    assert.equal(payload.data.name, 'Qualcomm Incorporated');
    assert.equal(payload.data.bars.length, 2);
    assert.equal(payload.data.fundamentals.nextEarningsDate, '2026-04-29');
    assert.equal(payload.evaluation_v4.id, 'ev4');
    assert.equal(payload.metadata.as_of, '2026-03-26');
  });

  it('uses the historical market basis when V2 summary is thin or stale', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'QCOM',
        name: null,
        market_prices: { close: 143.09, date: '2026-02-07' },
        market_stats: { stats: { atr14: 4.1 } },
        change: { pct: 0.01 },
      },
      { data_date: '2026-02-07', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 129.5 }, { date: '2026-03-26', close: 130.54 }],
      },
      {
        universe: { name: null },
      },
      null,
      {},
      {
        data: {
          name: 'Qualcomm Incorporated',
          market_prices: { close: 130.54, date: '2026-03-26' },
          fundamentals: { nextEarningsDate: null },
        },
      }
    );

    assert.equal(payload.data.name, 'QCOM');
    assert.equal(payload.data.market_prices.close, 130.54);
    assert.equal(payload.metadata.as_of, '2026-03-26');
  });

  it('uses one canonical market basis when summary price scale diverges from bars', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'TEST',
        name: 'Test Asset',
        market_prices: { close: 13411, date: '2026-03-31', source_provider: 'snapshot' },
        market_stats: { as_of: '2026-03-31', stats: { high_52w: 10.8, low_52w: 9.8, atr14: 0.01, sma20: 10.2, sma50: 10.1, sma200: 10.0 } },
      },
      { data_date: '2026-03-31', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-30', close: 10.1 }, { date: '2026-03-31', close: 10.3 }],
        indicators: [{ id: 'high_52w', value: 10.8 }, { id: 'low_52w', value: 9.8 }, { id: 'atr14', value: 0.01 }, { id: 'rsi14', value: 51 }, { id: 'volatility_20d', value: 0.01 }, { id: 'volatility_percentile', value: 14 }, { id: 'bb_upper', value: 10.6 }, { id: 'bb_lower', value: 9.9 }, { id: 'range_52w_pct', value: 0.65 } ],
      },
      { universe: { name: 'Test Asset' } },
      null,
      {},
      null,
      { ticker: 'TEST', profile: null, regime: null, availability: { status: 'pending', reason: 'pending' } },
    );

    assert.equal(payload.data.market_prices.close, 10.3);
    assert.equal(payload.data.ssot.market_context.use_historical_basis, true);
    assert.equal(payload.data.ssot.market_context.key_levels_ready, true);
  });

  it('passes historical-profile payload through the transformed stock shape', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'QCOM',
        name: 'Qualcomm Incorporated',
        market_prices: { close: 155.12, date: '2026-03-26' },
        market_stats: { stats: { atr14: 4.1 } },
      },
      { data_date: '2026-03-26', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 154 }, { date: '2026-03-26', close: 155.12 }],
      },
      {
        universe: { name: 'Qualcomm Incorporated' },
      },
      null,
      {},
      null,
      {
        ticker: 'QCOM',
        profile: { ticker: 'QCOM', latest_date: '2026-03-20', events: { foo: { h20d: { n: 100 } } } },
        regime: { date: '2026-04-01' },
        availability: { status: 'ready', reason: 'Historical profile ready.' },
      },
    );

    assert.equal(payload.data.historical_profile.availability.status, 'ready');
    assert.equal(payload.data.ssot.historical_profile.status, 'ready');
    assert.equal(payload.data.ssot.historical_profile.profile_as_of, '2026-03-20');
  });

  it('uses the planned identity fallback order for page name resolution without legacy input', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'QCOM',
        name: null,
        market_prices: { close: 130.54, date: '2026-03-26' },
      },
      { data_date: '2026-03-26', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 129.5 }, { date: '2026-03-26', close: 130.54 }],
      },
      {
        universe: { name: 'Universe Name' },
      },
      {
        companyName: 'Fundamentals Name',
      },
      {},
      {
        data: {
          name: 'Legacy Name',
          market_prices: { close: 130.54, date: '2026-03-26' },
        },
      }
    );

    assert.equal(payload.data.name, 'Fundamentals Name');
  });

  it('ignores legacy-only identity when no authoritative identity exists', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'QCOM',
        name: null,
        market_prices: { close: 130.54, date: '2026-03-26' },
      },
      { data_date: '2026-03-26', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 129.5 }, { date: '2026-03-26', close: 130.54 }],
      },
      {
        universe: { name: null },
      },
      null,
      {},
      {
        data: {
          name: 'Legacy Name',
          market_prices: { close: 130.54, date: '2026-03-26' },
        },
      }
    );

    assert.equal(payload.data.name, 'QCOM');
    assert.equal(payload.data.source_provenance.identity_source, 'none');
  });

  it('ignores summary placeholder names that only repeat the ticker', () => {
    const payload = transformV2ToStockShape(
      {
        ticker: 'SPY',
        name: 'SPY',
        market_prices: { close: 510.12, date: '2026-03-26' },
      },
      { data_date: '2026-03-26', provider: 'v2-summary' },
      {
        bars: [{ date: '2026-03-25', close: 509.0 }, { date: '2026-03-26', close: 510.12 }],
      },
      {
        universe: { name: 'SPY' },
      },
      {
        companyName: 'State Street SPDR S&P 500 ETF Trust',
      },
      {},
      null
    );

    assert.equal(payload.data.name, 'State Street SPDR S&P 500 ETF Trust');
    assert.equal(payload.data.source_provenance.identity_source, 'fundamentals');
  });
});

describe('fetchV2StockPage', () => {
  beforeEach(() => {
    global.fetch = async (url) => {
      const href = String(url);
      const okJson = (data) => ({ ok: true, json: async () => data });
      if (href.includes('/summary')) {
        return okJson({
          ok: true,
          data: {
            ticker: 'QCOM',
            name: 'Qualcomm Incorporated',
            latest_bar: { date: '2026-03-26', close: 155.12 },
            market_prices: { close: 155.12, date: '2026-03-26' },
            market_stats: { stats: { atr14: 4.1 } },
            change: { pct: 0.01 },
          },
          meta: { data_date: '2026-03-26', provider: 'v2-summary' },
        });
      }
      if (href.includes('/governance')) {
        return okJson({
          ok: true,
          data: {
            ticker: 'QCOM',
            universe: { name: 'Qualcomm Incorporated' },
            evaluation_v4: { ok: true },
          },
          meta: { data_date: '2026-03-26', provider: 'v2-governance' },
        });
      }
      if (href.includes('/historical-profile')) {
        return okJson({
          ok: true,
          data: {
            ticker: 'QCOM',
            profile: { ticker: 'QCOM', latest_date: '2026-03-20', events: {} },
            regime: { date: '2026-04-01' },
            availability: { status: 'ready', reason: 'Historical profile ready.' },
          },
          meta: { data_date: '2026-04-01', provider: 'v2-historical-profile' },
        });
      }
      if (href.includes('/historical')) {
        return okJson({
          ok: true,
          data: {
            ticker: 'QCOM',
            bars: [{ date: '2026-03-25', close: 154 }, { date: '2026-03-26', close: 155.12 }],
            breakout_v2: { state: 'NONE' },
          },
          meta: { data_date: '2026-03-26', provider: 'v2-historical' },
        });
      }
      if (href.includes('/api/fundamentals')) {
        return okJson({
          data: {
            companyName: 'Qualcomm Incorporated',
            nextEarningsDate: '2026-04-29',
          },
          metadata: { provider: { selected: 'test' } },
        });
      }
      throw new Error(`Unexpected URL: ${href}`);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requires a full multi-endpoint contract before rendering V2 page data', async () => {
    const result = await fetchV2StockPage('QCOM');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'full');
    assert.equal(result.data.summary.ticker, 'QCOM');
    assert.equal(result.data.historical.bars.length, 2);
    assert.equal(result.data.governance.universe.name, 'Qualcomm Incorporated');
    assert.equal(result.data.historical_profile.availability.status, 'ready');
  });

  it('keeps thin V2 summary renderable when non-core modules are missing', async () => {
    global.fetch = async (url) => {
      const href = String(url);
      const okJson = (data) => ({ ok: true, json: async () => data });
      if (href.includes('/summary')) {
        return okJson({ ok: true, data: { ticker: 'VOW3.XETR', name: 'VOW3.XETR' }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/governance')) {
        throw new Error('governance unavailable');
      }
      if (href.includes('/historical')) {
        return okJson({ ok: true, data: { ticker: 'VOW3.XETR', bars: [] }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical-profile')) {
        throw new Error('historical profile unavailable');
      }
      if (href.includes('/api/fundamentals')) {
        throw new Error('fundamentals unavailable');
      }
      throw new Error(`Unexpected URL: ${href}`);
    };

    const result = await fetchV2StockPage('VOW3.XETR');
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'v2_degraded');
    assert.deepEqual(result.missingModules.includes('governance'), true);
  });
});

describe('evaluateV2PromotionGate', () => {
  it('respects normalized learning_gate minimum-n blockers', () => {
    const result = evaluateV2PromotionGate({
      data: {
        summary: {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          market_prices: { close: 200, date: '2026-04-10' },
          market_stats: { stats: { atr14: 1, sma20: 1, sma50: 1, sma200: 1 } },
        },
        historical: {
          bars: [{ date: '2026-04-10', close: 200 }],
        },
        governance: {
          universe: { name: 'Apple Inc.' },
          evaluation_v4: {
            decision: {
              learning_gate: {
                learning_status: 'ACTIVE',
                minimum_n_not_met: true,
              },
            },
          },
        },
        fundamentals: { companyName: 'Apple Inc.', nextEarningsDate: '2026-05-02' },
      },
      meta: {},
    });
    assert.equal(result.reasons.includes('minimum_n_not_met'), true);
  });
});

describe('fetchWithFallback', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    delete globalThis._rvFallbackLog;
  });

  it('keeps V2 degraded state renderable when summary exists but modules are incomplete', async () => {
    global.fetch = async (url) => {
      const href = String(url);
      const okJson = (data) => ({ ok: true, json: async () => data });
      if (href.includes('/summary')) {
        return okJson({ ok: true, data: { ticker: 'VOW3.XETR', name: 'VOW3.XETR', market_prices: { close: 101, date: '2026-03-26' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/governance')) {
        throw new Error('governance unavailable');
      }
      if (href.includes('/historical')) {
        return okJson({ ok: true, data: { ticker: 'VOW3.XETR', bars: [] }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical-profile') || href.includes('/api/fundamentals')) {
        throw new Error('optional unavailable');
      }
      throw new Error(`Unexpected URL: ${href}`);
    };

    const result = await fetchWithFallback('VOW3.XETR');
    assert.equal(result.source, 'v2');
    assert.equal(result.mode, 'v2_degraded');
    assert.equal(result.payload.data.ticker, 'VOW3.XETR');
    assert.match(result.notice, /Partial V2 data available/i);
  });

  it('keeps AAPL on the full V2 path when core modules are complete', async () => {
    global.fetch = async (url) => {
      const href = String(url);
      const okJson = (data) => ({ ok: true, json: async () => data });
      if (href.includes('/summary')) {
        return okJson({ ok: true, data: { ticker: 'AAPL', name: 'Apple Inc.', market_prices: { close: 189, date: '2026-03-26' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/governance')) {
        return okJson({ ok: true, data: { ticker: 'AAPL', universe: { name: 'Apple Inc.' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical')) {
        return okJson({ ok: true, data: { ticker: 'AAPL', bars: [{ date: '2026-03-26', close: 189 }] }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical-profile')) {
        return okJson({ ok: true, data: { ticker: 'AAPL', availability: { status: 'ready', reason: 'ready' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/api/fundamentals')) {
        return okJson({ data: { companyName: 'Apple Inc.' }, metadata: {} });
      }
      throw new Error(`Unexpected URL: ${href}`);
    };

    const result = await fetchWithFallback('AAPL');
    assert.equal(result.source, 'v2');
    assert.equal(result.mode, 'full');
    assert.equal(result.payload.data.ticker, 'AAPL');
  });

  it('keeps EXX renderable on the positive path', async () => {
    global.fetch = async (url) => {
      const href = String(url);
      const okJson = (data) => ({ ok: true, json: async () => data });
      if (href.includes('/summary')) {
        return okJson({ ok: true, data: { ticker: 'EXX', name: 'iShares STOXX Europe 600 Oil & Gas UCITS ETF', market_prices: { close: 48.2, date: '2026-03-26' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/governance')) {
        return okJson({ ok: true, data: { ticker: 'EXX', universe: { name: 'iShares STOXX Europe 600 Oil & Gas UCITS ETF' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical')) {
        return okJson({ ok: true, data: { ticker: 'EXX', bars: [{ date: '2026-03-26', close: 48.2 }] }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/historical-profile')) {
        return okJson({ ok: true, data: { ticker: 'EXX', availability: { status: 'ready', reason: 'ready' } }, meta: { data_date: '2026-03-26' } });
      }
      if (href.includes('/api/fundamentals')) {
        return okJson({ data: { companyName: 'iShares STOXX Europe 600 Oil & Gas UCITS ETF' }, metadata: {} });
      }
      throw new Error(`Unexpected URL: ${href}`);
    };

    const result = await fetchWithFallback('EXX');
    assert.equal(result.mode, 'full');
    assert.equal(result.payload.data.ticker, 'EXX');
  });

  it('returns an empty-state resolution when V2 is unavailable', async () => {
    global.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/summary')) {
        throw new Error('summary unavailable');
      }
      if (href.includes('/governance') || href.includes('/historical') || href.includes('/historical-profile') || href.includes('/api/fundamentals')) {
        throw new Error('module unavailable');
      }
      throw new Error(`Unexpected URL: ${href}`);
    };

    const result = await fetchWithFallback('FAKE999');
    assert.equal(result.mode, 'empty_state');
    assert.equal(result.source, 'none');
    assert.equal(result.payload.data.ticker, 'FAKE999');
  });
});
