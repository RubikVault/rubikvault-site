#!/usr/bin/env node
/**
 * Night Supervisor
 *
 * Long-running overnight orchestrator. Checks every 30 min:
 *
 *  1. Monitors hist_probs rebuild PID   → when done: rebuild system-status + dashboard
 *  2. After midnight: clears EODHD lock → runs market_data_refresh (~95k calls)
 *  3. After market_data_refresh done:   → runs second hist_probs (force, fresh EODHD data)
 *  4. After hist_probs 2 done:          → final system-status + dashboard meta
 *  5. Every cycle:                      → rebuild system-status (cheap)
 *  6. Monitors catchup supervisor:      → resets it if stuck > 45 min same phase
 *
 * Start:  caffeinate -dimsu node scripts/ops/run-night-supervisor.mjs
 * Or via: launchctl load ~/Library/LaunchAgents/com.rubikvault.night.supervisor.plist
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ─── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const QUANT_ROOT = process.env.QUANT_ROOT
  || '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';
const PYTHON = process.env.PYTHON_BIN
  || path.join(REPO_ROOT, 'quantlab/.venv/bin/python');

const STATE_PATH        = path.join(QUANT_ROOT, 'ops/night-supervisor-state.json');
const LOG_PATH          = path.join(REPO_ROOT, 'logs/night-supervisor.log');
const EODHD_LOCK        = path.join(REPO_ROOT, 'mirrors/universe-v7/state/API_LIMIT_REACHED.lock.json');
const CATCHUP_STATE     = path.join(QUANT_ROOT, 'ops/catchup-supervisor-state.json');
const CATCHUP_LOCK      = path.join(QUANT_ROOT, 'ops/catchup-supervisor.lock');
// Release state SSOT — authoritative End-to-End pipeline state
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');

const HIST_PROBS_LOG = path.join(REPO_ROOT, 'logs/hist-probs-rebuild-night.log');
const EODHD_LOG      = path.join(REPO_ROOT, 'logs/eodhd-refresh-night.log');

// ─── Config ────────────────────────────────────────────────────────────────────

const CYCLE_MS           = 30 * 60 * 1000;  // 30 min
const CATCHUP_STUCK_MIN  = 45;               // reset catchup supervisor if stuck > 45 min same phase
const MAX_EODHD_WAIT_H   = 5;               // give up on EODHD refresh after 5h

// ─── Logging ───────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

function log(msg) {
  // launchd redirects stdout → StandardOutPath; console.log is sufficient
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function nowIso() { return new Date().toISOString(); }

/**
 * Returns true only after 00:05 UTC on 2026-04-08 (the day AFTER the API limit was set).
 * EODHD budget resets at UTC midnight. The lock was created on 2026-04-07 UTC.
 */
function isPastUtcMidnightForEodhd() {
  const now = new Date();
  const utcDate  = now.toISOString().slice(0, 10);  // "2026-04-08" etc.
  const utcHour  = now.getUTCHours();
  const utcMin   = now.getUTCMinutes();
  // Must be April 8 UTC or later, and past 00:05
  if (utcDate < '2026-04-08') return false;
  if (utcDate === '2026-04-08') return utcHour > 0 || (utcHour === 0 && utcMin >= 5);
  return true;  // any day after April 8
}

/** Run node script synchronously (blocking). Returns exit code. */
function runNode(scriptPath, args = [], { timeoutMs = 5 * 60 * 1000, label = '' } = {}) {
  log(`[RUN] node ${path.basename(scriptPath)} ${args.join(' ')} ${label ? `(${label})` : ''}`);
  try {
    const r = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    log(`[${r.status === 0 ? 'OK' : 'FAIL'}] ${label} exit=${r.status ?? 'timeout'}`);
    return r.status ?? -1;
  } catch (e) {
    log(`[ERR] ${label}: ${e.message}`);
    return -1;
  }
}

/** Start a process detached, returns PID or null. */
function startDetached(cmd, logFile, label) {
  log(`[START] ${label}: ${cmd.slice(0, 120)}`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  try {
    const raw = execFileSync('/bin/zsh', ['-lc',
      `${cmd} >> ${logFile} 2>&1 & echo $!`
    ], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 10000 }).trim();
    const pid = parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) throw new Error(`Bad PID: ${raw}`);
    log(`[START] ${label} PID=${pid}`);
    return pid;
  } catch (e) {
    log(`[ERR] Failed to start ${label}: ${e.message}`);
    return null;
  }
}

