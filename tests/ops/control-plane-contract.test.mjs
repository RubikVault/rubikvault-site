import test from 'node:test';
import assert from 'node:assert/strict';
import { validateControlPlaneConsistency } from '../../scripts/ops/pipeline-artifact-contract.mjs';
import { buildFinalIntegritySeal } from '../../scripts/ops/final-integrity-seal.mjs';

function validDecisionBundle(targetMarketDate) {
  return {
    schema: 'rv.decision_bundle_latest.v1',
    status: 'OK',
    target_market_date: targetMarketDate,
    valid_until: `${targetMarketDate}T23:59:59Z`,
    summary: {
      strict_full_coverage_ratio: 1,
      strict_full_coverage_count: 10,
      assets_expected_for_decision: 10,
      assets_unclassified_missing: 0,
      eligible_wait_pipeline_incomplete_count: 0,
      eligible_unknown_risk_count: 0,
      buy_count: 1,
    },
  };
}

test('control-plane consistency fails when target dates diverge', () => {
  const result = validateControlPlaneConsistency({
    release: { run_id: 'r1', target_date: '2026-04-10' },
    runtime: { run_id: 'r1', target_market_date: '2026-04-10' },
    epoch: { run_id: 'r1', target_market_date: '2026-04-09', pipeline_ok: true },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocking_reasons.some((item) => item.id === 'target_market_date_mismatch'), true);
});

test('control-plane consistency fails when run ids diverge', () => {
  const result = validateControlPlaneConsistency({
    release: { run_id: 'r1', target_date: '2026-04-10' },
    runtime: { run_id: 'r2', target_market_date: '2026-04-10' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocking_reasons.some((item) => item.id === 'run_id_mismatch'), true);
});

test('control-plane consistency allows verify-stage ui_green without completed release validation', () => {
  const result = validateControlPlaneConsistency({
    release: {
      run_id: 'r1',
      target_date: '2026-04-17',
      ui_green: true,
      full_universe_validated: false,
      completed_at: null,
    },
    runtime: { run_id: 'r1', target_market_date: '2026-04-17' },
    epoch: { run_id: 'r1', target_market_date: '2026-04-17', pipeline_ok: true, modules: {}, blocking_gaps: [] },
  });
  assert.equal(
    result.blocking_reasons.some((item) => item.id === 'impossible_state_release_green_without_full_universe_validation'),
    false,
  );
});

test('final seal marks stale runtime and epoch observers against the active target chain', () => {
  const seal = buildFinalIntegritySeal({
    runId: 'r1',
    targetMarketDate: '2026-04-17',
    phase: 'SLA_BREACH',
    system: {
      run_id: 'r1',
      summary: { target_market_date: '2026-04-17', local_data_green: false },
      steps: {},
    },
    runtime: {
      run_id: 'r1',
      generated_at: '2026-04-14T09:00:00Z',
      target_market_date: '2026-04-14',
      pipeline_consistency: { ok: true, blocking_reasons: [] },
    },
    epoch: {
      run_id: 'r1',
      generated_at: '2026-04-14T09:00:00Z',
      target_market_date: '2026-04-14',
      pipeline_ok: true,
      modules: {},
      blocking_gaps: [],
    },
    recovery: {
      generated_at: '2026-04-18T09:10:00Z',
      target_market_date: '2026-04-17',
      next_step: 'market_data_refresh',
    },
    release: {
      run_id: 'r1',
      target_date: '2026-04-17',
      phase: 'SLA_BREACH',
    },
    publish: {
      ok: true,
      steps: [],
    },
    stockAnalyzerAudit: {
      summary: {
        full_universe: true,
        artifact_critical_issue_count: 0,
        critical_failure_family_count: 0,
        live_endpoint_mode: 'full',
      },
    },
    uiFieldTruth: {
      target_market_date: '2026-04-17',
      summary: {
        ui_field_truth_ok: true,
      },
    },
    launchd: { allowed_launchd_only: true },
    storage: { disk: { heavy_jobs_allowed: true }, nas: { reachable: true } },
    requiredLeafFailed: false,
    now: new Date('2026-04-18T09:20:00Z'),
  });
  assert.equal(seal.observer_stale, true);
  assert.equal(seal.observer_generated_at, '2026-04-14T09:00:00.000Z');
  assert.equal(seal.lead_blocker_step, 'market_data_refresh');
  assert.equal(seal.next_step, 'market_data_refresh');
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'observer_stale'), true);
});

test('final seal exposes runtime_preflight as the leading blocker', () => {
  const targetMarketDate = '2026-04-17';
  const seal = buildFinalIntegritySeal({
    runId: 'r1',
    targetMarketDate,
    phase: 'PUBLISH',
    system: {
      run_id: 'r1',
      summary: { target_market_date: targetMarketDate, local_data_green: true },
      steps: {},
    },
    runtime: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
    },
    epoch: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
      pipeline_ok: true,
      modules: {},
      blocking_gaps: [],
    },
    recovery: {
      generated_at: '2026-04-17T20:15:00Z',
      target_market_date: targetMarketDate,
      next_step: 'runtime_preflight',
    },
    release: {
      run_id: 'r1',
      target_date: targetMarketDate,
      phase: 'PUBLISH',
    },
    publish: { ok: true, steps: [] },
    runtimePreflight: {
      ok: false,
      generated_at: '2026-04-17T20:16:00Z',
      failure_reasons: ['runtime_unavailable'],
      diag_ok: false,
      canary_ok: false,
    },
    stockAnalyzerAudit: {
      summary: {
        full_universe: true,
        artifact_release_ready: true,
        artifact_critical_issue_count: 0,
        critical_failure_family_count: 0,
        live_endpoint_mode: 'full',
      },
    },
    uiFieldTruth: {
      target_market_date: targetMarketDate,
      summary: { ui_field_truth_ok: true },
    },
    launchd: { allowed_launchd_only: true },
    storage: { disk: { heavy_jobs_allowed: true }, nas: { reachable: true } },
    decisionBundle: validDecisionBundle(targetMarketDate),
    heartbeat: { last_seen: '2026-04-17T20:55:00Z' },
    previousFinal: { generated_at: '2026-04-17T20:30:00Z' },
    requiredLeafFailed: false,
    now: new Date('2026-04-17T21:00:00Z'),
  });
  assert.equal(seal.runtime_preflight_ok, false);
  assert.equal(seal.lead_blocker_step, 'runtime_preflight');
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'runtime_preflight_failed'), true);
});

