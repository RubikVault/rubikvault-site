#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  BEST_SETUP_LIMIT,
  buildForecastCandidatePools,
  buildQuantLabCandidates,
  buildVerifiedFrontpageRow,
  mergeDiscoveryPools,
} from '../functions/api/_shared/best-setups-v4.js';
import {
  REPO_ROOT,
  readJsonAbs,
  evaluateTickerViaSharedCore,
  resolveLocalAssetMeta,
  setLocalBarsRuntimeOverrides,
} from './lib/best-setups-local-loader.mjs';
import { histProbsReadCandidates } from './lib/hist-probs/path-resolver.mjs';
import { writeJsonDurableAtomicSync } from './lib/durable-atomic-write.mjs';
import { writeLeafSeal } from './lib/write-leaf-seal.mjs';
import { assertMayWriteProductionTruth } from './ops/prod-runtime-guard.mjs';

const QUANTLAB_PUBLISH_DIRS = Object.freeze({
  stock: 'public/data/quantlab/stock-insights/stocks',
  etf: 'public/data/quantlab/stock-insights/etfs',
});
const OUTPUT_PATH = 'public/data/snapshots/best-setups-v4.json';
const BUILD_REPORT_PATH = 'public/data/reports/best-setups-build-latest.json';
const FORECAST_PATH = 'public/data/forecast/latest.json';
const HIST_PROBS_CHECKPOINTS_PATH = 'public/data/hist-probs/checkpoints.json';
const HIST_PROBS_NO_DATA_PATH = 'public/data/hist-probs/no-data-tickers.json';
const HIST_PROBS_RUN_SUMMARY_PATH = 'public/data/hist-probs/run-summary.json';
const DECISION_BUNDLE_LATEST_PATH = 'public/data/decisions/latest.json';
const MAX_HIST_STALE_LOGS = Math.max(0, Number(process.env.BEST_SETUPS_MAX_HIST_STALE_LOGS || process.env.BEST_SETUPS_MAX_REJECTION_LOGS || 25));

function nowIso() {
  return new Date().toISOString();
}

function normalizeDateId(value) {
  const normalized = String(value || '').slice(0, 10).trim();
  return normalized || null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scaleTo100(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function createLimitedLogger(limit, overflowMessage) {
  let emitted = 0;
  let overflowNoted = false;
  return (message) => {
    if (limit <= 0) return;
    if (emitted < limit) {
      console.log(message);
      emitted += 1;
      return;
    }
    if (!overflowNoted) {
      console.log(overflowMessage(limit));
      overflowNoted = true;
    }
  };
}

function resolvedSnapshotDataAsOf(snapshotDoc, buildReport) {
  return normalizeDateId(
    snapshotDoc?.meta?.data_asof
    || buildReport?.data_asof
    || null,
  );
}

function canReusePublishedSnapshot(snapshotDoc, buildReport, targetMarketDate) {
  if (!snapshotDoc || snapshotDoc.ok !== true) return false;
  if (!buildReport || typeof buildReport !== 'object') return false;
  if (!snapshotDoc?.meta || !snapshotDoc?.data) return false;
  const dataAsOf = resolvedSnapshotDataAsOf(snapshotDoc, buildReport);
  if (targetMarketDate && (!dataAsOf || dataAsOf < targetMarketDate)) return false;
  const rowsEmittedTotal = Number(buildReport?.rows_emitted_total ?? snapshotDoc?.meta?.rows_emitted?.total);
  return Number.isFinite(rowsEmittedTotal);
}

async function writeJson(relPath, payload) {
  const absPath = path.join(REPO_ROOT, relPath);
  writeJsonDurableAtomicSync(absPath, payload);
}

async function readDecisionBundleBuyRows() {
  const latest = await readJsonAbs(path.join(REPO_ROOT, DECISION_BUNDLE_LATEST_PATH));
  if (!latest || latest.schema !== 'rv.decision_bundle_latest.v1') return null;
  const snapshotPath = String(latest.snapshot_path || '').replace(/^\/+/, 'public/').replace(/\/+$/, '');
  const manifest = await readJsonAbs(path.join(REPO_ROOT, snapshotPath, 'manifest.json'));
  if (!manifest || manifest.status === 'FAILED') return { latest, rows: [], manifest };
  const partNames = Array.from({ length: 64 }, (_, idx) => `part-${String(idx).padStart(3, '0')}.ndjson.gz`);
  const rows = [];
  for (const part of partNames) {
    const partPath = path.join(REPO_ROOT, snapshotPath, part);
    let buffer;
    try {
      buffer = await fs.readFile(partPath);
    } catch {
      return { latest, rows: [], manifest, error: `missing_part:${part}` };
    }
    const text = zlib.gunzipSync(buffer).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const decision = JSON.parse(line);
      if (
        decision?.verdict !== 'BUY'
        || decision?.pipeline_status !== 'OK'
        || decision?.coverage_class !== 'eligible'
        || decision?.tradability !== true
        || decision?.target_market_date !== latest.target_market_date
      ) {
        continue;
      }
      const scores = decision.scores || {};
      rows.push({
        ticker: decision.symbol,
        canonical_id: decision.canonical_id,
        asset_class: String(decision.asset_class || '').toUpperCase() === 'ETF' ? 'etf' : 'stock',
        verdict: 'BUY',
        confidence: 'HIGH',
        buy_eligible: true,
        trigger_fulfilled: true,
        analyzer_composite: num(scores.composite) ?? 0,
        analyzer_trend_score: num(scores.trend) ?? num(scores.composite) ?? 0,
        analyzer_entry_score: num(scores.entry) ?? num(scores.composite) ?? 0,
        analyzer_risk_score: num(scores.risk) ?? num(scores.composite) ?? 0,
        analyzer_context_score: num(scores.context) ?? num(scores.composite) ?? 0,
        decision_snapshot_id: latest.snapshot_id,
        decision_reason_codes: decision.reason_codes || [],
      });
    }
  }
  return { latest, rows, manifest };
}

async function mapWithConcurrency(items, limit, mapper) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return out;
}

