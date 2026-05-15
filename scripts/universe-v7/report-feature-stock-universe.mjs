#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { publicSsotPath, resolveSsotPath } from './lib/ssot-paths.mjs';

const REPO_ROOT = process.cwd();
const gunzipAsync = promisify(gunzip);
const SSOT_SYMBOLS = publicSsotPath(REPO_ROOT, 'stocks.max.symbols.json');
const SSOT_CANONICAL_ROWS = resolveSsotPath(REPO_ROOT, 'stocks.max.canonical.rows.json');
const SSOT_CANONICAL_IDS = publicSsotPath(REPO_ROOT, 'stocks.max.canonical.ids.json');
const BY_FEATURE = publicSsotPath(REPO_ROOT, 'stocks.by_feature.json');
const BY_FEATURE_CANONICAL = publicSsotPath(REPO_ROOT, 'stocks.canonical.by_feature.json');
const SHARED_FEATURES = publicSsotPath(REPO_ROOT, 'stocks.shared.features.json');
const SCI_SNAPSHOT = path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json');
const FC_LATEST = path.join(REPO_ROOT, 'public/data/forecast/latest.json');
const MP_INDEX = path.join(REPO_ROOT, 'public/data/marketphase/index.json');
const MP_DEEP_SUMMARY = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
const MP_DEEP_CANONICAL_SUMMARY = path.join(REPO_ROOT, 'public/data/universe/v7/read_models/marketphase_deep_canonical_summary.json');
const PAGE_CORE_LATEST = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
const OUT_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/feature_stock_universe_report.json');

function nowIso() {
  return new Date().toISOString();
}

async function readJson(absPath) {
  const raw = await fs.readFile(absPath, 'utf8');
  return JSON.parse(raw);
}

async function readJsonMaybe(absPath) {
  try {
    return await readJson(absPath);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(absPath, data) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, absPath);
}

function toUpperSet(values = []) {
  const set = new Set();
  for (const value of values) {
    const s = String(value || '').trim().toUpperCase();
    if (s) set.add(s);
  }
  return set;
}

function intersection(a, b) {
  const out = new Set();
  for (const v of a) {
    if (b.has(v)) out.add(v);
  }
  return out;
}

function projectSymbolsToCanonical(symbolSet, symbolToCanonical) {
  const out = new Set();
  for (const symbol of symbolSet) {
    const ids = symbolToCanonical.get(String(symbol || '').trim().toUpperCase());
    if (!ids) continue;
    for (const cid of ids) out.add(cid);
  }
  return out;
}

