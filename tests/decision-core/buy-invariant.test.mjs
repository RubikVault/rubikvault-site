import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('builder contains compact BUY invariant enforcement', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/decision-core/build-minimal-decision-bundles.mjs`, 'utf8');
  assert.match(src, /function buyInvariantErrors/);
  assert.match(src, /BUY_INVARIANT_ENTRY_GUARD/);
  assert.match(src, /BUY_INVARIANT_INVALIDATION/);
});
