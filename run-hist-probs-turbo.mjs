import path from 'node:path';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { appendError, cleanupLedger } from './scripts/lib/hist-probs/error-ledger.mjs';
import { loadCheckpoints, saveCheckpoints, getTickerState, setTickerState, needsColdRebuild } from './scripts/lib/hist-probs/checkpoint-store.mjs';
import { buildStateSnapshot, writeStateSnapshot, cleanupSnapshots } from './scripts/lib/hist-probs/state-snapshot.mjs';
import { iterateGzipNdjson } from './scripts/lib/io/gzip-ndjson.mjs';
import { histProbsReadCandidates } from './scripts/lib/hist-probs/path-resolver.mjs';

// Correct path found by find: scripts/lib/best-setups-local-loader.mjs
import { REPO_ROOT } from './scripts/lib/best-setups-local-loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');
const COMPUTE_AUDIT_PATH = path.join(REPO_ROOT, 'public/data/reports/pipeline-compute-audit-latest.json');
const MONITORING_PATH = path.join(REPO_ROOT, 'public/data/reports/pipeline-monitoring-latest.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const US_EU_SCOPE_ROWS_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/ssot/stocks_etfs.us_eu.rows.json');
const NO_DATA_MANIFEST_PATH = path.join(HIST_PROBS_DIR, 'no-data-tickers.json');
const RETRY_SUMMARY_PATH = path.join(HIST_PROBS_DIR, 'retry-summary-latest.json');
const MIN_REQUIRED_BARS = 60;
const INACTIVE_TOLERANCE_TRADING_DAYS = 20;
const FEATURE_CORE_VERSION = 'hist_probs_feature_core_v1';
const OUTCOME_LOGIC_VERSION = 'hist_probs_outcome_logic_v1';
const RUN_SCHEMA_VERSION = 'rv_hist_probs_run_summary_v2';

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

