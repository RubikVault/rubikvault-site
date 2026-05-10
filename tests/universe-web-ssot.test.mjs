import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareUniverseSearchCandidates,
  comparePreferredUniverseRows,
  getUniverseAssetClassOptions,
  isAllowedWebUniverseRecord,
  normalizeUniverseAssetClassFilter,
  parseUniverseAssetClassFilter,
} from '../public/js/universe-ssot.js';

test('web universe allows stock, etf, and index only', () => {
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'AAPL', type_norm: 'STOCK', canonical_id: 'US:AAPL' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'SPY', type_norm: 'ETF', canonical_id: 'US:SPY' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'GSPC', type_norm: 'INDEX', canonical_id: 'INDX:GSPC' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'US10Y', type_norm: 'BOND', canonical_id: 'GBOND:US10Y' }), false);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'XYZBOND', type_norm: 'BOND', canonical_id: 'GBOND:XYZBOND' }), false);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'ABC', type_norm: 'FUND', canonical_id: 'EUFUND:ABC' }), false);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'BTC-USD', type_norm: 'CRYPTO', canonical_id: 'CC:BTC-USD' }), false);
});

test('preferred row selection forces US credit ETF over duplicate symbol variants', () => {
  const us = { symbol: 'HYG', canonical_id: 'US:HYG', type_norm: 'ETF', exchange: 'US', bars_count: 1200, avg_volume_30d: 1000000 };
  const lse = { symbol: 'HYG', canonical_id: 'LSE:HYG', type_norm: 'STOCK', exchange: 'LSE', bars_count: 3000, avg_volume_30d: 2000000 };
  assert.equal(comparePreferredUniverseRows(us, lse) > 0, true);
});

test('preferred row selection favors home-market common stock over ETF lookalikes', () => {
  const usStock = { symbol: 'AMZN', canonical_id: 'US:AMZN', type_norm: 'STOCK', exchange: 'US', name: 'Amazon.com Inc', bars_count: 18, avg_volume_30d: 43000000 };
  const etf = { symbol: 'AMZN', canonical_id: 'AS:AMZN', type_norm: 'ETF', exchange: 'AS', name: '1X AMZN', bars_count: 1232, avg_volume_30d: 0 };
  assert.equal(comparePreferredUniverseRows(usStock, etf) > 0, true);
});

test('preferred row selection favors US primary listing over foreign duplicates', () => {
  const us = { symbol: 'AAPL', canonical_id: 'US:AAPL', type_norm: 'STOCK', exchange: 'US', name: 'Apple Inc', bars_count: 18, avg_volume_30d: 40000000 };
  const ba = { symbol: 'AAPL', canonical_id: 'BA:AAPL', type_norm: 'STOCK', exchange: 'BA', name: 'Apple Inc DRC', bars_count: 3536, avg_volume_30d: 55281 };
  assert.equal(comparePreferredUniverseRows(us, ba) > 0, true);
});

test('preferred row selection rejects known cross-list collisions', () => {
  assert.equal(comparePreferredUniverseRows(
    { symbol: 'SPY', canonical_id: 'US:SPY', type_norm: 'ETF', exchange: 'US' },
    { symbol: 'SPY', canonical_id: 'BA:SPY', type_norm: 'STOCK', exchange: 'BA' }
  ) > 0, true);
  assert.equal(comparePreferredUniverseRows(
    { symbol: 'QQQ', canonical_id: 'US:QQQ', type_norm: 'ETF', exchange: 'US' },
    { symbol: 'QQQ', canonical_id: 'NEO:QQQ', type_norm: 'STOCK', exchange: 'NEO' }
  ) > 0, true);
  assert.equal(comparePreferredUniverseRows(
    { symbol: '0050', canonical_id: 'TW:0050', type_norm: 'ETF', exchange: 'TW' },
    { symbol: '0050', canonical_id: 'KLSE:0050', type_norm: 'STOCK', exchange: 'KLSE' }
  ) > 0, true);
});

