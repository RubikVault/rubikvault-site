#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const POLICY_PATH = path.join(ROOT, 'policies/retention.v3.json');
const CLEANUP_PATH = path.join(ROOT, 'public/data/v3/system/retention-cleanup.latest.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/retention-verification-latest.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const policy = readJson(POLICY_PATH) || {};
const cleanup = readJson(CLEANUP_PATH) || {};

const expected = {
  forecast_outcomes_retention_days: 180,
  forecast_forecasts_retention_days: 90,
  mirrors_retention_days: 180,
  pending_maturity_retention_days: 30,
  hist_probs_checkpoint_retention_days: 30,
  dlq_retention_days: 7,
};

const checks = Object.fromEntries(
  Object.entries(expected).map(([key, value]) => {
    const actual = Number(policy[key] ?? cleanup?.policy?.[key] ?? NaN);
    return [key, {
      expected: value,
      actual: Number.isFinite(actual) ? actual : null,
      ok: Number.isFinite(actual) && actual === value,
    }];
  })
);

const requiredCleanupKeys = [
  'forecast_outcomes',
  'forecast_forecasts',
  'mirrors',
  'hist_probs_snapshots',
  'hist_probs_checkpoints',
  'hist_probs_error_ledger',
  'pending_maturity_store',
];

const cleanupChecks = Object.fromEntries(
  requiredCleanupKeys.map((key) => [key, {
    ok: cleanup?.removed?.[key] !== undefined,
    value: cleanup?.removed?.[key] ?? null,
  }])
);

const ok = Object.values(checks).every((entry) => entry.ok)
  && Object.values(cleanupChecks).every((entry) => entry.ok);

writeJson(OUTPUT_PATH, {
  schema: 'rv_retention_verification_v1',
  generated_at: new Date().toISOString(),
  ok,
  checks,
  cleanup_checks: cleanupChecks,
  refs: {
    policy: 'policies/retention.v3.json',
    latest_cleanup: 'public/data/v3/system/retention-cleanup.latest.json',
  },
});

if (!ok) {
  process.exitCode = 1;
}
