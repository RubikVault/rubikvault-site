/**
 * run-hist-probs.mjs
 * Phase 4: Historical Probabilities Layer — Daily/Scoped Runner
 */

import path from 'node:path';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { REPO_ROOT } from '../best-setups-local-loader.mjs';
import { computeRegime } from './compute-regime.mjs';
import { computeOutcomes, configureComputeOutcomesRuntime } from './compute-outcomes.mjs';
import { appendError, cleanupLedger } from './error-ledger.mjs';
import { loadCheckpoints, saveCheckpoints, setTickerState, needsColdRebuild } from './checkpoint-store.mjs';
import { buildStateSnapshot, writeStateSnapshot, cleanupSnapshots } from './state-snapshot.mjs';
import { iterateGzipNdjson } from '../io/gzip-ndjson.mjs';
import { histProbsReadCandidates } from './path-resolver.mjs';

const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');
const STOCK_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const PROVIDER_NO_DATA_MANIFEST_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/provider-no-data-exclusions.json');
const MAX_TICKERS_PER_RUN = 500;
const FEATURE_CORE_VERSION = 'hist_probs_feature_core_v1';
const OUTCOME_LOGIC_VERSION = 'hist_probs_outcome_logic_v1';
const RUN_SCHEMA_VERSION = 'rv_hist_probs_run_summary_v2';
const INACTIVE_TOLERANCE_TRADING_DAYS = 20;

