import test from 'node:test';
import assert from 'node:assert/strict';
import { costProxy } from '../../scripts/decision-core/evaluate-p0-ev-risk.mjs';
import { readJson } from './shared-fixtures.mjs';

test('cost proxy unavailable or high produces blocking reason codes', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  assert.equal(costProxy({ features: {}, policy }).reason_codes.includes('COST_PROXY_UNAVAILABLE'), true);
  assert.equal(costProxy({ features: { close: 10, liquidity_score: 10, volatility_percentile: 20, dollar_volume_20d: 1000 }, policy }).reason_codes.includes('LIQUIDITY_SCORE_TOO_LOW'), true);
});
