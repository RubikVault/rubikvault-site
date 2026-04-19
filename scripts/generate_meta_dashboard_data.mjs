import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PIPELINE_STEP_ORDER } from './ops/system-status-ssot.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const LEARNING_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/learning/reports/latest.json');
const QUANTLAB_REPORT_PATH = path.join(REPO_ROOT, 'mirrors/quantlab/reports/v4-daily/latest.json');
const QUANTLAB_OPERATIONAL_STATUS_PATH = path.join(REPO_ROOT, 'public/data/quantlab/status/operational-status.json');
const FORECAST_LATEST_PATH = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const NIGHTLY_STATUS_PATH = path.join(REPO_ROOT, 'public/data/reports/nightly-stock-analyzer-status.json');
const RECOVERY_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/dashboard-green-recovery-latest.json');
const RECOVERY_STATE_PATH = path.join(REPO_ROOT, 'mirrors/ops/dashboard-green/state.json');
const RECOVERY_ACTION_LOG_PATH = path.join(REPO_ROOT, 'logs/dashboard_v7/recovery-actions.log');
const RECOVERY_HEARTBEAT_LOG_PATH = path.join(REPO_ROOT, 'logs/dashboard_v7/recovery-heartbeat.log');
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const FINAL_INTEGRITY_SEAL_PATH = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const PIPELINE_RUNTIME_PATH = path.join(REPO_ROOT, 'public/data/pipeline/runtime/latest.json');
const PIPELINE_EPOCH_PATH = path.join(REPO_ROOT, 'public/data/pipeline/epoch.json');
const DECISION_LOGIC_PATH = path.join(REPO_ROOT, 'functions/api/_shared/stock-decisions-v1.js');
const V1_AUDIT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/quantlab-v1-latest.json');
const V1_WEIGHTS_PATH = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights/latest.json');
const V1_WEIGHTS_DIR = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights');
const DIAGNOSTIC_PATH = path.join(REPO_ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json');
const REGIME_DAILY_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json');
const SYSTEM_STATUS_PATH = path.join(REPO_ROOT, 'public/data/reports/system-status-latest.json');
const DATA_FRESHNESS_PATH = path.join(REPO_ROOT, 'public/data/reports/data-freshness-latest.json');
const BEST_SETUPS_PATH = path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json');
const PIPELINE_LEDGER_PATH = path.join(REPO_ROOT, 'public/data/ops/pipeline-run-ledger.ndjson');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/dashboard_v6_meta_data.json');
const V7_STATUS_OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/ui/dashboard-v7-status.json');

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

function buildPipelineErrorFrequency(ledgerPath) {
  try {
    if (!fsSync.existsSync(ledgerPath)) return {};
    const raw = fsSync.readFileSync(ledgerPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const cutoffMs = Date.now() - (30 * 86400000);
    const grouped = {};
    for (const line of lines) {
      let entry = null;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = new Date(entry?.ts || entry?.created_at || 0).getTime();
      if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      const stepId = String(entry?.step_id || '').trim();
      if (!stepId) continue;
      const bucket = grouped[stepId] || {
        total_runs: 0,
        failures: 0,
        last_failure_at: null,
        last_failure_msg: null,
        common_error: null,
      };
      bucket.total_runs += 1;
      const status = String(entry?.status || '').toLowerCase();
      const failed = status === 'failed' || status === 'critical' || status === 'warning';
      if (failed) {
        bucket.failures += 1;
        if (!bucket.last_failure_at || ts > new Date(bucket.last_failure_at).getTime()) {
          bucket.last_failure_at = entry.ts || null;
          bucket.last_failure_msg = entry.error_message || null;
        }
      }
      bucket._errors = bucket._errors || {};
      if (entry?.error_message) {
        bucket._errors[entry.error_message] = (bucket._errors[entry.error_message] || 0) + 1;
      }
      grouped[stepId] = bucket;
    }
    for (const bucket of Object.values(grouped)) {
      const rankedErrors = Object.entries(bucket._errors || {}).sort((a, b) => b[1] - a[1]);
      bucket.common_error = rankedErrors[0]?.[0] || null;
      bucket.failure_rate = bucket.total_runs > 0 ? bucket.failures / bucket.total_runs : 0;
      delete bucket._errors;
    }
    return grouped;
  } catch {
    return {};
  }
}

function buildRecoveryMetrics({ recoveryReport, recoveryStatePath, actionLogPath, heartbeatLogPath, windowDays = 7 }) {
  const cutoffMs = Date.now() - (windowDays * 86400000);
  const state = (() => {
    try {
      if (!fsSync.existsSync(recoveryStatePath)) return null;
      return JSON.parse(fsSync.readFileSync(recoveryStatePath, 'utf8'));
    } catch {
      return null;
    }
  })();
  const stepActivity = new Map();
  const blockerCounts = new Map();
  const runningStepCounts = new Map();
  const runningPatternCounts = new Map();

  function ensureStep(stepId) {
    if (!stepActivity.has(stepId)) {
      stepActivity.set(stepId, {
        step_id: stepId,
        launches: 0,
        starts: 0,
        restarts: 0,
        blocked_count: 0,
        completions: 0,
        last_started_at: null,
        last_completed_at: null,
        last_blocked_reason: null,
        _durations: [],
      });
    }
    return stepActivity.get(stepId);
  }

  try {
    if (fsSync.existsSync(actionLogPath)) {
      const lines = fsSync.readFileSync(actionLogPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
        if (!match) continue;
        const ts = Date.parse(match[1]);
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;
        const message = match[2];

        let entry = message.match(/^started\s+([a-z0-9_]+)\s+pid=\d+/i);
        if (entry) {
          const bucket = ensureStep(entry[1]);
          bucket.starts += 1;
          bucket.launches += 1;
          bucket.last_started_at = match[1];
          continue;
        }

        entry = message.match(/^restarted stalled\s+([a-z0-9_]+)\s+/i);
        if (entry) {
          const bucket = ensureStep(entry[1]);
          bucket.restarts += 1;
          bucket.launches += 1;
          bucket.last_started_at = match[1];
          continue;
        }

        entry = message.match(/^blocked\s+([a-z0-9_]+)\s+(.+)$/i);
        if (entry) {
          const bucket = ensureStep(entry[1]);
          bucket.blocked_count += 1;
          bucket.last_blocked_reason = entry[2];
          continue;
        }

        entry = message.match(/^completed\s+([a-z0-9_]+)(?:\s+duration_ms=(\d+))?$/i);
        if (entry) {
          const bucket = ensureStep(entry[1]);
          bucket.completions += 1;
          bucket.last_completed_at = match[1];
          if (entry[2]) bucket._durations.push(Number(entry[2]));
        }
      }
    }
  } catch {}

  try {
    if (fsSync.existsSync(heartbeatLogPath)) {
      const lines = fsSync.readFileSync(heartbeatLogPath, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\]\s+(.*)$/);
        if (!match) continue;
        const ts = Date.parse(match[1]);
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;
        const message = match[2];
        const runningMatch = message.match(/\brunning=([^\s]+)/);
        const blockerMatch = message.match(/\bblocker=(.+?)\s+next=/);
        if (blockerMatch) {
          const blocker = blockerMatch[1].trim();
          if (blocker && blocker !== 'n/a') {
            blockerCounts.set(blocker, (blockerCounts.get(blocker) || 0) + 1);
          }
        }
        if (runningMatch) {
          const runningRaw = runningMatch[1].trim();
          if (runningRaw && runningRaw !== '-') {
            runningPatternCounts.set(runningRaw, (runningPatternCounts.get(runningRaw) || 0) + 1);
            for (const stepId of runningRaw.split(',').map((value) => value.trim()).filter(Boolean)) {
              runningStepCounts.set(stepId, (runningStepCounts.get(stepId) || 0) + 1);
            }
          }
        }
      }
    }
  } catch {}

  const completedIds = new Set(recoveryReport?.completed_steps || []);
  const runningById = new Map((recoveryReport?.running_steps || []).map((row) => [row.id, row]));
  const blockedById = new Map((recoveryReport?.blocked_steps || []).map((row) => [row.id, row]));
  const stepIds = new Set([
    ...Object.keys(state?.steps || {}),
    ...completedIds,
    ...runningById.keys(),
    ...blockedById.keys(),
  ]);

  const currentSteps = [...stepIds].sort().map((stepId) => {
    const stepState = state?.steps?.[stepId] || {};
    const startedAt = stepState.last_started_at || null;
    const completedAt = stepState.completed_at || null;
    const runningInfo = runningById.get(stepId) || null;
    const blockedInfo = blockedById.get(stepId) || null;
    let status = 'pending';
    if (completedIds.has(stepId)) status = 'completed';
    else if (runningInfo) status = 'running';
    else if (blockedInfo) status = 'blocked';
    const elapsedMinutes = (() => {
      if (!startedAt) return null;
      const startTime = Date.parse(startedAt);
      if (!Number.isFinite(startTime)) return null;
      const endTime = status === 'completed' && completedAt ? Date.parse(completedAt) : Date.now();
      if (!Number.isFinite(endTime) || endTime < startTime) return null;
      return Math.round(((endTime - startTime) / 60000) * 10) / 10;
    })();
    return {
      step_id: stepId,
      status,
      pid: runningInfo?.pid || stepState.pid || null,
      restarted: Boolean(runningInfo?.restarted),
      restarts: Number(stepState.restarts || 0),
      blocked_reason: blockedInfo?.reason || stepState.blocked_reason || null,
      last_started_at: startedAt,
      completed_at: completedAt,
      elapsed_minutes: elapsedMinutes,
    };
  }).sort((a, b) => {
    const rank = { running: 0, blocked: 1, completed: 2, pending: 3 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.step_id.localeCompare(b.step_id);
  });

  const stepStats = [...stepActivity.values()]
    .map((bucket) => ({
      step_id: bucket.step_id,
      launches: bucket.launches,
      starts: bucket.starts,
      restarts: bucket.restarts,
      blocked_count: bucket.blocked_count,
      completions: bucket.completions,
      running_samples: runningStepCounts.get(bucket.step_id) || 0,
      last_started_at: bucket.last_started_at,
      last_completed_at: bucket.last_completed_at,
      last_blocked_reason: bucket.last_blocked_reason,
      avg_duration_minutes: bucket._durations.length
        ? Math.round((bucket._durations.reduce((sum, value) => sum + value, 0) / bucket._durations.length / 60000) * 10) / 10
        : null,
      max_duration_minutes: bucket._durations.length
        ? Math.round((Math.max(...bucket._durations) / 60000) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.launches - a.launches || b.restarts - a.restarts || b.blocked_count - a.blocked_count);

  return {
    window_days: windowDays,
    current_campaign: recoveryReport ? {
      run_id: recoveryReport.run_id || null,
      target_market_date: recoveryReport.target_market_date || null,
      campaign_started_at: recoveryReport.campaign_started_at || null,
      completed_count: Array.isArray(recoveryReport.completed_steps) ? recoveryReport.completed_steps.length : 0,
      running_count: Array.isArray(recoveryReport.running_steps) ? recoveryReport.running_steps.length : 0,
      blocked_count: Array.isArray(recoveryReport.blocked_steps) ? recoveryReport.blocked_steps.length : 0,
      next_step: recoveryReport.next_step || null,
      steps: currentSteps,
    } : null,
    summary: {
      total_launches: stepStats.reduce((sum, step) => sum + step.launches, 0),
      total_restarts: stepStats.reduce((sum, step) => sum + step.restarts, 0),
      total_blocks: stepStats.reduce((sum, step) => sum + step.blocked_count, 0),
      total_completions: stepStats.reduce((sum, step) => sum + step.completions, 0),
      active_running_patterns: [...runningPatternCounts.values()].reduce((sum, value) => sum + value, 0),
    },
    step_activity: stepStats.slice(0, 12),
    top_blockers: [...blockerCounts.entries()]
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    running_patterns: [...runningPatternCounts.entries()]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

function buildRootCauses({ models, pipelineDiagnostic, v1Report, recentFailures, v1Weights, operatingModes, systemStatusReport }) {
  const causes = (systemStatusReport?.root_causes || []).map((cause) => ({
    ...cause,
    source_key: cause.source_key || 'system_status',
  }));
  for (const reason of systemStatusReport?.final_integrity_seal?.blocking_reasons || []) {
    const label = String(reason?.id || 'final_integrity_blocked')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    causes.push(rootCause(
      reason?.severity || 'critical',
      'release_integrity',
      `Final integrity blocked: ${label}`,
      `Final integrity seal reports blocker ${reason?.id || 'unknown'}.`,
      'Dashboard V7 and Stock Analyzer UI cannot be marked green while the final integrity seal remains blocked.',
      'Resolve the leading blocking reason in public/data/ops/final-integrity-seal-latest.json and rerun the publish/status chain.',
      'Ops',
      'final_integrity_seal',
      { file_ref: 'public/data/ops/final-integrity-seal-latest.json', source_key: 'final_integrity_seal' }
    ));
  }
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
      { file_ref: 'public/data/reports/nightly-stock-analyzer-status.json', source_key: 'learning' }
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

function summarizeSystemStatus(rootCauses, learningStatus, systemStatusReport) {
  // Single truth: mirror system-status-latest.json verdict directly
  const canon = systemStatusReport?.summary;
  if (canon?.severity) {
    const label = canon.severity === 'critical' ? 'CRITICAL' : canon.severity === 'warning' ? 'WARNING' : 'OK';
    return {
      severity: canon.severity,
      label,
      detail: rootCauses.slice(0, 4).map((cause) => cause.title),
      learning_status: learningStatus || 'UNKNOWN',
      local_severity: canon.local_severity ?? canon.severity,
      remote_severity: canon.remote_severity ?? 'unknown',
      proof_mode: canon.proof_mode ?? 'unknown',
    };
  }
  // Fallback: compute locally when system-status-latest.json is unavailable
  const severity = rootCauses.reduce((acc, cause) => maxSeverity(acc, cause.severity), 'ok');
  const label = severity === 'critical' ? 'CRITICAL' : severity === 'warning' ? 'WARNING' : 'OK';
  return {
    severity,
    label,
    detail: rootCauses.slice(0, 4).map((cause) => cause.title),
    learning_status: learningStatus || 'UNKNOWN',
    proof_mode: 'fallback_local_compute',
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

function computeArtifactHash(document) {
  const cloned = JSON.parse(JSON.stringify(document));
  delete cloned.artifact_hash;
  return createHash('sha256').update(JSON.stringify(cloned)).digest('hex');
}

async function writeJsonWithHash(filePath, document) {
  const payload = {
    ...document,
    artifact_hash: computeArtifactHash(document),
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function normalizeSealReason(reason) {
  if (!reason || typeof reason !== 'object') return null;
  const id = String(reason.id || 'seal_blocker');
  const title = String(reason.title || id)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return {
    id,
    severity: String(reason.severity || 'critical'),
    category: 'release_integrity',
    title,
    why: reason.why || `Final integrity seal reports blocker ${id}.`,
    impact: reason.impact || 'Dashboard V7 and release status must stay blocked until this blocker is resolved.',
    fix: reason.fix || 'Resolve the leading blocker in public/data/ops/final-integrity-seal-latest.json and rerun the status/publish chain.',
    owner: reason.owner || 'Ops',
    subsystem: reason.subsystem || 'final_integrity_seal',
    file_ref: 'public/data/ops/final-integrity-seal-latest.json',
    source_key: 'final_integrity_seal',
    evidence_at: reason.evidence_at || null,
  };
}

function buildDashboardV7Document({ output, systemStatusReport, finalIntegritySeal }) {
  const sealBlockers = (finalIntegritySeal?.blocking_reasons || [])
    .map(normalizeSealReason)
    .filter(Boolean);
  const sourceRootCauses = Array.isArray(output.system?.root_causes) ? output.system.root_causes : [];
  const sourcePrimaryActions = Array.isArray(output.system?.primary_actions) ? output.system.primary_actions : [];
  const fallbackBlockingRootCauses = sourceRootCauses.filter((cause) => String(cause?.severity || '').toLowerCase() === 'critical');
  const releaseReady = finalIntegritySeal?.release_ready === true;
  const blockingReasons = sealBlockers.length > 0
    ? sealBlockers
    : (releaseReady ? [] : fallbackBlockingRootCauses);
  const blockingSeverity = blockingReasons.length > 0 ? 'critical' : 'ok';
  const advisorySeverity = String(
    systemStatusReport?.summary?.advisory_severity
      || (blockingSeverity === 'ok' ? systemStatusReport?.summary?.severity : output.system?.status_severity)
      || output.system?.status_severity
      || 'ok'
  ).toLowerCase();
  const blockingIds = new Set(blockingReasons.map((cause) => cause.id));
  const advisoryReasons = sourceRootCauses.filter((cause) => !blockingIds.has(cause.id));
  const uiGreen = releaseReady === true && blockingReasons.length === 0;
  const targetMarketDate = finalIntegritySeal?.target_market_date
    || systemStatusReport?.summary?.target_market_date
    || output.operations?.release_state?.target_market_date
    || null;
  const runId = finalIntegritySeal?.run_id
    || systemStatusReport?.run_id
    || output.operations?.release_state?.run_id
    || output.operations?.release_state?.control_plane?.run_id
    || null;

  let statusSeverity = blockingSeverity === 'ok' ? 'ok' : blockingSeverity;
  if (statusSeverity === 'ok' && (!releaseReady || !uiGreen)) statusSeverity = 'warning';
  const overallStatus = statusSeverity === 'critical'
    ? 'CRITICAL'
    : statusSeverity === 'warning'
      ? 'WARNING'
      : 'OK';
  const liveStatus = statusSeverity === 'critical'
    ? 'failed'
    : statusSeverity === 'warning'
      ? 'degraded'
      : 'ok';
  const primaryBlocker = blockingReasons[0]?.title || advisoryReasons[0]?.title || null;
  const primaryActions = blockingReasons.length > 0
    ? buildPrimaryActions(blockingReasons)
    : sourcePrimaryActions;
  const controlPlaneGreen = finalIntegritySeal?.status === 'OK' || releaseReady === true;
  const leadBlockerStep = controlPlaneGreen
    ? null
    : (
      finalIntegritySeal?.lead_blocker_step
      || output.operations?.release_state?.lead_blocker_step
      || output.operations?.recovery?.current_campaign?.next_step
      || null
    );
  const nextStep = controlPlaneGreen
    ? null
    : (
      finalIntegritySeal?.next_step
      || output.operations?.release_state?.next_step
      || output.operations?.recovery?.current_campaign?.next_step
      || null
    );

  const system = {
    ...output.system,
    overall_status: overallStatus,
    status_severity: statusSeverity,
    live_status: liveStatus,
    data_truth_state: blockingReasons.length > 0
      ? `Blocking truth degradation: ${blockingReasons[0]?.title || 'blocking issues detected'}.`
      : 'Fresh and internally consistent.',
    production_ready: releaseReady,
    cutover_ready: releaseReady,
    ui_green: uiGreen,
    global_green: systemStatusReport?.summary?.global_green ?? uiGreen,
    target_market_date: targetMarketDate,
    run_id: runId,
    blocking_severity: blockingSeverity,
    advisory_severity: advisorySeverity,
    primary_blocker: primaryBlocker,
    lead_blocker_step: leadBlockerStep,
    next_step: nextStep,
    observer_stale: finalIntegritySeal?.observer_stale ?? null,
    observer_generated_at: finalIntegritySeal?.observer_generated_at ?? null,
    runtime_preflight_ok: finalIntegritySeal?.runtime_preflight_ok ?? null,
    runtime_preflight_ref: finalIntegritySeal?.runtime_preflight_ref || null,
    root_causes: blockingReasons,
    blocking_reasons: blockingReasons,
    advisory_reasons: advisoryReasons,
    primary_actions: primaryActions,
    advisory_actions: advisoryReasons.length > 0 ? buildPrimaryActions(advisoryReasons) : [],
  };

  return {
    ...output,
    schema_version: 'rv.dashboard_v7_status.v1',
    generator_id: 'scripts/generate_meta_dashboard_data.mjs',
    generated_at: output.generated_at,
    run_id: runId,
    target_market_date: targetMarketDate,
    ui_green: uiGreen,
    release_ready: releaseReady,
    blocking_severity: blockingSeverity,
    advisory_severity: advisorySeverity,
    primary_blocker: primaryBlocker,
    lead_blocker_step: leadBlockerStep,
    next_step: nextStep,
    observer_stale: finalIntegritySeal?.observer_stale ?? null,
    observer_generated_at: finalIntegritySeal?.observer_generated_at ?? null,
    runtime_preflight_ok: finalIntegritySeal?.runtime_preflight_ok ?? null,
    runtime_preflight_ref: finalIntegritySeal?.runtime_preflight_ref || null,
    blocking_reasons: blockingReasons,
    advisory_reasons: advisoryReasons,
    legacy_meta_ref: 'public/dashboard_v6_meta_data.json',
    system,
  };
}

async function main() {
  const [learning, quantlab, quantlabOperationalStatus, forecastLatest, legacyWeights, v1AuditReport, v1WeightsLatest, diagnostic, regimeDaily, nightlyStatus, recoveryReport, releaseState, finalIntegritySealDoc, systemStatusReport, dataFreshnessReport, bestSetups] = await Promise.all([
    readJsonSafely(LEARNING_REPORT_PATH),
    readJsonSafely(QUANTLAB_REPORT_PATH),
    readJsonSafely(QUANTLAB_OPERATIONAL_STATUS_PATH),
    readJsonSafely(FORECAST_LATEST_PATH),
    extractLegacyWeights(DECISION_LOGIC_PATH),
    readJsonSafely(V1_AUDIT_REPORT_PATH),
    readJsonSafely(V1_WEIGHTS_PATH),
    readJsonSafely(DIAGNOSTIC_PATH),
    readJsonSafely(REGIME_DAILY_PATH),
    readJsonSafely(NIGHTLY_STATUS_PATH),
    readJsonSafely(RECOVERY_REPORT_PATH),
    readJsonSafely(RELEASE_STATE_PATH),
    readJsonSafely(FINAL_INTEGRITY_SEAL_PATH),
    readJsonSafely(SYSTEM_STATUS_PATH),
    readJsonSafely(DATA_FRESHNESS_PATH),
    readJsonSafely(BEST_SETUPS_PATH),
  ]);
  const finalIntegritySeal = finalIntegritySealDoc || systemStatusReport?.final_integrity_seal || null;
  const systemStatusView = systemStatusReport
    ? { ...systemStatusReport, final_integrity_seal: finalIntegritySeal }
    : { final_integrity_seal: finalIntegritySeal };

  const v1WeightHistory = loadWeightHistory();
  const recentFailures = [];
  const lastSuccessfulJobs = [
    nightlyStatus?.phase === 'completed' ? {
      mode: 'nightly',
      status: nightlyStatus.phase,
      finished_at: nightlyStatus.updated_at || nightlyStatus.heartbeat || statMtimeIso(NIGHTLY_STATUS_PATH),
    } : null,
    recoveryReport?.generated_at ? {
      mode: 'recovery',
      status: recoveryReport?.dashboard_summary?.severity || 'ok',
      finished_at: recoveryReport.generated_at,
    } : null,
    releaseState?.last_updated ? {
      mode: 'release_state',
      status: releaseState.phase || null,
      finished_at: releaseState.last_updated,
    } : null,
  ].filter(Boolean);
  const latestForecastFailure = recentFailures.find((item) => item.failed_step === 'forecast_run_daily');
  const forecastArtifactGeneratedAt = forecastLatest?.generated_at || statMtimeIso(FORECAST_LATEST_PATH);
  const forecastFailureActive = failureStillActive(latestForecastFailure, forecastArtifactGeneratedAt || forecastLatest?.data?.asof || null);
  const bestSetupsGeneratedAt = bestSetups?.meta?.generated_at || bestSetups?.generated_at || statMtimeIso(BEST_SETUPS_PATH);
  const bestSetupsDataAsof = bestSetups?.meta?.data_asof || bestSetups?.meta?.forecast_asof || bestSetups?.meta?.quantlab_asof || null;
  const recoveryMetrics = buildRecoveryMetrics({
    recoveryReport,
    recoveryStatePath: RECOVERY_STATE_PATH,
    actionLogPath: RECOVERY_ACTION_LOG_PATH,
    heartbeatLogPath: RECOVERY_HEARTBEAT_LOG_PATH,
  });

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
        nightly_status: sourceFileMeta(NIGHTLY_STATUS_PATH, { date: nightlyStatus?.updated_at || nightlyStatus?.heartbeat || null }),
        dashboard_green_recovery: sourceFileMeta(RECOVERY_REPORT_PATH, { date: recoveryReport?.generated_at || null }),
        release_state: sourceFileMeta(RELEASE_STATE_PATH, { date: releaseState?.last_updated || null }),
        final_integrity_seal: sourceFileMeta(FINAL_INTEGRITY_SEAL_PATH, { date: finalIntegritySeal?.generated_at || null }),
        pipeline_runtime: sourceFileMeta(PIPELINE_RUNTIME_PATH),
        pipeline_epoch: sourceFileMeta(PIPELINE_EPOCH_PATH),
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
      ? (quantlabPublishAsof || quantlabMarketAsof)
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

  // 9. Operations
  output.operations = {
    nightly_status: nightlyStatus || null,
    recovery_status: recoveryReport || null,
    recovery_metrics: recoveryMetrics,
    release_state: releaseState || null,
    final_integrity_seal: finalIntegritySeal || null,
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
    step_runbook: systemStatusReport?.steps || {},
    web_validation_chain: systemStatusReport?.ssot?.web_validation_chain || [],
    stock_analyzer_universe_audit: systemStatusReport?.stock_analyzer_universe_audit || null,
    data_truth_gate: dataFreshnessReport || systemStatusReport?.data_truth_gate || null,
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
    systemStatusReport: systemStatusView,
  });
  const primaryActions = buildPrimaryActions(rootCauses);
  const systemStatus = summarizeSystemStatus(
    rootCauses,
    learning?.summary?.overall_status || 'UNKNOWN',
    systemStatusView
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
    local_data_green: systemStatusReport?.summary?.local_data_green ?? null,
    global_green: systemStatusReport?.summary?.global_green ?? null,
    ui_green: systemStatusReport?.summary?.ui_green ?? null,
    live_status: 'ok',
    snapshot_age_hours: 0,
    data_truth_state: dataTruthState(systemStatus.severity, rootCauses),
    root_causes: rootCauses,
    primary_actions: primaryActions,
    operating_modes: operatingModes,
    production_ready: finalIntegritySeal?.release_ready === true,
    cutover_ready: finalIntegritySeal?.release_ready === true,
    v1_mode: v1AuditReport?.mode || 'shadow_v1',
    quantlab_readiness: quantlab?.progress?.readiness?.pct ?? null,
    quantlab_implementation: quantlab?.progress?.implementation?.pct ?? null,
    automation_health: systemStatusReport?.automation || null,
    dependency_health: systemStatusReport?.dependencies || [],
    steps: systemStatusReport?.steps || {},
    pipeline_step_order: PIPELINE_STEP_ORDER,
    pipeline_error_frequency: buildPipelineErrorFrequency(PIPELINE_LEDGER_PATH),
    recovery_metrics: recoveryMetrics,
    stock_analyzer_universe_audit: systemStatusReport?.stock_analyzer_universe_audit || null,
    universe_field_quality: (() => {
      try {
        const audit = JSON.parse(fsSync.readFileSync(
          path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
          'utf8',
        ));
        return audit.field_problem_stats || null;
      } catch {
        return null;
      }
    })(),
    final_integrity_seal: finalIntegritySeal,
    data_truth_gate: dataFreshnessReport || systemStatusReport?.data_truth_gate || null,
    web_validation_chain: systemStatusReport?.ssot?.web_validation_chain || [],
    ssot_doc_ref: systemStatusReport?.ssot?.doc_ref || null,
    recovery_script: systemStatusReport?.ssot?.recovery_script || null,
    green_contract: {
      title: 'Dashboard V7 Green Contract',
      doc_ref: 'docs/ops/dashboard-v7-green-contract.md',
      items: [
        'Single Writer: pipeline-master ist der einzige residente Writer für autoritative Latest-Artefakte.',
        'Full-Universe-Audit beweist Artefaktvollständigkeit getrennt von Live-Canaries.',
        'Hist-Probs no-data / insufficient-history / inactive gelten neutral und nicht als fehlende UI-Wahrheit.',
        'Fundamentals bleiben Warning-only im priorisierten Scope und nie Final-Seal-Blocker.',
        'Q1/Market-Data dürfen dem Release-Target voraus sein; nur Rückstand ist kritisch.',
      ],
    },
    tracked_step_ids: systemStatusReport?.ssot?.tracked_step_ids || [],
    missing_step_ids: systemStatusReport?.ssot?.missing_step_ids || [],
    untracked_step_ids: systemStatusReport?.ssot?.untracked_step_ids || [],
    ssot_violations: systemStatusReport?.ssot_violations || [],
    regime: regimeDaily ? {
      market: regimeDaily.market_regime,
      volatility: regimeDaily.volatility_regime,
      breadth: regimeDaily.breadth_regime,
      date: regimeDaily.date,
    } : null,
  };

  const dashboardV7Status = buildDashboardV7Document({
    output,
    systemStatusReport,
    finalIntegritySeal,
  });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  await writeJsonWithHash(V7_STATUS_OUTPUT_PATH, dashboardV7Status);
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
