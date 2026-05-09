import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTrend } from '../../functions/api/_shared/stock-states-v1.js';
import { classifyClientStates } from '../../scripts/audit/classifier/_lib/audit-core.mjs';

test('bullish MA-stack pullback above SMA200 remains UP', () => {
  const stats = { sma20: 568, sma50: 549, sma200: 458, rsi14: 42, volatility_percentile: 30 };
  assert.equal(classifyTrend(stats, 537), 'UP');
  assert.equal(classifyClientStates({ ...stats, close: 537 }).trend, 'UP');
});

test('bullish MA-stack above SMA20 is STRONG_UP', () => {
  const stats = { sma20: 100, sma50: 90, sma200: 80 };
  assert.equal(classifyTrend(stats, 105), 'STRONG_UP');
  assert.equal(classifyClientStates({ ...stats, close: 105 }).trend, 'STRONG_UP');
});

test('bullish MA-stack below SMA200 is RANGE, not UP', () => {
  const stats = { sma20: 100, sma50: 90, sma200: 80 };
  assert.equal(classifyTrend(stats, 75), 'RANGE');
  assert.equal(classifyClientStates({ ...stats, close: 75 }).trend, 'RANGE');
});

test('bearish MA-stack relief above SMA200 is RANGE', () => {
  const stats = { sma20: 80, sma50: 90, sma200: 100 };
  assert.equal(classifyTrend(stats, 105), 'RANGE');
  assert.equal(classifyClientStates({ ...stats, close: 105 }).trend, 'RANGE');
});
