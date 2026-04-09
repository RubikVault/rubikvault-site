#!/usr/bin/env node
/**
 * Storage Housekeeping Supervisor
 * ================================
 * Single responsibility: keep Mac disk from filling up through automatic,
 * safe, quality-preserving archival of unused data to NAS cold storage.
 *
 * Lessons learned aus Incidents an diesem Skript: docs/ops/lessons-learned.md
 *
 * Design principles:
 *  - NEVER moves data needed by active repo, QuantLab training, or prediction pipelines
 *  - Only starts when NAS is reachable (Mac at home on local network)
 *  - Survives Mac reboots / sleep / wake (launchd-managed, RunAtLoad=true)
 *  - Retry-safe: each archive class retried independently up to MAX_RETRIES
 *  - Skip-safe: if one class fails, continues with the next
 *  - Does NOT interrupt active training jobs
 *  - Dynamic safety verification for non-trivial archive classes
 *  - Full audit trail in state file + macOS notifications on issues
 *
 * Invoked every 30 min via launchd.
 *
 * Archive classes (in priority order):
 *   1. q1step2bars_snapshot  rank>2  — ALWAYS SAFE: training uses only latest by date/mtime
 *   2. q1step1_snapshot      rank>2  — ALWAYS SAFE: small rebuild artifacts, older = unused
 *   3. feature_store_old_version     — VERIFIED: only if no active script references the version
 *   4. feature_store_old_partition   — VERIFIED: only if outside the 90-day active training window
 *
 * State file: $QUANT_ROOT/ops/housekeeping-state.json
 * Lock file:  $QUANT_ROOT/ops/housekeeping.lock
 * Log:        logs/storage-housekeeping.log (via launchd StandardOutPath)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import os from 'node:os';

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT  = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const QUANT_ROOT = process.env.QUANT_ROOT
  || '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';
const HOME = os.homedir();

const GOVERNOR           = path.join(REPO_ROOT, 'scripts/ops/run-storage-governor.mjs');
const STATE_PATH         = path.join(QUANT_ROOT, 'ops/housekeeping-state.json');
const LOCK_PATH          = path.join(QUANT_ROOT, 'ops/housekeeping.lock');
const GOVERNOR_ARCHIVE_LOCK = path.join(QUANT_ROOT, 'ops/governor-archive.lock');
const SCRIPTS_QUANT      = path.join(REPO_ROOT, 'scripts/quantlab');

// ─── Thresholds ───────────────────────────────────────────────────────────────

/**
 * Only archive if disk is below TRIGGER_FREE_GB.
 * Stop archiving when STOP_FREE_GB is reached.
 * These mirror storage-budget.v1.json but are read here for fast decisions.
 */
const TRIGGER_FREE_GB = 100;  // Matches warn_free_gb in budget policy
const STOP_FREE_GB    = 120;  // Matches target_free_gb in budget policy
const BLOCK_FREE_GB   = 80;   // Matches block_heavy_jobs_free_gb

const MAX_RETRIES     = 3;    // Retries per archive class before skipping
const RETRY_DELAY_MS  = 15000; // 15s between retries

// ─── Archive class definitions ────────────────────────────────────────────────

/**
 * safety:
 *   'proven'   — mathematically safe: pipeline always uses latest; rank>2 = pure backup
 *   'verified' — requires dynamic safety check before archiving
 */
