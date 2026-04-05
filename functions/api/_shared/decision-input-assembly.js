// Shared input assembly for the V4 decision pipeline.
// This module centralizes model-state loading and provides a full
// decision-input contract that can be reused by API endpoints and
// offline snapshot builders.

import { computeIndicators } from './eod-indicators.mjs';
import { getStaticBars } from './history-store.mjs';
import { makeContractState, REASON_CODES } from './stock-insights-v4.js';
import { buildAssetSegmentationProfile } from './asset-segmentation.mjs';

function pickAsOf(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return null;
}

function shardKeyForTicker(ticker) {
  const first = String(ticker || '').charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : '_';
}

function classifyElliottPayload(doc) {
  const version = String(doc?.meta?.version || '').trim().toLowerCase();
  const source = String(doc?.meta?.source || '').trim().toLowerCase();
  const bridgeFlag = doc?.data?.debug?.bridge === true;
  let isBridge = bridgeFlag || version.startsWith('rv_marketphase_bridge_') || source === 'marketphase_deep_summary';
  if (isBridge) {
    const barsCount = Number(doc?.data?.debug?.bars_count || 0);
    const features = doc?.data?.features || {};
    const hasCoreFeatures = Number.isFinite(Number(features.RSI))
      && Number.isFinite(Number(features.MACDHist))
      && Number.isFinite(Number(features.SMA50))
      && Number.isFinite(Number(features.SMA200));
    if (barsCount >= 200 && hasCoreFeatures) {
      return { isBridge: false, sourceKind: 'bridge_promoted' };
    }
  }
  return { isBridge, sourceKind: isBridge ? 'bridge' : 'deep' };
}

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapIndicatorsToStats(indicators) {
  const stats = {};
  for (const item of Array.isArray(indicators) ? indicators : []) {
    if (!item || typeof item.id !== 'string') continue;
    stats[item.id] = item.value;
  }
  return stats;
}

function buildUniversePayload({ ticker, searchExact, universeSymbols }) {
  const canonical = String(searchExact?.canonical_id || '').trim();
  const canonicalExchange = canonical.includes(':') ? canonical.split(':')[0] : null;
  const exchange = String(searchExact?.exchange || canonicalExchange || '').trim() || null;
  const country = String(searchExact?.country || '').trim() || null;
  return {
    symbol: ticker,
    exists_in_universe: universeSymbols ? universeSymbols.has(ticker) : Boolean(searchExact),
    name: typeof searchExact?.name === 'string' && searchExact.name.trim() ? searchExact.name.trim() : null,
    exchange,
    currency: null,
    country,
    sector: null,
    industry: null,
    indexes: [],
    membership: {
      in_dj30: false,
      in_sp500: false,
      in_ndx100: false,
      in_rut2000: false,
    },
    updated_at: typeof searchExact?.last_trade_date === 'string' ? searchExact.last_trade_date : null,
  };
}

function buildInputFingerprints({ ticker, bars, stats, universe, scientificState, forecastState, elliottState, quantlabState, as_of }) {
  return {
    ticker,
    as_of: as_of || null,
    bars: {
      count: Array.isArray(bars) ? bars.length : 0,
      first_date: Array.isArray(bars) && bars.length ? bars[0]?.date || null : null,
      last_date: Array.isArray(bars) && bars.length ? bars[bars.length - 1]?.date || null : null,
    },
    stats: {
      keys: Object.keys(stats || {}).sort(),
      sma20: toFinite(stats?.sma20),
      sma50: toFinite(stats?.sma50),
      sma200: toFinite(stats?.sma200),
      rsi14: toFinite(stats?.rsi14),
      macd_hist: toFinite(stats?.macd_hist),
      volatility_percentile: toFinite(stats?.volatility_percentile),
    },
    universe: {
      exists_in_universe: Boolean(universe?.exists_in_universe),
      exchange: universe?.exchange || null,
      country: universe?.country || null,
    },
    scientific: {
      as_of: scientificState?.as_of || null,
      status: scientificState?.status || null,
      source: scientificState?.source || null,
    },
    forecast: {
      as_of: forecastState?.as_of || null,
      status: forecastState?.status || null,
      source: forecastState?.source || null,
    },
    elliott: {
      as_of: elliottState?.as_of || null,
      status: elliottState?.status || null,
      source: elliottState?.source || null,
    },
    quantlab: {
      as_of: quantlabState?.as_of || null,
      status: quantlabState?.status || null,
      source: quantlabState?.source || null,
      asset_class: quantlabState?.value?.assetClass || null,
    },
    segmentation: {
      market_cap_bucket: stats?.market_cap_bucket || null,
      liquidity_bucket: stats?.liquidity_bucket || null,
      learning_lane: stats?.learning_lane || null,
      blue_chip_core: stats?.blue_chip_core === true,
    },
  };
}

