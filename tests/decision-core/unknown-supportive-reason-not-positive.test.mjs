import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

test('unknown supportive reason is not used as positive evidence', () => {
  const ui = mapDecisionCoreToUi({ decision: { primary_action: 'WAIT', analysis_reliability: 'LOW', reason_codes: ['SOME_NEW_SUPPORT'] }, eligibility: { vetos: [] }, evidence_summary: {}, trade_guard: {}, horizons: {} }, { codes: [], texts: {} });
  assert.equal(ui.action, 'WAIT');
  assert.equal(ui.bullets.includes('SOME_NEW_SUPPORT'), true);
});