function readJsonSync(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveWorkerGate() {
  const computeAudit = readJsonSync(COMPUTE_AUDIT_PATH);
  const monitoring = readJsonSync(MONITORING_PATH);
  const runner = Array.isArray(computeAudit?.runners)
    ? computeAudit.runners.find((item) => item?.runner === 'hist_probs_turbo')
    : null;
  const maxAllowedWorkers = Math.max(1, Number(runner?.max_allowed_workers || runner?.default_workers || 1));
  const rssStatus = String(monitoring?.gates?.hist_probs_rss_usage_ratio?.status || '').trim().toLowerCase();
  const errorStatus = String(monitoring?.gates?.hist_probs_error_rate?.status || '').trim().toLowerCase();
  const dlqStatus = String(monitoring?.gates?.hist_probs_dlq_rate?.status || '').trim().toLowerCase();
  const monitoringCritical = [rssStatus, errorStatus, dlqStatus].includes('critical');
  const safeMaxWorkers = monitoringCritical ? 1 : maxAllowedWorkers;
  if (process.env.HIST_PROBS_WORKERS) {
    const requestedWorkers = Math.max(1, Number(process.env.HIST_PROBS_WORKERS) || 1);
    return {
      workers: Math.min(requestedWorkers, safeMaxWorkers),
      requestedWorkers,
      maxAllowedWorkers: safeMaxWorkers,
      gateState: monitoringCritical ? 'monitoring_capped' : 'env_override',
      source: monitoringCritical ? 'pipeline_monitoring_cap' : 'env:HIST_PROBS_WORKERS',
      capApplied: requestedWorkers > safeMaxWorkers,
    };
  }
  return {
    workers: Math.min(Math.max(1, Number(runner?.default_workers || 1)), safeMaxWorkers),
    requestedWorkers: Math.max(1, Number(runner?.default_workers || 1)),
    maxAllowedWorkers: safeMaxWorkers,
    gateState: runner?.scaling_gate_state || 'ramp_1_only',
    source: runner ? 'pipeline_compute_audit' : 'default_fallback',
    capApplied: Math.max(1, Number(runner?.default_workers || 1)) > safeMaxWorkers,
  };
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

const WORKER_GATE = resolveWorkerGate();
const NUM_WORKERS = WORKER_GATE.workers;

// Skip tickers that already have an output file (resume after crash/reboot)
const SKIP_EXISTING = process.env.HIST_PROBS_SKIP_EXISTING !== '0';

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

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function parseBooleanFlag(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function readTickerListFile(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      const tickers = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.tickers)
          ? parsed.tickers
          : [];
      return tickers.map(normalizeTicker).filter(Boolean);
    } catch {
      return trimmed.split(/\r?\n|,/).map(normalizeTicker).filter(Boolean);
    }
  } catch {
    return [];
  }
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const tickerArg = argv.find((arg) => arg.startsWith('--ticker='))?.split('=')[1]
    || (argv.includes('--ticker') ? argv[argv.indexOf('--ticker') + 1] : null);
  const tickersArg = argv.find((arg) => arg.startsWith('--tickers='))?.split('=')[1]
    || (argv.includes('--tickers') ? argv[argv.indexOf('--tickers') + 1] : null);
  const tickersFileArg = argv.find((arg) => arg.startsWith('--tickers-file='))?.split('=')[1]
    || (argv.includes('--tickers-file') ? argv[argv.indexOf('--tickers-file') + 1] : null);
  const targetMarketDate = argv.find((arg) => arg.startsWith('--target-market-date='))?.split('=')[1]
    || (argv.includes('--target-market-date') ? argv[argv.indexOf('--target-market-date') + 1] : null);
  const writeRunSummaryArg = argv.find((arg) => arg.startsWith('--write-run-summary='))?.split('=')[1]
    || (argv.includes('--write-run-summary') ? argv[argv.indexOf('--write-run-summary') + 1] : null);
  const explicitTickers = new Set();
  if (tickerArg) explicitTickers.add(normalizeTicker(tickerArg));
  for (const ticker of String(tickersArg || '').split(',').map(normalizeTicker).filter(Boolean)) {
    explicitTickers.add(ticker);
  }
  if (tickersFileArg) {
    const tickersFilePath = path.resolve(REPO_ROOT, tickersFileArg);
    for (const ticker of readTickerListFile(tickersFilePath)) {
      explicitTickers.add(ticker);
    }
  }
  explicitTickers.delete(null);
  return {
    explicitTickers: [...explicitTickers],
    targetMarketDate: normalizeDateId(targetMarketDate),
    writeRunSummary: parseBooleanFlag(writeRunSummaryArg),
  };
}

function canonicalExchange(canonicalId) {
  const normalized = String(canonicalId || '').trim().toUpperCase();
  if (!normalized.includes(':')) return null;
  return String(normalized.split(':')[0] || '').trim().toUpperCase() || null;
}

function resolveRequiredDate({ expectedDate = null, targetMarketDate = null, fallbackDate = null } = {}) {
  return maxDateId(expectedDate, targetMarketDate, fallbackDate);
}

function buildComputeOptions(entry = {}) {
  const preferredCanonicalId = String(entry?.canonical_id || '').trim().toUpperCase() || null;
  const preferredExchange = String(entry?.exchange || canonicalExchange(preferredCanonicalId) || '').trim().toUpperCase() || null;
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

const CURRENT_VERSIONS = {
  schema_version: RUN_SCHEMA_VERSION,
  feature_core_version: FEATURE_CORE_VERSION,
  outcome_logic_version: OUTCOME_LOGIC_VERSION,
};

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
  const symbol = String(row?.symbol || '').trim().toUpperCase();
  if (!symbol) return;
  const current = map.get(symbol) || {
    symbol,
    expected_date: null,
    bars_count: 0,
    type_norm: null,
    canonical_ids: [],
    canonical_id: null,
    exchange: null,
  };
  const expectedDate = normalizeDateId(row?.last_trade_date);
  if (!current.expected_date || (expectedDate && expectedDate > current.expected_date)) {
    current.expected_date = expectedDate;
  }
  const barsCount = Number(row?.bars_count || 0);
  if (Number.isFinite(barsCount) && barsCount > current.bars_count) {
    current.bars_count = barsCount;
  }
  const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
  if (!current.type_norm && typeNorm) current.type_norm = typeNorm;
  const canonicalId = String(row?.canonical_id || '').trim();
  if (canonicalId && !current.canonical_ids.includes(canonicalId)) {
    current.canonical_ids.push(canonicalId);
  }
  if (!current.canonical_id || shouldPreferCanonicalCandidate(current, row)) {
    current.canonical_id = canonicalId || null;
    current.exchange = String(row?.exchange || '').trim().toUpperCase() || canonicalExchange(canonicalId) || null;
    current._preferred_last_trade_date = expectedDate || null;
    current._preferred_bars_count = barsCount;
  }
  map.set(symbol, current);
}

