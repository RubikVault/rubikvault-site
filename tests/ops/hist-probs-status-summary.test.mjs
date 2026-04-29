import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHistProbsStatus } from '../../scripts/ops/build-hist-probs-status-summary.mjs';

test('hist status derives tier-a degraded with retry remaining and no unknown', () => {
  const status = deriveHistProbsStatus({
    runSummary: {
      ran_at: '2026-04-29T06:49:05Z',
      tickers_total: 17897,
      tickers_covered: 17635,
      tickers_errors: 262,
      tickers_remaining: 262,
      min_coverage_ratio: 0.95,
      hist_probs_tier: 'a',
      hist_probs_tier_a_count: 17941,
      hist_probs_tier_b_count: 46727,
      freshness_budget_trading_days: 2,
      asset_classes: ['STOCK', 'ETF', 'INDEX'],
    },
  });
  assert.equal(status.hist_probs_mode, 'tier_a');
  assert.equal(status.catchup_status, 'degraded');
  assert.equal(status.release_eligible, false);
  assert.equal(status.retry_remaining, 262);
  assert.equal(status.tier_b_pending, 46727);
  assert.notEqual(status.hist_probs_mode, 'unknown');
});

test('hist status marks all-scope partial as release eligible at 90 percent', () => {
  const status = deriveHistProbsStatus({
    runSummary: {
      tickers_total: 1000,
      tickers_covered: 910,
      tickers_errors: 90,
      tickers_remaining: 90,
      min_coverage_ratio: 0.95,
      hist_probs_tier: 'all',
      worker_hard_failures: 0,
      asset_classes: ['STOCK', 'ETF', 'INDEX'],
    },
  });
  assert.equal(status.hist_probs_mode, 'all');
  assert.equal(status.catchup_status, 'partial');
  assert.equal(status.release_eligible, true);
  assert.equal(status.coverage_ratio, 0.91);
});

test('hist status marks all-scope complete at min coverage with no retry remaining', () => {
  const status = deriveHistProbsStatus({
    runSummary: {
      tickers_total: 1000,
      tickers_covered: 970,
      tickers_errors: 0,
      tickers_remaining: 0,
      min_coverage_ratio: 0.95,
      hist_probs_tier: 'all',
      worker_hard_failures: 0,
      asset_classes: ['STOCK', 'ETF', 'INDEX'],
    },
  });
  assert.equal(status.catchup_status, 'complete');
  assert.equal(status.release_eligible, true);
});

test('hist status fails when run summary is missing', () => {
  const status = deriveHistProbsStatus({ runSummary: null });
  assert.equal(status.hist_probs_mode, 'missing');
  assert.equal(status.catchup_status, 'failed');
  assert.equal(status.release_eligible, false);
});