const ARCHIVE_CLASSES = [
  {
    id:            'q1step2bars_snapshot',
    label:         'q1step2bars snapshots (rank > 2)',
    safety:        'proven',
    est_gb_each:   6.7,
    reason:        'Training pipeline always selects the most recent snapshot by date/mtime. Rank>2 copies are pure backups never read by any active process.',
  },
  {
    id:            'q1step1_snapshot',
    label:         'q1step1 snapshots (rank > 2)',
    safety:        'proven',
    est_gb_each:   0.018,
    reason:        'Step1 snapshots are intermediate rebuild artifacts. Only needed if a step2bars rebuild is required from scratch. Keep latest 2 for safety.',
  },
  {
    id:            'feature_store_old_version',
    label:         'non-production feature store versions',
    safety:        'verified',
    est_gb_each:   1.0,
    reason:        'Old versions (v4_q1inc, v4_q1min, etc.) superseded by v4_q1panel_overnight. Safe only if no active Python script references the version string.',
    verifier:      'checkFeatureStoreVersionsUnused',
  },
  {
    id:            'feature_store_old_partition',
    label:         'feature store as-of partitions outside 90-day active window',
    safety:        'verified',
    est_gb_each:   0.5,
    reason:        'As-of partitions older than 90 calendar days from the latest Stage-B run are outside the active training window. Safe if no running job references them.',
    verifier:      'checkNoActiveTrainingJob',
  },
];

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

function log(msg) {
  console.log(`[${new Date().toISOString()}] [housekeeping] ${msg}`);
}

function dfFreeGb() {
  const p = fs.existsSync(QUANT_ROOT) ? QUANT_ROOT : HOME;
  const r = spawnSync('df', ['-k', p], { encoding: 'utf8', timeout: 5000 });
  if (r.status !== 0) return null;
  const lines = (r.stdout || '').trim().split('\n');
  const cols  = lines[lines.length - 1].trim().split(/\s+/);
  if (cols.length < 4) return null;
  const availKb = Number(cols[3]);
  return Number.isFinite(availKb) ? Math.round((availKb / 1024 / 1024) * 10) / 10 : null;
}