function bump(map, key) {
  const normalized = String(key || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  map[normalized] = (map[normalized] || 0) + 1;
}

function publicRefToAbs(ref) {
  const normalized = String(ref || '').trim();
  if (!normalized) return null;
  if (path.isAbsolute(normalized) && normalized.startsWith('/data/')) {
    return path.join(REPO_ROOT, 'public', normalized.slice(1));
  }
  if (normalized.startsWith('data/')) return path.join(REPO_ROOT, 'public', normalized);
  if (normalized.startsWith('public/')) return path.join(REPO_ROOT, normalized);
  return path.isAbsolute(normalized) ? normalized : path.join(REPO_ROOT, normalized);
}

function regionFromRow(row) {
  const explicit = String(row?.meta?.region || row?.identity?.region || row?.region || row?.scope_region || '').trim().toUpperCase();
  if (explicit) return explicit;
  const exchange = String(row?.identity?.exchange || row?.exchange || row?.canonical_asset_id?.split(':')?.[0] || '').trim().toUpperCase();
  const country = String(row?.identity?.country || row?.country || '').trim().toUpperCase();
  if (['US', 'NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'BATS', 'OTC'].includes(exchange) || country === 'USA' || country === 'UNITED STATES') return 'US';
  if (['AS', 'F', 'HM', 'BE', 'DU', 'HA', 'MU', 'SG', 'PA', 'BR', 'MC', 'MI', 'L', 'SW', 'ST', 'OL', 'HE', 'CO', 'IC', 'VI', 'LS', 'AT', 'IR', 'BD', 'WA', 'PR'].includes(exchange)) return 'EU';
  if (['KO', 'KQ', 'KS', 'JK', 'TSE', 'TO', 'HK', 'SHG', 'SHE', 'NSE', 'BSE', 'AU', 'AX', 'SI', 'TW', 'TWO', 'BK', 'KLSE'].includes(exchange)) return 'ASIA';
  return 'OTHER';
}

async function pageCoreBreakdown(pageCoreLatest) {
  const snapshotRoot = publicRefToAbs(pageCoreLatest?.snapshot_path);
  if (!snapshotRoot) return null;
  const shardDir = path.join(snapshotRoot, 'page-shards');
  let files = [];
  try {
    files = (await fs.readdir(shardDir)).filter((file) => file.endsWith('.json.gz')).sort();
  } catch {
    return null;
  }
  const byRegion = {};
  const byClass = {};
  let total = 0;
  for (const file of files) {
    const raw = await fs.readFile(path.join(shardDir, file));
    const doc = JSON.parse((await gunzipAsync(raw)).toString('utf8'));
    const rows = Array.isArray(doc) ? doc : Object.values(doc || {});
    for (const row of rows) {
      if (!row?.canonical_asset_id) continue;
      total += 1;
      bump(byRegion, regionFromRow(row));
      bump(byClass, row?.identity?.asset_class || row?.asset_class || row?.meta?.asset_class || 'UNKNOWN');
    }
  }
  return total > 0 ? { total, byRegion, byClass } : null;
}

async function main() {
  const [
    ssotDoc,
    ssotCanonicalRowsDoc,
    ssotCanonicalIdsDoc,
    byFeatureDoc,
    byFeatureCanonicalDoc,
    sharedDoc,
    sciDoc,
    fcDoc,
    mpDoc,
    mpDeepDoc,
    mpDeepCanonicalDoc,
    pageCoreLatest
  ] = await Promise.all([
    readJson(SSOT_SYMBOLS),
    readJsonMaybe(SSOT_CANONICAL_ROWS),
    readJsonMaybe(SSOT_CANONICAL_IDS),
    readJson(BY_FEATURE),
    readJsonMaybe(BY_FEATURE_CANONICAL),
    readJsonMaybe(SHARED_FEATURES),
    readJsonMaybe(SCI_SNAPSHOT),
    readJsonMaybe(FC_LATEST),
    readJsonMaybe(MP_INDEX),
    readJsonMaybe(MP_DEEP_SUMMARY),
    readJsonMaybe(MP_DEEP_CANONICAL_SUMMARY),
    readJsonMaybe(PAGE_CORE_LATEST)
  ]);

  const ssotSet = toUpperSet(Array.isArray(ssotDoc?.symbols) ? ssotDoc.symbols : []);
  const canonicalRows = Array.isArray(ssotCanonicalRowsDoc?.items) ? ssotCanonicalRowsDoc.items : [];
  const ssotCanonicalSet = toUpperSet(
    Array.isArray(ssotCanonicalIdsDoc?.canonical_ids)
      ? ssotCanonicalIdsDoc.canonical_ids
      : canonicalRows.map((row) => row?.canonical_id)
  );
  const symbolToCanonical = new Map();
  const ssotSymbolRows = new Map();
  for (const row of canonicalRows) {
    const sym = String(row?.symbol || '').trim().toUpperCase();
    const cid = String(row?.canonical_id || '').trim().toUpperCase();
    if (!sym || !cid) continue;
    if (!symbolToCanonical.has(sym)) symbolToCanonical.set(sym, new Set());
    symbolToCanonical.get(sym).add(cid);
    if (!ssotSymbolRows.has(sym)) ssotSymbolRows.set(sym, row);
  }
  const ssotHistory200Cap = new Set();
  const ssotHistory200NoPack = new Set();
  const ssotByType = {};
  const ssotByRegion = {};
  for (const [sym, row] of ssotSymbolRows.entries()) {
    const barsCount = Number(row?.bars_count || 0);
    const hasPack = Boolean(String(row?.pointers?.history_pack || '').trim());
    const typeNorm = String(row?.type_norm || 'OTHER').toUpperCase();
    const region = String(row?.scope_region || row?.region || 'OTHER').toUpperCase();
    ssotByType[typeNorm] = (ssotByType[typeNorm] || 0) + 1;
    ssotByRegion[region] = (ssotByRegion[region] || 0) + 1;
    if (Number.isFinite(barsCount) && barsCount >= 200) {
      ssotHistory200Cap.add(sym);
    } else if (!hasPack) {
      ssotHistory200NoPack.add(sym);
    }
  }
  const sharedSet = toUpperSet(
    (Array.isArray(sharedDoc?.items) ? sharedDoc.items : []).map((item) => item?.symbol || item?.ticker)
  );
  const byFeature = {
    analyzer: toUpperSet(Array.isArray(byFeatureDoc?.symbols?.analyzer) ? byFeatureDoc.symbols.analyzer : []),
    scientific: toUpperSet(Array.isArray(byFeatureDoc?.symbols?.scientific) ? byFeatureDoc.symbols.scientific : []),
    forecast: toUpperSet(Array.isArray(byFeatureDoc?.symbols?.forecast) ? byFeatureDoc.symbols.forecast : []),
    marketphase: toUpperSet(Array.isArray(byFeatureDoc?.symbols?.marketphase) ? byFeatureDoc.symbols.marketphase : []),
    elliott: toUpperSet(Array.isArray(byFeatureDoc?.symbols?.elliott) ? byFeatureDoc.symbols.elliott : [])
  };
  const byFeatureCanonical = {
    analyzer: toUpperSet(Array.isArray(byFeatureCanonicalDoc?.canonical_ids?.analyzer) ? byFeatureCanonicalDoc.canonical_ids.analyzer : []),
    scientific: toUpperSet(Array.isArray(byFeatureCanonicalDoc?.canonical_ids?.scientific) ? byFeatureCanonicalDoc.canonical_ids.scientific : []),
    forecast: toUpperSet(Array.isArray(byFeatureCanonicalDoc?.canonical_ids?.forecast) ? byFeatureCanonicalDoc.canonical_ids.forecast : []),
    marketphase: toUpperSet(Array.isArray(byFeatureCanonicalDoc?.canonical_ids?.marketphase) ? byFeatureCanonicalDoc.canonical_ids.marketphase : []),
    elliott: toUpperSet(Array.isArray(byFeatureCanonicalDoc?.canonical_ids?.elliott) ? byFeatureCanonicalDoc.canonical_ids.elliott : [])
  };

  const scientificRaw = toUpperSet(
    Object.keys(sciDoc || {}).filter((key) => !String(key).startsWith('_'))
  );
  const forecastRaw = toUpperSet(
    (Array.isArray(fcDoc?.data?.forecasts) ? fcDoc.data.forecasts : []).map((row) => row?.symbol || row?.ticker)
  );
  const forecastRawCanonicalDirect = toUpperSet(
    (Array.isArray(fcDoc?.data?.forecasts_canonical) ? fcDoc.data.forecasts_canonical : []).map((row) => row?.canonical_id)
  );
  const marketphaseRaw = toUpperSet(
    (Array.isArray(mpDoc?.data?.symbols) ? mpDoc.data.symbols : (Array.isArray(mpDoc?.symbols) ? mpDoc.symbols : []))
      .map((row) => (typeof row === 'string' ? row : row?.symbol))
  );
  const marketphaseDeepRaw = toUpperSet(
    (Array.isArray(mpDeepDoc?.items) ? mpDeepDoc.items : []).map((row) => row?.symbol || row?.ticker)
  );
  const marketphaseDeepRawCanonical = toUpperSet(
    (Array.isArray(mpDeepCanonicalDoc?.items) ? mpDeepCanonicalDoc.items : []).map((row) => row?.canonical_id)
  );
  const marketphaseRawEffectiveSource = marketphaseDeepRaw.size > 0 ? marketphaseDeepRaw : marketphaseRaw;
  const elliottRaw = marketphaseDeepRaw.size > 0 ? marketphaseDeepRaw : marketphaseRaw;

  const scientificEffective = intersection(scientificRaw, byFeature.scientific);
  const forecastEffective = intersection(forecastRaw, byFeature.forecast);
  const marketphaseEffective = intersection(marketphaseRawEffectiveSource, byFeature.marketphase);
  const elliottEffective = intersection(elliottRaw, byFeature.elliott);

  const scientificRawCanonical = projectSymbolsToCanonical(scientificRaw, symbolToCanonical);
  const forecastRawCanonical = forecastRawCanonicalDirect.size > 0
    ? forecastRawCanonicalDirect
    : projectSymbolsToCanonical(forecastRaw, symbolToCanonical);
  const marketphaseRawCanonical = marketphaseDeepRawCanonical.size > 0
    ? marketphaseDeepRawCanonical
    : projectSymbolsToCanonical(marketphaseRawEffectiveSource, symbolToCanonical);
  const elliottRawCanonical = marketphaseDeepRawCanonical.size > 0
    ? marketphaseDeepRawCanonical
    : projectSymbolsToCanonical(elliottRaw, symbolToCanonical);

  const scientificEffectiveCanonical = intersection(scientificRawCanonical, byFeatureCanonical.scientific);
  const forecastEffectiveCanonical = intersection(forecastRawCanonical, byFeatureCanonical.forecast);
  const marketphaseEffectiveCanonical = intersection(marketphaseRawCanonical, byFeatureCanonical.marketphase);
  const elliottEffectiveCanonical = intersection(elliottRawCanonical, byFeatureCanonical.elliott);
  const pageCoreAssetCount = Number(pageCoreLatest?.asset_count);
  const pageCoreScope = await pageCoreBreakdown(pageCoreLatest);
  const effectiveUniverseTotal = pageCoreScope?.total || (Number.isFinite(pageCoreAssetCount) && pageCoreAssetCount > 0
    ? pageCoreAssetCount
    : (byFeatureCanonical.analyzer.size || byFeature.analyzer.size || ssotCanonicalSet.size || ssotSet.size));
  const effectiveByRegion = pageCoreScope?.byRegion || (Number.isFinite(pageCoreAssetCount) && pageCoreAssetCount > 0 ? { UNKNOWN: pageCoreAssetCount } : ssotByRegion);
  const effectiveByClass = pageCoreScope?.byClass || (Number.isFinite(pageCoreAssetCount) && pageCoreAssetCount > 0 ? { UNKNOWN: pageCoreAssetCount } : ssotByType);

  const report = {
    schema: 'rv_v7_feature_stock_universe_report_v1',
    generated_at: nowIso(),
    target_market_date: pageCoreLatest?.target_market_date || null,
    ssot_total: effectiveUniverseTotal,
    provider_covered: effectiveUniverseTotal,
    excluded_by_reason: {},
    by_region: effectiveByRegion,
    by_class: effectiveByClass,
    active_ingestible_count: effectiveUniverseTotal,
    feature_eligible_count: {
      analyzer: byFeature.analyzer.size,
      scientific: byFeature.scientific.size,
      forecast: byFeature.forecast.size,
      marketphase: byFeature.marketphase.size,
      elliott: byFeature.elliott.size
    },
    sources: {
      ssot_symbols: 'public/data/universe/v7/ssot/stocks.max.symbols.json',
      by_feature: 'public/data/universe/v7/ssot/stocks.by_feature.json',
      shared_features: 'public/data/universe/v7/ssot/stocks.shared.features.json',
      scientific_snapshot: 'public/data/snapshots/stock-analysis.json',
      forecast_latest: 'public/data/forecast/latest.json',
      marketphase_index: 'public/data/marketphase/index.json',
      marketphase_deep_summary: 'public/data/universe/v7/read_models/marketphase_deep_summary.json'
      ,
      marketphase_deep_canonical_summary: 'public/data/universe/v7/read_models/marketphase_deep_canonical_summary.json'
    },
    counts: {
      ssot_assets_max: ssotSet.size,
      ssot_stocks_max: ssotSet.size,
      ssot_stocks_only_max: Number(ssotByType.STOCK || 0),
      ssot_etfs_max: Number(ssotByType.ETF || 0),
      ssot_context_bonds_max: Number(ssotByType.BOND || 0),
      ssot_stocks_history_200_cap: ssotHistory200Cap.size,
      ssot_stocks_lt200_or_no_pack_gap: ssotSet.size - ssotHistory200Cap.size,
      ssot_stocks_lt200_no_pack: ssotHistory200NoPack.size,
      ssot_stocks_canonical_max: ssotCanonicalSet.size,
      stock_analyzer_effective: byFeature.analyzer.size,
      by_feature_analyzer: byFeature.analyzer.size,
      by_feature_scientific: byFeature.scientific.size,
      by_feature_forecast: byFeature.forecast.size,
      by_feature_marketphase: byFeature.marketphase.size,
      by_feature_elliott: byFeature.elliott.size,
      by_feature_analyzer_canonical: byFeatureCanonical.analyzer.size,
      by_feature_scientific_canonical: byFeatureCanonical.scientific.size,
      by_feature_forecast_canonical: byFeatureCanonical.forecast.size,
      by_feature_marketphase_canonical: byFeatureCanonical.marketphase.size,
      by_feature_elliott_canonical: byFeatureCanonical.elliott.size,
      shared_features: sharedSet.size,
      scientific_raw: scientificRaw.size,
      forecast_raw: forecastRaw.size,
      marketphase_raw: marketphaseRaw.size,
      marketphase_deep_raw: marketphaseDeepRaw.size,
      marketphase_deep_raw_canonical: marketphaseDeepRawCanonical.size,
      elliott_raw: elliottRaw.size,
      scientific_effective: scientificEffective.size,
      forecast_effective: forecastEffective.size,
      marketphase_effective: marketphaseEffective.size,
      elliott_effective: elliottEffective.size,
      scientific_raw_canonical: scientificRawCanonical.size,
      forecast_raw_canonical: forecastRawCanonical.size,
      marketphase_raw_canonical: marketphaseRawCanonical.size,
      elliott_raw_canonical: elliottRawCanonical.size,
      scientific_effective_canonical: scientificEffectiveCanonical.size,
      forecast_effective_canonical: forecastEffectiveCanonical.size,
      marketphase_effective_canonical: marketphaseEffectiveCanonical.size,
      elliott_effective_canonical: elliottEffectiveCanonical.size
    },
    classes: {
      allowed_web_universe: ['STOCK', 'ETF', 'BOND'],
      removed_from_web_universe: ['FUND', 'CRYPTO', 'FOREX', 'INDEX', 'OTHER'],
      by_type_norm: ssotByType
    },
    parity: {
      effective_equal_scientific_forecast_elliott:
        scientificEffective.size === forecastEffective.size
        && forecastEffective.size === elliottEffective.size,
      effective_equal_all_four:
        scientificEffective.size === forecastEffective.size
        && forecastEffective.size === marketphaseEffective.size
        && marketphaseEffective.size === elliottEffective.size,
      effective_equal_forecast_marketphase_elliott:
        forecastEffective.size === marketphaseEffective.size
        && marketphaseEffective.size === elliottEffective.size,
      effective_equal_forecast_marketphase_elliott_to_history200_cap:
        forecastEffective.size === ssotHistory200Cap.size
        && marketphaseEffective.size === ssotHistory200Cap.size
        && elliottEffective.size === ssotHistory200Cap.size
    },
    derivation: {
      marketphase_raw_effective_source: marketphaseDeepRaw.size > 0
        ? 'marketphase_deep_summary'
        : 'marketphase_index',
      marketphase_raw_canonical_source: marketphaseDeepRawCanonical.size > 0
        ? 'marketphase_deep_canonical_summary'
        : 'projected_from_symbol_sets',
      forecast_raw_canonical_source: forecastRawCanonicalDirect.size > 0
        ? 'forecast_latest.forecasts_canonical'
        : 'projected_from_symbol_set',
      elliott_raw_source: marketphaseDeepRaw.size > 0
        ? 'marketphase_deep_summary'
        : 'marketphase_index'
    },
    notes: [
      'Stock Analyzer can query the full v7 stock SSOT via /api/stock + v7 fallback.',
      'Scientific/Forecast/Marketphase/Elliott should target the v7 stocks.by_feature universe.',
      'Raw/effective counts show current pipeline coverage against target universes.',
      'ssot_stocks_history_200_cap is the practical cap for features that require >=200 valid bars.'
    ]
  };

  await writeJsonAtomic(OUT_REPORT, report);
  console.log(JSON.stringify({ ok: true, out: path.relative(REPO_ROOT, OUT_REPORT), counts: report.counts, parity: report.parity }, null, 2));
}

main().catch((error) => {
  console.error('[report-feature-stock-universe] failed:', error?.message || error);
  process.exit(1);
});
