import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

test('unknown blocking reason maps safe and does not crash', () => {
  const ui = mapDecisionCoreToUi({ decision: { primary_action: 'BUY', analysis_reliability: 'MEDIUM', reason_codes: ['UNKNOWN_BLOCKING_RISK'] }, eligibility: { vetos: [] }, trade_guard: {}, horizons: {}, evidence_summary: {} }, { codes: [], texts: {} });
  assert.equal(ui.action, 'WAIT');
  assert.equal(ui.warnings.length > 0, true);
});
