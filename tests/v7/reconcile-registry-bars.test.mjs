import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeEligibilityPatch,
  mergeBars,
} from '../../scripts/universe-v7/reconcile-registry-bars-from-adjusted-series.mjs';

const cfg = {
  staleness: {
    weekend_adjust_factor: 5,
    weekend_adjust_divisor: 7,
  },
  volume: {
    min_avg_volume_10d_equity: 10000,
  },
  eligibility: {
    freshness_max_days: 180,
    weights: {
      history_depth: 0.4,
      ohlcv_completeness: 0.25,
      volume_quality: 0.2,
      freshness: 0.15,
    },
    layer_thresholds: {
      L1_FULL: 85,
      L2_PARTIAL: 65,
      L3_MINIMAL: 40,
    },
  },
};

function bars(count, startDate = '2016-01-01') {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    out.push({ date, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, adjusted_close: 100 + i, volume: 1000000 + i });
  }
  return out;
}

test('mergeBars deduplicates by date and lets later sources override earlier adjusted rows', () => {
  const merged = mergeBars(
    [{ trading_date: '2026-01-01', close: 1, adjusted_close: 1, volume: 10 }],
    [{ date: '2026-01-01', close: 2, adjusted_close: 2, volume: 20 }, { date: '2026-01-02', close: 3, adjusted_close: 3, volume: 30 }],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].date, '2026-01-01');
  assert.equal(merged[0].close, 2);
  assert.equal(merged[1].date, '2026-01-02');
});

test('computeEligibilityPatch refreshes deep-history bars and preserves legacy core layer by default', () => {
  const row = { type_norm: 'STOCK', computed: { layer: 'L0_LEGACY_CORE', score_0_100: 55 } };
  const patch = computeEligibilityPatch(row, bars(2600, '2016-01-01'), cfg, { today: '2026-04-17' });
  assert.equal(patch.bars_count, 2600);
  assert.equal(patch.computed.layer, 'L0_LEGACY_CORE');
  assert.equal(patch.computed.score_0_100 >= 85, true);
  assert.equal(patch._tmp_recent_closes.length, 10);
});

test('computeEligibilityPatch can unlock non-core full layer for sufficiently deep fresh history', () => {
  const row = { type_norm: 'STOCK', computed: { layer: 'L4_DEAD', score_0_100: 0 } };
  const patch = computeEligibilityPatch(row, bars(2600, '2019-03-05'), cfg, { preserveLegacyCore: false, today: '2026-04-17' });
  assert.equal(patch.bars_count, 2600);
  assert.equal(patch.computed.layer, 'L1_FULL');
});
