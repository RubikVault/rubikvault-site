import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidateAudit } from '../../scripts/decision-core/noncandidate-audit.mjs';

test('noncandidate audit sample is generated stratified', () => {
  const rejected = Array.from({ length: 200 }, (_, i) => ({ row: { canonical_id: `US:T${i}`, type_norm: 'STOCK', exchange: 'US' }, reason: 'LOW_COARSE_SCORE', eligibility: { eligibility_status: 'ELIGIBLE' }, features: {} }));
  const sample = buildCandidateAudit({ rejected, policy: { candidate_selection_policy: { audit_sample_rate: 0.01 } }, targetMarketDate: '2026-05-07' });
  assert.ok(sample.length >= 1);
});
