/**
 * Platform-neutral data interface for V2 endpoints.
 * Thin facade over existing modules — no new business logic.
 */

import { resolveSymbol, normalizeTicker as normalizeTickerStrict } from './symbol-resolver.mjs';
import { fetchBarsWithProviderChain } from './eod-providers.mjs';
import { computeIndicators } from './eod-indicators.mjs';
import { processTickerSeries } from './breakout-core.mjs';
import { createCache, getJsonKV, computeAgeSeconds, nowUtcIso, todayUtcDate } from './cache-law.js';
import { evaluateQuality } from './quality.js';
import { computeCacheStatus } from './freshness.js';
import { getEndpointTTL } from './freshness-config.js';
import {
  normalizeTicker,
  pickLatestBar,
  computeDayChange,
  buildSourceChainMetadata,
  computeStatusFromDataDate,
  buildMarketPricesFromBar,
  buildMarketStatsFromIndicators,
} from './stock-helpers.js';

let v7SearchExactCache = null;
let v7SearchExactCachedAt = 0;
const V7_SEARCH_EXACT_TTL_MS = 5 * 60 * 1000;
let v3UniverseCache = null;
let v3UniverseCachedAt = 0;
const V3_UNIVERSE_TTL_MS = 5 * 60 * 1000;

function findRecord(snapshot, symbol) {
  if (!snapshot || !snapshot.data) return null;
  const payload = snapshot.data;
  const lookup = (key) => {
    if (Array.isArray(payload)) return payload.find((e) => (e?.symbol || e?.ticker) === key) || null;
    if (typeof payload === 'object') return payload[key] || null;
    return null;
  };
  const result = lookup(symbol);
  if (result) return result;
  if (typeof symbol === 'string' && (symbol.includes('.') || symbol.includes(':'))) {
    const replacement = symbol.includes('.') ? symbol.replace('.', ':') : symbol.replace(':', '.');
    const fb = lookup(replacement);
    if (fb) return fb;
    const parts = symbol.includes('.') ? symbol.split('.') : symbol.split(':');
    if (parts.length === 2) return lookup(parts[1]);
  }
  return null;
}

