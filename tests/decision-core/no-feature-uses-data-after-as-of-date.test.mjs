import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('feature manifest declares no data after as_of', () => {
  const manifest = readJson('public/data/decision-core/feature-manifests/latest.json');
  assert.equal(manifest.feature_as_of_contract.no_feature_uses_data_after_as_of_date, true);
});