test('final seal degrades policy-neutral structural gaps without reintroducing a false blocker', () => {
  const targetMarketDate = '2026-04-17';
  const seal = buildFinalIntegritySeal({
    runId: 'r1',
    targetMarketDate,
    phase: 'VERIFY',
    system: {
      run_id: 'r1',
      summary: { target_market_date: targetMarketDate, local_data_green: true },
      steps: {},
    },
    runtime: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
    },
    epoch: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
      pipeline_ok: true,
      modules: {},
      blocking_gaps: [],
    },
    recovery: {
      generated_at: '2026-04-17T20:15:00Z',
      target_market_date: targetMarketDate,
      next_step: 'publish',
    },
    release: {
      run_id: 'r1',
      target_date: targetMarketDate,
      phase: 'VERIFY',
    },
    publish: { ok: true, steps: [] },
    runtimePreflight: {
      ok: true,
      generated_at: '2026-04-17T20:16:00Z',
      failure_reasons: [],
      diag_ok: true,
      canary_ok: true,
    },
    stockAnalyzerAudit: {
      summary: {
        full_universe: true,
        artifact_full_validated: false,
        artifact_release_ready: true,
        policy_neutral_structural_gaps_only: true,
        policy_neutral_structural_gap_count: 2,
        policy_blocking_failure_family_count: 0,
        artifact_critical_issue_count: 0,
        critical_failure_family_count: 0,
        live_endpoint_mode: 'full',
      },
    },
    uiFieldTruth: {
      target_market_date: targetMarketDate,
      summary: { ui_field_truth_ok: true },
    },
    launchd: { allowed_launchd_only: true },
    storage: { disk: { heavy_jobs_allowed: true }, nas: { reachable: true } },
    decisionBundle: validDecisionBundle(targetMarketDate),
    heartbeat: { last_seen: '2026-04-17T20:55:00Z' },
    previousFinal: { generated_at: '2026-04-17T20:30:00Z' },
    requiredLeafFailed: false,
    now: new Date('2026-04-17T21:00:00Z'),
  });
  assert.equal(seal.policy_neutral_structural_gaps_only, true);
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'full_universe_ui_field_truth_missing'), false);
  assert.equal(seal.status, 'OK');
  assert.equal(seal.ui_green, true);
  assert.equal(seal.warnings.some((item) => item.id === 'policy_neutral_structural_gap'), false);
  assert.equal(seal.advisories.some((item) => item.id === 'policy_neutral_structural_gap'), true);
});

