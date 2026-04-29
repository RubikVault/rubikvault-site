#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DEFAULT_RUNTIME = path.join(ROOT, 'runtime/night-pipeline/runs');

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
  const options = {
    mode: 'all',
    defaultWorkers: finiteNumber(process.env.RV_HIST_PROBS_WORKERS || process.env.HIST_PROBS_WORKERS, 3),
    maxWorkers: 4,
    rssLimitMb: 8192,
    swapCriticalMb: 512,
    batchSize: null,
    resourcesPath: process.env.RV_HIST_PROBS_RESOURCES_NDJSON || null,
    child: [],
  };
  const separator = argv.indexOf('--');
  const ownArgs = separator >= 0 ? argv.slice(0, separator) : argv;
  options.child = separator >= 0 ? argv.slice(separator + 1) : [];
  for (let i = 0; i < ownArgs.length; i += 1) {
    const arg = ownArgs[i];
    const next = ownArgs[i + 1];
    const assign = arg.includes('=') ? arg.split('=').slice(1).join('=') : null;
    if (arg === '--mode' && next) {
      options.mode = next;
      i += 1;
    } else if (arg.startsWith('--mode=')) {
      options.mode = assign;
    } else if (arg === '--default-workers' && next) {
      options.defaultWorkers = finiteNumber(next, options.defaultWorkers);
      i += 1;
    } else if (arg.startsWith('--default-workers=')) {
      options.defaultWorkers = finiteNumber(assign, options.defaultWorkers);
    } else if (arg === '--max-workers' && next) {
      options.maxWorkers = finiteNumber(next, options.maxWorkers);
      i += 1;
    } else if (arg.startsWith('--max-workers=')) {
      options.maxWorkers = finiteNumber(assign, options.maxWorkers);
    } else if (arg === '--rss-limit-mb' && next) {
      options.rssLimitMb = finiteNumber(next, options.rssLimitMb);
      i += 1;
    } else if (arg.startsWith('--rss-limit-mb=')) {
      options.rssLimitMb = finiteNumber(assign, options.rssLimitMb);
    } else if (arg === '--swap-critical-mb' && next) {
      options.swapCriticalMb = finiteNumber(next, options.swapCriticalMb);
      i += 1;
    } else if (arg.startsWith('--swap-critical-mb=')) {
      options.swapCriticalMb = finiteNumber(assign, options.swapCriticalMb);
    } else if (arg === '--batch-size' && next) {
      options.batchSize = finiteNumber(next, options.batchSize);
      i += 1;
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = finiteNumber(assign, options.batchSize);
    } else if (arg === '--resources' && next) {
      options.resourcesPath = next;
      i += 1;
    } else if (arg.startsWith('--resources=')) {
      options.resourcesPath = assign;
    }
  }
  return options;
}

function readMeminfo() {
  const info = {};
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^([^:]+):\s+(\d+)/);
      if (match) info[match[1]] = Number(match[2]);
    }
  } catch {
    return null;
  }
  const swapTotal = info.SwapTotal || 0;
  const swapFree = info.SwapFree || 0;
  return {
    memAvailableMb: info.MemAvailable != null ? info.MemAvailable / 1024 : null,
    swapUsedMb: swapTotal > 0 ? (swapTotal - swapFree) / 1024 : 0,
  };
}

function parseResourceLine(line) {
  try {
    const doc = JSON.parse(line);
    return {
      rssMb: finiteNumber(doc.rss_mb, null),
      swapUsedMb: doc.mem?.SwapTotal_kb != null && doc.mem?.SwapFree_kb != null
        ? (Number(doc.mem.SwapTotal_kb) - Number(doc.mem.SwapFree_kb)) / 1024
        : null,
      memAvailableMb: doc.mem?.MemAvailable_kb != null ? Number(doc.mem.MemAvailable_kb) / 1024 : null,
    };
  } catch {
    return null;
  }
}

