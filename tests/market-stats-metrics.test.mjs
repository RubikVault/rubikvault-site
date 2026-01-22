#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { computeStatsForSymbol } from '../scripts/providers/market-stats-v3.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function assertClose(actual, expected, message = '', tolerance = 1e-9) {
  if (actual === null || expected === null) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual} ${message}`);
    }
    return;
  }
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`Expected ${expected} ±${tolerance}, got ${actual} ${message}`);
  }
}

const fixturePath = path.join('tests', 'fixtures', 'market-stats-bars.sample.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
const result = computeStatsForSymbol(fixture.symbol, fixture.bars, { barsExpected: 252 });
const stats = result.stats;
const coverage = result.coverage;

assertClose(stats.returns_1d, 0.0021344725286326196, 'returns_1d');
assertClose(stats.returns_5d, 0.010718216220024107, 'returns_5d');
assertClose(stats.returns_21d, 0.0458095360312942, 'returns_21d');
assertClose(stats.volatility_21d, 0.00045742920562632773, 'volatility_21d');
assertClose(stats.volatility_63d, 0.0015138880194274563, 'volatility_63d');
assertClose(stats.momentum_21d, 4.6875, 'momentum_21d');
assertClose(stats.momentum_63d, 15.517241379310345, 'momentum_63d');
assertClose(stats.momentum_252d, 116.12903225806453, 'momentum_252d');
assertClose(stats.sma_20, 229.75, 'sma_20');
assertClose(stats.sma_50, 222.25, 'sma_50');
assertClose(stats.sma_200, 184.75, 'sma_200');
assertClose(stats.distance_to_sma_20, 2.0674646354733373, 'distance_to_sma_20');
assertClose(stats.distance_to_sma_50, 5.5118110236220375, 'distance_to_sma_50');
assertClose(stats.rsi_14, 100, 'rsi_14');
assertClose(stats.atr_14, 0.8000000000000114, 'atr_14');
assertClose(stats.atr_20, 0.8000000000000114, 'atr_20');
assertClose(stats.close_zscore_63d, 1.7047727121232321, 'close_zscore_63d');
assertClose(stats.return_zscore_63d, -1.6274545724829081, 'return_zscore_63d');
assertClose(stats.drawdown_max_252d, 0, 'drawdown_max');
assertClose(stats.drawdown_current_252d, 0, 'drawdown_current');
assertClose(coverage.coverage_ratio, 1, 'coverage_ratio');
assert(coverage.freshness_days >= 0, 'freshness_days should be present');
assert(Array.isArray(result.warnings), 'warnings should be array');
assert(result.warnings.length === 0, 'Expected no warnings for full fixture');

console.log('✅ market-stats metrics helper smoke');
