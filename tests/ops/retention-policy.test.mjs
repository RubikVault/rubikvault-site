import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('retention policy defaults match the hardened plan', () => {
  const policy = readJson('policies/retention.v3.json');
  assert.equal(policy.forecast_forecasts_retention_days, 90);
  assert.equal(policy.forecast_outcomes_retention_days, 180);
  assert.equal(policy.mirrors_retention_days, 180);
  assert.equal(policy.pending_maturity_retention_days, 30);
  assert.equal(policy.hist_probs_checkpoint_retention_days, 30);
  assert.equal(policy.dlq_retention_days, 7);
});

test('retention verification report is present and green', () => {
  const report = readJson('public/data/reports/retention-verification-latest.json');
  assert.equal(report.schema, 'rv_retention_verification_v1');
  assert.equal(report.ok, true);
});
