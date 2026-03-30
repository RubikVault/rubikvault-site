import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const LEARNING_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/learning/reports/latest.json');
const QUANTLAB_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json');
const QUANTLAB_OPERATIONAL_STATUS_PATH = path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json');
const FORECAST_LATEST_PATH = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const DECISION_LOGIC_PATH = path.join(REPO_ROOT, 'functions/api/_shared/stock-decisions-v1.js');
const V1_AUDIT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json');
const V1_WEIGHTS_PATH = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights/latest.json');
const V1_WEIGHTS_DIR = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights');
const DIAGNOSTIC_PATH = path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json');
const REGIME_DAILY_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json');
const V5_AUTOPILOT_PATH = path.join(REPO_ROOT, 'public/data/reports/v5-autopilot-status.json');
const SYSTEM_STATUS_PATH = path.join(REPO_ROOT, 'public/data/reports/system-status-latest.json');
const BEST_SETUPS_PATH = path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/dashboard_v6_meta_data.json');

const DEFAULT_V1_WEIGHTS = {
  forecast: 0.20, scientific: 0.20, elliott: 0.15,
  quantlab: 0.15, breakout_v2: 0.15, hist_probs: 0.15,
};

async function readJsonSafely(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fileAge(filePath) {
  try {
    const stat = fsSync.statSync(filePath);
    return (Date.now() - stat.mtimeMs) / 3600000;
  } catch { return null; }
}

function roundedAgeHours(filePath) {
  const age = fileAge(filePath);
  return age == null ? null : Math.round(age * 10) / 10;
}

function statMtimeIso(filePath) {
  try {
    return new Date(fsSync.statSync(filePath).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 86400000));
}

function hoursBetween(later, earlier) {
  if (!later || !earlier) return null;
  const a = new Date(later).getTime();
  const b = new Date(earlier).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round(((a - b) / 3600000) * 10) / 10);
}

function stalenessLevel(staleDays) {
  if (staleDays == null) return 'unknown';
  if (staleDays <= 1) return 'fresh';
  if (staleDays <= 3) return 'acceptable';
  if (staleDays <= 7) return 'stale';
  return 'critical';
}

