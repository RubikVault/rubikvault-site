import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('adjusted data policy is declared', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  assert.equal(policy.adjusted_data_policy.suspect_adjusted_data_blocks_buy, true);
});