async function fetchJsonMaybeGzip(path, { request, assetFetcher } = {}) {
  try {
    const base = new URL(request.url);
    const url = new URL(path, base);
    const response = assetFetcher
      ? await assetFetcher.fetch(url.toString())
      : await fetch(url.toString());
    if (!response.ok) return null;

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const contentEncoding = String(response.headers.get('content-encoding') || '').toLowerCase();
    const isGzip = path.endsWith('.gz')
      || contentEncoding.includes('gzip')
      || contentType.includes('application/gzip')
      || contentType.includes('application/x-gzip');

    if (!isGzip) {
      return await response.json();
    }

    if (typeof DecompressionStream === 'function' && response.body) {
      const clone = response.clone();
      try {
        const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(decompressed).text();
        return JSON.parse(text);
      } catch {
        return await clone.json();
      }
    }

    return await response.json();
  } catch {
    return null;
  }
}

let _v2IndexCache = null;
let _v2IndexTs = 0;
const _shardCache = new Map();
let _searchExactCache = null;
let _searchExactTs = 0;
let _stockSetCache = null;
let _stockSetTs = 0;
const _quantlabShardCache = new Map();
let _runtimeControlCache = null;
let _runtimeControlTs = 0;
const CACHE_TTL = 600_000;

async function loadSearchExact(request, assetFetcher) {
  const now = Date.now();
  if (_searchExactCache && (now - _searchExactTs) < CACHE_TTL) return _searchExactCache;
  const payload = await fetchJsonMaybeGzip('/data/universe/v7/search/search_exact_by_symbol.json.gz', { request, assetFetcher });
  if (payload) {
    _searchExactCache = payload;
    _searchExactTs = now;
  }
  return _searchExactCache;
}

async function loadUniverseSymbols(fetchJson) {
  const now = Date.now();
  if (_stockSetCache && (now - _stockSetTs) < CACHE_TTL) return _stockSetCache;
  const payload = await fetchJson('/data/universe/v7/ssot/stocks.max.symbols.json');
  const symbols = Array.isArray(payload?.symbols) ? payload.symbols : [];
  const set = new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean));
  if (set.size) {
    _stockSetCache = set;
    _stockSetTs = now;
  }
  return _stockSetCache;
}

export async function loadRequestCoreInputs(ticker, { request, assetFetcher = null, fetchJson }) {
  const origin = new URL(request.url).origin;
  const bars = await getStaticBars(ticker, origin) || [];
  const indicatorOut = computeIndicators(Array.isArray(bars) ? bars : []);
  const stats = mapIndicatorsToStats(indicatorOut?.indicators || []);
  const fundamentals = await fetchJson(`/data/fundamentals/${encodeURIComponent(String(ticker || '').toUpperCase())}.json`);
  // Skip loading large gzip files (search_exact_by_symbol.json.gz, stocks.max.symbols.json)
  // to prevent Worker memory limit exceeded on Cloudflare Pages.
  const universe = buildUniversePayload({ ticker, searchExact: null, universeSymbols: null });
  const segmentationProfile = buildAssetSegmentationProfile({
    ticker,
    assetClass: 'stock',
    marketCapUsd: fundamentals?.marketCap,
    liquidityScore: stats?.liquidity_score,
    liquidityState: null,
    exchange: universe?.exchange,
  });
  stats.market_cap = fundamentals?.marketCap ?? null;
  stats.market_cap_bucket = segmentationProfile.market_cap_bucket;
  stats.liquidity_bucket = segmentationProfile.liquidity_bucket;
  stats.learning_lane = segmentationProfile.learning_lane;
  stats.blue_chip_core = segmentationProfile.blue_chip_core === true;
  const as_of = Array.isArray(bars) && bars.length ? bars[bars.length - 1]?.date || null : null;
  return { bars, stats, universe, fundamentals, segmentationProfile, as_of };
}

