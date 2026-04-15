#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { iterateGzipNdjson } from '../lib/io/gzip-ndjson.mjs';
import { loadCheckpoints } from '../lib/hist-probs/checkpoint-store.mjs';
import { normalizeDate, readJson } from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const MIN_REQUIRED_BARS = 60;
const INACTIVE_TOLERANCE_TRADING_DAYS = 20;
const PATHS = {
  scopeRows: path.join(ROOT, 'mirrors/universe-v7/ssot/stocks_etfs.us_eu.rows.json'),
  registry: path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz'),
  checkpoints: path.join(ROOT, 'public/data/hist-probs/checkpoints.json'),
  runSummary: path.join(ROOT, 'public/data/hist-probs/run-summary.json'),
  noDataManifest: path.join(ROOT, 'public/data/hist-probs/no-data-tickers.json'),
  providerNoData: path.join(ROOT, 'public/data/universe/v7/ssot/provider-no-data-exclusions.json'),
  triage: path.join(ROOT, 'public/data/hist-probs/error-triage-latest.json'),
  retryTickers: path.join(ROOT, 'public/data/hist-probs/retry-tickers-latest.json'),
};

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function canonicalExchange(canonicalId) {
  const normalized = String(canonicalId || '').trim().toUpperCase();
  if (!normalized.includes(':')) return null;
  return String(normalized.split(':')[0] || '').trim().toUpperCase() || null;
}

