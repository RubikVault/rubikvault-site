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

function validateSurely(value, min, max, allowNull = false) {
  if (value === null || value === undefined) {
    assert(allowNull, 'value missing but not allowed');
    return;
  }
  assert(typeof value === 'number', 'value must be numeric');
  assert(value >= min && value <= max, `value ${value} outside [${min},${max}]`);
}

async function main() {
  const baseDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : join(process.cwd(), 'tmp/phase1-artifacts/market-score');

  const snapshot = await readJson(join(baseDir, 'snapshot.json'));
  const state = await readJson(join(baseDir, 'module-state.json'));

  assert(snapshot?.schema_version === '3.0', 'snapshot.schema_version must be 3.0');
  assert(snapshot?.module === 'market-score', 'snapshot module must be market-score');
  assert(snapshot?.metadata?.module === 'market-score', 'metadata module must be market-score');
  assert(state?.module === 'market-score', 'state module must be market-score');
  assert(typeof snapshot?.data === 'object', 'data must be an object map');

  const symbols = Object.keys(snapshot.data || {});
  assert(symbols.length > 0, 'no symbols scored');

  for (const symbol of symbols) {
    const entry = snapshot.data[symbol];
    assert(entry?.symbol === symbol, `symbol mismatch ${symbol}`);
    validateSurely(entry?.score_short, 0, 100);
    validateSurely(entry?.score_mid, 0, 100);
    validateSurely(entry?.score_long, 0, 100);
    validateSurely(entry?.confidence, 0, 1);
    assert(Array.isArray(entry?.inputs_used), 'inputs_used must be array');
    assert(entry?.version, 'version required');
    assert(typeof entry?.weights_digest === 'string', 'weights_digest string');
    const reasons = entry?.reasons_top || {};
    ['short', 'mid', 'long'].forEach((horizon) => {
      const list = reasons[horizon] || [];
      assert(Array.isArray(list), `${horizon} reasons must be array`);
      assert(list.length <= 5, `${horizon} reasons >5`);
    list.forEach((reason) => {
      assert(reason.metric, 'reason requires metric');
      assert(reason.points !== undefined, 'reason requires points');
      assert(typeof reason.code === 'string' && reason.code.length > 0, 'reason requires code');
      assert(/^[A-Z0-9_]{3,80}$/.test(reason.code), `reason code invalid ${reason.code}`);
    });
    });
  }

  console.log('OK: market-score artifact validator');
}

main().catch((err) => {
  console.error('FAIL: market-score artifact validator');
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