async function loadQuantlabState(ticker, { fetchJson }) {
  const tickerBase = ticker.includes('.') ? ticker.split('.')[0] : ticker;
  const shard = shardKeyForTicker(tickerBase);
  const now = Date.now();
  const cacheKey = `${shard}`;
  let shardDocs = _quantlabShardCache.get(cacheKey);
  if (!shardDocs || (now - shardDocs.time) >= CACHE_TTL) {
    const [stocksDoc, etfsDoc] = await Promise.all([
      fetchJson(`/data/quantlab/stock-insights/stocks/${shard}.json`),
      fetchJson(`/data/quantlab/stock-insights/etfs/${shard}.json`),
    ]);
    shardDocs = { time: now, stocksDoc, etfsDoc };
    _quantlabShardCache.set(cacheKey, shardDocs);
  }

  const candidates = [shardDocs.stocksDoc, shardDocs.etfsDoc];
  for (const doc of candidates) {
    const row = doc?.byTicker?.[ticker] || doc?.byTicker?.[tickerBase] || null;
    if (!row) continue;
    return makeContractState(row, {
      as_of: pickAsOf(row?.asOfDate, doc?.asOfDate, doc?.generatedAt),
      source: row?.assetClass === 'etf' ? 'quantlab.stock-insights.etfs' : 'quantlab.stock-insights.stocks',
      status: 'ok',
      reason: REASON_CODES.OK,
    });
  }

  return makeContractState(null, {
    as_of: null,
    source: 'quantlab.stock-insights',
    status: 'unavailable',
    reason: REASON_CODES.MISSING_QUANTLAB_ENTRY || REASON_CODES.NO_DATA,
  });
}

async function loadDecisionRuntimeControl(fetchJson) {
  const now = Date.now();
  if (_runtimeControlCache && (now - _runtimeControlTs) < CACHE_TTL) return _runtimeControlCache;
  const [report, policy] = await Promise.all([
    fetchJson('/data/reports/learning-report-latest.json'),
    fetchJson('/policies/best-setups.v1.json')
  ]);
  const stockAnalyzer = report?.features?.stock_analyzer || {};
  const control = {
    learning_status: stockAnalyzer?.learning_status || report?.best_setups_policy?.learning_status_current || 'BOOTSTRAP',
    safety_switch: stockAnalyzer?.safety_switch || null,
    policy: policy || null,
  };
  _runtimeControlCache = control;
  _runtimeControlTs = now;
  return control;
}

