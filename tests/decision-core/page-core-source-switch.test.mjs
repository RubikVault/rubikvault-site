import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('page-core switches source at readDecisionRows', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/ops/build-page-core-bundle.mjs`, 'utf8');
  assert.match(src, /function readDecisionCoreRows/);
  assert.match(src, /RV_DECISION_CORE_SOURCE/);
  assert.match(src, /decision_core_min/);
});
