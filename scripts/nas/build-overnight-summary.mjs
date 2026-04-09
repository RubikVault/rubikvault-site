#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const HISTORY_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-history.json');
const LATEST_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/nas-overnight-summary-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/nas-overnight-summary-latest.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
}

const [history, latest] = await Promise.all([readJson(HISTORY_PATH), readJson(LATEST_PATH)]);
const sinceTs = Date.now() - 24 * 60 * 60 * 1000;

const recentRuns = (history?.runs || []).filter((run) => {
  const stamp = String(run?.stamp || '');
  const iso = stamp.length >= 15
    ? `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`
    : null;
  const ts = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ts) && ts >= sinceTs;
});

const stages = Object.fromEntries((latest?.stages || []).map((stage) => [stage.stage, stage]));
const stageNames = [...new Set(recentRuns.map((run) => run.stage).concat(Object.keys(stages)))].sort();

const summaryStages = stageNames.map((stage) => {
  const runs = recentRuns.filter((run) => run.stage === stage);
  const successes = runs.filter((run) => run.success);
  const latestStage = stages[stage] || null;
  return {
    stage,
    recent_total_runs: runs.length,
    recent_successful_runs: successes.length,
    recent_failed_runs: runs.length - successes.length,
    recent_average_factor_nas_vs_mac: average(successes.map((run) => run.durations?.factor_nas_vs_local_reference ?? null)),
    recent_average_nas_duration_sec: average(successes.map((run) => run.durations?.nas_sec ?? null)),
    recent_average_local_duration_sec: average(successes.map((run) => run.durations?.local_reference_sec ?? null)),
    recent_average_local_max_rss_mb: average(successes.map((run) => run.local_reference_memory?.max_rss_mb ?? null)),
    recent_average_swap_delta_mb: average(successes.map((run) => run.nas_swap?.used_delta_mb ?? null)),
    latest_success_stamp: latestStage?.latest_success?.stamp || null,
    current_classification: null
  };
});

const matrixPath = path.join(ROOT, 'tmp/nas-benchmarks/nas-capacity-decision-matrix.md');
let matrixText = '';
try {
  matrixText = await fs.readFile(matrixPath, 'utf8');
} catch {}

for (const stage of summaryStages) {
  const match = matrixText.match(new RegExp(`\\| ${stage.stage.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} \\|[^\\n]*\\| ([a-z_]+) \\|`));
  stage.current_classification = match ? match[1] : null;
}

const summary = {
  schema_version: 'nas.overnight.summary.v1',
  generated_at: new Date().toISOString(),
  window_hours: 24,
  stages: summaryStages
};

const lines = [
  '# NAS Overnight Summary',
  '',
  `Generated at: ${summary.generated_at}`,
  '',
  '| Stage | Runs (24h) | Success | Avg Factor NAS/Mac | Avg NAS Sec | Avg Local RSS MB | Avg Swap Delta MB | Classification |',
  '|---|---:|---:|---:|---:|---:|---:|---|'
];

for (const stage of summaryStages) {
  lines.push(`| ${stage.stage} | ${stage.recent_total_runs} | ${stage.recent_successful_runs} | ${stage.recent_average_factor_nas_vs_mac ?? 'n/a'} | ${stage.recent_average_nas_duration_sec ?? 'n/a'} | ${stage.recent_average_local_max_rss_mb ?? 'n/a'} | ${stage.recent_average_swap_delta_mb ?? 'n/a'} | ${stage.current_classification ?? 'n/a'} |`);
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(summary, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
