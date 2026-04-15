import test from 'node:test';
import assert from 'node:assert/strict';
import { HistProbsRollingCore } from '../../scripts/lib/indicators/rolling-core.mjs';
import { computeHistIndicators } from '../../scripts/lib/hist-probs/compute-hist-indicators.mjs';

function makeBars(count = 80) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 1,
      high: close + 1,
      low: close - 2,
      close,
      adjClose: close,
      volume: 1000 + index * 10,
    };
  });
}

test('rolling core snapshots match computeHistIndicators on the same prefix', () => {
  const bars = makeBars();
  const core = new HistProbsRollingCore();
  for (let index = 0; index < bars.length; index += 1) {
    const rolling = core.push(bars[index]);
    const expected = computeHistIndicators(bars.slice(0, index + 1));
    assert.deepEqual(rolling, expected);
  }
});
