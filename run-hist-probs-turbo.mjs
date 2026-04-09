import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// Correct path found by find: scripts/lib/best-setups-local-loader.mjs
import { REPO_ROOT } from './scripts/lib/best-setups-local-loader.mjs';

const __filename = fileURLToPath(import.meta.url);
const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const US_EU_SCOPE_ROWS_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/ssot/stocks_etfs.us_eu.rows.json');
const NO_DATA_MANIFEST_PATH = path.join(HIST_PROBS_DIR, 'no-data-tickers.json');
const MIN_REQUIRED_BARS = 60;
const INACTIVE_TOLERANCE_TRADING_DAYS = 5;

// DISABLE STOOQ FOR TURBO RUNS to avoid hanging
process.env.LOCAL_BAR_STALE_DAYS = '9999';

// Configurable: number of worker threads (default 15, set lower for NAS)
const NUM_WORKERS = Number(process.env.HIST_PROBS_WORKERS || 15);

// Skip tickers that already have an output file (resume after crash/reboot)
const SKIP_EXISTING = process.env.HIST_PROBS_SKIP_EXISTING !== '0';

function normalizeDateId(value) {
  const normalized = String(value || '').slice(0, 10).trim();
  return normalized || null;
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
  const symbol = String(row?.symbol || '').trim().toUpperCase();
  if (!symbol) return;
  const current = map.get(symbol) || {
    symbol,
    expected_date: null,
    bars_count: 0,
    type_norm: null,
    canonical_ids: [],
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
        entries: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      };
    }
  } catch {}

  const gz = await fs.readFile(REGISTRY_PATH);
  const text = zlib.gunzipSync(gz).toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    try {
      const row = JSON.parse(raw);
      const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
      if (!['STOCK', 'ETF'].includes(typeNorm)) continue;
      mergeUniverseEntry(merged, row);
    } catch {}
  }
  return {
    mode: 'registry_asset_classes',
    entries: [...merged.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
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
  let missing = 0;
  let stale = 0;
  let invalid = 0;

  const batchSize = 64;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = entries.slice(index, index + batchSize);
    await Promise.all(batch.map(async (entry) => {
      const ticker = entry.symbol;
      const filePath = path.join(histDir, `${ticker}.json`);
      try {
        await fs.access(filePath);
      } catch {
        missing += 1;
        return;
      }
      const inspected = await inspectHistProbsOutput(filePath, ticker, entry.expected_date);
      if (inspected.status === 'fresh') fresh.add(ticker);
      else if (inspected.status === 'stale') stale += 1;
      else invalid += 1;
    }));
  }

  return { fresh, missing, stale, invalid };
}

