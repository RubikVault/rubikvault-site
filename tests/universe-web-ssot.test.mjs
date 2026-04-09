import test from 'node:test';
import assert from 'node:assert/strict';

import {
  comparePreferredUniverseRows,
  getUniverseAssetClassOptions,
  isAllowedWebUniverseRecord,
  normalizeUniverseAssetClassFilter,
  parseUniverseAssetClassFilter,
} from '../public/js/universe-ssot.js';

test('web universe allows stock, etf, and whitelisted bond context only', () => {
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'AAPL', type_norm: 'STOCK', canonical_id: 'US:AAPL' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'SPY', type_norm: 'ETF', canonical_id: 'US:SPY' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'US10Y', type_norm: 'BOND', canonical_id: 'GBOND:US10Y' }), true);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'XYZBOND', type_norm: 'BOND', canonical_id: 'GBOND:XYZBOND' }), false);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'ABC', type_norm: 'FUND', canonical_id: 'EUFUND:ABC' }), false);
  assert.equal(isAllowedWebUniverseRecord({ symbol: 'BTC-USD', type_norm: 'CRYPTO', canonical_id: 'CC:BTC-USD' }), false);
});

test('preferred row selection forces US credit ETF over duplicate symbol variants', () => {
  const us = { symbol: 'HYG', canonical_id: 'US:HYG', type_norm: 'ETF', exchange: 'US', bars_count: 1200, avg_volume_30d: 1000000 };
  const lse = { symbol: 'HYG', canonical_id: 'LSE:HYG', type_norm: 'STOCK', exchange: 'LSE', bars_count: 3000, avg_volume_30d: 2000000 };
  assert.equal(comparePreferredUniverseRows(us, lse) > 0, true);
});

test('asset class filter exposes only supported web classes', () => {
  assert.equal(normalizeUniverseAssetClassFilter('fund'), 'all');
  assert.equal(normalizeUniverseAssetClassFilter('crypto'), 'all');
  assert.equal(normalizeUniverseAssetClassFilter('bond'), 'bond');
  assert.equal(parseUniverseAssetClassFilter('fund').removed, true);
  assert.equal(parseUniverseAssetClassFilter('crypto').removed, true);
  assert.equal(parseUniverseAssetClassFilter('bond').removed, false);
  assert.deepEqual(
    getUniverseAssetClassOptions().map((item) => item.value),
    ['all', 'stock', 'etf', 'bond']
  );
});