// ─── State ─────────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  schema: 'night_supervisor_v1',
  hist_probs_1_pid: null,       // PID of first hist_probs run (already running)
  hist_probs_1_done: false,
  system_status_1_built: false,
  eodhd_lock_cleared: false,
  eodhd_refresh_pid: null,
  eodhd_refresh_started_at: null,
  eodhd_refresh_done: false,
  hist_probs_2_pid: null,
  hist_probs_2_started_at: null,
  hist_probs_2_done: false,
  system_status_final_built: false,
  dashboard_meta_done: false,
  completed_at: null,
  cycles: 0,
  started_at: nowIso(),
};

function loadState() {
  return { ...DEFAULT_STATE, ...(readJson(STATE_PATH) || {}) };
}

function saveState(s) {
  writeJson(STATE_PATH, { ...s, last_updated: nowIso() });
}

/**
 * Write/update the release-state SSOT in public/data/ops/release-state-latest.json.
 * Called at each meaningful phase transition so release-gate-check.mjs
 * and the dashboard always reflect the current pipeline status.
 */
function updateReleaseState(patch) {
  try {
    fs.mkdirSync(path.dirname(RELEASE_STATE_PATH), { recursive: true });
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(RELEASE_STATE_PATH, 'utf8')); } catch { return {}; }
    })();
    const today = new Date().toISOString().slice(0, 10);
    const next = {
      schema: 'rv_release_state_v1',
      target_date: today,
      started_at: existing.started_at || nowIso(),
      ...existing,
      ...patch,
      last_updated: nowIso(),
    };
    const tmp = `${RELEASE_STATE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(tmp, RELEASE_STATE_PATH);
  } catch (e) {
    log(`[RELEASE_STATE] Failed to update: ${e.message}`);
  }
}

// ─── Sub-tasks ─────────────────────────────────────────────────────────────────

function rebuildSystemStatus() {
  log('[STATUS] Rebuilding system-status-report...');
  runNode(path.join(REPO_ROOT, 'scripts/ops/build-system-status-report.mjs'),
    [], { timeoutMs: 3 * 60 * 1000, label: 'system_status' });
}

function rebuildDashboardMeta() {
  log('[DASHBOARD] Rebuilding dashboard meta...');
  runNode(path.join(REPO_ROOT, 'scripts/generate_meta_dashboard_data.mjs'),
    [], { timeoutMs: 5 * 60 * 1000, label: 'dashboard_meta' });
}

function rebuildDataFreshness() {
  log('[FRESHNESS] Rebuilding data-freshness-report...');
  runNode(path.join(REPO_ROOT, 'scripts/ops/build-data-freshness-report.mjs'),
    [], { timeoutMs: 3 * 60 * 1000, label: 'data_freshness' });
}

function clearEodhLock() {
  try {
    if (fs.existsSync(EODHD_LOCK)) {
      fs.rmSync(EODHD_LOCK);
      log('[EODHD] API limit lock cleared.');
    } else {
      log('[EODHD] Lock file already absent.');
    }
  } catch (e) {
    log(`[EODHD] Failed to clear lock: ${e.message}`);
  }
}

function startEodhRefresh() {
  // Use the us_eu canonical ids (most important for hist_probs)
  const allowlist = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
  const fromDate = '2026-04-04';
  const cmd = [
    `QUANT_ROOT='${QUANT_ROOT}'`,
    `'${PYTHON}'`,
    `'${path.join(REPO_ROOT, 'scripts/quantlab/refresh_v7_history_from_eodhd.py')}'`,
    `--allowlist-path '${allowlist}'`,
    `--from-date ${fromDate}`,
  ].join(' ');
  return startDetached(cmd, EODHD_LOG, 'eodhd_refresh');
}

function startHistProbsRebuild(label = 'hist_probs') {
  const logFile = path.join(REPO_ROOT, `logs/${label}-${new Date().toISOString().slice(0, 16).replace(':', '')}.log`);
  const cmd = [
    'HIST_PROBS_SKIP_EXISTING=0',
    'NODE_OPTIONS=--max-old-space-size=6144',
    `'${process.execPath}'`,
    `'${path.join(REPO_ROOT, 'run-hist-probs-turbo.mjs')}'`,
  ].join(' ');
  return startDetached(cmd, logFile, label);
}

/** Monitor catchup supervisor — reset if stuck same phase > CATCHUP_STUCK_MIN */
function monitorCatchupSupervisor() {
  const st = readJson(CATCHUP_STATE);
  if (!st) return;

  const phase = st.phase;
  const lastUpdated = st.last_updated ? new Date(st.last_updated) : null;
  const ageMin = lastUpdated ? (Date.now() - lastUpdated.getTime()) / 60000 : 0;

  log(`[CATCHUP] phase=${phase} restart_count=${st.training_restart_count} age=${ageMin.toFixed(0)}min`);

  // If stuck in TRAINING_MONITOR or TRAINING_CATCHUP for > 45 min with no update → nudge
  if (['TRAINING_MONITOR', 'TRAINING_CATCHUP'].includes(phase) && ageMin > CATCHUP_STUCK_MIN) {
    log(`[CATCHUP] Stuck in ${phase} for ${ageMin.toFixed(0)}min — clearing lock and resetting to CHECK`);
    // Clear catchup lock
    try { fs.rmSync(CATCHUP_LOCK, { force: true }); } catch {}
    // Reset to CHECK so next launchd cycle re-evaluates from scratch
    const newState = {
      ...st,
      phase: 'CHECK',
      training_pid: null,
      training_started_at: null,
      last_updated: nowIso(),
    };
    writeJson(CATCHUP_STATE, newState);
    log('[CATCHUP] Reset to CHECK phase.');
  }

  // If DONE: new day check
  if (phase === 'DONE' && st.completed_at) {
    const today = new Date().toISOString().slice(0, 10);
    if (st.completed_at.slice(0, 10) < today) {
      log('[CATCHUP] DONE but new day — resetting to CHECK');
      writeJson(CATCHUP_STATE, { ...st, phase: 'CHECK', completed_at: null });
    }
  }
}

// ─── Main Cycle ────────────────────────────────────────────────────────────────

async function cycle() {
  let state = loadState();
  state.cycles = (state.cycles || 0) + 1;
  log(`\n════ Night Supervisor Cycle #${state.cycles} ════`);

  // Update release state at the start of every cycle so it's always fresh
  updateReleaseState({
    phase: state.completed_at ? 'DONE' : 'NIGHT_RUNNING',
    pids: {
      hist_probs: state.hist_probs_2_pid || state.hist_probs_1_pid || null,
      eodhd_refresh: state.eodhd_refresh_pid || null,
      catchup_supervisor: (() => {
        const cs = (() => { try { return JSON.parse(fs.readFileSync(CATCHUP_STATE, 'utf8')); } catch { return null; } })();
        return cs ? (cs.training_pid || cs.fs_build_pid || null) : null;
      })(),
    },
    quantlab: (() => {
      const cs = (() => { try { return JSON.parse(fs.readFileSync(CATCHUP_STATE, 'utf8')); } catch { return null; } })();
      return cs ? { phase: cs.phase, target_date: cs.target_date, completed_at: cs.completed_at } : null;
    })(),
  });

  // ── 1. Monitor hist_probs 1 ───────────────────────────────────────────────────
  if (!state.hist_probs_1_done) {
    const pid = state.hist_probs_1_pid;
    const alive = isPidAlive(pid);
    log(`[HIST1] PID=${pid} alive=${alive}`);

    if (!alive && pid) {
      log('[HIST1] hist_probs first run completed.');
      state.hist_probs_1_done = true;
      saveState(state);
      updateReleaseState({ phase: 'HIST_PROBS_1_DONE', last_success_phase: 'HIST_PROBS_1' });
    }
    if (alive) {
      // Check progress
      const logFiles = fs.readdirSync(path.join(REPO_ROOT, 'logs'))
        .filter(f => f.startsWith('hist-probs-rebuild-2026') && !f.includes('night'))
        .sort().reverse();
      if (logFiles.length > 0) {
        try {
          const lastLines = fs.readFileSync(
            path.join(REPO_ROOT, 'logs', logFiles[0]), 'utf8'
          ).split('\n').filter(l => l.includes('Progress')).pop();
          if (lastLines) log(`[HIST1] ${lastLines.trim()}`);
        } catch {}
      }
    }
  }

  // ── 2. System status after hist_probs 1 done ─────────────────────────────────
  if (state.hist_probs_1_done && !state.system_status_1_built) {
    log('[HIST1] First hist_probs done → rebuilding system-status...');
    rebuildSystemStatus();
    rebuildDataFreshness();
    state.system_status_1_built = true;
    saveState(state);
  }

  // ── 3. EODHD lock clear + refresh after midnight ──────────────────────────────
  if (!state.eodhd_lock_cleared && isPastUtcMidnightForEodhd()) {
    log('[EODHD] Past midnight — clearing API lock and starting refresh...');
    clearEodhLock();
    state.eodhd_lock_cleared = true;
    const pid = startEodhRefresh();
    state.eodhd_refresh_pid = pid;
    state.eodhd_refresh_started_at = nowIso();
    saveState(state);
  }

  // ── 4. Monitor EODHD refresh ──────────────────────────────────────────────────
  if (state.eodhd_lock_cleared && !state.eodhd_refresh_done && state.eodhd_refresh_pid) {
    const pid = state.eodhd_refresh_pid;
    const alive = isPidAlive(pid);
    const startedAt = state.eodhd_refresh_started_at
      ? new Date(state.eodhd_refresh_started_at) : new Date(0);
    const elapsedH = (Date.now() - startedAt.getTime()) / 3600000;

    log(`[EODHD] PID=${pid} alive=${alive} elapsed=${elapsedH.toFixed(1)}h`);

    if (!alive) {
      log('[EODHD] Refresh process completed.');
      state.eodhd_refresh_done = true;
      saveState(state);
      updateReleaseState({ phase: 'EODHD_DONE', last_success_phase: 'EODHD_REFRESH' });
    }

    if (alive && elapsedH > MAX_EODHD_WAIT_H) {
      log(`[EODHD] Refresh > ${MAX_EODHD_WAIT_H}h — possibly stalled. Will continue without it.`);
      state.eodhd_refresh_done = true;  // proceed anyway
      saveState(state);
    }
  }

  // ── 5. Start second hist_probs after EODHD done ───────────────────────────────
  if (state.eodhd_refresh_done && !state.hist_probs_2_pid) {
    log('[HIST2] EODHD refresh done → starting second hist_probs rebuild (fresh data)...');
    const pid = startHistProbsRebuild('hist_probs_night2');
    state.hist_probs_2_pid = pid;
    state.hist_probs_2_started_at = nowIso();
    saveState(state);
  }

  // ── 6. Monitor hist_probs 2 ───────────────────────────────────────────────────
  if (state.hist_probs_2_pid && !state.hist_probs_2_done) {
    const pid = state.hist_probs_2_pid;
    const alive = isPidAlive(pid);
    log(`[HIST2] PID=${pid} alive=${alive}`);
    if (!alive) {
      log('[HIST2] Second hist_probs completed.');
      state.hist_probs_2_done = true;
      saveState(state);
    }
  }

  // ── 6b. Second EODHD pass after real UTC midnight (if first one ran too early) ─
  if (state.hist_probs_2_done && !state.eodhd_refresh_2_done && isPastUtcMidnightForEodhd()) {
    if (!state.eodhd_refresh_2_pid) {
      log('[EODHD2] Real UTC midnight reached — running proper EODHD refresh...');
      clearEodhLock();
      const pid = startEodhRefresh();
      state.eodhd_refresh_2_pid = pid;
      state.eodhd_refresh_2_started_at = nowIso();
      saveState(state);
    } else {
      const pid = state.eodhd_refresh_2_pid;
      const alive = isPidAlive(pid);
      const startedAt = state.eodhd_refresh_2_started_at
        ? new Date(state.eodhd_refresh_2_started_at) : new Date(0);
      const elapsedH = (Date.now() - startedAt.getTime()) / 3600000;
      log(`[EODHD2] PID=${pid} alive=${alive} elapsed=${elapsedH.toFixed(1)}h`);
      if (!alive || elapsedH > MAX_EODHD_WAIT_H) {
        log('[EODHD2] EODHD refresh 2 complete — starting final hist_probs rebuild...');
        state.eodhd_refresh_2_done = true;
        const hpid = startHistProbsRebuild('hist_probs_night3');
        state.hist_probs_3_pid = hpid;
        state.hist_probs_3_started_at = nowIso();
        saveState(state);
      }
    }
  }

  // Monitor hist_probs_3 (post real-midnight EODHD)
  if (state.hist_probs_3_pid && !state.hist_probs_3_done) {
    const pid = state.hist_probs_3_pid;
    const alive = isPidAlive(pid);
    log(`[HIST3] PID=${pid} alive=${alive}`);
    if (!alive) {
      log('[HIST3] hist_probs_3 completed — will rebuild dashboard in next step.');
      state.hist_probs_3_done = true;
      saveState(state);
      // Force final rebuild
      state.system_status_final_built = false;
      saveState(state);
    }
  }

  // ── 7. Final dashboard rebuild ────────────────────────────────────────────────
  if (state.hist_probs_2_done && !state.system_status_final_built) {
    log('[FINAL] All hist_probs done → final system-status + dashboard rebuild...');
    rebuildDataFreshness();
    rebuildSystemStatus();
    rebuildDashboardMeta();
    state.system_status_final_built = true;
    saveState(state);
  }

  // ── 8. Mark completed ─────────────────────────────────────────────────────────
  if (state.hist_probs_2_done && state.system_status_final_built && !state.completed_at) {
    log('[DONE] Night supervisor sequence complete.');
    state.completed_at = nowIso();
    saveState(state);
    updateReleaseState({
      phase: 'RELEASE_READY',
      last_success_phase: 'HIST_PROBS_2',
      completed_at: state.completed_at,
      blocker: null,
    });
    log('[RELEASE_STATE] Phase set to RELEASE_READY — run node scripts/ops/release-gate-check.mjs to deploy.');
  }

  // ── 9. Every cycle: system-status rebuild + catchup monitor ──────────────────
  monitorCatchupSupervisor();

  // Periodic status rebuild every other cycle (every 60 min)
  if (state.cycles % 2 === 0) {
    rebuildSystemStatus();
  }

  saveState(state);
  log(`[CYCLE] Done. Next check in 30 min.`);
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  log('═══ Night Supervisor starting ═══');

  // Seed release state on startup
  updateReleaseState({ phase: 'NIGHT_START', started_at: nowIso(), blocker: null });

  // Pre-populate known PIDs
  let state = loadState();

  // Find hist_probs PID if not already set
  if (!state.hist_probs_1_pid || !isPidAlive(state.hist_probs_1_pid)) {
    try {
      const out = execFileSync('/bin/ps', ['-axo', 'pid=,command='], {
        encoding: 'utf8', timeout: 5000,
      });
      for (const line of out.split('\n')) {
        if (line.includes('run-hist-probs-turbo.mjs') && !line.includes('grep')) {
          const pid = parseInt(line.trim().split(/\s+/)[0], 10);
          if (Number.isFinite(pid) && pid > 0) {
            log(`[INIT] Found running hist_probs PID=${pid}`);
            state.hist_probs_1_pid = pid;
            break;
          }
        }
      }
    } catch {}
    if (!state.hist_probs_1_pid) {
      log('[INIT] No running hist_probs found. Marking hist_probs_1_done if no PID was ever set.');
      // If we never tracked it, assume it may still be running - check by the output file
      state.hist_probs_1_pid = null;
    }
    saveState(state);
  }

  log(`[INIT] State: hist1_pid=${state.hist_probs_1_pid} hist1_done=${state.hist_probs_1_done} eodhd_done=${state.eodhd_refresh_done}`);

  // Run immediately
  await cycle();

  // Then every 30 min
  setInterval(async () => {
    try {
      await cycle();
    } catch (e) {
      log(`[FATAL_CYCLE] ${e.message}\n${e.stack}`);
    }
  }, CYCLE_MS);

  log('[RUNNING] Night supervisor active. Will check every 30 min.');
}

main().catch(e => {
  log(`[FATAL] ${e.message}\n${e.stack}`);
  process.exit(1);
});
