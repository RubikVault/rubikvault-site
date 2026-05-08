import test from 'node:test';
import assert from 'node:assert/strict';
import { buyInvariantFailures } from '../../scripts/decision-core/build-buy-breadth-proof.mjs';

const reasonMap = new Map([['DECISION_CORE_READY', { code: 'DECISION_CORE_READY' }]]);

test('BUY breadth invariant accepts fully guarded BUY', () => {
  const failures = buyInvariantFailures({
    meta: { target_market_date: '2026-05-07', as_of_date: '2026-05-07' },
    decision: { primary_action: 'BUY', analysis_reliability: 'MEDIUM', reason_codes: ['DECISION_CORE_READY'] },
    eligibility: { eligibility_status: 'ELIGIBLE', decision_grade: true, vetos: [] },
    evidence_summary: { ev_proxy_bucket: 'positive', tail_risk_bucket: 'MEDIUM' },
    trade_guard: { max_entry_price: 101, invalidation_level: 95 },
  }, reasonMap);
  assert.deepEqual(failures, []);
});

test('BUY breadth invariant rejects missing guards and LOW reliability', () => {
  const failures = buyInvariantFailures({
    meta: { target_market_date: '2026-05-07', as_of_date: '2026-05-07' },
    decision: { primary_action: 'BUY', analysis_reliability: 'LOW', reason_codes: [] },
    eligibility: { eligibility_status: 'ELIGIBLE', decision_grade: true, vetos: [] },
    evidence_summary: { ev_proxy_bucket: 'neutral', tail_risk_bucket: 'UNKNOWN' },
    trade_guard: {},
  }, reasonMap);
  assert.match(failures.join(','), /reliability_low/);
  assert.match(failures.join(','), /entry_guard_missing/);
  assert.match(failures.join(','), /invalidation_missing/);
});