async function readQuantLabRowsForClass(assetClass) {
  const dirPrimary = path.join(REPO_ROOT, QUANTLAB_PUBLISH_DIRS[assetClass]);
  const dirFallback = path.join(REPO_ROOT, `public/data/quantlab/reports/shards/assets`);
  
  let dir = dirPrimary;
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    files = [];
  }

  // Fallback: If primary is empty, try the shards/assets directory
  if (files.length === 0) {
    dir = dirFallback;
    try {
      files = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
      console.log(`[best-setups-v4] Primary directory empty for ${assetClass}, using fallback: ${dir} (${files.length} files found)`);
    } catch {
      return { rows: [], shardCount: 0, generatedAt: null, asOfDate: null };
    }
  }

  let generatedAt = null;
  let asOfDate = null;

  const parsedChunks = await mapWithConcurrency(files, 8, async (file) => {
    try {
      const payload = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
      if (!generatedAt && typeof payload?.generatedAt === 'string') generatedAt = payload.generatedAt;
      if (!asOfDate && typeof payload?.asOfDate === 'string') asOfDate = payload.asOfDate;
      
      const chunkRows = [];
      const byTicker = payload?.byTicker && typeof payload.byTicker === 'object' ? payload.byTicker : null;
      
      if (byTicker) {
        // Multi-asset shard format
        for (const [tickerKey, row] of Object.entries(byTicker)) {
          chunkRows.push({ ticker: row?.ticker || tickerKey, assetClass, ...row });
        }
      } else if (payload?.ticker || payload?.canonicalId) {
        // Single-asset format (often found in fallback directories)
        chunkRows.push({ ticker: payload.ticker || payload.canonicalId.split(':').pop(), assetClass, ...payload });
      }
      
      return chunkRows;
    } catch {
      return [];
    }
  });

  return { rows: parsedChunks.flat(), shardCount: files.length, generatedAt, asOfDate };
}

async function readQuantLabRows() {
  const [stockResult, etfResult] = await Promise.all([
    readQuantLabRowsForClass('stock'),
    readQuantLabRowsForClass('etf'),
  ]);
  return {
    rows: [...stockResult.rows, ...etfResult.rows],
    shardCount: {
      stocks: stockResult.shardCount,
      etfs: etfResult.shardCount,
    },
    generatedAt: stockResult.generatedAt || etfResult.generatedAt,
    generatedAtByClass: {
      stocks: stockResult.generatedAt,
      etfs: etfResult.generatedAt,
    },
    asOfDate: stockResult.asOfDate || etfResult.asOfDate,
    asOfDateByClass: {
      stocks: stockResult.asOfDate,
      etfs: etfResult.asOfDate,
    },
  };
}

