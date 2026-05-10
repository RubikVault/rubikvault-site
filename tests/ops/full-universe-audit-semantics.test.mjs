import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload } from '../../scripts/ops/build-stock-analyzer-universe-audit.mjs';

test('incomplete full audit cannot claim full universe or release eligibility', () => {
  const payload = buildPayload({
    options: {
      baseUrl: 'http://127.0.0.1:8788',
      registryPath: '/tmp/registry.ndjson.gz',
      allowlistPath: null,
      assetClasses: ['STOCK', 'ETF'],
      maxTickers: 0,
      liveSampleSize: 300,
      concurrency: 6,
      timeoutMs: 20000,
      tickers: [],
    },
    totalUniverseAssets: 96364,
    processedEntries: Array.from({ length: 300 }, (_, index) => ({ ticker: `T${index}` })),
    records: [],
    startedAt: '2026-04-12T00:00:00.000Z',
    completedAt: '2026-04-12T00:01:00.000Z',
    fullUniverseScope: true,
  });
  assert.equal(payload.summary.full_universe, false);
  assert.equal(payload.summary.full_universe_validated, false);
  assert.equal(payload.summary.release_eligible, false);
  assert.equal(payload.summary.live_endpoint_mode, 'artifact_only');
});

test('hist-probs stale long-tail warning does not block release eligibility', () => {
  const payload = buildPayload({
    options: {
      baseUrl: 'http://127.0.0.1:8788',
      registryPath: '/tmp/registry.ndjson.gz',
      allowlistPath: null,
      assetClasses: ['STOCK', 'ETF', 'INDEX'],
      maxTickers: 0,
      liveSampleSize: 0,
      concurrency: 6,
      timeoutMs: 20000,
      tickers: [],
    },
    totalUniverseAssets: 1,
    processedEntries: [{ ticker: 'AAPL', assetClass: 'STOCK' }],
    records: [
      {
        ticker: 'AAPL',
        assetClass: 'STOCK',
        familyId: 'artifact_hist_probs_stale',
        severity: 'warning',
        detail: '2026-05-07',
      },
    ],
    startedAt: '2026-05-10T00:00:00.000Z',
    completedAt: '2026-05-10T00:01:00.000Z',
    fullUniverseScope: true,
  });

  assert.equal(payload.summary.artifact_release_ready, true);
  assert.equal(payload.summary.release_eligible, true);
  assert.equal(payload.summary.policy_neutral_structural_gaps_only, true);
});
