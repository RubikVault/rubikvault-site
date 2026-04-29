#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const split = argv.indexOf('--');
  const own = split >= 0 ? argv.slice(2, split) : argv.slice(2);
  const command = split >= 0 ? argv.slice(split + 1) : [];
  const options = { mode: process.env.HIST_PROBS_TIER || process.env.RV_HIST_PROBS_TIER || 'all' };
  for (let i = 0; i < own.length; i += 1) {
    const arg = own[i];
    const next = own[i + 1];
    if (arg === '--mode' && next) {
      options.mode = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=').slice(1).join('=');
    }
  }
  return { options, command };
}

function readMemInfo() {
  if (!fs.existsSync('/proc/meminfo')) {
    return {
      mem_available_mb: Math.round(os.freemem() / 1024 / 1024),
      swap_used_mb: 0,
    };
  }
  const text = fs.readFileSync('/proc/meminfo', 'utf8');
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB/);
    if (match) out[match[1]] = Number(match[2]);
  }
  const swapTotal = out.SwapTotal || 0;
  const swapFree = out.SwapFree || 0;
  return {
    mem_available_mb: Math.round((out.MemAvailable || 0) / 1024),
    swap_used_mb: Math.round(Math.max(0, swapTotal - swapFree) / 1024),
  };
}

function readLastResourcePeak(resourcePath) {
  if (!resourcePath || !fs.existsSync(resourcePath)) return null;
  let last = null;
  const lines = fs.readFileSync(resourcePath, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines.slice(-200)) {
    try {
      const row = JSON.parse(line);
      const rssMb = Number(row.rss_mb ?? row.peak_rss_mb ?? row.process_tree_rss_mb);
      const swapMb = Number(row.swap_used_mb ?? row.swap_mb ?? row.swap_delta_mb);
      last = {
        rss_mb: Number.isFinite(rssMb) ? rssMb : last?.rss_mb ?? null,
        swap_used_mb: Number.isFinite(swapMb) ? swapMb : last?.swap_used_mb ?? null,
      };
    } catch {
      // Ignore malformed samples.
    }
  }
  return last;
}

function requestedWorkers() {
  const value = Number(process.env.RV_HIST_PROBS_WORKERS || process.env.HIST_PROBS_WORKERS || 3);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
}

function decideWorkers({ mode, memInfo, previous }) {
  const requested = requestedWorkers();
  const reasons = [];
  let workers = Math.min(requested, 4);
  if (requested >= 6) reasons.push('requested_6_or_more_clamped');
  if (workers < 3) workers = 3;
  const previousRss = Number(previous?.rss_mb);
  const previousSwap = Number(previous?.swap_used_mb);
  const pressure = memInfo.mem_available_mb < 2048
    || memInfo.swap_used_mb > 1024
    || (Number.isFinite(previousRss) && previousRss >= 8192)
    || (Number.isFinite(previousSwap) && previousSwap > 1024);
  if (pressure) {
    workers = 2;
    reasons.push('memory_or_swap_pressure');
  } else if (requested >= 4) {
    if (memInfo.mem_available_mb >= 4096 && (!Number.isFinite(previousRss) || previousRss < 8192) && (!Number.isFinite(previousSwap) || previousSwap <= memInfo.swap_used_mb + 128)) {
      workers = 4;
      reasons.push('safe_for_4_workers');
    } else {
      workers = 3;
      reasons.push('unsafe_for_4_workers');
    }
  } else {
    workers = 3;
    reasons.push('default_3_workers');
  }
  const normalizedMode = String(mode || 'all').toLowerCase();
  const batchSize = Number(process.env.RV_HIST_PROBS_WORKER_BATCH_SIZE || process.env.HIST_PROBS_WORKER_BATCH_SIZE)
    || (normalizedMode.includes('retry') ? 25 : 50);
  return {
    requested,
    workers,
    batch_size: batchSize,
    reasons,
  };
}

function main() {
  const { options, command } = parseArgs(process.argv);
  if (command.length === 0) {
    console.error('usage: node scripts/ops/nas-hist-probs-worker-guard.mjs [--mode MODE] -- <command>');
    process.exit(2);
  }
  const memInfo = readMemInfo();
  const previous = readLastResourcePeak(process.env.RV_HIST_PROBS_LAST_RESOURCES_NDJSON || process.env.RV_LAST_RESOURCES_NDJSON);
  const decision = decideWorkers({ mode: options.mode, memInfo, previous });
  const env = {
    ...process.env,
    HIST_PROBS_WORKERS: String(decision.workers),
    RV_HIST_PROBS_WORKERS: String(decision.workers),
    HIST_PROBS_WORKER_BATCH_SIZE: String(decision.batch_size),
    RV_HIST_PROBS_WORKER_BATCH_SIZE: String(decision.batch_size),
    HIST_PROBS_WORKER_GUARD_STATE: JSON.stringify({
      mode: options.mode,
      mem_info: memInfo,
      previous_resource_sample: previous,
      decision,
    }),
    HIST_PROBS_WORKER_GUARD_REASON: decision.reasons.join(','),
  };
  console.error(`[hist-worker-guard] ${JSON.stringify({ mode: options.mode, ...decision, memInfo, previous })}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env });
  process.exit(result.status == null ? 1 : result.status);
}

main();