function horizonScore(row, horizon) {
  const quant = clamp(num(row?.ranking_score) ?? 0, 0, 100);
  const composite = clamp(num(row?.analyzer_composite) ?? 0, 0, 100);
  const trend = clamp(num(row?.analyzer_trend_score) ?? 0, 0, 100);
  const entry = clamp(num(row?.analyzer_entry_score) ?? 0, 0, 100);
  const risk = clamp(num(row?.analyzer_risk_score) ?? 0, 0, 100);
  const context = clamp(num(row?.analyzer_context_score) ?? 0, 0, 100);
  const ret5 = scaleTo100(num(row?.analyzer_ret_5d_pct), -0.1, 0.15);
  const ret20 = scaleTo100(num(row?.analyzer_ret_20d_pct), -0.15, 0.35);
  const macd = scaleTo100(num(row?.analyzer_macd_hist), -0.8, 0.8);
  const trendDuration = scaleTo100(num(row?.analyzer_trend_duration_days), 0, 60);
  const liquidity = clamp(num(row?.analyzer_liquidity_score) ?? 0, 0, 100);
  const volatilityPenalty = clamp(num(row?.analyzer_volatility_percentile) ?? 0, 0, 100);
  const strongExperts = scaleTo100(num(row?.strong_experts), 0, 16);
  const buyLead = scaleTo100((num(row?.buy_experts) ?? 0) - (num(row?.avoid_experts) ?? 0), -8, 8);
  const quantTrend = scaleTo100(num(row?.quantlab_trend_gate), 0, 1);

  let baseScore = 0;

  if (horizon === 'short') {
    baseScore = 
      quant * 0.26 +
        composite * 0.24 +
        entry * 0.20 +
        trend * 0.10 +
        macd * 0.08 +
        ret5 * 0.06 +
        quantTrend * 0.04 +
        risk * 0.02;
  } else if (horizon === 'medium') {
    baseScore = 
      quant * 0.28 +
        composite * 0.22 +
        trend * 0.14 +
        context * 0.10 +
        ret20 * 0.08 +
        trendDuration * 0.06 +
        buyLead * 0.06 +
        quantTrend * 0.04 +
        risk * 0.02;
  } else {
    baseScore = 
      quant * 0.28 +
        composite * 0.18 +
        trend * 0.16 +
        context * 0.12 +
        trendDuration * 0.10 +
        liquidity * 0.07 +
        strongExperts * 0.05 +
        ret20 * 0.04 +
        risk * 0.02 -
        volatilityPenalty * 0.02;
  }

  // V6 Relaxation Penalties: Replace hard gates with score reduction
  if (String(row?.verdict || '').toUpperCase() !== 'BUY') baseScore -= 30;
  if (String(row?.confidence || '').toUpperCase() !== 'HIGH') baseScore -= 15;
  if (row?.trigger_fulfilled === false) baseScore -= 20;
  if (row?.buy_eligible === false) baseScore -= 10; // Safety mode penalty

  return clamp(baseScore, 0, 100);
}

function decorateForHorizon(row, horizon) {
  const score = horizonScore(row, horizon);
  return {
    ...row,
    horizon,
    score,
    rank_score: score,
    metric_value: score,
    metric_label: 'RANK',
    probability: row?.calibrated_probability ?? row?.probability ?? null,
    expected_return:
      horizon === 'short'
        ? (num(row?.analyzer_ret_5d_pct) != null ? Number((num(row.analyzer_ret_5d_pct) * 100).toFixed(1)) : null)
        : (num(row?.analyzer_ret_20d_pct) != null ? Number((num(row.analyzer_ret_20d_pct) * 100).toFixed(1)) : null),
  };
}

function buildHorizonRows(rows, horizon) {
  return rows
    .filter((row) => String(row?.verdict || '').toUpperCase() === 'BUY')
    .map((row) => decorateForHorizon(row, horizon))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.analyzer_composite ?? -Infinity) !== (a.analyzer_composite ?? -Infinity)) {
        return (b.analyzer_composite ?? -Infinity) - (a.analyzer_composite ?? -Infinity);
      }
      if ((b.avg_top_percentile ?? -Infinity) !== (a.avg_top_percentile ?? -Infinity)) {
        return (b.avg_top_percentile ?? -Infinity) - (a.avg_top_percentile ?? -Infinity);
      }
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, BEST_SETUP_LIMIT);
}

function emptyRejectionBucket() {
  return {
    rejected_non_buy_total: 0,
    rejected_non_high_total: 0,
    rejected_gated_total: 0,
    rejected_non_uptrend_total: 0,
    missing_doc_total: 0,
  };
}

