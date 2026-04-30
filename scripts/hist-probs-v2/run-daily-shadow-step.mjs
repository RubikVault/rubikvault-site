#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { REPO_ROOT } from '../lib/best-setups-local-loader.mjs';
import { runDailyShadow } from './run-daily-shadow.mjs';
import { validateHistProbsV2Run } from './validate-v2.mjs';

const execFileAsync = promisify(execFile);
const ROOT = process.env.RUBIKVAULT_ROOT || REPO_ROOT || process.cwd();
const PUBLIC_REPORT = path.join(ROOT, 'public/data/reports/hist-probs-v2-latest.json');
const VALIDATION_REPORT = path.join(ROOT, 'public/data/reports/hist-probs-v2-validation-latest.json');

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

function readJsonSync(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, doc) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function writeJsonAtomicSync(filePath, doc) {
  fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fsSync.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fsSync.renameSync(tmp, filePath);
}

function failureReport({ targetDate, maxAssets, errorAssetLimit, timeoutMs, status = 'failed', reason, phase = 'runner', signal = null }) {
  return {
    schema: 'rv.hist_probs_v2.public_latest.v1',
    generated_at: new Date().toISOString(),
    status,
    target_market_date: targetDate,
    source: 'shadow_only',
    hist_probs_source_default: 'v1_primary',
    non_blocking_shadow: true,
    error: reason,
    signal,
    phase,
    coverage: {
      schema: 'rv.hist_probs_v2.coverage.v1',
      target_market_date: targetDate,
      selected_assets: maxAssets + errorAssetLimit,
      processed_assets: 0,
      ready_assets: 0,
      current_assets: 0,
      stale_assets: 0,
      error_assets: 0,
      scores: 0,
      predictions: 0,
    },
    performance: {
      schema: 'rv.hist_probs_v2.performance.v1',
      elapsed_ms: 0,
      timeout_ms: timeoutMs,
      timed_out: signal === 'SIGTERM',
      rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      assets_per_second: 0,
    },
    sample_scores: [],
  };
}

async function patchPublicReport(patch) {
  const current = readJsonSync(PUBLIC_REPORT) || {};
  await writeJsonAtomic(PUBLIC_REPORT, {
    ...current,
    ...patch,
    generated_at: patch.generated_at || new Date().toISOString(),
  });
}

async function runComparisonNonBlocking(targetDate) {
  try {
    await execFileAsync(process.execPath, ['scripts/reports/compare-hist-probs-v1-vs-v2.mjs', `--date=${targetDate}`], {
      cwd: ROOT,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    console.warn(`[hist-probs-v2:step] comparison skipped: ${error?.message || error}`);
  }
}

async function main() {
  const targetDate = normalizeDate(argValue('--date', process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null))
    || normalizeDate(new Date().toISOString());
  const maxAssets = Math.max(1, Number(argValue('--max-assets', process.env.RV_HIST_PROBS_V2_MAX_ASSETS || '300')) || 300);
  const errorAssetLimit = Math.max(0, Number(argValue('--error-assets', process.env.RV_HIST_PROBS_V2_ERROR_ASSETS || '200')) || 0);
  const timeoutMs = Math.max(1000, Number(argValue('--timeout-ms', process.env.RV_HIST_PROBS_V2_TIMEOUT_MS || '600000')) || 600000);
  const minBars = Math.max(60, Number(argValue('--min-bars', '60')) || 60);
  const tickers = argValue('--tickers', null);

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      writeJsonAtomicSync(PUBLIC_REPORT, failureReport({
        targetDate,
        maxAssets,
        errorAssetLimit,
        timeoutMs,
        status: 'failed',
        reason: `terminated:${signal}`,
        phase: 'signal',
        signal,
      }));
      process.exit(0);
    });
  }

  try {
    const result = await runDailyShadow({
      date: targetDate,
      maxAssets,
      errorAssetLimit,
      timeoutMs,
      minBars,
      tickers,
    });
    const validation = await validateHistProbsV2Run(result.manifest.run_id, {
      targetDate,
      expectedMinAssets: maxAssets,
    });
    await writeJsonAtomic(VALIDATION_REPORT, validation);
    if (validation.status !== 'ok') {
      await patchPublicReport({
        status: 'warning',
        validation_status: validation.status,
        validation_errors: validation.errors,
      });
    } else {
      await patchPublicReport({
        validation_status: validation.status,
        validation_errors: [],
      });
    }
    await runComparisonNonBlocking(targetDate);
    console.log(`[hist-probs-v2:step] status=${validation.status === 'ok' ? result.manifest.status : 'warning'} run_id=${result.manifest.run_id}`);
  } catch (error) {
    await writeJsonAtomic(PUBLIC_REPORT, failureReport({
      targetDate,
      maxAssets,
      errorAssetLimit,
      timeoutMs,
      status: 'failed',
      reason: error?.message || String(error),
      phase: 'catch',
    }));
    await writeJsonAtomic(VALIDATION_REPORT, {
      schema: 'rv.hist_probs_v2.validation.v1',
      generated_at: new Date().toISOString(),
      run_id: null,
      target_market_date: targetDate,
      expected_target_market_date: targetDate,
      expected_min_assets: maxAssets,
      status: 'failed',
      errors: ['runner_failed'],
      error: error?.message || String(error),
    });
    console.error('[hist-probs-v2:step] failed', error);
  }
}

main();
