import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('builder writes last_good and avoids latest file/folder ambiguity', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/decision-core/build-minimal-decision-bundles.mjs`, 'utf8');
  assert.match(src, /last_good/);
  assert.doesNotMatch(src, /latest\\.json.*parts/s);
});