function inferNodeOldSpaceLimitMb() {
  const nodeOptions = String(process.env.NODE_OPTIONS || '');
  const match = nodeOptions.match(/--max-old-space-size=(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const NODE_OLD_SPACE_LIMIT_MB = inferNodeOldSpaceLimitMb();
const DEFAULT_HIST_PROBS_RSS_BUDGET_MB = NODE_OLD_SPACE_LIMIT_MB
  ? Math.max(1536, NODE_OLD_SPACE_LIMIT_MB + 512)
  : 1536;
const HIST_PROBS_RSS_BUDGET_MB = Math.max(128, Number(process.env.HIST_PROBS_RSS_BUDGET_MB || DEFAULT_HIST_PROBS_RSS_BUDGET_MB));

const CURRENT_VERSIONS = {
  schema_version: RUN_SCHEMA_VERSION,
  feature_core_version: FEATURE_CORE_VERSION,
  outcome_logic_version: OUTCOME_LOGIC_VERSION,
};

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDateId(value) {
  const normalized = String(value || '').slice(0, 10).trim();
  return normalized || null;
}

function maxDateId(...values) {
  return values
    .map((value) => normalizeDateId(value))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .at(-1) || null;
}

function resolveTargetMarketDate(explicit = null) {
  return maxDateId(explicit, process.env.TARGET_MARKET_DATE, process.env.RV_TARGET_MARKET_DATE);
}

function canonicalExchange(canonicalId) {
  const normalized = String(canonicalId || '').trim().toUpperCase();
  if (!normalized.includes(':')) return null;
  return normalizeTicker(normalized.split(':')[0]);
}

function resolveRequiredDate({ expectedDate = null, targetMarketDate = null, fallbackDate = null } = {}) {
  return maxDateId(expectedDate, targetMarketDate, fallbackDate);
}

function buildComputeOptions(entry = {}) {
  const preferredCanonicalId = String(entry?.canonical_id || '').trim().toUpperCase() || null;
  const preferredExchange = normalizeTicker(entry?.exchange) || canonicalExchange(preferredCanonicalId);
  const options = {};
  if (preferredCanonicalId) options.preferredCanonicalId = preferredCanonicalId;
  if (preferredExchange) options.preferredExchange = preferredExchange;
  return options;
}

function shouldPreferCanonicalCandidate(current, row) {
  const currentDate = normalizeDateId(current?._preferred_last_trade_date);
  const rowDate = normalizeDateId(row?.last_trade_date);
  if ((rowDate || '') !== (currentDate || '')) return (rowDate || '') > (currentDate || '');
  const currentBars = Number(current?._preferred_bars_count || 0);
  const rowBars = Number(row?.bars_count || 0);
  if (rowBars !== currentBars) return rowBars > currentBars;
  const currentCanonicalId = String(current?.canonical_id || '').trim().toUpperCase();
  const rowCanonicalId = String(row?.canonical_id || '').trim().toUpperCase();
  if (!currentCanonicalId) return Boolean(rowCanonicalId);
  if (!rowCanonicalId) return false;
  return rowCanonicalId.localeCompare(currentCanonicalId) < 0;
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

function readJsonSync(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function enforceRssBudget(label, budgetMb = HIST_PROBS_RSS_BUDGET_MB) {
  const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  if (rssMb > budgetMb) {
    const error = new Error(`rss_budget_exceeded:${label}:${rssMb}MB>${budgetMb}MB`);
    error.code = 'HIST_PROBS_RSS_BUDGET_EXCEEDED';
    throw error;
  }
  return rssMb;
}

function measureRssMb() {
  return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

async function inspectHistProbsOutput(filePath, expectedTicker, expectedDate = null) {
  try {
    const doc = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const actualTicker = String(doc?.ticker || '').trim().toUpperCase();
    const wantedTicker = String(expectedTicker || '').trim().toUpperCase();
    const latestDate = normalizeDateId(doc?.latest_date);
    const structurallyValid = (
      actualTicker === wantedTicker &&
      Number.isFinite(Number(doc?.bars_count)) &&
      Number(doc.bars_count) > 0 &&
      latestDate != null &&
      doc?.events &&
      typeof doc.events === 'object' &&
      !Array.isArray(doc.events)
    );
    if (!structurallyValid) return { status: 'invalid', latest_date: latestDate };
    if (expectedDate && latestDate && latestDate < expectedDate) return { status: 'stale', latest_date: latestDate };
    return { status: 'fresh', latest_date: latestDate };
  } catch {
    return { status: 'invalid', latest_date: null };
  }
}

function limitTickers(list, maxTickers) {
  if (!(maxTickers > 0)) return list;
  return list.slice(0, maxTickers);
}

async function loadTickersFromSymbolsPath(symbolsPath, maxTickers) {
  try {
    const doc = JSON.parse(await fs.readFile(symbolsPath, 'utf8'));
    const symbols = Array.isArray(doc)
      ? doc
      : Array.isArray(doc?.symbols)
        ? doc.symbols
        : [];
    return limitTickers(symbols.map((symbol) => ({
      symbol: normalizeTicker(symbol),
      expected_date: null,
      type_norm: 'STOCK',
      canonical_id: null,
    })).filter((item) => item.symbol), maxTickers);
  } catch {
    return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ', 'IWM'].map((symbol) => ({
      symbol,
      expected_date: null,
      type_norm: 'STOCK',
      canonical_id: null,
    }));
  }
}

async function loadTickersFromRegistry(registryPath, assetClasses, maxTickers) {
  const allowed = new Set((assetClasses || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean));
  const tickers = new Map();
  for await (const row of iterateGzipNdjson(registryPath)) {
    const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
    if (allowed.size && !allowed.has(typeNorm)) continue;
    const ticker = normalizeTicker(row?.symbol);
    if (!ticker) continue;
    const current = tickers.get(ticker) || {
      symbol: ticker,
      expected_date: null,
      type_norm: typeNorm || null,
      canonical_id: String(row?.canonical_id || '').trim().toUpperCase() || null,
    };
    const expectedDate = normalizeDateId(row?.last_trade_date);
    if (!current.expected_date || (expectedDate && expectedDate > current.expected_date)) {
      current.expected_date = expectedDate;
    }
    if (!current.type_norm && typeNorm) current.type_norm = typeNorm;
    if (!current.canonical_id || shouldPreferCanonicalCandidate(current, row)) {
      current.canonical_id = String(row?.canonical_id || '').trim().toUpperCase() || null;
      current.exchange = normalizeTicker(row?.exchange) || canonicalExchange(current.canonical_id);
      current._preferred_last_trade_date = expectedDate || null;
      current._preferred_bars_count = barsCount;
    }
    tickers.set(ticker, current);
  }
  return limitTickers(
    [...tickers.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map(({ _preferred_last_trade_date, _preferred_bars_count, ...entry }) => entry),
    maxTickers,
  );
}

function readProviderNoDataManifest(filePath = PROVIDER_NO_DATA_MANIFEST_PATH) {
  const doc = readJsonSync(filePath);
  if (!doc || typeof doc !== 'object') {
    return { symbols: new Set(), canonicalIds: new Set(), path: filePath, active: false };
  }
  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  return {
    path: filePath,
    active: true,
    symbols: new Set([
      ...(Array.isArray(doc.symbols) ? doc.symbols : []),
      ...entries.map((entry) => entry?.symbol),
    ].map((value) => normalizeTicker(value)).filter(Boolean)),
    canonicalIds: new Set([
      ...(Array.isArray(doc.canonical_ids) ? doc.canonical_ids : []),
      ...entries.map((entry) => entry?.canonical_id),
    ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)),
  };
}

function parseArgs(defaultMaxTickers = MAX_TICKERS_PER_RUN) {
  const args = process.argv.slice(2);
  const tickerArg = args.find((a) => a.startsWith('--ticker='))?.split('=')[1]
    || (args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null);
  const tickersArg = args.find((a) => a.startsWith('--tickers='))?.split('=')[1]
    || (args.includes('--tickers') ? args[args.indexOf('--tickers') + 1] : null);
  const symbolsPathArg = args.find((a) => a.startsWith('--symbols-path='))?.split('=')[1]
    || (args.includes('--symbols-path') ? args[args.indexOf('--symbols-path') + 1] : null);
  const registryPathArg = args.find((a) => a.startsWith('--registry-path='))?.split('=')[1]
    || (args.includes('--registry-path') ? args[args.indexOf('--registry-path') + 1] : null);
  const providerNoDataManifestArg = args.find((a) => a.startsWith('--provider-no-data-manifest='))?.split('=')[1]
    || (args.includes('--provider-no-data-manifest') ? args[args.indexOf('--provider-no-data-manifest') + 1] : null);
  const assetClassesArg = args.find((a) => a.startsWith('--asset-classes='))?.split('=')[1]
    || (args.includes('--asset-classes') ? args[args.indexOf('--asset-classes') + 1] : null);
  const maxTickersArg = args.find((a) => a.startsWith('--max-tickers='))?.split('=')[1]
    || (args.includes('--max-tickers') ? args[args.indexOf('--max-tickers') + 1] : null);
  return {
    singleTicker: tickerArg ? normalizeTicker(tickerArg) : null,
    tickers: tickersArg ? tickersArg.split(',').map(normalizeTicker).filter(Boolean) : null,
    symbolsPath: symbolsPathArg ? path.resolve(REPO_ROOT, symbolsPathArg) : STOCK_SYMBOLS_PATH,
    registryPath: registryPathArg ? path.resolve(REPO_ROOT, registryPathArg) : REGISTRY_PATH,
    providerNoDataManifestPath: providerNoDataManifestArg ? path.resolve(REPO_ROOT, providerNoDataManifestArg) : PROVIDER_NO_DATA_MANIFEST_PATH,
    assetClasses: assetClassesArg ? assetClassesArg.split(',').map((v) => String(v || '').trim().toUpperCase()).filter(Boolean) : null,
    maxTickers: Number.isFinite(Number(maxTickersArg)) ? Number(maxTickersArg) : defaultMaxTickers,
  };
}

async function writeSummaryAtomic(summary) {
  const summaryPath = path.join(HIST_PROBS_DIR, 'run-summary.json');
  const tmpPath = path.join(HIST_PROBS_DIR, `.run-summary.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.rename(tmpPath, summaryPath);
  const stat = await fs.stat(summaryPath);
  if (stat.size < 100) {
    throw new Error(`[hist-probs] Write verification failed: run-summary.json is only ${stat.size} bytes — possible write-to-void`);
  }
  return summaryPath;
}

export async function runHistProbs(options = {}) {
  configureComputeOutcomesRuntime({
    localBarStaleDays: 9999,
    allowRemoteBarFetch: false,
  });
  const {
    singleTicker,
    tickers,
    symbolsPath = STOCK_SYMBOLS_PATH,
    registryPath = REGISTRY_PATH,
    providerNoDataManifestPath = PROVIDER_NO_DATA_MANIFEST_PATH,
    assetClasses = null,
    maxTickers = MAX_TICKERS_PER_RUN,
    targetMarketDate: targetMarketDateOption = null,
  } = options;

  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
  const checkpointStore = loadCheckpoints();
  const skipExisting = process.env.HIST_PROBS_SKIP_EXISTING !== '0';

  const regime = await computeRegime();
  const targetMarketDate = resolveTargetMarketDate(targetMarketDateOption);

  let entries;
  if (singleTicker) {
    entries = [{ symbol: singleTicker, expected_date: null, type_norm: null }];
  } else if (tickers?.length) {
    entries = tickers.map((ticker) => ({ symbol: ticker, expected_date: null, type_norm: null }));
  } else if (assetClasses?.length) {
    entries = await loadTickersFromRegistry(registryPath, assetClasses, maxTickers);
  } else {
    entries = await loadTickersFromSymbolsPath(symbolsPath, maxTickers);
  }
  entries = entries.map((entry) => ({
    ...entry,
    required_date: resolveRequiredDate({
      expectedDate: entry.expected_date,
      targetMarketDate,
      fallbackDate: regime?.date || null,
    }),
  }));

  const providerNoDataManifest = (!singleTicker && !tickers?.length)
    ? readProviderNoDataManifest(providerNoDataManifestPath)
    : { symbols: new Set(), canonicalIds: new Set(), path: providerNoDataManifestPath, active: false };

  const runtimeEntries = [];
  let preExcludedInactive = 0;
  let preExcludedProviderNoData = 0;
  for (const entry of entries) {
    const canonicalId = String(entry?.canonical_id || '').trim().toUpperCase() || null;
    const excludedByProviderNoData = providerNoDataManifest.symbols.has(entry.symbol)
      || (canonicalId && providerNoDataManifest.canonicalIds.has(canonicalId));
    if (excludedByProviderNoData) {
      preExcludedProviderNoData += 1;
      setTickerState(checkpointStore, entry.symbol, {
        status: 'provider_no_data_excluded',
        latest_date: entry.expected_date || null,
        canonical_id: canonicalId,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
      continue;
    }
    const lag = tradingDaysBetween(entry.expected_date, regime?.date);
    if (lag != null && lag > INACTIVE_TOLERANCE_TRADING_DAYS) {
      preExcludedInactive += 1;
      setTickerState(checkpointStore, entry.symbol, {
        status: 'inactive',
        latest_date: entry.expected_date || null,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
      continue;
    }
    runtimeEntries.push(entry);
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let noData = 0;
  let inactive = preExcludedInactive;
  let forcedRebuild = 0;
  const errorSamples = [];
  const noDataSamples = [];
  const startTime = Date.now();
  const rssAtStart = enforceRssBudget('start');

  for (const entry of runtimeEntries) {
    const ticker = entry.symbol;
    if (skipExisting) {
      let inspected = { status: 'invalid', latest_date: null };
      for (const candidate of histProbsReadCandidates(HIST_PROBS_DIR, ticker)) {
        inspected = await inspectHistProbsOutput(candidate, ticker, entry.expected_date || regime?.date);
        if (inspected.status === 'fresh') break;
      }
      if (inspected.status === 'fresh') {
        const rebuild = needsColdRebuild(checkpointStore, ticker, CURRENT_VERSIONS);
        if (!rebuild.needsRebuild) {
          skipped += 1;
          setTickerState(checkpointStore, ticker, {
            status: 'fresh_skipped',
            latest_date: inspected.latest_date || entry.required_date || entry.expected_date || null,
            ...CURRENT_VERSIONS,
            computed_at: new Date().toISOString(),
          });
          continue;
        }
        forcedRebuild += 1;
      }
    }

    try {
      const result = await computeOutcomes(ticker, buildComputeOptions(entry));
      if (!result) {
        noData += 1;
        appendError({ ticker, error: 'NO_DATA', message: 'NO_DATA', run_id: regime?.date || null, severity: 'warning' });
        setTickerState(checkpointStore, ticker, {
          status: 'no_data',
          latest_date: entry.required_date || entry.expected_date || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
        if (noDataSamples.length < 25) noDataSamples.push({ ticker, message: 'NO_DATA' });
        continue;
      }

      const freshnessLag = tradingDaysBetween(result.latest_date, entry.required_date || regime?.date || null);
      if (freshnessLag != null && freshnessLag > INACTIVE_TOLERANCE_TRADING_DAYS) {
        inactive += 1;
        setTickerState(checkpointStore, ticker, {
          status: 'inactive',
          latest_date: result.latest_date || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
        continue;
      }

      if (entry.required_date && result.latest_date && result.latest_date < entry.required_date) {
        errors += 1;
        const message = `STALE_AFTER_REBUILD:${result.latest_date}<${entry.required_date}`;
        appendError({ ticker, error: 'STALE_AFTER_REBUILD', message, run_id: regime?.date || null });
        setTickerState(checkpointStore, ticker, {
          status: 'error',
          latest_date: result.latest_date || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
        if (errorSamples.length < 25) errorSamples.push({ ticker, message });
        continue;
      }

      const lag = tradingDaysBetween(result.latest_date, regime?.date);
      if (lag != null && lag > INACTIVE_TOLERANCE_TRADING_DAYS) {
        inactive += 1;
        setTickerState(checkpointStore, ticker, {
          status: 'inactive',
          latest_date: result.latest_date || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
        continue;
      }

      processed += 1;
      setTickerState(checkpointStore, ticker, {
        status: 'processed',
        latest_date: result.latest_date || entry.expected_date || null,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
    } catch (err) {
      errors += 1;
      const message = err?.message || String(err);
      appendError({ ticker, error: 'COMPUTE_ERROR', message, run_id: regime?.date || null });
      setTickerState(checkpointStore, ticker, {
        status: 'error',
        latest_date: entry.expected_date || null,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
      if (errorSamples.length < 25) errorSamples.push({ ticker, message });
    }
  }

  saveCheckpoints(checkpointStore);
  cleanupLedger({ maxAgeDays: 7 });
  cleanupSnapshots({ maxAgeDays: 30 });

  const covered = processed + skipped;
  const tickersTotal = runtimeEntries.length;
  let rssCompleteMb = null;
  try {
    rssCompleteMb = enforceRssBudget('complete');
  } catch (error) {
    rssCompleteMb = measureRssMb();
    console.warn(`[hist-probs] ${error?.message || error} (recorded as advisory after checkpoint persistence)`);
  }
  const summaryPayload = {
    schema_version: RUN_SCHEMA_VERSION,
    feature_core_version: FEATURE_CORE_VERSION,
    outcome_logic_version: OUTCOME_LOGIC_VERSION,
    ran_at: new Date().toISOString(),
    tickers_total: tickersTotal,
    tickers_input_total: entries.length,
    tickers_excluded_no_data: preExcludedProviderNoData,
    tickers_excluded_inactive: inactive,
    tickers_processed: processed,
    tickers_skipped: skipped,
    tickers_errors: errors,
    tickers_no_data: noData,
    tickers_covered: covered,
    tickers_remaining: Math.max(0, tickersTotal - covered - noData - errors),
    invalid_existing_files: 0,
    stale_existing_files: 0,
    missing_existing_files: 0,
    worker_hard_failures: 0,
    skip_existing: skipExisting,
    workers_requested: 1,
    workers_used: 1,
    worker_scaling_gate_state: 'single_runner',
    worker_scaling_gate_source: 'run_hist_probs',
    source_mode: singleTicker ? 'single_ticker' : tickers?.length ? 'explicit_tickers' : assetClasses?.length ? 'registry_asset_classes' : 'symbols_path',
    asset_classes: assetClasses?.length ? [...assetClasses].sort() : ['STOCK'],
    max_tickers: maxTickers,
    regime_date: regime?.date ?? null,
    elapsed_seconds: Number(((Date.now() - startTime) / 1000).toFixed(1)),
    market_regime: regime?.market_regime ?? null,
    volatility_regime: regime?.volatility_regime ?? null,
    breadth_regime: regime?.breadth_regime ?? null,
    error_samples: errorSamples,
    no_data_samples: noDataSamples,
    local_only_mode: true,
    checkpoints_rebuild_forced: forcedRebuild,
    rss_budget_mb: HIST_PROBS_RSS_BUDGET_MB,
    rss_start_mb: rssAtStart,
    rss_complete_mb: rssCompleteMb,
    symbols_path: assetClasses?.length ? null : symbolsPath,
    registry_path: assetClasses?.length ? registryPath : null,
    provider_no_data_manifest_path: providerNoDataManifest.active ? providerNoDataManifest.path : null,
  };

  const snapshot = buildStateSnapshot(checkpointStore, summaryPayload);
  writeStateSnapshot(snapshot);
  const summaryPath = await writeSummaryAtomic(summaryPayload);
  return { ok: errors === 0, summaryPath, summary: summaryPayload };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHistProbs(parseArgs()).then((result) => {
    if (!result?.ok) process.exit(1);
  }).catch((err) => {
    console.error('[run-hist-probs] Fatal error:', err);
    process.exit(1);
  });
}