function parseIsoDateSafe(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isSeedSourceProvider(value) {
  return String(value || '').toLowerCase() === 'stock-analysis-seed';
}

function hasUsableUniverse(record) {
  if (!record || typeof record !== 'object') return false;
  return Boolean(record.name || record.asset_class || record.security_type || record.industry || record.sector);
}

function hasUsableMarketPrices(record) {
  if (!record || typeof record !== 'object') return false;
  return Number.isFinite(Number(record.close)) && Boolean(parseIsoDateSafe(record.date));
}

function hasUsableMarketStats(record) {
  const stats = record?.stats;
  if (!stats || typeof stats !== 'object') return false;
  const required = ['rsi14', 'sma20', 'sma50', 'sma200', 'atr14'];
  const available = required.filter((key) => Number.isFinite(Number(stats[key]))).length;
  return available >= 3;
}

async function fetchJsonMaybeGzip(url) {
  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
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

async function fetchV7SearchExactEntry(request, symbol) {
  const now = Date.now();
  if (!v7SearchExactCache || (now - v7SearchExactCachedAt) > V7_SEARCH_EXACT_TTL_MS) {
    const baseUrl = new URL(request.url);
    const payload = await fetchJsonMaybeGzip(new URL('/data/universe/v7/search/search_exact_by_symbol.json.gz', baseUrl));
    if (payload && typeof payload === 'object') {
      v7SearchExactCache = payload;
      v7SearchExactCachedAt = now;
    }
  }
  const bySymbol = v7SearchExactCache?.by_symbol;
  if (!bySymbol || typeof bySymbol !== 'object') return null;
  const row = bySymbol[String(symbol || '').toUpperCase()];
  if (!row || typeof row !== 'object') return null;
  const canonical = typeof row.canonical_id === 'string' ? row.canonical_id : null;
  const canonicalExchange = canonical && canonical.includes(':') ? canonical.split(':')[0] : null;
  return {
    canonical_id: canonical,
    symbol: typeof row.symbol === 'string' && row.symbol.trim() ? row.symbol.trim().toUpperCase() : normalizeTicker(symbol),
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null,
    exchange: typeof row.exchange === 'string' && row.exchange.trim() ? row.exchange : (canonicalExchange || null),
    country: typeof row.country === 'string' && row.country.trim() ? row.country : null,
  };
}

async function fetchV3UniverseMeta(request, symbol) {
  const now = Date.now();
  if (!v3UniverseCache || (now - v3UniverseCachedAt) > V3_UNIVERSE_TTL_MS) {
    const baseUrl = new URL(request.url);
    const [universePayload, mappingPayload] = await Promise.all([
      fetchJsonMaybeGzip(new URL('/data/v3/universe/universe.json', baseUrl)),
      fetchJsonMaybeGzip(new URL('/data/v3/universe/symbol-mapping.json', baseUrl)),
    ]);
    v3UniverseCache = {
      universe: universePayload,
      mapping: mappingPayload,
    };
    v3UniverseCachedAt = now;
  }

  const normalized = normalizeTicker(symbol);
  if (!normalized) return null;

  const universeSymbols = Array.isArray(v3UniverseCache?.universe?.symbols) ? v3UniverseCache.universe.symbols : [];
  const universeHit = universeSymbols.find((row) => normalizeTicker(row?.ticker) === normalized) || null;

  const mappings = v3UniverseCache?.mapping?.mappings && typeof v3UniverseCache.mapping.mappings === 'object'
    ? v3UniverseCache.mapping.mappings
    : null;
  let mappingHit = null;
  if (mappings) {
    for (const [canonicalId, row] of Object.entries(mappings)) {
      if (normalizeTicker(row?.ticker) === normalized) {
        mappingHit = { canonicalId, row };
        break;
      }
    }
  }

  if (!universeHit && !mappingHit) return null;

  return {
    canonical_id: universeHit?.canonical_id || mappingHit?.canonicalId || null,
    symbol: normalized,
    name: typeof universeHit?.name === 'string' && universeHit.name.trim() ? universeHit.name.trim() : null,
    exchange: typeof mappingHit?.row?.exchange === 'string' && mappingHit.row.exchange.trim() ? mappingHit.row.exchange.trim() : null,
    country: typeof universeHit?.country === 'string' && universeHit.country.trim() ? universeHit.country.trim() : null,
    provider_ids: mappingHit?.row?.provider_ids || null,
  };
}

function buildEodhdSymbol(symbol, exchange) {
  const cleanSymbol = normalizeTicker(symbol);
  const cleanExchange = String(exchange || '').trim().toUpperCase();
  if (!cleanSymbol) return null;
  if (!cleanExchange) return cleanSymbol;
  return `${cleanSymbol}.${cleanExchange}`;
}

function buildProviderSymbolMap(symbol, exchange, providerIds = null) {
  let cleanSymbol = normalizeTicker(symbol);
  if (!cleanSymbol) return null;

  const eodhdFromProviderIds = typeof providerIds?.eodhd === 'string' && providerIds.eodhd.trim()
    ? providerIds.eodhd.trim().toUpperCase()
    : null;
  const tiingoFromProviderIds = typeof providerIds?.tiingo === 'string' && providerIds.tiingo.trim()
    ? providerIds.tiingo.trim().toUpperCase()
    : null;
  const twelvedataFromProviderIds = typeof providerIds?.twelvedata === 'string' && providerIds.twelvedata.trim()
    ? providerIds.twelvedata.trim().toUpperCase()
    : null;

  const scannerPrefixes = [
    'US', 'XETR', 'LSE', 'MIL', 'AMS', 'BME', 'EBS', 'EPA',
    'AS', 'AT', 'BC', 'BE', 'CO', 'DU', 'F', 'HE',
    'MC', 'MI', 'MU', 'PA', 'ST', 'SW', 'VI', 'XETRA',
    'KLSE', 'HKEX', 'TYO', 'SGX', 'ASX', 'AU', 'HK', 'JA',
    'KO', 'SG', 'SR', 'TA', 'TH', '108', '109', 'BK'
  ];

  const separator = cleanSymbol.includes(':') ? ':' : cleanSymbol.includes('.') ? '.' : null;
  if (separator && !exchange) {
    const parts = cleanSymbol.split(separator);
    if (parts.length === 2 && scannerPrefixes.includes(parts[0])) {
      cleanSymbol = `${parts[1]}.${parts[0]}`;
    }
  }

  const eodhdSymbol = eodhdFromProviderIds || buildEodhdSymbol(cleanSymbol, exchange);
  return {
    eodhd: eodhdSymbol || cleanSymbol,
    tiingo: tiingoFromProviderIds || cleanSymbol,
    twelvedata: twelvedataFromProviderIds || cleanSymbol,
  };
}

async function loadStaticBarsFallback(symbol, request) {
  try {
    const { getStaticBars } = await import('./history-store.mjs');
    const bars = await getStaticBars(symbol, new URL(request.url).origin);
    return Array.isArray(bars) && bars.length ? bars : [];
  } catch {
    return [];
  }
}

export function choosePreferredMarketPrices(snapshotRecord, barRecord) {
  const snapshotOk = hasUsableMarketPrices(snapshotRecord);
  const barOk = hasUsableMarketPrices(barRecord);
  if (!snapshotOk && !barOk) return snapshotRecord || barRecord || null;
  if (!snapshotOk) return barRecord;
  if (!barOk) return snapshotRecord;

  const snapshotDate = parseIsoDateSafe(snapshotRecord?.date);
  const barDate = parseIsoDateSafe(barRecord?.date);
  if (isSeedSourceProvider(snapshotRecord?.source_provider) && barDate) return barRecord;
  if (barDate && snapshotDate && barDate >= snapshotDate) return barRecord;
  return snapshotRecord;
}

export function choosePreferredMarketStats(snapshotRecord, derivedRecord) {
  const snapshotOk = hasUsableMarketStats(snapshotRecord);
  const derivedOk = hasUsableMarketStats(derivedRecord);
  if (!snapshotOk && !derivedOk) return snapshotRecord || derivedRecord || null;
  if (!snapshotOk) return derivedRecord;
  if (!derivedOk) return snapshotRecord;

  const snapshotDate = parseIsoDateSafe(snapshotRecord?.as_of);
  const derivedDate = parseIsoDateSafe(derivedRecord?.as_of);
  if (isSeedSourceProvider(snapshotRecord?.source_provider) && derivedDate) return derivedRecord;
  if (derivedDate && snapshotDate && derivedDate > snapshotDate) return derivedRecord;
  if (derivedDate && snapshotDate && derivedDate === snapshotDate) {
    if (isSeedSourceProvider(snapshotRecord?.source_provider)) return derivedRecord;
    return snapshotRecord;
  }
  return snapshotRecord;
}

async function fetchSnapshotJson(moduleName, request, env) {
  const templates = [
    '/data/snapshots/{module}/latest.json',
    '/public/data/snapshots/{module}/latest.json',
    '/data/snapshots/{module}.json',
    '/data/{module}.json',
  ];
  const baseUrl = new URL(request.url);
  const assetFetcher = env?.ASSETS || null;
  for (const tpl of templates) {
    const path = tpl.replace('{module}', moduleName);
    try {
      const url = new URL(path, baseUrl);
      const res = assetFetcher && path.startsWith('/data/')
        ? await assetFetcher.fetch(url.toString())
        : await fetch(url.toString());
      if (res.ok) return await res.json();
    } catch { /* continue */ }
  }
  return null;
}

async function resolveTickerContext(ticker, request) {
  const normalized = normalizeTicker(ticker);
  if (!normalized) return { ok: false, error: { code: 'INVALID_TICKER', message: 'Invalid ticker format' } };

  let resolvedTicker = normalized;
  let name = null;
  let exchange = null;
  let country = null;
  let canonicalId = null;

  try {
    const resolved = await resolveSymbol(normalized, request);
    if (resolved?.ok && resolved?.data?.ticker) {
      const strict = normalizeTickerStrict(resolved.data.ticker);
      if (strict) {
        resolvedTicker = strict;
        name = resolved.data.name || null;
        exchange = resolved.data.exchange || null;
        country = resolved.data.country || null;
        canonicalId = resolved.data.canonical_id || null;
      }
    }
  } catch { /* ignore */ }

  let v7ExactMeta = null;
  if (resolvedTicker) {
    try {
      v7ExactMeta = await fetchV7SearchExactEntry(request, resolvedTicker);
    } catch { /* ignore */ }
  }
  if (!v7ExactMeta && resolvedTicker) {
    try {
      v7ExactMeta = await fetchV3UniverseMeta(request, resolvedTicker);
    } catch { /* ignore */ }
  }
  if (!name) name = v7ExactMeta?.name || null;
  if (!exchange) exchange = v7ExactMeta?.exchange || null;
  if (!country) country = v7ExactMeta?.country || null;
  if (!canonicalId) canonicalId = v7ExactMeta?.canonical_id || null;

  return {
    ok: true,
    ticker: resolvedTicker,
    name, exchange, country, canonicalId,
    resolution: { ticker: resolvedTicker, canonical_id: canonicalId, exchange, provider_ids: v7ExactMeta?.provider_ids || null },
  };
}

/**
 * Fetch stock summary data for a ticker.
 * Returns computed results only — no raw bars array.
 */
export async function fetchStockSummary(ticker, env, request) {
  const ctx = await resolveTickerContext(ticker, request);
  if (!ctx.ok) return { ok: false, data: null, meta: { status: 'error', provider: 'v2' }, error: ctx.error };

  const ttl = getEndpointTTL('v2_summary');
  const effectiveTicker = ctx.ticker;
  const now = new Date();
  const qualityFlags = [];
  const providerSymbolMap = buildProviderSymbolMap(effectiveTicker, ctx.exchange, ctx.resolution?.provider_ids);

  // Fetch bars via provider chain
  let bars = [];
  let provider = 'eodhd';
  let sourceChain = buildSourceChainMetadata(null);

  try {
    const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
      outputsize: '300',
      allowFailover: true,
      providerSymbols: providerSymbolMap,
    });
    sourceChain = buildSourceChainMetadata(chainResult.chain);
    if (chainResult.ok) {
      bars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
      provider = chainResult.provider || sourceChain?.selected || 'eodhd';
      const quality = evaluateQuality({ bars }, env);
      if (quality.reject) {
        return {
          ok: false, data: null,
          meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
          error: { code: 'QUALITY_REJECT', message: quality.reject.message, retryable: false },
        };
      }
      if (Array.isArray(quality.flags)) qualityFlags.push(...quality.flags);
    }
  } catch { /* fall through */ }

  if (!bars.length) {
    const staticBars = await loadStaticBarsFallback(effectiveTicker, request);
    if (staticBars.length) {
      bars = staticBars;
      provider = 'static_store';
      qualityFlags.push('STATIC_FALLBACK_HISTORY');
    }
  }

  if (!bars.length) {
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No bar data available', retryable: true },
    };
  }

  const latestBar = pickLatestBar(bars);
  const change = computeDayChange(bars);
  const indicatorResult = computeIndicators(bars);
  const indicatorArray = Array.isArray(indicatorResult) ? indicatorResult : (indicatorResult?.indicators || []);
  const marketPrices = buildMarketPricesFromBar(latestBar, effectiveTicker, provider);
  const marketStats = buildMarketStatsFromIndicators(indicatorArray, effectiveTicker, latestBar?.date);
  const dataDate = latestBar?.date || todayUtcDate();
  const status = computeStatusFromDataDate(dataDate, now, ttl.max_stale_days, ttl.pending_window_minutes);

  // Load evaluation via decision-input-assembly
  let states = null;
  let decision = null;
  let explanation = null;
  try {
    const { assembleDecisionInputs, loadRequestCoreInputs } = await import('./decision-input-assembly.js');
    const { buildStockInsightsV4Evaluation } = await import('./stock-insights-v4.js');
    const origin = new URL(request.url).origin;
    const assetFetcher = env?.ASSETS || null;
    async function fetchJsonForAssembly(path) {
      try {
        const res = assetFetcher && path.startsWith('/data/')
          ? await assetFetcher.fetch(new URL(path, origin).toString())
          : await fetch(new URL(path, origin).toString());
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }
    const inputs = await assembleDecisionInputs(effectiveTicker, {
      fetchJson: fetchJsonForAssembly,
      loadCoreInputs: (t) => loadRequestCoreInputs(t, { request, assetFetcher, fetchJson: fetchJsonForAssembly }),
    });
    const evaluation = buildStockInsightsV4Evaluation({
      ticker: effectiveTicker,
      bars: inputs.bars,
      stats: inputs.stats,
      universe: inputs.universe,
      scientificState: inputs.scientificState,
      forecastState: inputs.forecastState,
      elliottState: inputs.elliottState,
      quantlabState: inputs.quantlabState,
      forecastMeta: inputs.forecastMeta,
      inputFingerprints: inputs.input_fingerprints,
      runtimeControl: inputs.runtimeControl,
    });
    states = evaluation?.states || null;
    decision = evaluation?.decision || null;
    explanation = evaluation?.explanation || null;
  } catch { /* evaluation unavailable */ }

  // Fallback name resolution from existing snapshots if still missing
  let fallbackName = null;
  // (We'll use universe snapshot below)

  // Snapshot joins for universe, market-prices, market-stats
  let universe = null;
  let snapshotMarketPrices = null;
  let snapshotMarketStats = null;
  try {
    const [uSnap, mpSnap, msSnap] = await Promise.all([
      fetchSnapshotJson('universe', request, env),
      fetchSnapshotJson('market-prices', request, env),
      fetchSnapshotJson('market-stats', request, env),
    ]);
    if (uSnap) {
      const uRec = findRecord(uSnap, effectiveTicker);
      if (hasUsableUniverse(uRec)) universe = uRec;
    }
    if (mpSnap) {
      const mpRec = findRecord(mpSnap, effectiveTicker);
      if (mpRec) snapshotMarketPrices = mpRec;
    }
    if (msSnap) {
      const msRec = findRecord(msSnap, effectiveTicker);
      if (msRec) snapshotMarketStats = msRec;
    }
  } catch { /* snapshots optional */ }

  // Fetch fundamentals as enrichment (with timeout to prevent Worker crash)
  let fundamentals = null;
  try {
    const origin = new URL(request.url).origin;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const fRes = await fetch(new URL(`/api/fundamentals?ticker=${effectiveTicker}`, origin).toString(), {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (fRes.ok) {
      const fPayload = await fRes.json();
      if (fPayload.data) fundamentals = fPayload.data;
    }
  } catch { /* optional */ }

  const selectedMarketPrices = choosePreferredMarketPrices(snapshotMarketPrices, marketPrices) || marketPrices;
  const selectedMarketStats = choosePreferredMarketStats(snapshotMarketStats, marketStats) || marketStats;

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      name: ctx.name || universe?.name || fallbackName || effectiveTicker,
      resolution: ctx.resolution,
      latest_bar: latestBar,
      change,
      market_prices: selectedMarketPrices,
      market_stats: selectedMarketStats,
      fundamentals,
      states,
      decision,
      explanation,
      module_freshness: {
        price_as_of: selectedMarketPrices?.date || dataDate,
        historical_as_of: dataDate,
        market_stats_as_of: selectedMarketStats?.as_of || dataDate,
        decision_as_of: decision?.asof || decision?.created_at || null,
      },
    },
    meta: {
      status,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      provider,
      quality_flags: qualityFlags.length ? qualityFlags : undefined,
      version: 'v2',
    },
    error: null,
  };
}

