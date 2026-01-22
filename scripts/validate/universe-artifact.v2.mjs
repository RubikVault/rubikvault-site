#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

async function readJson(path) {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

const REQUIRED_INDEXES = ['DJ30', 'SP500', 'NDX100', 'RUT2000'];
const MIN_COUNTS = {
  DJ30: 30,
  SP500: 500,
  NDX100: 100,
  RUT2000: 2000
};

async function main() {
  const baseDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : join(process.cwd(), 'tmp/universe-artifacts');

  const snapshot = await readJson(join(baseDir, 'snapshot.json'));
  const state = await readJson(join(baseDir, 'module-state.json'));

  assert(snapshot?.schema_version === '3.0', 'snapshot.schema_version must be 3.0');
  assert(state?.schema_version === '3.0', 'state.schema_version must be 3.0');
  assert(snapshot?.module === 'universe', 'snapshot.module must be universe');
  assert(snapshot?.metadata?.module === 'universe', 'snapshot metadata.module must be universe');
  assert(state?.module === 'universe', 'state module must be universe');
  assert(typeof snapshot?.data === 'object', 'snapshot.data must be an object map');

  const symbols = Object.keys(snapshot.data || {});
  assert(symbols.length > 0, 'snapshot must contain at least one symbol');

  const indexCounts = REQUIRED_INDEXES.reduce((acc, idx) => {
    acc[idx] = 0;
    return acc;
  }, {});

  for (const [symbol, entry] of Object.entries(snapshot.data || {})) {
    assert(entry?.symbol === symbol, `entry symbol mismatch for ${symbol}`);
    assert(Array.isArray(entry.indexes) && entry.indexes.length > 0, `indexes missing for ${symbol}`);
    entry.indexes.forEach((idx) => {
      assert(REQUIRED_INDEXES.includes(idx), `unexpected index ${idx} for ${symbol}`);
      indexCounts[idx] += 1;
    });
    assert(entry.name || entry.name === null, `name missing for ${symbol}`);
  }

  for (const [index, min] of Object.entries(MIN_COUNTS)) {
    assert(indexCounts[index] >= min, `${index} coverage ${indexCounts[index]} < ${min}`);
  }

  assert(typeof snapshot.metadata.digest === 'string', 'digest missing');
  assert(state?.digest === snapshot.metadata.digest, 'state digest must match');

  console.log('OK: universe artifact validator');
}

main().catch((err) => {
  console.error('FAIL: universe artifact validator');
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
