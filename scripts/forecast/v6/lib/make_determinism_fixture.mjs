#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { resolveTradingDate } from './trading_date.mjs';
import { hashFile, sha256Json } from './hashing.mjs';
import { readJson, writeJsonAtomic, ensureDir } from './io.mjs';

function parseArgs(argv) {
  const out = { date: null, symbols: 50 };
  for (const arg of argv) {
    if (arg.startsWith('--date=')) out.date = arg.split('=')[1];
    if (arg.startsWith('--symbols=')) out.symbols = Number(arg.split('=')[1]);
  }
  return out;
}

function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function parseUniverse(doc) {
  if (Array.isArray(doc)) return doc.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  if (Array.isArray(doc?.tickers)) return doc.tickers.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc?.symbols)) return doc.symbols.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc?.data)) return doc.data.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  return [];
}

function loadBars(repoRoot, symbol, asofDate) {
  const p = path.join(repoRoot, 'public/data/eod/bars', `${symbol}.json`);
  if (!fs.existsSync(p)) return [];
  const rows = readJson(p, []);
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r?.date && r.date <= asofDate).sort((a, b) => a.date.localeCompare(b.date));
}

function generateFixturePredictions({ asofDate, symbols, barsBySymbol }) {
  const rows = [];
  const horizons = [10, 20];

  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol] || [];
    if (bars.length < 40) continue;
    const c0 = Number(bars[bars.length - 1]?.close || 0);
    const c5 = Number(bars[Math.max(0, bars.length - 6)]?.close || c0 || 1);
    const c20 = Number(bars[Math.max(0, bars.length - 21)]?.close || c5 || 1);
    const mom5 = c5 > 0 ? Math.log(c0 / c5) : 0;
    const mom20 = c20 > 0 ? Math.log(c0 / c20) : 0;

    for (const horizon of horizons) {
      const score = horizon === 20 ? mom20 * 1.2 + mom5 * 0.3 : mom5 * 1.1 + mom20 * 0.2;
      const pUp = Math.max(0.001, Math.min(0.999, 1 / (1 + Math.exp(-score * 8))));
      const soft = {
        BULL: pUp,
        BEAR: 1 - pUp,
        NEUTRAL: 0.15
      };
      const sum = soft.BULL + soft.BEAR + soft.NEUTRAL;
      soft.BULL /= sum;
      soft.BEAR /= sum;
      soft.NEUTRAL /= sum;

      const logged = soft.BULL >= soft.BEAR ? 'BULL' : 'BEAR';
      const core = {
        symbol,
        asof_date: asofDate,
        horizon_days: horizon,
        mode: 'CI',
        model_id: 'fixture-v6-model',
        bars_manifest_hash: 'sha256:fixture',
        score,
        p_up: pUp,
        logged_expert: logged,
        soft_weights: soft,
        confidence: Math.max(soft.BULL, soft.BEAR, soft.NEUTRAL),
        policy_hashes: {},
        input_hashes: {
          features_hash: sha256Json({ symbol, horizon, mom5, mom20 }),
          market_proxy_hash: sha256Json({ symbol: 'SPY', asofDate }),
          weights_hash: sha256Json({ fixture: true })
        },
        is_control: false,
        y_true: mom5 > 0 ? 1 : 0
      };

      rows.push({
        prediction_id: sha256Json(core),
        schema: 'forecast_prediction_v6_row',
        ...core
      });
    }
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.horizon_days - b.horizon_days);
  return rows;
}

function copyPolicies(repoRoot, fixtureRoot) {
  const src = path.join(repoRoot, 'policies/forecast/v6');
  const dst = path.join(fixtureRoot, 'policies/forecast/v6');
  ensureDir(dst);
  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith('.json')) continue;
    fs.copyFileSync(path.join(src, name), path.join(dst, name));
  }
}

