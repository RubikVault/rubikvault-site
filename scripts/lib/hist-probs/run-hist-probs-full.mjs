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
 *
 * NON-DISRUPTIVE: runs after existing daily QuantLab cycle, never modifies it.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT } from '../best-setups-local-loader.mjs';
import { computeRegime } from './compute-regime.mjs';
import { computeOutcomes } from './compute-outcomes.mjs';

const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');

// Default universe: reads from existing stock symbols file
const STOCK_SYMBOLS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const MAX_TICKERS_PER_RUN = 60000; // safety limit to avoid infinite runs

async function loadDefaultTickers() {
  try {
    const doc = JSON.parse(await fs.readFile(STOCK_SYMBOLS_PATH, 'utf8'));
    const symbols = Array.isArray(doc?.symbols) ? doc.symbols : [];
    return symbols
      .map(s => String(s || '').trim().toUpperCase())
      .filter(Boolean)
      .slice(0, MAX_TICKERS_PER_RUN);
  } catch {
    console.warn('[run-hist-probs] Could not load default symbols, using built-in sample');
    return ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ', 'IWM'];
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const tickerArg = args.find(a => a.startsWith('--ticker='))?.split('=')[1]
    || (args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null);
  const tickersArg = args.find(a => a.startsWith('--tickers='))?.split('=')[1]
    || (args.includes('--tickers') ? args[args.indexOf('--tickers') + 1] : null);
  return {
    singleTicker: tickerArg ? tickerArg.toUpperCase() : null,
    tickers: tickersArg ? tickersArg.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : null,
  };
}

async function run() {
  const { singleTicker, tickers } = parseArgs();
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
  } else {
    console.log('\n[run-hist-probs] ─── Loading symbol universe...');
    tickerList = await loadDefaultTickers();
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
