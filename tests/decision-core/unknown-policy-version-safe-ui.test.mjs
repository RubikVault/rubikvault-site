import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDecisionCoreToUi } from '../../public/js/decision-core-ui-map.js';

test('unknown policy version keeps UI safe', () => {
  const ui = mapDecisionCoreToUi({ meta: { policy_bundle_version: 'future' }, decision: { primary_action: 'WAIT', analysis_reliability: 'LOW', reason_codes: [] }, eligibility: { vetos: [] }, evidence_summary: {}, trade_guard: {}, horizons: {} });
  assert.equal(ui.action, 'WAIT');
  assert.equal(ui.analysisReliability, 'LOW');
});
