/**
 * Platform-neutral data interface for V2 endpoints.
 * Thin facade over existing modules — no new business logic.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolveSymbol, normalizeTicker as normalizeTickerStrict } from './symbol-resolver.mjs';
import { fetchBarsWithProviderChain } from './eod-providers.mjs';
import { computeIndicators } from './eod-indicators.mjs';
import { processTickerSeries } from './breakout-core.mjs';
import { createCache, getJsonKV, computeAgeSeconds, nowUtcIso, todayUtcDate } from './cache-law.js';
import { evaluateQuality } from './quality.js';
import { computeCacheStatus } from './freshness.js';
import { getEndpointTTL } from './freshness-config.js';
import {
  annotateFundamentalsForScope,
  inferFundamentalsAssetClass,
} from './fundamentals-scope.mjs';
import { latestUsMarketSessionIso } from './market-calendar.js';
import {
  normalizeTicker,
  pickLatestBar,
  computeDayChange,
  buildSourceChainMetadata,
  computeStatusFromDataDate,
  buildMarketPricesFromBar,
  buildMarketStatsFromIndicators,
  selectCanonicalMarketPrices,
  selectCanonicalMarketStats,
} from './stock-helpers.js';
import { buildHistProbsCandidatePaths } from './hist-probs-paths.js';
import { readDecisionForTicker } from './decision-bundle-reader.js';

const REPO_ROOT = (() => {
  const envRoot = typeof process !== 'undefined' ? String(process.env?.RV_REPO_ROOT || '').trim() : '';
  if (envRoot) return envRoot;
  try {
    const currentUrl = String(import.meta.url || '');
    if (currentUrl.startsWith('file:')) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    }
  } catch {
    // fall through
  }
  // Wrangler Pages dev: import.meta.url is not file://, use process.cwd()
  // which is the repo root (same approach as decision-bundle-reader.js).
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }
  return '.';
})();

function findRecord(snapshot, symbol) {
  if (!snapshot) return null;
  const payload = snapshot.data ?? snapshot.symbols ?? snapshot;
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

function resolveExpectedTargetMarketDate(now = new Date()) {
  const forced = parseIsoDateSafe(process?.env?.TARGET_MARKET_DATE || process?.env?.RV_TARGET_MARKET_DATE || null);
  return forced || latestUsMarketSessionIso(now);
}

function isDateBehind(actual, expected) {
  const lhs = parseIsoDateSafe(actual);
  const rhs = parseIsoDateSafe(expected);
  return Boolean(lhs && rhs && lhs < rhs);
}

function isMeaningfulIdentityName(name, ticker) {
  const label = typeof name === 'string' ? name.trim() : '';
  const symbol = normalizeTickerStrict(ticker) || normalizeTicker(ticker) || String(ticker || '').trim().toUpperCase();
  return Boolean(label) && label.toUpperCase() !== symbol;
}

function preferredIdentityName({ ticker, resolverName, fundamentalsName, universeName, fallbackName }) {
  const candidates = [resolverName, fundamentalsName, universeName, fallbackName];
  for (const candidate of candidates) {
    if (isMeaningfulIdentityName(candidate, ticker)) return String(candidate).trim();
  }
  return ticker;
}

function firstMeaningfulIdentityName(ticker, ...candidates) {
  for (const candidate of candidates) {
    if (isMeaningfulIdentityName(candidate, ticker)) return String(candidate).trim();
  }
  return null;
}

let v7SearchExactCache = null;
let v7SearchExactCachedAt = 0;
const V7_SEARCH_EXACT_TTL_MS = 60 * 60 * 1000;

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

function buildTypedFundamentalsFallback({ ticker, universe, fundamentals, expectedDataDate, scopeDoc } = {}) {
  return annotateFundamentalsForScope({
    ticker,
    universe,
    fundamentals,
    scopeDoc,
    targetMarketDate: expectedDataDate,
    assetClass: inferFundamentalsAssetClass({ ticker, universe, fundamentals }),
  });
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

function isLocalDevRequest(request) {
  try {
    const { hostname } = new URL(request.url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function readRuntimeMode(env, key) {
  const fromEnv = env && typeof env === 'object' ? env[key] : null;
  const fromProcess = typeof process !== 'undefined' ? process?.env?.[key] : null;
  return String(fromEnv || fromProcess || '').trim().toLowerCase();
}

function shouldSkipSummaryEvaluation(request, env) {
  const mode = readRuntimeMode(env, 'RV_V2_SUMMARY_DECISION_MODE');
  if (mode === 'full') return false;
  if (mode === 'skip') return true;
  return isLocalDevRequest(request);
}

function shouldSkipSummarySnapshotJoins(request, env) {
  const mode = readRuntimeMode(env, 'RV_V2_SUMMARY_SNAPSHOT_MODE');
  if (mode === 'full') return false;
  if (mode === 'skip') return true;
  return isLocalDevRequest(request);
}

function resolveHistoricalBarLimit(request) {
  const forced = Number(process?.env?.RV_V2_HISTORICAL_BAR_LIMIT || 0);
  if (Number.isFinite(forced) && forced > 0) return Math.max(50, Math.trunc(forced));
  return isLocalDevRequest(request) ? 1500 : 0;
}

function toLocalAssetPath(requestPath) {
  if (typeof requestPath !== 'string' || !requestPath.startsWith('/')) return null;
  if (requestPath.startsWith('/public/')) {
    const relative = requestPath.slice('/public/'.length);
    if (relative.startsWith('data/')) return path.join(REPO_ROOT, 'public', relative);
    return path.join(REPO_ROOT, relative);
  }
  const relative = requestPath.slice(1);
  if (relative.startsWith('data/')) return path.join(REPO_ROOT, 'public', relative);
  if (relative.startsWith('policies/')) return path.join(REPO_ROOT, relative);
  return null;
}

async function readLocalJsonMaybeGzip(requestPath) {
  const filePath = toLocalAssetPath(requestPath);
  if (!filePath) return null;
  try {
    const buffer = await fs.readFile(filePath);
    const text = filePath.endsWith('.gz')
      ? gunzipSync(buffer).toString('utf8')
      : buffer.toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function loadStaticBarsFallback(symbol, request, env) {
  try {
    const { getStaticBars } = await import('./history-store.mjs');
    const bars = await getStaticBars(symbol, new URL(request.url).origin, env?.ASSETS || null);
    return Array.isArray(bars) && bars.length ? bars : [];
  } catch {
    return [];
  }
}

async function fetchAssetJsonFromPaths(paths, request, env) {
  const baseUrl = new URL(request.url);
  const assetFetcher = env?.ASSETS || null;
  for (const path of paths) {
    try {
      if (isLocalDevRequest(request)) {
        const localPayload = await readLocalJsonMaybeGzip(path);
        if (localPayload) return localPayload;
      }
      const url = new URL(path, baseUrl);
      const res = assetFetcher && path.startsWith('/data/')
        ? await assetFetcher.fetch(url.toString())
        : await fetch(url.toString());
      if (res.ok) return await res.json();
    } catch { /* continue */ }
  }
  return null;
}

