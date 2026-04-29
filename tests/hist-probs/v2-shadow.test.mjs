import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  histProbsReadCandidates,
  histProbsWriteTargets,
  resolveHistProbsWriteMode,
} from '../../scripts/lib/hist-probs/path-resolver.mjs';
import { scoreBarsWithBaselineV2 } from '../../scripts/hist-probs-v2/lib/baseline-v2.mjs';
import { buildComparison } from '../../scripts/reports/compare-hist-probs-v1-vs-v2.mjs';

function makeBars(count) {
  const bars = [];
  let close = 100;
  for (let i = 0; i < count; i += 1) {
    close *= 1 + (i % 7 === 0 ? -0.01 : 0.004);
    bars.push({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      open: close * 0.998,
      high: close * 1.01,
      low: close * 0.99,
      close,
      adjClose: close,
      volume: 1_000_000 + i * 1000,
    });
  }
  return bars;
}

describe('hist-probs v1 write mode', () => {
  it('defaults invalid write mode to bucket-only and prefers sharded reads', () => {
    assert.equal(resolveHistProbsWriteMode(undefined), 'bucket_only');
    assert.equal(resolveHistProbsWriteMode('bad-mode'), 'bucket_only');
    const targets = histProbsWriteTargets('/tmp/hist-probs', 'AAPL', { mode: 'bucket_only' });
    assert.equal(targets.mode, 'bucket_only');
    assert.deepEqual(targets.writePaths, [path.join('/tmp/hist-probs', 'AA', 'AAPL.json')]);
    assert.deepEqual(histProbsReadCandidates('/tmp/hist-probs', 'AAPL'), [
      path.join('/tmp/hist-probs', 'AA', 'AAPL.json'),
      path.join('/tmp/hist-probs', 'AAPL.json'),
    ]);
  });
});

describe('hist-probs v2 shadow baseline', () => {
  it('emits shadow-only scores without BUY eligibility', () => {
    const result = scoreBarsWithBaselineV2(makeBars(120), {
      ticker: 'AAPL',
      assetClass: 'stock',
    });
    assert.equal(result.status, 'ready');
    assert.equal(result.scores.length, 3);
    for (const score of result.scores) {
      assert.equal(score.buy_eligible, false);
      assert.equal(score.source, 'hist_probs_v2_shadow');
      assert.match(score.horizon, /^(1d|5d|20d)$/);
      assert.equal(score.score_date, '2026-04-30');
      assert.ok(score.probability >= 0.05 && score.probability <= 0.95);
    }
  });
});

describe('hist-probs v1/v2 comparison report', () => {
  it('rejects promotion when sample size is insufficient', () => {
    const report = buildComparison({
      date: '2026-01-10',
      lookbackDays: 1,
      minN: 999999,
      v1Feature: 'missing_v1_fixture',
      v2Feature: 'missing_v2_fixture',
    });
    assert.equal(report.status, 'insufficient_n');
    assert.equal(report.promotion_eligible, false);
  });
});
