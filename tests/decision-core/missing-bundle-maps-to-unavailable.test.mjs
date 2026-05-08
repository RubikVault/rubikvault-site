import test from 'node:test';
import assert from 'node:assert/strict';
import { missingBundleUi } from '../../public/js/decision-core-ui-map.js';

test('missing bundle maps to UNAVAILABLE', () => {
  assert.equal(missingBundleUi().action, 'UNAVAILABLE');
});
