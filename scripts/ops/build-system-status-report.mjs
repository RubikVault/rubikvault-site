#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  SSOT_VIOLATION_CONTRACTS,
  STOCK_ANALYZER_WEB_VALIDATION_CHAIN,
  SYSTEM_STATUS_DOC_REF,
  SYSTEM_STATUS_RECOVERY_SCRIPT,
  SYSTEM_STATUS_STEP_CONTRACTS,
} from './system-status-ssot.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QUANT_ROOT = process.env.QUANT_ROOT || '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';
const HIST_PROBS_PROFILE_INDEX = process.env.HIST_PROBS_PROFILE_INDEX
  ? path.resolve(process.env.HIST_PROBS_PROFILE_INDEX)
  : null;

const PATHS = {
  autopilot: path.join(REPO_ROOT, 'public/data/reports/v5-autopilot-status.json'),
  forecast: path.join(REPO_ROOT, 'public/data/forecast/latest.json'),
  learning: path.join(REPO_ROOT, 'public/data/reports/learning-report-latest.json'),
  scientificSummary: path.join(REPO_ROOT, 'public/data/supermodules/scientific-summary.json'),
  quantlabDaily: path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json'),
  quantlabOperational: path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json'),
  histProbs: path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json'),
  histProbsSummary: path.join(REPO_ROOT, 'public/data/hist-probs/run-summary.json'),
  stockAnalyzerAudit: path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  snapshot: path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json'),
  etfDiagnostic: path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json'),
  v1Audit: path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json'),
  stockUniverseSymbols: path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json'),
  stockUniverseSymbolsUsEu: path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json'),
  refreshReport: path.join(REPO_ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  apiLimitLock: path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json'),
  deltaLatestSuccess: path.join(QUANT_ROOT, 'ops/q1_daily_delta_ingest/latest_success.json'),
  cutoverReadinessDir: path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/reports'),
  dataFreshness: path.join(REPO_ROOT, 'public/data/reports/data-freshness-latest.json'),
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
    { id: 'stock_analyzer_universe_audit', depends_on: ['market_data_refresh', 'q1_delta_ingest', 'hist_probs', 'forecast_daily', 'scientific_summary', 'snapshot'], reason: 'The universe-wide analyze-v4 audit is only trustworthy after the direct data/model inputs and snapshot layer are current.' },
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
  const histProbsSummary = readJson(PATHS.histProbsSummary);
  const stockAnalyzerAudit = readJson(PATHS.stockAnalyzerAudit);
  const snapshot = readJson(PATHS.snapshot);
  const etfDiagnostic = readJson(PATHS.etfDiagnostic);
  const v1Audit = readJson(PATHS.v1Audit);
  const refreshReport = readJson(PATHS.refreshReport);
  const apiLimitLock = readJson(PATHS.apiLimitLock);
  const deltaLatestSuccess = readJson(PATHS.deltaLatestSuccess);
  const cutoverReports = listCutoverReports(PATHS.cutoverReadinessDir);
  const cutoverReadiness = cutoverReports.length ? readJson(cutoverReports[cutoverReports.length - 1]) : null;
  const dataFreshness = readJson(PATHS.dataFreshness);
  const automation = buildAutomationSummary(autopilot, forecastLatest);

  const refreshSampleLastDate = (refreshReport?.fetched_assets_sample || [])
    .map((row) => row?.last_date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
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
      ? 'API ran but returned no data. Re-run after market close with: python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks.max.canonical.ids.json --from-date <YYYY-MM-DD>'
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
  const deltaStaleDays = daysSince(deltaLatestSuccess?.ingest_date || deltaUpdatedAt);
  const deltaStaleSeverity = deltaStaleDays == null ? 'warning' : deltaStaleDays > 7 ? 'critical' : deltaStaleDays > 3 ? 'warning' : 'ok';
  const deltaIsNoop = deltaLatestSuccess?.noop_no_changed_packs === true
    || (deltaLatestSuccess?.selected_packs_total === 0 && deltaStaleDays != null && deltaStaleDays <= 3);
  const refreshAsof = refreshReport?.to_date || null;
  const deltaUpstreamAdvanced = refreshAsof && deltaLatestSuccess?.ingest_date && refreshAsof > deltaLatestSuccess.ingest_date;
  const deltaNoop = deltaIsNoop && deltaUpstreamAdvanced;
  const deltaSeverity = deltaNoop ? (deltaStaleSeverity === 'ok' ? 'warning' : deltaStaleSeverity) : deltaStaleSeverity;
  steps.q1_delta_ingest = buildStep({
    id: 'q1_delta_ingest',
    label: 'Q1 Delta Ingest',
    owner: 'QuantLab',
    subsystem: 'q1_delta',
    severity: deltaSeverity,
    summary: deltaNoop
      ? 'Q1 delta ingest ran as noop but upstream has advanced'
      : deltaSeverity === 'critical' ? 'Q1 delta ingest is stale'
      : deltaSeverity === 'warning' ? 'Q1 delta ingest has not advanced recently'
      : 'Q1 delta ingest is current',
    why: deltaNoop
      ? `Q1 delta ingest ran as noop (selected_packs_total=${deltaLatestSuccess?.selected_packs_total ?? 0}, noop_no_changed_packs=${deltaLatestSuccess?.noop_no_changed_packs}) but market_data_refresh has advanced to ${refreshAsof} — ingest must re-run.`
      : deltaLatestSuccess
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
      noop_detected: deltaNoop,
      selected_packs_total: deltaLatestSuccess?.selected_packs_total ?? null,
      noop_no_changed_packs: deltaLatestSuccess?.noop_no_changed_packs ?? null,
      upstream_refresh_asof: refreshAsof,
      impact: deltaNoop
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
  const quantStaleSeverity = quantFreshnessSeverityRaw != null
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
  const CANONICAL_LABEL_WINDOW = 20;
  const canonicalShortfall = quantCanonicalLag != null ? Math.max(0, quantCanonicalLag - CANONICAL_LABEL_WINDOW) : null;
  const quantCanonicalLagSeverity = canonicalShortfall == null ? 'ok'
    : canonicalShortfall > 14 ? 'critical'
    : canonicalShortfall > 7 ? 'warning'
    : 'ok';
  const quantSeverity = severityRank(quantCanonicalLagSeverity) > severityRank(quantStaleSeverity)
    ? quantCanonicalLagSeverity : quantStaleSeverity;
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
  const histOutputAsof = histFamily?.data_asof || histProbs?.date || null;
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
      readUniverseCount(PATHS.stockUniverseSymbolsUsEu)
      ?? readUniverseCount(PATHS.stockUniverseSymbols)
    );
  const histCoverageRatio = stockUniverseCount && stockUniverseCount > 0 ? Number(histFamily?.fresh_count ?? histProfileCount) / stockUniverseCount : null;
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
  const histSeverity = severityRank(histCoverageSeverity) > severityRank(histFreshnessSeverity)
    ? histCoverageSeverity
    : histFreshnessSeverity;
  steps.hist_probs = buildStep({
    id: 'hist_probs',
    label: 'Historical Probabilities',
    owner: 'Hist Probs',
    subsystem: 'hist_probs',
    severity: histSeverity,
    summary: histSeverity === 'critical' ? 'Historical probabilities are stale' : histSeverity === 'warning' ? 'Historical probabilities are aging' : 'Historical probabilities are current',
    why: histFamily
      ? `US+EU historical profile freshness is ${histFamily.fresh_count}/${stockUniverseCount || 'unknown'} fresh, ${histFamily.stale_count || 0} stale, ${histFamily.missing_count || 0} missing; latest run asset classes=${(histProbsSummary?.asset_classes || []).join(',') || 'unknown'}.`
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
        fresh_count: histFamily?.fresh_count ?? null,
        stale_count: histFamily?.stale_count ?? null,
        missing_count: histFamily?.missing_count ?? null,
        sample_tickers: histFamily?.sample_tickers || [],
        default_runner_limited: Number(histProbsSummary?.max_tickers || 0) > 0 || (histProbsSummary?.tickers_total || 0) <= 500,
        asset_classes: histProbsSummary?.asset_classes || ['STOCK'],
      },
      impact: histFamily?.healthy
        ? 'Historical probability context is current for the required US+EU universe.'
        : 'Regime and passive probability context lags the market and should not be treated as current.',
    },
  });

  const forecastExec = latestStepExecution(autopilot, 'forecast_run_daily');
  const forecastSeverity = forecastLatest?.status === 'ok' ? 'ok' : 'critical';
  steps.forecast_daily = buildStep({
    id: 'forecast_daily',
    label: 'Forecast Daily',
    owner: 'Forecast',
    subsystem: 'forecast',
    severity: forecastSeverity,
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
  const stockAuditSeverity = !stockAnalyzerAudit
    ? 'warning'
    : !stockAuditSummary?.full_universe
      ? 'warning'
      : stockAuditCriticalFamilies.length > 0
        ? 'critical'
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
          : 'Stock Analyzer universe audit found critical field-level failures',
    why: !stockAnalyzerAudit
      ? 'No stock-analyzer-universe-audit artifact was found, so dashboard_v7 cannot prove all analyze-v4 fields are valid across the universe.'
      : `Latest audit processed ${stockAuditProcessed}/${stockAuditTotal || 'unknown'} assets and found ${stockAuditFamilies.length} failure families (${stockAuditCriticalFamilies.length} critical, ${stockAuditWarningFamilies.length} warning) affecting ${stockAuditSummary?.affected_assets || 0} assets.`,
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
  if (severityRank(steps.stock_analyzer_universe_audit.severity) >= severityRank('critical')) {
    rootCauses.push(buildRootCauseFromStep(steps.stock_analyzer_universe_audit, 'ui_contract'));
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

  // Detect SSOT violations — each is a broken invariant that a "dumb LLM" must see explicitly.
  function detectSsotViolations() {
    const violations = [];
    const now = new Date().toISOString();

    // 1. hist_probs missing ETF class
    const runAssetClasses = histProbsSummary?.asset_classes || [];
    if (histProbsSummary && !runAssetClasses.includes('ETF')) {
      violations.push({
        id: 'hist_probs_missing_etf_class',
        severity: 'critical',
        title: 'hist_probs ran without ETF asset class',
        ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
        why: `Last hist_probs run used asset_classes=[${runAssetClasses.join(',')}]. SSOT run_command requires STOCK,ETF. ETF tickers have no historical profiles in analyze-v4.`,
        evidence: { asset_classes: runAssetClasses, ran_at: histProbsSummary.ran_at },
        fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
        success_signal: 'run-summary.json asset_classes includes both STOCK and ETF',
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
        severity: canonicalLagShortfall > 14 ? 'critical' : canonicalLagShortfall > 7 ? 'warning' : 'info',
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

  const ssotGateSeverity = ssotViolations.length > 0 ? 'warning' : 'ok';
  const localSeverity = [
    rootCauses.reduce((acc, cause) => severityRank(cause.severity) > severityRank(acc) ? cause.severity : acc, 'ok'),
    ssotGateSeverity,
  ].reduce((a, b) => severityRank(a) > severityRank(b) ? a : b);

  const remoteHealth = fetchRemoteWorkflowHealth();
  const remoteWorkflowSeverities = Object.entries(remoteHealth.runs).map(([, run]) => {
    if (!run) return 'warning';
    if (run.status && run.status !== 'completed') return 'warning';
    if (run.conclusion !== 'success') return 'critical';
    const ageDays = daysSince(run.createdAt);
    return ageDays != null && ageDays > 2 ? 'warning' : 'ok';
  });
  const remoteSeverity = remoteHealth.proof_mode === 'remote_unavailable'
    ? 'warning'
    : remoteWorkflowSeverities.reduce((worst, s) => severityRank(s) > severityRank(worst) ? s : worst, 'ok');
  const severity = localSeverity;

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
      local_severity: localSeverity,
      remote_severity: remoteSeverity,
      remote_healthy: remoteSeverity === 'ok',
      proof_mode: remoteHealth.proof_mode,
      live_fetch_status: 'ok',
      automation_severity: automation.severity,
      data_layer_severity: [steps.market_data_refresh, steps.q1_delta_ingest, steps.quantlab_daily_report, steps.hist_probs]
        .reduce((acc, step) => severityRank(step.severity) > severityRank(acc) ? step.severity : acc, 'ok'),
      primary_blocker: (rootCauses.slice().sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0])?.title || null,
      ssot_violations_count: ssotViolations.length,
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
    steps,
    dependencies,
    root_causes: rootCauses,
    primary_actions: primaryActions,
    stock_analyzer_universe_audit: stockAnalyzerAudit || null,
    data_truth_gate: dataFreshness || null,
    ssot: {
      doc_ref: SYSTEM_STATUS_DOC_REF,
      recovery_script: SYSTEM_STATUS_RECOVERY_SCRIPT,
      tracked_step_ids: Object.keys(SYSTEM_STATUS_STEP_CONTRACTS),
      untracked_step_ids: Object.keys(steps).filter((id) => !SYSTEM_STATUS_STEP_CONTRACTS[id]),
      missing_step_ids: Object.keys(SYSTEM_STATUS_STEP_CONTRACTS).filter((id) => !steps[id]),
      web_validation_chain: STOCK_ANALYZER_WEB_VALIDATION_CHAIN,
      violation_contracts: SSOT_VIOLATION_CONTRACTS.map((c) => c.id),
    },
    ssot_violations: ssotViolations,
  };

  fs.mkdirSync(path.dirname(PATHS.output), { recursive: true });
  fs.writeFileSync(PATHS.output, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

main();
