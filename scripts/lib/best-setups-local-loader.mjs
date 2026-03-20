import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

import { computeIndicators } from '../../functions/api/_shared/eod-indicators.mjs';
import { buildStockInsightsV4Evaluation } from '../../functions/api/_shared/stock-insights-v4.js';
import { assembleDecisionInputs } from '../../functions/api/_shared/decision-input-assembly.js';

export const REPO_ROOT = process.cwd();
const SEARCH_EXACT_PATH = 'public/data/universe/v7/search/search_exact_by_symbol.json.gz';
const STOCK_SYMBOLS_PATH = 'public/data/universe/v7/ssot/stocks.max.symbols.json';
const REGISTRY_PATH = 'public/data/universe/v7/registry/registry.ndjson.gz';
const EOD_LATEST_PATH = 'public/data/v3/eod/US/latest.ndjson.gz';
const HISTORY_BASE = 'mirrors/universe-v7';

const jsonCache = new Map();
let searchExactCache = null;
let stockSymbolsCache = null;
let registryIndexCache = null;

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  return ticker || null;
}

function normalizeCanonicalId(value) {
  const canonicalId = String(value || '').trim().toUpperCase();
  return canonicalId || null;
}

function compareRegistryRows(a, b) {
  const qualityRank = (row) => {
    const basis = String(row?.quality_basis || '').trim().toLowerCase();
    if (basis === 'backfill_real') return 3;
    if (basis === 'daily_bulk_estimate') return 2;
    if (basis === 'estimate') return 1;
    return 0;
  };

  const qa = qualityRank(a);
  const qb = qualityRank(b);
  if (qa !== qb) return qa - qb;

  const ba = Number(a?.bars_count || 0);
  const bb = Number(b?.bars_count || 0);
  if (ba !== bb) return ba - bb;

  const da = String(a?.last_trade_date || '');
  const db = String(b?.last_trade_date || '');
  if (da !== db) return da.localeCompare(db);

  return String(a?.canonical_id || '').localeCompare(String(b?.canonical_id || ''));
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const date = String(row?.date || row?.trading_date || '').slice(0, 10);
      const close = toFinite(row?.adjusted_close ?? row?.adjClose ?? row?.adj_close ?? row?.close);
      if (!date || close == null || close <= 0) return null;
      const open = toFinite(row?.open) ?? close;
      const high = toFinite(row?.high) ?? close;
      const low = toFinite(row?.low) ?? close;
      const volume = toFinite(row?.volume) ?? 0;
      return {
        date,
        open,
        high,
        low,
        close,
        adjClose: close,
        volume,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeRegistryRow(row = {}) {
  const symbol = normalizeTicker(row?.symbol);
  const canonicalId = normalizeCanonicalId(row?.canonical_id);
  if (!symbol || !canonicalId) return null;
  return {
    symbol,
    canonical_id: canonicalId,
    exchange: normalizeTicker(row?.exchange) || (canonicalId.includes(':') ? canonicalId.split(':')[0] : null),
    type_norm: String(row?.type_norm || '').trim().toUpperCase() || null,
    bars_count: Number(row?.bars_count || 0),
    last_trade_date: String(row?.last_trade_date || '').slice(0, 10) || null,
    quality_basis: String(row?.quality_basis || row?._quality_basis || '').trim() || null,
    history_pack: String(row?.pointers?.history_pack || row?.history_pack || '').trim() || null,
    name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : null,
  };
}

export function resolveLocalAssetPath(relPath) {
  const normalized = String(relPath || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith('/public/')) return path.join(REPO_ROOT, normalized.slice(1));
  if (normalized.startsWith('/data/')) return path.join(REPO_ROOT, 'public', normalized.slice(1));
  if (normalized.startsWith('/')) return path.join(REPO_ROOT, normalized.slice(1));
  return path.join(REPO_ROOT, normalized);
}

export async function readJsonAbs(absPath) {
  const cached = jsonCache.get(absPath);
  if (cached) return cached;
  try {
    const payload = JSON.parse(await fs.readFile(absPath, 'utf8'));
    jsonCache.set(absPath, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function readJsonGzAbs(absPath) {
  const cached = jsonCache.get(absPath);
  if (cached) return cached;
  try {
    const raw = await fs.readFile(absPath);
    const payload = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
    jsonCache.set(absPath, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function readNdjsonGzAbs(absPath) {
  try {
    const raw = await fs.readFile(absPath);
    return zlib.gunzipSync(raw)
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function localFetchJson(relPath) {
  const absPath = resolveLocalAssetPath(relPath);
  if (!absPath) return null;
  return readJsonAbs(absPath);
}

async function loadSearchExact() {
  if (searchExactCache) return searchExactCache;
  searchExactCache = await readJsonGzAbs(path.join(REPO_ROOT, SEARCH_EXACT_PATH));
  return searchExactCache;
}

async function loadStockSymbols() {
  if (stockSymbolsCache) return stockSymbolsCache;
  const doc = await readJsonAbs(path.join(REPO_ROOT, STOCK_SYMBOLS_PATH));
  const symbols = Array.isArray(doc?.symbols) ? doc.symbols : [];
  stockSymbolsCache = new Set(symbols.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean));
  return stockSymbolsCache;
}

async function loadRegistryIndex() {
  if (registryIndexCache) return registryIndexCache;
  const rows = await readNdjsonGzAbs(path.join(REPO_ROOT, REGISTRY_PATH));
  const byCanonical = new Map();
  const bySymbol = new Map();
  const bySymbolCandidates = new Map();
  for (const raw of rows) {
    const row = normalizeRegistryRow(raw);
    if (!row) continue;
    byCanonical.set(row.canonical_id, row);
    if (!bySymbolCandidates.has(row.symbol)) bySymbolCandidates.set(row.symbol, []);
    bySymbolCandidates.get(row.symbol).push(row);
    const prev = bySymbol.get(row.symbol);
    if (!prev || compareRegistryRows(row, prev) > 0) {
      bySymbol.set(row.symbol, row);
    }
  }
  for (const [symbol, candidates] of bySymbolCandidates.entries()) {
    bySymbolCandidates.set(symbol, candidates.sort((a, b) => compareRegistryRows(b, a)));
  }
  registryIndexCache = { byCanonical, bySymbol, bySymbolCandidates };
  return registryIndexCache;
}

export async function resolveLocalAssetMeta(ticker) {
  const cleanTicker = normalizeTicker(ticker);
  if (!cleanTicker) return null;
  const [searchExactDoc, registryIndex] = await Promise.all([
    loadSearchExact(),
    loadRegistryIndex(),
  ]);
  const searchExact = searchExactDoc?.by_symbol?.[cleanTicker] || null;
  const canonicalId = normalizeCanonicalId(searchExact?.canonical_id);
  const byCanonical = canonicalId ? registryIndex.byCanonical.get(canonicalId) : null;
  const bySymbol = registryIndex.bySymbol.get(cleanTicker) || null;
  const symbolCandidates = registryIndex.bySymbolCandidates.get(cleanTicker) || [];
  const resolved = byCanonical || bySymbol || null;
  if (!resolved && !searchExact) return null;
  return {
    ticker: cleanTicker,
    canonical_id: resolved?.canonical_id || canonicalId || null,
    exchange: resolved?.exchange || normalizeTicker(searchExact?.exchange) || (canonicalId?.includes(':') ? canonicalId.split(':')[0] : null),
    type_norm: resolved?.type_norm || String(searchExact?.type_norm || '').trim().toUpperCase() || null,
    bars_count: Number(resolved?.bars_count || searchExact?.bars_count || 0),
    history_pack: resolved?.history_pack || null,
    history_pack_candidates: symbolCandidates.map((candidate) => candidate.history_pack).filter(Boolean),
    name: resolved?.name || (typeof searchExact?.name === 'string' && searchExact.name.trim() ? searchExact.name.trim() : null),
    country: typeof searchExact?.country === 'string' && searchExact.country.trim() ? searchExact.country.trim() : null,
    exists_in_universe: Boolean(resolved || searchExact),
  };
}

async function loadBarsFromHistoryPack(assetMeta) {
  const canonicalId = normalizeCanonicalId(assetMeta?.canonical_id);
  const packCandidates = Array.from(new Set([
    String(assetMeta?.history_pack || '').trim(),
    ...((Array.isArray(assetMeta?.history_pack_candidates) ? assetMeta.history_pack_candidates : []).map((value) => String(value || '').trim())),
  ].filter(Boolean)));
  if (!packCandidates.length) return [];
  for (const historyPack of packCandidates) {
    const candidates = [
      path.join(REPO_ROOT, HISTORY_BASE, historyPack),
      path.join(REPO_ROOT, 'public/data/universe/v7', historyPack),
    ];
    for (const absPath of candidates) {
      const rows = await readNdjsonGzAbs(absPath);
      if (!rows.length) continue;
      const hit = rows.find((row) => !canonicalId || normalizeCanonicalId(row?.canonical_id) === canonicalId) || rows[0] || null;
      if (!hit) continue;
      const bars = normalizeRows(hit?.bars || []);
      if (bars.length) return bars;
    }
  }
  return [];
}

export async function loadLocalBars(ticker) {
  const cleanTicker = normalizeTicker(ticker);
  if (!cleanTicker) return [];

  const seriesRows = await readNdjsonGzAbs(path.join(REPO_ROOT, `public/data/v3/series/adjusted/US__${cleanTicker}.ndjson.gz`));
  const seriesBars = normalizeRows(seriesRows);
  if (seriesBars.length) return seriesBars;

  const assetMeta = await resolveLocalAssetMeta(cleanTicker);
  const packBars = await loadBarsFromHistoryPack(assetMeta);
  if (packBars.length) return packBars;

  const shard = cleanTicker.charAt(0) || '_';
  const shardDoc = await readJsonAbs(path.join(REPO_ROOT, `public/data/eod/history/shards/${shard}.json`));
  const shardBars = Array.isArray(shardDoc?.[cleanTicker])
    ? shardDoc[cleanTicker].map((b) => ({
        date: b[0],
        open: b[1],
        high: b[2],
        low: b[3],
        close: b[4],
        adjClose: b[5],
        volume: b[6],
      }))
    : [];
  if (shardBars.length) return shardBars;

  const latestRows = await readNdjsonGzAbs(path.join(REPO_ROOT, EOD_LATEST_PATH));
  const latestHit = latestRows.find((row) => String(row?.ticker || row?.symbol || '').toUpperCase() === cleanTicker);
  return normalizeRows(latestHit ? [latestHit] : []);
}

export async function loadLocalCoreInputs(ticker) {
  const cleanTicker = normalizeTicker(ticker);
  const bars = await loadLocalBars(cleanTicker);
  const indicatorOut = computeIndicators(bars);
  const stats = Object.fromEntries(
    (Array.isArray(indicatorOut?.indicators) ? indicatorOut.indicators : [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item.value]),
  );

  const [searchExactDoc, symbolSet, assetMeta] = await Promise.all([
    loadSearchExact(),
    loadStockSymbols(),
    resolveLocalAssetMeta(cleanTicker),
  ]);

  const searchExact = searchExactDoc?.by_symbol?.[cleanTicker] || null;
  const canonical = String(assetMeta?.canonical_id || searchExact?.canonical_id || '').trim();
  const canonicalExchange = canonical.includes(':') ? canonical.split(':')[0] : null;
  const exchange = String(assetMeta?.exchange || searchExact?.exchange || canonicalExchange || '').trim() || null;
  const universe = {
    symbol: cleanTicker,
    exists_in_universe: Boolean(assetMeta?.exists_in_universe || symbolSet.has(cleanTicker)),
    name: assetMeta?.name || (typeof searchExact?.name === 'string' && searchExact.name.trim() ? searchExact.name.trim() : null),
    exchange,
    currency: null,
    country: assetMeta?.country || null,
    asset_class: assetMeta?.type_norm === 'ETF' ? 'etf' : 'stock',
    sector: null,
    industry: null,
    indexes: [],
    membership: {
      in_dj30: false,
      in_sp500: false,
      in_ndx100: false,
      in_rut2000: false,
    },
    updated_at: assetMeta?.last_trade_date || (typeof searchExact?.last_trade_date === 'string' ? searchExact.last_trade_date : null),
  };

  return {
    bars,
    stats,
    universe,
    as_of: bars[bars.length - 1]?.date || null,
  };
}

export async function evaluateTickerViaSharedCore(ticker) {
  const decisionInputs = await assembleDecisionInputs(ticker, {
    fetchJson: localFetchJson,
    loadCoreInputs: loadLocalCoreInputs,
  });

  return buildStockInsightsV4Evaluation({
    ticker,
    bars: decisionInputs.bars,
    stats: decisionInputs.stats,
    universe: decisionInputs.universe,
    scientificState: decisionInputs.scientificState,
    forecastState: decisionInputs.forecastState,
    elliottState: decisionInputs.elliottState,
    quantlabState: decisionInputs.quantlabState,
    forecastMeta: decisionInputs.forecastMeta,
    inputFingerprints: decisionInputs.input_fingerprints,
    runtimeControl: decisionInputs.runtimeControl,
  });
}
