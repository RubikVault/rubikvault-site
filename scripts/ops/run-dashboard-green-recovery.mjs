#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const LOG_DIR = path.join(ROOT, 'logs', 'dashboard_v7');
const STATE_DIR = path.join(ROOT, 'mirrors', 'ops', 'dashboard-green');
const STATE_PATH = path.join(STATE_DIR, 'state.json');
const REPORT_PATH = path.join(ROOT, 'public', 'data', 'reports', 'dashboard-green-recovery-latest.json');
const HEARTBEAT_LOG = path.join(LOG_DIR, 'recovery-heartbeat.log');
const ACTION_LOG = path.join(LOG_DIR, 'recovery-actions.log');
const SYSTEM_STATUS = path.join(ROOT, 'public', 'data', 'reports', 'system-status-latest.json');
const HIST_PROBS_SUMMARY = path.join(ROOT, 'public', 'data', 'hist-probs', 'run-summary.json');
const AUDIT_REPORT = path.join(ROOT, 'public', 'data', 'reports', 'stock-analyzer-universe-audit-latest.json');
const Q1_SUCCESS = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json';
const DASHBOARD_META = path.join(ROOT, 'public', 'dashboard_v6_meta_data.json');

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

function readState() {
  const current = readJson(STATE_PATH);
  if (current) return current;
  return {
    schema: 'dashboard_green_recovery_state_v1',
    campaign_started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    steps: {},
  };
}

const state = readState();
const campaignStartMs = Date.parse(state.campaign_started_at);
const statusDoc = readJson(SYSTEM_STATUS) || {};
const q1Success = readJson(Q1_SUCCESS) || {};
const quantStatus = statusDoc?.steps?.quantlab_daily_report || {};
const anyRequiredDate =
  quantStatus?.status_detail?.raw_freshness?.latestAnyRequiredDataDate ||
  q1Success?.ingest_date ||
  new Date().toISOString().slice(0, 10);
const learningDate = anyRequiredDate;

