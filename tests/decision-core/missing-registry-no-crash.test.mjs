import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

test('missing reason registry does not crash UI mapping', () => {
  assert.equal(mapDecisionCoreToUi({ decision: { primary_action: 'UNAVAILABLE', analysis_reliability: 'LOW', reason_codes: ['STALE_PRICE'] }, eligibility: { vetos: ['STALE_PRICE'] }, evidence_summary: {}, trade_guard: {}, horizons: {} }, null).action, 'UNAVAILABLE');
});
