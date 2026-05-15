import test from 'node:test';
import assert from 'node:assert/strict';
import { pageCoreStrictOperationalReasons } from '../functions/api/_shared/page-core-operational-contract.js';

function baseRow(overrides = {}) {
  // Minimal row that would otherwise be operational. The two STOCKs that escaped
  // QM coverage on 2026-05-14 (US:SGRCF, US:STPJF) both look like this aside from
  // the last_close==0 trap.
  return {
    canonical_asset_id: 'US:TEST',
    coverage: { ui_renderable: true },
    ui_banner_state: 'all_systems_operational',
    primary_blocker: '',
    meta: { asset_type: 'STOCK' },
    market_stats_min: {
      last_close: 100,
      latest_bar_date: '2026-05-14',
      price_date: '2026-05-14',
      as_of: '2026-05-14',
      price_source: 'eodhd',
      stats_source: 'eodhd',
      key_levels_ready: true,
      stats: { rsi14: 50, atr14: 1, sma20: 100, sma50: 100, sma200: 100 },
    },
    key_levels_ready: true,
    freshness: { status: 'fresh' },
    status_contract: {
      historical_profile_status: 'ready',
      model_coverage_status: 'complete',
      strict_operational: true,
      stock_detail_view_status: 'operational',
    },
    ...overrides,
  };
}

test('STOCK with last_close=0 emits null_price strict reason', () => {
  const row = baseRow({ market_stats_min: { ...baseRow().market_stats_min, last_close: 0 } });
  const reasons = pageCoreStrictOperationalReasons(row);
  assert.ok(reasons.includes('null_price'), `expected null_price in ${JSON.stringify(reasons)}`);
});

test('STOCK with last_close=null emits null_price strict reason', () => {
  const row = baseRow({ market_stats_min: { ...baseRow().market_stats_min, last_close: null } });
  const reasons = pageCoreStrictOperationalReasons(row);
  assert.ok(reasons.includes('null_price'), `expected null_price in ${JSON.stringify(reasons)}`);
});

test('STOCK with last_close=0 but verified provider exception does NOT emit null_price', () => {
  const row = baseRow({
    market_stats_min: { ...baseRow().market_stats_min, last_close: 0 },
    status_contract: {
      ...baseRow().status_contract,
      provider_exception_status: 'verified',
    },
  });
  const reasons = pageCoreStrictOperationalReasons(row);
  assert.ok(!reasons.includes('null_price'), `unexpected null_price in ${JSON.stringify(reasons)}`);
});

test('INDEX with last_close=0 does NOT emit null_price (legit baseline)', () => {
  const row = baseRow({
    meta: { asset_type: 'INDEX' },
    market_stats_min: { ...baseRow().market_stats_min, last_close: 0 },
  });
  const reasons = pageCoreStrictOperationalReasons(row);
  assert.ok(!reasons.includes('null_price'), `unexpected null_price for INDEX in ${JSON.stringify(reasons)}`);
});

test('ETF with healthy last_close does NOT emit null_price', () => {
  const row = baseRow({ meta: { asset_type: 'ETF' } });
  const reasons = pageCoreStrictOperationalReasons(row);
  assert.ok(!reasons.includes('null_price'), `unexpected null_price for healthy ETF in ${JSON.stringify(reasons)}`);
});

test('STOCK with healthy last_close does NOT emit null_price', () => {
  const reasons = pageCoreStrictOperationalReasons(baseRow());
  assert.ok(!reasons.includes('null_price'), `unexpected null_price in ${JSON.stringify(reasons)}`);
});
