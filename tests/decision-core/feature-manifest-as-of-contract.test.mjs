import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('feature manifest declares as_of <= target contract', () => {
  const manifest = readJson('public/data/decision-core/feature-manifests/latest.json');
  assert.equal(manifest.feature_as_of_contract.feature_as_of_lte_target_market_date, true);
});