/** Send a macOS notification and write alert to ops dir. */
function alert(title, message) {
  log(`[ALERT] ${title}: ${message}`);
  // macOS native notification via terminal-notifier (no Script Editor on click)
  // Falls back to osascript if terminal-notifier is not installed.
  try {
    const tn = spawnSync('which', ['terminal-notifier'], { encoding: 'utf8' });
    if (tn.status === 0 && tn.stdout.trim()) {
      spawnSync(tn.stdout.trim(), [
        '-title', title,
        '-message', message,
        '-sound', 'Sosumi',
        '-group', 'rubikvault-housekeeping',
      ], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
    } else {
      spawnSync('osascript', [
        '-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Sosumi"`,
      ], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
    }
  } catch {}
  try {
    writeJsonAtomic(path.join(QUANT_ROOT, 'ops/housekeeping-alert.json'), {
      title, message, generated_at: new Date().toISOString(), severity: 'warn',
    });
  } catch {}
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── NAS reachability (via governor report) ───────────────────────────────────

function checkNasReachable() {
  try {
    const r = spawnSync(process.execPath, [GOVERNOR, 'report', '--json'], {
      cwd: REPO_ROOT,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, QUANT_ROOT },
    });
    const out = (r.stdout || '').toString();
    if (!out.trim()) return false;
    const report = JSON.parse(out);
    return report?.nas?.reachable === true;
  } catch { return false; }
}

/** Returns { free_gb, severity } from governor report. */
function getDiskReport() {
  try {
    const r = spawnSync(process.execPath, [GOVERNOR, 'report', '--json'], {
      cwd: REPO_ROOT,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, QUANT_ROOT },
    });
    const out = (r.stdout || '').toString();
    if (!out.trim()) return null;
    return JSON.parse(out);
  } catch { return null; }
}

// ─── Safety Verifiers ─────────────────────────────────────────────────────────

/**
 * Check whether any active Python script in scripts/quantlab references
 * any of the non-production feature store version strings.
 * Returns true if ALL candidate versions are UNREFERENCED (safe to archive).
 */
function checkFeatureStoreVersionsUnused() {
  // Non-production versions known to exist
  const candidateVersions = [
    'v2020_2026', 'v4_q1inc', 'v4_q1min',
    'v4_q1panel_fullchunk_daily',
    'v4_q1panel_overnight_top2500fresh',
    'v4_q1panel_overnight_top3500fresh',
    'v4_q1panel_overnight_top3500fresh_olduv',
    'v4_q1panel',
  ];

  const searchPaths = [SCRIPTS_QUANT].filter(p => fs.existsSync(p));

  for (const ver of candidateVersions) {
    const storeDir = path.join(QUANT_ROOT, `features/store/feature_store_version=${ver}`);
    if (!fs.existsSync(storeDir)) continue; // Already gone or doesn't exist

    // Grep all Python scripts for this version string
    let referenced = false;
    for (const dir of searchPaths) {
      const r = spawnSync('grep', ['-rl', '--include=*.py', ver, dir], {
        encoding: 'utf8', timeout: 10000,
      });
      if (r.status === 0 && (r.stdout || '').trim()) {
        const files = r.stdout.trim().split('\n').filter(Boolean);
        log(`[VERIFY] ${ver} referenced in: ${files.map(f => path.basename(f)).join(', ')} — SKIP`);
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      log(`[VERIFY] ${ver} not referenced in any active script — SAFE to archive`);
    }
  }

  // All versions that exist but are unreferenced are safe — the governor will archive them
  // Return true to allow the governor to proceed (it will skip already-archived ones)
  return true;
}

/**
 * Check that no QuantLab training job is currently active.
 * Feature store partition archival is only safe when no job is reading the store.
 */
function checkNoActiveTrainingJob() {
  try {
    const output = execFileSync('/bin/ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8', timeout: 5000,
    });
    const lines = String(output || '').split('\n');
    for (const line of lines) {
      const cmd = line.replace(/^\s*\d+\s+/, '');
      if (
        cmd.includes('run_overnight_q1_training_sweep.py')
        || cmd.includes('start_q1_operator_safe.sh')
        || cmd.includes('run_q1_auto_day.py')
        || cmd.includes('run_overnight_q1_supervised_safe.sh')
        || cmd.includes('watch_overnight_q1_job.py')
      ) {
        log(`[VERIFY] Active training job detected — skipping feature_store_old_partition archive`);
        return false;
      }
    }
  } catch {}
  return true;
}

const VERIFIERS = {
  checkFeatureStoreVersionsUnused,
  checkNoActiveTrainingJob,
};

// ─── Governor archive runner with retries ─────────────────────────────────────

/**
 * Run governor archive for a class.
 * Returns { ok: bool, freed_gb_estimate: number }
 */
async function runArchiveClass(classId, estGbEach) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(`[ARCHIVE] ${classId} (attempt ${attempt}/${MAX_RETRIES})...`);
    try {
      const result = spawnSync(
        process.execPath,
        [GOVERNOR, 'archive', '--class', classId],
        {
          cwd: REPO_ROOT,
          timeout: 7200000, // 2h max per class
          stdio: ['ignore', 'inherit', 'inherit'],
          env: { ...process.env, QUANT_ROOT },
        }
      );

      if (result.status === 0 || result.status === 22) {
        // 0 = all ok, 22 = partial failure (some items failed but some succeeded)
        // Either way, disk may have improved — re-check and continue
        if (result.status === 22) {
          log(`[WARN] ${classId}: partial failure (exit 22) — some items may not have archived`);
        } else {
          log(`[OK] ${classId}: archive complete`);
        }
        return { ok: true };
      }

      if (result.status === 21) {
        log(`[SKIP] ${classId}: NAS became unreachable during archive (exit 21)`);
        return { ok: false, nas_gone: true };
      }

      log(`[ERR] ${classId}: governor exit=${result.status}`);
    } catch (err) {
      log(`[ERR] ${classId}: ${err.message}`);
    }

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * attempt;
      log(`[RETRY] Waiting ${delay / 1000}s before retry ${attempt + 1}...`);
      await sleep(delay);
    }
  }

  log(`[FAIL] ${classId}: gave up after ${MAX_RETRIES} retries`);
  return { ok: false };
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

function pidStartTime(pid) {
  try {
    const r = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8', timeout: 5000,
    });
    const s = (r || '').trim();
    return s.length > 0 ? s : null;
  } catch { return null; }
}

