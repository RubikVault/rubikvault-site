#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = path.resolve(process.cwd(), 'public/js/rv-stock-ui-extras.js');
await import(pathToFileURL(modulePath).href);

const extras = globalThis.RVStockUIExtras;
assert.ok(extras, 'RVStockUIExtras should be attached to globalThis');

function makeBars() {
  const rows = [];
  const start = new Date('2025-01-01T00:00:00Z');
  let close = 100;
  for (let i = 0; i < 320; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    if (isWeekend) continue;

    const open = close;
    close = Number((close * (1 + ((i % 7) - 3) * 0.002)).toFixed(4));
    rows.push({
      date: date.toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      volume: 1000000 + i * 1000
    });
  }
  return rows;
}

const bars = makeBars();
const normalized = extras.normalizeBars(bars);
assert.ok(Array.isArray(normalized), 'normalizeBars should return an array');
assert.ok(normalized.length > 200, 'normalizeBars should keep enough rows');

const returns = extras.computeReturns(normalized, { d1: 1, w1: 5, m1: 21, m3: 63, y1: 252, y5: 1260 });
for (const key of ['d1', 'w1', 'm1', 'm3']) {
  assert.equal(Number.isFinite(returns[key]), true, `computeReturns.${key} should be finite for long history`);
}
assert.equal(returns.y5, null, 'computeReturns.y5 should be null for short synthetic history');

const distribution = extras.computeDistribution(normalized, 90);
assert.equal(Number.isFinite(distribution.win_rate), true, 'computeDistribution.win_rate should be finite');
assert.equal(Array.isArray(distribution.bins), true, 'computeDistribution.bins should be array');
assert.equal(distribution.bins.length > 0, true, 'computeDistribution.bins should not be empty');

const seasonality = extras.computeSeasonality(normalized, 2);
assert.equal(Array.isArray(seasonality.monthly), true, 'computeSeasonality.monthly should be an array');
assert.equal(seasonality.monthly.length, 12, 'computeSeasonality should return 12 months');

const support = extras.computeSupportResistance(normalized, 252);
assert.equal(Number.isFinite(support.high_52w), true, 'computeSupportResistance.high_52w should be finite');
assert.equal(Number.isFinite(support.low_52w), true, 'computeSupportResistance.low_52w should be finite');

const gaps = extras.computeGapStats(normalized, 0.01, 252);
assert.equal(typeof gaps.gaps_detected, 'number', 'computeGapStats.gaps_detected should be numeric');
assert.equal(Array.isArray(gaps.recent_gaps), true, 'computeGapStats.recent_gaps should be array');

const envelope = extras.normalizeStockEnvelope({
  meta: { status: 'fresh', generated_at: '2026-02-13T00:00:00Z', asOf: '2026-02-13', provider: 'eodhd' },
  data: {
    ticker: 'F',
    bars: normalized,
    latest_bar: normalized[normalized.length - 1],
    change: { abs: 0.2, pct: 0.01 },
    indicators: [{ id: 'atr14', value: 1.1 }]
  }
});

assert.equal(envelope.ok, true, 'normalizeStockEnvelope should set ok=true for fresh status');
assert.equal(envelope.data.ticker, 'F', 'normalizeStockEnvelope should preserve ticker');
assert.equal(envelope.data.indicator_map.atr14, 1.1, 'normalizeStockEnvelope should map indicator values');

console.log('✅ stock-ui-extras tests passed');
