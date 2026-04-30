#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import Ajv2020 from 'ajv/dist/2020.js';
import { computeIndicators } from '../../functions/api/_shared/eod-indicators.mjs';
import {
  assessMarketDataConsistency,
  buildMarketPricesFromBar,
  buildMarketStatsFromIndicators,
} from '../../public/js/stock-ssot.js';
import {
  ALIAS_SHARD_COUNT,
  PAGE_CORE_HARD_BYTES,
  PAGE_CORE_SCHEMA,
  PAGE_CORE_TARGET_BYTES,
  PAGE_SHARD_COUNT,
  aliasShardIndex,
  aliasShardName,
  buildPageCoreSnapshotId,
  normalizeIsoDate,
  normalizePageCoreAlias,
  pageShardIndex,
  pageShardName,
  sha256Prefix,
  stableStringify,
} from '../lib/page-core-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const DEFAULT_PAGE_CORE_ROOT = path.join(ROOT, 'public/data/page-core');
const REGISTRY_PATH = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const SYMBOL_LOOKUP_PATH = path.join(ROOT, 'public/data/symbol-resolve.v1.lookup.json');
const SEARCH_EXACT_PATH = path.join(ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const GLOBAL_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const DAILY_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.us_eu.daily_eval.canonical.ids.json');
const COMPAT_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json');
const OPERABILITY_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json');
const OPERABILITY_FULL_PATH = path.join(ROOT, 'public/data/ops/stock-analyzer-operability-latest.json');
const DECISIONS_LATEST_PATH = path.join(ROOT, 'public/data/decisions/latest.json');
const PAGE_CORE_SCHEMA_PATH = path.join(ROOT, 'schemas/stock-analyzer/page-core.v1.schema.json');
const HISTORY_MANIFEST_CANDIDATES = [
  process.env.RV_PAGE_CORE_HISTORY_MANIFEST_PATH,
  process.env.RV_GLOBAL_MANIFEST_DIR ? path.join(process.env.RV_GLOBAL_MANIFEST_DIR, 'pack-manifest.global.json') : null,
  path.join(ROOT, 'public/data/eod/history/pack-manifest.global.json'),
  path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.json'),
].filter(Boolean);
const HISTORY_LOOKUP_CANDIDATES = [
  process.env.RV_PAGE_CORE_HISTORY_LOOKUP_PATH,
  process.env.RV_GLOBAL_MANIFEST_DIR ? path.join(process.env.RV_GLOBAL_MANIFEST_DIR, 'pack-manifest.global.lookup.json') : null,
  path.join(ROOT, 'public/data/eod/history/pack-manifest.global.lookup.json'),
  path.join(ROOT, 'public/data/eod/history/pack-manifest.us-eu.lookup.json'),
].filter(Boolean);
const HISTORY_PACK_ROOTS = [
  process.env.RV_HISTORY_PACK_ROOT,
  path.join(ROOT, 'public/data/eod/history/packs'),
  path.join(ROOT, 'mirrors/universe-v7/history'),
].filter(Boolean);
const HISTORY_INDICATOR_BARS = Number(process.env.RV_PAGE_CORE_INDICATOR_BARS || 320);
const HISTORY_PACK_CACHE_LIMIT = Math.max(0, Number(process.env.RV_PAGE_CORE_PACK_CACHE_LIMIT || 24));
const PROTECTED_ALIASES = new Map([
  ['AAPL', 'US:AAPL'],
  ['MSFT', 'US:MSFT'],
  ['F', 'US:F'],
  ['V', 'US:V'],
  ['TSLA', 'US:TSLA'],
  ['SPY', 'US:SPY'],
  ['QQQ', 'US:QQQ'],
  ['BRK-B', 'US:BRK-B'],
  ['BRK.B', 'US:BRK.B'],
  ['BF-B', 'US:BF-B'],
  ['BF.B', 'US:BF.B'],
]);
const ALIAS_SHARD_MAX_BYTES = 512 * 1024;
const PAGE_SHARD_MAX_BYTES = 1024 * 1024;
const OPERATIONAL_ASSET_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);
const MARKET_STATS_FIELDS = [
  'rsi14',
  'sma20',
  'sma50',
  'sma200',
  'atr14',
  'volatility_20d',
  'volatility_percentile',
  'bb_upper',
  'bb_lower',
  'high_52w',
  'low_52w',
  'range_52w_pct',
];
const historyJsonCache = new Map();
const historyPackCache = new Map();
const historyShardCache = new Map();