test('search ranking favors exact normalized issuer match over similarly named stocks', () => {
  const apple = { symbol: 'AAPL', canonical_id: 'US:AAPL', type_norm: 'STOCK', exchange: 'US', name: 'Apple Inc', avg_volume_30d: 40000000 };
  const appleRush = { symbol: 'APRU', canonical_id: 'US:APRU', type_norm: 'STOCK', exchange: 'US', name: 'Apple Rush Company', avg_volume_30d: 10000 };
  assert.equal(compareUniverseSearchCandidates(apple, appleRush, { query: 'apple', symbolQuery: 'APPLE' }) > 0, true);
});

test('search ranking favors exact normalized amazon issuer over amazonas prefix collisions', () => {
  const amazon = { symbol: 'AMZN', canonical_id: 'US:AMZN', type_norm: 'STOCK', exchange: 'US', name: 'Amazon.com Inc', avg_volume_30d: 43000000 };
  const amazonas = { symbol: 'AZFL', canonical_id: 'US:AZFL', type_norm: 'STOCK', exchange: 'US', name: 'Amazonas Florestal Ltd', avg_volume_30d: 1000 };
  assert.equal(compareUniverseSearchCandidates(amazon, amazonas, { query: 'amazon', symbolQuery: 'AMAZON' }) > 0, true);
});

test('search ranking favors US primary listing on exact issuer query', () => {
  const us = { symbol: 'TSLA', canonical_id: 'US:TSLA', type_norm: 'STOCK', exchange: 'US', name: 'Tesla Inc', avg_volume_30d: 61000000 };
  const lse = { symbol: 'TSLA', canonical_id: 'LSE:TSLA', type_norm: 'ETF', exchange: 'LSE', name: 'LS 1x Tesla Tracker ETP Securities GBP', avg_volume_30d: 12000 };
  assert.equal(compareUniverseSearchCandidates(us, lse, { query: 'tesla', symbolQuery: 'TESLA' }) > 0, true);
});

test('search ranking favors US Visa primary listing over foreign Visa symbol-prefix listings', () => {
  const usVisa = { symbol: 'V', canonical_id: 'US:V', type_norm: 'STOCK', exchange: 'US', name: 'Visa Inc', score_0_100: 55, bars_count: 19, avg_volume_30d: 8300000 };
  const brazilVisa = { symbol: 'VISA34', canonical_id: 'SA:VISA34', type_norm: 'STOCK', exchange: 'SA', name: 'Visa Inc', score_0_100: 94, bars_count: 1200, avg_volume_30d: 12000 };
  const canadaVisa = { symbol: 'VISA', canonical_id: 'TO:VISA', type_norm: 'STOCK', exchange: 'TO', name: 'Visa CDR', score_0_100: 89, bars_count: 900, avg_volume_30d: 25000 };
  assert.equal(compareUniverseSearchCandidates(usVisa, brazilVisa, { query: 'visa', symbolQuery: 'VISA' }) > 0, true);
  assert.equal(compareUniverseSearchCandidates(usVisa, canadaVisa, { query: 'visa', symbolQuery: 'VISA' }) > 0, true);
});

test('asset class filter exposes only supported web classes', () => {
  assert.equal(normalizeUniverseAssetClassFilter('fund'), 'all');
  assert.equal(normalizeUniverseAssetClassFilter('crypto'), 'all');
  assert.equal(normalizeUniverseAssetClassFilter('bond'), 'all');
  assert.equal(normalizeUniverseAssetClassFilter('index'), 'index');
  assert.equal(parseUniverseAssetClassFilter('fund').removed, true);
  assert.equal(parseUniverseAssetClassFilter('crypto').removed, true);
  assert.equal(parseUniverseAssetClassFilter('bond').removed, true);
  assert.deepEqual(
    getUniverseAssetClassOptions().map((item) => item.value),
    ['all', 'stock', 'etf', 'index']
  );
});