export async function assembleModelStates(ticker, { fetchJson }) {
  const now = Date.now();
  const tickerBase = ticker.includes('.') ? ticker.split('.')[0] : ticker;
  const sKey = shardKeyForTicker(tickerBase);
  const shardPath = `/data/features-v2/stock-insights/shards/${sKey}.json`;
  const indexPath = '/data/features-v2/stock-insights/index.json';

  const [indexResult, shardResult, mpResult] = await Promise.allSettled([
    (async () => {
      if (_v2IndexCache && (now - _v2IndexTs < CACHE_TTL)) return _v2IndexCache;
      const data = await fetchJson(indexPath);
      if (data) {
        _v2IndexCache = data;
        _v2IndexTs = now;
      }
      return _v2IndexCache;
    })(),
    (async () => {
      const cached = _shardCache.get(sKey);
      if (cached && (now - cached.time < CACHE_TTL)) return cached.data;
      const data = await fetchJson(shardPath);
      if (data) _shardCache.set(sKey, { data, time: now });
      return data;
    })(),
    (async () => {
      const doc = await fetchJson(`/data/marketphase/${ticker}.json`);
      if (doc) return doc;
      if (ticker.includes('.')) return fetchJson(`/data/marketphase/${tickerBase}.json`);
      return null;
    })(),
  ]);

  const indexDoc = indexResult.status === 'fulfilled' ? indexResult.value : null;
  const shardDoc = shardResult.status === 'fulfilled' ? shardResult.value : null;
  const mpDoc = mpResult.status === 'fulfilled' ? mpResult.value : null;

  const idxRow = indexDoc?.rows?.[ticker] || indexDoc?.rows?.[tickerBase] || null;
  const shardRow = shardDoc?.rows?.[ticker] || shardDoc?.rows?.[tickerBase] || null;

  const scientific = shardRow?.scientific?.value || null;
  const scientificReason = shardRow?.scientific?.reason
    || (shardDoc ? 'NO_RECOMMENDATION' : 'MISSING_SCIENTIFIC_ENTRY');

  const scientificState = makeContractState(scientific, {
    as_of: pickAsOf(idxRow?.scientific?.as_of, shardRow?.scientific?.as_of),
    source: idxRow?.scientific?.source || shardRow?.scientific?.source || 'stock-analysis.snapshot',
    status: idxRow?.scientific?.status || shardRow?.scientific?.status || (scientific ? 'ok' : 'unavailable'),
    reason: idxRow?.scientific?.reason || (scientificReason === 'MISSING_SCIENTIFIC_ENTRY' && shardDoc ? 'NO_RECOMMENDATION' : scientificReason),
  });

  const forecast = shardRow?.forecast?.value || null;
  const forecastMeta = forecast ? {
    as_of: shardRow?.forecast?.as_of,
    source: shardRow?.forecast?.source,
  } : null;

  const forecastState = makeContractState(forecast, {
    as_of: pickAsOf(idxRow?.forecast?.as_of, shardRow?.forecast?.as_of),
    source: idxRow?.forecast?.source || shardRow?.forecast?.source || 'forecast.latest',
    status: idxRow?.forecast?.status || shardRow?.forecast?.status || (forecast ? 'ok' : 'unavailable'),
    reason: idxRow?.forecast?.reason || shardRow?.forecast?.reason || (forecast ? REASON_CODES.OK : REASON_CODES.MISSING_FORECAST_ENTRY),
  });

  let elliott = null;
  let elliottReason = shardRow?.elliott?.reason || 'MISSING_ELLIOTT_ENTRY';
  const elliottPayload = classifyElliottPayload(mpDoc);

  if (mpDoc?.ok && mpDoc?.data?.elliott) {
    elliott = {
      ...mpDoc.data.elliott,
      fib: mpDoc?.data?.fib || null,
      features: mpDoc?.data?.features || null,
      debug: mpDoc?.data?.debug || null,
    };
    elliott._meta = {
      symbol: ticker,
      resolved_symbol: mpDoc?.meta?.symbol || tickerBase || ticker,
      generatedAt: mpDoc?.meta?.generatedAt || null,
      version: mpDoc?.meta?.version || null,
      source: mpDoc?.meta?.source || null,
      source_kind: elliottPayload.sourceKind,
      bridge: elliottPayload.isBridge,
      canonical_id: mpDoc?.data?.debug?.canonical_id || null,
    };
    elliottReason = elliottPayload.isBridge ? 'BRIDGE_PAYLOAD' : '';
  } else if (mpDoc?.reason) {
    elliottReason = String(mpDoc.reason);
  }

  const elliottState = makeContractState(elliott, {
    as_of: pickAsOf(idxRow?.elliott?.as_of, shardRow?.elliott?.as_of, mpDoc?.meta?.generatedAt, mpDoc?.meta?.as_of),
    source: idxRow?.elliott?.source || shardRow?.elliott?.source || (elliottPayload.isBridge ? 'marketphase.bridge' : 'marketphase.per_ticker'),
    status: idxRow?.elliott?.status || shardRow?.elliott?.status || (elliott ? (elliottPayload.isBridge ? 'proxy' : 'ok') : 'unavailable'),
    reason: idxRow?.elliott?.reason || elliottReason,
  });

  return { scientificState, forecastState, elliottState, forecastMeta };
}

