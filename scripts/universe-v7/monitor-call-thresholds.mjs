#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import {
  REPO_ROOT,
  appendLine,
  nowIso,
  parseArgs,
  pathExists,
  readJson,
  toFinite,
  writeJsonAtomic
} from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
const step = Math.max(1, Math.floor(toFinite(args.step, 20000)));
const pollMs = Math.max(1000, Math.floor(toFinite(args['poll-ms'], 15000)));
const maxCalls = Math.max(step, Math.floor(toFinite(args['max-calls'], 100000)));
const stopOnNoRun = String(args['stop-on-no-run'] || '').toLowerCase() === 'true';

function isPidAlive(pid) {
  const n = toFinite(pid, null);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function hasBackfillProcesses() {
  try {
    const out = execSync('ps -Ao command', { encoding: 'utf8' });
    const lines = String(out || '').split('\n');
    return lines.some((line) => line.includes('scripts/universe-v7/run-backfill-loop.mjs')
      || line.includes('scripts/universe-v7/pipeline-v7.mjs'));
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath, fallback = null) {
  if (!filePath || !(await pathExists(filePath))) return fallback;
  return readJson(filePath).catch(() => fallback);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHealth({ lockDoc, progressDoc, runStatusDoc }) {
  const lockPidAlive = isPidAlive(lockDoc?.pid);
  const procRunning = hasBackfillProcesses();
  const lockAlive = lockPidAlive || procRunning;
  const fatal = progressDoc?.fatal || null;
  const runReason = String(runStatusDoc?.reason || '');
  const runCode = toFinite(runStatusDoc?.exit_code, null);
  const fatalStop = fatal && toFinite(fatal.code, 0) > 0;
  const runFailed = runReason === 'pipeline_failed' || (Number.isFinite(runCode) && runCode > 0);
  const ok = lockAlive && !fatalStop && !runFailed;
  return {
    ok,
    lock_alive: lockAlive,
    lock_pid_alive: lockPidAlive,
    process_running: procRunning,
    run_failed: runFailed,
    fatal_stop: fatalStop,
    fatal,
    run_status_reason: runReason || null,
    run_status_code: runCode
  };
}

function eventPayload({
  threshold,
  budgetDoc,
  checkpointDoc,
  progressDoc,
  runStatusDoc,
  lockDoc,
  health
}) {
  return {
    schema: 'rv_v7_calls_threshold_event_v1',
    generated_at: nowIso(),
    threshold_calls: threshold,
    observed_calls: toFinite(budgetDoc?.daily_calls, 0),
    day: budgetDoc?.day || null,
    run_id: checkpointDoc?.run_id || runStatusDoc?.run_id || lockDoc?.run_id || null,
    checkpoint_done: Array.isArray(checkpointDoc?.symbols_done) ? checkpointDoc.symbols_done.length : 0,
    checkpoint_pending: Array.isArray(checkpointDoc?.symbols_pending) ? checkpointDoc.symbols_pending.length : 0,
    backfill_remaining: toFinite(progressDoc?.buckets?.[0]?.last_progress?.remaining, null),
    health
  };
}

async function main() {
  const { cfg } = await loadV7Config();
  const budgetStatePath = resolvePathMaybe(cfg?.budget?.state_path)
    || path.join(REPO_ROOT, 'mirrors/universe-v7/state/budget_state.json');
  const checkpointPath = resolvePathMaybe(cfg?.resume?.checkpoint_path)
    || path.join(REPO_ROOT, 'mirrors/universe-v7/state/checkpoint.json');
  const runLockPath = path.join(path.dirname(checkpointPath), 'run.lock');
  const progressPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/backfill_bucket_progress.json');
  const runStatusPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/run_status.json');
  const eventsPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/call_threshold_events.ndjson');
  const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/call_threshold_monitor.json');

  let lastThreshold = 0;
  const existing = await readJsonSafe(reportPath, null);
  if (existing) {
    lastThreshold = Math.max(0, Math.floor(toFinite(existing.last_threshold_reported, 0)));
  }

  while (true) {
    const budgetDoc = await readJsonSafe(budgetStatePath, {});
    const checkpointDoc = await readJsonSafe(checkpointPath, {});
    const progressDoc = await readJsonSafe(progressPath, {});
    const runStatusDoc = await readJsonSafe(runStatusPath, {});
    const lockDoc = await readJsonSafe(runLockPath, {});
    const calls = Math.max(0, Math.floor(toFinite(budgetDoc?.daily_calls, 0)));
    const health = buildHealth({ lockDoc, progressDoc, runStatusDoc });

    const ceilingThreshold = Math.floor(calls / step) * step;
    for (let threshold = lastThreshold + step; threshold <= ceilingThreshold; threshold += step) {
      const payload = eventPayload({
        threshold,
        budgetDoc,
        checkpointDoc,
        progressDoc,
        runStatusDoc,
        lockDoc,
        health
      });
      await appendLine(eventsPath, JSON.stringify(payload));
      lastThreshold = threshold;
      process.stdout.write(`${JSON.stringify(payload)}\n`);
    }

    const report = {
      schema: 'rv_v7_calls_threshold_monitor_v1',
      generated_at: nowIso(),
      step_calls: step,
      max_calls: maxCalls,
      poll_ms: pollMs,
      budget_state_path: path.relative(REPO_ROOT, budgetStatePath),
      checkpoint_path: path.relative(REPO_ROOT, checkpointPath),
      run_lock_path: path.relative(REPO_ROOT, runLockPath),
      progress_path: path.relative(REPO_ROOT, progressPath),
      run_status_path: path.relative(REPO_ROOT, runStatusPath),
      calls_today: calls,
      next_threshold: lastThreshold + step,
      last_threshold_reported: lastThreshold,
      day: budgetDoc?.day || null,
      health,
      current_run: {
        run_id: checkpointDoc?.run_id || runStatusDoc?.run_id || lockDoc?.run_id || null,
        checkpoint_done: Array.isArray(checkpointDoc?.symbols_done) ? checkpointDoc.symbols_done.length : 0,
        checkpoint_pending: Array.isArray(checkpointDoc?.symbols_pending) ? checkpointDoc.symbols_pending.length : 0,
        backfill_remaining: toFinite(progressDoc?.buckets?.[0]?.last_progress?.remaining, null)
      }
    };
    await writeJsonAtomic(reportPath, report);

    if (calls >= maxCalls) break;
    if (stopOnNoRun && !health.lock_alive) break;
    await sleep(pollMs);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: 'FAIL',
    code: 1,
    reason: error?.message || String(error),
    ts: nowIso()
  })}\n`);
  process.exit(1);
});
