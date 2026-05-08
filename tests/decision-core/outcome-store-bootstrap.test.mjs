import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('outcome bootstrap writes snapshots and marks alpha proof false', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/decision-core/build-outcome-store-bootstrap.mjs`, 'utf8');
  assert.match(src, /decision-snapshots/);
  assert.match(src, /alpha_proof: false/);
  assert.match(src, /performance_evidence/);
});
