import test from 'node:test';
import assert from 'node:assert/strict';
import { planSubpacks } from '../../scripts/lib/hist-probs/subpack-planner.mjs';
import { HistProbsRollingCore } from '../../scripts/lib/indicators/rolling-core.mjs';

test('subpack planner preserves all items and caps subpack size', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    symbol: `T${index}`,
    bars_count: 100,
  }));
  const subpacks = planSubpacks(entries, { maxTickersPerSubpack: 5, maxBarsPerSubpack: 450 });
  assert.equal(subpacks.length, 3);
  assert.equal(subpacks.flatMap((item) => item.items).length, entries.length);
});

test('rolling core advances length with each pushed bar', () => {
  const core = new HistProbsRollingCore();
  core.push({ date: '2026-01-01', open: 1, high: 1, low: 1, close: 1, adjClose: 1, volume: 1 });
  core.push({ date: '2026-01-02', open: 2, high: 2, low: 2, close: 2, adjClose: 2, volume: 1 });
  assert.equal(core.length, 2);
});
