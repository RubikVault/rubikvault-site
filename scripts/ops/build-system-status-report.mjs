#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QUANT_ROOT = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';

const PATHS = {
  autopilot: path.join(REPO_ROOT, 'public/data/reports/v5-autopilot-status.json'),
  forecast: path.join(REPO_ROOT, 'public/data/forecast/latest.json'),
  learning: path.join(REPO_ROOT, 'public/data/reports/learning-report-latest.json'),
  scientificSummary: path.join(REPO_ROOT, 'public/data/supermodules/scientific-summary.json'),
  quantlabDaily: path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json'),
  quantlabOperational: path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json'),
  histProbs: path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json'),
  snapshot: path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json'),
  etfDiagnostic: path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json'),
  v1Audit: path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json'),
  refreshReport: path.join(REPO_ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  apiLimitLock: path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json'),
  deltaLatestSuccess: path.join(QUANT_ROOT, 'ops/q1_daily_delta_ingest/latest_success.json'),
  cutoverReadinessDir: path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/reports'),
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

function daysSince(value) {
  const ts = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 86400000));
}

function severityRank(value) {
  return { ok: 0, info: 0, warning: 1, critical: 2 }[value] ?? 0;
}

function normalizeSeverity(status) {
  return ['ok', 'warning', 'critical'].includes(status) ? status : 'warning';
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

function buildDependencyEdges(stepsById) {
  return [
    { id: 'market_data_refresh', depends_on: [], reason: 'Provider-backed v7 history refresh is the first upstream market-data hop.' },
    { id: 'q1_delta_ingest', depends_on: ['market_data_refresh'], reason: 'Q1 delta ingest can only advance after v7 history refresh touches newer packs.' },
    { id: 'quantlab_daily_report', depends_on: ['q1_delta_ingest'], reason: 'QuantLab daily report reads raw-bar freshness from the Q1 ingest layer.' },
    { id: 'hist_probs', depends_on: ['q1_delta_ingest'], reason: 'Hist-probs/regime computation requires the same raw market bars to advance.' },
    { id: 'scientific_summary', depends_on: [], reason: 'Scientific summary is sourced from stock-analysis snapshots rather than QuantLab raw bars.' },
    { id: 'forecast_daily', depends_on: [], reason: 'Forecast batch is independent from QuantLab raw-bar freshness.' },
    { id: 'learning_daily', depends_on: ['forecast_daily', 'scientific_summary'], reason: 'Learning report aggregates forecast/scientific/elliott source artifacts.' },
    { id: 'snapshot', depends_on: ['forecast_daily', 'quantlab_daily_report'], reason: 'Breakout/snapshot combines forecast freshness with QuantLab publish layers.' },
    { id: 'etf_diagnostic', depends_on: ['snapshot'], reason: 'ETF diagnostic explains the current snapshot funnel output.' },
    { id: 'v1_audit', depends_on: ['learning_daily', 'snapshot'], reason: 'V1 audit requires current learning artifacts and snapshot outputs.' },
    { id: 'cutover_readiness', depends_on: ['v1_audit'], reason: 'Cutover readiness is evaluated after the V1 audit is available.' },
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

function buildAutomationSummary(autopilot, forecastLatest) {
  const latestRefresh = latestRefreshExecution(autopilot);
  const latestForecastRun = latestStepExecution(autopilot, 'forecast_run_daily');
  const latestForecastBackfill = latestStepExecution(autopilot, 'forecast_backfill_outcomes');
  const latestForecastArtifactAt = forecastLatest?.generated_at || null;
  const latestRefreshFinishedAt = latestRefresh?.finished_at || null;
  const latestRefreshFailed = latestRefresh?.status === 'failed';
  const recoverableFailure = latestRefresh?.failed_step === 'forecast_backfill_outcomes';
  const forecastRunRecovered = latestForecastRun?.step_status === 'completed'
    && new Date(latestForecastRun.finished_at || 0).getTime() >= new Date(latestForecastArtifactAt || 0).getTime() - 1000;
  const forecastArtifactRecovered = latestRefreshFailed
    && Boolean(latestForecastArtifactAt)
    && Boolean(latestRefreshFinishedAt)
    && new Date(latestForecastArtifactAt || 0).getTime() >= new Date(latestRefreshFinishedAt || 0).getTime() - 1000;
  const forecastRecovered = forecastRunRecovered || forecastArtifactRecovered;
  const severity = latestRefreshFailed
    ? (forecastRecovered && recoverableFailure ? 'ok' : forecastRecovered ? 'warning' : 'critical')
    : 'ok';
  const summary = latestRefreshFailed
    ? (forecastRecovered && recoverableFailure
      ? `Latest refresh hit ${latestRefresh.failed_step}, but current published artifacts already recovered and automation remains operational.`
      : forecastRecovered
      ? `Latest refresh failed at ${latestRefresh.failed_step}, but forecast artifacts already recovered.`
      : `Latest refresh failed at ${latestRefresh.failed_step}.`)
    : 'Latest automated refresh completed successfully.';
  return {
    severity,
    summary,
    latest_refresh: latestRefresh ? {
      mode: latestRefresh.mode || null,
      job_dir: latestRefresh.job_dir || null,
      status: latestRefresh.status || null,
      failed_step: latestRefresh.failed_step || null,
      finished_at: latestRefresh.finished_at || null,
      created_at: latestRefresh.created_at || null,
    } : null,
    latest_forecast_run: latestForecastRun ? {
      status: latestForecastRun.step_status,
      finished_at: latestForecastRun.finished_at,
      returncode: latestForecastRun.returncode ?? null,
    } : null,
    latest_forecast_backfill: latestForecastBackfill ? {
      status: latestForecastBackfill.step_status,
      finished_at: latestForecastBackfill.finished_at,
      returncode: latestForecastBackfill.returncode ?? null,
    } : null,
    recovered_steps: forecastRecovered ? ['forecast_run_daily'] : [],
    active_failures: latestRefreshFailed && !(forecastRecovered && recoverableFailure) ? [latestRefresh.failed_step].filter(Boolean) : [],
  };
}

function main() {
  const autopilot = readJson(PATHS.autopilot);
  const forecastLatest = readJson(PATHS.forecast);
  const learning = readJson(PATHS.learning);
  const scientificSummary = readJson(PATHS.scientificSummary);
  const quantlabDaily = readJson(PATHS.quantlabDaily);
  const quantlabOperational = readJson(PATHS.quantlabOperational);
  const histProbs = readJson(PATHS.histProbs);
  const snapshot = readJson(PATHS.snapshot);
  const etfDiagnostic = readJson(PATHS.etfDiagnostic);
  const v1Audit = readJson(PATHS.v1Audit);
  const refreshReport = readJson(PATHS.refreshReport);
  const apiLimitLock = readJson(PATHS.apiLimitLock);
  const deltaLatestSuccess = readJson(PATHS.deltaLatestSuccess);
  const cutoverReports = listCutoverReports(PATHS.cutoverReadinessDir);
  const cutoverReadiness = cutoverReports.length ? readJson(cutoverReports[cutoverReports.length - 1]) : null;
  const automation = buildAutomationSummary(autopilot, forecastLatest);

  const refreshSampleLastDate = (refreshReport?.fetched_assets_sample || [])
    .map((row) => row?.last_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  const refreshGeneratedAt = refreshReport?.generated_at || statMtimeIso(PATHS.refreshReport);
  const refreshStaleDays = daysSince(refreshSampleLastDate || refreshGeneratedAt);
  const refreshSeverity = refreshStaleDays == null ? 'warning' : refreshStaleDays > 7 ? 'critical' : refreshStaleDays > 3 ? 'warning' : 'ok';

  const steps = {};

  steps.market_data_refresh = buildStep({
    id: 'market_data_refresh',
    label: 'Market Data Refresh',
    owner: 'Market Data',
    subsystem: 'v7_history',
    severity: refreshSeverity,
    summary: refreshSeverity === 'critical' ? 'Market-data refresh is stale' : refreshSeverity === 'warning' ? 'Market-data refresh is aging' : 'Market-data refresh is current',
    why: apiLimitLock && refreshSeverity !== 'ok'
      ? `Latest v7 history refresh report is ${refreshStaleDays}d old and the provider lock file still records ${apiLimitLock.reason}.`
      : refreshReport
        ? `Latest v7 history refresh report was generated at ${refreshGeneratedAt || 'unknown'} with observed market data only up to ${refreshSampleLastDate || 'unknown'}.`
        : 'No v7 history refresh report was found.',
    next_fix: 'Run the provider-backed history refresh first; if it does not advance, inspect provider auth/quota and refresh report outputs before touching downstream jobs.',
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
  const deltaStaleDays = daysSince(deltaLatestSuccess?.ingest_date || deltaUpdatedAt);
  const deltaSeverity = deltaStaleDays == null ? 'warning' : deltaStaleDays > 7 ? 'critical' : deltaStaleDays > 3 ? 'warning' : 'ok';
  steps.q1_delta_ingest = buildStep({
    id: 'q1_delta_ingest',
    label: 'Q1 Delta Ingest',
    owner: 'QuantLab',
    subsystem: 'q1_delta',
    severity: deltaSeverity,
    summary: deltaSeverity === 'critical' ? 'Q1 delta ingest is stale' : deltaSeverity === 'warning' ? 'Q1 delta ingest has not advanced recently' : 'Q1 delta ingest is current',
    why: deltaLatestSuccess
      ? `Latest successful Q1 delta ingest is anchored to ingest_date=${deltaLatestSuccess.ingest_date} and was updated at ${deltaUpdatedAt || 'unknown'}.`
      : 'No successful Q1 delta ingest artifact was found.',
    next_fix: 'After the upstream history refresh advances, rerun the Q1 delta ingest and verify latest_success.json moves forward before rebuilding QuantLab reports.',
    file_ref: 'scripts/quantlab/run_daily_delta_ingest_q1.py',
    generated_at: deltaUpdatedAt,
    last_success_at: deltaUpdatedAt,
    input_asof: deltaLatestSuccess?.ingest_date || null,
    output_asof: deltaLatestSuccess?.ingest_date || null,
    dependency_ids: ['market_data_refresh'],
    blocked_by: severityRank(steps.market_data_refresh?.severity) >= severityRank('critical') ? ['market_data_refresh'] : [],
    status_detail: {
      latest_success: deltaLatestSuccess || null,
      impact: 'QuantLab raw-bar freshness cannot advance until the delta ingest layer has incorporated newer market history.',
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
  const quantStaleDays = quantPublish.ageCalendarDays
    ?? quantFeature.ageCalendarDays
    ?? quantRaw.latestCanonicalAgeCalendarDays
    ?? quantRaw.latest_required_age_calendar_days
    ?? daysSince(quantOutputAsof);
  const quantSeverity = ['ok', 'warning', 'critical'].includes(quantFreshness?.summary?.severity)
    ? quantFreshness.summary.severity
    : quantStaleDays == null
      ? 'warning'
      : quantStaleDays > 7
        ? 'critical'
        : quantStaleDays > 3
          ? 'warning'
          : 'ok';
  steps.quantlab_daily_report = buildStep({
    id: 'quantlab_daily_report',
    label: 'QuantLab Daily Report',
    owner: 'QuantLab',
    subsystem: 'quantlab',
    severity: quantSeverity,
    summary: quantSeverity === 'critical' ? 'QuantLab data plane is critically stale' : quantSeverity === 'warning' ? 'QuantLab data plane is aging' : 'QuantLab data plane is current',
    why: quantFreshness?.summary?.message || (quantRaw.reasonCodes || quantRaw.reason_codes || []).join(' | ') || `Latest QuantLab output as-of is ${quantOutputAsof || 'unknown'}.`,
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
      operational_freshness: quantFreshness?.summary || null,
      overnight_stability: quantlabDaily?.currentState?.overnightStability || null,
      impact: 'Breakout/snapshot consumers can look live while still reading stale QuantLab market input.',
    },
  });

  const histOutputAsof = histProbs?.date || null;
  const histStaleDays = daysSince(histOutputAsof);
  const histSeverity = histStaleDays == null ? 'warning' : histStaleDays > 7 ? 'critical' : histStaleDays > 3 ? 'warning' : 'ok';
  steps.hist_probs = buildStep({
    id: 'hist_probs',
    label: 'Historical Probabilities',
    owner: 'Hist Probs',
    subsystem: 'hist_probs',
    severity: histSeverity,
    summary: histSeverity === 'critical' ? 'Historical probabilities are stale' : histSeverity === 'warning' ? 'Historical probabilities are aging' : 'Historical probabilities are current',
    why: histOutputAsof ? `Regime daily last market date is ${histOutputAsof}.` : 'No regime-daily market date is available.',
    next_fix: 'Advance raw bars first, then rerun hist-probs so the regime date moves forward with the market.',
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
      impact: 'Regime and passive probability context lags the market and should not be treated as current.',
    },
  });

  const forecastExec = latestStepExecution(autopilot, 'forecast_run_daily');
  steps.forecast_daily = buildStep({
    id: 'forecast_daily',
    label: 'Forecast Daily',
    owner: 'Forecast',
    subsystem: 'forecast',
    severity: forecastLatest?.status === 'ok' ? 'ok' : 'critical',
    summary: forecastLatest?.status === 'ok' ? 'Forecast daily batch is healthy' : 'Forecast daily batch is failing',
    why: forecastLatest?.status === 'ok'
      ? `Forecast latest artifact was generated at ${forecastLatest.generated_at || 'unknown'} with as-of ${forecastLatest?.data?.asof || 'unknown'}.`
      : `Forecast latest artifact is missing or unhealthy; latest execution status is ${forecastExec?.step_status || 'unknown'}.`,
    next_fix: 'Use scripts/forecast/run_daily.mjs as the primary batch health check and treat engine-level files as implementation detail unless run_daily fails.',
    file_ref: 'scripts/forecast/run_daily.mjs',
    generated_at: forecastLatest?.generated_at || statMtimeIso(PATHS.forecast),
    last_success_at: forecastExec?.step_status === 'completed' ? forecastExec.finished_at : forecastLatest?.generated_at || statMtimeIso(PATHS.forecast),
    input_asof: null,
    output_asof: forecastLatest?.data?.asof || forecastLatest?.freshness || null,
    status_detail: {
      latest_execution: forecastExec || null,
      automation: automation,
      impact: 'Forecast freshness drives learning and the snapshot stack, but current forecast artifacts are healthy.',
    },
  });

  const learningScientific = learning?.features?.scientific || null;
  steps.scientific_summary = buildStep({
    id: 'scientific_summary',
    label: 'Scientific Summary',
    owner: 'Scientific',
    subsystem: 'scientific',
    severity: learningScientific?.source_meta?.stale_days > 7 ? 'critical' : (learningScientific?.source_meta?.stale_days > 3 ? 'warning' : 'ok'),
    summary: learningScientific?.source_meta?.stale_days > 7
      ? 'Scientific source is stale'
      : learningScientific?.source_meta?.stale_days > 3
        ? 'Scientific source is aging'
        : learningScientific?.source_meta?.asof
          ? 'Scientific source is current'
          : 'Scientific source timestamp is missing',
    why: learningScientific?.source_meta?.asof
      ? `Scientific source_meta as-of is ${learningScientific.source_meta.asof}.`
      : 'Scientific source has no current as-of timestamp.',
    next_fix: 'Refresh the scientific summary and verify the upstream source emits a current timestamp before the daily learning batch runs.',
    file_ref: 'scripts/build-scientific-summary.mjs',
    generated_at: learning?.date ? statMtimeIso(PATHS.learning) : statMtimeIso(PATHS.scientificSummary),
    last_success_at: statMtimeIso(PATHS.scientificSummary),
    input_asof: null,
    output_asof: learningScientific?.source_meta?.asof || null,
    status_detail: {
      learning_feature: learningScientific || null,
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
  const snapshotSeverity = daysSince(snapshotOutputAsof) > 3 ? 'warning' : 'ok';
  steps.snapshot = buildStep({
    id: 'snapshot',
    label: 'Best Setups Snapshot',
    owner: 'Snapshot',
    subsystem: 'breakout_v2',
    severity: snapshotSeverity,
    summary: snapshotSeverity === 'warning' ? 'Snapshot is current but depends on degraded upstream inputs' : 'Snapshot output is current',
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
      impact: 'Snapshot rows currently render, but part of the dependency chain still lags.',
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

  const stepsById = steps;
  const dependencies = buildDependencyEdges(stepsById).map((edge) => ({
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
      file_ref: 'public/data/reports/v5-autopilot-status.json',
      evidence_at: automation.latest_refresh?.finished_at || null,
    });
  }

  const severity = rootCauses.reduce((acc, cause) => severityRank(cause.severity) > severityRank(acc) ? cause.severity : acc, 'ok');
  const primaryActions = dedupe(rootCauses, (cause) => cause.title).map((cause) => ({
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
    generated_at: new Date().toISOString(),
    summary: {
      severity,
      healthy: severity === 'ok',
      live_fetch_status: 'ok',
      automation_severity: automation.severity,
      data_layer_severity: [steps.market_data_refresh, steps.q1_delta_ingest, steps.quantlab_daily_report, steps.hist_probs]
        .reduce((acc, step) => severityRank(step.severity) > severityRank(acc) ? step.severity : acc, 'ok'),
      primary_blocker: rootCauses[0]?.title || null,
    },
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
    steps,
    dependencies,
    root_causes: rootCauses,
    primary_actions: primaryActions,
  };

  fs.mkdirSync(path.dirname(PATHS.output), { recursive: true });
  fs.writeFileSync(PATHS.output, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

main();
