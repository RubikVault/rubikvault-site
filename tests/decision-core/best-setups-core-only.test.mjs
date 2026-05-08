import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('Best-Setups has Decision-Core-only source mode', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/build-best-setups-v4.mjs`, 'utf8');
  assert.match(src, /BEST_SETUPS_DECISION_SOURCE/);
  assert.match(src, /readDecisionCoreBuyRows/);
  assert.match(src, /BEST_SETUPS_DECISION_CORE_REQUIRED_BUT_UNAVAILABLE/);
});