function histProbsPublicShardName(ticker, count = 256) {
  const hash = createHash('sha256').update(String(ticker || '').toUpperCase()).digest();
  const index = hash.readUInt32BE(0) % count;
  return `${String(index).padStart(3, '0')}.json`;
}

async function fetchHistProbsPublicProjection(ticker, request, env) {
  const latest = await fetchAssetJsonFromPaths([
    '/data/hist-probs-public/latest.json',
    '/public/data/hist-probs-public/latest.json',
  ], request, env);
  const shardCount = Math.max(1, Number(latest?.shard_count || 0));
  if (!latest || !shardCount) return null;
  const normalized = normalizeTicker(ticker);
  const shard = await fetchAssetJsonFromPaths([
    `/data/hist-probs-public/shards/${histProbsPublicShardName(normalized, shardCount)}`,
    `/public/data/hist-probs-public/shards/${histProbsPublicShardName(normalized, shardCount)}`,
  ], request, env);
  return shard?.[normalized] || null;
}

function summarizeForwardReturns(bars, horizon) {
  const values = [];
  for (let index = 0; index + horizon < bars.length; index += 1) {
    const start = Number(bars[index]?.adjClose ?? bars[index]?.close);
    const end = Number(bars[index + horizon]?.adjClose ?? bars[index + horizon]?.close);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0) values.push((end - start) / start);
  }
  if (values.length < 50) return null;
  const wins = values.filter((value) => value > 0).length;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    n: values.length,
    win_rate: Number((wins / values.length).toFixed(6)),
    avg_return: Number(avg.toFixed(6)),
    mae: Number(min.toFixed(6)),
    mfe: Number(max.toFixed(6)),
    max_drawdown: Number(Math.min(0, min).toFixed(6)),
  };
}

