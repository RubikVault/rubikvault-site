import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyVolatility } from '../../functions/api/_shared/stock-states-v1.js';
import { classifyClientStates } from '../../scripts/audit/classifier/_lib/audit-core.mjs';

function auditVolatility(value) {
  return classifyClientStates({ close: 100, sma20: 100, sma50: 90, sma200: 80, rsi14: 50, volatility_percentile: value }).volatility;
}

test('volatility classifier supports COMPRESSED/LOW/HIGH/EXTREME consistently', () => {
  for (const [value, expected] of [[8, 'COMPRESSED'], [20, 'LOW'], [76, 'HIGH'], [91, 'EXTREME']]) {
    assert.equal(classifyVolatility({ volatility_percentile: value }), expected);
    assert.equal(auditVolatility(value), expected);
  }
});

test('client audit normalizes 0-1 scale before bucketing', () => {
  assert.equal(auditVolatility(0.08), 'COMPRESSED');
  assert.equal(auditVolatility(0.2), 'LOW');
  assert.equal(auditVolatility(0.76), 'HIGH');
  assert.equal(auditVolatility(0.91), 'EXTREME');
});
