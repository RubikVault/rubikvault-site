#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
export const HIST_STATUS_PATH = path.join(ROOT, 'public/data/hist-probs/status-summary.json');
export const HIST_RUN_SUMMARY_PATH = path.join(ROOT, 'public/data/hist-probs/run-summary.json');
const DATA_FRESHNESS_PATH = path.join(ROOT, 'public/data/reports/data-freshness-latest.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampRatio(value, fallback = 0) {
  const n = finiteNumber(value, fallback);
  return Math.max(0, Math.min(1, n));
}

function findHistFamily(dataFreshness) {
  if (dataFreshness?.families_by_id?.hist_probs) return dataFreshness.families_by_id.hist_probs;
  const families = Array.isArray(dataFreshness?.families)
    ? dataFreshness.families
    : Array.isArray(dataFreshness?.summary?.families)
      ? dataFreshness.summary.families
      : [];
  return families.find((item) => item?.family_id === 'hist_probs') || null;
}

function normalizeMode(runSummary) {
  if (!runSummary || typeof runSummary !== 'object') return 'missing';
  const sourceMode = String(runSummary.source_mode || '').toLowerCase();
  const tier = String(runSummary.hist_probs_tier || '').toLowerCase();
  const maxTickers = finiteNumber(runSummary.max_tickers, 0);
  if (runSummary.retry_mode === true || sourceMode === 'explicit_tickers') return 'retry';
  if (tier === 'all') return 'all';
  if (tier === 'a' || tier === 'tier_a') return 'tier_a';
  if (tier === 'b' || tier === 'tier_b') return 'tier_b';
  if (maxTickers > 0) return 'limited';
  return 'run_summary';
}