async function loadRequiredUniverse() {
  const merged = new Map();

  try {
    const scopeDoc = JSON.parse(await fs.readFile(US_EU_SCOPE_ROWS_PATH, 'utf8'));
    const items = Array.isArray(scopeDoc?.items) ? scopeDoc.items : [];
    for (const row of items) {
      const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
      if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
      mergeUniverseEntry(merged, row);
    }
    if (merged.size > 0) {
      return {
        mode: 'us_eu_scope',
        entries: [...merged.values()]
          .sort((a, b) => a.symbol.localeCompare(b.symbol))
          .map(({ _preferred_last_trade_date, _preferred_bars_count, ...entry }) => entry),
      };
    }
  } catch {}

  for await (const row of iterateGzipNdjson(REGISTRY_PATH)) {
    const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
    if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
    mergeUniverseEntry(merged, row);
  }
  return {
    mode: 'registry_asset_classes',
    entries: [...merged.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map(({ _preferred_last_trade_date, _preferred_bars_count, ...entry }) => entry),
  };
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
    if (!structurallyValid) {
      return { status: 'invalid', latest_date: latestDate };
    }
    if (expectedDate && latestDate && latestDate < expectedDate) {
      return { status: 'stale', latest_date: latestDate };
    }
    return { status: 'fresh', latest_date: latestDate };
  } catch {
    return { status: 'invalid', latest_date: null };
  }
}

async function collectExistingCoverage(entries, histDir) {
  const fresh = new Set();
  const freshDates = new Map();
  let missing = 0;
  let stale = 0;
  let invalid = 0;

  const batchSize = 64;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const ticker = entry.symbol;
      let filePath = null;
      for (const candidate of histProbsReadCandidates(histDir, ticker)) {
        try {
          await fs.access(candidate);
          filePath = candidate;
          break;
        } catch {}
      }
      if (!filePath) {
        missing += 1;
        return;
      }
      const inspected = await inspectHistProbsOutput(filePath, ticker, entry.expected_date);
      if (inspected.status === 'fresh') {
        fresh.add(ticker);
        if (inspected.latest_date) freshDates.set(ticker, inspected.latest_date);
      }
      else if (inspected.status === 'stale') stale += 1;
      else invalid += 1;
    }));
  }

  return { fresh, freshDates, missing, stale, invalid };
}

