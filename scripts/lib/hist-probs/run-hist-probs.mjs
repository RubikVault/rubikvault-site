/**
 * run-hist-probs.mjs
 * Phase 4: Historical Probabilities Layer — Daily Runner
 *
 * Orchestrates the full pipeline:
 *   1. compute-regime.mjs  (market regime for today)
 *   2. compute-outcomes.mjs (historical outcomes per ticker)
 *
 * Usage:
 *   node scripts/lib/hist-probs/run-hist-probs.mjs
 *   node scripts/lib/hist-probs/run-hist-probs.mjs --tickers AAPL,MSFT,NVDA
 *   node scripts/lib/hist-probs/run-hist-probs.mjs --ticker AAPL
 *   node scripts/lib/hist-probs/run-hist-probs.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --asset-classes STOCK,ETF --max-tickers 0
 *
 * NON-DISRUPTIVE: runs after existing daily QuantLab cycle, never modifies it.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { REPO_ROOT } from '../best-setups-local-loader.mjs';
import { computeRegime } from './compute-regime.mjs';
import { computeOutcomes } from './compute-outcomes.mjs';

const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');

// Default universe: reads from existing stock symbols file
const STOCK_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const MAX_TICKERS_PER_RUN = 500; // safety limit to avoid infinite runs

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
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
    return limitTickers(symbols.map(normalizeTicker).filter(Boolean), maxTickers);
  } catch {
    console.warn('[run-hist-probs] Could not load default symbols, using built-in sample');
    return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ', 'IWM'];
  }
}

async function loadTickersFromRegistry(registryPath, assetClasses, maxTickers) {
  const gz = await fs.readFile(registryPath);
  const text = zlib.gunzipSync(gz).toString('utf8');
  const allowed = new Set((assetClasses || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean));
  const tickers = new Set();
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    try {
      const row = JSON.parse(raw);
      const typeNorm = String(row?.type_norm || '').trim().toUpperCase();
      if (allowed.size && !allowed.has(typeNorm)) continue;
      const ticker = normalizeTicker(row?.symbol);
      if (ticker) tickers.add(ticker);
    } catch {
      continue;
    }
  }
  return limitTickers([...tickers], maxTickers);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const tickerArg = args.find(a => a.startsWith('--ticker='))?.split('=')[1]
    || (args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null);
  const tickersArg = args.find(a => a.startsWith('--tickers='))?.split('=')[1]
    || (args.includes('--tickers') ? args[args.indexOf('--tickers') + 1] : null);
  const symbolsPathArg = args.find(a => a.startsWith('--symbols-path='))?.split('=')[1]
    || (args.includes('--symbols-path') ? args[args.indexOf('--symbols-path') + 1] : null);
  const registryPathArg = args.find(a => a.startsWith('--registry-path='))?.split('=')[1]
    || (args.includes('--registry-path') ? args[args.indexOf('--registry-path') + 1] : null);
  const assetClassesArg = args.find(a => a.startsWith('--asset-classes='))?.split('=')[1]
    || (args.includes('--asset-classes') ? args[args.indexOf('--asset-classes') + 1] : null);
  const maxTickersArg = args.find(a => a.startsWith('--max-tickers='))?.split('=')[1]
    || (args.includes('--max-tickers') ? args[args.indexOf('--max-tickers') + 1] : null);
  return {
    singleTicker: tickerArg ? normalizeTicker(tickerArg) : null,
    tickers: tickersArg ? tickersArg.split(',').map(normalizeTicker).filter(Boolean) : null,
    symbolsPath: symbolsPathArg ? path.resolve(REPO_ROOT, symbolsPathArg) : STOCK_SYMBOLS_PATH,
    registryPath: registryPathArg ? path.resolve(REPO_ROOT, registryPathArg) : REGISTRY_PATH,
    assetClasses: assetClassesArg ? assetClassesArg.split(',').map(v => String(v || '').trim().toUpperCase()).filter(Boolean) : null,
    maxTickers: Number.isFinite(Number(maxTickersArg)) ? Number(maxTickersArg) : MAX_TICKERS_PER_RUN,
  };
}

async function run() {
  const { singleTicker, tickers, symbolsPath, registryPath, assetClasses, maxTickers } = parseArgs();
  await fs.mkdir(HIST_PROBS_DIR, { recursive: true });

  // Step 1: Regime
  console.log('\n[run-hist-probs] ─── Phase 2: Computing market regime...');
  const regime = await computeRegime();
  if (regime) {
    console.log(`[run-hist-probs] Regime: market=${regime.market_regime}, vol=${regime.volatility_regime}, breadth=${regime.breadth_regime} (${regime.breadth_above_ma50_pct}%)`);
  }

  // Step 2: Determine tickers to process
  let tickerList;
  if (singleTicker) {
    tickerList = [singleTicker];
  } else if (tickers?.length) {
    tickerList = tickers;
  } else if (assetClasses?.length) {
    console.log('\n[run-hist-probs] ─── Loading registry-backed universe...');
    tickerList = await loadTickersFromRegistry(registryPath, assetClasses, maxTickers);
  } else {
    console.log('\n[run-hist-probs] ─── Loading symbol universe...');
    tickerList = await loadTickersFromSymbolsPath(symbolsPath, maxTickers);
  }

  console.log(`\n[run-hist-probs] ─── Phase 3: Computing outcomes for ${tickerList.length} tickers...`);
  let done = 0, skipped = 0, errors = 0;
  const startTime = Date.now();

  for (const ticker of tickerList) {
    try {
      const result = await computeOutcomes(ticker);
      if (result) {
        const eventCount = Object.keys(result.events).length;
        done++;
        if (done % 50 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log(`[run-hist-probs] Progress: ${done}/${tickerList.length} done (${elapsed}s elapsed)`);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.warn(`[run-hist-probs] Error for ${ticker}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[run-hist-probs] ─── Done in ${elapsed}s`);
  console.log(`  Processed: ${done}, Skipped (insufficient data): ${skipped}, Errors: ${errors}`);

  // Write a run-summary
  const summaryPath = path.join(HIST_PROBS_DIR, 'run-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    ran_at: new Date().toISOString(),
    tickers_total: tickerList.length,
    tickers_processed: done,
    tickers_skipped: skipped,
    tickers_errors: errors,
    source_mode: singleTicker ? 'single_ticker' : tickers?.length ? 'explicit_tickers' : assetClasses?.length ? 'registry_asset_classes' : 'symbols_path',
    symbols_path: assetClasses?.length ? null : symbolsPath,
    registry_path: assetClasses?.length ? registryPath : null,
    asset_classes: assetClasses?.length ? assetClasses : ['STOCK'],
    max_tickers: maxTickers,
    elapsed_seconds: parseFloat(elapsed),
    regime_date: regime?.date ?? null,
    market_regime: regime?.market_regime ?? null,
    volatility_regime: regime?.volatility_regime ?? null,
    breadth_regime: regime?.breadth_regime ?? null,
  }, null, 2), 'utf8');
  console.log('[run-hist-probs] Summary written to', summaryPath);
}

run().catch(err => {
  console.error('[run-hist-probs] Fatal error:', err);
  process.exit(1);
});
