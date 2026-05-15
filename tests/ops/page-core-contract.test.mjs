import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasShardIndex as workerAliasShardIndex,
  pageShardIndex as workerPageShardIndex,
} from '../../functions/api/_shared/page-core-contract.js';
import { pageCoreStrictOperationalReasons } from '../../functions/api/_shared/page-core-operational-contract.js';
import {
  aliasShardIndex as builderAliasShardIndex,
  pageShardIndex as builderPageShardIndex,
  aliasShardName,
  pageShardName,
} from '../../scripts/lib/page-core-contract.mjs';

test('page-core hash buckets are stable between builder and worker', () => {
  for (const key of ['AAPL', 'BRK-B', 'BRK.B', 'US:BRK-B', 'US:BRK.B']) {
    assert.equal(builderAliasShardIndex(key), workerAliasShardIndex(key));
    assert.equal(builderPageShardIndex(key), workerPageShardIndex(key));
  }
  assert.equal(aliasShardName(0), '00.json.gz');
  assert.equal(pageShardName(0), '000.json.gz');
  assert.equal(pageShardName(255), '255.json.gz');
});

test('page-core typed model gaps are warnings, not strict blockers', () => {
  const reasons = pageCoreStrictOperationalReasons({
    canonical_asset_id: 'US:TEST',
    latest_bar_date: '2026-05-14',
    stats_date: '2026-05-14',
    price_source: 'historical-bars',
    key_levels_ready: true,
    market_stats_min: {
      key_levels_ready: true,
      price_date: '2026-05-14',
      latest_bar_date: '2026-05-14',
      stats_date: '2026-05-14',
      prices_source: 'historical-bars',
      stats_source: 'historical-indicators',
      issues: [],
      stats: { rsi14: 50, sma20: 10, sma50: 10, atr14: 1 },
    },
    status_contract: {
      historical_profile_status: 'ready',
      model_coverage_status: 'typed_gap',
      strict_operational: true,
      strict_blocking_reasons: [],
    },
    coverage: { ui_renderable: true },
  }, {
    latest: { target_market_date: '2026-05-14' },
    freshnessStatus: 'fresh',
  });
  assert.equal(reasons.includes('model_coverage_incomplete'), false);
});
