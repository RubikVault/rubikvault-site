import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEligibility } from '../../scripts/decision-core/eligibility.mjs';
import { readJson, baseRow } from './shared-fixtures.mjs';

const policy = readJson('public/data/decision-core/policies/latest.json');

test('eligibility lifecycle blocks BUY path for incubating and limited history', () => {
  assert.equal(resolveEligibility(baseRow({ bars_count: 40 }), { targetMarketDate: '2026-05-07', policy }).eligibility_status, 'INCUBATING');
  assert.equal(resolveEligibility(baseRow({ bars_count: 180 }), { targetMarketDate: '2026-05-07', policy }).eligibility_status, 'LIMITED_HISTORY');
  assert.equal(resolveEligibility(baseRow({ bars_count: 300 }), { targetMarketDate: '2026-05-07', policy }).eligibility_status, 'ELIGIBLE');
});
