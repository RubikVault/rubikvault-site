#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeJsonDurableAtomicSync } from '../lib/durable-atomic-write.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const HEARTBEAT_PATH = path.join(ROOT, 'mirrors/ops/pipeline-master/supervisor-heartbeat.json');
const FINAL_SEAL_PATH = path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const CRASH_SEAL_PATH = path.join(ROOT, 'public/data/ops/crash-seal-latest.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ageMs(value, now = Date.now()) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? now - ms : Infinity;
}

export function evaluateDeadman({
  heartbeat,
  finalSeal,
  now = Date.now(),
  heartbeatTtlMs = 45 * 60 * 1000,
  finalSealTtlMs = 30 * 60 * 60 * 1000,
} = {}) {
  const heartbeatStale = ageMs(heartbeat?.last_seen, now) > heartbeatTtlMs;
  const finalSealStale = ageMs(finalSeal?.generated_at, now) > finalSealTtlMs;
  return {
    trigger_failed: heartbeatStale && finalSealStale,
    heartbeat_stale: heartbeatStale,
    final_seal_stale: finalSealStale,
    heartbeat_last_seen: heartbeat?.last_seen || null,
    final_seal_generated_at: finalSeal?.generated_at || null,
  };
}

function writeDeadmanCrashSeal(heartbeat, finalSeal, evaluation) {
  const payload = {
    schema: 'rv.crash_seal.v1',
    schema_version: '1.0',
    status: 'FAILED',
    run_id: heartbeat?.run_id || finalSeal?.run_id || null,
    target_market_date: heartbeat?.target_market_date || finalSeal?.target_market_date || null,
    generated_at: new Date().toISOString(),
    failed_step: heartbeat?.active_step || 'pipeline_master',
    exit_code: null,
    signal: null,
    failure_class: 'deadman_triggered',
    blocking_reasons: ['heartbeat_stale'],
    deadman: evaluation,
  };
  writeJsonDurableAtomicSync(CRASH_SEAL_PATH, payload);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const heartbeat = readJson(HEARTBEAT_PATH);
  const finalSeal = readJson(FINAL_SEAL_PATH);
  const evaluation = evaluateDeadman({ heartbeat, finalSeal });
  let crashSeal = null;
  if (evaluation.trigger_failed) {
    crashSeal = writeDeadmanCrashSeal(heartbeat, finalSeal, evaluation);
    spawnSync(process.execPath, ['scripts/ops/final-integrity-seal.mjs', '--allow-unready'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
  }
  process.stdout.write(`${JSON.stringify({
    ok: !evaluation.trigger_failed,
    evaluation,
    crash_seal_written: Boolean(crashSeal),
  }, null, 2)}\n`);
  if (evaluation.trigger_failed) process.exitCode = 1;
}
