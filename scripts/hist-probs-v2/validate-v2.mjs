#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const RUN_ROOT = path.join(ROOT, 'mirrors/hist-probs-v2/runs');

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return '1';
  return hit.slice(prefix.length);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readNdjsonGz(filePath) {
  try {
    const raw = await fs.readFile(filePath);
    return zlib.gunzipSync(raw).toString('utf8').split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export async function validateHistProbsV2Run(runId) {
  const latest = await readJson(path.join(RUN_ROOT, 'latest.json'));
  const id = runId || latest?.run_id;
  const runDir = id ? path.join(RUN_ROOT, id) : null;
  const manifest = runDir ? await readJson(path.join(runDir, 'manifest.json')) : null;
  const coverage = runDir ? await readJson(path.join(runDir, 'coverage.json')) : null;
  const performance = runDir ? await readJson(path.join(runDir, 'performance.json')) : null;
  const scores = runDir ? await readNdjsonGz(path.join(runDir, 'scores.ndjson.gz')) : [];
  const errors = [];
  if (!id) errors.push('missing_run_id');
  if (!manifest) errors.push('missing_manifest');
  if (!coverage) errors.push('missing_coverage');
  if (!performance) errors.push('missing_performance');
  if (scores.length !== Number(coverage?.scores || 0)) errors.push('score_count_mismatch');
  if (scores.some((row) => row.buy_eligible === true || row.verdict === 'BUY')) errors.push('shadow_contains_buy_signal');
  if (scores.some((row) => String(row.asset_class || '').toUpperCase() === 'INDEX')) errors.push('index_in_shadow_scores');
  return {
    schema: 'rv.hist_probs_v2.validation.v1',
    generated_at: new Date().toISOString(),
    run_id: id || null,
    status: errors.length ? 'failed' : 'ok',
    errors,
    coverage,
    performance,
  };
}

async function main() {
  const out = argValue('--out', null);
  const runId = argValue('--run-id', null);
  const report = await validateHistProbsV2Run(runId);
  if (out) {
    await fs.mkdir(path.dirname(out), { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(report, null, 2));
    await fs.rename(tmp, out);
  }
  console.log(`[hist-probs-v2:validate] status=${report.status} run_id=${report.run_id || 'missing'}`);
  if (report.status !== 'ok') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[hist-probs-v2:validate] fatal', error);
    process.exit(1);
  });
}
