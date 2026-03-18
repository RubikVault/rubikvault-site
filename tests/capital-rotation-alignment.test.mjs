import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alignPair } from '../scripts/lib/capital-rotation/alignment.js';

describe('capital-rotation alignment', () => {
  const mkBars = (dates) => dates.map(d => ({ date: d, close: 100 + Math.random() * 10 }));

  it('aligns perfectly matching dates', () => {
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
    const a = mkBars(dates);
    const b = mkBars(dates);
    const result = alignPair(a, b, 'SPY.US', 'GLD.US');
    assert.equal(result.aligned.length, 5);
    assert.equal(result.gaps, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('inner joins on common dates only', () => {
    const a = mkBars(['2026-01-05', '2026-01-06', '2026-01-07']);
    const b = mkBars(['2026-01-06', '2026-01-07', '2026-01-08']);
    const result = alignPair(a, b, 'SPY.US', 'TLT.US');
    assert.equal(result.aligned.length, 2);
  });

  it('detects gaps exceeding threshold', () => {
    const a = mkBars(['2026-01-02', '2026-01-10']); // 6 trading day gap
    const b = mkBars(['2026-01-02', '2026-01-10']);
    const result = alignPair(a, b, 'SPY.US', 'TLT.US', { maxGapDays: 3 });
    assert.ok(result.maxGap > 3);
    assert.ok(result.warnings.length > 0);
  });

  it('returns empty for no bars', () => {
    const result = alignPair([], [{ date: '2026-01-05', close: 100 }], 'A', 'B');
    assert.equal(result.aligned.length, 0);
    assert.equal(result.coverage, 0);
  });

  it('returns empty for null input', () => {
    const result = alignPair(null, null, 'A', 'B');
    assert.equal(result.aligned.length, 0);
  });

  it('filters crypto to trading days', () => {
    // Include a Saturday and Sunday for crypto
    const cryptoBars = mkBars(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11']);
    const tradFiBars = mkBars(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']);
    const result = alignPair(cryptoBars, tradFiBars, 'BTC-USD.CC', 'SPY.US');
    // Should only match weekdays
    assert.ok(result.aligned.length <= 5);
    assert.ok(result.aligned.length >= 3);
  });
});