async function writeNoDataManifest(entries, { mode, totalInput }) {
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
  const tmpPath = `${NO_DATA_MANIFEST_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
  try {
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, NO_DATA_MANIFEST_PATH);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
}

async function writeSummaryAtomic(summary) {
  const summaryPath = path.join(HIST_PROBS_DIR, 'run-summary.json');
  const tmpPath = path.join(HIST_PROBS_DIR, `.run-summary.${process.pid}.${Date.now()}.tmp`);
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

  async function runMain() {
    console.log('\n[Turbo-Hist] ─── Phase 2: Computing market regime (STOOQ DISABLED)...');
    const regime = await computeRegime();
    console.log(`[Turbo-Hist] Regime computed for date: ${regime?.date}`);

    console.log('\n[Turbo-Hist] ─── Loading required universe...');
    const universe = await loadRequiredUniverse();
    const totalInputTickers = universe.entries.length;
    const excludedNoData = universe.entries.filter((entry) => Number(entry.bars_count || 0) < MIN_REQUIRED_BARS);
    const activeCandidates = universe.entries.filter((entry) => Number(entry.bars_count || 0) >= MIN_REQUIRED_BARS);
    const excludedInactive = activeCandidates.filter((entry) => {
      const lag = tradingDaysBetween(entry.expected_date, regime?.date);
      return lag != null && lag > INACTIVE_TOLERANCE_TRADING_DAYS;
    });
    const excludedInactiveSet = new Set(excludedInactive.map((entry) => entry.symbol));
    const requiredEntries = activeCandidates.filter((entry) => !excludedInactiveSet.has(entry.symbol));
    await writeNoDataManifest(excludedNoData, { mode: universe.mode, totalInput: totalInputTickers });
    let tickerList = requiredEntries.map((entry) => entry.symbol);
    const totalUniverse = requiredEntries.length;
    console.log(`[Turbo-Hist] Universe: ${totalUniverse} required tickers (${excludedNoData.length} excluded with <${MIN_REQUIRED_BARS} bars, ${excludedInactive.length} inactive >${INACTIVE_TOLERANCE_TRADING_DAYS}T, mode=${universe.mode})`);

    // Skip tickers that already have output files (resume support)
    let skippedCount = 0;
    let invalidExistingCount = 0;
    let staleExistingCount = 0;
    let missingExistingCount = 0;
    const expectedDates = Object.fromEntries(requiredEntries.map((entry) => [entry.symbol, entry.expected_date || null]));
    const requiredEntryByTicker = new Map(requiredEntries.map((entry) => [entry.symbol, entry]));
    if (SKIP_EXISTING) {
      await fs.mkdir(HIST_PROBS_DIR, { recursive: true });
      const { fresh, invalid, stale, missing } = await collectExistingCoverage(requiredEntries, HIST_PROBS_DIR);
      const before = tickerList.length;
      tickerList = tickerList.filter((ticker) => !fresh.has(ticker.toUpperCase()));
      skippedCount = before - tickerList.length;
      invalidExistingCount = invalid;
      staleExistingCount = stale;
      missingExistingCount = missing;
      console.log(`[Turbo-Hist] Skip-existing: ${skippedCount} fresh skipped, ${tickerList.length} remaining, ${staleExistingCount} stale, ${missingExistingCount} missing, ${invalidExistingCount} invalid`);
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
          },
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
          } else if (msg.type === 'ticker_error') {
            totalErrors += 1;
            if (errorSamples.length < 25) {
              errorSamples.push({ ticker: msg.ticker, message: msg.message });
            }
          } else if (msg.type === 'ticker_no_data') {
            totalNoData += 1;
            runtimeNoDataTickers.add(String(msg.ticker || '').toUpperCase());
            if (noDataSamples.length < 25) {
              noDataSamples.push({ ticker: msg.ticker, message: msg.message || 'NO_DATA' });
            }
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
    await writeNoDataManifest(mergedNoDataEntries, { mode: universe.mode, totalInput: totalInputTickers });
    const totalSkippedAll = skippedCount + totalSkipped;
    const effectiveTotal = Math.max(0, totalUniverse - runtimeNoDataEntries.length);
    const tickersCovered = totalDone + totalSkippedAll;
    const tickersRemaining = Math.max(0, effectiveTotal - tickersCovered);
    console.log(`\n[Turbo-Hist] ─── Done in ${elapsed}s (${totalDone} newly computed, ${totalSkippedAll} skipped, ${totalErrors} errors, ${totalNoData} runtime no-data, ${tickersRemaining} remaining)`);

    // Final Summary to satisfy SSOT contract
    // asset_classes must be sorted ('ETF,STOCK') for isComplete() check
    const summaryPath = await writeSummaryAtomic({
      ran_at: new Date().toISOString(),
      tickers_total: effectiveTotal,
      tickers_input_total: totalInputTickers,
      tickers_excluded_no_data: mergedNoDataEntries.length,
      tickers_excluded_inactive: excludedInactive.length,
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
      workers_used: numWorkers,
      source_mode: universe.mode,
      asset_classes: ['ETF', 'STOCK'],  // sorted: isComplete() checks 'ETF,STOCK'
      max_tickers: 0,
      regime_date: regime?.date ?? null,
      elapsed_seconds: parseFloat(elapsed),
      market_regime: regime?.market_regime ?? null,
      volatility_regime: regime?.volatility_regime ?? null,
      breadth_regime: regime?.breadth_regime ?? null,
      error_samples: errorSamples,
      no_data_samples: noDataSamples,
    });
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
  process.env.LOCAL_BAR_STALE_DAYS = '9999';
  const { computeOutcomes } = await import('./scripts/lib/hist-probs/compute-outcomes.mjs');
  const { chunk, skipExisting, histProbsDir, expectedDates = {} } = workerData;
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let noData = 0;
  let progressCount = 0;

  try {
    for (const ticker of chunk) {
      try {
        if (skipExisting) {
          const outPath = path.join(histProbsDir, `${ticker.toUpperCase()}.json`);
          const inspected = await inspectHistProbsOutput(outPath, ticker, expectedDates[ticker] || null);
          if (inspected.status === 'fresh') {
            skipped += 1;
            progressCount += 1;
            if (progressCount % 10 === 0) parentPort.postMessage({ type: 'progress', count: 10 });
            continue;
          }
        }
        const result = await computeOutcomes(ticker);
        if (result) {
          processed += 1;
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
