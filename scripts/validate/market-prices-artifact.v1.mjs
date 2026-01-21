#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function isSha256Digest(d) {
  return typeof d === 'string' && /^sha256:[a-f0-9]{64}$/.test(d);
}

async function readJson(path) {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function main() {
  const baseDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : join(process.cwd(), 'tmp/phase1-artifacts/market-prices');

  const snapshotPath = join(baseDir, 'snapshot.json');
  const statePath = join(baseDir, 'module-state.json');

  const snapshot = await readJson(snapshotPath);
  const state = await readJson(statePath);

  assert(snapshot && typeof snapshot === 'object', 'snapshot.json not an object');
  assert(snapshot.schema_version === '3.0', 'snapshot.schema_version must be 3.0');
  assert(snapshot.metadata && typeof snapshot.metadata === 'object', 'snapshot.metadata missing');
  assert(snapshot.metadata.module === 'market-prices', 'snapshot.metadata.module must be market-prices');
  assert(isSha256Digest(snapshot.metadata.digest), 'snapshot.metadata.digest must be sha256:...');

  assert(state && typeof state === 'object', 'module-state.json not an object');
  assert(state.schema_version === '3.0', 'state.schema_version must be 3.0');
  assert(state.module === 'market-prices', 'state.module must be market-prices');
  assert(state.digest === snapshot.metadata.digest, 'state.digest must equal snapshot.metadata.digest');

  process.stdout.write('OK: market-prices artifact validator\n');
}

main().catch((err) => {
  process.stderr.write(`FAIL: market-prices artifact validator\n${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