function tradingDaysBetween(olderDateId, newerDateId) {
  if (!olderDateId || !newerDateId) return null;
  const older = new Date(`${String(olderDateId).slice(0, 10)}T00:00:00Z`);
  const newer = new Date(`${String(newerDateId).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(older.getTime()) || Number.isNaN(newer.getTime()) || newer <= older) return 0;
  let count = 0;
  const cursor = new Date(older);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= newer) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function mergeUniverseEntry(map, row) {
  const symbol = normalizeTicker(row?.symbol);
  if (!symbol) return;
  const current = map.get(symbol) || {
    symbol,
    expected_date: null,
    bars_count: 0,
    type_norm: null,
    canonical_id: null,
    canonical_ids: [],
    exchange: null,
  };
  const expectedDate = normalizeDate(row?.last_trade_date);
  if (!current.expected_date || (expectedDate && expectedDate > current.expected_date)) {
    current.expected_date = expectedDate;
  }
  const barsCount = Number(row?.bars_count || 0);
  if (Number.isFinite(barsCount) && barsCount > current.bars_count) {
    current.bars_count = barsCount;
  }
  const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
  if (!current.type_norm && typeNorm) current.type_norm = typeNorm;
  const canonicalId = String(row?.canonical_id || '').trim().toUpperCase() || null;
  if (canonicalId && !current.canonical_ids.includes(canonicalId)) {
    current.canonical_ids.push(canonicalId);
  }
  if (!current.canonical_id) {
    current.canonical_id = canonicalId;
    current.exchange = String(row?.exchange || '').trim().toUpperCase() || canonicalExchange(canonicalId) || null;
  }
  map.set(symbol, current);
}

async function loadUniverseMap() {
  const merged = new Map();
  try {
    const scopeDoc = JSON.parse(fs.readFileSync(PATHS.scopeRows, 'utf8'));
    for (const row of Array.isArray(scopeDoc?.items) ? scopeDoc.items : []) {
      const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
      if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
      mergeUniverseEntry(merged, row);
    }
    if (merged.size > 0) return merged;
  } catch {}

  for await (const row of iterateGzipNdjson(PATHS.registry)) {
    const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
    if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
    mergeUniverseEntry(merged, row);
  }
  return merged;
}

function readNoDataSymbols() {
  const symbols = new Set();
  const manifest = readJson(PATHS.noDataManifest);
  for (const row of Array.isArray(manifest?.tickers) ? manifest.tickers : []) {
    const symbol = normalizeTicker(row?.symbol);
    if (symbol) symbols.add(symbol);
  }
  return symbols;
}

function readProviderNoDataSets() {
  const doc = readJson(PATHS.providerNoData);
  return {
    symbols: new Set((Array.isArray(doc?.symbols) ? doc.symbols : []).map(normalizeTicker).filter(Boolean)),
    canonicalIds: new Set((Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)),
  };
}

async function main() {
  const runSummary = readJson(PATHS.runSummary) || {};
  const targetMarketDate = normalizeDate(
    process.env.TARGET_MARKET_DATE
    || process.env.RV_TARGET_MARKET_DATE
    || runSummary?.regime_date
    || null
  );
  const checkpointStore = loadCheckpoints(PATHS.checkpoints);
  const universe = await loadUniverseMap();
  const noDataSymbols = readNoDataSymbols();
  const providerNoData = readProviderNoDataSets();
  const errorEntries = Object.values(checkpointStore.tickers || {})
    .filter((entry) => String(entry?.status || '').toLowerCase() === 'error')
    .sort((a, b) => String(a?.ticker || '').localeCompare(String(b?.ticker || '')));

  const retryTickers = [];
  const reclassifyNoData = [];
  const reclassifyInactive = [];
  const inspected = [];

  for (const entry of errorEntries) {
    const ticker = normalizeTicker(entry?.ticker);
    if (!ticker) continue;
    const universeEntry = universe.get(ticker) || null;
    const expectedDate = normalizeDate(universeEntry?.expected_date);
    const latestDate = normalizeDate(entry?.latest_date);
    const barsCount = Number(universeEntry?.bars_count || 0);
    const canonicalId = String(universeEntry?.canonical_id || entry?.canonical_id || '').trim().toUpperCase() || null;
    const providerNoDataHit = noDataSymbols.has(ticker)
      || providerNoData.symbols.has(ticker)
      || (canonicalId && providerNoData.canonicalIds.has(canonicalId));
    const inactiveLagTradingDays = tradingDaysBetween(expectedDate, targetMarketDate);

    let classification = 'retry';
    let reason = 'stale_after_rebuild_requires_retry';
    // If the scope registry's expected_date is before the target, the ticker is not expected
    // to have target-date data (e.g. EU exchange closed on target date) → no_data, not retry
    const scopeExpectsBeforeTarget = expectedDate && expectedDate < targetMarketDate;
    if (providerNoDataHit || scopeExpectsBeforeTarget || (Number.isFinite(barsCount) && barsCount > 0 && barsCount < MIN_REQUIRED_BARS)) {
      classification = 'no_data';
      reason = providerNoDataHit ? 'provider_or_manifest_no_data'
        : scopeExpectsBeforeTarget ? 'scope_expected_date_before_target'
        : 'insufficient_history_under_min_required_bars';
      reclassifyNoData.push({
        ticker,
        latest_date: latestDate || expectedDate || null,
        expected_date: expectedDate || null,
        bars_count: Number.isFinite(barsCount) ? barsCount : null,
        type_norm: universeEntry?.type_norm || null,
        canonical_id: canonicalId,
        canonical_ids: universeEntry?.canonical_ids || [],
        reason,
      });
    } else if (inactiveLagTradingDays != null && inactiveLagTradingDays > INACTIVE_TOLERANCE_TRADING_DAYS) {
      classification = 'inactive';
      reason = `inactive_lag_gt_${INACTIVE_TOLERANCE_TRADING_DAYS}t`;
      reclassifyInactive.push({
        ticker,
        latest_date: latestDate || expectedDate || null,
        expected_date: expectedDate || null,
        bars_count: Number.isFinite(barsCount) ? barsCount : null,
        type_norm: universeEntry?.type_norm || null,
        canonical_id: canonicalId,
        canonical_ids: universeEntry?.canonical_ids || [],
        reason,
      });
    } else {
      retryTickers.push(ticker);
    }

    inspected.push({
      ticker,
      classification,
      reason,
      latest_date: latestDate || null,
      expected_date: expectedDate || null,
      bars_count: Number.isFinite(barsCount) ? barsCount : null,
      canonical_id: canonicalId,
      inactive_lag_trading_days: inactiveLagTradingDays,
      provider_no_data_hit: providerNoDataHit,
    });
  }

  const triage = {
    schema: 'rv.hist_probs.error_triage.v1',
    generated_at: new Date().toISOString(),
    target_market_date: targetMarketDate,
    source_run_summary_ran_at: runSummary?.ran_at || null,
    source_tickers_errors: Number(runSummary?.tickers_errors || 0),
    summary: {
      error_ticker_count: errorEntries.length,
      retry_count: retryTickers.length,
      reclassify_no_data_count: reclassifyNoData.length,
      reclassify_inactive_count: reclassifyInactive.length,
    },
    retry_tickers: retryTickers,
    reclassify_no_data: reclassifyNoData,
    reclassify_inactive: reclassifyInactive,
    inspected,
  };
  const retryPayload = {
    schema: 'rv.hist_probs.retry_tickers.v1',
    generated_at: triage.generated_at,
    target_market_date: targetMarketDate,
    tickers: retryTickers,
  };

  writeJsonAtomic(PATHS.triage, triage);
  writeJsonAtomic(PATHS.retryTickers, retryPayload);
  process.stdout.write(`${JSON.stringify(triage.summary)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
