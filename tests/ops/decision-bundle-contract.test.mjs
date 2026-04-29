import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssetDecision,
  computeDecisionSummary,
  decisionHash,
  evaluateCoveragePolicy,
  hashMod64,
} from '../../scripts/lib/decision-bundle-contract.mjs';

function row(id, overrides = {}) {
  const symbol = id.split(':').pop();
  return {
    canonical_id: id,
    symbol,
    type_norm: 'STOCK',
    bars_count: 252,
    last_trade_date: '2026-04-16',
    computed: { score_0_100: 65 },
    pointers: { pack_sha256: `sha256:${symbol}` },
    ...overrides,
  };
}

test('hash_mod_64 is stable and bounded', () => {
  assert.equal(hashMod64('US:AAPL'), hashMod64('US:AAPL'));
  assert.ok(hashMod64('US:AAPL') >= 0);
  assert.ok(hashMod64('US:AAPL') < 64);
});

test('classified insufficient-history backlog degrades instead of failing by itself', () => {
  const decisions = [
    ...Array.from({ length: 6 }, (_, idx) => buildAssetDecision(row(`US:OK${idx}`), {
      runId: 'run',
      snapshotId: 'snap',
      targetMarketDate: '2026-04-16',
    })),
    ...Array.from({ length: 4 }, (_, idx) => buildAssetDecision(row(`US:SHORT${idx}`, { bars_count: 80 }), {
      runId: 'run',
      snapshotId: 'snap',
      targetMarketDate: '2026-04-16',
    })),
  ];
  const summary = computeDecisionSummary(decisions);
  assert.equal(summary.assets_insufficient_history, 4);
  assert.equal(summary.eligible_wait_pipeline_incomplete_count, 0);
  assert.equal(summary.eligible_unknown_risk_count, 0);
  assert.equal(summary.strict_full_coverage_ratio, 0.6);
  assert.deepEqual(evaluateCoveragePolicy(summary).status, 'DEGRADED');
});

test('eligible scored assets produce BUY only when daily score clears threshold', () => {
  const buy = buildAssetDecision(row('US:BUY', { computed: { score_0_100: 93 } }), {
    runId: 'run',
    snapshotId: 'snap',
    targetMarketDate: '2026-04-16',
  });
  assert.equal(buy.pipeline_status, 'OK');
  assert.equal(buy.verdict, 'BUY');
  assert.equal(buy.buy_eligibility.eligible, true);
  assert.equal(buy.buy_eligibility.threshold, 90);
  assert.ok(buy.reason_codes.includes('score_buy_threshold_met'));

  const wait = buildAssetDecision(row('US:WAIT', { computed: { score_0_100: 89 } }), {
    runId: 'run',
    snapshotId: 'snap',
    targetMarketDate: '2026-04-16',
  });
  assert.equal(wait.pipeline_status, 'OK');
  assert.equal(wait.verdict, 'WAIT');
  assert.equal(wait.buy_eligibility.eligible, false);
});

test('unclassified missing fails, while eligible unknown risk degrades as a bounded structural gap', () => {
  const unclassified = buildAssetDecision({ symbol: 'BROKEN', type_norm: 'STOCK' }, {
    runId: 'run',
    snapshotId: 'snap',
    targetMarketDate: '2026-04-16',
  });
  let summary = computeDecisionSummary([unclassified]);
  assert.equal(summary.assets_unclassified_missing, 1);
  assert.equal(evaluateCoveragePolicy(summary).status, 'FAILED');

  const unknownRisk = buildAssetDecision(row('US:NORISK', { computed: {} }), {
    runId: 'run',
    snapshotId: 'snap',
    targetMarketDate: '2026-04-16',
  });
  summary = computeDecisionSummary([
    unknownRisk,
    buildAssetDecision(row('US:OKA'), {
      runId: 'run',
      snapshotId: 'snap',
      targetMarketDate: '2026-04-16',
    }),
    buildAssetDecision(row('US:OKB'), {
      runId: 'run',
      snapshotId: 'snap',
      targetMarketDate: '2026-04-16',
    }),
  ]);
  assert.equal(unknownRisk.risk_assessment.level, 'UNSCORED');
  assert.equal(summary.eligible_unknown_risk_count, 0);
  assert.equal(evaluateCoveragePolicy(summary).status, 'DEGRADED');
});

test('decision hashes are stable for canonical JSON', () => {
  const decision = buildAssetDecision(row('US:AAPL'), {
    runId: 'run',
    snapshotId: 'snap',
    targetMarketDate: '2026-04-16',
  });
  assert.equal(decisionHash(decision), decisionHash({ ...decision }));
});
