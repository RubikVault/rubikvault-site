#!/usr/bin/env node
/**
 * QuantLab Catchup Supervisor
 *
 * Advances QuantLab from stale target_trio to today.
 * Phases: CHECK → FEATURE_STORE_BUILD → FEATURE_STORE_MONITOR → TRAINING_CATCHUP → TRAINING_MONITOR → DOWNSTREAM → LANE_COMPARISON → DAILY_REPORT → DONE
 * Stall path: TRAINING_MONITOR → STALLED (alert + manual intervention required)
 *
 * Design principles:
 *   - Calendar-first planning: target dates derived from trading calendar + target_date, never from artifacts
 *   - Build reuse: feature store build skipped if manifest already covers target_date (Top Solution 2)
 *   - All phases explicit in state JSON — every transition is auditable
 *
 * Invoked every 5 min via launchd. Resume-safe after crash/reboot.
 * Lockfile prevents concurrent execution.
 *
 * Lessons learned aus Incidents an diesem Skript: docs/ops/lessons-learned.md
 *
 * Admin CLI:
 *   --status                  Print current state and exit
 *   --reset                   Reset state to CHECK (today)
 *   --reset-to-phase <PHASE>  Reset to specific phase
 *   --mark-stalled            Force STALLED state + alert
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QUANT_ROOT = process.env.QUANT_ROOT || (process.platform === 'linux'
  ? '/volume1/homes/neoboy/QuantLabHot/rubikvault-quantlab'
  : '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab');
// Python venv lives in REPO_ROOT/quantlab/.venv (not QUANT_ROOT/.venv).
// See docs/ops/lessons-learned.md if this path needs updating.
const PYTHON = process.env.PYTHON_BIN
  || path.join(REPO_ROOT, 'quantlab/.venv/bin/python');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts/quantlab');
const RUNS_DIR = path.join(QUANT_ROOT, 'runs');
const STATE_PATH = path.join(QUANT_ROOT, 'ops/catchup-supervisor-state.json');
const LOCK_PATH  = path.join(QUANT_ROOT, 'ops/catchup-supervisor.lock');
const LOG_PATH   = path.join(REPO_ROOT, 'logs/quantlab-catchup-supervisor.log');
const DAILY_REPORT_SCRIPT = path.join(SCRIPTS_DIR, 'build_quantlab_v4_daily_report.mjs');
const GOVERNOR_SCRIPT = path.join(REPO_ROOT, 'scripts/ops/run-storage-governor.mjs');
const US_HOLIDAYS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/config/us_holidays_2020_2030.json');
const AUTO_STORAGE_RECOVERY_CLASSES = ['q1step2bars_snapshot', 'q1step1_snapshot', 'feature_store_old_version'];

// ─── Thresholds ───────────────────────────────────────────────────────────────

const GAP_THRESHOLD_DAYS    = 2;   // Skip training if latest run is within 2 trading days
const STALL_HOURS           = 8;   // Kill+restart if training runs > 8h without new runs
const MIN_WAIT_MINUTES      = 30;  // Wait at least 30 min before declaring training failed
const MAX_RESTARTS          = 3;   // After this many catchup restarts → STALLED (not infinite retry)
const DOWNSTREAM_TIMEOUT_MS = 90 * 60 * 1000; // 90 min per downstream step
const FS_BUILD_MAX_RESTARTS = 2;   // Feature store build retry limit before STALLED
const FS_BUILD_TIMEOUT_HOURS = 2.5; // Max hours to wait for feature store build (150 min)

// Feature store overnight manifest — SSOT for build parameters and coverage check
const FS_OVERNIGHT_MANIFEST = path.join(
  QUANT_ROOT, 'features/store/feature_store_version=v4_q1panel_overnight/feature_panel_manifest.json'
);

// Canonical build params — read from manifest with safe fallbacks
// These match what was used to build the existing store (lookback=465, panel=90, max_assets=5000)
const FS_BUILD_DEFAULTS = { lookback_calendar_days: 465, panel_calendar_days: 90, max_assets: 5000, min_bars: 200 };

// ─── Logging ──────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

// ─── Trading Calendar (US holidays-aware) ─────────────────────────────────────

let _usHolidays = null;
function loadUsHolidays() {
  if (_usHolidays !== null) return _usHolidays;
  try {
    const data = readJson(US_HOLIDAYS_PATH);
    _usHolidays = new Set(data?.holidays || []);
  } catch {
    _usHolidays = new Set();
  }
  return _usHolidays;
}

function isUsTradingDay(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false; // weekend
  const holidays = loadUsHolidays();
  return !holidays.has(isoDate);
}

/** Count US trading days (Mon–Fri, excluding US holidays) between two ISO dates (exclusive of isoA, inclusive of isoB). */
function tradingDaysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T12:00:00Z');
  const b = new Date(isoB + 'T12:00:00Z');
  if (b <= a) return 0;
  let count = 0;
  const cur = new Date(a);
  cur.setUTCDate(cur.getUTCDate() + 1);
  while (cur <= b) {
    const iso = cur.toISOString().slice(0, 10);
    if (isUsTradingDay(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── PID Identity (not just kill -0) ─────────────────────────────────────────

/**
 * Returns the start time string of a PID from ps, or null if not running.
 * macOS: ps -p <pid> -o lstart=
 */
function pidStartTime(pid) {
  if (!pid) return null;
  try {
    const result = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const s = (result || '').trim();
    return s.length > 0 ? s : null;
  } catch { return null; }
}

/**
 * Verify that a PID is alive AND matches the stored start time.
 * Prevents false-positive matches on PID reuse after reboot.
 */
function isPidIdentityMatch(pid, storedStartTime) {
  if (!pid) return false;
  const currentStartTime = pidStartTime(Number(pid));
  if (!currentStartTime) return false;
  if (!storedStartTime) return true; // No stored time yet → accept if PID is alive
  // Compare normalized: strip extra whitespace
  return currentStartTime.replace(/\s+/g, ' ').trim() === storedStartTime.replace(/\s+/g, ' ').trim();
}

function findRunningTrainingJob() {
  try {
    const output = execFileSync('/bin/ps', ['-axo', 'pid=,lstart=,command='], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const lines = String(output || '').split('\n');
    const candidates = [];
    for (const line of lines) {
      // ps -o pid=,lstart=,command= gives: "  PID  Day Mon DD HH:MM:SS YYYY  command..."
      // lstart is 24 chars fixed width
      const pidMatch = line.match(/^\s*(\d+)\s+/);
      if (!pidMatch) continue;
      const pid = Number(pidMatch[1]);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const rest = line.slice(pidMatch[0].length);
      // lstart is the next 24 chars (fixed), then command
      const lstart = rest.slice(0, 24).trim();
      const cmd = rest.slice(24).trim();
      const looksLikeTraining =
        cmd.includes('start_q1_operator_safe.sh')
        || cmd.includes('run_overnight_q1_supervised_safe.sh')
        || cmd.includes('run_overnight_q1_training_sweep.py')
        || cmd.includes('watch_overnight_q1_job.py')
        || cmd.includes('run_q1_auto_day.py')
        || cmd.includes('run_q1_daily_data_backbone_q1.py')
        || cmd.includes('wait_for_day_job_then_refresh_stageb_q1.py');
      if (!looksLikeTraining) continue;
      const jobMatch = cmd.match(/--job-dir\s+(\S+)/)
        || cmd.match(/job_dir[= ](\S+)/)
        || cmd.match(/--resume-from\s+(\S+)/);
      let priority = 10;
      if (cmd.includes('watch_overnight_q1_job.py')) priority = 50;
      else if (cmd.includes('run_overnight_q1_training_sweep.py')) priority = 40;
      else if (cmd.includes('run_overnight_q1_supervised_safe.sh')) priority = 30;
      else if (cmd.includes('start_q1_operator_safe.sh')) priority = 20;
      candidates.push({
        pid,
        start_time: lstart,
        command: cmd,
        jobDir: jobMatch ? jobMatch[1] : null,
        jobName: jobMatch ? path.basename(jobMatch[1]) : null,
        priority,
      });
    }
    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (Boolean(b.jobDir) !== Boolean(a.jobDir)) return Number(Boolean(b.jobDir)) - Number(Boolean(a.jobDir));
      return a.pid - b.pid;
    });
    return candidates[0] || null;
  } catch {}
  return null;
}

// ─── Feature Store Helpers ────────────────────────────────────────────────────

/**
 * Read the v4_q1panel_overnight manifest and return {panel_max_asof_date, snapshot_id, buildParams}.
 * Returns null if manifest does not exist or is unreadable.
 */
function readOvernightManifest() {
  const m = readJson(FS_OVERNIGHT_MANIFEST);
  if (!m) return null;
  return {
    // panel_max_asof_date lives in manifest.ranges (not manifest.counts)
    panel_max_asof_date: m.ranges?.panel_max_asof_date || m.counts?.panel_max_asof_date || null,
    snapshot_id: m.snapshot_id || null,
    lookback_calendar_days: m.lookback_calendar_days || FS_BUILD_DEFAULTS.lookback_calendar_days,
    panel_calendar_days: m.panel_calendar_days || FS_BUILD_DEFAULTS.panel_calendar_days,
    max_assets: m.max_assets || FS_BUILD_DEFAULTS.max_assets,
    min_bars: m.min_bars || FS_BUILD_DEFAULTS.min_bars,
  };
}

/**
 * Top Solution 2 — Build Reuse:
 * Returns true if the overnight feature store already covers targetDate
 * (panel_max_asof_date within GAP_THRESHOLD_DAYS of targetDate).
 * If yes, no rebuild needed.
 */
function isFeatureStoreCurrent(targetDate) {
  const m = readOvernightManifest();
  if (!m?.panel_max_asof_date) return false;
  const gap = tradingDaysBetween(m.panel_max_asof_date, targetDate);
  return gap <= GAP_THRESHOLD_DAYS;
}

/**
 * Returns the snapshot_id of the latest local q1step2bars snapshot (by mtime).
 * Top Solution 1 — the build always uses the freshest available snapshot,
 * not whatever the previous build used.
 */
function latestLocalSnapshotId() {
  const snapRoot = path.join(QUANT_ROOT, 'data/snapshots');
  try {
    const entries = fs.readdirSync(snapRoot)
      .filter(d => d.startsWith('snapshot_id=') && d.includes('q1step2bars'))
      .map(d => ({
        id: d.replace('snapshot_id=', ''),
        mtime: (() => { try { return fs.statSync(path.join(snapRoot, d)).mtimeMs; } catch { return 0; } })(),
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return entries[0]?.id || null;
  } catch { return null; }
}

/**
 * Scan ps for a running build_feature_store_q1_panel.py process.
 * Used to adopt an already-running build (survives supervisor restarts).
 */
function findRunningFeatureStoreBuild() {
  try {
    const output = execFileSync('/bin/ps', ['-axo', 'pid=,lstart=,command='], {
      encoding: 'utf8', timeout: 5000,
    });
    for (const line of String(output).split('\n')) {
      if (!line.includes('build_feature_store_q1_panel.py')) continue;
      const pidMatch = line.match(/^\s*(\d+)\s+/);
      if (!pidMatch) continue;
      const pid = Number(pidMatch[1]);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const rest = line.slice(pidMatch[0].length);
      const lstart = rest.slice(0, 24).trim();
      return { pid, start_time: lstart };
    }
  } catch {}
  return null;
}

// ─── Stage-B Run Scanning ─────────────────────────────────────────────────────

function scanStageBRuns() {
  try {
    const entries = fs.readdirSync(RUNS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('run_id=q1stageb_'))
      .map(e => {
        const full = path.join(RUNS_DIR, e.name);
        const mtime = (() => { try { return fs.statSync(full).mtimeMs; } catch { return 0; } })();
        const m = e.name.match(/(\d{4}-\d{2}-\d{2})/);
        const date = m ? m[1] : null;
        return { dir: e.name, date, mtime };
      })
      .filter(r => r.date !== null)
      .sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);
    return entries;
  } catch { return []; }
}

function latestStageBDates(n = 3) {
  const seen = new Set();
  const dates = [];
  for (const r of scanStageBRuns()) {
    if (!seen.has(r.date)) {
      seen.add(r.date);
      dates.push(r.date);
      if (dates.length >= n) break;
    }
  }
  return dates.sort();
}

// ─── Script Runners ───────────────────────────────────────────────────────────

function runPython(args, { timeoutMs = DOWNSTREAM_TIMEOUT_MS, label = '' } = {}) {
  log(`[RUN] python ${args.join(' ')}${label ? ` (${label})` : ''}`);
  try {
    const result = spawnSync(PYTHON, args, {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const ok = result.status === 0;
    log(`[${ok ? 'OK' : 'FAIL'}] exit=${result.status ?? 'timeout'} ${label}`);
    return { ok, code: result.status ?? -1 };
  } catch (err) {
    log(`[ERR] ${label}: ${err.message}`);
    return { ok: false, code: -1 };
  }
}

function runNode(scriptPath, { timeoutMs = DOWNSTREAM_TIMEOUT_MS, label = '', args = [] } = {}) {
  log(`[RUN] node ${scriptPath}${label ? ` (${label})` : ''}`);
  try {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const ok = result.status === 0;
    log(`[${ok ? 'OK' : 'FAIL'}] exit=${result.status ?? 'timeout'} ${label}`);
    return { ok, code: result.status ?? -1 };
  } catch (err) {
    log(`[ERR] ${label}: ${err.message}`);
    return { ok: false, code: -1 };
  }
}

// ─── Alerting ─────────────────────────────────────────────────────────────────

function sendAlert(title, message) {
  log(`[ALERT] ${title}: ${message}`);
  // macOS native notification via terminal-notifier (no Script Editor on click)
  // Falls back to osascript if terminal-notifier is not installed.
  try {
    const tn = spawnSync('which', ['terminal-notifier'], { encoding: 'utf8', timeout: 3000 });
    if (tn.status === 0 && tn.stdout.trim()) {
      spawnSync(tn.stdout.trim(), [
        '-title', title,
        '-message', message,
        '-sound', 'Sosumi',
        '-group', 'rubikvault-catchup-supervisor',
      ], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
    } else {
      spawnSync('osascript', [
        '-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Sosumi"`,
      ], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
    }
  } catch {}
  // Write alert file for dashboard
  try {
    const alertPath = path.join(QUANT_ROOT, 'ops/catchup-supervisor-alert.json');
    writeJsonAtomic(alertPath, {
      title,
      message,
      generated_at: new Date().toISOString(),
      severity: 'critical',
    });
  } catch {}
}

// ─── Storage Preflight ────────────────────────────────────────────────────────

function storagePreflightCheck() {
  if (!fs.existsSync(GOVERNOR_SCRIPT)) {
    log('[PREFLIGHT] Storage governor not found — skipping storage check.');
    return { ok: true, skipped: true };
  }
  log('[PREFLIGHT] Running storage governor enforce...');
  try {
    const result = spawnSync(process.execPath, [GOVERNOR_SCRIPT, 'enforce'], {
      cwd: REPO_ROOT,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, QUANT_ROOT },
    });
    const exitCode = result.status ?? -1;
    if (exitCode === 20) {
      log('[PREFLIGHT] STORAGE_BLOCKED detected. Attempting proven-safe archival recovery...');
      const recovered = tryAutoStorageRecovery();
      if (recovered.ok) {
        log('[PREFLIGHT] Auto recovery succeeded. Storage is back above the heavy-job threshold.');
        return { ok: true, exit_code: 0, recovered: true, storage_recovery: recovered };
      }
      log('[PREFLIGHT] STORAGE_BLOCKED persists after auto recovery.');
      sendAlert('QuantLab Catchup STORAGE_BLOCKED', 'Disk space below heavy-job threshold. Training blocked. Archive old snapshots first.');
      return { ok: false, reason: 'storage_blocked', exit_code: 20, storage_recovery: recovered };
    }
    if (exitCode !== 0) {
      log(`[PREFLIGHT] Storage governor returned exit=${exitCode}. Proceeding with caution.`);
    } else {
      log('[PREFLIGHT] Storage OK.');
    }
    return { ok: true, exit_code: exitCode };
  } catch (err) {
    log(`[PREFLIGHT] Storage governor error: ${err.message}. Proceeding.`);
    return { ok: true, error: err.message };
  }
}

function runGovernorJson(args) {
  try {
    const result = spawnSync(process.execPath, [GOVERNOR_SCRIPT, ...args], {
      cwd: REPO_ROOT,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, QUANT_ROOT },
    });
    const parsed = JSON.parse((result.stdout || '{}').trim() || '{}');
    return { ok: result.status === 0, exit_code: result.status ?? -1, report: parsed };
  } catch {
    return { ok: false, exit_code: -1, report: null };
  }
}

function countArchivableForClass(report, archiveClass) {
  if (!report) return 0;
  if (archiveClass === 'q1step2bars_snapshot') return Number(report.snapshots?.step2bars_archivable || 0);
  if (archiveClass === 'q1step1_snapshot') return Number(report.snapshots?.step1_archivable || 0);
  if (archiveClass === 'feature_store_old_version') return Number(report.feature_store?.old_versions_archivable || 0);
  return 0;
}

function tryAutoStorageRecovery() {
  const before = runGovernorJson(['report', '--json']);
  if (before.report?.disk?.heavy_jobs_allowed === true) {
    return { ok: true, before: before.report, after: before.report, attempted: [] };
  }
  if (before.report?.nas?.reachable !== true) {
    return { ok: false, before: before.report, after: before.report, attempted: [], reason: 'nas_unreachable' };
  }

  const attempted = [];
  let latestReport = before.report;
  for (const archiveClass of AUTO_STORAGE_RECOVERY_CLASSES) {
    const archivable = countArchivableForClass(latestReport, archiveClass);
    if (archivable <= 0) continue;
    log(`[PREFLIGHT] Auto-archiving class=${archiveClass} count=${archivable}`);
    const result = spawnSync(process.execPath, [GOVERNOR_SCRIPT, 'archive', '--class', archiveClass], {
      cwd: REPO_ROOT,
      timeout: 3 * 60 * 60 * 1000,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, QUANT_ROOT },
    });
    attempted.push({ archive_class: archiveClass, exit_code: result.status ?? -1 });
    const next = runGovernorJson(['report', '--json']);
    latestReport = next.report || latestReport;
    if (latestReport?.disk?.heavy_jobs_allowed === true) {
      return { ok: true, before: before.report, after: latestReport, attempted };
    }
  }
  return { ok: latestReport?.disk?.heavy_jobs_allowed === true, before: before.report, after: latestReport, attempted };
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

function acquireLock() {
  try {
    const existing = readJson(LOCK_PATH);
    if (existing?.pid) {
      const startTime = pidStartTime(existing.pid);
      // If PID is alive AND start time matches stored → another real instance running
      if (startTime && existing.pid_start_time && startTime.replace(/\s+/g, ' ').trim() === existing.pid_start_time.replace(/\s+/g, ' ').trim()) {
        log(`[LOCK] Another instance running (pid=${existing.pid}). Exiting.`);
        process.exit(0);
      }
      // PID dead or reused — stale lock, overwrite
    }
  } catch {}
  const startTime = pidStartTime(process.pid);
  writeJsonAtomic(LOCK_PATH, {
    pid: process.pid,
    pid_start_time: startTime,
    started_at: new Date().toISOString(),
  });
}

function releaseLock() {
  try { fs.rmSync(LOCK_PATH, { force: true }); } catch {}
}

// ─── State ────────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  schema: 'ql_catchup_supervisor_v3',
  phase: 'CHECK',
  // Feature store build fields
  fs_build_pid: null,
  fs_build_pid_start_time: null,
  fs_build_started_at: null,
  fs_build_restart_count: 0,
  fs_build_snapshot_id: null,
  // Training fields
  training_pid: null,
  training_pid_start_time: null,
  training_started_at: null,
  training_restart_count: 0,
  // Pipeline context
  latest_run_date_before_catchup: null,
  target_date: null,
  downstream_step: 'registry',
  lane_comparison_completed: false,
  daily_report_completed: false,
  stalled_reason: null,
  completed_at: null,
  last_updated: null,
};

function readState() {
  const saved = readJson(STATE_PATH) || {};
  return { ...DEFAULT_STATE, ...saved };
}

function saveState(state) {
  writeJsonAtomic(STATE_PATH, { ...state, last_updated: new Date().toISOString() });
}

// ─── Phase Handlers ───────────────────────────────────────────────────────────

function phaseCheck(state) {
  const today = todayIso();

  if (state.completed_at && state.completed_at.slice(0, 10) === today) {
    log(`[CHECK] Already completed today (${state.completed_at}). Nothing to do.`);
    process.exit(0);
  }

  const runs = scanStageBRuns();
  const featureStoreCurrent = isFeatureStoreCurrent(today);
  if (runs.length === 0) {
    if (!featureStoreCurrent) {
      const m = readOvernightManifest();
      log(`[CHECK] No q1stageb runs found and feature store is stale (panel_max_asof_date=${m?.panel_max_asof_date ?? 'none'}, target=${today}). → FEATURE_STORE_BUILD.`);
      return {
        ...state,
        phase: 'FEATURE_STORE_BUILD',
        latest_run_date_before_catchup: null,
        target_date: today,
        fs_build_restart_count: 0,
        training_restart_count: 0,
      };
    }
    log('[CHECK] No q1stageb runs found. Feature store is current. Starting training catchup.');
    return { ...state, phase: 'TRAINING_CATCHUP', latest_run_date_before_catchup: null, target_date: today, training_restart_count: 0 };
  }

  const latestDate = runs[0].date;
  const gap = tradingDaysBetween(latestDate, today);
  log(`[CHECK] Latest stageb run: ${latestDate}, today: ${today}, gap: ${gap} US trading days`);

  if (gap <= GAP_THRESHOLD_DAYS) {
    log('[CHECK] Gap small — skipping training, going to DOWNSTREAM.');
    return { ...state, phase: 'DOWNSTREAM', downstream_step: 'registry', target_date: today, latest_run_date_before_catchup: latestDate };
  }

  log(`[CHECK] Gap ${gap} trading days — need training catchup.`);

  // Top Solution 2 — Build Reuse: check if feature store already covers target_date.
  // If stale, rebuild before training (training will silently fail without current data).
  if (!featureStoreCurrent) {
    const m = readOvernightManifest();
    log(`[CHECK] Feature store stale (panel_max_asof_date=${m?.panel_max_asof_date ?? 'none'}, target=${today}). → FEATURE_STORE_BUILD.`);
    return {
      ...state,
      phase: 'FEATURE_STORE_BUILD',
      latest_run_date_before_catchup: latestDate,
      target_date: today,
      fs_build_restart_count: 0,
      training_restart_count: 0,
    };
  }

  log(`[CHECK] Feature store current. → TRAINING_CATCHUP.`);
  return { ...state, phase: 'TRAINING_CATCHUP', latest_run_date_before_catchup: latestDate, target_date: today, training_restart_count: 0 };
}

function phaseFeatureStoreBuild(state) {
  const targetDate = state.target_date || todayIso();

  // Idempotency: if store is already current, skip build entirely
  if (isFeatureStoreCurrent(targetDate)) {
    log(`[FS_BUILD] Feature store already covers ${targetDate}. → TRAINING_CATCHUP.`);
    return { ...state, phase: 'TRAINING_CATCHUP', training_restart_count: 0 };
  }

  // Adopt an already-running build (survives supervisor restart mid-build)
  const running = findRunningFeatureStoreBuild();
  if (running?.pid) {
    log(`[FS_BUILD] Adopting existing build PID=${running.pid}`);
    return {
      ...state,
      phase: 'FEATURE_STORE_MONITOR',
      fs_build_pid: running.pid,
      fs_build_pid_start_time: running.start_time,
      fs_build_started_at: state.fs_build_started_at || new Date().toISOString(),
    };
  }

  // Restart guard — after FS_BUILD_MAX_RESTARTS failed attempts, stall for human
  if ((state.fs_build_restart_count || 0) >= FS_BUILD_MAX_RESTARTS) {
    const reason = `Feature store build exceeded max restarts (${FS_BUILD_MAX_RESTARTS}). Manual intervention required.`;
    log(`[FS_BUILD] ${reason}`);
    sendAlert('QuantLab Catchup STALLED (FS build)', reason);
    return { ...state, phase: 'STALLED', stalled_reason: reason };
  }

  // Storage preflight before any heavy build job
  const preflight = storagePreflightCheck();
  if (!preflight.ok) {
    return { ...state, phase: 'STALLED', stalled_reason: `storage_blocked before fs_build (exit=${preflight.exit_code})` };
  }

  // Top Solution 1 — Calendar-first: always use the freshest local snapshot
  const snapshotId = latestLocalSnapshotId();
  if (!snapshotId) {
    const reason = 'No local q1step2bars snapshot found. Cannot build feature store.';
    log(`[FS_BUILD] ${reason}`);
    sendAlert('QuantLab Catchup STALLED (no snapshot)', reason);
    return { ...state, phase: 'STALLED', stalled_reason: reason };
  }

  const manifest = readOvernightManifest();
  log(`[FS_BUILD] Launching build (snapshot=${snapshotId}, restart_count=${state.fs_build_restart_count || 0})`);

  const pid = startFsBuildDetached(snapshotId, manifest);
  if (!pid) {
    log('[FS_BUILD] Failed to start. Will retry next cycle.');
    return { ...state, fs_build_restart_count: (state.fs_build_restart_count || 0) + 1 };
  }

  const startTime = pidStartTime(pid);
  log(`[FS_BUILD] PID=${pid} start_time="${startTime}"`);
  return {
    ...state,
    phase: 'FEATURE_STORE_MONITOR',
    fs_build_pid: pid,
    fs_build_pid_start_time: startTime,
    fs_build_started_at: new Date().toISOString(),
    fs_build_snapshot_id: snapshotId,
    fs_build_restart_count: (state.fs_build_restart_count || 0) + 1,
  };
}

function phaseFeatureStoreMonitor(state) {
  const pid = state.fs_build_pid;
  const storedStartTime = state.fs_build_pid_start_time;
  const startedAt = state.fs_build_started_at ? new Date(state.fs_build_started_at) : new Date(0);
  const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60000;
  const targetDate = state.target_date || todayIso();

  // Success check first — manifest may have been updated while we waited
  if (isFeatureStoreCurrent(targetDate)) {
    const m = readOvernightManifest();
    log(`[FS_MONITOR] Feature store now covers ${targetDate} (panel_max_asof_date=${m?.panel_max_asof_date}). → TRAINING_CATCHUP.`);
    return {
      ...state,
      phase: 'TRAINING_CATCHUP',
      fs_build_pid: null,
      fs_build_pid_start_time: null,
      training_restart_count: 0,
    };
  }

  const pidAlive = isPidIdentityMatch(pid, storedStartTime);

  // Adopt a running build if stored PID is stale (e.g. after reboot, PID reuse)
  if (!pidAlive) {
    const running = findRunningFeatureStoreBuild();
    if (running?.pid) {
      log(`[FS_MONITOR] Stored PID=${pid} not identifiable. Adopting PID=${running.pid}.`);
      return { ...state, fs_build_pid: running.pid, fs_build_pid_start_time: running.start_time };
    }
  }

  log(`[FS_MONITOR] PID=${pid} alive=${pidAlive} elapsed=${elapsedMinutes.toFixed(0)}min / max=${(FS_BUILD_TIMEOUT_HOURS * 60).toFixed(0)}min`);

  // Timeout: kill and re-enter FEATURE_STORE_BUILD (which increments restart counter)
  if (elapsedMinutes > FS_BUILD_TIMEOUT_HOURS * 60) {
    log(`[FS_MONITOR] Build timeout after ${elapsedMinutes.toFixed(0)}min. Killing PID=${pid} and returning to FEATURE_STORE_BUILD.`);
    if (pidAlive) try { process.kill(Number(pid), 'SIGTERM'); } catch {}
    return { ...state, phase: 'FEATURE_STORE_BUILD', fs_build_pid: null, fs_build_pid_start_time: null };
  }

  // Still running — wait for next launchd cycle
  if (pidAlive) {
    log('[FS_MONITOR] Build in progress. Waiting for next cycle.');
    process.exit(0);
  }

  // PID dead, store still not current → return to FEATURE_STORE_BUILD for retry
  log('[FS_MONITOR] Build PID dead but feature store not current. → FEATURE_STORE_BUILD (retry).');
  return { ...state, phase: 'FEATURE_STORE_BUILD', fs_build_pid: null, fs_build_pid_start_time: null };
}

async function phaseTrainingCatchup(state) {
  // Storage preflight before starting any heavy training job
  const preflight = storagePreflightCheck();
  if (!preflight.ok) {
    // STORAGE_BLOCKED: do not start training; alert already sent in preflight
    return {
      ...state,
      phase: 'STALLED',
      stalled_reason: `storage_blocked: disk below heavy-job threshold (exit=${preflight.exit_code})`,
    };
  }

  // Check if a training job is already running (adopt it)
  const activeJob = findRunningTrainingJob();
  if (activeJob?.pid) {
    log(`[TRAIN] Reusing active training job PID=${activeJob.pid} (start=${activeJob.start_time})`);
    return {
      ...state,
      phase: 'TRAINING_MONITOR',
      training_pid: activeJob.pid,
      training_pid_start_time: activeJob.start_time,
      training_job_name: activeJob.jobName || state.training_job_name || null,
      training_started_at: state.training_started_at || new Date().toISOString(),
    };
  }

  // STALLED guard: don't retry indefinitely
  if ((state.training_restart_count || 0) >= MAX_RESTARTS) {
    const reason = `Exceeded max restarts (${MAX_RESTARTS}) without completing catchup training.`;
    log(`[TRAIN] ${reason} Entering STALLED.`);
    sendAlert('QuantLab Catchup STALLED', `${reason} Manual intervention required. Run: node scripts/ops/run-quantlab-catchup-supervisor.mjs --reset`);
    return {
      ...state,
      phase: 'STALLED',
      stalled_reason: reason,
    };
  }

  const latestDate = state.latest_run_date_before_catchup || '2026-01-01';
  const targetDate = state.target_date || todayIso();
  const gap = tradingDaysBetween(latestDate, targetDate);
  const asofDatesCount = Math.max(gap + 5, 10);

  const started = await startTrainingDetached(asofDatesCount);
  if (!started?.pid) {
    log('[TRAIN] Failed to start training. Will retry next cycle.');
    return {
      ...state,
      training_restart_count: (state.training_restart_count || 0) + 1,
    };
  }

  const pid = started.pid;
  const startTime = pidStartTime(pid);
  log(`[TRAIN] Started PID=${pid} start_time="${startTime}"`);

  return {
    ...state,
    phase: 'TRAINING_MONITOR',
    training_pid: pid,
    training_pid_start_time: startTime,
    training_job_name: started.jobName || null,
    training_started_at: new Date().toISOString(),
    training_restart_count: (state.training_restart_count || 0) + 1,
  };
}

function phaseTrainingMonitor(state) {
  const pid = state.training_pid;
  const storedStartTime = state.training_pid_start_time;
  const startedAt = state.training_started_at ? new Date(state.training_started_at) : new Date(0);
  const elapsedMinutes = (Date.now() - startedAt.getTime()) / 60000;
  const targetDate = state.target_date || todayIso();
  const expectedJobDir = state.training_job_name
    ? path.join(QUANT_ROOT, 'jobs', state.training_job_name)
    : null;
  const expectedJobExists = expectedJobDir ? fs.existsSync(expectedJobDir) : false;

  // Use PID identity check (not just kill -0)
  const pidAlive = isPidIdentityMatch(pid, storedStartTime);
  const activeJob = findRunningTrainingJob();
  const activeJobName = activeJob?.jobName || null;

  if (activeJob?.pid && (activeJob.pid !== pid || (activeJobName && activeJobName !== state.training_job_name))) {
    log(`[MONITOR] Synchronizing training state to active job PID=${activeJob.pid}${activeJobName ? ` job=${activeJobName}` : ''}.`);
    return {
      ...state,
      training_pid: activeJob.pid,
      training_pid_start_time: activeJob.start_time,
      training_job_name: activeJobName || state.training_job_name || null,
    };
  }

  // Adopt a running job if our stored PID is stale
  if (!pidAlive && activeJob?.pid) {
    log(`[MONITOR] Stored PID=${pid} not identifiable (possibly reused). Adopting active job PID=${activeJob.pid}.`);
    return {
      ...state,
      training_pid: activeJob.pid,
      training_pid_start_time: activeJob.start_time,
      training_job_name: activeJobName || state.training_job_name || null,
    };
  }

  // Check for new runs created since training started
  const runs = scanStageBRuns();
  const newRuns = runs.filter(r => r.mtime > startedAt.getTime());
  const latestNewDate = newRuns.length > 0 ? newRuns[0].date : null;
  const gap = latestNewDate ? tradingDaysBetween(latestNewDate, targetDate) : Infinity;

  log(`[MONITOR] PID=${pid} alive=${pidAlive} elapsed=${elapsedMinutes.toFixed(0)}min new_runs=${newRuns.length} gap=${Number.isFinite(gap) ? gap : '∞'}`);

  // Hard stall: running > STALL_HOURS without new runs
  if (pidAlive && elapsedMinutes > STALL_HOURS * 60 && newRuns.length === 0) {
    log(`[MONITOR] Training stalled > ${STALL_HOURS}h with no new runs. Killing PID=${pid}.`);
    try { process.kill(Number(pid), 'SIGTERM'); } catch {}
    return { ...state, phase: 'TRAINING_CATCHUP', training_pid: null, training_pid_start_time: null };
  }

  // Still running
  if (pidAlive) {
    log('[MONITOR] Training in progress. Waiting for next cycle.');
    process.exit(0);
  }

  // PID dead: check if we have enough new runs
  if (newRuns.length > 0 && gap <= GAP_THRESHOLD_DAYS) {
    log(`[MONITOR] Training complete. Latest new run: ${latestNewDate}. Gap=${gap}. Proceeding to DOWNSTREAM.`);
    return { ...state, phase: 'DOWNSTREAM', downstream_step: 'registry', training_pid: null, training_pid_start_time: null };
  }

  // PID dead but not enough wait
  if (elapsedMinutes < MIN_WAIT_MINUTES) {
    if (!activeJob?.pid && !expectedJobExists) {
      log('[MONITOR] Operator PID exited before creating a training job. Restarting immediately.');
      return { ...state, phase: 'TRAINING_CATCHUP', training_pid: null, training_pid_start_time: null };
    }
    log(`[MONITOR] PID gone but only ${elapsedMinutes.toFixed(0)}min elapsed. Waiting.`);
    process.exit(0);
  }

  // PID dead, waited, still no adequate runs → restart
  if (newRuns.length === 0) {
    log('[MONITOR] Training produced no new runs. Restarting catchup.');
  } else {
    log(`[MONITOR] New runs added (gap=${gap}) but still stale. Running another sweep.`);
  }
  return { ...state, phase: 'TRAINING_CATCHUP', training_pid: null, training_pid_start_time: null };
}

function phaseDownstream(state) {
  // Use target_date from state — never new Date() — for consistency across reboots/midnight
  const targetDate = state.target_date || todayIso();
  const trainedAt = state.training_started_at ? new Date(state.training_started_at) : null;
  let step = state.downstream_step || 'registry';

  if (step === 'registry') {
    // Resume check: is there a registry report newer than training_started_at for target_date?
    const registryDir = path.join(QUANT_ROOT, 'registry');
    const existingReport = findRecentFile(registryDir, /registry_report_.*\.json$/, trainedAt);
    if (existingReport) {
      log(`[DOWNSTREAM] Registry report already exists (${path.basename(existingReport)}). Skipping.`);
    } else {
      const { ok } = runPython([
        path.join(SCRIPTS_DIR, 'run_registry_update_q1.py'),
        '--quant-root', QUANT_ROOT,
        '--v4-final-profile',
      ], { label: 'registry_update' });
      if (!ok) {
        log('[DOWNSTREAM] Registry update failed (non-zero exit). Proceeding anyway (warn mode).');
      }
    }
    step = 'portfolio';
    saveState({ ...state, downstream_step: step });
  }

  if (step === 'portfolio') {
    const portfolioDir = path.join(QUANT_ROOT, 'ops/portfolio_q1');
    const existingReport = findRecentFile(portfolioDir, /portfolio.*\.json$/, trainedAt);
    if (existingReport) {
      log(`[DOWNSTREAM] Portfolio report already exists. Skipping.`);
    } else {
      const { ok } = runPython([
        path.join(SCRIPTS_DIR, 'run_portfolio_risk_execution_q1.py'),
        '--quant-root', QUANT_ROOT,
        '--asof-date', targetDate,  // target_date from state, not new Date()
      ], { label: 'portfolio_execution' });
      if (!ok) {
        log('[DOWNSTREAM] Portfolio execution failed. Proceeding anyway.');
      }
    }
    step = 'final_gates';
    saveState({ ...state, downstream_step: step });
  }

  if (step === 'final_gates') {
    const stageBReport = findLatestStageBReport();
    const args = [
      path.join(SCRIPTS_DIR, 'run_v4_final_gate_matrix_q1.py'),
      '--quant-root', QUANT_ROOT,
      '--failure-mode', 'warn',
    ];
    if (stageBReport) args.push('--stageb-report', stageBReport);
    const { ok } = runPython(args, { label: 'final_gates' });
    if (!ok) {
      log('[DOWNSTREAM] Final gates failed (warn mode — continuing).');
    }
    step = 'done';
  }

  log('[DOWNSTREAM] All downstream steps complete.');
  return { ...state, phase: 'LANE_COMPARISON', downstream_step: 'done' };
}

/** Find the most recent file matching a regex in a directory, optionally newer than a Date. */
function findRecentFile(dir, regex, newerThan = null) {
  if (!fs.existsSync(dir)) return null;
  try {
    const files = fs.readdirSync(dir)
      .filter(f => regex.test(f))
      .map(f => {
        const full = path.join(dir, f);
        const mtime = (() => { try { return fs.statSync(full).mtimeMs; } catch { return 0; } })();
        return { f, full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) return null;
    const latest = files[0];
    if (newerThan && latest.mtime < newerThan.getTime()) return null;
    return latest.full;
  } catch { return null; }
}

function findLatestStageBReport() {
  try {
    const runs = scanStageBRuns();
    if (runs.length === 0) return null;
    const latestRunDir = path.join(RUNS_DIR, runs[0].dir);
    const reportPath = path.join(latestRunDir, 'stage_b_q1_run_report.json');
    return fs.existsSync(reportPath) ? reportPath : null;
  } catch { return null; }
}

function phaseLaneComparison(state) {
  const dates = latestStageBDates(3);
  if (dates.length === 0) {
    log('[LANE] No stageb dates found. Skipping lane comparison.');
    return { ...state, phase: 'DAILY_REPORT', lane_comparison_completed: false };
  }

  const asofs = dates.join(',');
  log(`[LANE] Running lane comparison with asofs: ${asofs}`);

  const { ok } = runPython([
    path.join(SCRIPTS_DIR, 'report_stageb_lane_comparison_q1.py'),
    '--quant-root', QUANT_ROOT,
    '--asofs', asofs,
    '--profile-mode', 'v4_final_only',
  ], { label: 'lane_comparison', timeoutMs: 30 * 60 * 1000 });

  if (!ok) {
    log('[LANE] Lane comparison failed. Proceeding to daily report anyway.');
  }

  return { ...state, phase: 'DAILY_REPORT', lane_comparison_completed: ok };
}

function phaseDailyReport(state) {
  log('[REPORT] Building QuantLab daily report...');
  const { ok } = runNode(DAILY_REPORT_SCRIPT, { label: 'v4_daily_report', timeoutMs: 10 * 60 * 1000 });
  if (!ok) {
    log('[REPORT] Daily report failed. Will retry next cycle.');
    process.exit(1);
  }
  return { ...state, phase: 'DONE', daily_report_completed: true, completed_at: new Date().toISOString() };
}

function phaseStalled(state) {
  const reason = state.stalled_reason || '';

  // Auto-recovery: if stalled because of storage_blocked, re-check each cycle
  // Once disk is clear, automatically continue training
  if (reason.includes('storage_blocked')) {
    log(`[STALLED] Stalled due to storage_blocked. Re-checking disk space...`);
    const preflight = storagePreflightCheck();
    if (preflight.ok) {
      log('[STALLED→RECOVER] Storage cleared. Auto-recovering to TRAINING_CATCHUP.');
      return {
        ...state,
        phase: 'TRAINING_CATCHUP',
        stalled_reason: null,
        training_pid: null,
        training_pid_start_time: null,
      };
    }
    log(`[STALLED] Storage still blocked. Waiting for archive to free space. (check again in 5 min)`);
    process.exit(0); // Exit cleanly — launchd will retry in 5 min
    return state; // unreachable
  }

  // True manual-intervention stall
  log(`[STALLED] Supervisor stalled: ${reason}`);
  log('[STALLED] Manual intervention required. Use --reset or --reset-to-phase to recover.');
  sendAlert('QuantLab Catchup STALLED (reminder)', reason || 'Unknown reason');
  process.exit(1);
}

// ─── Detached training helper ─────────────────────────────────────────────────

function startTrainingDetached(asofDatesCount) {
  log(`[TRAIN] Starting overnight training sweep via operator (asof-dates-count=${asofDatesCount})`);
  const sweepLog = path.join(REPO_ROOT, 'logs/quantlab-catchup-training.log');
  fs.mkdirSync(path.dirname(sweepLog), { recursive: true });
  fs.appendFileSync(sweepLog, `\n[${new Date().toISOString()}] START asof_dates_count=${asofDatesCount}\n`);

  const operatorScript = path.join(SCRIPTS_DIR, 'start_q1_operator_safe.sh');
  const jobName = `day_q1_safe_catchup_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  // For catchup sweeps: allow ~22 min/date + 30 min buffer, minimum 4 h, cap at 12 h.
  // The operator day-mode default (3.5 h) is too short for multi-date catchup runs.
  const maxHours = Math.min(12, Math.max(4, Math.ceil(asofDatesCount * 22 / 60) + 0.5));
  log(`[TRAIN] MAX_HOURS=${maxHours} for asof_dates_count=${asofDatesCount}`);

  try {
    const logFd = fs.openSync(sweepLog, 'a');
    const child = spawn('/usr/bin/caffeinate', ['-dimsu', '/bin/bash', operatorScript, 'day'], {
      cwd: REPO_ROOT,
      detached: true,
      env: {
        ...process.env,
        DAY_ASOF_DATES_COUNT: String(asofDatesCount),
        MAX_HOURS: String(maxHours),
        WATCH_HOURS: String(maxHours + 0.5),
        JOB_NAME: jobName,
        PYTHON_BIN: PYTHON,
        QUANT_ROOT,
      },
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    fs.closeSync(logFd);
    if (!Number.isFinite(child.pid) || child.pid <= 0) throw new Error(`Bad PID: ${child.pid}`);
    log(`[TRAIN] PID=${child.pid} (caffeinate+operator)`);
    return { pid: child.pid, jobName };
  } catch (err) {
    log(`[ERR] Failed to start training: ${err.message}`);
    return null;
  }
}

// ─── Detached feature store build helper ──────────────────────────────────────

function startFsBuildDetached(snapshotId, manifest) {
  log(`[FS_BUILD] Starting feature store build detached (snapshot=${snapshotId})`);
  const buildLog = path.join(REPO_ROOT, 'logs/quantlab-catchup-fsbuild.log');
  fs.mkdirSync(path.dirname(buildLog), { recursive: true });
  fs.appendFileSync(buildLog, `\n[${new Date().toISOString()}] START snapshot=${snapshotId}\n`);

  const script = path.join(SCRIPTS_DIR, 'build_feature_store_q1_panel.py');
  const params = manifest ? {
    lookback_calendar_days: manifest.lookback_calendar_days,
    panel_calendar_days: manifest.panel_calendar_days,
    max_assets: manifest.max_assets,
    min_bars: manifest.min_bars,
  } : FS_BUILD_DEFAULTS;

  const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;
  const pyArgs = [
    q(PYTHON), q(script),
    '--quant-root', q(QUANT_ROOT),
    '--snapshot-id', q(snapshotId),
    '--feature-store-version', 'v4_q1panel_overnight',
    '--lookback-calendar-days', String(params.lookback_calendar_days),
    '--panel-calendar-days', String(params.panel_calendar_days),
    '--max-assets', String(params.max_assets),
    '--min-bars', String(params.min_bars),
  ].join(' ');

  const runner = fs.existsSync('/usr/bin/caffeinate')
    ? `/usr/bin/caffeinate -dimsu ${pyArgs}`
    : pyArgs;
  const cmd = `${runner} >> ${q(buildLog)} 2>&1 & echo $!`;
  const shell = fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh';

  try {
    const raw = execFileSync(shell, ['-lc', cmd], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    }).trim();
    const pid = parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) throw new Error(`Bad PID: ${raw}`);
    log(`[FS_BUILD] PID=${pid} (caffeinate+python)`);
    return pid;
  } catch (err) {
    log(`[ERR] Failed to start fs build: ${err.message}`);
    return null;
  }
}

// ─── Admin CLI ────────────────────────────────────────────────────────────────

function handleAdminCli(argv) {
  if (argv.includes('--status')) {
    const state = readState();
    process.stdout.write(JSON.stringify(state, null, 2) + '\n');
    process.exit(0);
  }

  if (argv.includes('--reset')) {
    const newState = { ...DEFAULT_STATE, phase: 'CHECK', target_date: todayIso() };
    writeJsonAtomic(STATE_PATH, { ...newState, last_updated: new Date().toISOString() });
    console.log('State reset to CHECK.');
    process.exit(0);
  }

  const resetPhaseIdx = argv.indexOf('--reset-to-phase');
  if (resetPhaseIdx >= 0) {
    const phase = argv[resetPhaseIdx + 1];
    const validPhases = ['CHECK', 'FEATURE_STORE_BUILD', 'FEATURE_STORE_MONITOR', 'TRAINING_CATCHUP', 'TRAINING_MONITOR', 'DOWNSTREAM', 'LANE_COMPARISON', 'DAILY_REPORT', 'DONE', 'STALLED'];
    if (!validPhases.includes(phase)) {
      console.error(`Invalid phase: ${phase}. Valid: ${validPhases.join(', ')}`);
      process.exit(1);
    }
    const state = readState();
    // Always clear training/stall fields when resetting to a training phase —
    // leaving restart_count intact would immediately re-trigger MAX_RESTARTS STALLED.
    // See docs/ops/lessons-learned.md: "--reset-to-phase setzt training_restart_count nicht zurück"
    const trainingReset = ['TRAINING_CATCHUP', 'TRAINING_MONITOR', 'CHECK'].includes(phase)
      ? { training_restart_count: 0, training_pid: null, training_pid_start_time: null, stalled_reason: null }
      : {};
    // Similarly, clear fs build fields when resetting to any fs-build or earlier phase
    const fsBuildReset = ['CHECK', 'FEATURE_STORE_BUILD', 'FEATURE_STORE_MONITOR'].includes(phase)
      ? { fs_build_restart_count: 0, fs_build_pid: null, fs_build_pid_start_time: null, fs_build_started_at: null, fs_build_snapshot_id: null }
      : {};
    const newState = { ...state, ...trainingReset, ...fsBuildReset, phase, last_updated: new Date().toISOString() };
    writeJsonAtomic(STATE_PATH, newState);
    console.log(`State reset to phase: ${phase}`);
    process.exit(0);
  }

  if (argv.includes('--mark-stalled')) {
    const state = readState();
    const reason = 'Manually marked stalled via --mark-stalled';
    const newState = { ...state, phase: 'STALLED', stalled_reason: reason, last_updated: new Date().toISOString() };
    writeJsonAtomic(STATE_PATH, newState);
    sendAlert('QuantLab Catchup manually STALLED', reason);
    console.log('Marked as STALLED.');
    process.exit(0);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  handleAdminCli(argv);

  log('─── QuantLab Catchup Supervisor v3 ───');

  acquireLock();
  process.on('exit', releaseLock);
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
  process.on('SIGINT',  () => { releaseLock(); process.exit(0); });

  let state = readState();

  // Migrate v1/v2 state: ensure new fields exist
  if (!state.training_pid_start_time && state.training_pid) {
    state.training_pid_start_time = null; // Will be re-detected on next monitor cycle
  }
  // v3 migration: add fs_build fields if missing (schema upgrade from v1/v2)
  if (state.fs_build_pid === undefined) state.fs_build_pid = null;
  if (state.fs_build_pid_start_time === undefined) state.fs_build_pid_start_time = null;
  if (state.fs_build_started_at === undefined) state.fs_build_started_at = null;
  if (state.fs_build_restart_count === undefined) state.fs_build_restart_count = 0;
  if (state.fs_build_snapshot_id === undefined) state.fs_build_snapshot_id = null;

  log(`[STATE] phase=${state.phase} restart_count=${state.training_restart_count} target_date=${state.target_date}`);

  let next;

  switch (state.phase) {
    case 'CHECK':
      next = phaseCheck(state);
      break;
    case 'FEATURE_STORE_BUILD':
      next = phaseFeatureStoreBuild(state);
      break;
    case 'FEATURE_STORE_MONITOR':
      next = phaseFeatureStoreMonitor(state);
      break;
    case 'TRAINING_CATCHUP':
      next = await phaseTrainingCatchup(state);
      break;
    case 'TRAINING_MONITOR':
      next = phaseTrainingMonitor(state);
      break;
    case 'DOWNSTREAM':
      next = phaseDownstream(state);
      break;
    case 'LANE_COMPARISON':
      next = phaseLaneComparison(state);
      break;
    case 'DAILY_REPORT':
      next = phaseDailyReport(state);
      break;
    case 'STALLED':
      next = phaseStalled(state);
      break;
    case 'DONE': {
      const today = todayIso();
      if (!state.completed_at || state.completed_at.slice(0, 10) < today) {
        log('[DONE] New trading day — resetting to CHECK.');
        next = { ...DEFAULT_STATE, phase: 'CHECK' };
      } else {
        log('[DONE] Already completed today. Nothing to do.');
        process.exit(0);
      }
      break;
    }
    default:
      log(`[WARN] Unknown phase "${state.phase}" — resetting to CHECK.`);
      next = { ...DEFAULT_STATE, phase: 'CHECK' };
  }

  saveState(next);
  log(`[STATE] → new phase: ${next.phase}`);

  // Run non-blocking phases immediately (avoid waiting 5 min for next launchd cycle).
  // FEATURE_STORE_BUILD already launched the build and returned FEATURE_STORE_MONITOR —
  // we don't re-enter monitor here because the build will run for ~60–90 min.
  // DOWNSTREAM / LANE_COMPARISON / DAILY_REPORT are quick and can chain immediately.
  if (next.phase !== 'TRAINING_MONITOR' && next.phase !== 'FEATURE_STORE_MONITOR'
      && next.phase !== 'DONE' && next.phase !== 'STALLED'
      && next.phase !== state.phase) {
    if (['DOWNSTREAM', 'LANE_COMPARISON', 'DAILY_REPORT'].includes(next.phase)) {
      log('[STATE] Running next phase immediately...');
      const result = await runNextPhaseImmediate(next);
      saveState(result);
      log(`[STATE] → final phase: ${result.phase}`);
    }
  }
}

async function runNextPhaseImmediate(state) {
  switch (state.phase) {
    case 'DOWNSTREAM':      return phaseDownstream(state);
    case 'LANE_COMPARISON': return phaseLaneComparison(state);
    case 'DAILY_REPORT':    return phaseDailyReport(state);
    default: return state;
  }
}

main().catch(err => {
  log(`[FATAL] ${err.message}\n${err.stack}`);
  releaseLock();
  process.exit(1);
});