function summarizeRejections(evalByTicker, candidatePools) {
  const summary = {};
  for (const horizon of ['short', 'medium', 'long']) {
    const horizonSummary = emptyRejectionBucket();
    horizonSummary.by_asset_class = {
      stock: emptyRejectionBucket(),
      etf: emptyRejectionBucket(),
    };
    for (const candidate of candidatePools[horizon] || []) {
      const assetClass = String(candidate?.asset_class || 'stock').toLowerCase() === 'etf' ? 'etf' : 'stock';
      const assetSummary = horizonSummary.by_asset_class[assetClass];
      const doc = evalByTicker.get(candidate.ticker);
      if (!doc) {
        horizonSummary.missing_doc_total += 1;
        assetSummary.missing_doc_total += 1;
        continue;
      }
      const slice = doc?.decision?.horizons?.[horizon] || doc?.decision || {};
      const gates = Array.isArray(slice?.trigger_gates) ? slice.trigger_gates : [];
      const trend = String(doc?.states?.trend || '').toUpperCase();
      if (String(slice?.verdict || '').toUpperCase() !== 'BUY') {
        horizonSummary.rejected_non_buy_total += 1;
        assetSummary.rejected_non_buy_total += 1;
        continue;
      }
      if (String(slice?.confidence_bucket || '').toUpperCase() !== 'HIGH') {
        horizonSummary.rejected_non_high_total += 1;
        assetSummary.rejected_non_high_total += 1;
        continue;
      }
      if (gates.length > 0) {
        horizonSummary.rejected_gated_total += 1;
        assetSummary.rejected_gated_total += 1;
        continue;
      }
      if (!['UP', 'STRONG_UP'].includes(trend)) {
        horizonSummary.rejected_non_uptrend_total += 1;
        assetSummary.rejected_non_uptrend_total += 1;
      }
    }
    summary[horizon] = horizonSummary;
  }
  return summary;
}

async function inspectHistProbsLatestDate(ticker) {
  for (const candidate of histProbsReadCandidates(path.join(REPO_ROOT, 'public/data/hist-probs'), ticker)) {
    try {
      const doc = JSON.parse(await fs.readFile(candidate, 'utf8'));
      const latestDate = String(doc?.latest_date || '').slice(0, 10) || null;
      if (latestDate) return latestDate;
    } catch {}
  }
  return null;
}

async function buildHistProbsStaleSet(targetDate, tickers = []) {
  const stale = new Set();
  if (!targetDate) return stale;

  const checkpointsDoc = await readJsonAbs(path.join(REPO_ROOT, HIST_PROBS_CHECKPOINTS_PATH));
  const checkpoints = checkpointsDoc?.tickers && typeof checkpointsDoc.tickers === 'object'
    ? checkpointsDoc.tickers
    : {};

  for (const ticker of tickers) {
    const norm = String(ticker || '').trim().toUpperCase();
    if (!norm) continue;
    const fileLatestDate = await inspectHistProbsLatestDate(norm);
    if (fileLatestDate) {
      if (fileLatestDate < targetDate) stale.add(norm);
      continue;
    }
    const latestDate = String(checkpoints[norm]?.latest_date || '').slice(0, 10) || null;
    if (!latestDate || latestDate < targetDate) stale.add(norm);
  }

  return stale;
}

async function estimateCheckpointStaleCount(targetDate) {
  if (!targetDate) return 0;
  const checkpointsDoc = await readJsonAbs(path.join(REPO_ROOT, HIST_PROBS_CHECKPOINTS_PATH));
  const noDataDoc = await readJsonAbs(path.join(REPO_ROOT, HIST_PROBS_NO_DATA_PATH));
  const checkpoints = checkpointsDoc?.tickers && typeof checkpointsDoc.tickers === 'object'
    ? checkpointsDoc.tickers
    : {};
  const neutral = new Set();
  for (const row of noDataDoc?.tickers || []) {
    if (row?.symbol) neutral.add(String(row.symbol).trim().toUpperCase());
  }
  let staleCount = 0;
  for (const [ticker, checkpoint] of Object.entries(checkpoints)) {
    const norm = String(ticker || '').trim().toUpperCase();
    if (!norm || neutral.has(norm)) continue;
    const status = String(checkpoint?.status || '').trim().toLowerCase();
    if (['no_data', 'insufficient_history', 'inactive'].includes(status)) continue;
    const latestDate = String(checkpoint?.latest_date || '').slice(0, 10) || null;
    if (!latestDate || latestDate < targetDate) staleCount += 1;
  }
  return staleCount;
}

