#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const SHADOW_ROOT = path.join(ROOT, 'tmp/nas-shadow-runs');
const OUT_DIR = path.join(ROOT, 'tmp/nas-benchmarks');
const HISTORY_OUT = path.join(OUT_DIR, 'nas-shadow-benchmark-history.json');
const LATEST_OUT = path.join(OUT_DIR, 'nas-shadow-benchmark-latest.json');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function listDirs(dirPath) {
  try {
    return (await fs.readdir(dirPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
}

const existingHistory = await readJson(HISTORY_OUT);
const stageNames = await listDirs(SHADOW_ROOT);
const discoveredRuns = [];

for (const stage of stageNames) {
  const stamps = await listDirs(path.join(SHADOW_ROOT, stage));
  for (const stamp of stamps) {
    const metrics = await readJson(path.join(SHADOW_ROOT, stage, stamp, 'metrics.json'));
    if (!metrics) continue;
    discoveredRuns.push(metrics);
  }
}

const runsByKey = new Map();
for (const run of existingHistory?.runs || []) {
  if (!run?.stage || !run?.stamp) continue;
  runsByKey.set(`${run.stage}:${run.stamp}`, run);
}
for (const run of discoveredRuns) {
  if (!run?.stage || !run?.stamp) continue;
  runsByKey.set(`${run.stage}:${run.stamp}`, run);
}

const runs = [...runsByKey.values()];
runs.sort((a, b) => String(a.stamp || '').localeCompare(String(b.stamp || '')));

const stages = {};
for (const run of runs) {
  const bucket = stages[run.stage] || [];
  bucket.push(run);
  stages[run.stage] = bucket;
}

const latest = {
  schema_version: 'nas.shadow.benchmark.latest.v1',
  generated_at: new Date().toISOString(),
  stages: Object.entries(stages).sort(([a], [b]) => a.localeCompare(b)).map(([stage, stageRuns]) => {
    const successful = stageRuns.filter((run) => run.success);
    const latestRun = stageRuns[stageRuns.length - 1] || null;
    const latestSuccess = successful[successful.length - 1] || null;
    return {
      stage,
      total_runs: stageRuns.length,
      successful_runs: successful.length,
      failed_runs: stageRuns.length - successful.length,
      latest_run: latestRun ? {
        stamp: latestRun.stamp,
        success: latestRun.success,
        status: latestRun.status,
        gate: latestRun.gate,
        factor_nas_vs_local_reference: latestRun.durations?.factor_nas_vs_local_reference ?? null,
        nas_duration_sec: latestRun.durations?.nas_sec ?? null,
        local_reference_duration_sec: latestRun.durations?.local_reference_sec ?? null,
        local_reference_max_rss_mb: latestRun.local_reference_memory?.max_rss_mb ?? null,
        swap_delta_mb: latestRun.nas_swap?.used_delta_mb ?? null,
        compare_all_ok: latestRun.compares?.all_ok ?? null,
        services_ok: latestRun.services?.all_required_ok ?? null
      } : null,
      latest_success: latestSuccess ? {
        stamp: latestSuccess.stamp,
        factor_nas_vs_local_reference: latestSuccess.durations?.factor_nas_vs_local_reference ?? null,
        nas_duration_sec: latestSuccess.durations?.nas_sec ?? null,
        local_reference_duration_sec: latestSuccess.durations?.local_reference_sec ?? null
      } : null,
      averages_successful: {
        factor_nas_vs_local_reference: average(successful.map((run) => run.durations?.factor_nas_vs_local_reference ?? null)),
        nas_duration_sec: average(successful.map((run) => run.durations?.nas_sec ?? null)),
        local_reference_duration_sec: average(successful.map((run) => run.durations?.local_reference_sec ?? null)),
        local_reference_max_rss_mb: average(successful.map((run) => run.local_reference_memory?.max_rss_mb ?? null)),
        swap_delta_mb: average(successful.map((run) => run.nas_swap?.used_delta_mb ?? null)),
        mem_available_delta_mb: average(successful.map((run) => run.nas_memory?.available_delta_mb ?? null))
      }
    };
  })
};

const history = {
  schema_version: 'nas.shadow.benchmark.history.v1',
  generated_at: new Date().toISOString(),
  total_runs: runs.length,
  runs: runs.map((run) => ({
    stage: run.stage,
    stamp: run.stamp,
    success: run.success,
    status: run.status,
    gate: run.gate,
    durations: run.durations,
    local_reference_memory: run.local_reference_memory,
    nas_memory: run.nas_memory,
    nas_swap: run.nas_swap,
    nas_loadavg: run.nas_loadavg,
    services: run.services,
    compares: {
      all_ok: run.compares?.all_ok ?? null,
      reports: run.compares?.reports ?? []
    },
    paths: {
      run_dir: run.paths?.run_dir ?? null
    }
  }))
};

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(HISTORY_OUT, JSON.stringify(history, null, 2) + '\n', 'utf8');
await fs.writeFile(LATEST_OUT, JSON.stringify(latest, null, 2) + '\n', 'utf8');

process.stdout.write(`${LATEST_OUT}\n${HISTORY_OUT}\n`);
