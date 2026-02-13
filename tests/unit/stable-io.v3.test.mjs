import test from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify } from '../../scripts/lib/v3/stable-io.mjs';

test('stableStringify sorts keys deterministically', () => {
  const a = { z: 1, a: { d: 1, b: 2 }, c: [ { y: 2, x: 1 } ] };
  const b = { c: [ { x: 1, y: 2 } ], a: { b: 2, d: 1 }, z: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});
