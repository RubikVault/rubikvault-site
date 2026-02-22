#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();
const REGISTRY_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const SSOT_SYMBOLS = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.symbols.json');
const FORECAST_LATEST = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const MARKETPHASE_INDEX = path.join(REPO_ROOT, 'public/data/marketphase/index.json');
const FEATURE_UNIVERSE_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/feature_stock_universe_report.json');
const MARKETPHASE_DEEP_SUMMARY = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/coverage_progress.json');

function nowIso() {
  return new Date().toISOString();
}

async function readJson(absPath) {
  try {
    const raw = await fsp.readFile(absPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(absPath, data) {
  await fsp.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, absPath);
}

function pct(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function uniqueForecastSymbols(forecastDoc) {
  const rows = Array.isArray(forecastDoc?.data?.forecasts) ? forecastDoc.data.forecasts : [];
  const set = new Set();
  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker);
    if (ticker) set.add(ticker);
  }
  return set;
}

function marketphaseSymbolCount(indexDoc) {
  const rows = Array.isArray(indexDoc?.data?.symbols)
    ? indexDoc.data.symbols
    : Array.isArray(indexDoc?.symbols)
      ? indexDoc.symbols
      : [];
  const set = new Set();
  for (const row of rows) {
    const ticker = normalizeTicker(typeof row === 'string' ? row : row?.symbol || row?.ticker);
    if (ticker) set.add(ticker);
  }
  return set;
}

function parseRegistryStockStats() {
  if (!fs.existsSync(REGISTRY_GZ)) {
    return {
      stock_rows_total: 0,
      stock_rows_with_bars: 0,
      stock_rows_with_200: 0,
      stock_rows_with_history_pack: 0,
      stock_unique_total: 0,
      stock_unique_with_bars: 0,
      stock_unique_with_200: 0,
      stock_unique_with_history_pack: 0
    };
  }

  const text = zlib.gunzipSync(fs.readFileSync(REGISTRY_GZ)).toString('utf8');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const rowStats = {
    stock_rows_total: 0,
    stock_rows_with_bars: 0,
    stock_rows_with_200: 0,
    stock_rows_with_history_pack: 0
  };

  const byTicker = new Map();

  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }

    if (normalizeTicker(row?.type_norm) !== 'STOCK') continue;

    rowStats.stock_rows_total += 1;
    const bars = Number(row?.bars_count || 0);
    const hasPack = Boolean(row?.pointers?.history_pack);
    if (bars > 0) rowStats.stock_rows_with_bars += 1;
    if (bars >= 200) rowStats.stock_rows_with_200 += 1;
    if (hasPack) rowStats.stock_rows_with_history_pack += 1;

    const ticker = normalizeTicker(row?.symbol);
    if (!ticker) continue;

    const qualityBonus = String(row?._quality_basis || '').toLowerCase() === 'backfill_real' ? 1_000_000 : 0;
    const rank = qualityBonus + bars;
    const prev = byTicker.get(ticker);
    if (!prev || rank > prev.rank) {
      byTicker.set(ticker, { bars, hasPack, rank });
    }
  }

  let stock_unique_with_bars = 0;
  let stock_unique_with_200 = 0;
  let stock_unique_with_history_pack = 0;
  for (const value of byTicker.values()) {
    if (value.bars > 0) stock_unique_with_bars += 1;
    if (value.bars >= 200) stock_unique_with_200 += 1;
    if (value.hasPack) stock_unique_with_history_pack += 1;
  }

  return {
    ...rowStats,
    stock_unique_total: byTicker.size,
    stock_unique_with_bars,
    stock_unique_with_200,
    stock_unique_with_history_pack
  };
}

