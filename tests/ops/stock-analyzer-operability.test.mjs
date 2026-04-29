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
  assert.equal(doc.records.find((row) => row.canonical_id === 'US:BAD').targetable, false);
  assert.equal(doc.records.find((row) => row.canonical_id === 'US:PACKONLY').targetable, false);
});
