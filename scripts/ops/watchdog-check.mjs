#!/usr/bin/env node
/**
 * watchdog-check.mjs
 *
 * Lighter-weight companion to run-pipeline-deadman-guard.mjs: detects a stuck
 * supervisor step earlier and emits a non-blocking alert artifact so the UI /
 * monitoring dashboards can surface it without waiting for the 45-minute crash-
 * seal threshold.
 *
 * Cadence: intended to run every 10 minutes (DSM Task / launchd / cron).
 *
 * Thresholds (env-overridable):
 *   RV_WATCHDOG_STALE_MIN          default 20  (alert when heartbeat older than this)
 *   RV_WATCHDOG_KILL_AFTER_MIN     default 0   (0 = disabled; > 0 SIGTERMs the supervisor PID)
 *
 * Output: public/data/ops/watchdog-alert-latest.json
 *
 * Always exit 0 (alerts are observational; the deadman guard handles fail-stop).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const HEARTBEAT_PATH = path.join(ROOT, 'mirrors/ops/pipeline-master/supervisor-heartbeat.json');
const ALERT_PATH = path.join(ROOT, 'public/data/ops/watchdog-alert-latest.json');
const PIPELINE_STATE_PATH = path.join(ROOT, 'public/data/ops/pipeline-state-latest.json');

const STALE_MIN = Number(process.env.RV_WATCHDOG_STALE_MIN || 20);
const KILL_AFTER_MIN = Number(process.env.RV_WATCHDOG_KILL_AFTER_MIN || 0);
const STALE_MS = STALE_MIN * 60 * 1000;
const KILL_MS = KILL_AFTER_MIN * 60 * 1000;

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ageMs(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return Infinity;
  return now - t;
}

function classify(heartbeat, pipelineState) {
  const now = Date.now();
  if (!heartbeat) {
    return {
      status: 'no_heartbeat',
      severity: 'warn',
      reason: 'heartbeat_file_missing',
      age_min: null,
      active_step: null,
      run_id: null,
    };
  }
  const state = heartbeat.state || 'unknown';
  const age = ageMs(heartbeat.last_seen, now);
  const ageMin = Number.isFinite(age) ? Math.round(age / 60000) : null;
  if (state !== 'running' && state !== 'starting') {
    return {
      status: 'idle',
      severity: 'info',
      reason: `heartbeat_state_${state}`,
      age_min: ageMin,
      active_step: heartbeat.active_step || null,
      run_id: heartbeat.run_id || null,
    };
  }
  if (age < STALE_MS) {
    return {
      status: 'healthy',
      severity: 'info',
      reason: null,
      age_min: ageMin,
      active_step: heartbeat.active_step || null,
      run_id: heartbeat.run_id || null,
    };
  }
  // Pipeline state may still show progress even if heartbeat went silent
  const pipelineRunning = pipelineState?.last_status === 'running';
  return {
    status: 'stuck',
    severity: pipelineRunning ? 'critical' : 'warn',
    reason: 'heartbeat_age_exceeded',
    age_min: ageMin,
    active_step: heartbeat.active_step || null,
    run_id: heartbeat.run_id || null,
    pipeline_running: pipelineRunning,
  };
}

function maybeKill(heartbeat, classification) {
  if (KILL_AFTER_MIN <= 0) return { attempted: false, reason: 'disabled' };
  if (classification.status !== 'stuck') return { attempted: false, reason: 'not_stuck' };
  if (!heartbeat?.pid) return { attempted: false, reason: 'no_pid' };
  const ageMs = classification.age_min == null ? Infinity : classification.age_min * 60 * 1000;
  if (ageMs < KILL_MS) return { attempted: false, reason: 'below_kill_threshold' };
  try {
    process.kill(heartbeat.pid, 'SIGTERM');
    return { attempted: true, signal: 'SIGTERM', pid: heartbeat.pid, ok: true };
  } catch (err) {
    return { attempted: true, signal: 'SIGTERM', pid: heartbeat.pid, ok: false, error: err?.message || String(err) };
  }
}

function main() {
  const heartbeat = readJsonMaybe(HEARTBEAT_PATH);
  const pipelineState = readJsonMaybe(PIPELINE_STATE_PATH);
  const classification = classify(heartbeat, pipelineState);
  const killAction = maybeKill(heartbeat, classification);
  const alert = {
    schema: 'rv.watchdog_alert.v1',
    generated_at: new Date().toISOString(),
    thresholds: { stale_min: STALE_MIN, kill_after_min: KILL_AFTER_MIN },
    classification,
    kill_action: killAction,
    heartbeat_path: path.relative(ROOT, HEARTBEAT_PATH),
    heartbeat_present: Boolean(heartbeat),
    heartbeat_last_seen: heartbeat?.last_seen || null,
    pipeline_last_status: pipelineState?.last_status || null,
    pipeline_target_market_date: pipelineState?.target_market_date || null,
  };
  fs.mkdirSync(path.dirname(ALERT_PATH), { recursive: true });
  const tmp = `${ALERT_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(alert, null, 2)}\n`);
  fs.renameSync(tmp, ALERT_PATH);
  process.stdout.write(`${JSON.stringify({ ok: true, status: classification.status, severity: classification.severity, age_min: classification.age_min, output: path.relative(ROOT, ALERT_PATH) })}\n`);
}

main();
