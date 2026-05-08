import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, assertNoGermanPublicText } from './shared-fixtures.mjs';

test('reason-code registry includes behavior metadata and cost codes', () => {
  const registry = readJson('public/data/decision-core/reason-codes/latest.json');
  const requiredFields = ['code', 'class', 'applies_to', 'buy_blocking', 'reliability_impact', 'ui_severity', 'priority', 'is_blocking', 'can_be_main_blocker'];
  for (const row of registry.codes) for (const field of requiredFields) assert.ok(field in row, `${row.code}:${field}`);
  for (const code of ['COST_PROXY_UNAVAILABLE', 'COST_PROXY_HIGH', 'SPREAD_PROXY_TOO_HIGH', 'DOLLAR_VOLUME_TOO_LOW', 'LIQUIDITY_SCORE_TOO_LOW']) {
    assert.ok(registry.codes.find((row) => row.code === code), code);
  }
  assertNoGermanPublicText(registry);
});