function deriveHistoricalProfileFromBars(ticker, bars) {
  if (!Array.isArray(bars) || bars.length < 250) return null;
  const events = {};
  const baseline = {};
  for (const [key, horizon] of [['h5d', 5], ['h20d', 20], ['h60d', 60], ['h120d', 120]]) {
    const summary = summarizeForwardReturns(bars, horizon);
    if (summary) baseline[key] = summary;
  }
  if (Object.keys(baseline).length) events.event_price_history_baseline = baseline;
  const latest = bars[bars.length - 1] || null;
  return Object.keys(events).length ? {
    ticker,
    latest_date: latest?.date || null,
    computed_at: nowUtcIso(),
    bars_count: bars.length,
    events,
    source: 'derived_from_public_historical_bars',
  } : null;
}

function buildHistoricalProfileCandidates(symbol) {
  const normalized = normalizeTicker(symbol);
  if (!normalized) return [];
  const candidates = new Set([normalized]);
  if (normalized.includes('.')) {
    const [base, suffix] = normalized.split('.', 2);
    if (base) candidates.add(base);
    if (suffix) candidates.add(`${suffix}:${base}`);
  }
  if (normalized.includes(':')) {
    const [prefix, base] = normalized.split(':', 2);
    if (base) candidates.add(base);
    if (prefix && base) candidates.add(`${base}.${prefix}`);
  }
  return [...candidates];
}

