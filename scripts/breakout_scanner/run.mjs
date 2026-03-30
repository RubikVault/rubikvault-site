/**
 * BREAKOUT-SCANNER v1.0 — Batch Runner
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import yaml from 'yaml';

import { processTickerSeries, calculateSma } from './core.mjs';

const REPO_ROOT = '/Users/michaelpuchowezki/Dev/rubikvault-site';
const CONFIG_PATH = path.join(REPO_ROOT, 'config/runblock/breakout_config.yaml');
const DATA_DIR = path.join(REPO_ROOT, 'public/data/v3/series/adjusted');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/snapshots/breakout-test.json');

/**
 * Read ndjson.gz file and return array of bars
 * [{ date, open, high, low, close, volume }]
 */
async function readCompressedBars(filePath) {
  const bars = [];
  const fileStream = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      bars.push({
        date: parsed.trading_date || parsed.date,
        open: Number(parsed.open || 0),
        high: Number(parsed.high || 0),
        low: Number(parsed.low || 0),
        close: Number(parsed.close || parsed.adj_close || 0),
        volume: Number(parsed.volume || 0)
      });
    } catch (e) {
      // ignore parse error on corrupt line
    }
  }
  // Sort by date ascending just in case
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate Regime (UP, NEUTRAL, DOWN) based on primary asset (e.g. AAPL)
 */
async function deriveRegime(config) {
  const proxyPath = path.join(DATA_DIR, 'US__AAPL.ndjson.gz');
  if (!fs.existsSync(proxyPath)) {
    return { regime_tag: 'UP' }; // Fallback
  }

  const bars = await readCompressedBars(proxyPath);
  if (bars.length < 200) return { regime_tag: 'UP' };

  const smas = calculateSma(bars, 200);
  const latestIndex = bars.length - 1;
  const latestClose = bars[latestIndex].close;
  const sma200 = smas[latestIndex];
  
  const return20d = latestIndex >= 20 
    ? (latestClose - bars[latestIndex - 20].close) / bars[latestIndex - 20].close 
    : 0;

  let regime = 'NEUTRAL';
  if (latestClose > sma200 && return20d > 0) regime = 'UP';
  if (latestClose < sma200 && return20d < 0) regime = 'DOWN';

  console.log(`[Regime] Derived from AAPL: Close=${latestClose.toFixed(2)}, SMA200=${sma200.toFixed(2)}, 20dRet=${(return20d*100).toFixed(1)}% -> ${regime}`);
  return { regime_tag: regime, ticker: 'AAPL', close: latestClose, sma200 };
}

async function main() {
  console.log('--- Breakout Scanner Runner V1.0 ---');

  // 1. Load Config
  const configText = fs.readFileSync(CONFIG_PATH, 'utf8');
  const config = yaml.parse(configText);

  // 2. Derive Market Regime
  const regime = await deriveRegime(config);

  // 3. Load full index from QuantLab Report
  const reportPath = path.join(REPO_ROOT, 'public/data/quantlab/reports/v4-daily-market.json');
  let searchIndex = [];
  if (fs.existsSync(reportPath)) {
    console.log(`Loading search index from ${reportPath}...`);
    const reportStr = fs.readFileSync(reportPath, 'utf8');
    const report = JSON.parse(reportStr);
    searchIndex = report.searchIndex || [];
  } else {
    console.log(`Report not found, using files only.`);
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.ndjson.gz'));
  console.log(`Found ${files.length} tickers with history, ${searchIndex.length} in index.`);

  const results = [];
  let count = 0;

  // Track processed file tickers so we can append missing index files
  const processedTickers = new Set();

  for (const item of searchIndex) {
    const symbol = item.symbol;
    // Format to match filename ticker US__XYZ.ndjson.gz
    // Standard format for US in this repo seems to be US__{ticker}
    // and if symbol has ^ or other, it's index
    const candidateFile = `US__${symbol}.ndjson.gz`;
    const filePath = path.join(DATA_DIR, candidateFile);

    processedTickers.add(symbol);

    if (fs.existsSync(filePath)) {
      try {
        const bars = await readCompressedBars(filePath);
        if (bars.length < 50) continue;

        const processing = processTickerSeries(bars, config, regime);
        const lastHist = processing.history[processing.history.length - 1] || {};
        
        results.push({
          ticker: symbol,
          name: item.name || symbol,
          state: processing.state,
          max_level: processing.max_level,
          latest_close: bars[bars.length - 1].close,
          state_age: lastHist.age || 0,
          is_suppressed: !!lastHist.is_suppressed,
          has_data: true
        });

      } catch (e) {
        results.push({ ticker: symbol, name: item.name, state: "ERROR", has_data: true });
      }
    } else {
      // For items with NO history on disk, we just add them as "NONE" or "NO_DATA"
      results.push({
        ticker: symbol,
        name: item.name || symbol,
        state: "NO_DATA",
        max_level: 0,
        latest_close: 0,
        state_age: 0,
        has_data: false
      });
    }

    count++;
    if (count % 1000 === 0) console.log(`Processed ${count} / ${searchIndex.length}...`);
  }

  // 4. Append files that weren't in searchIndex
  for (const file of files) {
    const ticker = file.replace('US__', '').replace('.ndjson.gz', '');
    if (!processedTickers.has(ticker)) {
      try {
        const bars = await readCompressedBars(path.join(DATA_DIR, file));
        if (bars.length < 50) continue;
        const processing = processTickerSeries(bars, config, regime);
        const lastHist = processing.history[processing.history.length - 1] || {};
        
        results.push({
          ticker: ticker,
          name: ticker,
          state: processing.state,
          max_level: processing.max_level,
          latest_close: bars[bars.length - 1].close,
          state_age: lastHist.age || 0,
          is_suppressed: !!lastHist.is_suppressed,
          has_data: true
        });
      } catch (e) {}
    }
  }

  // 5. Save Snapshot
  const payload = {
    generated_at: new Date().toISOString(),
    regime,
    statistics: {
      total: results.length,
      setup: results.filter(r => r.state === 'SETUP').length,
      armed: results.filter(r => r.state === 'ARMED').length,
      triggered: results.filter(r => r.state === 'TRIGGERED').length,
      confirmed: results.filter(r => r.state === 'CONFIRMED').length,
    },
    items: results
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Snapshot saved to ${OUTPUT_PATH}`);
}

main().catch(console.error);
