import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCriticalDiff } from '../../scripts/decision-core/shadow-diff-logger.mjs';

test('critical diff only blocks action/safety differences', () => {
  assert.equal(classifyCriticalDiff({ legacyAction: 'BUY', coreAction: 'WAIT' }), 'critical');
  assert.equal(classifyCriticalDiff({ legacyAction: 'WAIT', coreAction: 'BUY' }), 'critical');
  assert.equal(classifyCriticalDiff({ legacyAction: null, coreAction: 'BUY' }), 'critical');
  assert.equal(classifyCriticalDiff({ legacyAction: null, coreAction: 'AVOID' }), 'non_critical');
  assert.equal(classifyCriticalDiff({ legacyAction: 'WAIT', coreAction: 'AVOID' }), 'non_critical');
  assert.equal(classifyCriticalDiff({ legacyAction: 'WAIT', coreAction: 'WAIT', mappedAction: 'WAIT' }), 'non_critical');
});
