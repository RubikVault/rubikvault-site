#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_RUN_SUMMARY = path.join(ROOT, 'public/data/hist-probs/run-summary.json');
const DEFAULT_DATA_FRESHNESS = path.join(ROOT, 'public/data/reports/data-freshness-latest.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/runtime/hist-probs-status-summary.json');

function parseArgs(argv) {
  const options = {
    runSummaryPath: process.env.RV_HIST_PROBS_RUN_SUMMARY_PATH || DEFAULT_RUN_SUMMARY,
    dataFreshnessPath: process.env.RV_DATA_FRESHNESS_PATH || DEFAULT_DATA_FRESHNESS,
    outputPath: process.env.RV_HIST_PROBS_STATUS_OUTPUT || DEFAULT_OUTPUT,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--run-summary' && next) {
      options.runSummaryPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--run-summary=')) {
      options.runSummaryPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--data-freshness' && next) {
      options.dataFreshnessPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--data-freshness=')) {
      options.dataFreshnessPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--output' && next) {
      options.outputPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      options.outputPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    }
  }
  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value) {
  const number = numberOrNull(value);
  return number == null ? null : Math.max(0, number);
}

function ratio(numerator, denominator) {
  const top = numberOrNull(numerator);
  const bottom = numberOrNull(denominator);
  if (top == null || bottom == null || bottom <= 0) return null;
  return Math.max(0, Math.min(1, top / bottom));
}

function inferMode(summary) {
  const explicit = String(summary?.hist_probs_tier || summary?.tier || summary?.mode || '').trim().toLowerCase();
  if (['a', 'tier_a'].includes(explicit)) return 'tier_a';
  if (['b', 'tier_b'].includes(explicit)) return 'tier_b';
  if (explicit === 'all') return 'all';
  if (summary?.retry_mode === true || summary?.retry_tickers_file) return 'retry';
  const maxTickers = numberOrNull(summary?.max_tickers);
  if (maxTickers != null && maxTickers > 0) return 'canary';
  if (summary && Object.keys(summary).length > 0) return 'all';
  return 'unknown';
}

function collectReasonCounts(summary) {
  const counts = {};
  const add = (reason) => {
    const key = String(reason || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_') || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  };
  for (const sample of Array.isArray(summary?.error_samples) ? summary.error_samples : []) {
    add(sample?.reason || sample?.code || sample?.error || sample?.message);
  }
  for (const sample of Array.isArray(summary?.no_data_samples) ? summary.no_data_samples : []) {
    add(sample?.reason || sample?.code || 'provider_no_data');
  }
  for (const [reason, count] of Object.entries(summary?.reason_counts || {})) {
    const numeric = Number(count);
    counts[reason] = (counts[reason] || 0) + (Number.isFinite(numeric) ? numeric : 0);
  }
  return counts;
}

function findHistFreshness(dataFreshness) {
  const candidates = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const id = String(value.id || value.step_id || value.family || value.name || '').toLowerCase();
    if (id.includes('hist') && id.includes('prob')) candidates.push(value);
    for (const child of Object.values(value)) walk(child);
  };
  walk(dataFreshness);
  return candidates[0] || null;
}

function buildStatus({ runSummary, dataFreshness, runSummaryPath }) {
  const hasRunSummary = Boolean(runSummary && Object.keys(runSummary).length > 0);
  const tickersCovered = nonNegative(runSummary?.tickers_covered ?? runSummary?.covered_count ?? runSummary?.profiles_written);
  const tickersTotal = nonNegative(runSummary?.tickers_total ?? runSummary?.total_tickers ?? runSummary?.universe_total);
  const tickersInputTotal = nonNegative(runSummary?.tickers_input_total);
  const tickersRemaining = nonNegative(runSummary?.tickers_remaining ?? runSummary?.remaining_count);
  const tickersErrors = nonNegative(runSummary?.tickers_errors ?? runSummary?.error_count);
  const tierA = nonNegative(runSummary?.tier_a_count ?? runSummary?.tickers_tier_a);
  const tierBPending = nonNegative(runSummary?.tier_b_pending ?? runSummary?.tickers_tier_b_pending);
  const runCoverage = ratio(tickersCovered, tickersTotal);
  const artifactCoverage = ratio(
    runSummary?.artifact_covered ?? runSummary?.artifacts_ready ?? tickersCovered,
    runSummary?.artifact_total ?? tickersTotal,
  );
  const coverage = numberOrNull(runSummary?.coverage_ratio) ?? artifactCoverage ?? runCoverage ?? 0;
  const retryRemaining = nonNegative(runSummary?.retry_remaining ?? ((tickersRemaining || 0) + (tickersErrors || 0)));
  const minCoverage = numberOrNull(process.env.HIST_PROBS_MIN_COVERAGE_RATIO || runSummary?.min_coverage_ratio) ?? 0.90;
  const mode = hasRunSummary ? inferMode(runSummary) : 'unknown';
  const freshnessBudgetDays = nonNegative(
    process.env.HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS
    ?? runSummary?.freshness_budget_trading_days
    ?? runSummary?.freshness_budget_days
  );
  let catchupStatus = 'unknown';
  if (hasRunSummary) {
    if (coverage >= minCoverage && retryRemaining === 0) catchupStatus = 'complete';
    else if (coverage >= 0.90) catchupStatus = 'partial';
    else if (coverage > 0) catchupStatus = 'degraded';
    else catchupStatus = 'failed';
  }
  const freshness = findHistFreshness(dataFreshness);
  return {
    schema: 'rv.hist_probs.status_summary.v1',
    generated_at: new Date().toISOString(),
    source_run_summary_path: path.relative(ROOT, runSummaryPath),
    run_summary_exists: hasRunSummary,
    hist_probs_mode: mode,
    catchup_status: catchupStatus,
    retry_remaining: retryRemaining,
    tier_a_count: tierA,
    tier_b_pending: tierBPending ?? tickersRemaining,
    freshness_budget_days: freshnessBudgetDays,
    coverage_ratio: coverage,
    artifact_coverage_ratio: artifactCoverage,
    run_coverage_ratio: runCoverage,
    min_coverage_ratio: minCoverage,
    tickers_covered: tickersCovered,
    tickers_total: tickersTotal,
    tickers_input_total: tickersInputTotal,
    tickers_remaining: tickersRemaining,
    tickers_errors: tickersErrors,
    provider_data_reasons: collectReasonCounts(runSummary || {}),
    data_freshness: freshness ? {
      id: freshness.id || freshness.step_id || freshness.family || null,
      status: freshness.status || freshness.severity || null,
      latest_date: freshness.latest_date || freshness.max_date || freshness.as_of || null,
    } : null,
  };
}

function main() {
  const options = parseArgs(process.argv);
  const runSummary = readJson(options.runSummaryPath);
  const dataFreshness = readJson(options.dataFreshnessPath);
  const status = buildStatus({
    runSummary,
    dataFreshness,
    runSummaryPath: options.runSummaryPath,
  });
  writeJsonAtomic(options.outputPath, status);
  console.log(`[build-hist-probs-status-summary] wrote ${path.relative(ROOT, options.outputPath)}`);
  if (status.run_summary_exists && status.hist_probs_mode === 'unknown') {
    process.exitCode = 2;
  }
}

main();
