#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  isModuleTargetCompatible,
  normalizeDate,
  resolveReleaseTargetMarketDate,
  validateControlPlaneConsistency,
} from './pipeline-artifact-contract.mjs';
import { normalizeQ1DeltaLatestSuccess } from '../lib/q1-delta-success.mjs';
import {
  PIPELINE_STEP_ORDER,
  SSOT_VIOLATION_CONTRACTS,
  STOCK_ANALYZER_WEB_VALIDATION_CHAIN,
  SYSTEM_STATUS_DOC_REF,
  SYSTEM_STATUS_RECOVERY_SCRIPT,
  SYSTEM_STATUS_STEP_CONTRACTS,
} from './system-status-ssot.mjs';
import {
  DATA_PLANE_DEFERRED_OBSERVER_STEP_IDS,
  isDataPlaneLane,
  parsePipelineLane,
  RELEASE_ONLY_STEP_IDS,
} from './pipeline-lanes.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const EVALUATION_LANE = parsePipelineLane(process.argv.slice(2));
const RELEASE_SCOPE_EVALUATED = !isDataPlaneLane(EVALUATION_LANE);
const QUANT_ROOT = process.env.QUANT_ROOT || (process.platform === 'linux'
  ? '/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab'
  : '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab');
const HIST_PROBS_PROFILE_INDEX = process.env.HIST_PROBS_PROFILE_INDEX
  ? path.resolve(process.env.HIST_PROBS_PROFILE_INDEX)
  : null;