/**
 * Fetch historical bar data for a ticker.
 */
export async function fetchStockHistorical(ticker, env, request) {
  const ctx = await resolveTickerContext(ticker, request);
  if (!ctx.ok) return { ok: false, data: null, meta: { status: 'error', provider: 'v2' }, error: ctx.error };

  const ttl = getEndpointTTL('v2_historical');
  const effectiveTicker = ctx.ticker;
  const now = new Date();
  const qualityFlags = [];
  const providerSymbolMap = buildProviderSymbolMap(effectiveTicker, ctx.exchange, ctx.resolution?.provider_ids);

  let bars = [];
  let provider = 'eodhd';
  try {
    const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
      outputsize: '300',
      allowFailover: true,
      providerSymbols: providerSymbolMap,
    });
    if (chainResult.ok) {
      bars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
      provider = chainResult.provider || 'eodhd';
      const quality = evaluateQuality({ bars }, env);
      if (quality.reject) {
        return {
          ok: false, data: null,
          meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
          error: { code: 'QUALITY_REJECT', message: quality.reject.message, retryable: false },
        };
      }
      if (Array.isArray(quality.flags)) qualityFlags.push(...quality.flags);
    }
  } catch { /* fall through */ }

  if (!bars.length) {
    const staticBars = await loadStaticBarsFallback(effectiveTicker, request);
    if (staticBars.length) {
      bars = staticBars;
      provider = 'static_store';
      qualityFlags.push('STATIC_FALLBACK_HISTORY');
    }
  }

  if (!bars.length) {
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No historical data available', retryable: true },
    };
  }

  const latestBar = pickLatestBar(bars);
  const dataDate = latestBar?.date || todayUtcDate();
  const status = computeStatusFromDataDate(dataDate, now, ttl.max_stale_days, ttl.pending_window_minutes);
  const indicatorResult = computeIndicators(bars);
  const indicatorArray = Array.isArray(indicatorResult) ? indicatorResult : (indicatorResult?.indicators || []);

  let breakoutV2 = null;
  try {
    const result = processTickerSeries(effectiveTicker, bars);
    if (result) breakoutV2 = result;
  } catch { /* optional */ }

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      bars,
      indicators,
      breakout_v2: breakoutV2,
    },
    meta: {
      status,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      provider,
      quality_flags: qualityFlags.length ? qualityFlags : undefined,
      version: 'v2',
    },
    error: null,
  };
}

