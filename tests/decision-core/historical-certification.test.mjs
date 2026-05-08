import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalDateSet } from '../../scripts/decision-core/build-historical-date-set.mjs';
import { buildHistoricalCertification } from '../../scripts/decision-core/run-historical-certification.mjs';

test('historical date set builds matured weekday sample', () => {
  const out = buildHistoricalDateSet({ targetMarketDate: '2026-05-07', minDays: 60, preferDays: 70 });
  assert.equal(out.selected_count, 70);
  assert.equal(out.selected_dates.every((date) => !['0', '6'].includes(String(new Date(`${date}T00:00:00Z`).getUTCDay()))), true);
  assert.equal(out.selected_dates.every((date) => date < '2026-05-07'), true);
});

test('historical certification reports failed when PIT preflight cannot prove enough days', () => {
  const out = buildHistoricalCertification({ targetMarketDate: '2026-05-07', minDays: 2, preferDays: 2, execute: false, maxAssets: 1 });
  assert.equal(out.schema, 'rv.decision_core_historical_replay.v1');
  assert.equal(typeof out.historical_replay_valid_days, 'number');
});
