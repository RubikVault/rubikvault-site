import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

test('unknown blocking reason prevents visible BUY', () => {
  const ui = mapDecisionCoreToUi({ decision: { primary_action: 'BUY', analysis_reliability: 'MEDIUM', reason_codes: ['RISK_BLOCKER_UNKNOWN'] }, eligibility: { vetos: [] }, evidence_summary: {}, trade_guard: {}, horizons: {} }, { codes: [], texts: {} });
  assert.notEqual(ui.action, 'BUY');
});
