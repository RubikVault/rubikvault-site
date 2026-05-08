import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOverallAction } from '../../scripts/decision-core/resolve-horizon-state.mjs';

test('AVOID requires valid negative analysis, data failures stay UNAVAILABLE', () => {
  const common = { evidence: {}, evRisk: {}, reliability: 'MEDIUM', reasonCodes: [], reasonMap: new Map(), candidate: false };
  assert.equal(resolveOverallAction({ ...common, eligibility: { eligibility_status: 'NOT_DECISION_GRADE' }, decisionGrade: { decision_grade: false }, setup: { bias: 'BEARISH', primary_setup: 'none' } }).primary_action, 'UNAVAILABLE');
  assert.equal(resolveOverallAction({ ...common, eligibility: { eligibility_status: 'ELIGIBLE' }, decisionGrade: { decision_grade: true }, setup: { bias: 'BEARISH', primary_setup: 'none' } }).primary_action, 'AVOID');
});
