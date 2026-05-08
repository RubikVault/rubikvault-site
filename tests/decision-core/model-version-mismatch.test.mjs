import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('policy and feature manifest expose version IDs required for mismatch checks', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  const feature = readJson('public/data/decision-core/feature-manifests/latest.json');
  assert.equal(typeof policy.model_version, 'string');
  assert.equal(typeof policy.policy_bundle_version, 'string');
  assert.equal(typeof feature.feature_manifest_id, 'string');
});
