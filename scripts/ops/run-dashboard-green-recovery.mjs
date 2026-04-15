#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { normalizeQ1DeltaLatestSuccess } from '../lib/q1-delta-success.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const LOG_DIR = path.join(ROOT, 'logs', 'dashboard_v7');
const STATE_DIR = path.join(ROOT, 'mirrors', 'ops', 'dashboard-green');
const STATE_PATH = path.join(STATE_DIR, 'state.json');
const REPORT_PATH = path.join(ROOT, 'public', 'data', 'reports', 'dashboard-green-recovery-latest.json');
const HEARTBEAT_LOG = path.join(LOG_DIR, 'recovery-heartbeat.log');
const ACTION_LOG = path.join(LOG_DIR, 'recovery-actions.log');
const SYSTEM_STATUS = path.join(ROOT, 'public', 'data', 'reports', 'system-status-latest.json');
const FORECAST_LATEST = path.join(ROOT, 'public', 'data', 'forecast', 'latest.json');
const REFRESH_REPORT = path.join(ROOT, 'mirrors', 'universe-v7', 'state', 'refresh_v7_history_from_eodhd.report.json');
const HIST_PROBS_SUMMARY = path.join(ROOT, 'public', 'data', 'hist-probs', 'run-summary.json');
const HIST_PROBS_ANCHOR = path.join(ROOT, 'public', 'data', 'hist-probs', 'AAPL.json');
const AUDIT_REPORT = path.join(ROOT, 'public', 'data', 'reports', 'stock-analyzer-universe-audit-latest.json');
const DATA_FRESHNESS_REPORT = path.join(ROOT, 'public', 'data', 'reports', 'data-freshness-latest.json');
const Q1_SUCCESS = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json';
const QUANTLAB_OPERATIONAL_STATUS = path.join(ROOT, 'public', 'data', 'quantlab', 'status', 'operational-status.json');
const DASHBOARD_META = path.join(ROOT, 'public', 'dashboard_v6_meta_data.json');
const DASHBOARD_V7_STATUS = path.join(ROOT, 'public', 'data', 'ui', 'dashboard-v7-status.json');
const RUNTIME_HEALTH_URL = 'http://127.0.0.1:8788/api/diag';
const MAX_STEP_RESTARTS = 3;
const RESTART_COOLDOWN_MIN = 15;

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function appendLog(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function fileUpdatedSince(filePath, sinceMs) {
  const mtime = statMtimeMs(filePath);
  return Number.isFinite(mtime) && mtime >= sinceMs;
}

function countJsonFiles(dirPath, { exclude = [] } = {}) {
  try {
    return fs.readdirSync(dirPath).filter((name) => name.endsWith('.json') && !exclude.includes(name)).length;
  } catch {
    return 0;
  }
}

function countRecentJsonFiles(dirPath, minutes, { exclude = [] } = {}) {
  try {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return fs.readdirSync(dirPath)
      .filter((name) => name.endsWith('.json') && !exclude.includes(name))
      .map((name) => path.join(dirPath, name))
      .filter((filePath) => {
        try {
          return fs.statSync(filePath).mtimeMs >= cutoff;
        } catch {
          return false;
        }
      }).length;
  } catch {
    return 0;
  }
}

function parsePs(pattern) {
  try {
    const output = execFileSync('/bin/zsh', ['-lc', `ps aux | rg '${pattern.replace(/'/g, `'\\''`)}'`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').filter(Boolean).filter((line) => !line.includes('rg ') && !line.includes('ssh -n -i ')).map((line) => {
      const parts = line.trim().split(/\s+/);
      return { pid: Number(parts[1]), command: line };
    }).filter((row) => Number.isFinite(row.pid));
  } catch {
    return [];
  }
}

function startDetached(command, logFile) {
  const out = fs.openSync(logFile, 'a');
  fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] START ${command}\n`, 'utf8');
  const child = spawn('/bin/zsh', ['-lc', `cd '${ROOT.replace(/'/g, `'\\''`)}' && ${command}`], {
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid;
}

function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runtimeHealthy() {
  try {
    execFileSync('/usr/bin/curl', ['-sf', '--max-time', '5', RUNTIME_HEALTH_URL], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function waitForRuntime(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runtimeHealthy()) return true;
    sleepMs(1000);
  }
  return runtimeHealthy();
}

function isoDateUtc(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shiftUtcDays(date, deltaDays) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

function isWeekendUtc(date) {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

function latestUsMarketSessionIso(now = new Date()) {
  let session = startOfUtcDay(now);
  const afterClose = now.getUTCHours() > 20 || (now.getUTCHours() === 20 && now.getUTCMinutes() >= 15);
  if (!afterClose) session = shiftUtcDays(session, -1);
  while (isWeekendUtc(session)) session = shiftUtcDays(session, -1);
  return isoDateUtc(session);
}

function normalizeDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function histProbsAnchorFresh(expectedDate) {
  // Primary check: AAPL.json latest_date meets target
  const anchor = readJson(HIST_PROBS_ANCHOR);
  const latestDate = normalizeDate(anchor?.latest_date || null);
  if (Boolean(expectedDate && latestDate && latestDate >= expectedDate)) return true;
  // Fallback: scope registry may lag (data not yet available for target date).
  // Accept if run-summary.regime_date confirms the run used the correct regime.
  const summary = readJson(HIST_PROBS_SUMMARY);
  const regimeDate = normalizeDate(summary?.regime_date || null);
  return Boolean(expectedDate && regimeDate && regimeDate >= expectedDate);
}

function shiftIsoDate(isoDate, deltaDays) {
  return isoDateUtc(shiftUtcDays(new Date(`${isoDate}T00:00:00Z`), deltaDays));
}

function forecastArtifactFresh(expectedDate) {
  const doc = readJson(FORECAST_LATEST);
  const generatedAt = doc?.generated_at ? Date.parse(doc.generated_at) : NaN;
  const freshness = normalizeDate(
    doc?.data?.freshness
      || doc?.freshness
      || doc?.meta?.freshness
      || doc?.data?.asof
      || null
  );
  const ok = doc?.ok === true || ['ok', 'success'].includes(String(doc?.status || doc?.meta?.status || '').toLowerCase());
  return Number.isFinite(generatedAt) && ok && freshness === expectedDate;
}

function dashboardMetaFresh(expectedDate, sinceMs) {
  const dashboardMetaMtime = statMtimeMs(DASHBOARD_META);
  const dashboardV7 = readJson(DASHBOARD_V7_STATUS);
  const dashboardV7Mtime = statMtimeMs(DASHBOARD_V7_STATUS);
  return Number.isFinite(dashboardMetaMtime)
    && dashboardMetaMtime >= sinceMs
    && Number.isFinite(dashboardV7Mtime)
    && dashboardV7Mtime >= sinceMs
    && normalizeDate(dashboardV7?.target_market_date) === expectedDate;
}

function readState() {
  const current = readJson(STATE_PATH);
  if (current) return current;
  return createFreshState();
}

function createFreshState(targetMarketDate = null) {
  const now = new Date().toISOString();
  return {
    schema: 'dashboard_green_recovery_state_v2',
    run_id: targetMarketDate ? `dashboard-green-${targetMarketDate}` : `dashboard-green-${now.slice(0, 10)}`,
    target_market_date: targetMarketDate,
    campaign_started_at: now,
    created_at: now,
    updated_at: now,
    steps: {},
  };
}

const resetCampaignRequested = process.argv.includes('--reset-campaign')
  || process.env.RV_FORCE_NEW_RECOVERY_CAMPAIGN === '1';
let state = readState();
const requestedTargetDate = normalizeDate(process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || null);
const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
const marketSessionDate = latestUsMarketSessionIso();
const targetMarketDate = requestedTargetDate || marketSessionDate;
if (resetCampaignRequested) {
  state = createFreshState(targetMarketDate);
}
if (state?.target_market_date !== targetMarketDate) {
  state = createFreshState(targetMarketDate);
}
state.schema = 'dashboard_green_recovery_state_v2';
state.run_id = forcedRunId || state.run_id || `dashboard-green-${targetMarketDate}`;
state.target_market_date = targetMarketDate;
state.campaign_started_at ||= state.created_at || new Date().toISOString();
const campaignStartMs = Date.parse(state.campaign_started_at);
const marketRefreshFromDate = shiftIsoDate(targetMarketDate, -14);
const learningDate = targetMarketDate;

const steps = [
  {
    id: 'market_data_refresh',
    label: 'Market Data Refresh',
    pattern: 'scripts/quantlab/refresh_v7_history_from_eodhd.py',
    command: `node scripts/universe-v7/build-us-eu-scope.mjs && python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --from-date ${marketRefreshFromDate} --to-date ${targetMarketDate} --concurrency 12 --progress-every 500`,
    logFile: path.join(LOG_DIR, 'step-00-market-refresh.log'),
    stallMinutes: 180,
    dependsOn: [],
    isComplete: () => {
      const report = readJson(REFRESH_REPORT);
      const generatedAt = report?.generated_at ? Date.parse(report.generated_at) : NaN;
      const fetchedWithData = Number(report?.assets_fetched_with_data || 0);
      const reportOk = Number.isFinite(generatedAt)
        && generatedAt >= campaignStartMs
        && fetchedWithData > 0
        && String(report?.to_date || '') === targetMarketDate;
      if (!reportOk) return false;
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemGeneratedAt = systemDoc?.generated_at ? Date.parse(systemDoc.generated_at) : NaN;
      if (Number.isFinite(systemGeneratedAt) && systemGeneratedAt >= generatedAt) {
        return String(systemDoc?.steps?.market_data_refresh?.severity || '') === 'ok';
      }
      return true;
    },
  },
  {
    id: 'q1_delta_ingest',
    label: 'Q1 Delta Ingest',
    pattern: 'scripts/quantlab/run_daily_delta_ingest_q1.py',
    command: `python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date ${targetMarketDate} --full-scan-packs`,
    logFile: path.join(LOG_DIR, 'step-01-q1-delta.log'),
    dependsOn: ['market_data_refresh'],
    isComplete: () => {
      const doc = normalizeQ1DeltaLatestSuccess(readJson(Q1_SUCCESS));
      const updated = doc?.updated_at ? Date.parse(doc.updated_at) : NaN;
      const ingestDate = String(doc?.ingest_date || '');
      const runLooksFresh = Number.isFinite(updated)
        && updated >= campaignStartMs
        && doc?.evidence_complete === true
        && ingestDate === targetMarketDate;
      if (!runLooksFresh) return false;
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemGeneratedAt = systemDoc?.generated_at ? Date.parse(systemDoc.generated_at) : NaN;
      if (Number.isFinite(systemGeneratedAt) && systemGeneratedAt >= updated) {
        return String(systemDoc?.steps?.q1_delta_ingest?.severity || '') === 'ok';
      }
      return true;
    },
  },
  {
    id: 'quantlab_daily_report',
    label: 'QuantLab Daily Report',
    pattern: 'scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    command: 'node scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    logFile: path.join(LOG_DIR, 'step-02-quantlab-daily.log'),
    dependsOn: ['market_data_refresh', 'q1_delta_ingest'],
    isComplete: () => {
      const operational = readJson(QUANTLAB_OPERATIONAL_STATUS);
      const generatedAt = operational?.generatedAt ? Date.parse(operational.generatedAt) : NaN;
      const severity = String(operational?.summary?.severity || '');
      const reportLooksFresh = Number.isFinite(generatedAt)
        && generatedAt >= campaignStartMs
        && severity === 'ok';
      if (!reportLooksFresh) return false;
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemGeneratedAt = systemDoc?.generated_at ? Date.parse(systemDoc.generated_at) : NaN;
      if (Number.isFinite(systemGeneratedAt) && systemGeneratedAt >= generatedAt) {
        return String(systemDoc?.steps?.quantlab_daily_report?.severity || '') === 'ok';
      }
      return true;
    },
  },
  {
    id: 'scientific_summary',
    label: 'Scientific Summary',
    pattern: 'scripts/build-scientific-summary.mjs',
    command: 'node scripts/build-scientific-summary.mjs',
    logFile: path.join(LOG_DIR, 'step-03-scientific.log'),
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'supermodules', 'scientific-summary.json'), campaignStartMs),
  },
  {
    id: 'forecast_daily',
    label: 'Forecast Daily',
    pattern: 'scripts/forecast/run_daily.mjs',
    command: 'FORECAST_RSS_BUDGET_MB=4096 NODE_OPTIONS=--max-old-space-size=6144 node scripts/forecast/run_daily.mjs',
    logFile: path.join(LOG_DIR, 'step-04-forecast.log'),
    stallMinutes: 60,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => {
      if (!forecastArtifactFresh(targetMarketDate)) return false;
      const forecastDoc = readJson(FORECAST_LATEST);
      const generatedAt = forecastDoc?.generated_at ? Date.parse(forecastDoc.generated_at) : NaN;
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemGeneratedAt = systemDoc?.generated_at ? Date.parse(systemDoc.generated_at) : NaN;
      if (Number.isFinite(systemGeneratedAt) && Number.isFinite(generatedAt) && systemGeneratedAt >= generatedAt) {
        return String(systemDoc?.steps?.forecast_daily?.severity || '') === 'ok';
      }
      return true;
    },
  },
  {
    id: 'fundamentals',
    label: 'Fundamentals Refresh',
    pattern: 'scripts/build-fundamentals.mjs --published-subset --force',
    command: 'node scripts/build-fundamentals.mjs --published-subset --force',
    logFile: path.join(LOG_DIR, 'step-05-fundamentals.log'),
    stallMinutes: 60,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'fundamentals', '_index.json'), campaignStartMs),
  },
  {
    id: 'hist_probs',
    label: 'Hist Probs Full (Turbo)',
    pattern: 'run-hist-probs-turbo.mjs',
    command: 'NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs',
    logFile: path.join(LOG_DIR, 'step-06-hist-probs.log'),
    stallMinutes: 360,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => {
      const doc = readJson(HIST_PROBS_SUMMARY);
      const ranAt = doc?.ran_at ? Date.parse(doc.ran_at) : NaN;
      const classes = Array.isArray(doc?.asset_classes) ? doc.asset_classes.slice().sort().join(',') : '';
      const fullUniverse = Number(doc?.max_tickers) === 0 || doc?.source_mode === 'registry_asset_classes';
      const total = Number(doc?.tickers_total);
      const covered = Number(doc?.tickers_covered);
      const remaining = Number(doc?.tickers_remaining);
      const errors = Number(doc?.tickers_errors);
      const runLooksComplete = Number.isFinite(ranAt)
        && ranAt >= campaignStartMs
        && classes === 'ETF,STOCK'
        && fullUniverse
        && Number.isFinite(total)
        && Number.isFinite(covered)
        && Number.isFinite(remaining)
        && Number.isFinite(errors)
        && covered === total
        && remaining === 0
        && errors === 0
        && histProbsAnchorFresh(targetMarketDate);
      if (!runLooksComplete) return false;
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemGeneratedAt = systemDoc?.generated_at ? Date.parse(systemDoc.generated_at) : NaN;
      if (Number.isFinite(systemGeneratedAt) && systemGeneratedAt >= ranAt) {
        return String(systemDoc?.steps?.hist_probs?.severity || '') === 'ok'
          && systemDoc?.steps?.hist_probs?.status_detail?.coverage?.zero_coverage_guard !== true;
      }
      return true;
    },
  },
  {
    id: 'snapshot',
    label: 'Best Setups Snapshot',
    pattern: 'scripts/build-best-setups-v4.mjs',
    command: 'NODE_OPTIONS=--max-old-space-size=8192 node scripts/build-best-setups-v4.mjs',
    logFile: path.join(LOG_DIR, 'step-07-snapshot.log'),
    dependsOn: ['quantlab_daily_report', 'forecast_daily'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'snapshots', 'best-setups-v4.json'), campaignStartMs),
  },
  {
    id: 'us_eu_truth_gate',
    label: 'US+EU Truth Gate',
    pattern: 'scripts/ops/build-data-freshness-report.mjs',
    command: 'node scripts/universe-v7/build-us-eu-scope.mjs && node scripts/ops/build-us-eu-history-pack-manifest.mjs && node scripts/ops/build-data-freshness-report.mjs',
    logFile: path.join(LOG_DIR, 'step-08-truth-gate.log'),
    dependsOn: ['quantlab_daily_report', 'fundamentals', 'hist_probs', 'forecast_daily', 'scientific_summary', 'snapshot'],
    isComplete: () => {
      const doc = readJson(DATA_FRESHNESS_REPORT);
      return fileUpdatedSince(DATA_FRESHNESS_REPORT, campaignStartMs)
        && Boolean(doc?.scope?.symbol_count)
        && Array.isArray(doc?.families)
        && doc?.summary?.family_total === doc?.families?.length;
    },
  },
  {
    id: 'stock_analyzer_universe_audit',
    label: 'Universe Audit',
    pattern: 'scripts/ops/build-stock-analyzer-universe-audit.mjs',
    command: 'node scripts/universe-v7/build-us-eu-scope.mjs && node scripts/ops/build-us-eu-history-pack-manifest.mjs && node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --asset-classes STOCK,ETF --max-tickers 0 --concurrency 12 --timeout-ms 30000',
    logFile: path.join(LOG_DIR, 'step-10-universe-audit.log'),
    dependsOn: ['hist_probs', 'snapshot'],
    isComplete: () => {
      const doc = readJson(AUDIT_REPORT);
      // Use release_eligible (artifact-only criterion) — live canary failures are not blocking
      return fileUpdatedSince(AUDIT_REPORT, campaignStartMs)
        && doc?.summary?.full_universe === true
        && doc?.summary?.release_eligible === true;
    },
  },
  {
    id: 'system_status',
    label: 'System Status Refresh',
    pattern: 'scripts/ops/build-system-status-report.mjs',
    command: 'node scripts/ops/build-system-status-report.mjs',
    logFile: path.join(LOG_DIR, 'step-11-system-status.log'),
    dependsOn: ['us_eu_truth_gate', 'stock_analyzer_universe_audit'],
    isComplete: () => {
      if (!fileUpdatedSince(SYSTEM_STATUS, campaignStartMs)) return false;
      const systemDoc = readJson(SYSTEM_STATUS);
      const snapshotFresh = fileUpdatedSince(
        path.join(ROOT, 'public', 'data', 'snapshots', 'best-setups-v4.json'),
        campaignStartMs
      );
      const truthGateFresh = fileUpdatedSince(DATA_FRESHNESS_REPORT, campaignStartMs);
      const auditFresh = fileUpdatedSince(AUDIT_REPORT, campaignStartMs);
      const auditDoc = readJson(AUDIT_REPORT);
      // Use release_eligible (artifact-only criterion) — live canary failures are not blocking
      const auditClean = auditDoc?.summary?.full_universe === true && auditDoc?.summary?.release_eligible === true;
      const latestPrereq = Math.max(statMtimeMs(AUDIT_REPORT) || 0, statMtimeMs(DATA_FRESHNESS_REPORT) || 0);
      const systemAfterPrereqs = (statMtimeMs(SYSTEM_STATUS) || 0) >= latestPrereq;
      return snapshotFresh
        && truthGateFresh
        && auditFresh
        && auditClean
        && systemAfterPrereqs
        && systemDoc?.summary?.data_layer_severity === 'ok'
        && systemDoc?.summary?.coverage_ready === true;
    },
  },
  {
    id: 'dashboard_meta',
    label: 'Dashboard Meta Refresh',
    pattern: 'scripts/generate_meta_dashboard_data.mjs',
    command: 'node scripts/generate_meta_dashboard_data.mjs',
    logFile: path.join(LOG_DIR, 'step-12-dashboard-meta.log'),
    dependsOn: ['system_status'],
    isComplete: () => {
      const systemDoc = readJson(SYSTEM_STATUS);
      const systemStatusMtime = statMtimeMs(SYSTEM_STATUS);
      const dashboardMtime = statMtimeMs(DASHBOARD_META);
      return systemStatusMtime != null
        && dashboardMtime != null
        && dashboardMtime >= systemStatusMtime
        && dashboardMetaFresh(targetMarketDate, campaignStartMs)
        && systemDoc?.summary?.data_layer_severity === 'ok';
    },
  },
];

function ensureRuntime() {
  const existing = parsePs('wrangler pages dev public --port 8788');
  if (existing.length > 0 && runtimeHealthy()) return existing[0].pid;
  if (existing.length > 0 && !runtimeHealthy()) {
    for (const proc of existing) {
      killPid(proc.pid);
      appendLog(ACTION_LOG, `[${new Date().toISOString()}] killed stale runtime pid=${proc.pid}`);
    }
    sleepMs(1000);
  }
  const pid = startDetached('npm run dev:pages:persist:std', path.join(LOG_DIR, 'runtime-wrangler.log'));
  appendLog(ACTION_LOG, `[${new Date().toISOString()}] started runtime wrangler pid=${pid}`);
  waitForRuntime();
  return pid;
}

const completed = new Set();
const running = [];
const blocked = [];
const restarted = [];

ensureRuntime();

// Migration: kill any legacy sequential hist_probs if turbo is now the target runner
for (const { pid } of parsePs('scripts/lib/hist-probs/run-hist-probs.mjs')) {
  if (killPid(pid)) {
    appendLog(ACTION_LOG, `[${new Date().toISOString()}] killed legacy sequential hist_probs pid=${pid} — turbo will take over`);
  }
}

for (const step of steps) {
  state.steps[step.id] ||= {};
  const stepState = state.steps[step.id];

  if (step.isComplete()) {
    stepState.pid = null;
    stepState.blocked_reason = null;
    if (!stepState.completed_at) {
      const completedAt = new Date().toISOString();
      stepState.completed_at = completedAt;
      const startedAt = stepState.last_started_at ? Date.parse(stepState.last_started_at) : NaN;
      if (Number.isFinite(startedAt)) {
        const durationMs = Math.max(0, Date.parse(completedAt) - startedAt);
        appendLog(
          ACTION_LOG,
          `[${completedAt}] completed ${step.id} duration_ms=${durationMs}`,
        );
      }
    }
    completed.add(step.id);
    continue;
  }

  const depsMet = (step.dependsOn || []).every((dep) => completed.has(dep));
  const matches = parsePs(step.pattern);
  if (matches.length > 0) {
    const pid = matches[0].pid;
    stepState.pid = pid;
    stepState.log_file = step.logFile;
    const size = statMtimeMs(step.logFile) ? fs.statSync(step.logFile).size : 0;
    const lastSize = Number(stepState.last_log_size || 0);
    if (size > lastSize) {
      stepState.last_log_size = size;
      stepState.last_progress_at = new Date().toISOString();
    }
    const lastProgressAt = stepState.last_progress_at ? Date.parse(stepState.last_progress_at) : Date.now();
    const stalledMinutes = (Date.now() - lastProgressAt) / 60000;
    if (stalledMinutes >= (step.stallMinutes ?? 20)) {
      const restartCount = Number(stepState.restarts || 0);
      const lastRestartAt = stepState.last_restart_at ? Date.parse(stepState.last_restart_at) : 0;
      if (restartCount >= MAX_STEP_RESTARTS) {
        stepState.blocked_reason = `restart_budget_exhausted:${restartCount}`;
        blocked.push({ id: step.id, waiting_for: [], reason: stepState.blocked_reason });
        appendLog(ACTION_LOG, `[${new Date().toISOString()}] blocked ${step.id} restart_budget_exhausted=${restartCount}`);
        continue;
      }
      if (Date.now() - lastRestartAt < (RESTART_COOLDOWN_MIN * 60 * 1000)) {
        blocked.push({ id: step.id, waiting_for: [], reason: 'restart_cooldown_active' });
        continue;
      }
      killPid(pid);
      stepState.restarts = restartCount + 1;
      stepState.last_restart_at = new Date().toISOString();
      stepState.blocked_reason = null;
      const newPid = startDetached(step.command, step.logFile);
      stepState.pid = newPid;
      stepState.last_started_at = new Date().toISOString();
      stepState.last_progress_at = new Date().toISOString();
      stepState.last_log_size = statMtimeMs(step.logFile) ? fs.statSync(step.logFile).size : 0;
      restarted.push(step.id);
      running.push({ id: step.id, pid: newPid, restarted: true });
      appendLog(ACTION_LOG, `[${new Date().toISOString()}] restarted stalled ${step.id} old_pid=${pid} new_pid=${newPid}`);
    } else {
      running.push({ id: step.id, pid, restarted: false });
    }
    continue;
  }

  stepState.pid = null;

  if (!depsMet) {
    blocked.push({ id: step.id, waiting_for: (step.dependsOn || []).filter((dep) => !completed.has(dep)) });
    continue;
  }

  const pid = startDetached(step.command, step.logFile);
  stepState.pid = pid;
  stepState.log_file = step.logFile;
  stepState.last_started_at = new Date().toISOString();
  stepState.last_progress_at = new Date().toISOString();
  stepState.last_log_size = statMtimeMs(step.logFile) ? fs.statSync(step.logFile).size : 0;
  stepState.restarts = Number(stepState.restarts || 0);
  stepState.blocked_reason = null;
  running.push({ id: step.id, pid, restarted: false, started: true });
  appendLog(ACTION_LOG, `[${new Date().toISOString()}] started ${step.id} pid=${pid}`);
}

state.updated_at = new Date().toISOString();
writeJsonAtomic(STATE_PATH, state);

const currentStatus = readJson(SYSTEM_STATUS) || {};
const progress = {
  hist_probs_total: countJsonFiles(path.join(ROOT, 'public', 'data', 'hist-probs'), { exclude: ['run-summary.json', 'regime-daily.json'] }),
  hist_probs_recent_15m: countRecentJsonFiles(path.join(ROOT, 'public', 'data', 'hist-probs'), 15, { exclude: ['run-summary.json', 'regime-daily.json'] }),
  fundamentals_total: countJsonFiles(path.join(ROOT, 'public', 'data', 'fundamentals'), { exclude: ['_index.json'] }),
  fundamentals_recent_15m: countRecentJsonFiles(path.join(ROOT, 'public', 'data', 'fundamentals'), 15, { exclude: ['_index.json'] }),
};

const report = {
  schema: 'dashboard_green_recovery_report_v1',
  generated_at: new Date().toISOString(),
  host: os.hostname(),
  run_id: state.run_id,
  target_market_date: targetMarketDate,
  campaign_started_at: state.campaign_started_at,
  completed_steps: Array.from(completed),
  running_steps: running,
  blocked_steps: blocked,
  restarted_steps: restarted,
  next_step: steps.find((step) => !completed.has(step.id))?.id || null,
  dashboard_summary: currentStatus.summary || null,
  progress,
};

appendLog(
  HEARTBEAT_LOG,
  `[${report.generated_at}] completed=${report.completed_steps.length}/${steps.length} running=${running.map((row) => row.id).join(',') || '-'} hist_recent15=${progress.hist_probs_recent_15m} fund_recent15=${progress.fundamentals_recent_15m} blocker=${report.dashboard_summary?.primary_blocker || 'n/a'} next=${report.next_step || 'none'}`
);
writeJsonAtomic(REPORT_PATH, report);
