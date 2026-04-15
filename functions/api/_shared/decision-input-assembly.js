// Shared input assembly for the V4 decision pipeline.
// This module centralizes model-state loading and provides a full
// decision-input contract that can be reused by API endpoints and
// offline snapshot builders.

import { computeIndicators } from './eod-indicators.mjs';
import { getStaticBars } from './history-store.mjs';
import { makeContractState, REASON_CODES } from './stock-insights-v4.js';
import { buildAssetSegmentationProfile } from './asset-segmentation.mjs';
import { deriveLearningGate } from './learning-gate.mjs';
import { mergeCatalystFields } from './catalyst-normalization.mjs';

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

let _featuresV4IndexCache = null;
let _featuresV4IndexTs = 0;
let _forecastLatestCache = null;
let _forecastLatestTs = 0;
let _searchExactCache = null;
let _searchExactTs = 0;
let _stockSetCache = null;
let _stockSetTs = 0;
const _quantlabShardCache = new Map();
let _runtimeControlCache = null;
let _runtimeControlTs = 0;
const CACHE_TTL = 600_000;

function normalizeTickerKey(value) {
  return String(value || '').trim().toUpperCase();
}

function buildScientificAvailabilityValue(row) {
  if (row?.scientific?.value !== true) return null;
  return {
    setup: { score: null, proof_points: [], sample_count: null },
    trigger: { score: null, proof_points: [], sample_count: null, pending: false },
    metadata: {
      sample_count: null,
      source: row?.scientific?.source || 'stock-analysis.snapshot',
      contract_level: 'availability_only',
    },
  };
}

function buildForecastAvailabilityValue(row) {
  if (!row) return null;
  return {
    symbol: row.symbol || null,
    name: row.name || null,
    horizons: row.horizons || {},
  };
}

async function loadFeaturesV4Index(fetchJson) {
  const now = Date.now();
  if (_featuresV4IndexCache && (now - _featuresV4IndexTs) < CACHE_TTL) return _featuresV4IndexCache;
  const payload = await fetchJson('/data/features-v4/stock-insights/index.json');
  if (payload) {
    _featuresV4IndexCache = payload;
    _featuresV4IndexTs = now;
  }
  return _featuresV4IndexCache;
}

async function loadForecastLatest(fetchJson) {
  const now = Date.now();
  if (_forecastLatestCache && (now - _forecastLatestTs) < CACHE_TTL) return _forecastLatestCache;
  const payload = await fetchJson('/data/forecast/latest.json');
  if (!payload) return _forecastLatestCache;
  const rows = Array.isArray(payload?.data?.forecasts) ? payload.data.forecasts : [];
  const rowsBySymbol = new Map();
  for (const row of rows) {
    const key = normalizeTickerKey(row?.symbol);
    if (!key) continue;
    rowsBySymbol.set(key, row);
  }
  _forecastLatestCache = { payload, rowsBySymbol };
  _forecastLatestTs = now;
  return _forecastLatestCache;
}

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
  const bars = await getStaticBars(ticker, origin, assetFetcher) || [];
  const indicatorOut = computeIndicators(Array.isArray(bars) ? bars : []);
  const stats = mapIndicatorsToStats(indicatorOut?.indicators || []);
  const [fundamentalsDoc, earningsFeed] = await Promise.all([
    fetchJson(`/data/fundamentals/${encodeURIComponent(String(ticker || '').toUpperCase())}.json`),
    fetchJson('/data/earnings-calendar/latest.json'),
  ]);
  // Skip loading large gzip files (search_exact_by_symbol.json.gz, stocks.max.symbols.json)
  // to prevent Worker memory limit exceeded on Cloudflare Pages.
  const universe = buildUniversePayload({ ticker, searchExact: null, universeSymbols: null });
  const catalystNormalized = mergeCatalystFields({
    ticker,
    fundamentals: fundamentalsDoc,
    earningsFeed,
    universe,
    name: fundamentalsDoc?.companyName || universe?.name || null,
  });
  const fundamentals = catalystNormalized.fundamentals;
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
  const [controlDoc, report, policy] = await Promise.all([
    fetchJson('/data/runtime/stock-analyzer-control.json'),
    fetchJson('/data/reports/learning-report-latest.json'),
    fetchJson('/policies/best-setups.v1.json')
  ]);
  const stockAnalyzer = report?.features?.stock_analyzer || {};
  const control = {
    run_id: controlDoc?.run_id || report?.run_id || null,
    target_market_date: controlDoc?.target_market_date || report?.target_market_date || report?.date || null,
    learning_status: controlDoc?.learning_status || stockAnalyzer?.learning_status || report?.best_setups_policy?.learning_status_current || 'BOOTSTRAP',
    safety_switch: controlDoc?.safety_switch || stockAnalyzer?.safety_switch || null,
    minimum_n_status: controlDoc?.minimum_n_status || stockAnalyzer?.minimum_n_status || null,
    learning_gate: deriveLearningGate({
      learning_status: controlDoc?.learning_status || stockAnalyzer?.learning_status || report?.best_setups_policy?.learning_status_current || 'BOOTSTRAP',
      safety_switch: controlDoc?.safety_switch || stockAnalyzer?.safety_switch || null,
      minimum_n_status: controlDoc?.minimum_n_status || stockAnalyzer?.minimum_n_status || null,
      policy,
      default_status: policy?.learning_status?.default || null,
    }),
    policy: policy || null,
  };
  _runtimeControlCache = control;
  _runtimeControlTs = now;
  return control;
}