const steps = [
  {
    id: 'q1_delta_ingest',
    label: 'Q1 Delta Ingest',
    pattern: 'scripts/quantlab/run_daily_delta_ingest_q1.py',
    command: `python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date ${anyRequiredDate}`,
    logFile: path.join(LOG_DIR, 'step-01-q1-delta.log'),
    dependsOn: [],
    isComplete: () => {
      const doc = readJson(Q1_SUCCESS);
      const updated = doc?.updated_at ? Date.parse(doc.updated_at) : NaN;
      return Number.isFinite(updated) && updated >= campaignStartMs;
    },
  },
  {
    id: 'quantlab_daily_report',
    label: 'QuantLab Daily Report',
    pattern: 'scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    command: 'node scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    logFile: path.join(LOG_DIR, 'step-02-quantlab-daily.log'),
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => {
      const fresh = readJson(SYSTEM_STATUS)?.steps?.quantlab_daily_report?.generated_at;
      const ts = fresh ? Date.parse(fresh) : NaN;
      return Number.isFinite(ts) && ts >= campaignStartMs;
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
    command: 'NODE_OPTIONS=--max-old-space-size=6144 node scripts/forecast/run_daily.mjs',
    logFile: path.join(LOG_DIR, 'step-04-forecast.log'),
    stallMinutes: 60,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'forecast', 'latest.json'), campaignStartMs),
  },
  {
    id: 'fundamentals',
    label: 'Fundamentals Refresh',
    pattern: 'scripts/build-fundamentals.mjs --force',
    command: 'node scripts/build-fundamentals.mjs --force',
    logFile: path.join(LOG_DIR, 'step-05-fundamentals.log'),
    stallMinutes: 60,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'fundamentals', '_index.json'), campaignStartMs),
  },
  {
    id: 'hist_probs',
    label: 'Hist Probs Full (Turbo)',
    pattern: 'run-hist-probs-turbo.mjs',
    command: 'NODE_OPTIONS=--max-old-space-size=4096 node run-hist-probs-turbo.mjs',
    logFile: path.join(LOG_DIR, 'step-06-hist-probs.log'),
    stallMinutes: 60,
    dependsOn: ['q1_delta_ingest'],
    isComplete: () => {
      const doc = readJson(HIST_PROBS_SUMMARY);
      const ranAt = doc?.ran_at ? Date.parse(doc.ran_at) : NaN;
      const classes = Array.isArray(doc?.asset_classes) ? doc.asset_classes.slice().sort().join(',') : '';
      const fullUniverse = Number(doc?.max_tickers) === 0 || doc?.source_mode === 'registry_asset_classes';
      return Number.isFinite(ranAt) && ranAt >= campaignStartMs && classes === 'ETF,STOCK' && fullUniverse;
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
    id: 'learning_daily',
    label: 'Learning Daily',
    pattern: 'scripts/learning/run-daily-learning-cycle.mjs',
    command: `NODE_OPTIONS=--max-old-space-size=4096 node scripts/learning/run-daily-learning-cycle.mjs --date=${learningDate}`,
    logFile: path.join(LOG_DIR, 'step-08-learning.log'),
    dependsOn: ['snapshot', 'scientific_summary', 'fundamentals'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'reports', 'learning-report-latest.json'), campaignStartMs),
  },
  {
    id: 'etf_diagnostic',
    label: 'ETF Diagnostic',
    pattern: 'scripts/learning/diagnose-best-setups-etf-drop.mjs',
    command: 'node scripts/learning/diagnose-best-setups-etf-drop.mjs',
    logFile: path.join(LOG_DIR, 'step-09-etf-diagnostic.log'),
    dependsOn: ['snapshot'],
    isComplete: () => fileUpdatedSince(path.join(ROOT, 'public', 'data', 'reports', 'best-setups-etf-diagnostic-latest.json'), campaignStartMs),
  },
  {
    id: 'stock_analyzer_universe_audit',
    label: 'Universe Audit',
    pattern: 'scripts/ops/build-stock-analyzer-universe-audit.mjs',
    command: 'node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0',
    logFile: path.join(LOG_DIR, 'step-10-universe-audit.log'),
    dependsOn: ['hist_probs', 'snapshot', 'etf_diagnostic'],
    isComplete: () => {
      const doc = readJson(AUDIT_REPORT);
      return fileUpdatedSince(AUDIT_REPORT, campaignStartMs) && doc?.summary?.full_universe === true;
    },
  },
  {
    id: 'system_status',
    label: 'System Status Refresh',
    pattern: 'scripts/ops/build-system-status-report.mjs',
    command: 'node scripts/ops/build-system-status-report.mjs',
    logFile: path.join(LOG_DIR, 'step-11-system-status.log'),
    dependsOn: ['stock_analyzer_universe_audit'],
    isComplete: () => {
      if (!fileUpdatedSince(SYSTEM_STATUS, campaignStartMs)) return false;
      const snapshotFresh = fileUpdatedSince(
        path.join(ROOT, 'public', 'data', 'snapshots', 'best-setups-v4.json'),
        campaignStartMs
      );
      const learningFresh = fileUpdatedSince(
        path.join(ROOT, 'public', 'data', 'reports', 'learning-report-latest.json'),
        campaignStartMs
      );
      return snapshotFresh && learningFresh;
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
      if (!fileUpdatedSince(DASHBOARD_META, campaignStartMs)) return false;
      const systemStatusMtime = statMtimeMs(SYSTEM_STATUS);
      const dashboardMtime = statMtimeMs(DASHBOARD_META);
      return systemStatusMtime != null && dashboardMtime != null && dashboardMtime >= systemStatusMtime;
    },
  },
];

function ensureRuntime() {
  const existing = parsePs('wrangler pages dev public --port 8788');
  if (existing.length > 0) return existing[0].pid;
  const pid = startDetached('npm run dev:pages:persist:std', path.join(LOG_DIR, 'runtime-wrangler.log'));
  appendLog(ACTION_LOG, `[${new Date().toISOString()}] started runtime wrangler pid=${pid}`);
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
    stepState.completed_at ||= new Date().toISOString();
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
      killPid(pid);
      stepState.restarts = Number(stepState.restarts || 0) + 1;
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
