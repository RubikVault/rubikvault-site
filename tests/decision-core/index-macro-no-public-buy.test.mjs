import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEligibility } from '../../scripts/decision-core/eligibility.mjs';
import { readJson, baseRow } from './shared-fixtures.mjs';

test('macro/index context-only asset cannot be public BUY', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  const eligibility = resolveEligibility(baseRow({ type_norm: 'INDEX', canonical_id: 'US:SPX', symbol: 'SPX' }), { targetMarketDate: '2026-05-07', policy });
  assert.equal(eligibility.eligibility_status, 'EXCLUDED');
  assert.equal(eligibility.lifecycle_reason_codes.includes('INDEX_CONTEXT_ONLY'), true);
});