async function writeNoDataManifest(entries, { mode, totalInput }, outputPath = NO_DATA_MANIFEST_PATH) {
  const payload = {
    schema: 'rv.hist_probs.no_data_tickers.v1',
    generated_at: new Date().toISOString(),
    mode,
    total_input_tickers: totalInput,
    excluded_count: entries.length,
    min_required_bars: MIN_REQUIRED_BARS,
      tickers: entries.map((entry) => ({
      symbol: entry.symbol,
      bars_count: entry.bars_count,
      expected_date: entry.expected_date,
      type_norm: entry.type_norm || null,
      canonical_ids: entry.canonical_ids || [],
    })),
  };
  const tmpPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
  try {
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, outputPath);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

async function writeSummaryAtomic(summary, summaryPath = path.join(HIST_PROBS_DIR, 'run-summary.json')) {
  const tmpPath = path.join(path.dirname(summaryPath), `.${path.basename(summaryPath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
  try {
    await fs.writeFile(tmpPath, JSON.stringify(summary, null, 2), 'utf8');
    await fs.rename(tmpPath, summaryPath);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
  return summaryPath;
}

if (isMainThread) {
  // Re-import after setting env
  const { computeRegime } = await import('./scripts/lib/hist-probs/compute-regime.mjs');
  const cli = parseCliArgs();

  async function runMain() {
    console.log('\n[Turbo-Hist] ─── Phase 2: Computing market regime (STOOQ DISABLED)...');
    const regime = await computeRegime();
    console.log(`[Turbo-Hist] Regime computed for date: ${regime?.date}`);
    const targetMarketDate = resolveTargetMarketDate(cli.targetMarketDate);
    const writeGlobalArtifacts = cli.writeRunSummary ?? (cli.explicitTickers.length === 0);

    console.log('\n[Turbo-Hist] ─── Loading required universe...');
    const universe = await loadRequiredUniverse();
    let universeEntries = universe.entries;
    let universeMode = universe.mode;
    if (cli.explicitTickers.length > 0) {
      const explicitSet = new Set(cli.explicitTickers);
      universeEntries = universe.entries.filter((entry) => explicitSet.has(entry.symbol));
      universeMode = 'explicit_tickers';
      const matched = new Set(universeEntries.map((entry) => entry.symbol));
      const missing = cli.explicitTickers.filter((ticker) => !matched.has(ticker));
      if (missing.length > 0) {
        console.warn(`[Turbo-Hist] Explicit ticker subset missing from required universe: ${missing.join(', ')}`);
      }
      if (universeEntries.length === 0) {
        throw new Error('[Turbo-Hist] No explicit tickers matched the required universe');
      }
    }
    const rssAtUniverseLoad = enforceRssBudget('universe_loaded');
    const checkpointStore = loadCheckpoints();
    const totalInputTickers = universeEntries.length;
    const lowBarEntries = universeEntries.filter((entry) => Number(entry.bars_count || 0) < MIN_REQUIRED_BARS);
    const retainedFreshLowBarDates = new Map();
    if (SKIP_EXISTING && lowBarEntries.length > 0) {
      await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
      const { fresh, freshDates } = await collectExistingCoverage(lowBarEntries, HIST_PROBS_DIR);
      for (const entry of lowBarEntries) {
        const ticker = entry.symbol;
        if (!fresh.has(ticker)) continue;
        const latestDate = freshDates.get(ticker) || entry.expected_date || null;
        retainedFreshLowBarDates.set(ticker, latestDate);
        setTickerState(checkpointStore, ticker, {
          status: 'fresh_skipped',
          latest_date: latestDate,
          canonical_id: entry.canonical_id || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
      }
    }
    const excludedNoData = lowBarEntries.filter((entry) => !retainedFreshLowBarDates.has(entry.symbol));
    const activeCandidates = universeEntries.filter((entry) => Number(entry.bars_count || 0) >= MIN_REQUIRED_BARS || retainedFreshLowBarDates.has(entry.symbol));
    const excludedInactive = activeCandidates.filter((entry) => {
      const lag = tradingDaysBetween(entry.expected_date, regime?.date);
      return lag != null && lag > INACTIVE_TOLERANCE_TRADING_DAYS;
    });
    for (const entry of excludedNoData) {
      setTickerState(checkpointStore, entry.symbol, {
        status: 'no_data',
        latest_date: entry.expected_date || null,
        canonical_id: entry.canonical_id || null,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
    }
    for (const entry of excludedInactive) {
      setTickerState(checkpointStore, entry.symbol, {
        status: 'inactive',
        latest_date: entry.expected_date || null,
        canonical_id: entry.canonical_id || null,
        ...CURRENT_VERSIONS,
        computed_at: new Date().toISOString(),
      });
    }
    const excludedInactiveSet = new Set(excludedInactive.map((entry) => entry.symbol));
    const requiredEntries = activeCandidates
      .filter((entry) => !excludedInactiveSet.has(entry.symbol))
      .map((entry) => ({
        ...entry,
        required_date: resolveRequiredDate({
          expectedDate: entry.expected_date,
          targetMarketDate,
          fallbackDate: regime?.date || null,
        }),
      }));
    if (writeGlobalArtifacts) {
      await writeNoDataManifest(excludedNoData, { mode: universeMode, totalInput: totalInputTickers });
    }
    let tickerList = requiredEntries.map((entry) => entry.symbol);
    const totalUniverse = requiredEntries.length;
    console.log(`[Turbo-Hist] Universe: ${totalUniverse} required tickers (${excludedNoData.length} excluded with <${MIN_REQUIRED_BARS} bars, ${excludedInactive.length} inactive >${INACTIVE_TOLERANCE_TRADING_DAYS}T, mode=${universeMode})`);

    // Skip tickers that already have output files (resume support)
    let skippedCount = 0;
    let invalidExistingCount = 0;
    let staleExistingCount = 0;
    let missingExistingCount = 0;
    let forcedRebuildCount = 0;
    const expectedDates = Object.fromEntries(requiredEntries.map((entry) => [entry.symbol, entry.required_date || null]));
    const entryOptionsByTicker = Object.fromEntries(requiredEntries.map((entry) => [entry.symbol, buildComputeOptions(entry)]));
    const requiredEntryByTicker = new Map(requiredEntries.map((entry) => [entry.symbol, entry]));
    // Skip tickers pre-reclassified as no_data via triage/apply pipeline
    const reclassifiedNoDataSet = new Set();
    for (const ticker of tickerList) {
      const cp = getTickerState(checkpointStore, ticker);
      if (cp?.status === 'no_data' && cp?.source === 'scripts/ops/apply-hist-probs-reclassifications.mjs') {
        reclassifiedNoDataSet.add(ticker);
        const entry = requiredEntryByTicker.get(ticker);
        if (entry) excludedNoData.push(entry);
      }
    }
    if (reclassifiedNoDataSet.size > 0) {
      tickerList = tickerList.filter((t) => !reclassifiedNoDataSet.has(t));
      console.log(`[Turbo-Hist] Triage-reclassified no_data: ${reclassifiedNoDataSet.size} skipped`);
    }
    if (SKIP_EXISTING) {
      await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
      const { fresh, freshDates, invalid, stale, missing } = await collectExistingCoverage(requiredEntries, HIST_PROBS_DIR);
      for (const entry of requiredEntries) {
        const ticker = entry.symbol;
        if (!fresh.has(ticker.toUpperCase())) continue;
        const rebuild = needsColdRebuild(checkpointStore, ticker, CURRENT_VERSIONS);
        if (rebuild.needsRebuild) {
          fresh.delete(ticker.toUpperCase());
          forcedRebuildCount += 1;
        }
      }
      const before = tickerList.length;
      for (const entry of requiredEntries) {
        const ticker = entry.symbol;
        if (!fresh.has(ticker.toUpperCase())) continue;
        setTickerState(checkpointStore, ticker, {
          status: 'fresh_skipped',
          latest_date: freshDates.get(ticker) || entry.required_date || entry.expected_date || null,
          canonical_id: entry.canonical_id || null,
          ...CURRENT_VERSIONS,
          computed_at: new Date().toISOString(),
        });
      }
      tickerList = tickerList.filter((ticker) => !fresh.has(ticker.toUpperCase()));
      skippedCount = before - tickerList.length;
      invalidExistingCount = invalid;
      staleExistingCount = stale;
      missingExistingCount = missing;
      console.log(`[Turbo-Hist] Skip-existing: ${skippedCount} fresh skipped, ${tickerList.length} remaining, ${staleExistingCount} stale, ${missingExistingCount} missing, ${invalidExistingCount} invalid, ${forcedRebuildCount} rebuild-forced`);
    }

    if (tickerList.length === 0) {
      console.log('[Turbo-Hist] All tickers already processed. Writing summary...');
    } else {
      console.log(`[Turbo-Hist] Phase 3: Processing ${tickerList.length} tickers with ${NUM_WORKERS} workers...`);
    }

    const numWorkers = Math.min(NUM_WORKERS, tickerList.length || 1);
    const chunkSize = Math.ceil(tickerList.length / numWorkers);
    const startTime = Date.now();
    let progressCovered = 0;
    let totalDone = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalNoData = 0;
    let totalInactiveDetected = 0;
    let hardFailures = 0;
    const errorSamples = [];
    const noDataSamples = [];
    const runtimeNoDataTickers = new Set();

    const workers = tickerList.length === 0 ? [] : Array.from({ length: numWorkers }).map((_, i) => {
      const chunk = tickerList.slice(i * chunkSize, (i + 1) * chunkSize);
      if (chunk.length === 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          workerData: {
            chunk,
            skipExisting: SKIP_EXISTING,
            histProbsDir: HIST_PROBS_DIR,
            expectedDates: Object.fromEntries(chunk.map((ticker) => [ticker, expectedDates[ticker] || null])),
            entryOptionsByTicker: Object.fromEntries(chunk.map((ticker) => [ticker, entryOptionsByTicker[ticker] || {}])),
          },
          resourceLimits: NODE_OLD_SPACE_LIMIT_MB
            ? { maxOldGenerationSizeMb: NODE_OLD_SPACE_LIMIT_MB }
            : undefined,
        });
        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            progressCovered += msg.count;
            if (progressCovered > 0 && progressCovered % 1000 === 0) {
              const elapsed = ((Date.now() - startTime)/1000).toFixed(0);
              const rate = (progressCovered / Math.max(1, elapsed)).toFixed(1);
              const remaining = tickerList.length - progressCovered;
              const eta = remaining > 0 ? Math.round(remaining / Math.max(0.1, parseFloat(rate))) : 0;
              console.log(`[Turbo-Hist] Progress: ${progressCovered + skippedCount}/${totalUniverse} done (${elapsed}s elapsed, ${rate} t/s, ETA ~${Math.ceil(eta/60)}min)`);
            }
          } else if (msg.type === 'summary') {
            totalDone += Number(msg.processed || 0);
            totalSkipped += Number(msg.skipped || 0);
          } else if (msg.type === 'ticker_processed') {
            setTickerState(checkpointStore, msg.ticker, {
              status: 'processed',
              latest_date: msg.latest_date || null,
              ...CURRENT_VERSIONS,
              computed_at: new Date().toISOString(),
            });
          } else if (msg.type === 'ticker_skipped') {
            setTickerState(checkpointStore, msg.ticker, {
              status: 'fresh_skipped',
              latest_date: msg.latest_date || null,
              ...CURRENT_VERSIONS,
              computed_at: new Date().toISOString(),
            });
          } else if (msg.type === 'ticker_error') {
            totalErrors += 1;
            appendError({
              ticker: msg.ticker,
              error: 'COMPUTE_ERROR',
              message: msg.message,
              run_id: regime?.date || null,
            });
            setTickerState(checkpointStore, msg.ticker, {
              status: 'error',
              latest_date: msg.latest_date || expectedDates[msg.ticker] || null,
              ...CURRENT_VERSIONS,
              computed_at: new Date().toISOString(),
            });
            if (errorSamples.length < 25) {
              errorSamples.push({ ticker: msg.ticker, message: msg.message });
            }
          } else if (msg.type === 'ticker_no_data') {
            totalNoData += 1;
            runtimeNoDataTickers.add(String(msg.ticker || '').toUpperCase());
            appendError({
              ticker: msg.ticker,
              error: 'NO_DATA',
              message: msg.message || 'NO_DATA',
              run_id: regime?.date || null,
              severity: 'warning',
            });
            setTickerState(checkpointStore, msg.ticker, {
              status: 'no_data',
              latest_date: expectedDates[msg.ticker] || null,
              ...CURRENT_VERSIONS,
              computed_at: new Date().toISOString(),
            });
            if (noDataSamples.length < 25) {
              noDataSamples.push({ ticker: msg.ticker, message: msg.message || 'NO_DATA' });
            }
          } else if (msg.type === 'ticker_inactive') {
            totalInactiveDetected += 1;
            setTickerState(checkpointStore, msg.ticker, {
              status: 'inactive',
              latest_date: msg.latest_date || null,
              ...CURRENT_VERSIONS,
              computed_at: new Date().toISOString(),
            });
          } else if (msg.type === 'worker_fatal') {
            hardFailures += 1;
          }
        });
        worker.on('error', (error) => {
          hardFailures += 1;
          reject(error);
        });
        worker.on('exit', (code) => {
          if (code !== 0) {
            hardFailures += 1;
            reject(new Error(`Worker ${i} exited with code ${code}`));
            return;
          }
          resolve();
        });
      });
    });

    try {
      await Promise.all(workers);
    } catch (error) {
      console.error('[Turbo-Hist] Worker failure:', error?.message || error);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const runtimeNoDataEntries = [...runtimeNoDataTickers]
      .map((ticker) => requiredEntryByTicker.get(ticker))
      .filter(Boolean);
    const mergedNoDataEntries = [...excludedNoData];
    const mergedNoDataTickers = new Set(mergedNoDataEntries.map((entry) => entry.symbol));
    for (const entry of runtimeNoDataEntries) {
      if (!mergedNoDataTickers.has(entry.symbol)) {
        mergedNoDataTickers.add(entry.symbol);
        mergedNoDataEntries.push(entry);
      }
    }
    if (writeGlobalArtifacts) {
      await writeNoDataManifest(mergedNoDataEntries, { mode: universeMode, totalInput: totalInputTickers });
    }
    const totalSkippedAll = skippedCount + totalSkipped;
    const effectiveTotal = Math.max(0, totalUniverse - runtimeNoDataEntries.length - totalInactiveDetected - reclassifiedNoDataSet.size);
    const tickersCovered = totalDone + totalSkippedAll;
    const tickersRemaining = Math.max(0, effectiveTotal - tickersCovered);
    console.log(`\n[Turbo-Hist] ─── Done in ${elapsed}s (${totalDone} newly computed, ${totalSkippedAll} skipped, ${totalErrors} errors, ${totalNoData} runtime no-data, ${tickersRemaining} remaining)`);

    // Final Summary to satisfy SSOT contract
    // asset_classes must be sorted ('ETF,STOCK') for isComplete() check
    let rssAtCompletion = null;
    try {
      rssAtCompletion = enforceRssBudget('workers_complete');
    } catch (error) {
      rssAtCompletion = measureRssMb();
      console.warn(`[Turbo-Hist] ${error?.message || error} (recorded as advisory after state persistence)`);
    }
    const summaryPayload = {
      schema_version: RUN_SCHEMA_VERSION,
      feature_core_version: FEATURE_CORE_VERSION,
      outcome_logic_version: OUTCOME_LOGIC_VERSION,
      ran_at: new Date().toISOString(),
      tickers_total: effectiveTotal,
      tickers_input_total: totalInputTickers,
      tickers_excluded_no_data: mergedNoDataEntries.length,
      tickers_excluded_inactive: excludedInactive.length + totalInactiveDetected,
      tickers_processed: totalDone,
      tickers_skipped: totalSkippedAll,
      tickers_errors: totalErrors,
      tickers_no_data: totalNoData,
      tickers_covered: tickersCovered,
      tickers_remaining: tickersRemaining,
      invalid_existing_files: invalidExistingCount,
      stale_existing_files: staleExistingCount,
      missing_existing_files: missingExistingCount,
      worker_hard_failures: hardFailures,
      skip_existing: SKIP_EXISTING,
      workers_requested: NUM_WORKERS,
      workers_cap_requested: WORKER_GATE.requestedWorkers,
      workers_cap_max_allowed: WORKER_GATE.maxAllowedWorkers,
      workers_used: numWorkers,
      worker_scaling_gate_state: WORKER_GATE.gateState,
      worker_scaling_gate_source: WORKER_GATE.source,
      worker_scaling_cap_applied: WORKER_GATE.capApplied,
      source_mode: universeMode,
      asset_classes: ['ETF', 'STOCK'],  // sorted: isComplete() checks 'ETF,STOCK'
      max_tickers: cli.explicitTickers.length > 0 ? cli.explicitTickers.length : 0,
      retry_mode: writeGlobalArtifacts !== true,
      requested_tickers: cli.explicitTickers.length > 0 ? cli.explicitTickers : null,
      regime_date: regime?.date ?? null,
      elapsed_seconds: parseFloat(elapsed),
      market_regime: regime?.market_regime ?? null,
      volatility_regime: regime?.volatility_regime ?? null,
      breadth_regime: regime?.breadth_regime ?? null,
      error_samples: errorSamples,
      no_data_samples: noDataSamples,
      local_only_mode: true,
      checkpoints_rebuild_forced: forcedRebuildCount,
      rss_budget_mb: HIST_PROBS_RSS_BUDGET_MB,
      rss_after_universe_load_mb: rssAtUniverseLoad,
      rss_at_completion_mb: rssAtCompletion,
    };
    saveCheckpoints(checkpointStore);
    cleanupLedger({ maxAgeDays: 7 });
    cleanupSnapshots({ maxAgeDays: 30 });
    const snapshot = buildStateSnapshot(checkpointStore, summaryPayload);
    writeStateSnapshot(snapshot);
    const summaryPath = await writeSummaryAtomic(summaryPayload, writeGlobalArtifacts ? path.join(HIST_PROBS_DIR, 'run-summary.json') : RETRY_SUMMARY_PATH);
    console.log('[Turbo-Hist] Summary written to', summaryPath);
    if (hardFailures > 0 || totalErrors > 0 || tickersRemaining > 0) {
      process.exit(1);
    }
  }
  runMain().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  // WORKER THREAD
  const { computeOutcomes, configureComputeOutcomesRuntime } = await import('./scripts/lib/hist-probs/compute-outcomes.mjs');
  configureComputeOutcomesRuntime({
    localBarStaleDays: 9999,
    allowRemoteBarFetch: false,
  });
  const { chunk, skipExisting, histProbsDir, expectedDates = {}, entryOptionsByTicker = {} } = workerData;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let noData = 0;
  let progressCount = 0;

  try {
    for (const ticker of chunk) {
      try {
        if (skipExisting) {
          let inspected = { status: 'invalid', latest_date: null };
          for (const candidate of histProbsReadCandidates(histProbsDir, ticker)) {
            inspected = await inspectHistProbsOutput(candidate, ticker, expectedDates[ticker] || null);
            if (inspected.status === 'fresh') break;
          }
          if (inspected.status === 'fresh') {
            skipped += 1;
            parentPort.postMessage({
              type: 'ticker_skipped',
              ticker,
              latest_date: inspected.latest_date || null,
            });
            progressCount += 1;
            if (progressCount % 10 === 0) parentPort.postMessage({ type: 'progress', count: 10 });
            continue;
          }
        }
        const result = await computeOutcomes(ticker, entryOptionsByTicker[ticker] || {});
        if (result) {
          const requiredDate = expectedDates[ticker] || null;
          const freshnessLag = tradingDaysBetween(result.latest_date, requiredDate);
          if (freshnessLag != null && freshnessLag > INACTIVE_TOLERANCE_TRADING_DAYS) {
            parentPort.postMessage({
              type: 'ticker_inactive',
              ticker,
              latest_date: result.latest_date || null,
            });
            progressCount += 1;
            if (progressCount % 10 === 0) {
              parentPort.postMessage({ type: 'progress', count: 10 });
            }
            continue;
          }
          if (requiredDate && result.latest_date && result.latest_date < requiredDate) {
            errors += 1;
            parentPort.postMessage({
              type: 'ticker_error',
              ticker,
              latest_date: result.latest_date || null,
              message: `STALE_AFTER_REBUILD:${result.latest_date}<${requiredDate}`,
            });
            progressCount += 1;
            if (progressCount % 10 === 0) {
              parentPort.postMessage({ type: 'progress', count: 10 });
            }
            continue;
          }
          processed += 1;
          parentPort.postMessage({
            type: 'ticker_processed',
            ticker,
            latest_date: result.latest_date || null,
          });
        } else {
          noData += 1;
          parentPort.postMessage({
            type: 'ticker_no_data',
            ticker,
            message: 'NO_DATA',
          });
        }
        progressCount += 1;
        if (progressCount % 10 === 0) {
          parentPort.postMessage({ type: 'progress', count: 10 });
        }
      } catch (error) {
        errors += 1;
        parentPort.postMessage({
          type: 'ticker_error',
          ticker,
          message: error?.message || String(error),
        });
      }
    }
    if (progressCount % 10 !== 0) {
      parentPort.postMessage({ type: 'progress', count: progressCount % 10 });
    }
    parentPort.postMessage({ type: 'summary', processed, skipped, errors, noData });
  } catch (error) {
    parentPort.postMessage({ type: 'worker_fatal', message: error?.message || String(error) });
    process.exit(1);
  }
}
