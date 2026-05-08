import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalysisReliability } from '../../scripts/decision-core/analysis-reliability.mjs';
import { readJson } from './shared-fixtures.mjs';

const policy = readJson('public/data/decision-core/policies/latest.json');

function row(overrides = {}) {
  return {
    eligibility: { decision_grade: true, eligibility_status: 'ELIGIBLE', vetos: [] },
    decision: { primary_action: 'WAIT', reason_codes: ['WAIT_TRIGGER_PENDING'] },
    evidence_summary: { evidence_effective_n: 30, evidence_scope: 'asset_type', ev_proxy_bucket: 'neutral', tail_risk_bucket: 'MEDIUM' },
    method_status: { data_method_risk: 'LOW', evidence_method_risk: 'MEDIUM' },
    trade_guard: { max_entry_price: null, invalidation_level: null },
    ...overrides,
  };
}

test('analysis reliability LOW override and MEDIUM cap', () => {
  assert.equal(resolveAnalysisReliability(row({ evidence_summary: { evidence_effective_n: 0, evidence_scope: 'none', ev_proxy_bucket: 'unavailable', tail_risk_bucket: 'UNKNOWN' } }), policy).analysis_reliability, 'LOW');
  assert.equal(resolveAnalysisReliability(row(), policy).analysis_reliability, 'MEDIUM');
});