async function extractLegacyWeights(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const weights = {};
    const matches = content.matchAll(/(\w+)\s*:\s*\{\s*key\s*:\s*'\w+'\s*,\s*weights\s*:\s*\{([^}]+)\}/g);
    for (const match of matches) {
      const horizon = match[1];
      const weightStr = match[2];
      const weightObj = {};
      for (const pair of weightStr.split(',').map(p => p.trim())) {
        const [k, v] = pair.split(':').map(p => p.trim().replace(/'/g, ''));
        if (k && v) weightObj[k] = parseFloat(v);
      }
      weights[horizon] = weightObj;
    }
    if (Object.keys(weights).length > 0) return weights;
    return {
      short: { trend: 0.24, entry: 0.42, risk: 0.18, context: 0.16 },
      medium: { trend: 0.30, entry: 0.30, risk: 0.20, context: 0.20 },
      long: { trend: 0.36, entry: 0.18, risk: 0.16, context: 0.30 },
    };
  } catch { return null; }
}

function loadWeightHistory() {
  try {
    if (!fsSync.existsSync(V1_WEIGHTS_DIR)) return [];
    const files = fsSync.readdirSync(V1_WEIGHTS_DIR)
      .filter(f => f.endsWith('.json') && f !== 'latest.json')
      .sort()
      .slice(-10);
    return files.map(f => {
      try { return JSON.parse(fsSync.readFileSync(path.join(V1_WEIGHTS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function generateRecommendations(models) {
  const recs = [];
  for (const [key, m] of Object.entries(models)) {
    if (m.accuracy_7d != null && m.accuracy_7d < 0.50) {
      recs.push({ level: 'critical', model: key, text: `${m.name}: accuracy below coin-flip (${(m.accuracy_7d * 100).toFixed(1)}%). Recalibration recommended.` });
    } else if (m.accuracy_7d != null && m.accuracy_7d < 0.53 && m.accuracy_7d >= 0.50) {
      recs.push({ level: 'warning', model: key, text: `${m.name}: marginal accuracy (${(m.accuracy_7d * 100).toFixed(1)}%). Monitor closely.` });
    }
    if (m.stale_days != null && m.stale_days > 7) {
      recs.push({ level: 'critical', model: key, text: `${m.name}: data ${m.stale_days} days stale. Pipeline may be broken.` });
    } else if (m.stale_days != null && m.stale_days > 3 && m.stale_days <= 7) {
      recs.push({ level: 'warning', model: key, text: `${m.name}: data ${m.stale_days} days behind. Check ingest pipeline.` });
    }
    if (m.asof === null || m.asof === 'N/A') {
      recs.push({ level: 'warning', model: key, text: `${m.name}: no source timestamp. Model may be inactive.` });
    }
  }
  return recs;
}

function maxSeverity(a, b) {
  const weight = { ok: 0, warning: 1, critical: 2 };
  return (weight[b] || 0) > (weight[a] || 0) ? b : a;
}

function severityRank(level) {
  return ({ ok: 0, warning: 1, critical: 2 }[level] ?? 0);
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByNewest(items, key) {
  return [...items].sort((a, b) => {
    const av = new Date(a?.[key] || a?.updated_at || 0).getTime();
    const bv = new Date(b?.[key] || b?.updated_at || 0).getTime();
    return bv - av;
  });
}

function isoToTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function failureStillActive(failure, recoveredAt) {
  if (!failure) return false;
  const failureAt = isoToTime(failure.finished_at || failure.updated_at || null);
  if (failureAt == null) return true;
  const recoveredAtTime = isoToTime(recoveredAt);
  if (recoveredAtTime == null) return true;
  return failureAt > recoveredAtTime;
}

function flattenAutopilotJobs(autopilot) {
  if (!autopilot?.jobs) return [];
  const jobs = [];
  for (const [mode, entries] of Object.entries(autopilot.jobs || {})) {
    for (const entry of entries || []) jobs.push({ mode, ...entry });
  }
  return sortByNewest(jobs, 'updated_at');
}

function extractRecentFailures(autopilot) {
  const failures = [];
  for (const job of flattenAutopilotJobs(autopilot)) {
    const refresh = job.refresh || null;
    if (refresh?.status === 'failed') {
      const failedStepName = refresh.failed_step || Object.entries(refresh.steps || {}).find(([, step]) => step?.status === 'failed')?.[0] || null;
      const failedStep = failedStepName ? refresh.steps?.[failedStepName] : null;
      failures.push({
        mode: job.mode,
        job_dir: job.job_dir,
        updated_at: job.updated_at || null,
        started_at: refresh.started_at || failedStep?.started_at || null,
        finished_at: refresh.finished_at || failedStep?.finished_at || job.updated_at || null,
        failed_step: failedStepName,
        command: failedStep?.command || null,
        returncode: failedStep?.returncode ?? null,
        status: refresh.status,
        error: failedStep?.error || null,
      });
    } else if ((job.summary?.failed || 0) > 0) {
      failures.push({
        mode: job.mode,
        job_dir: job.job_dir,
        updated_at: job.updated_at || null,
        started_at: null,
        finished_at: job.updated_at || null,
        failed_step: 'job_summary_failed',
        command: null,
        returncode: null,
        status: 'failed',
        error: `${job.summary.failed} task(s) failed`,
      });
    }
  }
  return dedupeBy(sortByNewest(failures, 'finished_at'), (item) => `${item.job_dir}:${item.failed_step}`).slice(0, 5);
}

function extractLastSuccessfulJobs(autopilot) {
  const successes = [];
  for (const job of flattenAutopilotJobs(autopilot)) {
    const refresh = job.refresh || null;
    if (refresh && refresh.status && refresh.status !== 'failed') {
      successes.push({
        mode: job.mode,
        job_dir: job.job_dir,
        updated_at: job.updated_at || null,
        started_at: refresh.started_at || null,
        finished_at: refresh.finished_at || job.updated_at || null,
        status: refresh.status,
      });
      continue;
    }
    if (!refresh && (job.summary?.failed || 0) === 0 && (job.summary?.done || 0) > 0) {
      successes.push({
        mode: job.mode,
        job_dir: job.job_dir,
        updated_at: job.updated_at || null,
        started_at: null,
        finished_at: job.updated_at || null,
        status: 'completed',
      });
    }
  }
  return dedupeBy(sortByNewest(successes, 'finished_at'), (item) => item.job_dir).slice(0, 5);
}

function buildModelContract(base, options = {}) {
  const {
    sourceFilePath = null,
    reportGeneratedAt = null,
    dataAsof = null,
    lastSuccessfulRunAt = null,
    pipelineStatus = 'unknown',
    pipelineError = null,
    owner = null,
    subsystem = null,
    metricNaReason = null,
  } = options;

  const sourceAge = sourceFilePath ? roundedAgeHours(sourceFilePath) : null;
  const reportTime = reportGeneratedAt || statMtimeIso(sourceFilePath);
  const successTime = lastSuccessfulRunAt || reportTime || dataAsof || null;

  return {
    ...base,
    asof: dataAsof,
    data_asof: dataAsof,
    report_date: reportGeneratedAt,
    report_generated_at: reportTime,
    report_age_hours: sourceAge,
    source_file_age_hours: sourceAge,
    stale_days_now: base.stale_days,
    freshness_reason: base.stale_reason || null,
    last_successful_run_at: successTime,
    pipeline_status: pipelineStatus,
    pipeline_error: pipelineError,
    owner,
    subsystem,
    metric_na_reason: metricNaReason,
  };
}

function rootCause(severity, category, title, why, impact, fix, owner, subsystem, extras = {}) {
  return {
    id: extras.id || title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    severity,
    category,
    title,
    why,
    impact,
    fix,
    owner,
    subsystem,
    file_ref: extras.file_ref || null,
    source_key: extras.source_key || null,
    evidence_at: extras.evidence_at || null,
  };
}

function buildRootCauses({ models, pipelineDiagnostic, v1Report, recentFailures, v1Weights, operatingModes, systemStatusReport }) {
  const causes = (systemStatusReport?.root_causes || []).map((cause) => ({
    ...cause,
    source_key: cause.source_key || 'system_status',
  }));
  const latestFailure = recentFailures[0];
  if (latestFailure?.failed_step === 'forecast_run_daily') {
    causes.push(rootCause(
      'critical',
      'live_infra',
      'Forecast daily pipeline failing',
      `Latest recorded failure in ${latestFailure.failed_step} (${latestFailure.returncode ?? 'unknown'}) at ${latestFailure.finished_at || latestFailure.updated_at || 'unknown time'}.`,
      'Forecast refresh can stop downstream snapshot freshness and distort dashboard trust.',
      'Inspect and rerun scripts/forecast/run_daily.mjs; keep the failure surfaced in ops artifacts until a successful run lands.',
      'Forecast',
      'forecast',
      { file_ref: 'scripts/forecast/run_daily.mjs', source_key: 'forecast', evidence_at: latestFailure.finished_at || latestFailure.updated_at }
    ));
  }

  if (models.scientific?.data_asof == null && (models.scientific?.predictions_today || 0) === 0) {
    causes.push(rootCause(
      'critical',
      'model_availability',
      'Scientific source currently unavailable',
      'Scientific analyzer has no source timestamp and no predictions for today.',
      'Scientific inputs are effectively absent, so the dashboard cannot distinguish inactivity from missing data without operator action.',
      'Rebuild scientific summary or snapshot and wire the latest timestamp into the learning report.',
      'Scientific',
      'scientific',
      { file_ref: 'scripts/build-scientific-summary.mjs', source_key: 'scientific', evidence_at: models.scientific?.report_generated_at }
    ));
  }

  if (models.quantlab?.staleness_level === 'critical') {
    causes.push(rootCause(
      'critical',
      'data_freshness',
      'QuantLab raw inputs are critically stale',
      models.quantlab.freshness_reason || `QuantLab raw inputs are ${models.quantlab.stale_days_now}d old.`,
      'Breakout, snapshot, and QuantLab-backed decisions can look healthy while relying on stale market input.',
      'Repair the v7 history refresh and Q1 delta-ingest chain, then rebuild the QuantLab daily report before trusting any QuantLab-derived outputs.',
      'QuantLab',
      'quantlab',
      { file_ref: 'mirrors/quantlab/reports/v4-daily/latest.json', source_key: 'quantlab', evidence_at: models.quantlab?.report_generated_at }
    ));
  }

  if (models.hist_probs?.staleness_level === 'critical') {
    causes.push(rootCause(
      'critical',
      'data_freshness',
      'Historical probabilities are stale',
      models.hist_probs.freshness_reason || `Historical probabilities are ${models.hist_probs.stale_days_now}d old.`,
      'Regime context and passive probability inputs are lagging the market.',
      'Advance the upstream raw bars, then recompute hist-probs/regime inputs and verify the model input date advances.',
      'Hist Probs',
      'hist_probs',
      { file_ref: 'scripts/lib/hist-probs/run-hist-probs.mjs', source_key: 'hist_probs', evidence_at: models.hist_probs?.report_generated_at }
    ));
  }

  if ((pipelineDiagnostic?.etf_stage_counts?.snapshot || 0) === 0 || (pipelineDiagnostic?.stock_stage_counts?.snapshot || 0) === 0) {
    causes.push(rootCause(
      'critical',
      'decision_funnel',
      'Snapshot funnel emits zero final rows',
      `${pipelineDiagnostic?.diagnosis_code || 'SNAPSHOT_EMPTY'} with ETF snapshot=${pipelineDiagnostic?.etf_stage_counts?.snapshot ?? 0}, stock snapshot=${pipelineDiagnostic?.stock_stage_counts?.snapshot ?? 0}.`,
      'V1 and frontpage snapshot consumers cannot rely on the publish funnel when no final rows are emitted.',
      'Inspect funnel rejections and gate reasons, then restore non-zero snapshot output.',
      'Snapshot',
      'breakout_v2',
      { file_ref: 'public/data/reports/best-setups-etf-diagnostic-latest.json', source_key: 'pipeline_diagnostic', evidence_at: pipelineDiagnostic?.generated_at }
    ));
  }

  if (v1Report && (v1Report.signals_today || 0) === 0) {
    causes.push(rootCause(
      'warning',
      'v1_readiness',
      'V1 audit produced zero signals',
      'The latest V1 audit report contains no signals and no matured evidence.',
      'Hit rate and evidence quality remain unavailable, blocking trustworthy cutover decisions.',
      'Expose gate rejection reasons in the V1 audit path and restore a non-zero audited signal set before cutover.',
      'V1',
      'v1_audit',
      { file_ref: 'public/data/reports/quantlab-v1-latest.json', source_key: 'v1_audit', evidence_at: v1Report?.report_generated_at }
    ));
  }

  if (v1Weights?.fallback_level && v1Weights.fallback_level !== 'none') {
    causes.push(rootCause(
      'warning',
      'v1_readiness',
      'Fusion still running on fallback weights',
      `Current fusion weights use fallback level ${v1Weights.fallback_level}.`,
      'Source weighting is not yet evidence-backed, so cutover readiness remains provisional.',
      'Promote learned weights only after the snapshot and audit flows recover.',
      'V1',
      'v1_weights',
      { file_ref: 'mirrors/learning/quantlab-v1/weights/latest.json', source_key: 'v1_weights', evidence_at: v1Weights?.timestamp }
    ));
  }

  if (operatingModes.includes('BOOTSTRAP')) {
    causes.push(rootCause(
      'warning',
      'v1_readiness',
      'Learning remains in bootstrap mode',
      'Minimum observation counts are not yet satisfied across all horizons.',
      'Promotion and safety automation cannot be trusted as production-ready.',
      'Increase resolved outcomes coverage before enabling promotions or cutover decisions.',
      'Learning',
      'learning',
      { file_ref: 'public/data/reports/v5-autopilot-status.json', source_key: 'learning' }
    ));
  }

  return dedupeBy(
    causes,
    (cause) => [cause.category || 'uncategorized', cause.subsystem || 'system', cause.title || cause.id || 'untitled'].join(':')
  ).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function buildPrimaryActions(rootCauses) {
  return rootCauses.slice(0, 6).map((cause) => ({
    id: cause.id,
    severity: cause.severity,
    category: cause.category,
    title: cause.title,
    why: cause.why,
    impact: cause.impact,
    action: cause.fix,
    owner: cause.owner,
    subsystem: cause.subsystem,
    file_ref: cause.file_ref || null,
  }));
}

function summarizeSystemStatus(rootCauses, learningStatus) {
  const severity = rootCauses.reduce((acc, cause) => maxSeverity(acc, cause.severity), 'ok');
  const label = severity === 'critical' ? 'CRITICAL' : severity === 'warning' ? 'WARNING' : 'OK';
  return {
    severity,
    label,
    detail: rootCauses.slice(0, 4).map((cause) => cause.title),
    learning_status: learningStatus || 'UNKNOWN',
  };
}

function buildOperatingModes({ learning, v1Mode, v1Report, v1Weights, rootCauses }) {
  const modes = [];
  if (v1Mode === 'shadow_v1') modes.push('SHADOW_ONLY');
  const safetyLevel = learning?.learning?.safety_switch?.level || learning?.summary?.safety_switch?.level || learning?.safety_switch?.level || null;
  const learningStatus = learning?.learning?.learning_status || learning?.summary?.learning_status || learning?.summary?.overall_status || null;
  if (safetyLevel === 'BOOTSTRAP' || learningStatus === 'BOOTSTRAP') modes.push('BOOTSTRAP');
  if (v1Weights?.fallback_level && v1Weights.fallback_level !== 'none') modes.push('FALLBACK_WEIGHTS');
  if ((v1Report?.signals_today || 0) === 0) modes.push('PROMOTION_BLOCKED');
  if (rootCauses.some((cause) => cause.category === 'v1_readiness' || cause.category === 'decision_funnel')) modes.push('CUTOVER_BLOCKED');
  return Array.from(new Set(modes));
}

function dataTruthState(severity, rootCauses) {
  if (severity === 'critical') return `Critical truth degradation: ${rootCauses[0]?.title || 'multiple blockers detected'}.`;
  if (severity === 'warning') return `Partially degraded truth: ${rootCauses[0]?.title || 'warnings present'}.`;
  return 'Fresh and internally consistent.';
}

function sourceFileMeta(filePath, extra = {}) {
  return {
    exists: !!(filePath && fsSync.existsSync(filePath)),
    age_hours: roundedAgeHours(filePath) ?? -1,
    ...extra,
  };
}

async function main() {
  const [learning, quantlab, quantlabOperationalStatus, forecastLatest, legacyWeights, v1AuditReport, v1WeightsLatest, diagnostic, regimeDaily, autopilot, systemStatusReport, bestSetups] = await Promise.all([
    readJsonSafely(LEARNING_REPORT_PATH),
    readJsonSafely(QUANTLAB_REPORT_PATH),
    readJsonSafely(QUANTLAB_OPERATIONAL_STATUS_PATH),
    readJsonSafely(FORECAST_LATEST_PATH),
    extractLegacyWeights(DECISION_LOGIC_PATH),
    readJsonSafely(V1_AUDIT_REPORT_PATH),
    readJsonSafely(V1_WEIGHTS_PATH),
    readJsonSafely(DIAGNOSTIC_PATH),
    readJsonSafely(REGIME_DAILY_PATH),
    readJsonSafely(V5_AUTOPILOT_PATH),
    readJsonSafely(SYSTEM_STATUS_PATH),
    readJsonSafely(BEST_SETUPS_PATH),
  ]);

  const v1WeightHistory = loadWeightHistory();
  const recentFailures = extractRecentFailures(autopilot);
  const lastSuccessfulJobs = extractLastSuccessfulJobs(autopilot);
  const latestForecastFailure = recentFailures.find((item) => item.failed_step === 'forecast_run_daily');
  const forecastArtifactGeneratedAt = forecastLatest?.generated_at || statMtimeIso(FORECAST_LATEST_PATH);
  const forecastFailureActive = failureStillActive(latestForecastFailure, forecastArtifactGeneratedAt || forecastLatest?.data?.asof || null);
  const bestSetupsGeneratedAt = bestSetups?.meta?.generated_at || bestSetups?.generated_at || statMtimeIso(BEST_SETUPS_PATH);
  const bestSetupsDataAsof = bestSetups?.meta?.data_asof || bestSetups?.meta?.forecast_asof || bestSetups?.meta?.quantlab_asof || null;

  const output = {
    generated_at: new Date().toISOString(),
    models: {},
    legacy_weights: legacyWeights || {},
    v1_weights: null,
    v1_weight_history: [],
    v1_report: null,
    pipeline_diagnostic: null,
    recommendations: [],
    history: [],
    system: {},
    meta: {
      generated_at: new Date().toISOString(),
      source_files: {
        learning_report: sourceFileMeta(LEARNING_REPORT_PATH, { date: learning?.date || null }),
        quantlab_report: sourceFileMeta(QUANTLAB_REPORT_PATH, { date: quantlab?.reportDate || null }),
        quantlab_operational_status: sourceFileMeta(QUANTLAB_OPERATIONAL_STATUS_PATH, { date: quantlabOperationalStatus?.generatedAt || null }),
        v1_audit_report: sourceFileMeta(V1_AUDIT_REPORT_PATH, { date: v1AuditReport?.date || null }),
        v1_weights: sourceFileMeta(V1_WEIGHTS_PATH, { version: v1WeightsLatest?.version || null }),
        diagnostic: sourceFileMeta(DIAGNOSTIC_PATH, { date: diagnostic?.generated_at || null }),
        regime_daily: sourceFileMeta(REGIME_DAILY_PATH, { date: regimeDaily?.date || null }),
        best_setups_snapshot: sourceFileMeta(BEST_SETUPS_PATH, { date: bestSetupsGeneratedAt }),
        v5_autopilot: sourceFileMeta(V5_AUTOPILOT_PATH, { date: autopilot?.generated_at || null }),
        system_status: sourceFileMeta(SYSTEM_STATUS_PATH, { date: systemStatusReport?.generated_at || null }),
      },
    },
  };

  // 1. Learning report models (Forecast, Scientific, Elliott)
  if (learning?.features) {
    for (const [key, feat] of Object.entries(learning.features)) {
      if (key === 'stock_analyzer') continue;
      const dataAsof = feat.source_meta?.asof || null;
      const staleDaysNow = dataAsof ? daysSince(dataAsof) : null;
      const baseModel = {
        name: feat.name,
        type: feat.type,
        universe_size: feat.predictions_total || 0,
        accuracy: feat.accuracy_all || 0,
        accuracy_7d: feat.accuracy_7d || 0,
        hit_rate_all: feat.hit_rate_all || 0,
        trend: feat.trend_accuracy || 'stable',
        stale_days: staleDaysNow,
        staleness_level: stalenessLevel(staleDaysNow),
        predictions_today: feat.predictions_today || 0,
        stale_reason: dataAsof
          ? `Learning source ${feat.source_meta?.source || key} last as-of ${dataAsof}`
          : `Learning source ${feat.source_meta?.source || key} has no current timestamp`,
      };
      const pipelineStatus = key === 'forecast' && forecastFailureActive
        ? 'failed'
        : dataAsof == null && (feat.predictions_today || 0) === 0
          ? 'failed'
          : staleDaysNow == null
            ? 'unknown'
            : staleDaysNow > 7
              ? 'stale'
              : staleDaysNow > 3
                ? 'degraded'
                : 'ok';
      const pipelineError = key === 'forecast' && forecastFailureActive
        ? `${latestForecastFailure.failed_step} failed with returncode ${latestForecastFailure.returncode ?? 'unknown'}`
        : dataAsof == null && (feat.predictions_today || 0) === 0
          ? 'No current source timestamp or predictions'
          : null;
      output.models[key] = buildModelContract(baseModel, {
        sourceFilePath: key === 'forecast' ? FORECAST_LATEST_PATH : LEARNING_REPORT_PATH,
        reportGeneratedAt: key === 'forecast' ? (forecastArtifactGeneratedAt || statMtimeIso(LEARNING_REPORT_PATH)) : statMtimeIso(LEARNING_REPORT_PATH),
        dataAsof,
        lastSuccessfulRunAt: key === 'forecast'
          ? (forecastArtifactGeneratedAt || forecastLatest?.data?.asof || dataAsof || learning?.date || statMtimeIso(LEARNING_REPORT_PATH))
          : (dataAsof || learning?.date || statMtimeIso(LEARNING_REPORT_PATH)),
        pipelineStatus,
        pipelineError,
        owner: key === 'forecast' ? 'Forecast' : key === 'scientific' ? 'Scientific' : 'Elliott',
        subsystem: key,
      });
    }
    output.history = learning.history || [];
  }

  // 2. QuantLab card
  if (quantlab) {
    const ag = quantlab.agentReadiness?.summary || {};
    const quantlabStatusStep = systemStatusReport?.steps?.quantlab_daily_report || null;
    const operationalFreshness = quantlabOperationalStatus || quantlab.currentState?.dataFreshness || null;
    const rawFreshness = operationalFreshness?.rawBars || quantlabStatusStep?.status_detail?.raw_freshness || quantlab.currentState?.preflight?.rawFreshness || {};
    const featureFreshness = operationalFreshness?.featureStore || quantlabStatusStep?.status_detail?.feature_store_freshness || {};
    const publishFreshness = operationalFreshness?.stockPublish || quantlabStatusStep?.status_detail?.stock_publish_freshness || {};
    const summaryFreshness = operationalFreshness?.summary || quantlabStatusStep?.status_detail?.operational_freshness || null;
    const quantlabMarketAsof = rawFreshness.latestAnyRequiredDataDate
      || rawFreshness.latest_any_data_date
      || rawFreshness.latestAnyRequiredIngestDate
      || rawFreshness.latest_any_ingest_date
      || null;
    const quantlabPublishAsof = publishFreshness.asOfDate
      || featureFreshness.asOfDate
      || rawFreshness.latestCanonicalRequiredDataDate
      || rawFreshness.latest_required_data_date
      || rawFreshness.latestCanonicalRequiredIngestDate
      || rawFreshness.latest_required_ingest_date
      || null;
    const quantlabDataAsof = summaryFreshness?.severity === 'ok'
      ? (quantlabMarketAsof || quantlabPublishAsof)
      : (quantlabPublishAsof || quantlabMarketAsof);
    const staleDays = summaryFreshness?.severity === 'ok'
      ? daysSince(quantlabDataAsof)
      : (
        publishFreshness.ageCalendarDays
        ?? featureFreshness.ageCalendarDays
        ?? rawFreshness.latestCanonicalAgeCalendarDays
        ?? rawFreshness.latest_required_age_calendar_days
        ?? daysSince(quantlabDataAsof)
      );
    const staleReason = summaryFreshness?.message
      || quantlabStatusStep?.why
      || rawFreshness.reasonCodes?.join(' | ')
      || rawFreshness.reason_codes?.join(' | ')
      || 'QuantLab data freshness unavailable';
    const pipelineStatus = summaryFreshness?.severity === 'ok'
      ? 'ok'
      : quantlabStatusStep?.severity === 'critical'
      ? 'failed'
      : quantlabStatusStep?.severity === 'warning'
        ? 'degraded'
        : staleDays > 7
          ? 'stale'
          : staleDays > 3
            ? 'degraded'
            : 'ok';
    output.models.quantlab = buildModelContract({
      name: quantlab.objective?.title || 'Quant Lab System',
      type: 'Expert Swarm / Stability',
      universe_size: ag.universeSymbolsTotal || 71140,
      active_universe: ag.scoredTodayAssetsTotal || 0,
      accuracy: quantlab.currentState?.overnightStability?.task_success_rate || 0,
      accuracy_7d: quantlab.currentState?.overnightStability?.task_success_rate || 0,
      accuracy_label: 'Task Success Rate',
      stage_stability: quantlab.currentState?.stagebStability?.strict_positive_ratio_all || 0,
      trend: 'active',
      stale_days: staleDays,
      staleness_level: stalenessLevel(staleDays),
      stale_reason: staleReason,
      details: {
        super_stark: ag.superStrongTotal,
        stark: ag.strongTotal,
        sehr_schwach: ag.veryWeakTotal,
        overnight_stability_score: quantlab.currentState?.overnightStability?.stability_score,
        overnight_completion: quantlab.currentState?.overnightStability?.completion_rate,
        jobs_total: quantlab.currentState?.overnightStability?.total_jobs,
        jobs_completed: quantlab.currentState?.overnightStability?.completed_jobs,
        feature_store_asof: featureFreshness.asOfDate || null,
        stock_publish_asof: publishFreshness.asOfDate || null,
        raw_canonical_asof: rawFreshness.latestCanonicalRequiredDataDate || rawFreshness.latest_required_data_date || rawFreshness.latestCanonicalRequiredIngestDate || rawFreshness.latest_required_ingest_date || null,
        raw_any_asof: rawFreshness.latestAnyRequiredDataDate || rawFreshness.latest_any_data_date || rawFreshness.latestAnyRequiredIngestDate || rawFreshness.latest_any_ingest_date || null,
      },
    }, {
      sourceFilePath: QUANTLAB_OPERATIONAL_STATUS_PATH,
      reportGeneratedAt: quantlabOperationalStatus?.generatedAt || statMtimeIso(QUANTLAB_OPERATIONAL_STATUS_PATH) || statMtimeIso(QUANTLAB_REPORT_PATH),
      dataAsof: quantlabDataAsof,
      lastSuccessfulRunAt: quantlab.reportDate || statMtimeIso(QUANTLAB_REPORT_PATH),
      pipelineStatus,
      pipelineError: quantlabStatusStep?.next_fix || (staleDays > 3 ? staleReason : null),
      owner: 'QuantLab',
      subsystem: 'quantlab',
    });
  }

  // 3. Breakout card — no hardcoded accuracy
  const breakoutDataAsof = bestSetupsDataAsof;
  const breakoutStaleDays = breakoutDataAsof ? daysSince(breakoutDataAsof) : null;
  output.models.breakout_v2 = buildModelContract({
    name: 'Breakout V2',
    type: 'Momentum / Breakout Detection',
    universe_size: output.models.quantlab?.active_universe || 0,
    accuracy: null,
    accuracy_7d: null,
    accuracy_label: 'No independent metric',
    trend: 'stable',
    stale_days: breakoutStaleDays,
    staleness_level: stalenessLevel(breakoutStaleDays),
    stale_reason: breakoutDataAsof
      ? `Best-setups snapshot depends on data as-of ${breakoutDataAsof}`
      : 'Best-setups snapshot has no data as-of timestamp',
  }, {
    sourceFilePath: BEST_SETUPS_PATH,
    reportGeneratedAt: bestSetupsGeneratedAt,
    dataAsof: breakoutDataAsof,
    lastSuccessfulRunAt: bestSetupsGeneratedAt,
    pipelineStatus: breakoutStaleDays == null ? 'unknown' : breakoutStaleDays > 7 ? 'stale' : breakoutStaleDays > 3 ? 'degraded' : 'ok',
    pipelineError: breakoutStaleDays > 3 ? 'Snapshot inputs are stale or incomplete' : null,
    owner: 'Snapshot',
    subsystem: 'breakout_v2',
    metricNaReason: 'Breakout V2 has no standalone historical accuracy metric; evaluate via snapshot throughput and gate outcomes.',
  });

  // 4. hist_probs card
  const histProbStaleDays = daysSince(regimeDaily?.date);
  output.models.hist_probs = buildModelContract({
    name: 'Historical Probabilities',
    type: 'Event-Based Statistics',
    universe_size: output.models.quantlab?.active_universe || 0,
    accuracy: null,
    accuracy_7d: null,
    accuracy_label: 'Passive source — no accuracy metric',
    trend: regimeDaily ? 'active' : 'unknown',
    stale_days: histProbStaleDays,
    staleness_level: stalenessLevel(histProbStaleDays),
    stale_reason: regimeDaily?.date
      ? `Regime daily last market date ${regimeDaily.date}`
      : 'Regime daily file missing market date',
    regime: regimeDaily ? {
      market: regimeDaily.market_regime,
      volatility: regimeDaily.volatility_regime,
      breadth: regimeDaily.breadth_regime,
    } : null,
  }, {
    sourceFilePath: REGIME_DAILY_PATH,
    reportGeneratedAt: regimeDaily?.computed_at || statMtimeIso(REGIME_DAILY_PATH),
    dataAsof: regimeDaily?.date || null,
    lastSuccessfulRunAt: regimeDaily?.computed_at || statMtimeIso(REGIME_DAILY_PATH),
    pipelineStatus: histProbStaleDays == null ? 'unknown' : histProbStaleDays > 7 ? 'stale' : histProbStaleDays > 3 ? 'degraded' : 'ok',
    pipelineError: histProbStaleDays > 3 ? 'Regime input date is lagging the current market.' : null,
    owner: 'Hist Probs',
    subsystem: 'hist_probs',
    metricNaReason: 'Passive source; use regime date, freshness, and coverage instead of accuracy.',
  });

  // 5. V1 fusion source weights
  if (v1WeightsLatest) {
    output.v1_weights = {
      version: v1WeightsLatest.version,
      timestamp: v1WeightsLatest.timestamp,
      fallback_level: v1WeightsLatest.fallback_level,
      trigger: v1WeightsLatest.trigger,
      weights: v1WeightsLatest.weights,
    };
  } else {
    output.v1_weights = {
      version: 'default-prior',
      timestamp: null,
      fallback_level: 'default_prior',
      trigger: 'no_snapshots',
      weights: { ...DEFAULT_V1_WEIGHTS },
    };
  }

  // 6. V1 weight history
  output.v1_weight_history = v1WeightHistory.map(s => ({
    version: s.version,
    timestamp: s.timestamp,
    weights: s.weights,
    fallback_level: s.fallback_level,
  }));

  // 7. V1 audit report data
  if (v1AuditReport) {
    output.v1_report = {
      mode: v1AuditReport.mode || null,
      signals_today: v1AuditReport.signals_today || 0,
      verdict_distribution: v1AuditReport.verdict_distribution || null,
      hit_rate: v1AuditReport.hit_rate_matured ?? null,
      matured_signals: v1AuditReport.matured_signals || 0,
      top_sources: v1AuditReport.top_sources || null,
      avg_evidence_quality: v1AuditReport.avg_evidence_quality ?? null,
      governance_warnings: v1AuditReport.governance_warnings || null,
      fallback_usage: v1AuditReport.fallback_usage || null,
      regime_transition_active: v1AuditReport.regime_transition_active || false,
      friction_impact_avg: v1AuditReport.friction_impact_avg || null,
      report_date: v1AuditReport.date || null,
      report_timestamp: v1AuditReport.timestamp || null,
      report_age_hours: roundedAgeHours(V1_AUDIT_REPORT_PATH),
      report_generated_at: v1AuditReport.timestamp || statMtimeIso(V1_AUDIT_REPORT_PATH),
      last_successful_run_at: v1AuditReport.timestamp || statMtimeIso(V1_AUDIT_REPORT_PATH),
      pipeline_status: (v1AuditReport.signals_today || 0) === 0 ? 'degraded' : 'ok',
      pipeline_error: (v1AuditReport.signals_today || 0) === 0 ? 'No audited signals were emitted.' : null,
      metric_na_reason: (v1AuditReport.matured_signals || 0) === 0 ? 'No matured signals available yet.' : null,
    };
  }

  // 8. Pipeline diagnostic
  if (diagnostic?.diagnosis) {
    output.pipeline_diagnostic = {
      diagnosis_code: diagnostic.diagnosis.code,
      severity: diagnostic.diagnosis.severity,
      explanation: diagnostic.diagnosis.explanation,
      stage_counts: diagnostic.stage_counts || null,
      etf_stage_counts: diagnostic.stage_counts ? {
        registry: diagnostic.stage_counts.registry_etf_total || 0,
        opinions: diagnostic.stage_counts.asset_opinions_etf_total || 0,
        published: diagnostic.stage_counts.publish_etf_total || 0,
        snapshot: diagnostic.stage_counts.snapshot_etf_total || 0,
      } : null,
      stock_stage_counts: diagnostic.stage_counts ? {
        registry: diagnostic.stage_counts.registry_stock_total || 0,
        opinions: diagnostic.stage_counts.asset_opinions_stock_total || 0,
        published: diagnostic.stage_counts.publish_stock_total || 0,
        snapshot: diagnostic.stage_counts.snapshot_stock_total || 0,
      } : null,
      rejection_breakdown: diagnostic.etf_snapshot_rejection_breakdown || null,
      snapshot_counts: diagnostic.snapshot_counts || null,
      last_successful_generation_at: diagnostic.evidence?.snapshot_generated_at || null,
      generated_at: diagnostic.generated_at || null,
      age_hours: roundedAgeHours(DIAGNOSTIC_PATH),
    };
  }

  // 9. Operations (from V5 sources)
  output.operations = {
    autopilot: autopilot || null,
    candidate_counts: bestSetups?.meta?.candidate_counts || null,
    setup_phases: bestSetups?.meta?.setup_phase_counts || null,
    snapshots_date: bestSetupsGeneratedAt,
    verified_counts: bestSetups?.meta?.verified_counts || null,
    recent_failures: recentFailures.map((item) => ({
      ...item,
      age_hours: hoursBetween(new Date().toISOString(), item.finished_at || item.updated_at || null),
    })),
    last_successful_jobs: lastSuccessfulJobs.map((item) => ({
      ...item,
      age_hours: hoursBetween(new Date().toISOString(), item.finished_at || item.updated_at || null),
    })),
    system_status: systemStatusReport || null,
    dependency_chain: systemStatusReport?.dependencies || [],
    automation_summary: systemStatusReport?.automation || null,
  };

  // 10. Deep diagnosis data (from learning report)
  output.deep_diagnosis = learning?.features || null;
  output.weekly_comparison = learning?.weekly_comparison ? {
    forecast: { metric_label: 'Accuracy', ...(learning.weekly_comparison.forecast || {}) },
    scientific: { metric_label: 'Hit Rate', ...(learning.weekly_comparison.scientific || {}) },
    elliott: { metric_label: 'Accuracy', ...(learning.weekly_comparison.elliott || {}) },
    quantlab: { metric_label: 'Task Success Rate', ...(learning.weekly_comparison.quantlab || {}) },
  } : null;
  output.improvements_active = learning?.improvements_active || [];

  // 11. Auto-recommendations
  output.recommendations = generateRecommendations(output.models);

  // 12. System status
  const provisionalModes = buildOperatingModes({
    learning: learning || {},
    v1Mode: v1AuditReport?.mode || 'shadow_v1',
    v1Report: output.v1_report,
    v1Weights: output.v1_weights,
    rootCauses: [],
  });
  const rootCauses = buildRootCauses({
    models: output.models,
    pipelineDiagnostic: output.pipeline_diagnostic,
    v1Report: output.v1_report,
    recentFailures: forecastFailureActive ? output.operations.recent_failures : output.operations.recent_failures.filter((item) => item.failed_step !== 'forecast_run_daily'),
    v1Weights: output.v1_weights,
    operatingModes: provisionalModes,
    systemStatusReport,
  });
  const primaryActions = buildPrimaryActions(rootCauses);
  const systemStatus = summarizeSystemStatus(
    rootCauses,
    learning?.summary?.overall_status || 'UNKNOWN'
  );
  const operatingModes = buildOperatingModes({
    learning: learning || {},
    v1Mode: v1AuditReport?.mode || 'shadow_v1',
    v1Report: output.v1_report,
    v1Weights: output.v1_weights,
    rootCauses,
  });

  output.system = {
    overall_status: systemStatus.label,
    status_severity: systemStatus.severity,
    status_detail: systemStatus.detail,
    learning_status: systemStatus.learning_status,
    live_status: 'ok',
    snapshot_age_hours: 0,
    data_truth_state: dataTruthState(systemStatus.severity, rootCauses),
    root_causes: rootCauses,
    primary_actions: primaryActions,
    operating_modes: operatingModes,
    production_ready: rootCauses.every((cause) => cause.severity !== 'critical') && (output.v1_report?.signals_today || 0) > 0 && operatingModes.length === 0,
    cutover_ready: !operatingModes.some((mode) => ['SHADOW_ONLY', 'BOOTSTRAP', 'FALLBACK_WEIGHTS', 'PROMOTION_BLOCKED', 'CUTOVER_BLOCKED'].includes(mode)),
    v1_mode: v1AuditReport?.mode || 'shadow_v1',
    quantlab_readiness: quantlab?.progress?.readiness?.pct ?? null,
    quantlab_implementation: quantlab?.progress?.implementation?.pct ?? null,
    automation_health: systemStatusReport?.automation || null,
    dependency_health: systemStatusReport?.dependencies || [],
    regime: regimeDaily ? {
      market: regimeDaily.market_regime,
      volatility: regimeDaily.volatility_regime,
      breadth: regimeDaily.breadth_regime,
      date: regimeDaily.date,
    } : null,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
}

export {
  buildModelContract,
  buildOperatingModes,
  buildPrimaryActions,
  buildRootCauses,
  dataTruthState,
  dedupeBy,
  extractLastSuccessfulJobs,
  extractRecentFailures,
  main,
  summarizeSystemStatus,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(console.error);
}
