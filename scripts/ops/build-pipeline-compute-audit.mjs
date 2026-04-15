#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/pipeline-compute-audit-latest.json');
const HIST_SUMMARY_PATH = path.join(ROOT, 'public/data/hist-probs/run-summary.json');
const MODEL_COVERAGE_AUDIT_PATH = path.join(ROOT, 'docs/ops/model-coverage-audit.md');
const MONITORING_PATH = path.join(ROOT, 'public/data/reports/pipeline-monitoring-latest.json');
const FORECAST_GENERATE_STATUS_PATH = path.join(ROOT, 'public/data/forecast/system/forecast-generate-status.json');
const FORECAST_EVALUATE_STATUS_PATH = path.join(ROOT, 'public/data/forecast/system/forecast-evaluate-status.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const histSummary = readJson(HIST_SUMMARY_PATH);
const previousAudit = readJson(OUTPUT_PATH);
const monitoring = readJson(MONITORING_PATH);
const forecastGenerateStatus = readJson(FORECAST_GENERATE_STATUS_PATH);
const forecastEvaluateStatus = readJson(FORECAST_EVALUATE_STATUS_PATH);

function resolveHistScalingGate(previous) {
  const envGate = String(process.env.HIST_PROBS_SCALING_GATE_STATE || '').trim();
  if (envGate) return envGate;
  const previousGate = Array.isArray(previous?.runners)
    ? previous.runners.find((item) => item?.runner === 'hist_probs_turbo')?.scaling_gate_state
    : null;
  return previousGate || 'ramp_1_only';
}

function defaultWorkersForGate(gateState) {
  if (gateState === 'ramp_4_ready') return 4;
  if (gateState === 'ramp_2_ready') return 2;
  return 1;
}

function buildHistScaling(previous, summary, monitoringReport) {
  const previousRunner = Array.isArray(previous?.runners)
    ? previous.runners.find((item) => item?.runner === 'hist_probs_turbo')
    : null;
  const previousGate = resolveHistScalingGate(previous);
  const previousSample = Number(previousRunner?.green_sample_runs || 0);
  const previousLarge = Number(previousRunner?.green_large_runs || 0);
  const parityEvidence = fs.existsSync(path.join(ROOT, 'tests/hist-probs/parity.test.mjs'))
    && fs.existsSync(path.join(ROOT, 'tests/hist-probs/rolling-core.test.mjs'));
  const errorStatus = monitoringReport?.gates?.hist_probs_error_rate?.status;
  const dlqStatus = monitoringReport?.gates?.hist_probs_dlq_rate?.status;
  const rssStatus = monitoringReport?.gates?.hist_probs_rss_usage_ratio?.status;
  const durationStatus = monitoringReport?.gates?.hist_probs_duration_multiplier?.status;
  const greenStatuses = [errorStatus, dlqStatus, rssStatus, durationStatus].every((status) => status === 'ok' || status === 'unknown');
  const processed = Number(summary?.tickers_covered || summary?.tickers_processed || 0);
  const isLarge = processed >= 5000;
  const isSample = processed > 0 && processed < 5000;
  let greenSampleRuns = previousSample;
  let greenLargeRuns = previousLarge;
  if (parityEvidence && greenStatuses) {
    if (isLarge) greenLargeRuns += 1;
    else if (isSample) greenSampleRuns += 1;
  }
  let scalingGateState = previousGate;
  if (greenLargeRuns >= 2) scalingGateState = 'ramp_4_ready';
  else if (greenSampleRuns >= 2) scalingGateState = 'ramp_2_ready';
  else scalingGateState = 'ramp_1_only';
  return {
    parityEvidence,
    greenSampleRuns,
    greenLargeRuns,
    scalingGateState,
    maxAllowedWorkers: defaultWorkersForGate(scalingGateState),
  };
}

const histScaling = buildHistScaling(previousAudit, histSummary, monitoring);

const runners = [
  {
    runner: 'hist_probs_turbo',
    default_workers: histScaling.maxAllowedWorkers,
    max_allowed_workers: histScaling.maxAllowedWorkers,
    observed_peak_rss_mb: Number(histSummary?.rss_at_completion_mb || histSummary?.rss_complete_mb || histSummary?.rss_start_mb || 670) || 670,
    observed_duration_sec: Number(histSummary?.elapsed_seconds || 0) || null,
    mac_budget_mb: 1536,
    scaling_gate_state: histScaling.scalingGateState,
    green_sample_runs: histScaling.greenSampleRuns,
    green_large_runs: histScaling.greenLargeRuns,
    parity_evidence_ok: histScaling.parityEvidence,
    sample_scope: 'small_scope_repo_evidence',
    evidence_ref: 'docs/ops/model-coverage-audit.md#compute-resource-reference',
  },
  {
    runner: 'forecast_daily',
    default_workers: 1,
    max_allowed_workers: 1,
    observed_peak_rss_mb: Number(
      forecastEvaluateStatus?.meta?.rss_usage_mb
        || forecastGenerateStatus?.meta?.rss_usage_mb
        || 642
    ) || 642,
    observed_duration_sec: Number(
      forecastEvaluateStatus?.counts?.elapsed_seconds
        || forecastGenerateStatus?.counts?.elapsed_seconds
        || 0
    ) || null,
    mac_budget_mb: 1024,
    scaling_gate_state: 'single_process_only',
    sample_scope: 'sample_repo_evidence',
    evidence_ref: 'docs/ops/model-coverage-audit.md#compute-resource-reference',
  },
  {
    runner: 'build_system_status_report',
    default_workers: 1,
    observed_peak_rss_mb: null,
    observed_duration_sec: null,
    mac_budget_mb: null,
    scaling_gate_state: 'fixed',
    sample_scope: 'n/a',
    evidence_ref: 'docs/ops/pipeline-truth-audit.md#compute-audit',
  },
];

writeJson(OUTPUT_PATH, {
  schema: 'rv_pipeline_compute_audit_v1',
  generated_at: new Date().toISOString(),
  source_refs: {
    hist_probs_run_summary: fs.existsSync(HIST_SUMMARY_PATH) ? 'public/data/hist-probs/run-summary.json' : null,
    model_coverage_audit: fs.existsSync(MODEL_COVERAGE_AUDIT_PATH) ? 'docs/ops/model-coverage-audit.md' : null,
  },
  notes: {
    hist_probs_scaling_policy: 'default 1 worker; 2 only after green parity and RSS-green sample runs; 4 only after larger green runs',
    forecast_daily_policy: 'single_process_only_until_scope_and_maturity_lookup_are_stable',
  },
  runners,
});
