#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildMarketStatsFromIndicators,
  selectCanonicalMarketPrices,
  selectCanonicalMarketStats,
} from '../functions/api/_shared/stock-helpers.js';

import {
  statsFromIndicatorEntries,
  transformV2ToStockShape,
  deriveIntegrity,
} from '../public/js/rv-v2-client.js';

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function isoDayOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

const today = isoDayOffset(0);
const yesterday = isoDayOffset(-1);
const staleDay = isoDayOffset(-10);

const historicalIndicatorPayload = {
  indicators: [
    { id: 'rsi14', value: 37.4 },
    { id: 'atr14', value: 4.03 },
    { id: 'volatility_20d', value: 0.0127 },
    { id: 'volatility_percentile', value: 95.3 },
    { id: 'bb_upper', value: 143.6 },
    { id: 'bb_lower', value: 124.6 },
    { id: 'high_52w', value: 203.5 },
    { id: 'low_52w', value: 118.0 },
    { id: 'range_52w_pct', value: 0.42 },
  ],
  issues: [],
};

test('buildMarketStatsFromIndicators accepts computeIndicators payload shape', () => {
  const record = buildMarketStatsFromIndicators(historicalIndicatorPayload, 'QCOM', yesterday);
  assert.equal(record.symbol, 'QCOM');
  assert.equal(record.as_of, yesterday);
  assert.equal(record.stats.rsi14, 37.4);
  assert.equal(record.stats.range_52w_pct, 0.42);
});

test('selectCanonicalMarketPrices prefers fresher live price record', () => {
  const canonical = selectCanonicalMarketPrices(
    { symbol: 'QCOM', date: staleDay, close: 143.09, source_provider: 'snapshot' },
    { symbol: 'QCOM', date: yesterday, close: 130.35, source_provider: 'eodhd', volume: 6665800 }
  );
  assert.equal(canonical.date, yesterday);
  assert.equal(canonical.close, 130.35);
  assert.equal(canonical.volume, 6665800);
});

test('selectCanonicalMarketStats prefers more complete record', () => {
  const canonical = selectCanonicalMarketStats(
    { symbol: 'QCOM', as_of: staleDay, stats: { rsi14: null, atr14: null } },
    { symbol: 'QCOM', as_of: yesterday, stats: statsFromIndicatorEntries(historicalIndicatorPayload, 'QCOM', yesterday).stats }
  );
  assert.equal(canonical.as_of, yesterday);
  assert.equal(canonical.stats.atr14, 4.03);
  assert.equal(canonical.stats.bb_upper, 143.6);
});

test('transformV2ToStockShape produces canonical fresh price and stats', () => {
  const payload = transformV2ToStockShape(
    {
      ticker: 'QCOM',
      latest_bar: {
        date: yesterday,
        open: 130.16,
        high: 131.93,
        low: 129.95,
        close: 130.35,
        adjClose: 130.35,
        volume: 6665800,
      },
      market_prices: {
        symbol: 'QCOM',
        date: staleDay,
        close: 143.09,
        source_provider: 'snapshot',
      },
      market_stats: null,
      change: { pct: 0.013 },
      states: { trend: 'STRONG_DOWN', momentum: 'BEARISH', volatility: 'LOW' },
      decision: { verdict: 'WAIT' },
      explanation: { sentiment: 'negative', bullets: [] },
    },
    {
      status: 'stale',
      data_date: yesterday,
      generated_at: `${today}T09:00:00Z`,
      provider: 'eodhd',
    },
    {
      historicalData: {
        bars: [
          { date: isoDayOffset(-2), close: 128.67, adjClose: 128.67 },
          { date: yesterday, close: 130.35, adjClose: 130.35 },
        ],
        indicators: historicalIndicatorPayload.indicators,
      },
      historicalMeta: { status: 'stale', data_date: yesterday },
      governanceData: null,
      governanceMeta: { status: 'stale', data_date: yesterday },
    }
  );

  assert.equal(payload.data.market_prices.date, yesterday);
  assert.equal(payload.data.market_prices.close, 130.35);
  assert.equal(payload.data.market_stats.stats.rsi14, 37.4);
  assert.equal(payload.metadata.analysis.latestDataDate, yesterday);
  assert.equal(payload.metadata.analysis.integrity.status, 'ok');
});

test('deriveIntegrity flags missing metrics as partial', () => {
  const integrity = deriveIntegrity(
    { date: yesterday, close: 130.35 },
    { as_of: yesterday, stats: { rsi14: 37.4 } },
    { status: 'fresh', data_date: yesterday },
    { historical: 'fresh', historicalAsOf: yesterday }
  );
  assert.equal(integrity.status, 'partial');
  assert.ok(integrity.issues.includes('missing_core_metrics'));
});
