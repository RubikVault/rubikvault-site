import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('survivorship/evidence method risk is declared', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  assert.equal(policy.survivorship_evidence_policy.p0_evidence_is_bootstrap_proxy, true);
});
