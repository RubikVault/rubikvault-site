/**
 * BREAKOUT-SCANNER ALL-ASSETS — Batch Runner
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import yaml from 'yaml';

import { processTickerSeries, calculateSma } from './core.mjs';

const REPO_ROOT = '/Users/michaelpuchowezki/Dev/rubikvault-site';
const CONFIG_PATH = path.join(REPO_ROOT, 'config/runblock/breakout_config.yaml');
const DATA_DIR = path.join(REPO_ROOT, 'public/data/v3/series/adjusted_all');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/snapshots/breakout-all.json');
const PUBLIC_BREAKOUT_ROOT = path.join(REPO_ROOT, 'public/data/breakout');

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadBreakoutV13Map() {
  const latest = readJsonIfExists(path.join(PUBLIC_BREAKOUT_ROOT, 'manifests/latest.json'));
  if (!latest?.files?.top500) return new Map();
  const top500 = readJsonIfExists(path.join(PUBLIC_BREAKOUT_ROOT, latest.files.top500));
  const items = Array.isArray(top500?.items) ? top500.items : [];
  const out = new Map();
  for (const item of items) {
    const keys = [item.asset_id, item.symbol].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean);
    for (const key of keys) out.set(key, item);
  }
  return out;
}

function scoreFromBreakoutItem(item, fallback = 0) {
  const score = Number(item?.scores?.final_signal_score);
  return Number.isFinite(score) ? Math.round(score * 100) : fallback;
}

/**
 * Read ndjson.gz file and return array of bars
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
    } catch (e) {}
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

async function deriveRegime() {
  const proxyPath = path.join(DATA_DIR, 'US__AAPL.ndjson.gz');
  if (!fs.existsSync(proxyPath)) return { regime_tag: 'UP' };

  const bars = await readCompressedBars(proxyPath);
  if (bars.length < 200) return { regime_tag: 'UP' };

  const smas = calculateSma(bars, 200);
  const latestIndex = bars.length - 1;
  const latestClose = bars[latestIndex].close;
  const sma200 = smas[latestIndex];
  const return20d = latestIndex >= 20 ? (latestClose - bars[latestIndex - 20].close) / bars[latestIndex - 20].close : 0;

  let regime = 'NEUTRAL';
  if (latestClose > sma200 && return20d > 0) regime = 'UP';
  if (latestClose < sma200 && return20d < 0) regime = 'DOWN';

  return { regime_tag: regime, ticker: 'AAPL', close: latestClose, sma200 };
}

async function main() {
  console.log('--- Breakout Scanner All-Assets Runner V1.0 ---');

  const configText = fs.readFileSync(CONFIG_PATH, 'utf8');
  const config = yaml.parse(configText);
  const regime = await deriveRegime();
  const breakoutV13ByAsset = loadBreakoutV13Map();

  if (!fs.existsSync(DATA_DIR)) {
      console.log(`DATA_DIR ${DATA_DIR} does not exist.`);
      return;
  }

  let files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.ndjson.gz'));
  if (process.env.LIMIT) {
      const lim = Number(process.env.LIMIT);
      files = files.slice(0, lim);
      console.log(`--- LIMIT ACTIVE: Processing only first ${lim} files ---`);
  }
  console.log(`Found ${files.length} tickers with history in ${DATA_DIR}.`);

  const results = [];
  let count = 0;

  for (const file of files) {
    const ticker = file.replace('.ndjson.gz', '').replace('__', ':');
    const filePath = path.join(DATA_DIR, file);

    try {
      const bars = await readCompressedBars(filePath);
      if (bars.length < 50) continue;

      const stats = processTickerSeries(bars, config, regime);
      const lastHist = stats.history[stats.history.length - 1] || {};
      const lookupTicker = ticker.toUpperCase();
      const v13 = breakoutV13ByAsset.get(lookupTicker) || breakoutV13ByAsset.get(lookupTicker.replace('.', ':')) || null;
      
      results.push({
        ticker: ticker,
        name: ticker,
        state: v13?.legacy_state || stats.state,
        legacy_state: v13?.legacy_state || stats.state,
        breakout_status: v13?.breakout_status || v13?.status || null,
        support_zone: v13?.support_zone || null,
        invalidation: v13?.invalidation || null,
        status_explanation: v13?.status_explanation || null,
        max_level: stats.max_level,
        latest_close: bars[bars.length - 1].close,
        state_age: lastHist.age || 0,
        is_suppressed: !!lastHist.is_suppressed,
        total_score: scoreFromBreakoutItem(v13, lastHist.total_score || 0),
        scores: v13?.scores || null,
        absorption_score: lastHist.absorption_score_raw || 0,
        rvol20: lastHist.rvol20 || 1.0,
        has_data: true
      });
    } catch (e) {
      results.push({ ticker: ticker, name: ticker, state: "ERROR", has_data: true, total_score: 0 });
    }

    count++;
    if (count % 100 === 0) console.log(`Processed ${count} / ${files.length}...`);
  }

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
