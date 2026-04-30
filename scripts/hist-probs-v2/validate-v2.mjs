#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const RUN_ROOT = path.join(ROOT, 'mirrors/hist-probs-v2/runs');

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '1';
  }
  return fallback;
}

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
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

export function validateHistProbsV2Artifacts({
  runId = null,
  manifest = null,
  coverage = null,
  performance = null,
  scores = [],
  targetDate = null,
  expectedMinAssets = 300,
} = {}) {
  const errors = [];
  const expectedDate = normalizeDate(targetDate);
  const manifestTarget = normalizeDate(manifest?.target_market_date || coverage?.target_market_date || null);
  const processedAssets = Number(coverage?.processed_assets || 0);
  const predictions = Number(coverage?.predictions || 0);
  const minAssets = Math.max(1, Number(expectedMinAssets || 300) || 300);
  if (!runId) errors.push('missing_run_id');
  if (!manifest) errors.push('missing_manifest');
  if (!coverage) errors.push('missing_coverage');
  if (!performance) errors.push('missing_performance');
  if (expectedDate && manifestTarget !== expectedDate) errors.push('target_market_date_mismatch');
  if (processedAssets < minAssets) errors.push('processed_assets_below_expected_min');
  if (predictions <= 0) errors.push('zero_predictions');
  if (performance?.timed_out === true) errors.push('timed_out');
  if (scores.length !== Number(coverage?.scores || 0)) errors.push('score_count_mismatch');
  if (scores.some((row) => row.buy_eligible === true || row.verdict === 'BUY')) errors.push('shadow_contains_buy_signal');
  if (scores.some((row) => String(row.asset_class || '').toUpperCase() === 'INDEX')) errors.push('index_in_shadow_scores');
  return {
    schema: 'rv.hist_probs_v2.validation.v1',
    generated_at: new Date().toISOString(),
    run_id: runId || null,
    target_market_date: manifestTarget,
    expected_target_market_date: expectedDate,
    expected_min_assets: minAssets,
    status: errors.length ? 'failed' : 'ok',
    errors,
    coverage,
    performance,
  };
}

export async function validateHistProbsV2Run(runId, options = {}) {
  const latest = await readJson(path.join(RUN_ROOT, 'latest.json'));
  const id = runId || latest?.run_id;
  const runDir = id ? path.join(RUN_ROOT, id) : null;
  const manifest = runDir ? await readJson(path.join(runDir, 'manifest.json')) : null;
  const coverage = runDir ? await readJson(path.join(runDir, 'coverage.json')) : null;
  const performance = runDir ? await readJson(path.join(runDir, 'performance.json')) : null;
  const scores = runDir ? await readNdjsonGz(path.join(runDir, 'scores.ndjson.gz')) : [];
  return validateHistProbsV2Artifacts({
    runId: id,
    manifest,
    coverage,
    performance,
    scores,
    targetDate: options.targetDate,
    expectedMinAssets: options.expectedMinAssets,
  });
}

async function main() {
  const out = argValue('--out', null);
  const runId = argValue('--run-id', null);
  const targetDate = argValue('--date', process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
  const expectedMinAssets = Number(argValue('--expected-min-assets', process.env.RV_HIST_PROBS_V2_MAX_ASSETS || '300'));
  const report = await validateHistProbsV2Run(runId, { targetDate, expectedMinAssets });
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