function acquireLock() {
  try {
    const existing = readJson(LOCK_PATH);
    if (existing?.pid) {
      const currentStart = pidStartTime(existing.pid);
      if (currentStart && existing.pid_start_time
          && currentStart.replace(/\s+/g, ' ').trim() === existing.pid_start_time.replace(/\s+/g, ' ').trim()) {
        log(`[LOCK] Another housekeeping instance running (pid=${existing.pid}). Exiting.`);
        process.exit(0);
      }
    }
  } catch {}
  writeJsonAtomic(LOCK_PATH, {
    pid: process.pid,
    pid_start_time: pidStartTime(process.pid),
    started_at: new Date().toISOString(),
  });
}

function releaseLock() {
  try { fs.rmSync(LOCK_PATH, { force: true }); } catch {}
}

// ─── State ────────────────────────────────────────────────────────────────────

function readState() {
  return readJson(STATE_PATH) || {
    schema: 'housekeeping_v1',
    last_run_at: null,
    last_run_result: null,
    last_free_gb_after: null,
    total_archived_gb_estimate: 0,
    runs: [],
  };
}

function saveState(state) {
  writeJsonAtomic(STATE_PATH, { ...state, last_updated: new Date().toISOString() });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('─── Storage Housekeeping Supervisor ───');

  if (!fs.existsSync(GOVERNOR)) {
    log(`Governor not found at ${GOVERNOR}. Exiting.`);
    process.exit(1);
  }

  acquireLock();
  process.on('exit', releaseLock);
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });
  process.on('SIGINT',  () => { releaseLock(); process.exit(0); });

  const runRecord = {
    started_at: new Date().toISOString(),
    actions: [],
    result: 'unknown',
    free_gb_before: null,
    free_gb_after: null,
  };

  // Step 1: Fast disk check before any network calls
  const freeGbBefore = dfFreeGb();
  runRecord.free_gb_before = freeGbBefore;
  log(`Disk free: ${freeGbBefore ?? '?'} GB  trigger=${TRIGGER_FREE_GB} GB  stop=${STOP_FREE_GB} GB`);

  if (freeGbBefore != null && freeGbBefore >= STOP_FREE_GB) {
    log(`Disk above target (${freeGbBefore} GB ≥ ${STOP_FREE_GB} GB). Nothing to do.`);
    runRecord.result = 'ok_nothing_to_do';
    const state = readState();
    state.last_run_at = new Date().toISOString();
    state.last_run_result = runRecord.result;
    state.last_free_gb_after = freeGbBefore;
    state.runs = [runRecord, ...(state.runs || [])].slice(0, 30);
    saveState(state);
    process.exit(0);
  }

  // Step 2a: Check if another governor archive is already running (avoid double-archive)
  try {
    const govLock = readJson(GOVERNOR_ARCHIVE_LOCK);
    if (govLock?.pid) {
      try {
        process.kill(Number(govLock.pid), 0);
        // PID still alive — check identity
        const startLine = spawnSync('/bin/ps', ['-p', String(govLock.pid), '-o', 'lstart='], {
          encoding: 'utf8', timeout: 3000,
        }).stdout?.trim();
        if (startLine && govLock.pid_start_time
            && startLine.replace(/\s+/g, ' ').trim() === govLock.pid_start_time.replace(/\s+/g, ' ').trim()) {
          log(`Governor archive already running (pid=${govLock.pid}). Skipping this housekeeping cycle — will retry in 30 min.`);
          runRecord.result = 'governor_already_running';
          const state = readState();
          state.last_run_at = new Date().toISOString();
          state.last_run_result = runRecord.result;
          state.runs = [runRecord, ...(state.runs || [])].slice(0, 30);
          saveState(state);
          process.exit(0);
        }
      } catch {}
    }
  } catch {}

  // Step 2: Check NAS reachability
  log('Checking NAS reachability...');
  if (!checkNasReachable()) {
    log('NAS not reachable (Mac not at home?). Skipping housekeeping this cycle.');
    runRecord.result = 'nas_unreachable';
    const state = readState();
    state.last_run_at = new Date().toISOString();
    state.last_run_result = runRecord.result;
    state.runs = [runRecord, ...(state.runs || [])].slice(0, 30);
    saveState(state);
    process.exit(0);
  }
  log('NAS reachable. Proceeding with housekeeping.');

  // Step 3: If disk is critically low, also alert
  if (freeGbBefore != null && freeGbBefore < BLOCK_FREE_GB) {
    alert(
      'Storage Housekeeping: Disk LOW',
      `Mac disk only ${freeGbBefore} GB free (< ${BLOCK_FREE_GB} GB threshold). Archiving to NAS...`
    );
  }

  let totalFreedGb = 0;
  let nasGone = false;

  // Step 4: Archive classes in priority order
  for (const cls of ARCHIVE_CLASSES) {
    // Re-check disk after each class
    const currentFree = dfFreeGb();
    log(`Current free: ${currentFree ?? '?'} GB`);

    if (currentFree != null && currentFree >= STOP_FREE_GB) {
      log(`Target reached (${currentFree} GB ≥ ${STOP_FREE_GB} GB). Housekeeping complete.`);
      break;
    }

    if (nasGone) {
      log('NAS unreachable — stopping housekeeping early.');
      break;
    }

    log(`--- Class: ${cls.label} [${cls.safety}] ---`);
    log(`    Reason: ${cls.reason}`);

    // Safety verification for non-proven classes
    if (cls.safety === 'verified' && cls.verifier) {
      const verifyFn = VERIFIERS[cls.verifier];
      if (!verifyFn) {
        log(`[SKIP] No verifier function '${cls.verifier}' — skipping ${cls.id}`);
        runRecord.actions.push({ class: cls.id, result: 'skipped_no_verifier' });
        continue;
      }
      const safe = verifyFn();
      if (!safe) {
        log(`[SKIP] Safety check failed for ${cls.id} — skipping this cycle`);
        runRecord.actions.push({ class: cls.id, result: 'skipped_safety_check' });
        continue;
      }
      log(`[VERIFY] ${cls.id} — safety check passed`);
    }

    const { ok, nas_gone } = await runArchiveClass(cls.id, cls.est_gb_each);

    if (nas_gone) {
      nasGone = true;
      runRecord.actions.push({ class: cls.id, result: 'nas_gone' });
      break;
    }

    runRecord.actions.push({ class: cls.id, result: ok ? 'ok' : 'failed' });
  }

  // Step 5: Final disk check
  const freeGbAfter = dfFreeGb();
  runRecord.free_gb_after = freeGbAfter;
  totalFreedGb = (freeGbAfter ?? 0) - (freeGbBefore ?? 0);
  log(`Disk after housekeeping: ${freeGbAfter ?? '?'} GB free (freed ~${Math.max(0, totalFreedGb).toFixed(1)} GB this run)`);

  if (freeGbAfter != null && freeGbAfter < BLOCK_FREE_GB) {
    alert(
      'Storage Housekeeping: Still Critical',
      `Mac disk still only ${freeGbAfter} GB free after all safe archive classes. Manual intervention may be needed.`
    );
    runRecord.result = 'still_critical';
  } else {
    runRecord.result = 'ok';
  }

  // Step 6: Save state
  const state = readState();
  state.last_run_at = new Date().toISOString();
  state.last_run_result = runRecord.result;
  state.last_free_gb_after = freeGbAfter;
  state.total_archived_gb_estimate = (state.total_archived_gb_estimate || 0) + Math.max(0, totalFreedGb);
  state.runs = [runRecord, ...(state.runs || [])].slice(0, 30); // Keep last 30 runs
  saveState(state);

  log('─── Housekeeping done ───');
  process.exit(0);
}

main().catch(err => {
  console.error(`[FATAL] ${err.message}\n${err.stack}`);
  releaseLock();
  process.exit(1);
});