function parseArgs(argv) {
  const get = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
  return {
    targetMarketDate: normalizeIsoDate(get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || new Date().toISOString().slice(0, 10)),
    runId: get('run-id') || process.env.RV_RUN_ID || process.env.RUN_ID || `page-core-${new Date().toISOString().replace(/[:.]/g, '')}`,
    manifestSeed: get('manifest-seed') || process.env.RV_MANIFEST_SEED || '',
    pageCoreRoot: path.resolve(ROOT, get('page-core-root') || DEFAULT_PAGE_CORE_ROOT),
    replace: argv.includes('--replace'),
    promote: argv.includes('--promote'),
    dryRun: argv.includes('--dry-run'),
    maxAssets: Number.isFinite(Number(get('max-assets'))) ? Number(get('max-assets')) : null,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function readGzipText(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
}

function readScopeIds() {
  const scopePath = fs.existsSync(GLOBAL_SCOPE_PATH)
    ? GLOBAL_SCOPE_PATH
    : fs.existsSync(DAILY_SCOPE_PATH)
      ? DAILY_SCOPE_PATH
      : COMPAT_SCOPE_PATH;
  const doc = readJsonMaybe(scopePath);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((id) => normalizePageCoreAlias(id)).filter(Boolean));
}

function readOperabilityIds() {
  const doc = readJsonMaybe(OPERABILITY_FULL_PATH) || readJsonMaybe(OPERABILITY_PATH);
  const records = Array.isArray(doc?.records) ? doc.records : [];
  return new Set(records.map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
}

function readRegistryRows() {
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  const rows = [];
  const text = readGzipText(REGISTRY_PATH);
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const id = normalizePageCoreAlias(row?.canonical_id);
      const assetClass = normalizePageCoreAlias(row?.type_norm || row?.asset_class || row?.type);
      if (!id || !['STOCK', 'ETF', 'INDEX'].includes(assetClass)) continue;
      rows.push(row);
    } catch {
      // Skip malformed registry rows; bundle validation catches missing protected IDs.
    }
  }
  return rows;
}

function readSearchExact() {
  if (!fs.existsSync(SEARCH_EXACT_PATH)) return { bySymbol: {}, canonicalIds: new Set() };
  const text = readGzipText(SEARCH_EXACT_PATH);
  try {
    const doc = JSON.parse(text);
    const bySymbol = doc?.by_symbol && typeof doc.by_symbol === 'object' ? doc.by_symbol : {};
    const canonicalIds = new Set(Object.values(bySymbol).map((row) => normalizePageCoreAlias(row?.canonical_id)).filter(Boolean));
    return { bySymbol, canonicalIds };
  } catch {
    const bySymbol = {};
    const canonicalIds = new Set();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const alias = normalizePageCoreAlias(row?.symbol || row?.ticker || row?.key);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (alias && canonical) bySymbol[alias] = row;
        if (canonical) canonicalIds.add(canonical);
      } catch {
        // Best effort only.
      }
    }
    return { bySymbol, canonicalIds };
  }
}

function readSymbolLookup() {
  const doc = readJsonMaybe(SYMBOL_LOOKUP_PATH);
  return doc?.exact && typeof doc.exact === 'object' ? doc.exact : {};
}

function maybeCanonicalFromLookup(value) {
  if (Array.isArray(value)) return normalizePageCoreAlias(value[4]);
  if (value && typeof value === 'object') {
    return normalizePageCoreAlias(value.canonical_id || value.canonicalId);
  }
  if (typeof value === 'string') return normalizePageCoreAlias(value);
  return '';
}

function readDecisionRows() {
  const latest = readJsonMaybe(DECISIONS_LATEST_PATH);
  const snapshotPath = latest?.snapshot_path ? path.join(ROOT, 'public', latest.snapshot_path.replace(/^\/+/, '')) : null;
  const out = new Map();
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return out;
  for (const name of fs.readdirSync(snapshotPath)) {
    if (!/^part-\d{3}\.ndjson\.gz$/.test(name)) continue;
    const text = readGzipText(path.join(snapshotPath, name));
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (canonical) out.set(canonical, row);
      } catch {
        // Keep bundle build tolerant; decision data is enrichment.
      }
    }
  }
  return out;
}

function addAlias(aliasMap, collisions, alias, canonical, { authoritative = false } = {}) {
  const key = normalizePageCoreAlias(alias);
  const value = normalizePageCoreAlias(canonical);
  if (!key || !value) return;
  const protectedTarget = PROTECTED_ALIASES.get(key);
  if (protectedTarget && protectedTarget !== value) {
    collisions.push({ alias: key, previous: value, next: protectedTarget, resolution: 'protected_rejected' });
    return;
  }
  const existing = aliasMap.get(key);
  if (!existing) {
    aliasMap.set(key, { canonical: value, authoritative });
    return;
  }
  if (existing.canonical === value) {
    existing.authoritative = existing.authoritative || authoritative;
    return;
  }
  if (authoritative && !existing.authoritative) {
    aliasMap.set(key, { canonical: value, authoritative: true });
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_override' });
    return;
  }
  if (existing.authoritative && !authoritative) {
    collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'authoritative_kept' });
    return;
  }
  aliasMap.delete(key);
  collisions.push({ alias: key, previous: existing.canonical, next: value, resolution: 'omitted_ambiguous' });
}

function buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds }) {
  const aliasMap = new Map();
  const collisions = [];

  for (const [alias, value] of Object.entries(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (!canonical) continue;
    if (!scopeIds.has(canonical) && !PROTECTED_ALIASES.has(normalizePageCoreAlias(alias))) continue;
    addAlias(aliasMap, collisions, alias, canonical, { authoritative: true });
  }

  for (const [alias, row] of Object.entries(searchExact.bySymbol || {})) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    if (!canonical) continue;
    if (!scopeIds.has(canonical) && !PROTECTED_ALIASES.has(normalizePageCoreAlias(alias))) continue;
    addAlias(aliasMap, collisions, alias, canonical);
  }

  const symbolOwners = new Map();
  const registryIds = new Set();
  for (const row of registryRows) {
    const canonical = normalizePageCoreAlias(row?.canonical_id);
    const symbol = normalizePageCoreAlias(row?.symbol);
    if (canonical) registryIds.add(canonical);
    if (!canonical || !symbol) continue;
    if (!symbolOwners.has(symbol)) symbolOwners.set(symbol, canonical);
    else {
      const prev = symbolOwners.get(symbol);
      if (prev !== canonical) symbolOwners.set(symbol, null);
    }
  }
  for (const [symbol, canonical] of symbolOwners.entries()) {
    if (canonical) addAlias(aliasMap, collisions, symbol, canonical);
  }

  for (const canonical of scopeIds) {
    addAlias(aliasMap, collisions, canonical, canonical, { authoritative: true });
  }

  for (const [alias, expected] of PROTECTED_ALIASES.entries()) {
    if (!registryIds.has(expected) && !scopeIds.has(expected)) {
      throw new Error(`PROTECTED_ALIAS_TARGET_MISSING:${alias}:expected:${expected}`);
    }
    addAlias(aliasMap, collisions, alias, expected, { authoritative: true });
    const actual = aliasMap.get(alias)?.canonical || null;
    if (actual !== expected) throw new Error(`PROTECTED_ALIAS_MISMATCH:${alias}:${actual}:expected:${expected}`);
  }

  return {
    aliases: Object.fromEntries(Array.from(aliasMap.entries()).map(([key, entry]) => [key, entry.canonical]).sort(([a], [b]) => a.localeCompare(b))),
    collisions,
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeHistoryBar(row) {
  if (Array.isArray(row)) {
    const date = String(row[0] || '').slice(0, 10);
    const close = numberOrNull(row[5] ?? row[4]);
    if (!date || close == null) return null;
    return {
      date,
      open: numberOrNull(row[1]) ?? close,
      high: numberOrNull(row[2]) ?? close,
      low: numberOrNull(row[3]) ?? close,
      close,
      adjClose: close,
      volume: numberOrNull(row[6]) ?? 0,
    };
  }
  if (!row || typeof row !== 'object') return null;
  const date = String(row.date || row.trading_date || '').slice(0, 10);
  const close = numberOrNull(row.adjClose ?? row.adjusted_close ?? row.adj_close ?? row.close);
  if (!date || close == null) return null;
  return {
    date,
    open: numberOrNull(row.open) ?? close,
    high: numberOrNull(row.high) ?? close,
    low: numberOrNull(row.low) ?? close,
    close,
    adjClose: close,
    volume: numberOrNull(row.volume) ?? 0,
  };
}

function normalizeHistoryBars(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeHistoryBar)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeBars(existing, incoming) {
  const map = new Map();
  for (const row of [...(existing || []), ...(incoming || [])]) {
    if (row?.date) map.set(row.date, row);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function readJsonCached(filePath) {
  if (!filePath) return null;
  if (historyJsonCache.has(filePath)) return historyJsonCache.get(filePath);
  let doc = null;
  try {
    doc = readJson(filePath);
  } catch {
    doc = null;
  }
  historyJsonCache.set(filePath, doc);
  return doc;
}

function readFirstJson(paths) {
  for (const filePath of paths) {
    if (filePath && fs.existsSync(filePath)) return readJsonCached(filePath);
  }
  return null;
}

function normalizePackEntry(entry, fallbackCanonicalId) {
  if (!entry) return null;
  if (Array.isArray(entry)) {
    const pack = String(entry[1] || '').trim();
    const canonical = normalizePageCoreAlias(String(entry[0] || '').includes(':') ? entry[0] : fallbackCanonicalId);
    return canonical && pack ? { canonical_id: canonical, pack } : null;
  }
  const canonical = normalizePageCoreAlias(entry.canonical_id || fallbackCanonicalId);
  const pack = String(entry.pack || entry.path || '').trim();
  return canonical && pack ? { canonical_id: canonical, pack } : null;
}

function readPackRows(packPath) {
  if (!packPath) return null;
  if (historyPackCache.has(packPath)) {
    const cached = historyPackCache.get(packPath);
    historyPackCache.delete(packPath);
    historyPackCache.set(packPath, cached);
    return cached;
  }
  let indexed = null;
  for (const root of HISTORY_PACK_ROOTS) {
    const filePath = path.join(root, packPath);
    if (!fs.existsSync(filePath)) continue;
    indexed = new Map();
    const text = filePath.endsWith('.gz') ? readGzipText(filePath) : fs.readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        const canonical = normalizePageCoreAlias(row?.canonical_id);
        if (canonical) indexed.set(canonical, normalizeHistoryBars(row?.bars || []));
      } catch {
        // Ignore malformed pack rows; missing bars become a documented blocker.
      }
    }
    break;
  }
  historyPackCache.set(packPath, indexed);
  while (HISTORY_PACK_CACHE_LIMIT > 0 && historyPackCache.size > HISTORY_PACK_CACHE_LIMIT) {
    const oldestKey = historyPackCache.keys().next().value;
    historyPackCache.delete(oldestKey);
  }
  if (HISTORY_PACK_CACHE_LIMIT === 0) historyPackCache.delete(packPath);
  return indexed;
}

function readShardBars(symbol) {
  const clean = normalizePageCoreAlias(symbol).replace(/[^A-Z0-9.\-]/g, '');
  const shard = clean.charAt(0);
  if (!shard) return [];
  if (!historyShardCache.has(shard)) {
    const filePath = path.join(ROOT, 'public/data/eod/history/shards', `${shard}.json`);
    historyShardCache.set(shard, readJsonCached(filePath) || {});
  }
  const doc = historyShardCache.get(shard) || {};
  return normalizeHistoryBars(doc[clean] || doc[symbol] || []);
}

function historyPackPath(row) {
  return String(row?.pointers?.history_pack || row?.history_pack || '').trim();
}

function readHistoricalBars(canonicalId, symbol, registryRow = null) {
  let bars = readShardBars(symbol);
  const manifest = readFirstJson(HISTORY_MANIFEST_CANDIDATES);
  const lookup = readFirstJson(HISTORY_LOOKUP_CANDIDATES);
  const candidates = [
    normalizePageCoreAlias(canonicalId),
    normalizePageCoreAlias(symbol),
  ].filter(Boolean);
  const entries = [];
  entries.push(normalizePackEntry({ canonical_id: canonicalId, pack: historyPackPath(registryRow) }, canonicalId));
  for (const candidate of candidates) {
    entries.push(normalizePackEntry(lookup?.by_canonical_id?.[candidate], canonicalId));
    entries.push(normalizePackEntry(lookup?.by_symbol?.[candidate], canonicalId));
    entries.push(normalizePackEntry(manifest?.by_canonical_id?.[candidate], canonicalId));
    entries.push(normalizePackEntry(manifest?.by_symbol?.[candidate], canonicalId));
  }
  const unique = entries
    .filter(Boolean)
    .filter((entry, index, list) => list.findIndex((item) => item.pack === entry.pack && item.canonical_id === entry.canonical_id) === index);
  for (const entry of unique) {
    const indexed = readPackRows(entry.pack);
    const packBars = indexed?.get(entry.canonical_id) || indexed?.get(normalizePageCoreAlias(canonicalId)) || [];
    bars = mergeBars(bars, packBars);
  }
  return bars;
}

function lastTwo(values) {
  if (!Array.isArray(values) || values.length === 0) return [null, null];
  const last = numberOrNull(values[values.length - 1]);
  const prev = values.length > 1 ? numberOrNull(values[values.length - 2]) : null;
  return [last, prev];
}

function lastTwoBars(bars) {
  if (!Array.isArray(bars) || !bars.length) return [null, null];
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  return [numberOrNull(last?.close ?? last?.adjClose), numberOrNull(prev?.close ?? prev?.adjClose)];
}

function confidenceBucket(score) {
  const n = numberOrNull(score);
  if (n == null) return null;
  if (n >= 85) return 'high';
  if (n >= 65) return 'medium';
  if (n >= 45) return 'low';
  return 'very_low';
}

function buildMarketStatsMin({ marketPrices, marketStats, latestBar, consistency }) {
  if (!marketStats?.stats || !latestBar) return null;
  const stats = {};
  for (const field of MARKET_STATS_FIELDS) {
    const value = numberOrNull(marketStats.stats[field]);
    if (value != null) stats[field] = value;
  }
  return {
    as_of: marketStats.as_of || latestBar.date || null,
    latest_bar_date: latestBar.date || null,
    price_date: marketPrices?.date || null,
    price_source: marketPrices ? 'historical-bars' : null,
    stats_source: marketStats ? 'historical-indicators' : null,
    use_historical_basis: Boolean(marketPrices),
    key_levels_ready: consistency?.keyLevelsReady === true,
    issues: Array.isArray(consistency?.issues) ? consistency.issues : [],
    stats,
  };
}

function buildHistoricalMarketContext({ canonicalId, display, registryRow = null }) {
  const bars = readHistoricalBars(canonicalId, display, registryRow);
  const latestBar = bars.length ? bars[bars.length - 1] : null;
  const indicatorBars = bars.length > HISTORY_INDICATOR_BARS ? bars.slice(-HISTORY_INDICATOR_BARS) : bars;
  const indicatorResult = indicatorBars.length >= 2 ? computeIndicators(indicatorBars) : { indicators: [] };
  const indicators = Array.isArray(indicatorResult) ? indicatorResult : (indicatorResult?.indicators || []);
  const marketPrices = latestBar ? buildMarketPricesFromBar(latestBar, display, 'historical-bars') : null;
  const marketStats = indicators.length ? buildMarketStatsFromIndicators(indicators, display, latestBar?.date || null) : null;
  const consistency = assessMarketDataConsistency({ marketPrices, marketStats, latestBar });
  return {
    bars,
    latestBar,
    marketPrices,
    marketStats,
    consistency,
    marketStatsMin: buildMarketStatsMin({ marketPrices, marketStats, latestBar, consistency }),
  };
}

function buildPageCoreRow({ canonicalId, registryRow, decisionRow, lookupValue, targetMarketDate, generatedAt, runId, snapshotId }) {
  const display = normalizePageCoreAlias(registryRow?.symbol || (Array.isArray(lookupValue) ? lookupValue[0] : null) || canonicalId.split(':').pop());
  const name = registryRow?.name || (Array.isArray(lookupValue) ? lookupValue[1] : null) || display;
  const assetClass = normalizePageCoreAlias(registryRow?.type_norm || registryRow?.asset_class || (Array.isArray(lookupValue) ? lookupValue[5] : null) || 'UNKNOWN');
  const historyContext = buildHistoricalMarketContext({ canonicalId, display, registryRow });
  const [historyClose, historyPrevClose] = lastTwoBars(historyContext.bars);
  const [registryClose, registryPrevClose] = lastTwo(registryRow?._tmp_recent_closes);
  const lastClose = historyClose ?? registryClose;
  const prevClose = historyPrevClose ?? registryPrevClose;
  const priceSource = historyClose != null
    ? 'historical-bars'
    : (registryClose != null ? 'registry_tmp_recent_closes' : null);
  const dailyChangeAbs = lastClose != null && prevClose != null ? Number((lastClose - prevClose).toFixed(6)) : null;
  const dailyChangePct = dailyChangeAbs != null && prevClose ? Number(((dailyChangeAbs / prevClose) * 100).toFixed(6)) : null;
  const qualityStatus = decisionRow?.pipeline_status || (registryRow ? 'DEGRADED' : 'MISSING_DATA');
  const blockingReasons = Array.isArray(decisionRow?.blocking_reasons)
    ? decisionRow.blocking_reasons
    : registryRow ? [] : ['registry_row_missing'];
  const warnings = Array.isArray(decisionRow?.warnings) ? decisionRow.warnings.slice(0, 8) : [];
  if (!registryRow) warnings.push('registry_row_missing');
  if (!decisionRow) warnings.push('decision_bundle_missing');
  const asOf = historyContext.latestBar?.date || registryRow?.last_trade_date || decisionRow?.target_market_date || targetMarketDate || null;
  const staleAfter = asOf ? new Date(Date.parse(`${asOf}T00:00:00Z`) + 48 * 60 * 60 * 1000).toISOString() : null;
  const barsCount = Math.max(numberOrNull(registryRow?.bars_count) || 0, historyContext.bars.length || 0);
  const targetable = OPERATIONAL_ASSET_CLASSES.has(assetClass) && barsCount >= 200;
  const freshnessOk = targetMarketDate ? Boolean(asOf && asOf >= targetMarketDate) : Boolean(asOf);
  const riskLevel = String(decisionRow?.risk_assessment?.level || '').toUpperCase();
  const decisionOperational = Boolean(
    decisionRow
    && decisionRow.pipeline_status === 'OK'
    && ['BUY', 'WAIT'].includes(decisionRow.verdict)
    && blockingReasons.length === 0
    && riskLevel !== 'UNKNOWN'
  );
  const keyLevelsReady = historyContext.consistency?.keyLevelsReady === true;
  const historicalBasisOk = Boolean(
    priceSource === 'historical-bars'
    && historyContext.latestBar
    && historyContext.marketStats
    && historyContext.marketStatsMin
    && keyLevelsReady
  );
  const primaryBlocker = blockingReasons[0]
    || (!OPERATIONAL_ASSET_CLASSES.has(assetClass) ? 'asset_class_out_of_scope' : null)
    || (barsCount < 200 ? 'insufficient_history' : null)
    || (!historyContext.latestBar ? 'missing_historical_bar_basis' : null)
    || (!historyContext.marketStats ? 'missing_market_stats_basis' : null)
    || (priceSource !== 'historical-bars' ? 'non_canonical_price_source' : null)
    || (!keyLevelsReady ? 'key_levels_not_ready' : null)
    || (!freshnessOk ? 'bars_stale' : null)
    || (!decisionRow ? 'decision_bundle_missing' : null)
    || (!decisionOperational ? (riskLevel === 'UNKNOWN' ? 'risk_unknown' : 'decision_not_operational') : null)
    || warnings[0]
    || null;
  const uiBannerState = decisionOperational && targetable && historicalBasisOk && freshnessOk
    ? 'all_systems_operational'
    : primaryBlocker
      ? 'provider_or_data_reason'
      : 'degraded';
  const row = {
    ok: true,
    schema_version: PAGE_CORE_SCHEMA,
    run_id: runId,
    snapshot_id: snapshotId,
    target_market_date: targetMarketDate || null,
    canonical_asset_id: canonicalId,
    display_ticker: display,
    provider_ticker: registryRow?.provider_symbol || null,
    freshness: {
      status: asOf ? 'fresh' : 'missing',
      as_of: asOf,
      generated_at: generatedAt,
      stale_after: staleAfter,
    },
    identity: {
      name,
      country: registryRow?.country || (Array.isArray(lookupValue) ? lookupValue[3] : null) || null,
      exchange: registryRow?.exchange || (Array.isArray(lookupValue) ? lookupValue[2] : null) || null,
      sector: null,
      industry: null,
      asset_class: assetClass,
    },
    summary_min: {
      last_close: lastClose,
      daily_change_pct: dailyChangePct,
      daily_change_abs: dailyChangeAbs,
      market_cap: null,
      decision_verdict: decisionRow?.verdict || (registryRow ? 'WAIT' : 'WAIT_PIPELINE_INCOMPLETE'),
      decision_confidence_bucket: confidenceBucket(registryRow?.computed?.score_0_100 || decisionRow?.risk_assessment?.score),
      risk_level: riskLevel || null,
      learning_status: null,
      quality_status: qualityStatus,
      governance_status: decisionRow ? 'available' : 'unavailable',
    },
    governance_summary: {
      status: decisionRow ? String(decisionRow.pipeline_status || 'available').toLowerCase() : 'unavailable',
      evaluation_role: decisionRow?.evaluation_role || null,
      learning_gate_status: null,
      risk_level: riskLevel || null,
      blocking_reasons: blockingReasons,
      warnings,
    },
    coverage: {
      bars: barsCount || numberOrNull(registryRow?.bars_count),
      derived_daily: Boolean(decisionRow),
      governance: Boolean(decisionRow),
      fundamentals: false,
      forecast: false,
      ui_renderable: true,
    },
    price_source: priceSource,
    latest_bar_date: historyContext.latestBar?.date || null,
    stats_date: historyContext.marketStats?.as_of || null,
    core_status: historicalBasisOk && freshnessOk ? 'fresh' : 'degraded',
    market_stats_min: historyContext.marketStatsMin,
    key_levels_ready: keyLevelsReady,
    ui_banner_state: uiBannerState,
    primary_blocker: primaryBlocker,
    status_contract: {
      core_status: historicalBasisOk && freshnessOk ? 'fresh' : (asOf ? 'degraded' : 'missing'),
      page_core_status: uiBannerState === 'all_systems_operational' ? 'operational' : 'degraded',
      key_levels_status: keyLevelsReady && historyContext.marketStatsMin ? 'ready' : 'degraded',
      decision_status: decisionRow ? (decisionOperational ? 'operational' : 'degraded') : 'missing',
      risk_status: riskLevel && riskLevel !== 'UNKNOWN' ? 'available' : 'degraded',
      hist_status: historyContext.marketStatsMin ? 'available' : 'missing',
      breakout_status: 'missing',
      stock_detail_view_status: uiBannerState === 'all_systems_operational' ? 'operational' : 'degraded',
      strict_operational: uiBannerState === 'all_systems_operational',
      strict_blocking_reasons: primaryBlocker ? [primaryBlocker] : [],
    },
    historical_profile_summary: null,
    breakout_summary: null,
    module_links: {
      historical: `/api/v2/stocks/${encodeURIComponent(display)}/historical?asset_id=${encodeURIComponent(canonicalId)}`,
      fundamentals: `/api/fundamentals?ticker=${encodeURIComponent(display)}`,
      forecast: null,
      quote: `/api/v2/quote/${encodeURIComponent(display)}`,
    },
    meta: {
      source: 'page-core-builder',
      render_contract: 'critical_page_contract',
      warnings,
    },
  };
  const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (bytes > PAGE_CORE_TARGET_BYTES) row.meta.warnings = Array.from(new Set([...row.meta.warnings, 'row_over_target_size']));
  const hardBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  if (hardBytes > PAGE_CORE_HARD_BYTES) throw new Error(`PAGE_CORE_ROW_TOO_LARGE:${canonicalId}:${hardBytes}`);
  return row;
}

function basicValidateRow(row) {
  const required = ['ok', 'schema_version', 'run_id', 'snapshot_id', 'canonical_asset_id', 'display_ticker', 'freshness', 'identity', 'summary_min', 'governance_summary', 'coverage', 'module_links', 'meta'];
  return required.every((key) => row[key] !== undefined) && row.schema_version === PAGE_CORE_SCHEMA;
}

function buildSchemaValidator() {
  const schema = readJson(PAGE_CORE_SCHEMA_PATH);
  const ajv = new Ajv2020({ strict: false, allErrors: false });
  return ajv.compile(schema);
}

function ensureEmptyDir(dirPath, replace) {
  if (fs.existsSync(dirPath)) {
    if (!replace) throw new Error(`OUTPUT_EXISTS:${dirPath}`);
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeGzipJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = JSON.stringify(payload);
  const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 });
  fs.writeFileSync(filePath, gz);
  return { bytes: gz.length, hash: sha256Prefix(gz) };
}

function buildBundle(opts) {
  const generatedAt = new Date().toISOString();
  const scopeIds = readScopeIds();
  if (!scopeIds.size) {
    for (const canonical of readOperabilityIds()) scopeIds.add(canonical);
  }
  const registryRows = readRegistryRows();
  const registryById = new Map(registryRows.map((row) => [normalizePageCoreAlias(row.canonical_id), row]));
  const searchExact = readSearchExact();
  const lookupExact = readSymbolLookup();
  const decisions = readDecisionRows();
  const { aliases, collisions } = buildAliasMap({ lookupExact, searchExact, registryRows, scopeIds });
  const snapshotId = buildPageCoreSnapshotId({
    runId: opts.runId,
    targetMarketDate: opts.targetMarketDate,
    manifestSeed: `${opts.manifestSeed}|${Object.keys(aliases).length}|${scopeIds.size}`,
  });
  let canonicalIds = Array.from(scopeIds).filter(Boolean).sort((a, b) => {
    const ap = historyPackPath(registryById.get(a));
    const bp = historyPackPath(registryById.get(b));
    if (ap !== bp) return ap.localeCompare(bp);
    return a.localeCompare(b);
  });
  if (opts.maxAssets) canonicalIds = canonicalIds.slice(0, opts.maxAssets);

  const rows = [];
  const lookupByCanonical = new Map();
  for (const value of Object.values(lookupExact)) {
    const canonical = maybeCanonicalFromLookup(value);
    if (canonical) lookupByCanonical.set(canonical, value);
  }
  for (const canonicalId of canonicalIds) {
    const row = buildPageCoreRow({
      canonicalId,
      registryRow: registryById.get(canonicalId) || null,
      decisionRow: decisions.get(canonicalId) || null,
      lookupValue: lookupByCanonical.get(canonicalId) || null,
      targetMarketDate: opts.targetMarketDate,
      generatedAt,
      runId: opts.runId,
      snapshotId,
    });
    rows.push(row);
  }

  const validateSchema = buildSchemaValidator();
  const invalid = [];
  const validRows = rows.filter((row) => {
    const ok = basicValidateRow(row) && validateSchema(row);
    if (!ok && invalid.length < 5) invalid.push({ canonical_id: row?.canonical_asset_id || null, errors: validateSchema.errors || [] });
    return ok;
  }).length;
  const schemaValidRate = rows.length ? validRows / rows.length : 0;
  if (schemaValidRate < 0.999) throw new Error(`PAGE_CORE_SCHEMA_VALID_RATE_LOW:${schemaValidRate}:${JSON.stringify(invalid)}`);

  const aliasShards = Array.from({ length: ALIAS_SHARD_COUNT }, () => ({}));
  for (const [alias, canonical] of Object.entries(aliases)) {
    aliasShards[aliasShardIndex(alias)][alias] = canonical;
  }

  const pageShards = Array.from({ length: PAGE_SHARD_COUNT }, () => ({}));
  for (const row of rows) {
    pageShards[pageShardIndex(row.canonical_asset_id)][row.canonical_asset_id] = row;
  }

  const rowBytes = rows.map((row) => Buffer.byteLength(JSON.stringify(row), 'utf8'));
  const overTarget = rowBytes.filter((value) => value > PAGE_CORE_TARGET_BYTES).length;
  const overHard = rowBytes.filter((value) => value > PAGE_CORE_HARD_BYTES).length;
  if (overHard > 0) throw new Error(`PAGE_CORE_HARD_SIZE_VIOLATION:${overHard}`);

  const manifest = {
    schema: 'rv.page_core_manifest.v1',
    schema_version: '1.0',
    status: 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
    alias_collision_count: collisions.filter((item) => item.resolution === 'omitted_ambiguous').length,
    row_size: {
      target_bytes: PAGE_CORE_TARGET_BYTES,
      hard_bytes: PAGE_CORE_HARD_BYTES,
      max_bytes: Math.max(...rowBytes, 0),
      over_target_count: overTarget,
      over_hard_count: overHard,
    },
    validation: {
      ok: schemaValidRate >= 0.999 && overHard === 0,
      schema_valid_rate: schemaValidRate,
      protected_aliases: Object.fromEntries(Array.from(PROTECTED_ALIASES.entries()).map(([alias, expected]) => [alias, aliases[alias] || null])),
    },
    paths: {
      latest_candidate: '/data/page-core/candidates/latest.candidate.json',
      snapshot_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}`,
      manifest_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/manifest.json`,
      alias_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/alias-shards`,
      page_shards_path: `/data/page-core/snapshots/${opts.targetMarketDate}/${snapshotId}/page-shards`,
    },
  };

  const pointer = {
    schema: 'rv.page_core_latest.v1',
    schema_version: '1.0',
    status: opts.promote ? 'ACTIVE' : 'STAGED',
    run_id: opts.runId,
    snapshot_id: snapshotId,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    valid_until: new Date(Date.parse(generatedAt) + 48 * 60 * 60 * 1000).toISOString(),
    snapshot_path: manifest.paths.snapshot_path,
    manifest_path: manifest.paths.manifest_path,
    schema_version_payload: PAGE_CORE_SCHEMA,
    alias_shard_count: ALIAS_SHARD_COUNT,
    page_shard_count: PAGE_SHARD_COUNT,
    asset_count: rows.length,
    alias_count: Object.keys(aliases).length,
  };

  return { snapshotId, manifest, pointer, aliasShards, pageShards, rows, collisions };
}

function writeBundle(opts, bundle) {
  const snapshotDir = path.join(opts.pageCoreRoot, 'snapshots', opts.targetMarketDate, bundle.snapshotId);
  ensureEmptyDir(snapshotDir, opts.replace);
  const aliasDir = path.join(snapshotDir, 'alias-shards');
  const pageDir = path.join(snapshotDir, 'page-shards');
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.mkdirSync(pageDir, { recursive: true });

  const aliasFiles = [];
  for (let i = 0; i < ALIAS_SHARD_COUNT; i += 1) {
    const file = path.join(aliasDir, aliasShardName(i));
    const stats = writeGzipJson(file, bundle.aliasShards[i]);
    if (stats.bytes > ALIAS_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_ALIAS_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    aliasFiles.push({ shard: i, ...stats });
  }
  const pageFiles = [];
  for (let i = 0; i < PAGE_SHARD_COUNT; i += 1) {
    const file = path.join(pageDir, pageShardName(i));
    const stats = writeGzipJson(file, bundle.pageShards[i]);
    if (stats.bytes > PAGE_SHARD_MAX_BYTES) throw new Error(`PAGE_CORE_PAGE_SHARD_TOO_LARGE:${i}:${stats.bytes}`);
    pageFiles.push({ shard: i, ...stats });
  }

  const manifest = {
    ...bundle.manifest,
    alias_files: aliasFiles,
    page_files: pageFiles,
    bundle_hash: sha256Prefix(stableStringify({
      pointer: bundle.pointer,
      alias_files: aliasFiles,
      page_files: pageFiles,
    })),
  };
  writeJsonAtomic(path.join(snapshotDir, 'manifest.json'), manifest);
  writeJsonAtomic(path.join(opts.pageCoreRoot, 'candidates/latest.candidate.json'), {
    ...bundle.pointer,
    status: 'STAGED',
    bundle_hash: manifest.bundle_hash,
  });
  if (opts.promote) {
    writeJsonAtomic(path.join(opts.pageCoreRoot, 'latest.json'), {
      ...bundle.pointer,
      status: 'ACTIVE',
      bundle_hash: manifest.bundle_hash,
    });
  }
  return manifest;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.targetMarketDate) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const bundle = buildBundle(opts);
  if (opts.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      snapshot_id: bundle.snapshotId,
      asset_count: bundle.rows.length,
      alias_count: Object.keys(bundle.aliasShards.reduce((acc, shard) => Object.assign(acc, shard), {})).length,
      collisions: bundle.collisions.length,
      validation: bundle.manifest.validation,
    }, null, 2));
    return;
  }
  const manifest = writeBundle(opts, bundle);
  console.log(JSON.stringify({
    ok: true,
    snapshot_id: bundle.snapshotId,
    promoted: opts.promote,
    snapshot_path: manifest.paths.snapshot_path,
    asset_count: manifest.asset_count,
    alias_count: manifest.alias_count,
    alias_collision_count: manifest.alias_collision_count,
    max_row_bytes: manifest.row_size.max_bytes,
    bundle_hash: manifest.bundle_hash,
  }, null, 2));
}

main();
