import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMomentum } from '../../functions/api/_shared/stock-states-v1.js';
import { classifyClientStates } from '../../scripts/audit/classifier/_lib/audit-core.mjs';

function auditMomentum(stats) {
  return classifyClientStates({ close: 100, sma20: 100, sma50: 90, sma200: 80, volatility_percentile: 30, ...stats }).momentum;
}

test('RSI 41 with non-negative MACD is NEUTRAL', () => {
  const stats = { rsi14: 41, macd_hist: 0.01 };
  assert.equal(classifyMomentum(stats), 'NEUTRAL');
  assert.equal(auditMomentum(stats), 'NEUTRAL');
});

test('RSI 41 with negative MACD is BEARISH', () => {
  const stats = { rsi14: 41, macd_hist: -0.01 };
  assert.equal(classifyMomentum(stats), 'BEARISH');
  assert.equal(auditMomentum(stats), 'BEARISH');
});

test('RSI hard boundaries use 80 and 20', () => {
  assert.equal(classifyMomentum({ rsi14: 80, macd_hist: 0 }), 'OVERBOUGHT');
  assert.equal(classifyMomentum({ rsi14: 20, macd_hist: 0 }), 'OVERSOLD');
  assert.equal(auditMomentum({ rsi14: 80, macd_hist: 0 }), 'OVERBOUGHT');
  assert.equal(auditMomentum({ rsi14: 20, macd_hist: 0 }), 'OVERSOLD');
});