const PATHS = {
  nightlyStatus: path.join(REPO_ROOT, 'public/data/reports/nightly-stock-analyzer-status.json'),
  recoveryReport: path.join(REPO_ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  releaseState: path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json'),
  forecast: path.join(REPO_ROOT, 'public/data/forecast/latest.json'),
  learning: path.join(REPO_ROOT, 'public/data/reports/learning-report-latest.json'),
  scientificSummary: path.join(REPO_ROOT, 'public/data/supermodules/scientific-summary.json'),
  quantlabDaily: path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json'),
  quantlabOperational: path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json'),
  histProbs: path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json'),
  histProbsSummary: path.join(REPO_ROOT, 'public/data/hist-probs/run-summary.json'),
  histProbsDeferred: path.join(REPO_ROOT, 'public/data/hist-probs/deferred-latest.json'),
  histProbsV2Latest: path.join(REPO_ROOT, 'public/data/reports/hist-probs-v2-latest.json'),
  histProbsV2Validation: path.join(REPO_ROOT, 'public/data/reports/hist-probs-v2-validation-latest.json'),
  stockAnalyzerAudit: path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  snapshot: path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json'),
  etfDiagnostic: path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json'),
  v1Audit: path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json'),
  stockUniverseSymbols: path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json'),
  stockUniverseSymbolsGlobal: path.join(REPO_ROOT, 'public/data/universe/v7/ssot/assets.global.symbols.json'),
  refreshReport: path.join(REPO_ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  apiLimitLock: path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json'),
  deltaLatestSuccess: path.join(QUANT_ROOT, 'ops/q1_daily_delta_ingest/latest_success.json'),
  cutoverReadinessDir: path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/reports'),
  dataFreshness: path.join(REPO_ROOT, 'public/data/reports/data-freshness-latest.json'),
  uiFieldTruth: path.join(REPO_ROOT, 'public/data/reports/ui-field-truth-report-latest.json'),
  runtimePreflight: path.join(REPO_ROOT, 'public/data/ops/runtime-preflight-latest.json'),
  runtimeReport: path.join(REPO_ROOT, 'public/data/pipeline/runtime/latest.json'),
  epochReport: path.join(REPO_ROOT, 'public/data/pipeline/epoch.json'),
  finalIntegritySeal: path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json'),
  deployBundleMeta: path.join(REPO_ROOT, 'dist/pages-prod/data/ops/build-bundle-meta.json'),
  deployProof: path.join(REPO_ROOT, 'public/data/ops/deploy-proof-latest.json'),
  histProbsAnchor: path.join(REPO_ROOT, 'public/data/hist-probs/AAPL.json'),
  output: path.join(REPO_ROOT, 'public/data/reports/system-status-latest.json'),
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function statMtimeIso(filePath) {
  try {
    return new Date(fs.statSync(filePath).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function ageHours(value) {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round(((Date.now() - ts) / 3600000) * 10) / 10);
}

function daysSince(value, relativeTo) {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  const ref = relativeTo ? new Date(relativeTo).getTime() : Date.now();
  if (!Number.isFinite(ref)) return null;
  return Math.max(0, Math.round((ref - ts) / 86400000));
}

function maxIsoDate(...values) {
  const normalized = values
    .map((value) => normalizeDate(value))
    .filter(Boolean)
    .sort();
  return normalized[normalized.length - 1] || null;
}

function tradingDaysBetween(olderDateId, newerDateId) {
  const older = olderDateId ? new Date(`${String(olderDateId).slice(0, 10)}T00:00:00Z`) : null;
  const newer = newerDateId ? new Date(`${String(newerDateId).slice(0, 10)}T00:00:00Z`) : null;
  if (!older || !newer || Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime()) || newer <= older) return 0;
  let count = 0;
  const cursor = new Date(older);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= newer) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function severityRank(value) {
  return { ok: 0, info: 0, warning: 1, critical: 2 }[value] ?? 0;
}

function fetchRemoteWorkflowHealth(repoSlug = 'RubikVault/rubikvault-site') {
  const CRITICAL_WORKFLOWS = [
    'monitor-prod.yml',
    'learning-daily.yml',
    'fundamentals-daily.yml',
    'universe-v7-daily.yml',
    'ops-daily.yml',
  ];
  try {
    const runs = {};
    for (const wf of CRITICAL_WORKFLOWS) {
      try {
        const out = execFileSync('gh', [
          'run', 'list',
          `--workflow=${wf}`,
          '--repo', repoSlug,
          '--limit=1',
          '--json=status,conclusion,headSha,createdAt,displayTitle',
        ], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const parsed = JSON.parse(out);
        runs[wf] = parsed[0] || null;
      } catch {
        runs[wf] = null;
      }
    }
    const anyFetched = Object.values(runs).some(r => r !== null);
    return { runs, proof_mode: anyFetched ? 'live_github_api' : 'remote_unavailable' };
  } catch {
    return { runs: {}, proof_mode: 'remote_unavailable' };
  }
}

function normalizeSeverity(status) {
  return ['ok', 'info', 'warning', 'critical'].includes(status) ? status : 'warning';
}

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function listJsonFiles(dirPath, { exclude = [] } = {}) {
  try {
    return fs.readdirSync(dirPath)
      .filter((name) => name.endsWith('.json') && !exclude.includes(name));
  } catch {
    return [];
  }
}

function readHistProbsProfileCount(indexPath) {
  if (!indexPath) return null;
  const doc = readJson(indexPath);
  if (!doc) return null;
  if (Number.isFinite(Number(doc.profile_file_count))) return Number(doc.profile_file_count);
  if (Array.isArray(doc.files)) return doc.files.length;
  return null;
}

function readUniverseCount(filePath) {
  const doc = readJson(filePath);
  if (!doc) return null;
  if (Number.isFinite(Number(doc.count))) return Number(doc.count);
  if (Array.isArray(doc.symbols)) return doc.symbols.length;
  if (Array.isArray(doc.canonical_ids)) return doc.canonical_ids.length;
  return null;
}

function sourceMeta(filePath, extra = {}) {
  return {
    path: filePath,
    exists: exists(filePath),
    generated_at: statMtimeIso(filePath),
    age_hours: ageHours(statMtimeIso(filePath)),
    ...extra,
  };
}

function listCutoverReports(dirPath) {
  try {
    return fs.readdirSync(dirPath)
      .filter((file) => /^cutover-readiness-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort()
      .map((file) => path.join(dirPath, file));
  } catch {
    return [];
  }
}

function flattenRefreshExecutions(autopilot) {
  const rows = [];
  for (const [mode, jobs] of Object.entries(autopilot?.jobs || {})) {
    for (const job of jobs || []) {
      const refresh = job?.refresh || null;
      if (!refresh?.steps) continue;
      for (const [stepName, step] of Object.entries(refresh.steps || {})) {
        rows.push({
          mode,
          job_dir: job.job_dir || null,
          refresh_status: refresh.status || null,
          refresh_finished_at: refresh.finished_at || job.updated_at || null,
          created_at: refresh.created_at || null,
          step_name: stepName,
          step_status: step?.status || null,
          started_at: step?.started_at || refresh.started_at || null,
          finished_at: step?.finished_at || refresh.finished_at || job.updated_at || null,
          returncode: step?.returncode ?? null,
          command: step?.command || null,
          error: step?.error || null,
          outputs: refresh.outputs || null,
        });
      }
    }
  }
  return rows.sort((a, b) => new Date(b.finished_at || 0).getTime() - new Date(a.finished_at || 0).getTime());
}

function latestStepExecution(autopilot, stepName) {
  return flattenRefreshExecutions(autopilot).find((row) => row.step_name === stepName) || null;
}

function latestRefreshExecution(autopilot) {
  const refreshes = [];
  for (const [mode, jobs] of Object.entries(autopilot?.jobs || {})) {
    for (const job of jobs || []) {
      if (!job?.refresh) continue;
      refreshes.push({
        mode,
        job_dir: job.job_dir || null,
        updated_at: job.updated_at || null,
        ...job.refresh,
      });
    }
  }
  return refreshes.sort((a, b) => new Date(b.finished_at || b.created_at || 0).getTime() - new Date(a.finished_at || a.created_at || 0).getTime())[0] || null;
}

function buildStep({
  id,
  label,
  owner,
  subsystem,
  severity,
  summary,
  why,
  next_fix,
  file_ref,
  generated_at = null,
  last_success_at = null,
  input_asof = null,
  output_asof = null,
  dependency_ids = [],
  blocked_by = [],
  status_detail = {},
}) {
  const contract = SYSTEM_STATUS_STEP_CONTRACTS[id] || {};
  return {
    id,
    label,
    owner,
    subsystem,
    severity: normalizeSeverity(severity),
    summary,
    why,
    next_fix,
    file_ref,
    generated_at,
    last_success_at,
    generated_age_hours: ageHours(generated_at),
    input_asof,
    output_asof,
    output_stale_days: daysSince(output_asof || last_success_at),
    dependency_ids,
    blocked_by,
    status_detail,
    runbook: {
      doc_ref: SYSTEM_STATUS_DOC_REF,
      recovery_script: SYSTEM_STATUS_RECOVERY_SCRIPT,
      run_command: contract.run_command || null,
      verify_commands: contract.verify_commands || [],
      outputs: contract.outputs || [],
      ui_surfaces: contract.ui_surfaces || [],
      failure_signals: contract.failure_signals || [],
      lessons_learned: contract.lessons_learned || null,
    },
  };
}

function buildRootCauseFromStep(step, category) {
  return {
    id: `${step.id}_${category}`,
    severity: step.severity,
    category,
    title: step.summary,
    why: step.why,
    impact: step.status_detail.impact || null,
    fix: step.next_fix,
    owner: step.owner,
    subsystem: step.subsystem,
    file_ref: step.file_ref,
    evidence_at: step.generated_at || step.last_success_at || null,
  };
}

function buildObservedArtifactStep({
  id,
  label,
  owner,
  subsystem,
  filePath,
  doc,
  severity,
  summary,
  why,
  nextFix,
  inputAsof = null,
  outputAsof = null,
  dependencyIds = [],
  blockedBy = [],
  statusDetail = {},
}) {
  return buildStep({
    id,
    label,
    owner,
    subsystem,
    severity,
    summary,
    why,
    next_fix: nextFix,
    file_ref: path.relative(REPO_ROOT, filePath),
    generated_at: doc?.generated_at || statMtimeIso(filePath),
    last_success_at: doc?.generated_at || statMtimeIso(filePath),
    input_asof: inputAsof,
    output_asof: outputAsof,
    dependency_ids: dependencyIds,
    blocked_by: blockedBy,
    status_detail: statusDetail,
  });
}

function buildDependencyEdges(stepsById, { lane = EVALUATION_LANE } = {}) {
  const systemStatusDependsOn = isDataPlaneLane(lane) ? [] : ['stock_analyzer_universe_audit'];
  return [
    { id: 'market_data_refresh', depends_on: [], reason: 'Provider-backed v7 history refresh is the first upstream market-data hop.' },
    { id: 'q1_delta_ingest', depends_on: ['market_data_refresh'], reason: 'Q1 delta ingest can only advance after v7 history refresh touches newer packs.' },
    { id: 'quantlab_daily_report', depends_on: ['q1_delta_ingest'], reason: 'QuantLab daily report reads raw-bar freshness from the Q1 ingest layer.' },
    { id: 'hist_probs', depends_on: ['q1_delta_ingest'], reason: 'Hist-probs/regime computation requires the same raw market bars to advance.' },
    { id: 'scientific_summary', depends_on: [], reason: 'Scientific summary is sourced from stock-analysis snapshots rather than QuantLab raw bars.' },
    { id: 'forecast_daily', depends_on: [], reason: 'Forecast batch is independent from QuantLab raw-bar freshness.' },
    { id: 'learning_daily', depends_on: ['forecast_daily', 'scientific_summary', 'snapshot', 'etf_diagnostic'], reason: 'Learning report aggregates forecast/scientific inputs plus the current best-setups snapshot and ETF diagnostic outputs it reads at runtime.' },
    { id: 'snapshot', depends_on: ['forecast_daily', 'quantlab_daily_report', 'hist_probs'], reason: 'Breakout/snapshot combines forecast freshness with QuantLab publish layers and fresh hist-probs coverage.' },
    { id: 'stock_analyzer_universe_audit', depends_on: ['market_data_refresh', 'q1_delta_ingest', 'hist_probs', 'forecast_daily', 'scientific_summary', 'snapshot'], reason: 'The universe-wide analyze-v4 audit is only trustworthy after the direct data/model inputs and snapshot layer are current.' },
    { id: 'etf_diagnostic', depends_on: ['snapshot'], reason: 'ETF diagnostic explains the current snapshot funnel output.' },
    { id: 'v1_audit', depends_on: ['learning_daily', 'snapshot'], reason: 'V1 audit requires current learning artifacts and snapshot outputs.' },
    { id: 'cutover_readiness', depends_on: ['v1_audit'], reason: 'Cutover readiness is evaluated after the V1 audit is available.' },
    { id: 'system_status_report', depends_on: systemStatusDependsOn, reason: isDataPlaneLane(lane) ? 'System status runs on the data-plane lane without release-only audit blockers.' : 'System status summarizes the current artifact/control-plane state after the direct audit artifacts exist.' },
    { id: 'data_freshness_report', depends_on: ['hist_probs', 'market_data_refresh'], reason: 'Freshness report derives expected market date and family health from upstream market/history artifacts.' },
    { id: 'pipeline_epoch', depends_on: ['system_status_report', 'data_freshness_report'], reason: 'Epoch is the coherence view across status and pipeline outputs for the same target date.' },
    { id: 'ui_field_truth_report', depends_on: ['pipeline_epoch'], reason: 'UI truth should run only after the artifact chain has a coherent target date.' },
    { id: 'final_integrity_seal', depends_on: ['ui_field_truth_report', 'pipeline_epoch'], reason: 'Final seal consumes the coherent epoch plus UI truth result.' },
    { id: 'build_deploy_bundle', depends_on: ['final_integrity_seal'], reason: 'Deploy bundle is only valid after the seal is ready.' },
    { id: 'wrangler_deploy', depends_on: ['build_deploy_bundle'], reason: 'Wrangler deploy is the final downstream publish step.' },
  ].map((edge) => {
    const blockedBy = edge.depends_on.filter((depId) => severityRank(stepsById[depId]?.severity) >= severityRank('critical'));
    const warningDeps = edge.depends_on.filter((depId) => severityRank(stepsById[depId]?.severity) === severityRank('warning'));
    return {
      ...edge,
      blocked_by: blockedBy,
      degraded_by: warningDeps.filter((depId) => !blockedBy.includes(depId)),
    };
  });
}

function buildAutomationSummary({ nightlyStatus, recoveryReport, releaseState, forecastLatest }) {
  const nightlyUpdatedAt = nightlyStatus?.updated_at || nightlyStatus?.heartbeat || statMtimeIso(PATHS.nightlyStatus);
  const recoveryGeneratedAt = recoveryReport?.generated_at || statMtimeIso(PATHS.recoveryReport);
  const releaseUpdatedAt = releaseState?.last_updated || statMtimeIso(PATHS.releaseState);
  const releasePhase = String(releaseState?.phase || '').toUpperCase() || null;
  const freshWindowMs = 36 * 60 * 60 * 1000;
  const isFreshAutomationArtifact = (value) => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) && Date.now() - t <= freshWindowMs;
  };
  const nightlyFresh = isFreshAutomationArtifact(nightlyUpdatedAt);
  const recoveryFresh = isFreshAutomationArtifact(recoveryGeneratedAt);
  const activeFailures = [];

  const nightlyFailed = nightlyStatus?.ok === false
    || (Array.isArray(nightlyStatus?.failedSteps) && nightlyStatus.failedSteps.length > 0);
  if (nightlyFailed && nightlyFresh) {
    activeFailures.push(
      nightlyStatus?.step
      || nightlyStatus?.failedSteps?.[0]
      || nightlyStatus?.lastError
      || 'nightly_stock_analyzer'
    );
  }

  const recoveryBlockingSeverity = String(
    recoveryReport?.dashboard_summary?.blocking_severity
    || recoveryReport?.dashboard_summary?.local_severity
    || recoveryReport?.dashboard_summary?.severity
    || 'ok'
  );
  const activeRecoverySteps = [
    ...((recoveryReport?.running_steps || []).map((item) => item?.id || item).filter(Boolean)),
    ...((recoveryReport?.blocked_steps || []).map((item) => item?.id || item).filter(Boolean)),
  ];
  const recoveryReady = activeRecoverySteps.length === 0
    && !recoveryReport?.next_step
    && severityRank(recoveryBlockingSeverity) < severityRank('critical');
  if (recoveryFresh && (recoveryReady === false || severityRank(recoveryBlockingSeverity) >= severityRank('critical'))) {
    activeFailures.push(recoveryReport?.next_step || 'dashboard_green_recovery');
  }

  const severity = activeFailures.length === 0
    ? 'ok'
    : activeFailures.length > 1 || severityRank(recoveryBlockingSeverity) >= severityRank('critical')
      ? 'critical'
      : 'warning';
  const summary = activeFailures.length === 0
    ? 'Nightly and recovery control-plane artifacts are operational.'
    : `Active automation blockers: ${activeFailures.join(', ')}.`;
  return {
    severity,
    summary,
    latest_refresh: {
      nightly_phase: nightlyStatus?.phase || null,
      nightly_step: nightlyStatus?.step || null,
      nightly_updated_at: nightlyUpdatedAt,
      recovery_next_step: recoveryReport?.next_step || null,
      recovery_generated_at: recoveryGeneratedAt,
      release_phase: releasePhase,
      release_updated_at: releaseUpdatedAt,
    },
    latest_forecast_run: {
      status: forecastLatest?.status || null,
      finished_at: forecastLatest?.generated_at || statMtimeIso(PATHS.forecast),
      returncode: null,
    },
    latest_forecast_backfill: null,
    recovered_steps: [],
    active_failures: activeFailures,
  };
}

function neutralizeStepForLane(step, {
  laneEvaluation = 'not_evaluated_on_lane',
  summary = null,
  why = null,
  nextFix = null,
} = {}) {
  return {
    ...step,
    severity: 'info',
    summary: summary || `${step.label} is not evaluated on ${EVALUATION_LANE}`,
    why: why || `${step.label} belongs to a different evaluation lane or runs later in the same lane and is non-blocking for this observer pass.`,
    next_fix: nextFix,
    blocked_by: [],
    lane_evaluation: laneEvaluation,
    non_blocking: true,
    status_detail: {
      ...(step.status_detail || {}),
      evaluation_lane: EVALUATION_LANE,
      release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
      lane_evaluation: laneEvaluation,
      non_blocking: true,
    },
  };
}

function main() {
  const nightlyStatus = readJson(PATHS.nightlyStatus);
  const recoveryReport = readJson(PATHS.recoveryReport);
  const releaseState = readJson(PATHS.releaseState);
  const finalIntegritySeal = readJson(PATHS.finalIntegritySeal);
  const forecastLatest = readJson(PATHS.forecast);
  const learning = readJson(PATHS.learning);
  const scientificSummary = readJson(PATHS.scientificSummary);
  const quantlabDaily = readJson(PATHS.quantlabDaily);
  const quantlabOperational = readJson(PATHS.quantlabOperational);
  const histProbs = readJson(PATHS.histProbs);
  const histProbsSummary = readJson(PATHS.histProbsSummary);
  const histProbsDeferred = readJson(PATHS.histProbsDeferred);
  const histProbsV2Latest = readJson(PATHS.histProbsV2Latest);
  const histProbsV2Validation = readJson(PATHS.histProbsV2Validation);
  const stockAnalyzerAudit = readJson(PATHS.stockAnalyzerAudit);
  const snapshot = readJson(PATHS.snapshot);
  const etfDiagnostic = readJson(PATHS.etfDiagnostic);
  const v1Audit = readJson(PATHS.v1Audit);
  const refreshReport = readJson(PATHS.refreshReport);
  const apiLimitLock = readJson(PATHS.apiLimitLock);
  const deltaLatestSuccessRaw = readJson(PATHS.deltaLatestSuccess);
  const deltaLatestSuccess = normalizeQ1DeltaLatestSuccess(deltaLatestSuccessRaw, { filePath: PATHS.deltaLatestSuccess });
  const cutoverReports = listCutoverReports(PATHS.cutoverReadinessDir);
  const cutoverReadiness = cutoverReports.length ? readJson(cutoverReports[cutoverReports.length - 1]) : null;
  const dataFreshness = readJson(PATHS.dataFreshness);
  const uiFieldTruth = readJson(PATHS.uiFieldTruth);
  const runtimePreflight = readJson(PATHS.runtimePreflight);
  const runtimeReport = readJson(PATHS.runtimeReport);
  const epochReport = readJson(PATHS.epochReport);
  const histProbsAnchor = readJson(PATHS.histProbsAnchor);
  const deployBundleMeta = readJson(PATHS.deployBundleMeta);
  const deployProof = readJson(PATHS.deployProof);
  const automation = buildAutomationSummary({ nightlyStatus, recoveryReport, releaseState, forecastLatest });
  const releaseTargetMarketDate = resolveReleaseTargetMarketDate(releaseState, {
    trackLegacyRead: true,
    readerId: 'scripts/ops/build-system-status-report.mjs',
  });

  const refreshSampleLastDate = (refreshReport?.fetched_assets_sample || [])
    .map((row) => row?.last_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const expectedOperationalTargetDate = [
    recoveryReport?.target_market_date,
    isDataPlaneLane(EVALUATION_LANE) ? null : finalIntegritySeal?.target_market_date,
    isDataPlaneLane(EVALUATION_LANE) ? null : releaseTargetMarketDate,
    refreshReport?.to_date,
    refreshSampleLastDate,
  ]
    .map((value) => normalizeDate(value))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .at(-1) || null;
  const refreshGeneratedAt = refreshReport?.generated_at || statMtimeIso(PATHS.refreshReport);
  const refreshStaleDays = daysSince(refreshSampleLastDate || refreshGeneratedAt);
  const refreshSeverity = refreshStaleDays == null ? 'warning' : refreshStaleDays > 7 ? 'critical' : refreshStaleDays > 3 ? 'warning' : 'ok';
  // Downgrade to warning when the API ran but returned zero data (pre-market timing or quota issue)
  const noDataFetched = refreshReport != null && (refreshReport?.assets_fetched_with_data === 0) && !refreshSampleLastDate;
  const refreshSeverityFinal = noDataFetched && refreshSeverity === 'ok' ? 'warning' : refreshSeverity;

  const steps = {};

  steps.market_data_refresh = buildStep({
    id: 'market_data_refresh',
    label: 'Market Data Refresh',
    owner: 'Market Data',
    subsystem: 'v7_history',
    severity: refreshSeverityFinal,
    summary: refreshSeverityFinal === 'critical' ? 'Market-data refresh is stale' : refreshSeverityFinal === 'warning' ? (noDataFetched ? 'Market-data refresh ran but fetched no data (pre-market or quota issue)' : 'Market-data refresh is aging') : 'Market-data refresh is current',
    why: apiLimitLock && refreshSeverityFinal !== 'ok'
      ? `Latest v7 history refresh report is ${refreshStaleDays}d old and the provider lock file still records ${apiLimitLock.reason}.`
      : noDataFetched
        ? `Refresh report generated at ${refreshGeneratedAt || 'unknown'} but assets_fetched_with_data=0 — API returned no data. Likely a pre-market run or provider quota issue. Re-run after market close or inspect provider auth.`
        : refreshReport
          ? `Latest v7 history refresh report was generated at ${refreshGeneratedAt || 'unknown'} with observed market data only up to ${refreshSampleLastDate || 'unknown'}.`
          : 'No v7 history refresh report was found.',
    next_fix: noDataFetched
      ? 'API ran but returned no data. Re-run after market close with: python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file "${RV_EODHD_ENV_FILE:-.env.local}" --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date <YYYY-MM-DD> --to-date <YYYY-MM-DD> --concurrency "${RV_MARKET_REFRESH_CONCURRENCY:-12}" --progress-every "${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"'
      : 'Run the provider-backed history refresh first; if it does not advance, inspect provider auth/quota and refresh report outputs before touching downstream jobs.',
    file_ref: 'scripts/quantlab/refresh_v7_history_from_eodhd.py',
    generated_at: refreshGeneratedAt,
    last_success_at: refreshGeneratedAt,
    input_asof: refreshReport?.from_date || null,
    output_asof: refreshSampleLastDate,
    status_detail: {
      assets_requested: refreshReport?.assets_requested ?? null,
      assets_fetched_with_data: refreshReport?.assets_fetched_with_data ?? null,
      fetch_errors_total: refreshReport?.fetch_errors_total ?? null,
      api_lock: apiLimitLock || null,
      impact: 'No newer market history can flow into delta ingest, QuantLab raw bars, hist-probs, or the snapshot dependency chain.',
    },
  });

  const deltaUpdatedAt = deltaLatestSuccess?.updated_at || statMtimeIso(PATHS.deltaLatestSuccess);
  const deltaIngestDate = normalizeDate(deltaLatestSuccess?.ingest_date || null);
  const deltaStaleDays = daysSince(deltaIngestDate || deltaUpdatedAt);
  const deltaStaleSeverity = deltaStaleDays == null ? 'warning' : deltaStaleDays > 7 ? 'critical' : deltaStaleDays > 3 ? 'warning' : 'ok';
  const deltaEvidenceComplete = deltaLatestSuccess?.evidence_complete === true;
  const deltaIsNoop = deltaLatestSuccess?.noop_no_changed_packs === true
    || (deltaEvidenceComplete && Number(deltaLatestSuccess?.selected_packs_total) === 0 && deltaStaleDays != null && deltaStaleDays <= 3);
  const refreshAsof = refreshReport?.to_date || null;
  const deltaUpstreamAdvanced = refreshAsof && deltaIngestDate && refreshAsof > deltaIngestDate;
  const deltaTargetMismatch = Boolean(
    expectedOperationalTargetDate
    && deltaIngestDate
    && !isModuleTargetCompatible('q1_delta_ingest', deltaIngestDate, expectedOperationalTargetDate),
  );
  const deltaNoop = deltaEvidenceComplete && deltaIsNoop && deltaUpstreamAdvanced;
  const deltaSeverity = !deltaLatestSuccess
    ? 'critical'
    : (!deltaEvidenceComplete || deltaTargetMismatch)
      ? 'critical'
      : (deltaNoop ? (deltaStaleSeverity === 'ok' ? 'warning' : deltaStaleSeverity) : deltaStaleSeverity);
  steps.q1_delta_ingest = buildStep({
    id: 'q1_delta_ingest',
    label: 'Q1 Delta Ingest',
    owner: 'QuantLab',
    subsystem: 'q1_delta',
    severity: deltaSeverity,
    summary: !deltaLatestSuccess
      ? 'Q1 delta ingest success artifact is missing'
      : !deltaEvidenceComplete
        ? 'Q1 delta ingest success artifact is incomplete'
        : deltaTargetMismatch
          ? 'Q1 delta ingest lags the active release target'
      : deltaNoop
      ? 'Q1 delta ingest ran as noop but upstream has advanced'
      : deltaSeverity === 'critical' ? 'Q1 delta ingest is stale'
      : deltaSeverity === 'warning' ? 'Q1 delta ingest has not advanced recently'
      : 'Q1 delta ingest is current',
    why: !deltaLatestSuccess
      ? 'No successful Q1 delta ingest artifact was found.'
      : !deltaEvidenceComplete
        ? `latest_success.json is incomplete: ingest_date=${deltaIngestDate || 'missing'}, selected_packs_total=${deltaLatestSuccess?.selected_packs_total ?? 'missing'}, noop_no_changed_packs=${typeof deltaLatestSuccess?.noop_no_changed_packs === 'boolean' ? deltaLatestSuccess.noop_no_changed_packs : 'missing'}, updated_at=${deltaUpdatedAt || 'missing'}.`
        : deltaTargetMismatch
          ? `Q1 delta ingest is anchored to ${deltaIngestDate} but the active target_market_date is ${expectedOperationalTargetDate}; the source layer is behind the release chain.`
      : deltaNoop
      ? `Q1 delta ingest ran as noop (selected_packs_total=${deltaLatestSuccess?.selected_packs_total ?? 0}, noop_no_changed_packs=${deltaLatestSuccess?.noop_no_changed_packs}) but market_data_refresh has advanced to ${refreshAsof} — ingest must re-run.`
      : deltaLatestSuccess
        ? `Latest successful Q1 delta ingest is anchored to ingest_date=${deltaIngestDate} and was updated at ${deltaUpdatedAt || 'unknown'}.`
        : 'No successful Q1 delta ingest artifact was found.',
    next_fix: 'Rerun the Q1 delta ingest against the active target_market_date, then verify latest_success.json records ingest_date, selected_packs_total, noop_no_changed_packs, and a downstream QuantLab rebuild before rebuilding snapshot/UI layers.',
    file_ref: 'scripts/quantlab/run_daily_delta_ingest_q1.py',
    generated_at: deltaUpdatedAt,
    last_success_at: deltaUpdatedAt,
    input_asof: deltaIngestDate || null,
    output_asof: deltaIngestDate || null,
    dependency_ids: ['market_data_refresh'],
    blocked_by: severityRank(steps.market_data_refresh?.severity) >= severityRank('critical') ? ['market_data_refresh'] : [],
    status_detail: {
      latest_success: deltaLatestSuccessRaw || null,
      normalized_latest_success: deltaLatestSuccess ? {
        updated_at: deltaLatestSuccess.updated_at,
        ingest_date: deltaLatestSuccess.ingest_date,
        selected_packs_total: deltaLatestSuccess.selected_packs_total,
        noop_no_changed_packs: deltaLatestSuccess.noop_no_changed_packs,
        evidence_complete: deltaLatestSuccess.evidence_complete,
        evidence_sources: deltaLatestSuccess.evidence_sources,
      } : null,
      expected_target_market_date: expectedOperationalTargetDate,
      ingest_date: deltaIngestDate,
      evidence_complete: deltaEvidenceComplete,
      target_mismatch: deltaTargetMismatch,
      noop_detected: deltaNoop,
      selected_packs_total: deltaLatestSuccess?.selected_packs_total ?? null,
      noop_no_changed_packs: deltaLatestSuccess?.noop_no_changed_packs ?? null,
      upstream_refresh_asof: refreshAsof,
      impact: !deltaEvidenceComplete || deltaTargetMismatch
        ? 'The q1_delta_ingest success pointer is not trustworthy enough to release. QuantLab, hist_probs, snapshot, and dashboard seals must treat this as a hard blocker.'
        : deltaNoop
        ? 'q1_delta_ingest ran silently as no-op. Downstream QuantLab, hist_probs, and snapshot continue reading stale partitions.'
        : 'QuantLab raw-bar freshness cannot advance until the delta ingest layer has incorporated newer market history.',
    },
  });

  const quantFreshness = quantlabOperational || quantlabDaily?.currentState?.dataFreshness || {};
  const quantRaw = quantFreshness?.rawBars || quantlabDaily?.currentState?.preflight?.rawFreshness || {};
  const quantFeature = quantFreshness?.featureStore || {};
  const quantPublish = quantFreshness?.stockPublish || {};
  const quantMarketAsof = quantRaw.latestAnyRequiredDataDate
    || quantRaw.latest_any_data_date
    || quantRaw.latestAnyRequiredIngestDate
    || quantRaw.latest_any_ingest_date
    || null;
  const quantPublishAsof = quantPublish.asOfDate
    || quantFeature.asOfDate
    || quantRaw.latestCanonicalRequiredDataDate
    || quantRaw.latest_required_data_date
    || quantRaw.latestCanonicalRequiredIngestDate
    || quantRaw.latest_required_ingest_date
    || null;
  const quantOutputAsof = quantFreshness?.summary?.severity === 'ok'
    ? (quantMarketAsof || quantPublishAsof)
    : (quantPublishAsof || quantMarketAsof);
  // Use "any/bridge" age (not canonical) — canonical is structurally lagged by the ML label window.
  // quantPublish.ageCalendarDays reflects the canonical cutoff, not operational freshness.
  const quantStaleDays = quantRaw.latestAnyAgeCalendarDays
    ?? quantRaw.latest_required_any_age_calendar_days
    ?? quantFeature.snapshotAgeCalendarDays   // 0 when snapshot ran today
    ?? quantPublish.ageCalendarDays
    ?? quantFeature.ageCalendarDays
    ?? quantRaw.latestCanonicalAgeCalendarDays
    ?? quantRaw.latest_required_age_calendar_days
    ?? daysSince(quantOutputAsof);
  const quantFreshnessSeverityRaw = ['ok', 'warning', 'critical'].includes(quantFreshness?.summary?.severity)
    ? quantFreshness.summary.severity : null;
  // reportFreshButDataStale=true means QuantLab ran fresh today but its canonical partition
  // is structurally lagged (label window). When canonicalShortfall ≤ 7 days, cap at 'warning'.
  const quantReportFresh = quantFreshness?.summary?.reportFreshButDataStale === true
    || quantFeature?.snapshotAgeCalendarDays === 0;
  const quantAnyFreshForTarget = expectedOperationalTargetDate && quantMarketAsof
    ? normalizeDate(quantMarketAsof) >= expectedOperationalTargetDate
    : (quantStaleDays != null && quantStaleDays <= 1);
  const quantStaleSeverity = quantAnyFreshForTarget
    ? 'ok'
    : quantFreshnessSeverityRaw != null
      ? (quantReportFresh && quantFreshnessSeverityRaw === 'critical' ? 'warning' : quantFreshnessSeverityRaw)
      : quantStaleDays == null
      ? 'warning'
      : quantStaleDays > 7
        ? 'critical'
        : quantStaleDays > 3
          ? 'warning'
          : 'ok';
  const quantCanonicalDate = quantRaw.latestCanonicalRequiredDataDate || quantRaw.latest_required_data_date || null;
  const quantAnyDate = quantRaw.latestAnyRequiredDataDate || quantRaw.latest_any_data_date || null;
  const quantCanonicalLag = (quantCanonicalDate && quantAnyDate) ? tradingDaysBetween(quantCanonicalDate, quantAnyDate) : null;
  // Canonical always lags any_data by ~20 trading days due to the forward-looking ML label window.
  // Escalate only when canonical falls BEYOND the expected structural window.
  const CANONICAL_LABEL_WINDOW = 30;
  const canonicalShortfall = quantCanonicalLag != null ? Math.max(0, quantCanonicalLag - CANONICAL_LABEL_WINDOW) : null;
  const quantCanonicalLagSeverity = canonicalShortfall == null ? 'ok'
    : canonicalShortfall > 14 ? 'critical'
    : canonicalShortfall > 7 ? 'warning'
    : 'ok';
  // Durable Fix: Prioritize operational freshness (raw Any) over structural lag (Canonical).
  // We only allow canonical lag to escalate to 'warning' if Any is 'ok'. 
  // If Any is also stale, then we keep the higher severity.
  const quantSeverity = (quantStaleSeverity === 'ok' && quantCanonicalLagSeverity === 'critical')
    ? 'warning'
    : (severityRank(quantCanonicalLagSeverity) > severityRank(quantStaleSeverity) 
        ? quantCanonicalLagSeverity 
        : quantStaleSeverity);
  steps.quantlab_daily_report = buildStep({
    id: 'quantlab_daily_report',
    label: 'QuantLab Daily Report',
    owner: 'QuantLab',
    subsystem: 'quantlab',
    severity: quantSeverity,
    summary: quantSeverity === 'critical' ? 'QuantLab data plane is critically stale' : quantSeverity === 'warning' ? 'QuantLab data plane is aging' : 'QuantLab data plane is current',
    why: `QuantLab market data as-of is ${quantMarketAsof || 'unknown'}; canonical label data is ${quantCanonicalDate || 'unknown'} with lag=${quantCanonicalLag ?? 'unknown'}T against the ${CANONICAL_LABEL_WINDOW}T structural label window.`,
    next_fix: 'Advance canonical raw part files first, then rebuild snapshot/feature-store/report so a fresh render timestamp cannot mask stale QuantLab data.',
    file_ref: 'scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    generated_at: quantlabDaily?.reportDate ? statMtimeIso(PATHS.quantlabDaily) : statMtimeIso(PATHS.quantlabDaily),
    last_success_at: quantlabDaily?.reportDate || statMtimeIso(PATHS.quantlabDaily),
    input_asof: quantRaw.latestCanonicalRequiredDataDate
      || quantRaw.latest_required_data_date
      || quantRaw.latestCanonicalRequiredIngestDate
      || quantRaw.latest_required_ingest_date
      || deltaLatestSuccess?.ingest_date
      || null,
    output_asof: quantOutputAsof,
    dependency_ids: ['q1_delta_ingest'],
    blocked_by: severityRank(steps.q1_delta_ingest?.severity) >= severityRank('critical') ? ['q1_delta_ingest'] : [],
    status_detail: {
      raw_freshness: quantRaw,
      feature_store_freshness: quantFeature,
      stock_publish_freshness: quantPublish,
      market_data_asof: quantMarketAsof,
      canonical_lag_days: quantCanonicalLag,
      canonical_lag_severity: quantCanonicalLagSeverity,
      operational_freshness: quantFreshness?.summary || null,
      overnight_stability: quantlabDaily?.currentState?.overnightStability || null,
      impact: canonicalShortfall != null && canonicalShortfall > 0
        ? `QuantLab canonical data is ${canonicalShortfall} trading days behind expected window (lag=${quantCanonicalLag}T vs ${CANONICAL_LABEL_WINDOW}T expected). Models may run on partially stale features.`
        : quantCanonicalLag != null
          ? `QuantLab canonical data is within expected label window (lag=${quantCanonicalLag}T ≤ ${CANONICAL_LABEL_WINDOW}T).`
          : 'QuantLab canonical freshness could not be determined.',
    },
  });

  const histFamily = dataFreshness?.families_by_id?.hist_probs || null;
  const histRegimeDate = normalizeDate(histProbsSummary?.regime_date || null);
  const histOutputAsof = maxIsoDate(histFamily?.data_asof, histRegimeDate, histProbs?.date || null);
  const expectedHistDate = normalizeDate(
    expectedOperationalTargetDate
    || histFamily?.expected_eod
    || recoveryReport?.target_market_date
    || releaseState?.target_market_date
    || releaseState?.target_date
    || quantOutputAsof
    || histOutputAsof
  );
  const histDeferredTarget = normalizeDate(histProbsDeferred?.target_market_date || null);
  const histDeferredActive = histProbsDeferred?.schema === 'rv.hist_probs.deferred.v1'
    && (!expectedHistDate || histDeferredTarget === expectedHistDate || histDeferredTarget >= expectedHistDate);
  const histAnchorDate = normalizeDate(histProbsAnchor?.latest_date || null);
  // Fallback: if scope registry lags (data not yet available for target date),
  // accept regime_date as proof that the run used the correct market regime.
  const histAnchorStale = expectedHistDate
    ? (!histAnchorDate || histAnchorDate < expectedHistDate)
      && (!histRegimeDate || histRegimeDate < expectedHistDate)
    : false;
  const histStaleDays = daysSince(histOutputAsof);
  const histProfileCount = histFamily
    ? Number(histFamily.fresh_count || 0) + Number(histFamily.stale_count || 0)
    : (
      readHistProbsProfileCount(HIST_PROBS_PROFILE_INDEX)
      ?? listJsonFiles(path.dirname(PATHS.histProbs), { exclude: ['regime-daily.json', 'run-summary.json'] }).length
    );
  const stockUniverseCount = histFamily
    ? Number(histFamily.fresh_count || 0) + Number(histFamily.stale_count || 0) + Number(histFamily.missing_count || 0)
    : (
      readUniverseCount(PATHS.stockUniverseSymbolsGlobal)
      ?? readUniverseCount(PATHS.stockUniverseSymbols)
    );
  const histArtifactCoverageRatio = stockUniverseCount && stockUniverseCount > 0
    ? Number(histFamily?.fresh_count ?? histProfileCount) / stockUniverseCount
    : null;
  const histArtifactFreshnessRatio = Number.isFinite(Number(histFamily?.artifact_freshness_ratio))
    ? Number(histFamily.artifact_freshness_ratio)
    : Number.isFinite(Number(histFamily?.artifact_coverage_ratio))
      ? Number(histFamily.artifact_coverage_ratio)
      : histArtifactCoverageRatio;
  const histMinCoverageRatio = Number.isFinite(Number(histFamily?.min_coverage_ratio))
    ? Number(histFamily.min_coverage_ratio)
    : Number.isFinite(Number(histProbsSummary?.min_coverage_ratio))
      ? Number(histProbsSummary.min_coverage_ratio)
      : 0.95;
  const histArtifactStale = histArtifactFreshnessRatio != null
    && Number.isFinite(histArtifactFreshnessRatio)
    && histArtifactFreshnessRatio < histMinCoverageRatio;
  const histWriteMode = String(histProbsSummary?.hist_probs_write_mode || histFamily?.hist_probs_write_mode || '').toLowerCase();
  const histWriteModeOk = histWriteMode === 'bucket_only';
  const histCoverageRatio = Number.isFinite(Number(histFamily?.coverage_ratio))
    ? Number(histFamily.coverage_ratio)
    : histArtifactCoverageRatio;
  const histRunRequestedFullUniverse = Number(histProbsSummary?.max_tickers || 0) === 0
    && ['registry', 'registry_asset_classes', 'us_eu_scope', 'global_scope'].includes(String(histProbsSummary?.source_mode || ''));
  const histRunTotal = Number(histProbsSummary?.tickers_total);
  const histRunCovered = Number(histProbsSummary?.tickers_covered);
  const histRunZeroCoverage = histRunRequestedFullUniverse
    && Number.isFinite(histRunTotal)
    && Number.isFinite(histRunCovered)
    && (histRunTotal === 0 || histRunCovered === 0);
  const histCoverageSeverity = histFamily?.severity
    || (histCoverageRatio == null
      ? 'warning'
      : histCoverageRatio < 0.25
        ? 'critical'
        : histCoverageRatio < 0.95
          ? 'warning'
          : 'ok');
  const histFreshnessSeverity = histFamily?.severity
    || (histStaleDays == null ? 'warning' : histStaleDays > 7 ? 'critical' : histStaleDays > 3 ? 'warning' : 'ok');
  const histSeverityBase = severityRank(histCoverageSeverity) > severityRank(histFreshnessSeverity)
    ? histCoverageSeverity
    : histFreshnessSeverity;
  const histSeverity = histRunZeroCoverage
    ? 'critical'
    : histDeferredActive
    ? 'critical'
    : histAnchorStale
    ? 'critical'
    : histArtifactStale
    ? 'critical'
    : !histWriteModeOk
    ? 'critical'
    : histSeverityBase;
  steps.hist_probs = buildStep({
    id: 'hist_probs',
    label: 'Historical Probabilities',
    owner: 'Hist Probs',
    subsystem: 'hist_probs',
    severity: histSeverity,
    summary: histRunZeroCoverage
      ? 'Historical probabilities reported zero covered tickers for the required universe'
      : histDeferredActive
        ? 'Historical probabilities are deferred for the target market date'
      : histAnchorStale
        ? 'Historical probabilities anchor is stale for the target market date'
      : histArtifactStale
        ? 'Historical probability artifacts are mostly stale'
      : !histWriteModeOk
        ? 'Historical probabilities write mode is not bucket_only'
      : histSeverity === 'critical' ? 'Historical probabilities are stale' : histSeverity === 'warning' ? 'Historical probabilities are aging' : 'Historical probabilities are current',
    why: histRunZeroCoverage
      ? `Latest full-universe hist_probs run reported tickers_total=${histRunTotal}, tickers_covered=${histRunCovered}, tickers_excluded_inactive=${histProbsSummary?.tickers_excluded_inactive ?? 'unknown'}, source_mode=${histProbsSummary?.source_mode || 'unknown'}. This is a false-green condition and must not be treated as current coverage.`
      : histDeferredActive
      ? `Latest hist_probs run deferred target ${histDeferredTarget || 'unknown'} with ${histProbsDeferred?.remaining_tickers ?? 'unknown'} remaining tickers above threshold ${histProbsDeferred?.threshold ?? 'unknown'}; last_good_regime_date=${histProbsDeferred?.last_good_regime_date || 'unknown'}. Deferred output blocks release.`
      : histAnchorStale
      ? `Anchor ticker AAPL is stale at latest_date=${histAnchorDate || 'missing'} while the expected market date is ${expectedHistDate}. Process completion without fresh anchor output is not a valid success state.`
      : histArtifactStale
      ? `Hist run-summary coverage is ${Math.round(Number(histFamily?.run_coverage_ratio ?? histCoverageRatio ?? 0) * 10000) / 100}%, but artifact freshness is only ${Math.round(Number(histArtifactFreshnessRatio || 0) * 10000) / 100}% against a ${Math.round(histMinCoverageRatio * 100)}% floor. Stale artifacts are release-blocking.`
      : !histWriteModeOk
      ? `Latest hist_probs run used hist_probs_write_mode=${histWriteMode || 'missing'}; production acceptance requires bucket_only to avoid flat+bucket duplication and stale artifact ambiguity.`
      : histFamily && histFamily.residual_counts_blocking === false
      ? `Latest full-universe hist_probs run coverage is ${Math.round(Number(histFamily.run_coverage_ratio ?? histCoverageRatio ?? 0) * 10000) / 100}% against a ${Math.round(Number(histFamily.min_coverage_ratio ?? 0.95) * 100)}% floor; residual artifact counts remain visible (${histFamily.residual_stale_count ?? histFamily.stale_count ?? 0} stale, ${histFamily.residual_missing_count ?? histFamily.missing_count ?? 0} missing) but are not release blockers.`
      : histFamily
      ? `Global STOCK+ETF+INDEX historical profile freshness is ${histFamily.fresh_count}/${stockUniverseCount || 'unknown'} fresh, ${histFamily.stale_count || 0} stale, ${histFamily.missing_count || 0} missing; latest run asset classes=${(histProbsSummary?.asset_classes || []).join(',') || 'unknown'}.`
      : histOutputAsof
        ? `Regime daily last market date is ${histOutputAsof}. Historical profile coverage is ${histProfileCount}/${stockUniverseCount || 'unknown'} stock files${histProbsSummary?.asset_classes ? `; latest run asset classes=${(histProbsSummary.asset_classes || []).join(',')}` : ''}.`
        : `No regime-daily market date is available. Historical profile coverage is ${histProfileCount}/${stockUniverseCount || 'unknown'} stock files.`,
    next_fix: 'Run the full historical-profile builder over the registry-backed stock+ETF universe, then verify run-summary coverage and regime date advance together.',
    file_ref: 'scripts/lib/hist-probs/run-hist-probs.mjs',
    generated_at: histProbs?.computed_at || statMtimeIso(PATHS.histProbs),
    last_success_at: histProbs?.computed_at || statMtimeIso(PATHS.histProbs),
    input_asof: quantOutputAsof,
    output_asof: histOutputAsof,
    dependency_ids: ['q1_delta_ingest'],
    blocked_by: severityRank(steps.q1_delta_ingest?.severity) >= severityRank('critical') ? ['q1_delta_ingest'] : [],
    status_detail: {
      market_regime: histProbs?.market_regime || null,
      breadth_regime: histProbs?.breadth_regime || null,
      run_summary: histProbsSummary || null,
      coverage: {
        profile_files: histProfileCount,
        stock_universe_count: stockUniverseCount,
        stock_coverage_ratio: histCoverageRatio,
        artifact_coverage_ratio: histFamily?.artifact_coverage_ratio ?? histArtifactCoverageRatio,
        artifact_freshness_ratio: histArtifactFreshnessRatio,
        artifact_stale_guard: histArtifactStale,
        min_coverage_ratio: histMinCoverageRatio,
        hist_probs_write_mode: histWriteMode || null,
        write_mode_ok: histWriteModeOk,
        run_coverage_ratio: histFamily?.run_coverage_ratio ?? histCoverageRatio,
        residual_counts_blocking: histFamily?.residual_counts_blocking ?? true,
        deferred: histDeferredActive,
        deferred_latest: histProbsDeferred || null,
        fresh_count: histFamily?.fresh_count ?? null,
        stale_count: histFamily?.stale_count ?? null,
        missing_count: histFamily?.missing_count ?? null,
        sample_tickers: histFamily?.sample_tickers || [],
        default_runner_limited: Number(histProbsSummary?.max_tickers || 0) > 0 || (histProbsSummary?.tickers_total || 0) <= 500,
        asset_classes: histProbsSummary?.asset_classes || ['STOCK'],
        zero_coverage_guard: histRunZeroCoverage,
        anchor_ticker: 'AAPL',
        anchor_latest_date: histAnchorDate,
        anchor_expected_date: expectedHistDate,
        anchor_stale_guard: histAnchorStale,
      },
      impact: histRunZeroCoverage
        ? 'The latest hist_probs run produced no covered tickers even though a full-universe run was requested. All downstream readiness checks must treat this as blocking.'
        : histFamily?.healthy
        ? 'Historical probability context is current for the required global STOCK+ETF+INDEX universe.'
        : 'Regime and passive probability context lags the market and should not be treated as current.',
    },
  });

  const v2Coverage = histProbsV2Latest?.coverage || null;
  const v2Performance = histProbsV2Latest?.performance || null;
  const v2TargetDate = normalizeDate(histProbsV2Latest?.target_market_date || null);
  const v2ExpectedMinAssets = Number(process.env.RV_HIST_PROBS_V2_MAX_ASSETS || 300);
  const v2Processed = Number(v2Coverage?.processed_assets || 0);
  const v2Predictions = Number(v2Coverage?.predictions || 0);
  const v2TimedOut = v2Performance?.timed_out === true;
  const v2ValidationOk = histProbsV2Validation?.status === 'ok';
  const v2FreshForTarget = expectedHistDate ? v2TargetDate === expectedHistDate : Boolean(v2TargetDate);
  const v2Ok = histProbsV2Latest?.status === 'ok'
    && v2FreshForTarget
    && v2Processed >= v2ExpectedMinAssets
    && v2Predictions > 0
    && !v2TimedOut
    && v2ValidationOk;
  steps.hist_probs_v2_shadow = buildStep({
    id: 'hist_probs_v2_shadow',
    label: 'Hist Probs v2 Shadow',
    owner: 'Hist Probs',
    subsystem: 'hist_probs',
    severity: v2Ok ? 'ok' : 'warning',
    summary: v2Ok ? 'Hist Probs v2 shadow is current' : 'Hist Probs v2 shadow is stale, failed, or incomplete',
    why: v2Ok
      ? `Shadow report target=${v2TargetDate}, processed=${v2Processed}, predictions=${v2Predictions}. It is diagnostic only.`
      : `Shadow report status=${histProbsV2Latest?.status || 'missing'}, target=${v2TargetDate || 'missing'}, expected=${expectedHistDate || 'unknown'}, processed=${v2Processed}/${v2ExpectedMinAssets}, predictions=${v2Predictions}, timed_out=${v2TimedOut}, validation=${histProbsV2Validation?.status || 'missing'}. This is non-blocking for release.`,
    next_fix: 'Run scripts/hist-probs-v2/run-daily-shadow-step.mjs after v1 hist-probs; keep it shadow-only until promotion gates pass.',
    file_ref: 'scripts/hist-probs-v2/run-daily-shadow-step.mjs',
    generated_at: histProbsV2Latest?.generated_at || null,
    last_success_at: histProbsV2Latest?.status === 'ok' ? histProbsV2Latest.generated_at : null,
    input_asof: expectedHistDate,
    output_asof: v2TargetDate,
    dependency_ids: ['hist_probs'],
    blocked_by: [],
    status_detail: {
      non_blocking: true,
      source: 'shadow_only',
      default_hist_probs_source: 'v1_primary',
      latest: histProbsV2Latest || null,
      validation: histProbsV2Validation || null,
      expected_min_assets: v2ExpectedMinAssets,
      no_buy_mutation_required: true,
    },
  });

  const forecastExec = automation.latest_forecast_run || null;
  const forecastOutputAsof = normalizeDate(forecastLatest?.data?.asof || forecastLatest?.freshness || null);
  const forecastFreshForTarget = expectedOperationalTargetDate
    ? forecastOutputAsof === expectedOperationalTargetDate
    : Boolean(forecastOutputAsof);
  const forecastArtifactOk = forecastLatest?.ok === true && forecastFreshForTarget;
  const forecastSeverity = forecastArtifactOk ? 'ok' : 'critical';
  steps.forecast_daily = buildStep({
    id: 'forecast_daily',
    label: 'Forecast Daily',
    owner: 'Forecast',
    subsystem: 'forecast',
    severity: forecastSeverity,
    summary: forecastArtifactOk ? 'Forecast daily batch is healthy' : 'Forecast daily batch is failing',
    why: forecastArtifactOk
      ? `Forecast latest artifact was generated at ${forecastLatest.generated_at || 'unknown'} with as-of ${forecastOutputAsof || 'unknown'}.`
      : `Forecast latest artifact is missing, unhealthy, or not aligned to target ${expectedOperationalTargetDate || 'unknown'}; latest execution status is ${forecastExec?.status || 'unknown'}.`,
    next_fix: 'Use scripts/forecast/run_daily.mjs as the primary batch health check and treat engine-level files as implementation detail unless run_daily fails.',
    file_ref: 'scripts/forecast/run_daily.mjs',
    generated_at: forecastLatest?.generated_at || statMtimeIso(PATHS.forecast),
    last_success_at: forecastExec?.status === 'completed' ? forecastExec.finished_at : forecastLatest?.generated_at || statMtimeIso(PATHS.forecast),
    input_asof: null,
    output_asof: forecastOutputAsof,
    status_detail: {
      latest_execution: forecastExec || null,
      automation: automation,
      impact: 'Forecast freshness drives learning and the snapshot stack, but current forecast artifacts are healthy.',
    },
  });

  const learningScientific = learning?.features?.scientific || null;
  const scientificSourceMeta = scientificSummary?.source_meta || learningScientific?.source_meta || null;
  const scientificStaleDays = Number.isFinite(Number(scientificSourceMeta?.stale_days))
    ? Number(scientificSourceMeta.stale_days)
    : null;
  const scientificSeverity = scientificStaleDays != null
    ? (scientificStaleDays > 7 ? 'critical' : (scientificStaleDays > 3 ? 'warning' : 'ok'))
    : scientificSourceMeta?.asof
      ? 'ok'
      : 'warning';
  steps.scientific_summary = buildStep({
    id: 'scientific_summary',
    label: 'Scientific Summary',
    owner: 'Scientific',
    subsystem: 'scientific',
    severity: scientificSeverity,
    summary: scientificStaleDays > 7
      ? 'Scientific source is stale'
      : scientificStaleDays > 3
        ? 'Scientific source is aging'
        : scientificSourceMeta?.asof
          ? 'Scientific source is current'
          : 'Scientific source timestamp is missing',
    why: scientificSourceMeta?.asof
      ? `Scientific source_meta as-of is ${scientificSourceMeta.asof}.`
      : 'Scientific source has no current as-of timestamp.',
    next_fix: 'Refresh the scientific summary and verify the upstream source emits a current timestamp before the daily learning batch runs.',
    file_ref: 'scripts/build-scientific-summary.mjs',
    generated_at: learning?.date ? statMtimeIso(PATHS.learning) : statMtimeIso(PATHS.scientificSummary),
    last_success_at: statMtimeIso(PATHS.scientificSummary),
    input_asof: null,
    output_asof: scientificSourceMeta?.asof || null,
    status_detail: {
      learning_feature: learningScientific || null,
      source_meta: scientificSourceMeta,
      scientific_summary: sourceMeta(PATHS.scientificSummary),
      impact: 'Scientific rows remain available, but they are not current enough to be treated as live input.',
    },
  });

  steps.learning_daily = buildStep({
    id: 'learning_daily',
    label: 'Daily Learning Report',
    owner: 'Learning',
    subsystem: 'learning',
    severity: learning?.summary?.overall_status ? 'ok' : 'warning',
    summary: learning?.summary?.overall_status ? 'Learning report is available' : 'Learning report is missing or incomplete',
    why: learning?.summary?.overall_status
      ? `Learning report generated ${statMtimeIso(PATHS.learning) || 'unknown'} with status ${learning.summary.overall_status}.`
      : 'No daily learning report is available.',
    next_fix: 'Regenerate the daily learning report after forecast/scientific artifacts are current enough to support it.',
    file_ref: 'scripts/learning/run-daily-learning-cycle.mjs',
    generated_at: statMtimeIso(PATHS.learning),
    last_success_at: statMtimeIso(PATHS.learning),
    input_asof: forecastLatest?.data?.asof || null,
    output_asof: learning?.date || null,
    dependency_ids: ['forecast_daily', 'scientific_summary'],
    blocked_by: [],
    status_detail: {
      learning_status: learning?.summary?.overall_status || null,
      stock_analyzer: learning?.features?.stock_analyzer || null,
      impact: 'The learning report drives readiness and audit interpretation across the dashboard.',
    },
  });

  const snapshotMeta = snapshot?.meta || {};
  const snapshotOutputAsof = snapshotMeta.data_asof || snapshotMeta.forecast_asof || null;
  const snapshotStaleDays = daysSince(snapshotOutputAsof);
  const snapshotStaleSeverity = snapshotStaleDays == null ? 'warning' : snapshotStaleDays > 3 ? 'warning' : 'ok';
  const snapshotUpstreamSeverity = [quantSeverity, forecastSeverity].reduce(
    (worst, s) => severityRank(s) > severityRank(worst) ? s : worst, 'ok'
  );
  const snapshotSeverity = severityRank(snapshotUpstreamSeverity) > severityRank(snapshotStaleSeverity)
    ? snapshotUpstreamSeverity : snapshotStaleSeverity;
  steps.snapshot = buildStep({
    id: 'snapshot',
    label: 'Best Setups Snapshot',
    owner: 'Snapshot',
    subsystem: 'breakout_v2',
    severity: snapshotSeverity,
    summary: snapshotUpstreamSeverity !== 'ok'
      ? `Snapshot inherits upstream severity=${snapshotUpstreamSeverity} from QuantLab/Forecast inputs`
      : snapshotSeverity === 'warning' ? 'Snapshot is current but depends on degraded upstream inputs' : 'Snapshot output is current',
    why: `Snapshot data_asof=${snapshotOutputAsof || 'unknown'}, quantlab_asof=${snapshotMeta.quantlab_asof || 'unknown'}, rows_emitted=${snapshotMeta.rows_emitted?.total ?? 0}.`,
    next_fix: 'Keep snapshot generation tied to explicit upstream freshness checks so QuantLab staleness cannot hide behind a fresh render timestamp.',
    file_ref: 'scripts/build-best-setups-v4.mjs',
    generated_at: snapshotMeta.generated_at || statMtimeIso(PATHS.snapshot),
    last_success_at: snapshotMeta.generated_at || statMtimeIso(PATHS.snapshot),
    input_asof: snapshotMeta.quantlab_asof || null,
    output_asof: snapshotOutputAsof,
    dependency_ids: ['forecast_daily', 'quantlab_daily_report'],
    blocked_by: [],
    status_detail: {
      snapshot_meta: snapshotMeta,
      upstream_quantlab_severity: quantSeverity,
      upstream_forecast_severity: forecastSeverity,
      upstream_severity_inherited: snapshotUpstreamSeverity,
      impact: snapshotUpstreamSeverity !== 'ok'
        ? `Snapshot was computed on inputs with severity=${snapshotUpstreamSeverity}. Consumers are reading derived stale data.`
        : 'Snapshot rows currently render, but part of the dependency chain still lags.',
    },
  });

  const stockAuditSummary = stockAnalyzerAudit?.summary || null;
  const stockAuditFamilies = Array.isArray(stockAnalyzerAudit?.failure_families) ? stockAnalyzerAudit.failure_families : [];
  const stockAuditCriticalFamilies = stockAuditFamilies.filter((family) => String(family?.severity || '').toLowerCase() === 'critical');
  const stockAuditWarningFamilies = stockAuditFamilies.filter((family) => String(family?.severity || '').toLowerCase() === 'warning');
  const stockAuditSmokeMode = String(stockAnalyzerAudit?.run?.source_mode || '').toLowerCase().includes('smoke')
    || String(stockAuditSummary?.live_endpoint_mode || '').toLowerCase() === 'sampled_smoke';
  // Use release_eligible as the severity gate — live canary critical families are
  // not artifact-blocking and should not prevent local_data_green.
  const stockAuditReleaseEligible = stockAuditSummary?.release_eligible === true;
  const stockAuditSeverity = !stockAnalyzerAudit
    ? 'warning'
    : !stockAuditSummary?.full_universe
      ? 'warning'
      : !stockAuditReleaseEligible
        ? (stockAuditSmokeMode ? 'warning' : 'critical')
        : stockAuditWarningFamilies.length > 0
          ? 'warning'
          : 'ok';
  const stockAuditProcessed = Number(stockAnalyzerAudit?.run?.processed_assets || stockAuditSummary?.processed_assets || 0);
  const stockAuditTotal = Number(stockAnalyzerAudit?.run?.total_universe_assets || stockAuditSummary?.total_assets || 0);
  const stockAuditFullUniverse = Boolean(stockAuditSummary?.full_universe);
  steps.stock_analyzer_universe_audit = buildStep({
    id: 'stock_analyzer_universe_audit',
    label: 'Stock Analyzer Universe Audit',
    owner: 'Stock Analyzer',
    subsystem: 'ui_contract',
    severity: stockAuditSeverity,
    summary: !stockAnalyzerAudit
      ? 'Stock Analyzer universe audit artifact is missing'
      : !stockAuditFullUniverse
        ? 'Stock Analyzer universe audit has not yet covered the full stock+ETF universe'
        : stockAuditSeverity === 'ok'
          ? (stockAuditWarningFamilies.length
              ? 'Stock Analyzer universe audit has no critical failures'
              : 'Stock Analyzer universe audit is green')
          : stockAuditSmokeMode
            ? 'Stock Analyzer sampled smoke audit found issues'
            : 'Stock Analyzer universe audit found critical field-level failures',
    why: !stockAnalyzerAudit
      ? 'No stock-analyzer-universe-audit artifact was found, so dashboard_v7 cannot prove all analyze-v4 fields are valid across the universe.'
      : `Latest audit processed ${stockAuditProcessed}/${stockAuditTotal || 'unknown'} assets and found ${stockAuditFamilies.length} failure families (${stockAuditCriticalFamilies.length} critical, ${stockAuditWarningFamilies.length} warning) affecting ${stockAuditSummary?.affected_assets || 0} assets.${stockAuditSmokeMode ? ' This run used sampled smoke mode, so failures remain advisory until a full contract audit confirms them.' : ''}`,
    next_fix: !stockAnalyzerAudit || !stockAuditFullUniverse
      ? 'Run the full stock-analyzer universe audit over STOCK+ETF and then regenerate the dashboard status artifacts.'
      : (stockAnalyzerAudit?.ordered_recovery?.[0]?.run_command || 'Inspect the leading failure family in the audit artifact and execute the listed recovery steps in order.'),
    file_ref: 'scripts/ops/build-stock-analyzer-universe-audit.mjs',
    generated_at: stockAnalyzerAudit?.generated_at || statMtimeIso(PATHS.stockAnalyzerAudit),
    last_success_at: stockAnalyzerAudit?.generated_at || statMtimeIso(PATHS.stockAnalyzerAudit),
    input_asof: null,
    output_asof: stockAnalyzerAudit?.generated_at || null,
    dependency_ids: ['market_data_refresh', 'q1_delta_ingest', 'hist_probs', 'forecast_daily', 'scientific_summary', 'snapshot'],
    blocked_by: [],
    status_detail: {
      audit_summary: stockAuditSummary,
      ordered_recovery: stockAnalyzerAudit?.ordered_recovery || [],
      failure_families: stockAuditFamilies,
      critical_failure_families: stockAuditCriticalFamilies,
      warning_failure_families: stockAuditWarningFamilies,
      impact: 'This is the only universe-wide proof that analyze-v4 renders all required UI contracts correctly across stocks and ETFs.',
    },
  });

  const etfSnapshotTotal = etfDiagnostic?.stage_counts?.snapshot_etf_total ?? 0;
  const etfDiagSeverity = etfSnapshotTotal === 0 ? 'critical' : 'ok';
  steps.etf_diagnostic = buildStep({
    id: 'etf_diagnostic',
    label: 'ETF Diagnostic',
    owner: 'Snapshot',
    subsystem: 'etf_diagnostic',
    severity: etfDiagSeverity,
    summary: etfDiagSeverity === 'critical' ? 'ETF diagnostic still reports an empty final stage' : 'ETF diagnostic is healthy',
    why: etfDiagnostic?.diagnosis?.explanation || 'ETF diagnostic artifact missing.',
    next_fix: 'If ETF snapshot output drops to zero again, inspect diagnostic rejection breakdown before changing gates.',
    file_ref: 'scripts/learning/diagnose-best-setups-etf-drop.mjs',
    generated_at: etfDiagnostic?.generated_at || statMtimeIso(PATHS.etfDiagnostic),
    last_success_at: etfDiagnostic?.generated_at || statMtimeIso(PATHS.etfDiagnostic),
    input_asof: snapshotOutputAsof,
    output_asof: snapshotOutputAsof,
    dependency_ids: ['snapshot'],
    blocked_by: etfSnapshotTotal === 0 ? ['snapshot'] : [],
    status_detail: {
      diagnosis: etfDiagnostic?.diagnosis || null,
      stage_counts: etfDiagnostic?.stage_counts || null,
      impact: 'ETF diagnostic validates whether the current snapshot funnel is emitting final ETF rows.',
    },
  });

  steps.v1_audit = buildStep({
    id: 'v1_audit',
    label: 'V1 Audit',
    owner: 'V1',
    subsystem: 'v1_audit',
    severity: (v1Audit?.signals_today || 0) > 0 ? 'ok' : 'warning',
    summary: (v1Audit?.signals_today || 0) > 0 ? 'V1 audit is populated' : 'V1 audit has no current signals',
    why: `signals_today=${v1Audit?.signals_today ?? 0}, matured_signals=${v1Audit?.matured_signals ?? 0}, hit_rate=${v1Audit?.hit_rate_matured ?? 'n/a'}.`,
    next_fix: 'Keep the audit path wired to current snapshot and learning artifacts so readiness decisions stay evidence-backed.',
    file_ref: 'scripts/learning/quantlab-v1/daily-audit-report.mjs',
    generated_at: v1Audit?.timestamp || statMtimeIso(PATHS.v1Audit),
    last_success_at: v1Audit?.timestamp || statMtimeIso(PATHS.v1Audit),
    input_asof: learning?.date || null,
    output_asof: v1Audit?.date || null,
    dependency_ids: ['learning_daily', 'snapshot'],
    blocked_by: [],
    status_detail: {
      audit_report: v1Audit || null,
      impact: 'V1 audit supports cutover decisions and evidence-quality reporting.',
    },
  });

  steps.cutover_readiness = buildStep({
    id: 'cutover_readiness',
    label: 'Cutover Readiness',
    owner: 'V1',
    subsystem: 'cutover',
    severity: cutoverReadiness?.readiness?.cutover_recommended ? 'ok' : 'warning',
    summary: cutoverReadiness?.readiness?.cutover_recommended ? 'Cutover is recommended' : 'Cutover remains blocked',
    why: cutoverReadiness
      ? `Current mode=${cutoverReadiness.current_mode}, failed criteria=${Object.keys(cutoverReadiness.readiness?.criteria_failed || {}).join(', ') || 'none'}.`
      : 'No cutover readiness report was found.',
    next_fix: 'Do not override governance. Improve readiness by reducing fallback usage and clearing upstream freshness blockers.',
    file_ref: 'scripts/learning/quantlab-v1/cutover-readiness-report.mjs',
    generated_at: cutoverReadiness?.timestamp || (cutoverReports.length ? statMtimeIso(cutoverReports[cutoverReports.length - 1]) : null),
    last_success_at: cutoverReadiness?.timestamp || (cutoverReports.length ? statMtimeIso(cutoverReports[cutoverReports.length - 1]) : null),
    input_asof: v1Audit?.date || null,
    output_asof: cutoverReadiness?.date || null,
    dependency_ids: ['v1_audit'],
    blocked_by: cutoverReadiness?.readiness?.cutover_recommended ? [] : ['v1_audit'],
    status_detail: {
      cutover_report: cutoverReadiness || null,
      impact: 'Cutover should remain blocked until fallback-rate and readiness criteria are genuinely satisfied.',
    },
  });

  steps.system_status_report = buildObservedArtifactStep({
    id: 'system_status_report',
    label: 'System Status Report',
    owner: 'Ops',
    subsystem: 'system_status',
    filePath: PATHS.output,
    doc: readJson(PATHS.output),
    severity: 'ok',
    summary: 'System status report artifact generated',
    why: 'This report itself is the observer summary layer for the active control plane.',
    nextFix: 'Rebuild the status report after upstream artifacts are refreshed.',
    inputAsof: stockAnalyzerAudit?.generated_at || null,
    outputAsof: expectedOperationalTargetDate || null,
    dependencyIds: isDataPlaneLane(EVALUATION_LANE) ? [] : ['stock_analyzer_universe_audit'],
    statusDetail: {
      target_market_date: expectedOperationalTargetDate || null,
    },
  });

  const fundamentalsScopeFamily = dataFreshness?.families_by_id?.fundamentals_scope || null;
  steps.data_freshness_report = buildObservedArtifactStep({
    id: 'data_freshness_report',
    label: 'Data Freshness Report',
    owner: 'Ops',
    subsystem: 'freshness',
    filePath: PATHS.dataFreshness,
    doc: dataFreshness,
    severity: String(dataFreshness?.summary?.severity || 'warning'),
    summary: dataFreshness?.summary?.healthy ? 'Data freshness report is healthy' : 'Data freshness report shows stale families',
    why: fundamentalsScopeFamily
      ? `Prioritized fundamentals scope: fresh=${fundamentalsScopeFamily.fresh_count ?? 0}, stale=${fundamentalsScopeFamily.stale_count ?? 0}, missing=${fundamentalsScopeFamily.missing_count ?? 0}.`
      : 'No freshness summary was found.',
    nextFix: 'Rebuild the freshness report after upstream market, hist-probs, and fundamentals artifacts are current.',
    inputAsof: expectedOperationalTargetDate,
    outputAsof: dataFreshness?.summary?.expected_eod || null,
    dependencyIds: ['hist_probs', 'market_data_refresh'],
    blockedBy: [],
    statusDetail: {
      unhealthy_families: dataFreshness?.summary?.unhealthy_families || [],
      fundamentals_scope: fundamentalsScopeFamily || null,
    },
  });

  const epochNullModules = Object.entries(epochReport?.modules || {})
    .filter(([, module]) => !String(module?.run_id || '').trim())
    .map(([id]) => id);
  const epochSeverity = epochReport?.pipeline_ok === false || epochNullModules.length > 0 ? 'critical' : 'ok';
  steps.pipeline_epoch = buildObservedArtifactStep({
    id: 'pipeline_epoch',
    label: 'Pipeline Epoch',
    owner: 'Ops',
    subsystem: 'epoch',
    filePath: PATHS.epochReport,
    doc: epochReport,
    severity: epochSeverity,
    summary: epochSeverity === 'ok' ? 'Pipeline epoch is coherent' : 'Pipeline epoch is incoherent',
    why: epochNullModules.length > 0
      ? `Module run_id missing for: ${epochNullModules.join(', ')}.`
      : (epochReport?.blocking_gaps?.length ? `Blocking gaps: ${epochReport.blocking_gaps.map((gap) => gap.id).join(', ')}.` : 'Epoch pipeline is coherent.'),
    nextFix: 'Rebuild epoch only after system status/runtime artifacts share the same target market date and module run IDs are populated.',
    inputAsof: dataFreshness?.summary?.expected_eod || null,
    outputAsof: epochReport?.target_market_date || null,
    dependencyIds: ['system_status_report', 'data_freshness_report'],
    statusDetail: {
      blocking_gaps: epochReport?.blocking_gaps || [],
      null_run_id_modules: epochNullModules,
    },
  });

  const runtimePreflightOk = runtimePreflight?.ok === true;
  const runtimePreflightSeverity = !runtimePreflight
    ? 'warning'
    : runtimePreflightOk
      ? 'ok'
      : 'warning';
  steps.runtime_preflight = buildObservedArtifactStep({
    id: 'runtime_preflight',
    label: 'Runtime Preflight',
    owner: 'Ops',
    subsystem: 'runtime',
    filePath: PATHS.runtimePreflight,
    doc: runtimePreflight,
    severity: runtimePreflightSeverity,
    summary: !runtimePreflight
      ? 'Runtime preflight artifact is missing'
      : runtimePreflightOk
        ? 'Runtime preflight passed'
        : 'Runtime preflight failed (operator/local-runtime only)',
    why: runtimePreflight
      ? `node_ok=${runtimePreflight.node_ok === true}, wrangler_ok=${runtimePreflight.wrangler_ok === true}, diag_ok=${runtimePreflight.diag_ok === true}, canary_ok=${runtimePreflight.canary_ok === true}.`
      : 'No runtime preflight artifact was found.',
    nextFix: 'Use filesystem candidate smoke plus preview/production deploy smokes for release; rerun local runtime gates manually only when needed.',
    inputAsof: epochReport?.target_market_date || null,
    outputAsof: runtimePreflight?.generated_at || null,
    dependencyIds: ['pipeline_epoch'],
    statusDetail: runtimePreflight || null,
  });

  const uiFieldTruthSummary = uiFieldTruth?.summary || {};
  const uiFieldTruthOk = (uiFieldTruthSummary.ui_field_truth_ok ?? uiFieldTruth?.ui_field_truth_ok) === true;
  const uiFieldGateMode = uiFieldTruth?.gate_mode || 'legacy';
  const uiTruthChecked = uiFieldTruthSummary.checked_canaries ?? uiFieldTruthSummary.tickers_checked ?? 0;
  const uiTruthFailures = uiFieldTruthSummary.failed_checks ?? uiFieldTruthSummary.failures ?? 0;
  const uiTruthAdvisories = uiFieldTruthSummary.optional_advisory_count ?? uiFieldTruthSummary.advisories ?? 0;
  const uiFieldTruthSeverity = uiFieldTruthOk ? 'ok' : (uiFieldGateMode === 'local_runtime_smoke' || uiFieldGateMode === 'legacy' ? 'warning' : 'critical');
  steps.ui_field_truth_report = buildObservedArtifactStep({
    id: 'ui_field_truth_report',
    label: 'UI Field Truth Report',
    owner: 'Frontend/API',
    subsystem: 'ui_truth',
    filePath: PATHS.uiFieldTruth,
    doc: uiFieldTruth,
    severity: uiFieldTruthSeverity,
    summary: uiFieldTruthOk ? 'UI field truth checks passed' : 'UI field truth checks failed',
    why: uiFieldTruth?.summary
      ? `Checked=${uiTruthChecked}, failures=${uiTruthFailures}, advisories=${uiTruthAdvisories}.`
      : 'UI field truth artifact missing.',
    nextFix: uiFieldGateMode === 'filesystem_candidate_smoke'
      ? 'Fix page-core candidate smoke, then rebuild the UI field truth report.'
      : 'Local runtime smoke is advisory in NAS release; run filesystem candidate smoke and preview deploy smoke for release.',
    inputAsof: epochReport?.target_market_date || null,
    outputAsof: uiFieldTruth?.target_market_date || uiFieldTruth?.date || null,
    dependencyIds: uiFieldGateMode === 'filesystem_candidate_smoke' ? ['pipeline_epoch'] : ['pipeline_epoch'],
    statusDetail: {
      gate_mode: uiFieldGateMode,
      critical_endpoints: uiFieldTruth?.contract?.required_endpoints || uiFieldTruth?.critical_endpoints || [],
      optional_endpoints: uiFieldTruth?.contract?.optional_endpoints || uiFieldTruth?.optional_endpoints || [],
      failures: uiFieldTruth?.failures || [],
      advisories: uiFieldTruth?.optional_advisories || uiFieldTruth?.advisories || [],
    },
  });

  steps.final_integrity_seal = buildObservedArtifactStep({
    id: 'final_integrity_seal',
    label: 'Final Integrity Seal',
    owner: 'Ops',
    subsystem: 'seal',
    filePath: PATHS.finalIntegritySeal,
    doc: finalIntegritySeal,
    severity: finalIntegritySeal?.release_ready === true ? 'ok' : 'critical',
    summary: finalIntegritySeal?.release_ready === true ? 'Final seal is green' : 'Final seal is blocking release',
    why: Array.isArray(finalIntegritySeal?.blocking_reasons) && finalIntegritySeal.blocking_reasons.length
      ? `Blocking reasons: ${finalIntegritySeal.blocking_reasons.map((reason) => reason.id || reason.title || 'unknown').join(', ')}.`
      : 'Final seal artifact missing or not ready.',
    nextFix: 'Clear the blocking reasons upstream, then rebuild the final integrity seal from the same target-date artifact chain.',
    inputAsof: uiFieldTruth?.target_market_date || epochReport?.target_market_date || null,
    outputAsof: finalIntegritySeal?.target_market_date || null,
    dependencyIds: ['ui_field_truth_report', 'pipeline_epoch'],
    statusDetail: {
      ui_green: finalIntegritySeal?.ui_green ?? null,
      release_ready: finalIntegritySeal?.release_ready ?? null,
      blocking_reasons: finalIntegritySeal?.blocking_reasons || [],
    },
  });

  steps.build_deploy_bundle = buildObservedArtifactStep({
    id: 'build_deploy_bundle',
    label: 'Build Deploy Bundle',
    owner: 'Ops',
    subsystem: 'deploy_bundle',
    filePath: PATHS.deployBundleMeta,
    doc: deployBundleMeta,
    severity: deployBundleMeta?.target_market_date && deployBundleMeta?.target_market_date === finalIntegritySeal?.target_market_date ? 'ok' : 'warning',
    summary: deployBundleMeta ? 'Deploy bundle metadata is present' : 'Deploy bundle metadata missing',
    why: deployBundleMeta
      ? `bundle_id=${deployBundleMeta.bundle_id || 'unknown'}, target_market_date=${deployBundleMeta.target_market_date || 'unknown'}.`
      : 'No deploy bundle metadata artifact was found.',
    nextFix: 'Regenerate the deploy bundle after the final seal is green.',
    inputAsof: finalIntegritySeal?.target_market_date || null,
    outputAsof: deployBundleMeta?.target_market_date || null,
    dependencyIds: ['final_integrity_seal'],
    statusDetail: deployBundleMeta || null,
  });

  steps.wrangler_deploy = buildObservedArtifactStep({
    id: 'wrangler_deploy',
    label: 'Wrangler Deploy',
    owner: 'Deploy',
    subsystem: 'wrangler',
    filePath: PATHS.deployProof,
    doc: deployProof,
    severity: deployProof?.release_ready === true ? 'ok' : 'warning',
    summary: deployProof?.release_ready === true ? 'Deploy proof confirms release publish' : 'Deploy proof missing or not release-ready',
    why: deployProof
      ? `deploy_status=${deployProof.deploy_status || 'unknown'}, proof_mode=${deployProof.proof_mode || 'unknown'}.`
      : 'No deploy proof artifact was found.',
    nextFix: 'Run the release gate and publish step after the bundle is prepared.',
    inputAsof: deployBundleMeta?.target_market_date || null,
    outputAsof: deployProof?.target_market_date || null,
    dependencyIds: ['build_deploy_bundle'],
    statusDetail: deployProof || null,
  });

  if (isDataPlaneLane(EVALUATION_LANE)) {
    const laneNote = 'Release/UI-only gate is not evaluated on the data-plane lane.';
    for (const stepId of ['stock_analyzer_universe_audit', ...RELEASE_ONLY_STEP_IDS]) {
      if (!steps[stepId]) continue;
      steps[stepId] = neutralizeStepForLane(steps[stepId], {
        summary: `${steps[stepId].label} is not evaluated on ${EVALUATION_LANE}`,
        why: laneNote,
      });
    }
    for (const stepId of DATA_PLANE_DEFERRED_OBSERVER_STEP_IDS) {
      if (!steps[stepId]) continue;
      steps[stepId] = neutralizeStepForLane(steps[stepId], {
        laneEvaluation: 'deferred_on_lane',
        summary: `${steps[stepId].label} is generated later in the ${EVALUATION_LANE} lane`,
        why: 'This observer pass treats later same-lane artifacts as advisory prior-cycle evidence, not as blockers.',
      });
    }
  }

  const stepsById = steps;
  const dependencies = buildDependencyEdges(stepsById, { lane: EVALUATION_LANE }).map((edge) => ({
    ...edge,
    step_label: stepsById[edge.id]?.label || edge.id,
    blocked_by_labels: edge.blocked_by.map((depId) => stepsById[depId]?.label || depId),
    degraded_by_labels: (edge.degraded_by || []).map((depId) => stepsById[depId]?.label || depId),
  }));

  const rootCauses = [];
  if (severityRank(steps.market_data_refresh.severity) >= severityRank('warning')) {
    rootCauses.push(buildRootCauseFromStep(steps.market_data_refresh, 'data_freshness'));
  }
  if (severityRank(steps.q1_delta_ingest.severity) >= severityRank('warning')) {
    rootCauses.push(buildRootCauseFromStep(steps.q1_delta_ingest, 'data_freshness'));
  }
  if (severityRank(steps.quantlab_daily_report.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.quantlab_daily_report, 'data_freshness'));
  }
  if (severityRank(steps.hist_probs.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.hist_probs, 'data_freshness'));
  }
  if (severityRank(steps.scientific_summary.severity) >= severityRank('warning')) {
    rootCauses.push(buildRootCauseFromStep(steps.scientific_summary, 'model_availability'));
  }
  if (severityRank(steps.snapshot.severity) >= severityRank('warning')) {
    rootCauses.push(buildRootCauseFromStep(steps.snapshot, 'decision_funnel'));
  }
  if (severityRank(steps.stock_analyzer_universe_audit.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.stock_analyzer_universe_audit, 'ui_contract'));
  }
  if (severityRank(steps.data_freshness_report.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.data_freshness_report, 'data_freshness'));
  }
  if (severityRank(steps.pipeline_epoch.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.pipeline_epoch, 'control_plane'));
  }
  if (severityRank(steps.runtime_preflight.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.runtime_preflight, 'runtime'));
  }
  if (severityRank(steps.ui_field_truth_report.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.ui_field_truth_report, 'ui_contract'));
  }
  if (severityRank(steps.final_integrity_seal.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.final_integrity_seal, 'release_gate'));
  }
  if (severityRank(automation.severity) >= severityRank('warning')) {
    rootCauses.push({
      id: 'automation_refresh_chain_degraded',
      severity: automation.severity,
      category: 'automation',
      title: 'Automation refresh chain is degraded',
      why: automation.summary,
      impact: 'Automation can report failure even when some artifacts recovered, so operators need explicit cause-vs-recovery visibility.',
      fix: 'Use the latest successful artifact and latest failed automation step together; only treat unrecovered failures as active blockers.',
      owner: 'Ops',
      subsystem: 'automation',
      file_ref: 'public/data/reports/nightly-stock-analyzer-status.json',
      evidence_at: automation.latest_refresh?.nightly_updated_at || automation.latest_refresh?.recovery_generated_at || null,
    });
  }
  const controlPlaneConsistency = isDataPlaneLane(EVALUATION_LANE)
    ? {
      ok: true,
      run_id: null,
      target_market_date: null,
      target_mismatches: [],
      run_id_mismatches: [],
      observational_sources: {
        recovery: {
          run_id: null,
          target_market_date: recoveryReport?.target_market_date || null,
        },
      },
      blocking_reasons: [],
    }
    : validateControlPlaneConsistency({
      release: releaseState,
      runtime: runtimeReport,
      epoch: epochReport,
      recovery: recoveryReport,
    });
  if (!controlPlaneConsistency.ok) {
    rootCauses.push({
      id: 'control_plane_consistency_failed',
      severity: 'critical',
      category: 'control_plane',
      title: 'Control-plane artifacts disagree on target date or run identity',
      why: 'release-state, recovery, runtime, or epoch artifacts reference different target_market_date or run_id values.',
      impact: 'The pipeline can claim DONE or green even when downstream artifacts still describe an older or different target date.',
      fix: 'Rebuild system-status, runtime, epoch, and release-state from the same target_market_date and run_id without manual JSON edits.',
      owner: 'Ops',
      subsystem: 'control_plane',
      file_ref: 'public/data/ops/release-state-latest.json',
      evidence_at: releaseState?.last_updated || recoveryReport?.generated_at || null,
    });
  }

  // Detect SSOT violations — each is a broken invariant that a "dumb LLM" must see explicitly.
  function detectSsotViolations() {
    const violations = [];
    const now = new Date().toISOString();

    // 1. hist_probs missing a required asset class
    const runAssetClasses = histProbsSummary?.asset_classes || [];
    const missingRequiredHistClasses = ['STOCK', 'ETF', 'INDEX'].filter((cls) => !runAssetClasses.includes(cls));
    if (histProbsSummary && missingRequiredHistClasses.length > 0) {
      violations.push({
        id: 'hist_probs_missing_etf_class',
        severity: 'critical',
        title: 'hist_probs ran without a required asset class',
        ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
        why: `Last hist_probs run used asset_classes=[${runAssetClasses.join(',')}]. SSOT run_command requires STOCK,ETF,INDEX; missing=[${missingRequiredHistClasses.join(',')}]. Missing classes have no historical profiles in analyze-v4.`,
        evidence: { asset_classes: runAssetClasses, missing_required_asset_classes: missingRequiredHistClasses, ran_at: histProbsSummary.ran_at },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
        success_signal: 'run-summary.json asset_classes includes STOCK, ETF, and INDEX',
        detected_at: now,
      });
    }

    if (histRunZeroCoverage) {
      violations.push({
        id: 'hist_probs_zero_coverage',
        severity: 'critical',
        title: 'hist_probs full-universe run produced zero covered tickers',
        ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs coverage guard)',
        why: `Full-universe hist_probs run reported tickers_total=${histRunTotal} and tickers_covered=${histRunCovered}. This must block readiness instead of surfacing as green coverage.`,
        evidence: {
          source_mode: histProbsSummary?.source_mode || null,
          tickers_total: histRunTotal,
          tickers_covered: histRunCovered,
          tickers_excluded_inactive: histProbsSummary?.tickers_excluded_inactive ?? null,
          ran_at: histProbsSummary?.ran_at || null,
        },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
        success_signal: 'run-summary.json tickers_total > 0 and tickers_covered > 0 for the required universe',
        detected_at: now,
      });
    }
    if (histAnchorStale) {
      violations.push({
        id: 'hist_probs_anchor_stale',
        severity: 'critical',
        title: 'hist_probs anchor ticker is stale or missing',
        ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs freshness guard)',
        why: `Anchor ticker AAPL is at latest_date=${histAnchorDate || 'missing'} while expected_date=${expectedHistDate || 'unknown'}. Successful process exit alone does not prove fresh profile coverage.`,
        evidence: {
          anchor_ticker: 'AAPL',
          latest_date: histAnchorDate,
          expected_date: expectedHistDate,
          computed_at: histProbsAnchor?.computed_at || null,
        },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
        success_signal: 'AAPL.json latest_date advances to the expected target market date and the run-summary remains complete',
        detected_at: now,
      });
    }

    // 2. hist_probs limited runner (explicit tickers instead of registry)
    if (histProbsSummary && histProbsSummary.source_mode === 'explicit_tickers') {
      violations.push({
        id: 'hist_probs_limited_runner',
        severity: 'warning',
        title: 'hist_probs ran with explicit ticker list instead of full registry',
        ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
        why: `Last run used source_mode=explicit_tickers (${histProbsSummary.tickers_total} tickers). SSOT requires registry-backed run with --max-tickers 0 to cover all stocks and ETFs.`,
        evidence: { source_mode: histProbsSummary.source_mode, tickers_total: histProbsSummary.tickers_total, ran_at: histProbsSummary.ran_at },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
        success_signal: 'run-summary.json source_mode=registry and tickers_total matches full universe',
        detected_at: now,
      });
    }

    // 3. QuantLab canonical vs any-parquet lag
    const canonicalDate = quantlabOperational?.rawBars?.latestCanonicalRequiredDataDate
      || quantlabDaily?.currentState?.dataFreshness?.latestCanonicalRequiredDataDate;
    const anyDate = quantlabOperational?.rawBars?.latestAnyRequiredDataDate
      || quantlabDaily?.currentState?.dataFreshness?.latestAnyRequiredDataDate;
    const canonicalLagDays = canonicalDate && anyDate ? tradingDaysBetween(canonicalDate, anyDate) : null;
    const canonicalLagShortfall = canonicalLagDays != null ? Math.max(0, canonicalLagDays - CANONICAL_LABEL_WINDOW) : null;
    if (canonicalLagShortfall != null && canonicalLagShortfall > 0) {
      violations.push({
        id: 'quantlab_canonical_lag',
        severity: canonicalLagShortfall > 14 ? 'critical' : 'info',
        title: `QuantLab canonical data exceeds label-window lag by ${canonicalLagShortfall} trading days`,
        ssot_doc: 'docs/ops/runbook.md (Canonical Recovery Order step 2)',
        why: `latestCanonicalRequiredDataDate=${canonicalDate} but latestAnyRequiredDataDate=${anyDate} — gap of ${canonicalLagDays} trading days against an expected ${CANONICAL_LABEL_WINDOW}T label window.`,
        evidence: { canonical_date: canonicalDate, any_date: anyDate, lag_trading_days: canonicalLagDays, shortfall_trading_days: canonicalLagShortfall, expected_label_window_trading_days: CANONICAL_LABEL_WINDOW },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.q1_delta_ingest.run_command,
        success_signal: 'latestCanonicalRequiredDataDate stays within the expected label-window lag of latestAnyRequiredDataDate',
        detected_at: now,
      });
    }

    // 4. Snapshot quantlab_asof lags data_asof
    const snapshotQuantlabAsof = snapshot?.meta?.quantlab_asof;
    const snapshotDataAsof = snapshot?.meta?.data_asof;
    const snapshotLagDays = snapshotQuantlabAsof && snapshotDataAsof ? tradingDaysBetween(snapshotQuantlabAsof, snapshotDataAsof) : null;
    const snapshotLagShortfall = snapshotLagDays != null ? Math.max(0, snapshotLagDays - CANONICAL_LABEL_WINDOW) : null;
    if (snapshotLagShortfall != null && snapshotLagShortfall > 0) {
      violations.push({
        id: 'snapshot_quantlab_asof_lag',
        severity: snapshotLagShortfall > 14 ? 'critical' : snapshotLagShortfall > 7 ? 'warning' : 'info',
        title: `Snapshot quantlab_asof exceeds label-window lag by ${snapshotLagShortfall} trading days`,
        ssot_doc: 'docs/ops/runbook.md (Step Contract: Best Setups Snapshot)',
        why: `snapshot.meta.quantlab_asof=${snapshotQuantlabAsof} but snapshot.meta.data_asof=${snapshotDataAsof}. Gap is ${snapshotLagDays} trading days against an expected ${CANONICAL_LABEL_WINDOW}T label window.`,
        evidence: { quantlab_asof: snapshotQuantlabAsof, data_asof: snapshotDataAsof, lag_trading_days: snapshotLagDays, shortfall_trading_days: snapshotLagShortfall, expected_label_window_trading_days: CANONICAL_LABEL_WINDOW },
        fix_command: `${SYSTEM_STATUS_STEP_CONTRACTS.quantlab_daily_report.run_command} && ${SYSTEM_STATUS_STEP_CONTRACTS.snapshot.run_command}`,
        success_signal: 'snapshot.meta.quantlab_asof stays within the expected label-window lag of snapshot.meta.data_asof',
        detected_at: now,
      });
    }

    // 5. Market refresh zero data
    if (noDataFetched) {
      violations.push({
        id: 'market_refresh_no_data',
        severity: 'warning',
        title: 'Market data refresh ran but returned zero data points',
        ssot_doc: 'docs/ops/runbook.md (Step Contract: Market Data Refresh)',
        why: `Refresh report at ${refreshGeneratedAt} recorded assets_requested=${refreshReport?.assets_requested ?? 0} but assets_fetched_with_data=0. No data flows into delta ingest or any downstream step until a successful re-run.`,
        evidence: { assets_requested: refreshReport?.assets_requested ?? 0, assets_fetched_with_data: 0, generated_at: refreshGeneratedAt },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.market_data_refresh.run_command,
        success_signal: 'assets_fetched_with_data > 0 and output_asof is a valid market date',
        detected_at: now,
      });
    }

    return violations;
  }

  const ssotViolations = detectSsotViolations();
  const ssotBlockingViolations = ssotViolations.filter((item) => severityRank(item.severity) >= severityRank('warning'));
  const ssotAdvisoryViolations = ssotViolations.filter((item) => item.severity === 'info');
  const ssotBlockingSeverity = ssotBlockingViolations.reduce(
    (worst, item) => severityRank(item.severity) > severityRank(worst) ? item.severity : worst,
    'ok'
  );
  const ssotAdvisorySeverity = ssotAdvisoryViolations.length > 0 ? 'info' : 'ok';
  const advisoryDisplaySeverity = ssotAdvisorySeverity === 'info' ? 'ok' : ssotAdvisorySeverity;
  const finalSealTarget = normalizeDate(finalIntegritySeal?.target_market_date || null);
  const finalSealExpectedTarget = normalizeDate(
    process.env.TARGET_MARKET_DATE
    || process.env.RV_TARGET_MARKET_DATE
    || expectedOperationalTargetDate
    || epochReport?.target_market_date
    || releaseTargetMarketDate
    || null
  );
  const finalSealAuthoritativeGreen = !isDataPlaneLane(EVALUATION_LANE)
    && finalIntegritySeal?.status === 'OK'
    && finalIntegritySeal?.release_ready === true
    && finalIntegritySeal?.ui_green === true
    && finalIntegritySeal?.global_green === true
    && Array.isArray(finalIntegritySeal?.blocking_reasons)
    && finalIntegritySeal.blocking_reasons.length === 0
    && finalSealTarget
    && (!finalSealExpectedTarget || finalSealTarget === finalSealExpectedTarget);
  const sealSupersededCauseIds = new Set([
    'runtime_preflight_runtime',
    'ui_field_truth_report_ui_contract',
    'control_plane_consistency_failed',
    'snapshot_decision_funnel',
  ]);
  const advisoryRootCauses = finalSealAuthoritativeGreen
    ? rootCauses
      .filter((cause) => sealSupersededCauseIds.has(cause.id))
      .map((cause) => ({
        ...cause,
        severity: cause.severity === 'critical' ? 'info' : cause.severity,
        non_blocking: true,
        superseded_by_final_seal: true,
      }))
    : [];
  const blockingRootCauses = finalSealAuthoritativeGreen
    ? rootCauses.filter((cause) => !sealSupersededCauseIds.has(cause.id))
    : rootCauses;
  const rootCauseBlockingSeverity = blockingRootCauses.reduce(
    (acc, cause) => severityRank(cause.severity) > severityRank(acc) ? cause.severity : acc,
    'ok'
  );
  const localBlockingSeverity = severityRank(rootCauseBlockingSeverity) > severityRank(ssotBlockingSeverity)
    ? rootCauseBlockingSeverity
    : ssotBlockingSeverity;
  const localDisplaySeverity = severityRank(localBlockingSeverity) > severityRank(advisoryDisplaySeverity)
    ? localBlockingSeverity
    : advisoryDisplaySeverity;

  const remoteHealth = fetchRemoteWorkflowHealth();
  const remoteWorkflowSeverities = Object.entries(remoteHealth.runs).map(([, run]) => {
    if (!run) return 'warning';
    if (run.status && run.status !== 'completed') return 'warning';
    if (run.conclusion === 'cancelled') return 'warning';
    if (run.conclusion !== 'success') return 'critical';
    const ageDays = daysSince(run.createdAt);
    return ageDays != null && ageDays > 2 ? 'warning' : 'ok';
  });
  const remoteSeverity = remoteHealth.proof_mode === 'remote_unavailable'
    ? 'warning'
    : remoteWorkflowSeverities.reduce((worst, s) => severityRank(s) > severityRank(worst) ? s : worst, 'ok');
  const remoteUnavailableAdvisory = finalSealAuthoritativeGreen && remoteHealth.proof_mode === 'remote_unavailable';
  const effectiveRemoteSeverity = remoteUnavailableAdvisory ? 'ok' : remoteSeverity;
  const sealSeverity = isDataPlaneLane(EVALUATION_LANE)
    ? 'ok'
    : (finalIntegritySeal?.blocking_reasons || []).reduce(
    (worst, item) => severityRank(item?.severity) > severityRank(worst) ? item.severity : worst,
    'ok'
  );
  const baseSeverity = severityRank(localDisplaySeverity) > severityRank(effectiveRemoteSeverity) ? localDisplaySeverity : effectiveRemoteSeverity;
  const severity = severityRank(baseSeverity) > severityRank(sealSeverity) ? baseSeverity : sealSeverity;
  const recoveryBlockingIds = new Set([
    'market_data_refresh',
    'q1_delta_ingest',
    'quantlab_daily_report',
    'hist_probs',
    'snapshot',
    'us_eu_truth_gate',
    'stock_analyzer_universe_audit',
  ]);
  const recoveryBusy = [
    ...((recoveryReport?.running_steps || []).map((item) => item?.id || item)),
    ...((recoveryReport?.blocked_steps || []).map((item) => item?.id || item)),
    recoveryReport?.next_step || null,
  ].filter(Boolean).some((id) => recoveryBlockingIds.has(id));
  const recoveryReady = isDataPlaneLane(EVALUATION_LANE)
    ? (localBlockingSeverity === 'ok' && !recoveryBusy)
    : (finalIntegritySeal?.data_plane_green ?? (localBlockingSeverity === 'ok' && !recoveryBusy));
  const releaseReady = isDataPlaneLane(EVALUATION_LANE) ? null : (finalIntegritySeal?.release_ready === true);
  const coverageReady = isDataPlaneLane(EVALUATION_LANE) ? null : (finalIntegritySeal?.full_universe_validated === true);
  const releasePolicyReady = isDataPlaneLane(EVALUATION_LANE)
    ? null
    : (finalIntegritySeal?.release_ready === true || stockAuditSummary?.artifact_release_ready === true);
  const policyNeutralStructuralGapsOnly = isDataPlaneLane(EVALUATION_LANE)
    ? null
    : (stockAuditSummary?.policy_neutral_structural_gaps_only === true
      || finalIntegritySeal?.policy_neutral_structural_gaps_only === true);
  const localDataGreen = finalSealAuthoritativeGreen ? true : localBlockingSeverity === 'ok';
  const globalGreen = isDataPlaneLane(EVALUATION_LANE) ? null : (finalIntegritySeal?.global_green === true);
  const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
  const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
  const releaseTargetFallback = isDataPlaneLane(EVALUATION_LANE) ? null : releaseTargetMarketDate;
  const sealTargetFallback = isDataPlaneLane(EVALUATION_LANE) ? null : finalIntegritySeal?.target_market_date;
  const targetMarketDate = forcedTargetMarketDate
    || expectedOperationalTargetDate
    || normalizeDate(recoveryReport?.target_market_date || sealTargetFallback || releaseTargetFallback)
    || normalizeDate(histOutputAsof || quantOutputAsof)
    || controlPlaneConsistency.target_market_date
    || null;
  const runId = forcedRunId
    || recoveryReport?.run_id
    || (isDataPlaneLane(EVALUATION_LANE) ? null : finalIntegritySeal?.run_id)
    || controlPlaneConsistency.run_id
    || releaseState?.run_id
    || `system-status-${targetMarketDate || new Date().toISOString().slice(0, 10)}`;

  const primaryActions = dedupe(blockingRootCauses, (cause) => cause.title).map((cause) => ({
    id: cause.id,
    severity: cause.severity,
    title: cause.title,
    action: cause.fix,
    owner: cause.owner,
    subsystem: cause.subsystem,
    file_ref: cause.file_ref,
  }));

  const payload = {
    schema: 'rv.system_status.v1',
    ...buildArtifactEnvelope({
      producer: 'scripts/ops/build-system-status-report.mjs',
      runId,
      targetMarketDate,
      upstreamRunIds: collectUpstreamRunIds(recoveryReport, releaseState, runtimeReport, epochReport),
    }),
    summary: {
      severity,
      healthy: severity === 'ok' && recoveryReady,
      local_severity: localBlockingSeverity,
      blocking_severity: localBlockingSeverity,
      advisory_severity: ssotAdvisorySeverity,
      local_data_green: localDataGreen,
      global_green: globalGreen,
      remote_severity: effectiveRemoteSeverity,
      remote_observed_severity: remoteSeverity,
      remote_unavailable_advisory: remoteUnavailableAdvisory,
      remote_healthy: effectiveRemoteSeverity === 'ok',
      recovery_ready: recoveryReady,
      evaluation_lane: EVALUATION_LANE,
      release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
      release_ready: releaseReady,
      release_policy_ready: releasePolicyReady,
      coverage_ready: coverageReady,
      policy_neutral_structural_gaps_only: policyNeutralStructuralGapsOnly,
      ui_green: isDataPlaneLane(EVALUATION_LANE) ? null : (finalIntegritySeal?.ui_green ?? null),
      target_market_date: targetMarketDate,
      control_plane_ref: 'public/data/pipeline/runtime/latest.json',
      epoch_ref: 'public/data/pipeline/epoch.json',
      compute_audit_ref: 'public/data/reports/pipeline-compute-audit-latest.json',
      monitoring_ref: 'public/data/reports/pipeline-monitoring-latest.json',
      proof_mode: remoteHealth.proof_mode,
      live_fetch_status: 'ok',
      automation_severity: automation.severity,
      runtime_preflight_ok: isDataPlaneLane(EVALUATION_LANE) ? null : runtimePreflightOk,
      data_layer_severity: [steps.market_data_refresh, steps.q1_delta_ingest, steps.quantlab_daily_report, steps.hist_probs]
        .reduce((acc, step) => severityRank(step.severity) > severityRank(acc) ? step.severity : acc, 'ok'),
      primary_blocker: (blockingRootCauses.slice().sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0])?.title || null,
      ssot_violations_count: ssotViolations.length,
      ssot_blocking_violations_count: ssotBlockingViolations.length,
      ssot_advisory_violations_count: ssotAdvisoryViolations.length,
    },
    remote_workflows: Object.fromEntries(
      Object.entries(remoteHealth.runs).map(([wf, run]) => [wf, {
        conclusion: run?.conclusion ?? null,
        created_at: run?.createdAt ?? null,
        sha: run?.headSha ?? null,
        age_days: run ? daysSince(run.createdAt) : null,
      }])
    ),
    provider: {
      env_present: Boolean(process.env.EODHD_API_KEY || process.env.EODHD_API_TOKEN),
      api_limit_lock: apiLimitLock || null,
      refresh_report: refreshReport ? {
        generated_at: refreshReport.generated_at || null,
        to_date: refreshReport.to_date || null,
        assets_requested: refreshReport.assets_requested ?? null,
        fetch_errors_total: refreshReport.fetch_errors_total ?? null,
      } : null,
    },
    automation,
    evaluation_lane: EVALUATION_LANE,
    release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
    steps,
    dependencies,
    root_causes: blockingRootCauses,
    advisory_root_causes: advisoryRootCauses,
    primary_actions: primaryActions,
    stock_analyzer_universe_audit: stockAnalyzerAudit || null,
    final_integrity_seal: isDataPlaneLane(EVALUATION_LANE) ? null : (finalIntegritySeal || null),
    data_truth_gate: dataFreshness || null,
    ssot: {
      doc_ref: SYSTEM_STATUS_DOC_REF,
      recovery_script: SYSTEM_STATUS_RECOVERY_SCRIPT,
      tracked_step_ids: PIPELINE_STEP_ORDER,
      untracked_step_ids: Object.keys(steps).filter((id) => !SYSTEM_STATUS_STEP_CONTRACTS[id]),
      missing_step_ids: Object.keys(SYSTEM_STATUS_STEP_CONTRACTS).filter((id) => !steps[id]),
      web_validation_chain: STOCK_ANALYZER_WEB_VALIDATION_CHAIN,
      violation_contracts: SSOT_VIOLATION_CONTRACTS.map((c) => c.id),
    },
    ssot_violations: ssotViolations,
    control_plane: controlPlaneConsistency,
  };

  fs.mkdirSync(path.dirname(PATHS.output), { recursive: true });
  fs.writeFileSync(PATHS.output, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

main();
