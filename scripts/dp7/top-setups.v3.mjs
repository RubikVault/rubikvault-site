#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';

const DEFAULT_THRESHOLDS = {
  scientific_bullish_min: 0.6,
  elliott_bullish_min: 0.55,
  forecast_bullish_min: 0.55,
  min_composite: 0.45,
  top_n: 120
};

function normalizeTicker(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return /^[A-Z0-9.\-]{1,15}$/.test(value) ? value : '';
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toUnitInterval(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num > 1) return Math.max(0, Math.min(1, num / 100));
  return Math.max(0, Math.min(1, num));
}

function scoreFromDirection(direction, confidence) {
  const conf = toUnitInterval(confidence);
  if (conf == null) return null;
  const dir = String(direction || '').toLowerCase();
  if (dir === 'bullish') return conf;
  if (dir === 'bearish') return 1 - conf;
  return null;
}

function scientificScore(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return toUnitInterval(entry.probability ?? entry?.trigger?.score ?? entry?.setup?.score);
}

function forecastScore(row) {
  if (!row || typeof row !== 'object') return null;
  const horizons = row.horizons || {};
  const preferred = horizons['5d'] || horizons['20d'] || horizons['1d'] || null;
  if (!preferred) return null;
  return scoreFromDirection(preferred.direction, preferred.probability);
}

function elliottScore(doc) {
  if (!doc || doc.ok !== true) return null;
  const data = doc.data || {};
  const direction = data?.elliott?.completedPattern?.direction || data?.features?.SMATrend || null;
  const confidence = data?.elliott?.developingPattern?.confidence ?? data?.elliott?.completedPattern?.confidence0_100;
  return scoreFromDirection(direction, confidence);
}

function average(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

async function loadElliottMap(rootDir, indexDoc) {
  const out = new Map();
  const symbols = Array.isArray(indexDoc?.data?.symbols) ? indexDoc.data.symbols : [];
  for (const item of symbols) {
    const ticker = normalizeTicker(item?.symbol || '');
    const relPath = String(item?.path || '').trim();
    if (!ticker || !relPath.startsWith('/')) continue;
    const absPath = path.join(rootDir, 'public', relPath.replace(/^\//, ''));
    const doc = await readJsonSafe(absPath, null);
    out.set(ticker, elliottScore(doc));
  }
  return out;
}

function buildForecastMap(forecastDoc) {
  const out = new Map();
  const rows = Array.isArray(forecastDoc?.data?.forecasts) ? forecastDoc.data.forecasts : [];
  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker || '');
    if (!ticker) continue;
    out.set(ticker, forecastScore(row));
  }
  return out;
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const thresholdsPath = path.join(rootDir, 'public/data/v3/derived/config/scoring-thresholds.json');
  const thresholdsDoc = await readJsonSafe(thresholdsPath, null);
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(thresholdsDoc?.thresholds && typeof thresholdsDoc.thresholds === 'object' ? thresholdsDoc.thresholds : {})
  };

  const [universeDoc, scientificDoc, forecastDoc, marketphaseIndexDoc] = await Promise.all([
    readJsonSafe(path.join(rootDir, 'public/data/universe/all.json'), []),
    readJsonSafe(path.join(rootDir, 'public/data/snapshots/stock-analysis.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/forecast/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/marketphase/index.json'), {})
  ]);

  const universeRows = Array.isArray(universeDoc) ? universeDoc : [];
  const forecastMap = buildForecastMap(forecastDoc);
  const elliottMap = await loadElliottMap(rootDir, marketphaseIndexDoc);

  const rows = [];

  for (const entry of universeRows) {
    const ticker = normalizeTicker(entry?.ticker || '');
    if (!ticker) continue;
    const scientific = scientificScore(scientificDoc?.[ticker]);
    const elliott = numberOrNull(elliottMap.get(ticker));
    const forecast = numberOrNull(forecastMap.get(ticker));

    const composite = average([scientific, elliott, forecast]);
    const enginesAvailable = [scientific, elliott, forecast].filter((v) => Number.isFinite(v)).length;

    const bullishCount =
      (scientific != null && scientific >= thresholds.scientific_bullish_min ? 1 : 0) +
      (elliott != null && elliott >= thresholds.elliott_bullish_min ? 1 : 0) +
      (forecast != null && forecast >= thresholds.forecast_bullish_min ? 1 : 0);

    const consensus = enginesAvailable > 0 ? bullishCount / enginesAvailable : null;

    rows.push({
      ticker,
      name: entry?.name || null,
      scientific,
      elliott,
      forecast,
      composite,
      consensus,
      bullish_count: bullishCount,
      engines_available: enginesAvailable
    });
  }

  rows.sort((a, b) => {
    const c = Number(b.composite ?? -1) - Number(a.composite ?? -1);
    if (c !== 0) return c;
    const d = Number(b.consensus ?? -1) - Number(a.consensus ?? -1);
    if (d !== 0) return d;
    return a.ticker.localeCompare(b.ticker);
  });

  const filtered = rows
    .filter((row) => row.composite == null || row.composite >= thresholds.min_composite)
    .slice(0, Number(thresholds.top_n) || DEFAULT_THRESHOLDS.top_n);

  const doc = {
    meta: {
      schema_version: 'rv.derived.top-setups.v1',
      generated_at: runContext.generatedAt,
      data_date: runContext.generatedAt.slice(0, 10),
      provider: 'derived-local',
      source_chain: [
        '/data/snapshots/stock-analysis.json',
        '/data/forecast/latest.json',
        '/data/marketphase/index.json'
      ],
      run_id: runContext.runId,
      commit: runContext.commit,
      thresholds
    },
    data: {
      count: filtered.length,
      rows: filtered
    }
  };

  await writeJsonArtifact(rootDir, 'public/data/v3/derived/top-setups/latest.json', doc);
  console.log(`DP7 top-setups done rows=${filtered.length}`);
}

main().catch((error) => {
  console.error(`DP7_TOP_SETUPS_FAILED:${error?.message || error}`);
  process.exitCode = 1;
});