test('final seal ignores stale publish crash blockers once publish is green again', () => {
  const targetMarketDate = '2026-04-17';
  const seal = buildFinalIntegritySeal({
    runId: 'r1',
    targetMarketDate,
    phase: 'VERIFY',
    system: {
      run_id: 'r1',
      summary: { target_market_date: targetMarketDate, local_data_green: true },
      steps: {},
    },
    runtime: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
    },
    epoch: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
      pipeline_ok: true,
      modules: {},
      blocking_gaps: [],
    },
    recovery: {
      generated_at: '2026-04-17T20:15:00Z',
      target_market_date: targetMarketDate,
      next_step: 'dashboard_meta',
    },
    release: {
      run_id: 'r1',
      target_date: targetMarketDate,
      phase: 'VERIFY',
    },
    publish: { ok: true, steps: [] },
    runtimePreflight: {
      ok: true,
      generated_at: '2026-04-17T20:16:00Z',
      failure_reasons: [],
      diag_ok: true,
      canary_ok: true,
    },
    stockAnalyzerAudit: {
      summary: {
        full_universe: true,
        artifact_release_ready: true,
        artifact_critical_issue_count: 0,
        critical_failure_family_count: 0,
        live_endpoint_mode: 'full',
      },
    },
    uiFieldTruth: {
      target_market_date: targetMarketDate,
      summary: { ui_field_truth_ok: true },
    },
    launchd: { allowed_launchd_only: true },
    storage: { disk: { heavy_jobs_allowed: true }, nas: { reachable: true } },
    decisionBundle: validDecisionBundle(targetMarketDate),
    crashSeal: {
      status: 'FAILED',
      run_id: 'r1',
      failed_step: 'PUBLISH',
      failure_class: 'step_failed',
    },
    heartbeat: { last_seen: '2026-04-17T20:55:00Z' },
    previousFinal: { generated_at: '2026-04-17T20:30:00Z' },
    requiredLeafFailed: false,
    now: new Date('2026-04-17T21:00:00Z'),
  });
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'crash_unresolved'), false);
  assert.equal(seal.status, 'OK');
});

test('final seal keeps decision bundle coverage warnings advisory-only', () => {
  const targetMarketDate = '2026-04-17';
  const seal = buildFinalIntegritySeal({
    runId: 'r1',
    targetMarketDate,
    phase: 'VERIFY',
    system: {
      run_id: 'r1',
      summary: { target_market_date: targetMarketDate, local_data_green: true },
      steps: {},
    },
    runtime: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
    },
    epoch: {
      run_id: 'r1',
      generated_at: '2026-04-17T20:10:00Z',
      target_market_date: targetMarketDate,
      pipeline_ok: true,
      modules: {},
      blocking_gaps: [],
    },
    recovery: {
      generated_at: '2026-04-17T20:15:00Z',
      target_market_date: targetMarketDate,
      next_step: 'dashboard_meta',
    },
    release: {
      run_id: 'r1',
      target_date: targetMarketDate,
      phase: 'VERIFY',
    },
    publish: { ok: true, steps: [] },
    runtimePreflight: {
      ok: true,
      generated_at: '2026-04-17T20:16:00Z',
      failure_reasons: [],
      diag_ok: true,
      canary_ok: true,
    },
    stockAnalyzerAudit: {
      summary: {
        full_universe: true,
        artifact_release_ready: true,
        artifact_critical_issue_count: 0,
        critical_failure_family_count: 0,
        live_endpoint_mode: 'full',
      },
    },
    uiFieldTruth: {
      target_market_date: targetMarketDate,
      summary: { ui_field_truth_ok: true },
    },
    launchd: { allowed_launchd_only: true },
    storage: { disk: { heavy_jobs_allowed: true }, nas: { reachable: true } },
    decisionBundle: {
      schema: 'rv.decision_bundle_latest.v1',
      status: 'DEGRADED',
      target_market_date: targetMarketDate,
      valid_until: `${targetMarketDate}T23:59:59Z`,
      warnings: [
        'eligible_wait_pipeline_incomplete',
        'risk_unknown',
        'strict_full_coverage_below_95pct',
      ],
      blocking_reasons: [],
      summary: {
        strict_full_coverage_ratio: 0.581766,
        strict_full_coverage_count: 5818,
        assets_expected_for_decision: 10000,
        assets_unclassified_missing: 0,
        eligible_wait_pipeline_incomplete_count: 2442,
        eligible_unknown_risk_count: 2442,
        buy_count: 0,
      },
    },
    heartbeat: { last_seen: '2026-04-17T20:55:00Z' },
    previousFinal: { generated_at: '2026-04-17T20:30:00Z' },
    requiredLeafFailed: false,
    now: new Date('2026-04-17T21:00:00Z'),
  });
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'eligible_wait_pipeline_incomplete'), false);
  assert.equal(seal.blocking_reasons.some((item) => item.id === 'risk_unknown'), false);
  assert.equal(seal.status, 'OK');
  assert.equal(seal.advisories.some((item) => item.id === 'eligible_wait_pipeline_incomplete'), true);
  assert.equal(seal.advisories.some((item) => item.id === 'risk_unknown'), true);
});
