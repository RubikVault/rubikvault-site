import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOverallAction } from '../../scripts/decision-core/resolve-horizon-state.mjs';

test('eligibility maps to conservative primary actions', () => {
  const base = { decisionGrade: { decision_grade: false }, setup: { primary_setup: 'none' }, evidence: {}, evRisk: {}, reliability: 'LOW', reasonCodes: [], reasonMap: new Map(), candidate: false };
  assert.equal(resolveOverallAction({ ...base, eligibility: { eligibility_status: 'INCUBATING' } }).primary_action, 'INCUBATING');
  assert.equal(resolveOverallAction({ ...base, eligibility: { eligibility_status: 'NOT_DECISION_GRADE' } }).primary_action, 'UNAVAILABLE');
  assert.equal(resolveOverallAction({ ...base, eligibility: { eligibility_status: 'LIMITED_HISTORY' } }).wait_subtype, 'WAIT_LOW_EVIDENCE');
});
