#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

async function readJson(path) {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

(async function main() {
  const baseDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : join(process.cwd(), 'tmp/phase1-artifacts/market-stats');

  const snapshot = await readJson(join(baseDir, 'snapshot.json'));
  const state = await readJson(join(baseDir, 'module-state.json'));
  const health = await readJson(join(baseDir, 'market-stats-health.json'));

  assert(snapshot?.schema_version === '3.0', 'snapshot.schema_version must be 3.0');
  assert(snapshot?.metadata?.module === 'market-stats', 'snapshot.metadata.module must be market-stats');
  assert(snapshot?.metadata?.digest, 'snapshot.metadata.digest missing');
  assert(typeof snapshot.data === 'object', 'snapshot.data must exist');

  assert(state?.schema_version === '3.0', 'state.schema_version must be 3.0');
  assert(state?.module === 'market-stats', 'state.module must be market-stats');
  assert(state?.digest === snapshot.metadata.digest, 'state.digest must match snapshot digest');
  assert(state?.record_count === snapshot.metadata.record_count, 'state.record_count must match');

  assert(health?.module === 'market-stats', 'health.module must be market-stats');
  assert(['OK', 'DEGRADED', 'FAILED'].includes(health?.run_quality), 'health.run_quality invalid');
  assert(typeof health.coverage_ratio === 'number', 'health.coverage_ratio must be number');
  assert(health.coverage_ratio >= 0 && health.coverage_ratio <= 1, 'health.coverage_ratio must be between 0 and 1');

  process.stdout.write('OK: market-stats artifact validator\n');
})().catch((err) => {
  process.stderr.write(`FAIL: market-stats artifact validator\n${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
