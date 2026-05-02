import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRow, bucketReason, eligible } from '../../scripts/ops/audit-stock-analyzer-ui-integrity.mjs';

function baseRow() {
  return {
    schema_version: 'rv.page_core.v1',
    canonical_asset_id: 'US:HOOD',
    display_ticker: 'HOOD',
    ui_banner_state: 'all_systems_operational',
    identity: { asset_class: 'STOCK' },
    freshness: { status: 'fresh', as_of: '2026-04-30' },
    summary_min: {
      last_close: 72.89,
      daily_change_abs: 1.69,
      daily_change_pct: 0.02373596,
      decision_verdict: 'WAIT',
      quality_status: 'OK',
      risk_level: 'HIGH',
      governance_status: 'available',
    },
    market_stats_min: {
      key_levels_ready: true,
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      price_date: '2026-04-30',
      latest_bar_date: '2026-04-30',
      as_of: '2026-04-30',
      issues: [],
      stats: { rsi14: 42, sma20: 79, sma50: 76, atr14: 4.86, low_52w: 45.6 },
    },
    key_levels_ready: true,
    coverage: {
      bars: 1193,
      ui_renderable: true,
      fundamentals: true,
      forecast: true,
      catalysts_status: 'not_generated',
    },
    breakout_summary: { status: 'not_in_signal_set' },
    governance_summary: { blocking_reasons: [], warnings: [] },
  };
}

test('stock analyzer UI audit classifies eligible universe rows', () => {
  assert.equal(eligible(baseRow()), true);
  assert.equal(eligible({ ...baseRow(), identity: { asset_class: 'CRYPTO' } }), false);
});

test('stock analyzer UI audit treats normalizable percent-unit returns as pass', () => {
  const row = baseRow();
  row.summary_min.daily_change_pct = 2.373596;
  const result = auditRow(row, { target_market_date: '2026-04-30' });
  assert.equal(result.raw_false_green, false);
  assert.equal(result.normalized_false_green, false);
  assert.equal(result.false_green_ui_render, false);
  assert.equal(result.pass, true);
  assert.equal(result.bucket, 'other resolver BLOCK');
});

test('stock analyzer UI audit treats decision-only module gaps as non-UI blockers', () => {
  const row = baseRow();
  delete row.breakout_summary;
  row.coverage.fundamentals = false;
  row.coverage.forecast = false;
  const result = auditRow(row, { target_market_date: '2026-04-30' });
  assert.equal(result.false_green_ui_render, false);
  assert.equal(result.pass, true);
  assert.deepEqual(result.ui_completeness_reasons, []);
});

test('stock analyzer UI audit buckets known failure reasons', () => {
  assert.equal(bucketReason('bars_stale'), 'stale source');
  assert.equal(bucketReason('chart contract failed'), 'chart contract issue');
  assert.equal(bucketReason('correlation_not_computed'), 'correlation not computed');
});