export async function assembleDecisionInputs(ticker, {
  fetchJson,
  coreInputs = null,
  loadCoreInputs = null,
} = {}) {
  if (typeof fetchJson !== 'function') {
    throw new Error('assembleDecisionInputs requires fetchJson(path)');
  }

  const [modelStates, quantlabState, runtimeControl, resolvedCoreInputs] = await Promise.all([
    assembleModelStates(ticker, { fetchJson }),
    loadQuantlabState(ticker, { fetchJson }),
    loadDecisionRuntimeControl(fetchJson),
    coreInputs ? Promise.resolve(coreInputs) : (typeof loadCoreInputs === 'function' ? loadCoreInputs(ticker) : Promise.resolve({})),
  ]);

  const bars = Array.isArray(resolvedCoreInputs?.bars) ? resolvedCoreInputs.bars : [];
  const stats = resolvedCoreInputs?.stats && typeof resolvedCoreInputs.stats === 'object' ? resolvedCoreInputs.stats : {};
  const universe = resolvedCoreInputs?.universe && typeof resolvedCoreInputs.universe === 'object'
    ? resolvedCoreInputs.universe
    : buildUniversePayload({ ticker, searchExact: null, universeSymbols: null });
  const fundamentals = resolvedCoreInputs?.fundamentals && typeof resolvedCoreInputs.fundamentals === 'object'
    ? resolvedCoreInputs.fundamentals
    : null;
  const segmentationProfile = resolvedCoreInputs?.segmentationProfile && typeof resolvedCoreInputs.segmentationProfile === 'object'
    ? resolvedCoreInputs.segmentationProfile
    : buildAssetSegmentationProfile({
      ticker,
      assetClass: quantlabState?.value?.assetClass || 'stock',
      marketCapUsd: fundamentals?.marketCap,
      liquidityScore: stats?.liquidity_score,
      liquidityState: null,
      exchange: universe?.exchange,
    });
  const as_of = pickAsOf(
    resolvedCoreInputs?.as_of,
    bars[bars.length - 1]?.date,
    modelStates.scientificState?.as_of,
    modelStates.forecastState?.as_of,
    modelStates.elliottState?.as_of,
    quantlabState?.as_of,
  );

  const input_fingerprints = buildInputFingerprints({
    ticker,
    bars,
    stats,
    universe,
    fundamentals,
    segmentationProfile,
    scientificState: modelStates.scientificState,
    forecastState: modelStates.forecastState,
    elliottState: modelStates.elliottState,
    quantlabState,
    as_of,
  });

  return {
    ticker,
    bars,
    stats,
    universe,
    fundamentals,
    segmentationProfile,
    scientificState: modelStates.scientificState,
    forecastState: modelStates.forecastState,
    elliottState: modelStates.elliottState,
    quantlabState,
    forecastMeta: modelStates.forecastMeta,
    runtimeControl,
    as_of,
    input_fingerprints,
  };
}

export function _resetCaches() {
  _v2IndexCache = null;
  _v2IndexTs = 0;
  _searchExactCache = null;
  _searchExactTs = 0;
  _stockSetCache = null;
  _stockSetTs = 0;
  _shardCache.clear();
  _quantlabShardCache.clear();
  _runtimeControlCache = null;
  _runtimeControlTs = 0;
}