export function deriveHistProbsStatus({
  runSummary = null,
  dataFreshness = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const histFamily = findHistFamily(dataFreshness);
  if (!runSummary || typeof runSummary !== 'object') {
    return {
      schema: 'rv.hist_probs.status_summary.v1',
      generated_at: generatedAt,
      summary_present: false,
      target_market_date: dataFreshness?.target_market_date || dataFreshness?.summary?.target_market_date || null,
      hist_probs_mode: 'missing',
      catchup_status: 'failed',
      release_eligible: false,
      retry_remaining: null,
      tier_a_count: null,
      tier_b_pending: null,
      freshness_budget_days: null,
      coverage_ratio: 0,
      artifact_coverage_ratio: 0,
      run_coverage_ratio: 0,
      min_coverage_ratio: 0.95,
      tickers_total: 0,
      tickers_covered: 0,
      tickers_errors: 0,
      tickers_remaining: 0,
      worker_hard_failures: null,
      asset_classes: [],
      source: {
        run_summary_present: false,
        data_freshness_family_present: Boolean(histFamily),
      },
    };
  }

  const tickersTotal = Math.max(0, finiteNumber(runSummary.tickers_total, 0));
  const tickersCovered = Math.max(0, finiteNumber(runSummary.tickers_covered, 0));
  const tickersErrors = Math.max(0, finiteNumber(runSummary.tickers_errors, 0));
  const tickersRemainingRaw = Math.max(0, finiteNumber(runSummary.tickers_remaining, 0));
  const retryRemaining = Math.max(tickersRemainingRaw, tickersErrors);
  const minCoverageRatio = clampRatio(runSummary.min_coverage_ratio, 0.95);
  const derivedRunCoverageRatio = tickersTotal > 0 ? tickersCovered / tickersTotal : 0;
  const runCoverageRatio = clampRatio(histFamily?.run_coverage_ratio, derivedRunCoverageRatio);
  const artifactCoverageRatio = clampRatio(histFamily?.artifact_coverage_ratio, runCoverageRatio);
  const coverageRatio = runCoverageRatio;
  const workerHardFailures = Math.max(0, finiteNumber(runSummary.worker_hard_failures, 0));
  const mode = normalizeMode(runSummary);
  const tierBPending = mode === 'tier_a'
    ? Math.max(0, finiteNumber(runSummary.hist_probs_tier_b_count, 0))
    : Math.max(0, finiteNumber(runSummary.tier_b_pending, 0));
  const allScope = mode === 'all';
  let catchupStatus = 'degraded';
  if (workerHardFailures > 0) catchupStatus = 'failed';
  else if (allScope && retryRemaining === 0 && coverageRatio >= minCoverageRatio) catchupStatus = 'complete';
  else if (allScope && coverageRatio >= 0.90) catchupStatus = 'partial';
  else if (mode === 'retry') catchupStatus = retryRemaining === 0 ? 'partial' : 'degraded';
  else if (mode === 'tier_a' || mode === 'tier_b' || mode === 'limited') catchupStatus = 'degraded';

  return {
    schema: 'rv.hist_probs.status_summary.v1',
    generated_at: generatedAt,
    summary_present: true,
    target_market_date: runSummary.regime_date
      || dataFreshness?.target_market_date
      || dataFreshness?.summary?.target_market_date
      || null,
    source_run_summary_ran_at: runSummary.ran_at || null,
    hist_probs_mode: mode,
    catchup_status: catchupStatus,
    release_eligible: catchupStatus === 'complete' || catchupStatus === 'partial',
    retry_remaining: retryRemaining,
    tier_a_count: Math.max(0, finiteNumber(runSummary.hist_probs_tier_a_count, 0)),
    tier_b_pending: tierBPending,
    freshness_budget_days: Math.max(0, finiteNumber(runSummary.freshness_budget_trading_days, 0)),
    coverage_ratio: coverageRatio,
    artifact_coverage_ratio: artifactCoverageRatio,
    run_coverage_ratio: runCoverageRatio,
    min_coverage_ratio: minCoverageRatio,
    tickers_total: tickersTotal,
    tickers_input_total: Math.max(0, finiteNumber(runSummary.tickers_input_total, 0)),
    tickers_covered: tickersCovered,
    tickers_processed: Math.max(0, finiteNumber(runSummary.tickers_processed, 0)),
    tickers_skipped: Math.max(0, finiteNumber(runSummary.tickers_skipped, 0)),
    tickers_errors: tickersErrors,
    tickers_remaining: tickersRemainingRaw,
    worker_hard_failures: workerHardFailures,
    asset_classes: Array.isArray(runSummary.asset_classes) ? [...runSummary.asset_classes].sort() : [],
    workers_used: finiteNumber(runSummary.workers_used, null),
    hist_probs_write_mode: runSummary.hist_probs_write_mode || null,
    source: {
      run_summary_present: true,
      data_freshness_family_present: Boolean(histFamily),
      run_summary_ref: 'public/data/hist-probs/run-summary.json',
      data_freshness_ref: 'public/data/reports/data-freshness-latest.json',
    },
  };
}

export function readOrDeriveHistProbsStatus({ root = ROOT } = {}) {
  const statusPath = path.join(root, 'public/data/hist-probs/status-summary.json');
  const runSummaryPath = path.join(root, 'public/data/hist-probs/run-summary.json');
  const status = readJson(statusPath);
  const runSummary = readJson(runSummaryPath);
  if (status?.schema === 'rv.hist_probs.status_summary.v1') {
    const statusMs = Date.parse(status.generated_at || '');
    const summaryMs = Date.parse(runSummary?.ran_at || '');
    if (!Number.isFinite(summaryMs) || (Number.isFinite(statusMs) && statusMs >= summaryMs)) return status;
  }
  const dataFreshness = readJson(path.join(root, 'public/data/reports/data-freshness-latest.json'));
  return deriveHistProbsStatus({ runSummary, dataFreshness });
}

function main() {
  const runSummary = readJson(HIST_RUN_SUMMARY_PATH);
  const dataFreshness = readJson(DATA_FRESHNESS_PATH);
  const status = deriveHistProbsStatus({ runSummary, dataFreshness });
  writeJsonAtomic(HIST_STATUS_PATH, status);
  process.stdout.write(`${JSON.stringify({
    ok: status.release_eligible === true,
    hist_probs_mode: status.hist_probs_mode,
    catchup_status: status.catchup_status,
    coverage_ratio: status.coverage_ratio,
    retry_remaining: status.retry_remaining,
  })}\n`);
  if (status.summary_present && status.hist_probs_mode === 'unknown') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