function summarizeHistoricalProfileAvailability(profile) {
  if (!profile) {
    return {
      status: 'not_generated',
      reason: 'Historical profile has not been generated for this asset yet.',
    };
  }
  const eventKeys = Object.keys(profile?.events || {});
  if (eventKeys.length === 0) {
    return {
      status: 'insufficient_history',
      reason: 'Historical profile exists, but there are not yet enough qualifying observations for display.',
    };
  }
  return {
    status: 'ready',
    reason: 'Historical profile ready.',
  };
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
  const templates = moduleName === 'universe'
    ? [
      '/data/snapshots/universe/latest.json',
      '/public/data/snapshots/universe/latest.json',
      '/data/v3/universe/universe.json',
      '/data/universe/all.json',
    ]
    : [
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
      if (isLocalDevRequest(request)) {
        const localPayload = await readLocalJsonMaybeGzip(path);
        if (localPayload) return localPayload;
      }
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

  return {
    ok: true,
    ticker: resolvedTicker,
    name, exchange, country, canonicalId,
    resolution: { ticker: resolvedTicker, canonical_id: canonicalId, exchange, provider_ids: null },
  };
}

async function fetchJsonMaybeGzip(url, assetFetcher = null) {
  try {
    const localPayload = await readLocalJsonMaybeGzip(url.pathname);
    if (localPayload) return localPayload;
    const response = assetFetcher && url.pathname.startsWith('/data/')
      ? await assetFetcher.fetch(url.toString())
      : await fetch(url.toString());
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const contentEncoding = String(response.headers.get('content-encoding') || '').toLowerCase();
    const isGzip =
      contentEncoding.includes('gzip')
      || url.pathname.endsWith('.gz')
      || contentType.includes('application/gzip')
      || contentType.includes('application/x-gzip');

    if (!isGzip) return await response.json();
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

async function fetchStaticFallbackIdentityName(ticker, request, env) {
  if (!ticker || !request?.url) return null;
  const now = Date.now();
  if (!v7SearchExactCache || (now - v7SearchExactCachedAt) > V7_SEARCH_EXACT_TTL_MS) {
    const origin = new URL(request.url).origin;
    const assetFetcher = env?.ASSETS || null;
    const payload = await fetchJsonMaybeGzip(new URL('/data/universe/v7/search/search_exact_by_symbol.json.gz', origin), assetFetcher);
    if (payload && typeof payload === 'object') {
      v7SearchExactCache = payload;
      v7SearchExactCachedAt = now;
    }
  }

  const bySymbol = v7SearchExactCache?.by_symbol;
  if (!bySymbol || typeof bySymbol !== 'object') return null;
  const row = bySymbol[String(ticker || '').toUpperCase()];
  return firstMeaningfulIdentityName(
    ticker,
    row?.name,
    row?.display_name,
    row?.long_name,
  );
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
  const expectedTargetMarketDate = resolveExpectedTargetMarketDate(now);

  const staticBars = await loadStaticBarsFallback(effectiveTicker, request, env);
  const staticLatestDate = pickLatestBar(staticBars)?.date || null;
  const staticHistoryStale = isDateBehind(staticLatestDate, expectedTargetMarketDate);
  const shouldTryProviderChain = !staticBars.length || staticHistoryStale;

  if (shouldTryProviderChain) {
    try {
      const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
        outputsize: '300',
        allowFailover: true,
        providerSymbols: providerSymbolMap,
      });
      sourceChain = buildSourceChainMetadata(chainResult.chain);
      if (chainResult.ok) {
        const providerBars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
        const providerLatestDate = pickLatestBar(providerBars)?.date || null;
        const preferProviderBars = providerBars.length > 0 && (
          !staticBars.length
          || !staticLatestDate
          || (providerLatestDate && providerLatestDate >= staticLatestDate)
        );
        if (preferProviderBars) {
          bars = providerBars;
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
      }
    } catch { /* fall through */ }
  }

  if (!bars.length && staticBars.length) {
    bars = staticBars;
    provider = 'static_store';
    sourceChain = buildSourceChainMetadata({
      primary: 'static_store',
      secondary: 'static_store',
      selected: 'static_store',
      fallbackUsed: true,
    });
    qualityFlags.push('STATIC_FALLBACK_HISTORY');
    if (staticHistoryStale) qualityFlags.push('STATIC_FALLBACK_STALE_VS_EXPECTED_SESSION');
  }

  if (!bars.length) {
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No bar data available', retryable: true },
    };
  }

  if (provider !== 'static_store') {
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

  const historicalBarLimit = resolveHistoricalBarLimit(request);
  if (historicalBarLimit > 0 && bars.length > historicalBarLimit) {
    bars = bars.slice(-historicalBarLimit);
    qualityFlags.push(`BAR_LIMIT_${historicalBarLimit}`);
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
  let assembledFundamentals = null;
  if (!shouldSkipSummaryEvaluation(request, env)) {
    try {
      const { assembleDecisionInputs, loadRequestCoreInputs } = await import('./decision-input-assembly.js');
      const { buildStockInsightsV4Evaluation } = await import('./stock-insights-v4.js');
      const origin = new URL(request.url).origin;
      const assetFetcher = env?.ASSETS || null;
      async function fetchJsonForAssembly(path) {
        try {
          if (isLocalDevRequest(request)) {
            const localPayload = await readLocalJsonMaybeGzip(path);
            if (localPayload) return localPayload;
          }
          const res = assetFetcher && path.startsWith('/data/')
            ? await assetFetcher.fetch(new URL(path, origin).toString())
            : await fetch(new URL(path, origin).toString());
          return res.ok ? await res.json() : null;
        } catch { return null; }
      }
      const inputs = await assembleDecisionInputs(effectiveTicker, {
        fetchJson: fetchJsonForAssembly,
        coreInputs: { bars, stats: marketStats.stats, as_of: dataDate },
        loadCoreInputs: (t) => loadRequestCoreInputs(t, { request, assetFetcher, fetchJson: fetchJsonForAssembly }),
      });
      assembledFundamentals = inputs.fundamentals || null;
      const evaluation = buildStockInsightsV4Evaluation({
        ticker: effectiveTicker,
        bars: inputs.bars,
        stats: inputs.stats,
        universe: inputs.universe,
        fundamentals: inputs.fundamentals,
        segmentationProfile: inputs.segmentationProfile,
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
  } else {
    qualityFlags.push('SUMMARY_DECISION_SKIPPED_LOCAL');
  }

  // Fallback name resolution from existing snapshots if still missing
  let fallbackName = null;
  // (We'll use universe snapshot below)

  // Snapshot joins for universe, market-prices, market-stats
  let universe = null;
  let snapshotMarketPrices = null;
  let snapshotMarketStats = null;
  if (!shouldSkipSummarySnapshotJoins(request, env)) {
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
  }

  // Fetch fundamentals as enrichment (with timeout to prevent Worker crash)
  const fetchedFundamentals = assembledFundamentals || await fetchAssetJsonFromPaths([
    `/data/fundamentals/${encodeURIComponent(String(effectiveTicker || '').toUpperCase())}.json`,
    `/public/data/fundamentals/${encodeURIComponent(String(effectiveTicker || '').toUpperCase())}.json`,
  ], request, env);
  const fundamentalsScope = await fetchAssetJsonFromPaths([
    '/data/fundamentals/_scope.json',
    '/public/data/fundamentals/_scope.json',
  ], request, env);
  const fundamentals = buildTypedFundamentalsFallback({
    ticker: effectiveTicker,
    universe,
    fundamentals: fetchedFundamentals,
    expectedDataDate: expectedTargetMarketDate,
    scopeDoc: fundamentalsScope,
  });

  if (!shouldSkipSummarySnapshotJoins(request, env) && !firstMeaningfulIdentityName(effectiveTicker, ctx.name, fundamentals?.companyName, universe?.name)) {
    fallbackName = await fetchStaticFallbackIdentityName(effectiveTicker, request, env);
  }

  const selectedMarketPrices = choosePreferredMarketPrices(snapshotMarketPrices, marketPrices) || marketPrices;
  const selectedMarketStats = choosePreferredMarketStats(snapshotMarketStats, marketStats) || marketStats;
  const decisionBundle = await readDecisionForTicker(ctx.canonicalId || effectiveTicker, {
    request,
    env,
    targetMarketDate: expectedTargetMarketDate,
  });
  const dailyDecision = decisionBundle.decision || null;
  const analysisReadiness = decisionBundle.analysis_readiness || {
    status: 'FAILED',
    source: 'decision_bundle',
    blocking_reasons: ['bundle_missing'],
    warnings: [],
  };

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      name: preferredIdentityName({
        ticker: effectiveTicker,
        resolverName: ctx.name,
        fundamentalsName: fundamentals?.companyName,
        universeName: universe?.name,
        fallbackName,
      }),
      resolution: ctx.resolution,
      latest_bar: latestBar,
      change,
      market_prices: selectedMarketPrices,
      market_stats: selectedMarketStats,
      fundamentals,
      states,
      decision,
      daily_decision: dailyDecision,
      analysis_readiness: analysisReadiness,
      explanation,
      module_freshness: {
        price_as_of: selectedMarketPrices?.date || dataDate,
        historical_as_of: dataDate,
        market_stats_as_of: selectedMarketStats?.as_of || dataDate,
        decision_as_of: dailyDecision?.generated_at || decision?.asof || decision?.created_at || null,
      },
    },
    meta: {
      status,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      price_date: selectedMarketPrices?.date || null,
      indicator_date: selectedMarketStats?.as_of || null,
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
  const expectedTargetMarketDate = resolveExpectedTargetMarketDate(now);
  const staticBars = await loadStaticBarsFallback(effectiveTicker, request, env);
  const staticLatestDate = pickLatestBar(staticBars)?.date || null;
  const staticHistoryStale = isDateBehind(staticLatestDate, expectedTargetMarketDate);
  const shouldTryProviderChain = !staticBars.length || staticHistoryStale;
  if (shouldTryProviderChain) {
    try {
      const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
        outputsize: '300',
        allowFailover: true,
        providerSymbols: providerSymbolMap,
      });
      if (chainResult.ok) {
        const providerBars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
        const providerLatestDate = pickLatestBar(providerBars)?.date || null;
        const preferProviderBars = providerBars.length > 0 && (
          !staticBars.length
          || !staticLatestDate
          || (providerLatestDate && providerLatestDate >= staticLatestDate)
        );
        if (preferProviderBars) {
          bars = providerBars;
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
      }
    } catch { /* fall through */ }
  }
  if (!bars.length && staticBars.length) {
    bars = staticBars;
    provider = 'static_store';
    qualityFlags.push('STATIC_FALLBACK_HISTORY');
    if (staticHistoryStale) qualityFlags.push('STATIC_FALLBACK_STALE_VS_EXPECTED_SESSION');
    const quality = evaluateQuality({ bars }, env);
    if (quality.reject) {
      qualityFlags.push('STATIC_FALLBACK_QUALITY_DEGRADED');
      qualityFlags.push(quality.reject.code || 'QUALITY_REJECT');
    }
    if (Array.isArray(quality.flags)) qualityFlags.push(...quality.flags);
  }

  if (!bars.length) {
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No historical data available', retryable: true },
    };
  }

  const historicalBarLimit = resolveHistoricalBarLimit(request);
  if (historicalBarLimit > 0 && bars.length > historicalBarLimit) {
    bars = bars.slice(-historicalBarLimit);
    qualityFlags.push(`BAR_LIMIT_${historicalBarLimit}`);
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
  const indicatorIssues = [];
  const normalizedIndicators = indicatorArray;
  const historicalQualityFlags = [...new Set([...(qualityFlags.length ? qualityFlags : []), ...indicatorIssues])];

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      bars,
      indicators: normalizedIndicators,
      indicator_issues: indicatorIssues,
      breakout_v2: breakoutV2,
    },
    meta: {
      status,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      provider,
      quality_flags: historicalQualityFlags.length ? historicalQualityFlags : undefined,
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
        if (isLocalDevRequest(request)) {
          const localPayload = await readLocalJsonMaybeGzip(path);
          if (localPayload) return localPayload;
        }
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
      fundamentals: inputs.fundamentals,
      segmentationProfile: inputs.segmentationProfile,
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

export async function fetchStockHistoricalProfile(ticker, env, request) {
  const ctx = await resolveTickerContext(ticker, request);
  if (!ctx.ok) return { ok: false, data: null, meta: { status: 'error', provider: 'v2-historical-profile', version: 'v2' }, error: ctx.error };

  const ttl = getEndpointTTL('v2_historical');
  const effectiveTicker = ctx.ticker;
  const now = new Date();
  const candidates = buildHistoricalProfileCandidates(effectiveTicker);
  let profile = null;
  let resolvedSymbol = null;

  for (const candidate of candidates) {
    const doc = await fetchHistProbsPublicProjection(candidate, request, env)
      || await fetchAssetJsonFromPaths(buildHistProbsCandidatePaths(candidate), request, env);
    if (doc) {
      profile = doc;
      resolvedSymbol = candidate;
      break;
    }
  }

  if (!profile) {
    const historical = await fetchStockHistorical(effectiveTicker, env, request);
    const derived = deriveHistoricalProfileFromBars(effectiveTicker, historical?.data?.bars || []);
    if (derived) {
      profile = derived;
      resolvedSymbol = effectiveTicker;
    }
  }

  const regime = await fetchAssetJsonFromPaths([
    '/data/hist-probs/regime-daily.json',
    '/public/data/hist-probs/regime-daily.json',
  ], request, env);

  const availability = summarizeHistoricalProfileAvailability(profile);
  const dataDate = profile?.latest_date || regime?.date || todayUtcDate();
  const metaStatus = availability.status === 'ready'
    ? computeStatusFromDataDate(dataDate, now, ttl.max_stale_days, ttl.pending_window_minutes)
    : 'pending';

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      profile,
      regime,
      availability,
      resolved_symbol: resolvedSymbol,
    },
    meta: {
      status: metaStatus,
      generated_at: nowUtcIso(),
      data_date: dataDate,
      provider: 'v2-historical-profile',
      version: 'v2',
    },
    error: null,
  };
}