export function readLatestHistResources({ root = ROOT, resourcesPath = null } = {}) {
  const candidates = [];
  if (resourcesPath) candidates.push(path.resolve(root, resourcesPath));
  try {
    const runDirs = fs.readdirSync(DEFAULT_RUNTIME, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(DEFAULT_RUNTIME, entry.name, 'hist_probs/resources.ndjson'))
      .filter((filePath) => fs.existsSync(filePath))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    candidates.push(...runDirs.slice(0, 3));
  } catch {
    // Runtime dir may not exist in local tests.
  }
  let peakRssMb = null;
  let latest = null;
  for (const filePath of candidates) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const sample = parseResourceLine(line);
        if (!sample) continue;
        latest = sample;
        if (sample.rssMb != null) peakRssMb = Math.max(peakRssMb || 0, sample.rssMb);
      }
      if (latest) return { file_path: filePath, peakRssMb, ...latest };
    } catch {
      // Try next candidate.
    }
  }
  const mem = readMeminfo();
  return { file_path: null, peakRssMb, ...(mem || {}) };
}

export function decideHistProbsWorkers({
  requestedWorkers = 3,
  defaultWorkers = 3,
  maxWorkers = 4,
  previousPeakRssMb = null,
  currentRssMb = null,
  swapUsedMb = 0,
  memAvailableMb = null,
  rssLimitMb = 8192,
  swapCriticalMb = 512,
} = {}) {
  const requested = Math.max(1, Math.floor(finiteNumber(requestedWorkers, defaultWorkers) || defaultWorkers));
  const hardMax = Math.max(1, Math.min(4, Math.floor(finiteNumber(maxWorkers, 4) || 4)));
  let workers = Math.min(requested, hardMax);
  const rssPeak = Math.max(finiteNumber(previousPeakRssMb, 0) || 0, finiteNumber(currentRssMb, 0) || 0);
  const swap = finiteNumber(swapUsedMb, 0) || 0;
  const memAvail = finiteNumber(memAvailableMb, null);
  const reasons = [];
  if (requested > hardMax) reasons.push('requested_clamped');
  if (requested > 4) reasons.push('six_workers_forbidden');
  if (swap >= swapCriticalMb || rssPeak >= rssLimitMb || (memAvail != null && memAvail < 1024)) {
    workers = Math.min(workers, 2);
    reasons.push('memory_pressure');
  } else if (workers >= 4) {
    if (rssPeak > 0 && rssPeak < rssLimitMb && swap < swapCriticalMb) reasons.push('safe_ramp_to_4');
    else {
      workers = 3;
      reasons.push('ramp_to_4_needs_metrics');
    }
  } else {
    workers = Math.min(workers, 3);
    reasons.push('default_safe');
  }
  return {
    workers,
    requested_workers: requested,
    max_workers: hardMax,
    reason: reasons.join(','),
    rss_peak_mb: rssPeak || null,
    swap_used_mb: swap,
    mem_available_mb: memAvail,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.child.length) {
    console.error('usage: nas-hist-probs-worker-guard.mjs [opts] -- <command> [args...]');
    process.exit(2);
  }
  const resourceState = readLatestHistResources({ resourcesPath: options.resourcesPath });
  const decision = decideHistProbsWorkers({
    requestedWorkers: options.defaultWorkers,
    defaultWorkers: options.defaultWorkers,
    maxWorkers: options.maxWorkers,
    previousPeakRssMb: resourceState.peakRssMb,
    currentRssMb: resourceState.rssMb,
    swapUsedMb: resourceState.swapUsedMb,
    memAvailableMb: resourceState.memAvailableMb,
    rssLimitMb: options.rssLimitMb,
    swapCriticalMb: options.swapCriticalMb,
  });
  const env = {
    ...process.env,
    HIST_PROBS_WORKERS: String(decision.workers),
    RV_HIST_PROBS_WORKERS_EFFECTIVE: String(decision.workers),
    RV_HIST_PROBS_WORKER_GUARD: JSON.stringify(decision),
  };
  if (options.batchSize != null) {
    env.HIST_PROBS_WORKER_BATCH_SIZE = String(Math.max(1, Math.floor(options.batchSize)));
  }
  console.error(`[hist-worker-guard] mode=${options.mode} workers=${decision.workers} requested=${decision.requested_workers} reason=${decision.reason} rss_peak_mb=${decision.rss_peak_mb ?? 'n/a'} swap_used_mb=${decision.swap_used_mb ?? 'n/a'} mem_available_mb=${decision.mem_available_mb ?? 'n/a'}`);
  const [cmd, ...args] = options.child;
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status == null ? 1 : result.status);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
