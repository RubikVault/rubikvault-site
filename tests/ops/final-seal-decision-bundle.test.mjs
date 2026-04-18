import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecisionBundleHealth } from '../../scripts/ops/final-integrity-seal.mjs';

function latestWithSummary(summary, overrides = {}) {
  return {
    schema: 'rv.decision_bundle_latest.v1',
    schema_version: '1.0',
    status: overrides.status || 'DEGRADED',
    snapshot_id: 'dec-20260416-testhash0001',
    run_id: 'run',
    target_market_date: '2026-04-16',
    generated_at: '2026-04-17T06:00:00Z',
    valid_until: '2099-01-01T00:00:00Z',
    summary: {
      assets_unclassified_missing: 0,
      eligible_wait_pipeline_incomplete_count: 0,
      eligible_unknown_risk_count: 0,
      strict_full_coverage_ratio: 0.6,
      ...summary,
    },
    blocking_reasons: [],
    warnings: [],
    ...overrides,
  };
}

test('final seal accepts classified backlog as degraded, not failed', () => {
  const health = evaluateDecisionBundleHealth(latestWithSummary(), {
    expectedTargetDate: '2026-04-16',
    now: new Date('2026-04-17T08:00:00Z'),
    requiredLeafFailed: false,
  });
  assert.equal(health.status, 'DEGRADED');
  assert.equal(health.blocking_reasons.length, 0);
  assert.ok(health.warnings.some((warning) => warning.id === 'strict_full_coverage_below_95pct'));
});

test('final seal fails low coverage and unclassified missing, but degrades bounded structural decision gaps', () => {
  for (const summary of [
    { strict_full_coverage_ratio: 0.49 },
    { assets_unclassified_missing: 1 },
  ]) {
    const health = evaluateDecisionBundleHealth(latestWithSummary(summary), {
      expectedTargetDate: '2026-04-16',
      now: new Date('2026-04-17T08:00:00Z'),
      requiredLeafFailed: false,
    });
    assert.equal(health.status, 'FAILED');
    assert.ok(health.blocking_reasons.length > 0);
  }

  for (const summary of [
    { eligible_unknown_risk_count: 1 },
    { eligible_wait_pipeline_incomplete_count: 1 },
  ]) {
    const health = evaluateDecisionBundleHealth(latestWithSummary(summary), {
      expectedTargetDate: '2026-04-16',
      now: new Date('2026-04-17T08:00:00Z'),
      requiredLeafFailed: false,
    });
    assert.equal(health.status, 'DEGRADED');
    assert.equal(health.blocking_reasons.length, 0);
    assert.ok(health.warnings.length > 0);
  }
});

test('final seal fails stale or target-mismatched bundle', () => {
  assert.equal(evaluateDecisionBundleHealth(latestWithSummary({}, {
    valid_until: '2026-04-17T07:00:00Z',
  }), {
    expectedTargetDate: '2026-04-16',
    now: new Date('2026-04-17T08:00:00Z'),
    requiredLeafFailed: false,
  }).status, 'FAILED');

  assert.equal(evaluateDecisionBundleHealth(latestWithSummary({}, {
    target_market_date: '2026-04-15',
  }), {
    expectedTargetDate: '2026-04-16',
    now: new Date('2026-04-17T08:00:00Z'),
    requiredLeafFailed: false,
  }).status, 'FAILED');
});
