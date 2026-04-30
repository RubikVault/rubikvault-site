import test from 'node:test';
import assert from 'node:assert/strict';

import { rebuildOperabilityDocument } from '../../scripts/ops/build-stock-analyzer-operability.mjs';

test('stock analyzer operability uses registry bars as targetable denominator', () => {
  const doc = rebuildOperabilityDocument({
    records: [
      { canonical_id: 'US:ZERO', registry_bars_count: 0, current_ui_title: 'Analysis incomplete', primary_reason_family: 'non_tradable_or_delisted_exception' },
      { canonical_id: 'US:WARM', registry_bars_count: 199, current_ui_title: 'Analysis incomplete', primary_reason_family: 'verified_insufficient_history_exception' },
      { canonical_id: 'US:OK', registry_bars_count: 200, current_ui_title: 'All systems operational' },
      { canonical_id: 'US:BAD', registry_bars_count: 500, current_ui_title: 'Modules have mixed as-of dates', primary_reason_family: 'verified_sparse_trading_exception' },
      { canonical_id: 'US:PACKONLY', registry_bars_count: 0, actual_adjusted_bars_count: 500, current_ui_title: 'Analysis incomplete', primary_reason_family: 'non_tradable_or_delisted_exception' },
    ],
  });

  assert.equal(doc.summary.coverage_denominator, 'targetable_assets_min_registry_bars');
  assert.equal(doc.summary.targetable_assets, 1);
  assert.equal(doc.summary.targetable_operational_assets, 1);
  assert.equal(doc.summary.registry_zero_or_unknown_bar_assets, 2);
  assert.equal(doc.summary.warming_up_assets, 1);
  assert.equal(doc.records.find((row) => row.canonical_id === 'US:PACKONLY').targetable, false);
});

test('stock analyzer operability does not keep stale/shrunk registry rows green', () => {
  const registryIndex = new Map([
    ['US:F', { bars_count: 18, last_trade_date: '2026-04-09' }],
  ]);
  const doc = rebuildOperabilityDocument({
    target_market_date: '2026-04-29',
    records: [
      {
        canonical_id: 'US:F',
        registry_bars_count: 500,
        actual_last_trade_date: '2026-04-09',
        current_ui_title: 'All systems operational',
        operational: true,
      },
    ],
  }, {
    targetMarketDate: '2026-04-29',
    registryIndex,
  });

  assert.equal(doc.records[0].registry_bars_count, 18);
  assert.equal(doc.records[0].targetable, false);
  assert.equal(doc.records[0].operational, false);
  assert.equal(doc.records[0].current_ui_title, 'Analysis incomplete');
  assert.equal(doc.summary.targetable_operational_assets, 0);
});

test('stock analyzer operability ignores old green title when target date is stale', () => {
  const doc = rebuildOperabilityDocument({
    records: [
      {
        canonical_id: 'US:C',
        registry_bars_count: 500,
        actual_last_trade_date: '2026-04-09',
        current_ui_title: 'All systems operational',
        operational: true,
      },
    ],
  }, {
    targetMarketDate: '2026-04-29',
  });

  assert.equal(doc.records[0].targetable, true);
  assert.equal(doc.records[0].operational, false);
  assert.equal(doc.summary.targetable_operational_assets, 0);
});

test('stock analyzer operability blocks page-core green without market_stats_min', () => {
  const pageCoreIndex = {
    latest: { snapshot_id: 'page-test', target_market_date: '2026-04-29' },
    rows: new Map([
      ['US:BAD', {
        canonical_asset_id: 'US:BAD',
        display_ticker: 'BAD',
        identity: { asset_class: 'STOCK', symbol: 'BAD' },
        coverage: { bars: 250, ui_renderable: true },
        ui_banner_state: 'all_systems_operational',
        key_levels_ready: true,
        summary_min: {
          decision_verdict: 'WAIT',
          quality_status: 'OK',
          risk_level: 'LOW',
        },
        governance_summary: {
          status: 'ok',
          risk_level: 'LOW',
          blocking_reasons: [],
        },
      }],
    ]),
  };
  const doc = rebuildOperabilityDocument({
    records: [
      {
        canonical_id: 'US:BAD',
        registry_bars_count: 250,
        actual_last_trade_date: '2026-04-29',
        current_ui_title: 'All systems operational',
        operational: true,
      },
    ],
  }, {
    targetMarketDate: '2026-04-29',
    pageCoreIndex,
  });

  assert.equal(doc.records[0].targetable, true);
  assert.equal(doc.records[0].operational, false);
  assert.equal(doc.records[0].current_ui_title, 'Analysis incomplete');
  assert.equal(doc.records[0].page_core_truth.blockers.includes('missing_market_stats_basis'), true);
  assert.equal(doc.summary.targetable_operational_assets, 0);
});