async function main() {
  const guard = assertMayWriteProductionTruth({ job: 'build-best-setups-v4', exitOnFailure: true });
  if (!guard.ok) throw new Error(`PROD_RUNTIME_BLOCKED:${guard.failures.join(',')}`);
  const publishMode = process.argv.includes('--publish');
  if (publishMode) {
    setLocalBarsRuntimeOverrides({
      allowRemoteBarFetch: false,
    });
  }
  const requestedTargetDate = normalizeDateId(
    process.env.TARGET_MARKET_DATE
    || process.env.RV_TARGET_MARKET_DATE
    || null,
  );
  if (publishMode) {
    const [existingSnapshot, existingBuildReport] = await Promise.all([
      readJsonAbs(path.join(REPO_ROOT, OUTPUT_PATH)),
      readJsonAbs(path.join(REPO_ROOT, BUILD_REPORT_PATH)),
    ]);
    if (canReusePublishedSnapshot(existingSnapshot, existingBuildReport, requestedTargetDate)) {
      console.log(
        `[best-setups-v4] Reusing existing published snapshot `
        + `(data_asof=${resolvedSnapshotDataAsOf(existingSnapshot, existingBuildReport) || 'unknown'}, `
        + `target=${requestedTargetDate || 'none'})`,
      );
      return;
    }
  }

  const startedAt = Date.now();
  const decisionBundleMode = process.env.BEST_SETUPS_USE_DECISION_BUNDLE !== '0'
    ? await readDecisionBundleBuyRows()
    : null;
  if (decisionBundleMode) {
    const buyRows = decisionBundleMode.rows || [];
    const horizonsByClass = { stocks: {}, etfs: {} };
    for (const horizon of ['short', 'medium', 'long']) {
      horizonsByClass.stocks[horizon] = buildHorizonRows(buyRows.filter((row) => row?.asset_class !== 'etf'), horizon);
      horizonsByClass.etfs[horizon] = buildHorizonRows(buyRows.filter((row) => row?.asset_class === 'etf'), horizon);
    }
    const emittedCounts = {
      stocks: {
        short: horizonsByClass.stocks.short.length,
        medium: horizonsByClass.stocks.medium.length,
        long: horizonsByClass.stocks.long.length,
      },
      etfs: {
        short: horizonsByClass.etfs.short.length,
        medium: horizonsByClass.etfs.medium.length,
        long: horizonsByClass.etfs.long.length,
      },
    };
    const totalRowsEmitted = Object.values(emittedCounts.stocks).reduce((sum, value) => sum + value, 0)
      + Object.values(emittedCounts.etfs).reduce((sum, value) => sum + value, 0);
    const payload = {
      ok: true,
      schema_version: 'rv.best-setups.shared-core.snapshot.v3',
      generated_at: nowIso(),
      meta: {
        generated_at: nowIso(),
        source: 'decision_bundle_consumer',
        decision_path: 'public/data/decisions/latest.json',
        data_asof: decisionBundleMode.latest?.target_market_date || null,
        decision_bundle: {
          status: decisionBundleMode.latest?.status || null,
          snapshot_id: decisionBundleMode.latest?.snapshot_id || null,
          target_market_date: decisionBundleMode.latest?.target_market_date || null,
        },
        candidate_counts: {
          decision_bundle_buy_rows: buyRows.length,
          unique_tickers: new Set(buyRows.map((row) => row.ticker)).size,
        },
        verified_counts: emittedCounts,
        rows_emitted: {
          ...emittedCounts,
          total: totalRowsEmitted,
        },
        reason_summary: {
          snapshot_empty: totalRowsEmitted === 0,
          source: decisionBundleMode.error || null,
        },
        duration_ms: Date.now() - startedAt,
      },
      data: {
        stocks: horizonsByClass.stocks,
        etfs: horizonsByClass.etfs,
      },
    };
    await writeJson(OUTPUT_PATH, payload);
    await writeJson(BUILD_REPORT_PATH, {
      schema: 'rv.best-setups.build.v1',
      ok: totalRowsEmitted > 0,
      generated_at: nowIso(),
      snapshot_path: OUTPUT_PATH,
      snapshot_generated_at: payload.generated_at,
      data_asof: payload.meta?.data_asof || null,
      rows_emitted_total: totalRowsEmitted,
      rows_emitted: emittedCounts,
      candidate_counts: payload.meta?.candidate_counts || null,
      source_dependencies: {
        decision_bundle_latest_path: DECISION_BUNDLE_LATEST_PATH,
      },
      duration_ms: Date.now() - startedAt,
      warnings: totalRowsEmitted === 0 ? ['NO_BUY_ROWS_IN_DECISION_BUNDLE'] : [],
    });
    console.log(`[best-setups-v4] decision-bundle consumer mode snapshot=${decisionBundleMode.latest?.snapshot_id || 'unknown'} buys=${buyRows.length}`);
    return;
  }

  const [quantlabResult, forecastDoc] = await Promise.all([
    readQuantLabRows(),
    readJsonAbs(path.join(REPO_ROOT, FORECAST_PATH)),
  ]);

  const rawQuantlabCandidates = buildQuantLabCandidates(quantlabResult.rows, {
    candidateLimit: Number(process.env.BEST_SETUP_QUANTLAB_LIMIT) || undefined,
    assetClasses: ['stock', 'etf'],
    exchangeAllowlist: [],
    minStockPercentile: Number(process.env.BEST_SETUP_QUANTLAB_STOCK_MIN_PERCENTILE) || 75,
    minEtfPercentile: Number(process.env.BEST_SETUP_QUANTLAB_ETF_MIN_PERCENTILE) || 50,
    minStockStrongExperts: Number(process.env.BEST_SETUP_QUANTLAB_STOCK_MIN_STRONG) || 4,
    minEtfStrongExperts: Number(process.env.BEST_SETUP_QUANTLAB_ETF_MIN_STRONG) || 6,
  });
  const forecastPools = buildForecastCandidatePools(forecastDoc, {
    candidateLimit: Number(process.env.BEST_SETUP_FORECAST_LIMIT) || undefined,
  });
  const seedTickers = Array.from(new Set([
    ...rawQuantlabCandidates.map((row) => row.ticker),
    ...Object.values(forecastPools).flat().map((row) => row.ticker),
  ]));
  const metaRows = await mapWithConcurrency(seedTickers, Math.max(1, Number(process.env.BEST_SETUPS_META_CONCURRENCY) || 12), async (ticker) => ({
    ticker,
    meta: await resolveLocalAssetMeta(ticker),
  }));
  const metaByTicker = new Map(metaRows.map((row) => [row.ticker, row.meta]).filter(([, meta]) => meta));
  const isAnalyzable = (ticker) => Number(metaByTicker.get(ticker)?.bars_count || 0) >= 200;

  const quantlabCandidates = rawQuantlabCandidates
    .filter((row) => isAnalyzable(row.ticker))
    .map((row) => ({
      ...row,
      asset_class: String(metaByTicker.get(row.ticker)?.type_norm || '').toUpperCase() === 'ETF' ? 'etf' : row.asset_class,
    }));

  const filteredForecastPools = Object.fromEntries(
    Object.entries(forecastPools).map(([horizon, rows]) => [horizon, (rows || [])
      .filter((row) => isAnalyzable(row.ticker))
      .map((row) => ({
        ...row,
        asset_class: String(metaByTicker.get(row.ticker)?.type_norm || '').toUpperCase() === 'ETF' ? 'etf' : 'stock',
      }))]),
  );

  const candidatePools = mergeDiscoveryPools({ forecastPools: filteredForecastPools, quantlabCandidates });
  const uniqueTickers = Array.from(new Set(Object.values(candidatePools).flat().map((row) => row.ticker)));

  const concurrency = Math.max(1, Number(process.env.BEST_SETUPS_CONCURRENCY) || 6);
  const evalRows = await mapWithConcurrency(uniqueTickers, concurrency, async (ticker) => ({
    ticker,
    doc: await evaluateTickerViaSharedCore(ticker),
  }));
  const evalByTicker = new Map(evalRows.map((row) => [row.ticker, row.doc]));
  const targetDate = String(forecastDoc?.data?.asof || '').slice(0, 10) || null;
  const histProbsStaleSet = await buildHistProbsStaleSet(targetDate, uniqueTickers);
  console.log(`[best-setups-v4] hist-probs stale gate: ${histProbsStaleSet.size} tickers excluded (target: ${targetDate || 'unknown'})`);

  if (targetDate) {
    const runSummary = await readJsonAbs(path.join(REPO_ROOT, HIST_PROBS_RUN_SUMMARY_PATH));
    const tickersTotal = Number(runSummary?.tickers_total || 0);
    const checkpointStaleCount = await estimateCheckpointStaleCount(targetDate);
    const ratio = tickersTotal > 0 ? checkpointStaleCount / tickersTotal : 0;
    if (ratio > 0.15) {
      console.warn(`[best-setups-v4] WARNING: ${(ratio * 100).toFixed(1)}% universe has stale hist-probs. BUY list will be smaller than usual.`);
    }
  }

  const logHistProbsStaleRejection = createLimitedLogger(
    MAX_HIST_STALE_LOGS,
    (limit) => `[best-setups-v4] Additional hist-probs stale rejection logs suppressed after ${limit} entries.`,
  );
  const notHistProbsStale = (row) => {
    if (!row) return false;
    const ticker = String(row.ticker || '').trim().toUpperCase();
    if (histProbsStaleSet.has(ticker)) {
      logHistProbsStaleRejection(`[best-setups-v4] Rejected ${ticker} from BUY list — hist-probs stale`);
      return false;
    }
    return true;
  };

  const acceptedByHorizon = {
    short: (candidatePools.short || []).map((candidate) => buildVerifiedFrontpageRow(evalByTicker.get(candidate.ticker), candidate)).filter(Boolean).filter(notHistProbsStale),
    medium: (candidatePools.medium || []).map((candidate) => buildVerifiedFrontpageRow(evalByTicker.get(candidate.ticker), candidate)).filter(Boolean).filter(notHistProbsStale),
    long: (candidatePools.long || []).map((candidate) => buildVerifiedFrontpageRow(evalByTicker.get(candidate.ticker), candidate)).filter(Boolean).filter(notHistProbsStale),
  };

  const horizonsByClass = { stocks: {}, etfs: {} };
  for (const horizon of ['short', 'medium', 'long']) {
    const acceptedRows = acceptedByHorizon[horizon] || [];
    horizonsByClass.stocks[horizon] = buildHorizonRows(acceptedRows.filter((row) => row?.asset_class !== 'etf'), horizon);
    horizonsByClass.etfs[horizon] = buildHorizonRows(acceptedRows.filter((row) => row?.asset_class === 'etf'), horizon);
  }

  const rejectionCounts = summarizeRejections(evalByTicker, candidatePools);
  const emittedCounts = {
    stocks: {
      short: horizonsByClass.stocks.short.length,
      medium: horizonsByClass.stocks.medium.length,
      long: horizonsByClass.stocks.long.length,
    },
    etfs: {
      short: horizonsByClass.etfs.short.length,
      medium: horizonsByClass.etfs.medium.length,
      long: horizonsByClass.etfs.long.length,
    },
  };
  const totalRowsEmitted = Object.values(emittedCounts.stocks).reduce((sum, value) => sum + value, 0)
    + Object.values(emittedCounts.etfs).reduce((sum, value) => sum + value, 0);

  const payload = {
    ok: true,
    schema_version: 'rv.best-setups.shared-core.snapshot.v3',
    generated_at: nowIso(),
    meta: {
      generated_at: nowIso(),
      source: 'shared_decision_core_quantlab_forecast_snapshot',
      decision_path: 'assembleDecisionInputs + buildStockInsightsV4Evaluation',
      quantlab_generated_at: quantlabResult.generatedAt,
      quantlab_generated_at_by_class: quantlabResult.generatedAtByClass,
      quantlab_asof: quantlabResult.asOfDate,
      quantlab_asof_by_class: quantlabResult.asOfDateByClass,
      forecast_asof: forecastDoc?.data?.asof || forecastDoc?.freshness || null,
      data_asof: forecastDoc?.data?.asof || forecastDoc?.freshness || quantlabResult.asOfDate || null,
      source_dependencies: {
        quantlab_publish_dirs: QUANTLAB_PUBLISH_DIRS,
        forecast_path: FORECAST_PATH,
      },
      candidate_counts: {
        quantlab_rows_total: quantlabResult.rows.length,
        quantlab_rows_stocks: quantlabResult.rows.filter((row) => row?.assetClass === 'stock').length,
        quantlab_rows_etfs: quantlabResult.rows.filter((row) => row?.assetClass === 'etf').length,
        analyzable_tickers: metaRows.filter((row) => Number(row?.meta?.bars_count || 0) >= 200).length,
        quantlab_ranked: quantlabCandidates.length,
        quantlab_ranked_stocks: quantlabCandidates.filter((row) => row?.asset_class === 'stock').length,
        quantlab_ranked_etfs: quantlabCandidates.filter((row) => row?.asset_class === 'etf').length,
        forecast_short: (filteredForecastPools.short || []).length,
        forecast_medium: (filteredForecastPools.medium || []).length,
        forecast_long: (filteredForecastPools.long || []).length,
        unique_tickers: uniqueTickers.length,
        shard_count: quantlabResult.shardCount,
      },
      verified_counts: emittedCounts,
      setup_phase_counts: {
        early: (acceptedByHorizon.medium || []).filter(r => r.setup_phase === 'EARLY').length,
        mid: (acceptedByHorizon.medium || []).filter(r => r.setup_phase === 'MID').length,
        late: (acceptedByHorizon.medium || []).filter(r => r.setup_phase === 'LATE').length,
      },
      rejection_counts: rejectionCounts,
      rows_emitted: {
        ...emittedCounts,
        total: totalRowsEmitted,
      },
      rows_rejected: rejectionCounts,
      reason_summary: {
        snapshot_empty: totalRowsEmitted === 0,
        dominant_rejection: Object.entries(rejectionCounts).map(([horizon, counts]) => ({
          horizon,
          rejected_non_buy_total: counts.rejected_non_buy_total,
          rejected_non_high_total: counts.rejected_non_high_total,
          rejected_gated_total: counts.rejected_gated_total,
          rejected_non_uptrend_total: counts.rejected_non_uptrend_total,
        })),
      },
      duration_ms: Date.now() - startedAt,
    },
    data: {
      stocks: horizonsByClass.stocks,
      etfs: horizonsByClass.etfs,
    },
  };

  await writeJson(OUTPUT_PATH, payload);

  const buildReport = {
    schema: 'rv.best-setups.build.v1',
    ok: totalRowsEmitted > 0,
    generated_at: nowIso(),
    snapshot_path: OUTPUT_PATH,
    snapshot_generated_at: payload.generated_at,
    data_asof: payload.meta?.data_asof || null,
    rows_emitted_total: totalRowsEmitted,
    rows_emitted: emittedCounts,
    candidate_counts: payload.meta?.candidate_counts || null,
    rejection_counts: rejectionCounts,
    source_dependencies: payload.meta?.source_dependencies || null,
    quantlab_generated_at_by_class: quantlabResult.generatedAtByClass,
    quantlab_asof_by_class: quantlabResult.asOfDateByClass,
    duration_ms: Date.now() - startedAt,
    fallback_used_by_class: {
      stocks: quantlabResult.shardCount?.stocks > 0 && !quantlabResult.generatedAtByClass?.stocks,
      etfs: quantlabResult.shardCount?.etfs > 0 && !quantlabResult.generatedAtByClass?.etfs,
    },
    warnings: totalRowsEmitted < 20 ? ['LOW_ROW_EMISSION'] : [],
  };
  await writeJson(BUILD_REPORT_PATH, buildReport);

  const finalTickers = new Set([
    ...horizonsByClass.stocks.short, ...horizonsByClass.stocks.medium, ...horizonsByClass.stocks.long,
    ...horizonsByClass.etfs.short, ...horizonsByClass.etfs.medium, ...horizonsByClass.etfs.long,
  ].map((row) => row.ticker).filter(Boolean));

  let backfills = 0;
  for (const ticker of finalTickers) {
    const doc = evalByTicker.get(ticker);
    const bars = doc?.data?.bars || [];
    if (bars.length >= 200) {
      const outPath = path.join(REPO_ROOT, `public/data/v3/series/adjusted/US__${ticker}.ndjson.gz`);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      const ndjson = bars.map((b) => JSON.stringify(b)).join('\n') + '\n';
      const compressed = zlib.gzipSync(Buffer.from(ndjson, 'utf-8'));
      await fs.writeFile(outPath, compressed);
      backfills++;
    }
  }

  const targetDateForSeal = payload.meta?.data_asof || requestedTargetDate || null;
  try {
    writeLeafSeal('snapshot', totalRowsEmitted > 0 ? 'OK' : 'DEGRADED', {
      targetMarketDate: targetDateForSeal,
      outputsVerified: [OUTPUT_PATH],
      warnings: totalRowsEmitted < 20 ? ['LOW_ROW_EMISSION'] : [],
    });
  } catch {
    // leaf seal write must not block the build
  }
  console.log(`[best-setups-v4] wrote ${OUTPUT_PATH}`);
  console.log(`[best-setups-v4] backfilled ${backfills} candidate histories for live compatibility.`);
  console.log(
    `[best-setups-v4] candidates=${uniqueTickers.length} stocks=${horizonsByClass.stocks.short.length}/${horizonsByClass.stocks.medium.length}/${horizonsByClass.stocks.long.length} etfs=${horizonsByClass.etfs.short.length}/${horizonsByClass.etfs.medium.length}/${horizonsByClass.etfs.long.length}`,
  );
}

main().catch((error) => {
  writeJson(BUILD_REPORT_PATH, {
    schema: 'rv.best-setups.build.v1',
    ok: false,
    generated_at: nowIso(),
    error: String(error?.stack || error?.message || error),
  }).catch(() => {});
  console.error(`[best-setups-v4] build failed: ${error?.stack || error?.message || String(error)}`);
  process.exit(1);
});