/**
 * Fetch governance/evaluation data for a ticker.
 */
export async function fetchStockGovernance(ticker, env, request) {
  const ctx = await resolveTickerContext(ticker, request);
  if (!ctx.ok) return { ok: false, data: null, meta: { status: 'error', provider: 'v2' }, error: ctx.error };

  const effectiveTicker = ctx.ticker;
  const now = new Date();
  const ttl = getEndpointTTL('v2_governance');

  let universe = null;
  let marketScore = null;
  let evaluationV4 = null;

  try {
    const [uSnap, msSnap] = await Promise.all([
      fetchSnapshotJson('universe', request, env),
      fetchSnapshotJson('market-score', request, env),
    ]);
    if (uSnap) {
      const rec = findRecord(uSnap, effectiveTicker);
      if (rec) universe = rec;
    }
    if (msSnap) {
      const rec = findRecord(msSnap, effectiveTicker);
      if (rec) marketScore = rec;
    }
  } catch { /* optional */ }

  try {
    const { assembleDecisionInputs, loadRequestCoreInputs } = await import('./decision-input-assembly.js');
    const { buildStockInsightsV4Evaluation } = await import('./stock-insights-v4.js');
    const origin = new URL(request.url).origin;
    const assetFetcher = env?.ASSETS || null;
    async function fetchJsonForAssembly(path) {
      try {
        const res = assetFetcher && path.startsWith('/data/')
          ? await assetFetcher.fetch(new URL(path, origin).toString())
          : await fetch(new URL(path, origin).toString());
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }
    const inputs = await assembleDecisionInputs(effectiveTicker, {
      fetchJson: fetchJsonForAssembly,
      loadCoreInputs: (t) => loadRequestCoreInputs(t, { request, assetFetcher, fetchJson: fetchJsonForAssembly }),
    });
    evaluationV4 = buildStockInsightsV4Evaluation({
      ticker: effectiveTicker,
      bars: inputs.bars,
      stats: inputs.stats,
      universe: inputs.universe,
      scientificState: inputs.scientificState,
      forecastState: inputs.forecastState,
      elliottState: inputs.elliottState,
      quantlabState: inputs.quantlabState,
      forecastMeta: inputs.forecastMeta,
      inputFingerprints: inputs.input_fingerprints,
      runtimeControl: inputs.runtimeControl,
    });
  } catch { /* evaluation unavailable */ }

  const dataDate = todayUtcDate();
  const status = universe || marketScore || evaluationV4 ? 'fresh' : 'error';

  return {
    ok: status !== 'error',
    data: status !== 'error' ? {
      ticker: effectiveTicker,
      universe,
      market_score: marketScore,
      evaluation_v4: evaluationV4,
    } : null,
    meta: {
      status,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      provider: 'v2-governance',
      version: 'v2',
    },
    error: status === 'error'
      ? { code: 'NO_DATA', message: 'No governance data available', retryable: true }
      : null,
  };
}