function copyCalendar(repoRoot, fixtureRoot) {
  const src = path.join(repoRoot, 'scripts/forecast/v6/lib/calendar/nyse_holidays.json');
  const dst = path.join(fixtureRoot, 'scripts/forecast/v6/lib/calendar/nyse_holidays.json');
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();

  const trading = resolveTradingDate({
    repoRoot,
    requestedDate: args.date,
    timestamp: new Date(),
    timeZone: 'America/New_York',
    calendarRelPath: 'scripts/forecast/v6/lib/calendar/nyse_holidays.json'
  });

  const asofDate = trading.asof_date;
  const fixtureRoot = path.join(repoRoot, 'tests/forecast/v6/determinism/fixtures', asofDate);
  ensureDir(fixtureRoot);

  const universeDoc = readJson(path.join(repoRoot, 'public/data/universe/all.json'), []);
  const universe = parseUniverse(universeDoc);

  const required = ['SPY', 'QQQ'];
  const base = universe.slice(0, Math.max(5, args.symbols)).map(normalizeSymbol);
  const selected = [...new Set([...required, ...base])].filter(Boolean);

  const barsDir = path.join(fixtureRoot, 'bars');
  ensureDir(barsDir);

  const barsBySymbol = {};
  const partitions = [];
  const hashes = {};

  for (const symbol of selected) {
    const bars = loadBars(repoRoot, symbol, asofDate);
    if (bars.length < 40) continue;
    const outPath = path.join(barsDir, `${symbol}.json`);
    writeJsonAtomic(outPath, bars);
    const rel = path.relative(fixtureRoot, outPath).replace(/\\/g, '/');
    partitions.push(rel);
    hashes[rel] = hashFile(outPath);
    barsBySymbol[symbol] = bars;
  }

  const finalSymbols = Object.keys(barsBySymbol).sort();
  ensureDir(path.join(fixtureRoot, 'universe'));
  writeJsonAtomic(path.join(fixtureRoot, 'universe/all.json'), finalSymbols.map((symbol) => ({ symbol })));

  const barsManifestCore = {
    asof_date: asofDate,
    provider: process.env.FORECAST_PROVIDER || 'EODHD',
    provider_revision: sha256Json({ fixture: true, asofDate, partitions: partitions.sort() }),
    partitions: partitions.sort(),
    hashes
  };

  const barsManifest = {
    ...barsManifestCore,
    bars_manifest_hash: sha256Json(barsManifestCore)
  };

  ensureDir(path.join(fixtureRoot, 'bars_manifest'));
  writeJsonAtomic(path.join(fixtureRoot, 'bars_manifest', `${asofDate}.json`), barsManifest);
  writeJsonAtomic(path.join(fixtureRoot, 'bars_manifest/latest.json'), barsManifest);

  const predictions = generateFixturePredictions({
    asofDate,
    symbols: finalSymbols,
    barsBySymbol
  });
  ensureDir(path.join(fixtureRoot, 'predictions'));
  const predPath = path.join(fixtureRoot, 'predictions', `${asofDate}.ndjson`);
  fs.writeFileSync(predPath, predictions.map((row) => JSON.stringify(row)).join('\n') + '\n');

  copyPolicies(repoRoot, fixtureRoot);
  copyCalendar(repoRoot, fixtureRoot);

  writeJsonAtomic(path.join(fixtureRoot, 'fixture_manifest.json'), {
    schema: 'forecast_v6_determinism_fixture_v1',
    asof_date: asofDate,
    symbols: finalSymbols,
    bars_manifest_hash: barsManifest.bars_manifest_hash,
    prediction_rows: predictions.length,
    generated_at: new Date().toISOString()
  });

  console.log(JSON.stringify({
    ok: true,
    asof_date: asofDate,
    fixture_root: path.relative(repoRoot, fixtureRoot),
    symbols: finalSymbols.length,
    prediction_rows: predictions.length
  }, null, 2));
}

main();