async function main() {
  const [ssotDoc, forecastDoc, marketphaseDoc, featureReportDoc, marketphaseDeepDoc] = await Promise.all([
    readJson(SSOT_SYMBOLS),
    readJson(FORECAST_LATEST),
    readJson(MARKETPHASE_INDEX),
    readJson(FEATURE_UNIVERSE_REPORT),
    readJson(MARKETPHASE_DEEP_SUMMARY)
  ]);

  const targetSet = new Set((Array.isArray(ssotDoc?.symbols) ? ssotDoc.symbols : []).map(normalizeTicker).filter(Boolean));
  const forecastSet = uniqueForecastSymbols(forecastDoc);
  const marketphaseSet = marketphaseSymbolCount(marketphaseDoc);
  const marketphaseDeepSet = new Set(
    (Array.isArray(marketphaseDeepDoc?.items) ? marketphaseDeepDoc.items : [])
      .map((row) => normalizeTicker(row?.symbol || row?.ticker))
      .filter(Boolean)
  );
  const registry = parseRegistryStockStats();

  const target = targetSet.size;
  const forecastCount = forecastSet.size;
  const marketphaseCount = marketphaseDeepSet.size > 0 ? marketphaseDeepSet.size : marketphaseSet.size;
  const marketphaseDeepCount = marketphaseDeepSet.size;
  const with200 = registry.stock_unique_with_200;

  const report = {
    schema: 'rv_v7_coverage_progress_v1',
    generated_at: nowIso(),
    sources: {
      ssot_symbols: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      registry: 'public/data/universe/v7/registry/registry.ndjson.gz',
      forecast_latest: 'public/data/forecast/latest.json',
      marketphase_index: 'public/data/marketphase/index.json',
      feature_stock_universe_report: 'public/data/universe/v7/ssot/feature_stock_universe_report.json'
    },
    targets: {
      stock_universe_target: target,
      forecast_symbol_target: target,
      marketphase_symbol_target: target,
      elliott_deep_symbol_target: target
    },
    coverage: {
      forecast_symbols_current: forecastCount,
      marketphase_symbols_current: marketphaseCount,
      marketphase_deep_symbols_current: marketphaseDeepCount,
      registry_stock_unique_with_200: with200,
      registry_stock_unique_with_bars: registry.stock_unique_with_bars,
      registry_stock_unique_with_history_pack: registry.stock_unique_with_history_pack,
      registry_stock_unique_total: registry.stock_unique_total
    },
    progress_pct: {
      forecast_vs_target_pct: pct(forecastCount, target),
      marketphase_vs_target_pct: pct(marketphaseCount, target),
      marketphase_deep_vs_target_pct: pct(marketphaseDeepCount, target),
      precondition_200bars_vs_target_pct: pct(with200, target)
    },
    gaps: {
      forecast_gap_to_target: Math.max(0, target - forecastCount),
      marketphase_gap_to_target: Math.max(0, target - marketphaseCount),
      marketphase_deep_gap_to_target: Math.max(0, target - marketphaseDeepCount),
      precondition_200bars_gap_to_target: Math.max(0, target - with200)
    },
    row_level_registry: {
      stock_rows_total: registry.stock_rows_total,
      stock_rows_with_bars: registry.stock_rows_with_bars,
      stock_rows_with_200: registry.stock_rows_with_200,
      stock_rows_with_history_pack: registry.stock_rows_with_history_pack,
      stock_rows_with_bars_pct: pct(registry.stock_rows_with_bars, registry.stock_rows_total),
      stock_rows_with_200_pct: pct(registry.stock_rows_with_200, registry.stock_rows_total),
      stock_rows_with_history_pack_pct: pct(registry.stock_rows_with_history_pack, registry.stock_rows_total)
    },
    notes: [
      'Forecast requires sufficient per-symbol history (>=200 bars in current pipeline).',
      'Marketphase coverage uses deep summary when available; index.json is legacy fallback.',
      'Elliott deep coverage depends on marketphase artifact coverage, not only universe target size.',
      'Feature universe target can be met before data preconditions are met.'
    ],
    previous_feature_report_snapshot: featureReportDoc?.counts || null
  };

  await writeJsonAtomic(OUT_PATH, report);
  console.log(JSON.stringify({ ok: true, out: path.relative(REPO_ROOT, OUT_PATH), progress_pct: report.progress_pct, gaps: report.gaps }, null, 2));
}

main().catch((error) => {
  console.error('[report-coverage-progress] failed:', error?.message || error);
  process.exit(1);
});