export async function assembleModelStates(ticker, { fetchJson }) {
  const tickerBase = ticker.includes('.') ? ticker.split('.')[0] : ticker;
  const [indexDoc, forecastBundle] = await Promise.all([
    loadFeaturesV4Index(fetchJson),
    loadForecastLatest(fetchJson),
  ]);

  const idxRow = indexDoc?.rows?.[ticker] || indexDoc?.rows?.[tickerBase] || null;
  const forecastRow = forecastBundle?.rowsBySymbol?.get(normalizeTickerKey(ticker))
    || forecastBundle?.rowsBySymbol?.get(normalizeTickerKey(tickerBase))
    || null;

  const scientific = buildScientificAvailabilityValue(idxRow);
  const scientificState = makeContractState(scientific, {
    as_of: pickAsOf(idxRow?.scientific?.as_of, indexDoc?.generated_at),
    source: idxRow?.scientific?.source || 'stock-analysis.snapshot',
    status: idxRow?.scientific?.status || (scientific ? 'ok' : 'unavailable'),
    reason: idxRow?.scientific?.reason || (scientific ? REASON_CODES.OK : REASON_CODES.MISSING_SCIENTIFIC_ENTRY),
  });

  const forecast = buildForecastAvailabilityValue(forecastRow);
  const forecastAsOf = pickAsOf(
    idxRow?.forecast?.as_of,
    forecastBundle?.payload?.data?.asof,
    forecastBundle?.payload?.meta?.freshness,
    forecastBundle?.payload?.freshness,
  );
  const forecastMeta = {
    as_of: forecastAsOf,
    source: idxRow?.forecast?.source || 'forecast.latest',
    accuracy: forecastBundle?.payload?.meta?.accuracy || forecastBundle?.payload?.data?.accuracy || forecastBundle?.payload?.accuracy || null,
  };

  const forecastState = makeContractState(forecast, {
    as_of: forecastAsOf,
    source: idxRow?.forecast?.source || 'forecast.latest',
    status: idxRow?.forecast?.status || (forecast ? 'ok' : 'unavailable'),
    reason: idxRow?.forecast?.reason || (forecast ? REASON_CODES.OK : REASON_CODES.MISSING_FORECAST_ENTRY),
  });

  const elliottState = makeContractState(null, {
    as_of: null,
    source: 'elliott.removed',
    status: 'unavailable',
    reason: REASON_CODES.ELLIOTT_REMOVED,
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
  _featuresV4IndexCache = null;
  _featuresV4IndexTs = 0;
  _forecastLatestCache = null;
  _forecastLatestTs = 0;
  _searchExactCache = null;
  _searchExactTs = 0;
  _stockSetCache = null;
  _stockSetTs = 0;
  _quantlabShardCache.clear();
  _runtimeControlCache = null;
  _runtimeControlTs = 0;
}
