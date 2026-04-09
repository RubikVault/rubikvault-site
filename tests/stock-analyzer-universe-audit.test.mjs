import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ISSUE_FAMILY_CATALOG,
  buildOrderedRecovery,
  summarizeAuditFindings,
} from '../scripts/ops/build-stock-analyzer-universe-audit.mjs';

describe('stock analyzer universe audit helpers', () => {
  it('summarizes failure families and field checks', () => {
    const summary = summarizeAuditFindings({
      totalAssets: 4,
      processedAssets: 4,
      records: [
        { ticker: 'AAA', assetClass: 'STOCK', familyId: 'price_stack_mismatch', detail: 'price_bar_scale_mismatch' },
        { ticker: 'BBB', assetClass: 'ETF', familyId: 'historical_profile_unavailable', detail: 'not_generated' },
        { ticker: 'AAA', assetClass: 'STOCK', familyId: 'price_stack_mismatch', detail: 'price_outside_52w_envelope' },
      ],
    });

    assert.equal(summary.summary.severity, 'critical');
    assert.equal(summary.summary.total_assets, 4);
    assert.equal(summary.summary.processed_assets, 4);
    assert.equal(summary.summary.field_checks_total, 96);
    assert.equal(summary.summary.failure_family_count, 2);
    assert.equal(summary.failureFamilies[0].family_id, 'price_stack_mismatch');
    assert.equal(summary.failureFamilies[0].affected_assets, 2);
  });

  it('builds ordered recovery from failure families', () => {
    const ordered = buildOrderedRecovery({
      price_stack_mismatch: {
        affected_assets: 12,
      },
      historical_profile_unavailable: {
        affected_assets: 8,
      },
      fundamentals_unavailable: {
        affected_assets: 5,
      },
    });

    assert.equal(ordered[0].step_id, 'market_data_refresh');
    assert.ok(ordered.some((entry) => entry.step_id === 'hist_probs'));
    assert.ok(ordered.some((entry) => entry.step_id === 'fundamentals_refresh'));
  });

  it('defines recovery mappings for every issue family', () => {
    for (const [familyId, family] of Object.entries(ISSUE_FAMILY_CATALOG)) {
      assert.ok(family.label, `${familyId} missing label`);
      assert.ok(Array.isArray(family.recovery_ids) && family.recovery_ids.length > 0, `${familyId} missing recovery ids`);
    }
  });
});
