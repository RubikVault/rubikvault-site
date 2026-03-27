import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformV2ToStockShape,
  fetchV2StockPage,
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

  it('uses fresher legacy identity and price data when V2 summary is thin or stale', () => {
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

    assert.equal(payload.data.name, 'Qualcomm Incorporated');
    assert.equal(payload.data.market_prices.close, 130.54);
    assert.equal(payload.metadata.as_of, '2026-03-26');
  });

  it('uses the planned identity fallback order for page name resolution', () => {
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
    assert.equal(result.data.summary.ticker, 'QCOM');
    assert.equal(result.data.historical.bars.length, 2);
    assert.equal(result.data.governance.universe.name, 'Qualcomm Incorporated');
  });
});
