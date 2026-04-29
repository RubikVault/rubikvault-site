import { sha256Hex } from './_shared/digest.mjs';
import { resolveSymbol, normalizeTicker as normalizeTickerStrict } from './_shared/symbol-resolver.mjs';
import { fetchBarsWithProviderChain } from './_shared/eod-providers.mjs';
import { processTickerSeries } from './_shared/breakout-core.mjs';
import { recordFailure } from './_shared/circuit.js';
import { computeIndicators } from './_shared/eod-indicators.mjs';
// EODHD is the sole equity EOD provider (v13.1) — no tiingo-key import needed
import {
  DEFAULT_TTL_SECONDS,
  SWR_MARK_TTL_SECONDS,
  DEGRADE_AFTER_SECONDS,
  buildCacheMeta,
  computeAgeSeconds,
  createCache,
  getJsonKV,
  makeCacheKey,
  nowUtcIso,
  parseIsoDateToMs,
  todayUtcDate,
  tryMarkSWR
} from './_shared/cache-law.js';
import { evaluateQuality } from './_shared/quality.js';
import { isPrivilegedDebug, redact } from './_shared/observability.js';
import { computeCacheStatus } from './_shared/freshness.js';
import {
  buildStockInsightsV4Evaluation,
  makeContractState
} from './_shared/stock-insights-v4.js';
import { assembleDecisionInputs, loadRequestCoreInputs } from './_shared/decision-input-assembly.js';
import { fetchEodhdFundamentals } from './_shared/fundamentals-eodhd.mjs';
import { fetchFmpFundamentals } from './_shared/fundamentals-fmp.mjs';
import {
  annotateFundamentalsForScope,
  resolveFundamentalsScopeMember,
} from './_shared/fundamentals-scope.mjs';
import { mergeCatalystFields } from './_shared/catalyst-normalization.mjs';
import {
  computeStatusFromDataDate,
  diffDays,
  isoDay,
  minutesSinceUtcMidnight,
  parseIsoDay,
} from './_shared/market-calendar.js';
import { readDecisionForTicker } from './_shared/decision-bundle-reader.js';
import { readPageCoreForTicker } from './_shared/page-core-reader.js';

const MODULE_NAME = 'stock';
const TICKER_MAX_LENGTH = 12;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-:]+$/;
const SNAPSHOT_PATH_TEMPLATES = [
  '/data/snapshots/{module}/latest.json',
  '/data/snapshots/{module}.json',
  '/data/{module}.json'
];
const MODULE_PATHS = ['universe', 'market-prices', 'market-stats', 'market-score'];
const DEFAULT_EOD_CACHE_TTL_SECONDS = DEFAULT_TTL_SECONDS;
const DEFAULT_EOD_LOCK_TTL_SECONDS = 60;
const DEFAULT_MAX_STALE_DAYS = 14;
const DEFAULT_PENDING_WINDOW_MINUTES = 120;
const V7_STOCK_SSOT_TTL_MS = 10 * 60 * 1000;
const V7_SEARCH_EXACT_TTL_MS = 10 * 60 * 1000;
const LOCAL_DEV_HISTORY_DAYS = 90;
const PRIVATE_DECISION_BLOCKERS = new Set([
  'bundle_missing',
  'bundle_stale',
  'index_missing',
  'part_missing',
  'part_fetch_failed',
  'decision_missing',
]);

let v7StockSetCache = null;
let v7StockSetCachedAt = 0;
let v7SearchExactCache = null;
let v7SearchExactCachedAt = 0;

function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > TICKER_MAX_LENGTH) return null;
  if (/\s/.test(trimmed)) return null;
  const normalized = trimmed.toUpperCase();
  if (!VALID_TICKER_REGEX.test(normalized)) return null;
  return normalized;
}

function normalizeStatusUpper(value, fallback = 'DEGRADED') {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
}

function decisionBundleBlocksPublicReadiness(decisionBundle) {
  const readiness = decisionBundle?.analysis_readiness || {};
  const reasons = [
    ...(Array.isArray(readiness.blocking_reasons) ? readiness.blocking_reasons : []),
    ...(Array.isArray(decisionBundle?.decision?.blocking_reasons) ? decisionBundle.decision.blocking_reasons : []),
  ].map((item) => String(item?.id || item || '').trim());
  return decisionBundle?.ok === false
    || reasons.some((reason) => PRIVATE_DECISION_BLOCKERS.has(reason))
    || normalizeStatusUpper(readiness.decision_bundle_status || readiness.status, 'FAILED') === 'FAILED';
}

function buildPublicDecisionFromPageCore(pageCoreResult, privateDecisionBundle = null) {
  if (!pageCoreResult?.ok || !pageCoreResult.pageCore) return null;
  const row = pageCoreResult.pageCore;
  const summary = row.summary_min || {};
  const governance = row.governance_summary || {};
  const freshness = row.freshness || {};
  const govBlocking = Array.isArray(governance.blocking_reasons) ? governance.blocking_reasons : [];
  const govWarnings = Array.isArray(governance.warnings) ? governance.warnings : [];
  const qualityStatus = normalizeStatusUpper(summary.quality_status || governance.status, 'DEGRADED');
  const freshnessStatus = String(pageCoreResult.freshness_status || freshness.status || '').toLowerCase();
  const pageCoreGreen = qualityStatus === 'OK'
    && govBlocking.length === 0
    && !['expired', 'error', 'missing'].includes(freshnessStatus);
  const privateBlocked = decisionBundleBlocksPublicReadiness(privateDecisionBundle);
  const signalQuality = pageCoreGreen && !privateBlocked ? 'fresh' : (pageCoreGreen ? 'degraded' : 'suppressed');
  const privateReadiness = privateDecisionBundle?.analysis_readiness || {};
  const publicWarnings = [
    ...govWarnings,
    ...(privateBlocked ? ['private_decision_bundle_unavailable_or_stale'] : []),
    ...(signalQuality === 'suppressed' ? ['page_core_public_projection_not_green'] : []),
  ];
  const riskLevel = String(summary.risk_level || governance.risk_level || governance.risk_bucket || 'DEGRADED').toUpperCase();
  const decision = {
    schema: 'rv.asset_daily_decision.v1',
    source: 'page_core_public_projection',
    run_id: pageCoreResult.run_id || row.run_id || null,
    snapshot_id: pageCoreResult.snapshot_id || row.snapshot_id || null,
    target_market_date: freshness.as_of || row.target_market_date || null,
    canonical_id: row.canonical_asset_id || pageCoreResult.canonical_id || null,
    symbol: row.display_ticker || row.provider_ticker || null,
    pipeline_status: pageCoreGreen ? 'OK' : 'DEGRADED',
    verdict: summary.decision_verdict || 'WAIT',
    confidence_bucket: summary.decision_confidence_bucket || null,
    blocking_reasons: pageCoreGreen ? [] : (govBlocking.length ? govBlocking : ['page_core_public_projection_degraded']),
    warnings: publicWarnings,
    risk_assessment: {
      level: riskLevel === 'UNKNOWN' ? 'DEGRADED' : riskLevel,
    },
    signal_quality: signalQuality,
  };
  const analysisReadiness = {
    status: pageCoreGreen ? 'OK' : 'DEGRADED',
    source: 'page_core_public_projection',
    decision_bundle_status: pageCoreGreen ? 'OK' : 'DEGRADED',
    decision_internal_green: !privateBlocked,
    decision_public_green: pageCoreGreen,
    operability_green: pageCoreGreen,
    signal_quality: signalQuality,
    blocking_reasons: [],
    warnings: publicWarnings,
    private_decision_status: normalizeStatusUpper(privateReadiness.decision_bundle_status || privateReadiness.status || privateDecisionBundle?.decision?.pipeline_status, privateDecisionBundle ? 'DEGRADED' : 'MISSING'),
    private_decision_available: !privateBlocked,
    page_core: {
      snapshot_id: pageCoreResult.snapshot_id || null,
      freshness_status: pageCoreResult.freshness_status || null,
    },
  };
  return { decision, analysisReadiness };
}

function buildSourceChainMetadata(chain) {
  if (!chain || typeof chain !== 'object') {
    return {
      primary: 'eodhd',
      secondary: 'eodhd',
      forced: null,
      selected: null,
      fallbackUsed: false,
      failureReason: null,
      primaryFailure: null,
      circuit: null
    };
  }
  return {
    primary: chain.primary || 'eodhd',
    secondary: chain.secondary || 'eodhd',
    forced: chain.forced || null,
    selected: chain.selected || null,
    fallbackUsed: Boolean(chain.fallbackUsed),
    failureReason: chain.failureReason || null,
    primaryFailure: chain.primaryFailure || null,
    circuit: chain.circuit || null
  };
}

function pickLatestBar(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  return bars[bars.length - 1] || null;
}

function computeDayChange(bars) {
  if (!Array.isArray(bars) || bars.length < 2) {
    return { abs: null, pct: null };
  }
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const latestClose = Number.isFinite(latest?.adjClose) ? latest.adjClose : latest?.close;
  const prevClose = Number.isFinite(prev?.adjClose) ? prev.adjClose : prev?.close;
  if (!Number.isFinite(latestClose) || !Number.isFinite(prevClose) || prevClose === 0) {
    return { abs: null, pct: null };
  }
  const abs = latestClose - prevClose;
  return { abs, pct: abs / prevClose };
}

function computeStartDateISO(daysBack) {
  const days = Number.isFinite(Number(daysBack)) ? Number(daysBack) : 0;
  if (days <= 0) return null;
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function coerceTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    return parseIsoDateToMs(value);
  }
  return 0;
}

function parseSchedulerLastOk(value) {
  if (value == null) return 0;
  if (typeof value === 'string' || typeof value === 'number') {
    return coerceTimestampMs(value);
  }
  if (typeof value === 'object') {
    const candidate =
      value.generated_at ||
      value.last_ok ||
      value.lastOk ||
      value.ts ||
      value.timestamp ||
      value.time;
    return coerceTimestampMs(candidate);
  }
  return 0;
}

async function loadSchedulerState(env, isPrivileged) {
  const keys = ['meta:scheduler:last_ok', 'rv:scheduler:last_ok'];
  for (const key of keys) {
    const result = await getJsonKV(env, key);
    if (!result?.meta?.hit) continue;
    const ms = parseSchedulerLastOk(result.value);
    const ageSeconds = ms ? Math.floor((Date.now() - ms) / 1000) : null;
    const degraded = typeof ageSeconds === 'number' && ageSeconds > DEGRADE_AFTER_SECONDS;
    return {
      degraded,
      reason: degraded ? 'scheduler_stale' : null
    };
  }
  return {
    degraded: false,
    reason: isPrivileged ? 'unknown' : null
  };
}

async function getSWRPending(env, swrKey, pendingWindowSeconds) {
  if (!swrKey) return false;
  const result = await getJsonKV(env, swrKey);
  if (!result?.meta?.hit) return false;
  const marker = result.value || {};
  const markedAt = marker.marked_at || marker.ts || marker.time || '';
  const ageSeconds = computeAgeSeconds(markedAt);
  if (ageSeconds == null) return false;
  return ageSeconds <= pendingWindowSeconds;
}

async function fetchSnapshot(moduleName, request) {
  const baseUrl = new URL(request.url);
  const attempts = SNAPSHOT_PATH_TEMPLATES.map((template) => template.replace('{module}', moduleName));
  const controllers = attempts.map(() => new AbortController());
  const attemptPromises = attempts.map(async (path, index) => {
    const url = new URL(path, baseUrl);
    const startedAt = Date.now();
    try {
      const response = await fetch(url.toString(), { signal: controllers[index].signal });
      if (!response.ok) {
        return { ok: false, path, error: `HTTP ${response.status}` };
      }
      const payload = await response.json();
      return {
        ok: true,
        snapshot: payload,
        path,
        status: response.status,
        served_from: 'ASSET',
        latency_ms: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        path,
        error: error instanceof Error ? error.message : String(error || 'snapshot_missing'),
        latency_ms: Date.now() - startedAt,
      };
    }
  });

  const winnerPromises = attemptPromises.map((promise) => promise.then((result) => {
    if (result.ok) return result;
    throw result;
  }));

  try {
    const hit = await Promise.any(winnerPromises);
    for (const controller of controllers) controller.abort();
    return hit;
  } catch {
    const results = await Promise.all(attemptPromises);
    const lastError = results.find((item) => item.error)?.error || 'snapshot_missing';
    return {
      snapshot: null,
      path: attempts[0],
      status: null,
      served_from: null,
      error: lastError,
      attempted: results,
    };
  }
}

function isLocalDevRequest(request) {
  try {
    const url = new URL(request.url);
    return ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function fetchV7StockSet(request) {
  const now = Date.now();
  if (v7StockSetCache && (now - v7StockSetCachedAt) < V7_STOCK_SSOT_TTL_MS) {
    return v7StockSetCache;
  }

  try {
    const baseUrl = new URL(request.url);
    const url = new URL('/data/universe/v7/ssot/stocks.max.symbols.json', baseUrl);
    const response = await fetch(url.toString(), { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!response.ok) return null;
    const payload = await response.json();
    const symbols = Array.isArray(payload?.symbols) ? payload.symbols : [];
    const set = new Set(
      symbols
        .map((sym) => normalizeTicker(String(sym || '')))
        .filter(Boolean)
    );
    if (!set.size) return null;
    v7StockSetCache = set;
    v7StockSetCachedAt = now;
    return set;
  } catch {
    return null;
  }
}

async function fetchJsonMaybeGzip(url) {
  try {
    const response = await fetch(url.toString(), { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const contentEncoding = String(response.headers.get('content-encoding') || '').toLowerCase();
    const isGzip =
      contentEncoding.includes('gzip') ||
      url.pathname.endsWith('.gz') ||
      contentType.includes('application/gzip') ||
      contentType.includes('application/x-gzip');

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

async function fetchV7SearchExactEntry(request, symbol) {
  const now = Date.now();
  if (!v7SearchExactCache || (now - v7SearchExactCachedAt) > V7_SEARCH_EXACT_TTL_MS) {
    const baseUrl = new URL(request.url);
    const url = new URL('/data/universe/v7/search/search_exact_by_symbol.json.gz', baseUrl);
    const payload = await fetchJsonMaybeGzip(url);
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
    provider_symbol: typeof row.provider_symbol === 'string' && row.provider_symbol.trim() ? row.provider_symbol.trim().toUpperCase() : null,
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null,
    exchange: typeof row.exchange === 'string' && row.exchange.trim() ? row.exchange : (canonicalExchange || null),
    country: typeof row.country === 'string' && row.country.trim() ? row.country : null
  };
}

function buildEodhdSymbol(symbol, exchange) {
  const cleanSymbol = normalizeTicker(symbol);
  const cleanExchange = String(exchange || '').trim().toUpperCase();
  if (!cleanSymbol) return null;
  if (!cleanExchange) return cleanSymbol;
  return `${cleanSymbol}.${cleanExchange}`;
}

function buildProviderSymbolMap(symbol, exchange) {
  let cleanSymbol = normalizeTicker(symbol);
  if (!cleanSymbol) return null;

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

  const eodhdSymbol = buildEodhdSymbol(cleanSymbol, exchange);
  return {
    eodhd: eodhdSymbol || cleanSymbol,
    tiingo: cleanSymbol,
    twelvedata: cleanSymbol
  };
}

function findRecord(snapshot, symbol) {
  if (!snapshot || !snapshot.data) return null;
  const payload = snapshot.data;

  const lookup = (key) => {
    if (Array.isArray(payload)) {
      return payload.find((entry) => (entry?.symbol || entry?.ticker) === key) || null;
    }
    if (typeof payload === 'object') {
      return payload[key] || null;
    }
    return null;
  };

  const result = lookup(symbol);
  if (result) return result;

  // Fallback for dot-notated or colon-notated tickers (e.g. US.AAPL or US:APA)
  if (typeof symbol === 'string' && (symbol.includes('.') || symbol.includes(':'))) {
    const replacement = symbol.includes('.') ? symbol.replace('.', ':') : symbol.replace(':', '.');
    const fallback = lookup(replacement);
    if (fallback) return fallback;
    
    const parts = symbol.includes('.') ? symbol.split('.') : symbol.split(':');
    if (parts.length === 2) {
      const directFallback = lookup(parts[1]);
      if (directFallback) return directFallback;
    }
  }

  return null;
}

async function computeDigest(input) {
  const canonical = JSON.stringify(input);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

function buildUniversePayload(entry, symbol) {
  const indexes = Array.isArray(entry?.indexes) ? entry.indexes : [];
  return {
    symbol,
    exists_in_universe: Boolean(entry),
    name: entry?.name || null,
    exchange: entry?.exchange || null,
    currency: entry?.currency || null,
    country: entry?.country || null,
    sector: entry?.sector || null,
    industry: entry?.industry || null,
    indexes,
    membership: {
      in_dj30: indexes.includes('DJ30'),
      in_sp500: indexes.includes('SP500'),
      in_ndx100: indexes.includes('NDX100'),
      in_rut2000: indexes.includes('RUT2000')
    },
    updated_at: entry?.updated_at || null
  };
}

function buildMarketPricesPayload(priceEntry, symbol) {
  if (!priceEntry) return null;
  return {
    symbol,
    date: priceEntry.date || null,
    close: Number.isFinite(priceEntry.close) ? priceEntry.close : null,
    volume: Number.isFinite(priceEntry.volume) ? priceEntry.volume : null,
    currency: priceEntry.currency || null,
    source_provider: priceEntry.source_provider || null,
    raw: priceEntry
  };
}

function buildMarketStatsPayload(statsEntry, symbol) {
  if (!statsEntry) return null;
  return {
    symbol,
    as_of: statsEntry.as_of || null,
    stats: statsEntry.stats || null,
    coverage: statsEntry.coverage || null,
    warnings: Array.isArray(statsEntry.warnings) ? statsEntry.warnings : []
  };
}

function buildMarketPricesFromLatestBar(latestBar, symbol, providerHint) {
  if (!latestBar || !Number.isFinite(latestBar?.close)) return null;
  return {
    symbol,
    date: latestBar?.date || null,
    close: Number.isFinite(latestBar?.close) ? Number(latestBar.close) : null,
    volume: Number.isFinite(latestBar?.volume) ? Number(latestBar.volume) : null,
    currency: 'USD',
    source_provider: providerHint || null,
    raw: {
      symbol,
      date: latestBar?.date || null,
      open: Number.isFinite(latestBar?.open) ? Number(latestBar.open) : null,
      high: Number.isFinite(latestBar?.high) ? Number(latestBar.high) : null,
      low: Number.isFinite(latestBar?.low) ? Number(latestBar.low) : null,
      close: Number.isFinite(latestBar?.close) ? Number(latestBar.close) : null,
      volume: Number.isFinite(latestBar?.volume) ? Number(latestBar.volume) : null,
      adj_close: Number.isFinite(latestBar?.adjClose) ? Number(latestBar.adjClose) : Number(latestBar?.close),
      source_provider: providerHint || null
    }
  };
}

function buildMarketStatsFromIndicators(indicators, symbol, asOf) {
  if (!Array.isArray(indicators) || indicators.length === 0) return null;
  const stats = {};
  for (const item of indicators) {
    if (!item || typeof item.id !== 'string') continue;
    stats[item.id] = item.value;
  }
  return {
    symbol,
    as_of: asOf || null,
    stats,
    coverage: null,
    warnings: []
  };
}

function buildErrorPayload(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

function aggregateSources(results) {
  const sources = {};
  for (const [moduleName, result] of Object.entries(results)) {
    sources[moduleName] = {
      served_from: result.served_from || 'MISSING',
      path: result.path,
      status: result.status,
      error: result.error || null
    };
  }
  return sources;
}

/**
 * Fetch static EOD bar from batch artifact for preview mode fallback.
 * Tries batches 000, then 001, etc. Returns null if not found.
 */
async function fetchStaticEodBar(ticker, request) {
  const baseUrl = new URL(request.url);
  const batchPaths = [
    '/data/eod/batches/eod.latest.000.json',
    '/data/eod/batches/eod.latest.001.json'
  ];
  for (const path of batchPaths) {
    try {
      const url = new URL(path, baseUrl);
      const response = await fetch(url.toString());
      if (!response.ok) continue;
      const payload = await response.json();
      const tickerData = payload?.data?.[ticker];
      if (tickerData && tickerData.date && Number.isFinite(tickerData.close)) {
        return {
          bar: {
            date: tickerData.date,
            open: tickerData.open ?? null,
            high: tickerData.high ?? null,
            low: tickerData.low ?? null,
            close: tickerData.close,
            volume: tickerData.volume ?? null,
            adjClose: tickerData.adjClose ?? tickerData.close
          },
          source: 'static-eod-batch',
          path
        };
      }
    } catch {
      // continue to next batch
    }
  }
  return null;
}


export async function onRequestGet(context) {
  const { request } = context;
  const env = context?.env || {};
  const url = new URL(request.url);
  const tickerParam = (
    url.searchParams.get('ticker')
    || url.searchParams.get('t')
    || url.searchParams.get('symbol')
    || ''
  );
  const normalizedTicker = normalizeTicker(tickerParam);
  // v4 evaluation is always enabled — no longer gated by query parameter

  const isPrivileged = isPrivilegedDebug(request, env);
  const timings = { t_total_ms: 0, t_kv_ms: null, t_origin_ms: null, t_build_ms: null };
  const requestStart = Date.now();
  const startedAt = nowUtcIso();

  // Phase 2: resolve name + fetch EOD history via provider chain.
  // This is independent of the legacy snapshot join below (kept for backwards compatibility).
  let resolvedName = null;
  let resolvedMethod = null;
  let resolvedTicker = normalizedTicker || null;
  let resolvedCanonicalId = null;
  let resolvedExchange = null;
  let resolvedCountry = null;
  let v7ExactMeta = null;
  try {
    const resolved = await resolveSymbol(normalizedTicker || tickerParam, request);
    if (resolved?.ok && resolved?.data?.ticker) {
      const strictTicker = normalizeTickerStrict(resolved.data.ticker);
      if (strictTicker) {
        resolvedTicker = strictTicker;
        v7ExactMeta = await fetchV7SearchExactEntry(request, strictTicker);
        resolvedName = resolved.data.name || v7ExactMeta?.name || null;
        resolvedMethod = resolved.data.method || null;
        resolvedCanonicalId = resolved.data.canonical_id || v7ExactMeta?.canonical_id || null;
        resolvedExchange = resolved.data.exchange || v7ExactMeta?.exchange || null;
        resolvedCountry = resolved.data.country || v7ExactMeta?.country || null;
      }
    }
  } catch {
    // ignore
  }
  if (!v7ExactMeta && resolvedTicker) {
    try {
      v7ExactMeta = await fetchV7SearchExactEntry(request, resolvedTicker);
    } catch {
      // ignore
    }
  }
  if (!resolvedName) {
    resolvedName = v7ExactMeta?.name || null;
  }
  if (!resolvedCanonicalId) {
    resolvedCanonicalId = v7ExactMeta?.canonical_id || null;
  }
  if (!resolvedExchange) {
    resolvedExchange = v7ExactMeta?.exchange || null;
  }
  if (!resolvedCountry) {
    resolvedCountry = v7ExactMeta?.country || null;
  }
  const effectiveTicker = resolvedTicker || normalizedTicker || null;
  const providerSymbolMap = buildProviderSymbolMap(effectiveTicker, resolvedExchange);

  let eodBars = [];
  let eodError = null;
  let eodStatus = null;
  let eodProvider = null;
  let sourceChain = buildSourceChainMetadata(null);
  let reasons = [];
  let eodAttempted = false;
  const qualityFlags = new Set();

  const cache = createCache(env);
  const now = new Date();
  const localDevRequest = isLocalDevRequest(request)
    || ['1', 'true', 'yes'].includes(String(env?.RV_LOCAL_DEV || '').trim().toLowerCase());
  const cacheId = effectiveTicker || null;
  const cacheTtlSeconds = Number(env?.EOD_CACHE_TTL_SECONDS) || DEFAULT_EOD_CACHE_TTL_SECONDS;
  const lockTtlSeconds = Number(env?.EOD_LOCK_TTL_SECONDS) || DEFAULT_EOD_LOCK_TTL_SECONDS;
  const maxStaleDays = Number(env?.EOD_MAX_STALE_DAYS) || DEFAULT_MAX_STALE_DAYS;
  const pendingWindowMinutes = Number(env?.EOD_PENDING_WINDOW_MINUTES) || DEFAULT_PENDING_WINDOW_MINUTES;
  const pendingWindowSeconds = Number(env?.SWR_PENDING_WINDOW_SECONDS) || 120;

  const primaryKey = cacheId ? cache.dataKey(cacheId) : null;
  const primaryMetaKey = cacheId ? cache.metaKey(cacheId) : null;
  const aliasKey = cacheId ? makeCacheKey('stock', cacheId) : null;
  const aliasMetaKey = cacheId ? makeCacheKey('meta', `stock:${cacheId}`) : null;
  const swrKey = cacheId ? makeCacheKey('swr', `stock:${cacheId}`) : null;

  let cachedPayload = null;
  let cachedBars = [];
  let cachedMeta = null;
  let cachedStatus = null;
  let cachedProvider = null;
  let cachedDataDate = '';
  let cachedAgeSeconds = null;
  let cachedStale = false;
  let cacheKeyUsed = null;
  let cacheMetaKeyUsed = null;
  let cacheHit = false;
  let swrMarked = undefined;
  let swrPending = false;

  if (cacheId) {
    const kvStart = Date.now();
    const cached = await cache.readCached(cacheId);
    cachedPayload = cached?.data ?? null;
    cachedMeta = cached?.metaLike ?? null;
    cacheKeyUsed = primaryKey;
    cacheMetaKeyUsed = primaryMetaKey;

    if (cachedPayload == null && aliasKey && aliasKey !== primaryKey) {
      const aliasData = await getJsonKV(env, aliasKey);
      if (aliasData?.meta?.hit) {
        cachedPayload = aliasData.value;
        cacheKeyUsed = aliasKey;
      }
      if (cachedPayload && aliasMetaKey) {
        const aliasMeta = await getJsonKV(env, aliasMetaKey);
        if (aliasMeta?.meta?.hit) {
          cachedMeta = aliasMeta.value;
          cacheMetaKeyUsed = aliasMetaKey;
        }
      }
    }
    timings.t_kv_ms = Date.now() - kvStart;
  }

  if (cachedPayload != null) {
    cachedBars = Array.isArray(cachedPayload?.bars)
      ? cachedPayload.bars
      : Array.isArray(cachedPayload)
        ? cachedPayload
        : [];
    cachedMeta = cachedMeta || null;
    cachedProvider = cachedMeta?.provider || null;
    cachedDataDate = cachedMeta?.data_date || pickLatestBar(cachedBars)?.date || '';
    cachedStatus = cachedBars.length
      ? computeStatusFromDataDate(cachedDataDate, now, maxStaleDays, pendingWindowMinutes)
      : null;
    cachedAgeSeconds = computeAgeSeconds(cachedMeta?.generated_at);
    swrPending = cacheId ? await getSWRPending(env, swrKey, pendingWindowSeconds) : false;
    const cacheStatus = computeCacheStatus({
      hasData: cachedBars.length > 0,
      ageSeconds: cachedAgeSeconds,
      ttlSeconds: cacheTtlSeconds,
      pending: swrPending
    });
    cachedStale =
      cacheStatus.stale ||
      cachedStatus === 'stale' ||
      cachedStatus === 'pending' ||
      cachedStatus === 'error';
  } else if (cacheId) {
    swrPending = await getSWRPending(env, swrKey, pendingWindowSeconds);
  }

  const forcedProvider = String(env?.RV_FORCE_PROVIDER || '').trim();
  const hasEodKeys = Boolean(env?.EODHD_API_KEY || env?.EODHD_API_TOKEN);
  const canFetchProvider = Boolean(forcedProvider || hasEodKeys);

  async function fetchProviderBars({ flagSet = qualityFlags, recordTiming = false } = {}) {
    const originStart = recordTiming ? Date.now() : null;
    const startDate = computeStartDateISO(localDevRequest ? LOCAL_DEV_HISTORY_DAYS : 365 * 3);
    const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
      outputsize: '300',
      startDate,
      allowFailover: true,
      providerSymbols: providerSymbolMap
    });
    sourceChain = buildSourceChainMetadata(chainResult.chain);
    if (!chainResult.ok) {
      return { ok: false, error: chainResult.error || { code: 'EOD_FETCH_FAILED', message: 'Unable to fetch EOD history' } };
    }
    const bars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
    const quality = evaluateQuality({ bars }, env);
    if (quality.reject) {
      const provider = chainResult.provider || sourceChain?.selected || 'eodhd';
      await recordFailure(env, provider, 'QUALITY_REJECT');
      return { ok: false, error: { code: 'QUALITY_REJECT', message: quality.reject.message, details: quality.reject } };
    }
    if (Array.isArray(quality.flags)) {
      quality.flags.forEach((flag) => flagSet.add(flag));
    }
    if (recordTiming && originStart != null) {
      timings.t_origin_ms = Date.now() - originStart;
    }
    return { ok: true, bars, provider: chainResult.provider || sourceChain?.selected || null };
  }

  async function refreshCacheInBackground() {
    if (!cacheId || !effectiveTicker) return;
    const refreshFlags = new Set();
    try {
      const result = await fetchProviderBars({ flagSet: refreshFlags });
      if (result.ok && result.bars.length) {
        const latest = pickLatestBar(result.bars);
        const dataDate = latest?.date || todayUtcDate();
        await cache.writeCached(cacheId, { bars: result.bars }, cacheTtlSeconds, {
          provider: result.provider || 'eodhd',
          data_date: dataDate
        });
      }
      console.log(
        JSON.stringify({
          event: 'swr_refresh',
          module: MODULE_NAME,
          ticker: effectiveTicker,
          ok: result.ok,
          provider: result.provider || null,
          cache_key: cacheKeyUsed || primaryKey || null
        })
      );
    } finally {
      // no-op: best-effort refresh
    }
  }

  if (effectiveTicker && cachedBars.length) {
    const cachedQuality = evaluateQuality({ bars: cachedBars }, env);
    if (cachedQuality.reject) {
      cachedBars = [];
      cachedStatus = null;
      cachedProvider = null;
      cachedDataDate = '';
      cachedAgeSeconds = null;
      cachedStale = false;
      qualityFlags.add('CACHE_REJECTED');
    } else if (Array.isArray(cachedQuality.flags)) {
      cachedQuality.flags.forEach((flag) => qualityFlags.add(flag));
    }
  }

  if (effectiveTicker && cachedBars.length && !cachedStale) {
    cacheHit = true;
    eodBars = cachedBars;
    eodProvider = cachedProvider || 'eodhd';
    eodStatus = 'fresh';
    eodAttempted = true;
  } else if (effectiveTicker && cachedBars.length && cachedStatus === 'error' && canFetchProvider) {
    eodAttempted = true;
    if (swrPending) {
      cacheHit = true;
      eodBars = cachedBars;
      eodProvider = cachedProvider || 'eodhd';
      eodStatus = 'pending';
      qualityFlags.add('PENDING_REFRESH');
    } else {
      const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
      if (!gotLock) {
        cacheHit = true;
        eodBars = cachedBars;
        eodProvider = cachedProvider || 'eodhd';
        eodStatus = 'pending';
        qualityFlags.add('LOCKED_REFRESH');
      } else {
        try {
          const result = await fetchProviderBars({ recordTiming: true });
          if (result.ok) {
            eodBars = result.bars;
            eodProvider = result.provider || 'eodhd';
            const latest = pickLatestBar(eodBars);
            const dataDate = latest?.date || todayUtcDate();
            eodStatus = computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes);
            await cache.writeCached(cacheId, { bars: eodBars }, cacheTtlSeconds, {
              provider: eodProvider,
              data_date: dataDate
            });
          } else {
            cacheHit = true;
            eodBars = cachedBars;
            eodProvider = cachedProvider || 'eodhd';
            eodStatus = 'stale';
            qualityFlags.add('PROVIDER_FAIL');
            qualityFlags.add('CACHE_TOO_OLD');
            eodError = null;
          }
        } finally {
          await cache.releaseLock(cacheId);
        }
      }
    }
  } else if (effectiveTicker && cachedBars.length) {
    cacheHit = true;
    eodBars = cachedBars;
    eodProvider = cachedProvider || 'eodhd';
    eodStatus = cachedStatus === 'pending' ? 'pending' : 'stale';
    if (cachedStatus === 'error') {
      qualityFlags.add('CACHE_TOO_OLD');
    }
    eodAttempted = true;
    if (swrPending) {
      swrMarked = false;
      eodStatus = 'pending';
      qualityFlags.add('PENDING_REFRESH');
    } else if (canFetchProvider) {
      swrMarked = await tryMarkSWR(env, swrKey, SWR_MARK_TTL_SECONDS);
      if (swrMarked) {
        const refreshPromise = refreshCacheInBackground();
        if (typeof context?.waitUntil === 'function') {
          context.waitUntil(refreshPromise);
        } else {
          refreshPromise.catch(() => { });
        }
      } else {
        qualityFlags.add('LOCKED_REFRESH');
        eodStatus = 'pending';
      }
    } else {
      qualityFlags.add('EOD_KEYS_MISSING');
    }
  } else if (effectiveTicker) {
    // 2. Try Internal Static Store (Cold Layer)
    let staticBars = null;
    if (!eodAttempted) {
      try {
        const { getStaticBars } = await import('./_shared/history-store.mjs');
        staticBars = await getStaticBars(effectiveTicker, url.origin, env?.ASSETS || null);

        if (staticBars && staticBars.length > 0) {
          const lastBar = staticBars[staticBars.length - 1];
          let isFresh = false;
          if (lastBar && lastBar.date) {
            const age = computeAgeSeconds(parseIsoDateToMs(lastBar.date));
            if (age < maxStaleDays * 86400) {
              isFresh = true;
            }
          }

          eodBars = staticBars;
          eodProvider = 'static_store';
          eodStatus = isFresh ? 'fresh' : 'stale';
          eodAttempted = true;
          if (!isFresh) {
            qualityFlags.add('STATIC_STALE');
            if (swrPending) {
              qualityFlags.add('PENDING_REFRESH');
            } else if (canFetchProvider) {
              swrMarked = await tryMarkSWR(env, swrKey, SWR_MARK_TTL_SECONDS);
              if (swrMarked) {
                const refreshPromise = refreshCacheInBackground();
                if (typeof context?.waitUntil === 'function') {
                  context.waitUntil(refreshPromise);
                } else {
                  refreshPromise.catch(() => { });
                }
              } else {
                qualityFlags.add('LOCKED_REFRESH');
              }
            }
          }
        }
      } catch (err) {
        // Ignore static store error
      }
    }

    if (!eodAttempted) {
      const staticResult = await fetchStaticEodBar(effectiveTicker, request);
      if (staticResult && staticResult.bar) {
        eodBars = [staticResult.bar];
        eodProvider = staticResult.source;
        eodStatus = computeStatusFromDataDate(staticResult.bar.date, now, maxStaleDays, pendingWindowMinutes);
        eodAttempted = true;
        qualityFlags.add('STATIC_FALLBACK');
        if (canFetchProvider) {
          if (swrPending) {
            qualityFlags.add('PENDING_REFRESH');
          } else {
            swrMarked = await tryMarkSWR(env, swrKey, SWR_MARK_TTL_SECONDS);
            if (swrMarked) {
              const refreshPromise = refreshCacheInBackground();
              if (typeof context?.waitUntil === 'function') {
                context.waitUntil(refreshPromise);
              } else {
                refreshPromise.catch(() => { });
              }
            } else {
              qualityFlags.add('LOCKED_REFRESH');
            }
          }
        }
      } else if (!canFetchProvider) {
        reasons = ['EOD_KEYS_MISSING', 'NO_STATIC_DATA'];
        qualityFlags.add('EOD_KEYS_MISSING');
        qualityFlags.add('NO_STATIC_DATA');
        eodStatus = 'stale';
        eodAttempted = true;
      }
    }

    if (eodAttempted) {
      // Static layers already produced a usable response.
    } else {
      eodAttempted = true;
      if (swrPending) {
        eodError = { code: 'LOCKED_REFRESH', message: 'EOD refresh already in progress' };
        eodStatus = 'pending';
        qualityFlags.add('PENDING_REFRESH');
      } else {
        const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
        if (!gotLock) {
          eodError = { code: 'LOCKED_REFRESH', message: 'EOD refresh already in progress' };
          eodStatus = 'pending';
          qualityFlags.add('LOCKED_REFRESH');
        } else {
          try {
            const result = await fetchProviderBars({ recordTiming: true });
            if (result.ok) {
              eodBars = result.bars;
              eodProvider = result.provider || 'eodhd';
              const latest = pickLatestBar(eodBars);
              const dataDate = latest?.date || todayUtcDate();
              eodStatus = computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes);
              await cache.writeCached(cacheId, { bars: eodBars }, cacheTtlSeconds, {
                provider: eodProvider,
                data_date: dataDate
              });
            } else {
              // Provider fetch failed - try static history shards first
              if (!staticBars) {
                try {
                  const { getStaticBars } = await import('./_shared/history-store.mjs');
                  staticBars = await getStaticBars(effectiveTicker, url.origin, env?.ASSETS || null);
                } catch (err) { /* ignore */ }
              }

              if (staticBars && staticBars.length > 0) {
                eodBars = staticBars;
                eodProvider = 'static_store_fallback';
                const last = pickLatestBar(eodBars);
                eodStatus = computeStatusFromDataDate(last?.date, now, maxStaleDays, pendingWindowMinutes);
                qualityFlags.add('STATIC_FALLBACK_HISTORY');
                qualityFlags.add('PROVIDER_FAIL');
                eodError = null;
              } else {
                const staticResult = await fetchStaticEodBar(effectiveTicker, request);
                if (staticResult && staticResult.bar) {
                  eodBars = [staticResult.bar];
                  eodProvider = staticResult.source;
                  eodStatus = computeStatusFromDataDate(staticResult.bar.date, now, maxStaleDays, pendingWindowMinutes);
                  qualityFlags.add('STATIC_FALLBACK');
                  qualityFlags.add('PROVIDER_FAIL');
                  eodError = null;
                } else {
                  eodError = result.error || { code: 'EOD_FETCH_FAILED', message: 'Unable to fetch EOD history' };
                  eodStatus = 'error';
                  qualityFlags.add('PROVIDER_FAIL');
                  // Fallback to static store if provider fails
                  eodAttempted = false;
                  qualityFlags.add(eodError?.code === 'CB_OPEN' ? 'CB_OPEN' : 'PROVIDER_FAIL');
                }
              }
            }
          } finally {
            await cache.releaseLock(cacheId);
          }
        }
      }
    }
  }

  const modulePromises = MODULE_PATHS.map((moduleName) => fetchSnapshot(moduleName, request));
  const moduleResults = await Promise.all(modulePromises);
  const snapshots = Object.fromEntries(
    MODULE_PATHS.map((moduleName, index) => [moduleName, moduleResults[index]])
  );


  /**
   * Helper to fetch v3 data (EOD + Indicators)
   */
  async function findNdjsonRecord(response, ticker) {
    if (!response?.body) return null;
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const record = JSON.parse(line);
            if (record?.ticker === ticker) return record;
          } catch {
            // ignore malformed row and continue scanning
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
    const finalLine = `${buffer}${decoder.decode()}`.trim();
    if (!finalLine) return null;
    try {
      const record = JSON.parse(finalLine);
      return record?.ticker === ticker ? record : null;
    } catch {
      return null;
    }
  }

  async function fetchV3Data(env, request, ticker) {
    try {
      const v3Exchange = 'US'; // TODO: derive
      // Use standard fetch to avoid local deadlock issues with env.ASSETS in some environments
      const fetchFn = fetch;

      const eodCandidates = [
        `/data/v3/eod/${v3Exchange}/latest.ndjson.gz`
      ];
      const indicatorsCandidates = [
        `/data/v3/derived/indicators/${v3Exchange}__${ticker}.json`
      ];

      async function fetchFirst(paths) {
        for (const path of paths) {
          const url = new URL(path, request.url);
          const res = await fetchFn(url.toString(), { signal: AbortSignal.timeout(1500) });
          if (res.ok) return { res, path: url.pathname };
        }
        return null;
      }

      const [eodHit, indHit] = await Promise.all([
        fetchFirst(eodCandidates),
        fetchFirst(indicatorsCandidates)
      ]);

      if (!eodHit || !indHit) return null;

      const indData = await indHit.res.json();
      const eodRecord = await findNdjsonRecord(eodHit.res, ticker);

      if (!eodRecord || !indData) return null;

      return {
        eod: eodRecord,
        indicators: indData,
        sources: {
          eod: eodHit.path,
          indicators: indHit.path
        }
      };
    } catch (err) {
      console.error('V3_FETCH_ERROR', err);
      return null;
    }
  }

  async function compareV2V3(v2Payload, v3Data, env) {
    if (!v3Data || !v2Payload) return;

    const v2Price = v2Payload.data?.market_prices?.close;
    const v3Price = v3Data.eod?.bar?.close;

    // Simple drift check
    if (v2Price && v3Price && Math.abs(v2Price - v3Price) > 0.001) {
      const drift = {
        ticker: v2Payload.data.ticker,
        v2: v2Price,
        v3: v3Price,
        diff: Math.abs(v2Price - v3Price),
        ts: new Date().toISOString()
      };
      console.warn('V3_DRIFT_DETECTED', JSON.stringify(drift));
      // In a real system, we'd write this to a KV/Queue or metrics service
    }
  }

  // --- V3 CANARY & SHADOW START ---
  let v3Meta = null;
  // v3 overlay/shadow is opt-in only to keep stock endpoint deterministic under load.
  const useV3 = url.searchParams.get('v3') === 'true' && request.headers.get('x-rv-version') !== '2';
  const useV3Shadow = url.searchParams.get('v3_shadow') === '1' && !localDevRequest;

  // 1. FOREGROUND: Hybrid Mode (Default)
  if (useV3 && effectiveTicker) {
    const v3Data = await fetchV3Data(env, request, effectiveTicker);
    if (v3Data) {
      // Overlay Logic
      snapshots['market-prices'] = {
        snapshot: {
          data: [{
            symbol: effectiveTicker,
            date: v3Data.eod.bar.date,
            close: v3Data.eod.bar.close,
            volume: v3Data.eod.bar.volume,
            open: v3Data.eod.bar.open,
            high: v3Data.eod.bar.high,
            low: v3Data.eod.bar.low,
            source_provider: v3Data.eod.provider + ' (v3)',
          }],
          served_from: 'V3_CANARY'
        },
        status: 200,
        path: v3Data.sources.eod
      };

      snapshots['market-stats'] = {
        snapshot: {
          data: [{
            symbol: effectiveTicker,
            as_of: v3Data.indicators.as_of,
            stats: v3Data.indicators.indicators
          }],
          served_from: 'V3_CANARY'
        },
        status: 200,
        path: v3Data.sources.indicators
      };

      v3Meta = {
        enabled: true,
        eod_provider: v3Data.eod.provider,
        generated_at: v3Data.indicators.meta?.generated_at
      };
    } else {
      v3Meta = { enabled: false, error: 'FETCH_FAILED' };
    }
  }

  // 2. BACKGROUND: Shadow Mode (Run for everyone else)
  // Only run if NOT privileged/debug to avoid noise, but for now we run it always for verification.
  else if (useV3Shadow && effectiveTicker && context.waitUntil) {
    const shadowCheck = async () => {
      try {
        const v3Data = await fetchV3Data(env, request, effectiveTicker);
        // We need v2 payload to compare. 
        // Since we can't easily access the final JSON here before it's built, 
        // we can verify against the *snapshots* object which holds the v2 data source.

        const v2Close = findRecord(snapshots['market-prices']?.snapshot, effectiveTicker)?.close;
        const v3Close = v3Data?.eod?.bar?.close;

        if (v2Close && v3Close && Math.abs(v2Close - v3Close) > 0.001) {
          console.warn(`[V3_SHADOW_DRIFT] ${effectiveTicker}: v2=${v2Close} v3=${v3Close}`);
        } else if (v2Close && v3Close) {
          // console.log(`[V3_SHADOW_MATCH] ${effectiveTicker}`);
        }
      } catch (e) {
        console.error('V3_SHADOW_ERROR', e);
      }
    };
    context.waitUntil(shadowCheck());
  }
  // --- V3 CANARY & SHADOW END ---

  const servedFrom = Object.values(snapshots).some((result) => result.snapshot) ? 'ASSET' : 'MISSING';
  const sources = aggregateSources(snapshots);

  const schedulerStart = Date.now();
  const schedulerState = await loadSchedulerState(env, isPrivileged);
  const schedulerMs = Date.now() - schedulerStart;
  timings.t_kv_ms = (timings.t_kv_ms || 0) + schedulerMs;

  const cacheMetaBase = buildCacheMeta({
    mode: cacheHit && cachedStale ? 'swr' : 'kv',
    key_kind: 'stock',
    hit: cacheHit,
    stale: cacheHit ? cachedStale : false,
    age_s: cacheHit ? cachedAgeSeconds : null,
    ttl_s: cacheTtlSeconds,
    swr_marked: swrMarked
  });
  if (isPrivileged) {
    cacheMetaBase.cache_key = cacheKeyUsed || primaryKey || null;
    cacheMetaBase.meta_key = cacheMetaKeyUsed || primaryMetaKey || null;
    if (aliasKey && aliasKey !== (cacheKeyUsed || primaryKey)) {
      cacheMetaBase.alias_key = aliasKey;
    }
    if (aliasMetaKey && aliasMetaKey !== (cacheMetaKeyUsed || primaryMetaKey)) {
      cacheMetaBase.alias_meta_key = aliasMetaKey;
    }
    cacheMetaBase.swr_key = swrKey || null;
  }
  const cacheMeta = isPrivileged ? cacheMetaBase : redact(cacheMetaBase);

  if (!effectiveTicker) {
    const buildStart = Date.now();
    const metaNow = nowUtcIso();
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'error',
        generated_at: metaNow,
        data_date: todayUtcDate(),
        provider: 'stock-api',
        quality_flags: ['INVALID_TICKER'],
        data_source: 'unknown',
        mode: 'DEGRADED',
        v3: v3Meta || undefined,
        asOf: null,
        freshness: 'unknown',
        cache: cacheMeta,
        timings,
        degraded: schedulerState.degraded,
        degraded_reason: schedulerState.reason || null
      },
      metadata: {
        module: MODULE_NAME,
        tier: 'standard',
        domain: 'stocks',
        source: 'stock-api',
        fetched_at: startedAt,
        published_at: startedAt,
        digest: null,
        status: 'ERROR',
        record_count: 0,
        expected_count: 1,
        validation: {
          passed: false,
          dropped_records: 0,
          drop_ratio: 0,
          drop_check_passed: false,
          drop_threshold: null,
          checks: [],
          warnings: ['INVALID_TICKER']
        },
        served_from: servedFrom,
        request: {
          ticker: tickerParam,
          normalized_ticker: null
        },
        source_chain: sourceChain,
        telemetry: {
          provider: {
            primary: sourceChain?.primary || 'eodhd',
            selected: sourceChain?.selected || null,
            forced: Boolean(sourceChain?.forced),
            fallbackUsed: Boolean(sourceChain?.fallbackUsed),
            primaryFailure: sourceChain?.primaryFailure?.code || null
          },
          latencyMs: null,
          ok: false,
          httpStatus: 400
        },
        reasons: ['INVALID_TICKER'],
        sources
      },
      data: {
        ticker: null,
        name: null,
        bars: [],
        latest_bar: null,
        change: { abs: null, pct: null },
        indicators: [],
        universe: null,
        market_prices: null,
        market_stats: null
      },
      error: buildErrorPayload('BAD_REQUEST', 'Invalid ticker parameter', { ticker: tickerParam })
    };
    payload.metadata.digest = await computeDigest(payload);
    timings.t_build_ms = Date.now() - buildStart;
    timings.t_total_ms = Date.now() - requestStart;
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const universeEntry = findRecord(snapshots['universe']?.snapshot, effectiveTicker);
  let universeFallback = null;
  if (!universeEntry) {
    const v7StockSet = await fetchV7StockSet(request);
    if (v7StockSet?.has(effectiveTicker)) {
      universeFallback = {
        symbol: effectiveTicker,
        name: v7ExactMeta?.name || null,
        exchange: v7ExactMeta?.exchange || resolvedExchange || null,
        currency: null,
        country: v7ExactMeta?.country || resolvedCountry || null,
        sector: null,
        industry: null,
        indexes: [],
        updated_at: null,
        source: 'v7_stock_ssot'
      };
    }
  }

  const priceEntry = findRecord(snapshots['market-prices']?.snapshot, effectiveTicker);
  const statsEntry = findRecord(snapshots['market-stats']?.snapshot, effectiveTicker);
  const scoreEntry = findRecord(snapshots['market-score']?.snapshot, effectiveTicker);

  // Attribute DATA_NOT_READY to concrete lookup outcomes.
  for (const moduleName of MODULE_PATHS) {
    if (!sources[moduleName]) continue;
    sources[moduleName].lookup_key = effectiveTicker;
  }
  sources.universe.record_found = Boolean(universeEntry);
  if (universeFallback) {
    sources.universe.note = 'v7_stock_ssot_fallback';
  }
  sources['market-prices'].record_found = Boolean(priceEntry);
  sources['market-stats'].record_found = Boolean(statsEntry);
  sources['market-score'].record_found = Boolean(scoreEntry);

  if (snapshots['market-stats']?.snapshot?.data == null && snapshots['market-stats']?.snapshot?.error) {
    sources['market-stats'].note = 'snapshot_placeholder_or_empty_data';
  }
  if (snapshots['market-prices']?.snapshot && snapshots['market-prices']?.snapshot?.data && !priceEntry) {
    sources['market-prices'].note = 'entry_not_found_for_symbol';
  }

  const universeSeed = universeEntry || universeFallback || (v7ExactMeta ? {
    symbol: effectiveTicker,
    name: v7ExactMeta.name || null,
    exchange: v7ExactMeta.exchange || resolvedExchange || null,
    country: v7ExactMeta.country || resolvedCountry || null,
    indexes: [],
    updated_at: null
  } : null);
  const universePayload = buildUniversePayload(universeSeed, effectiveTicker);
  if (universePayload && !universePayload.country && resolvedCountry) {
    universePayload.country = resolvedCountry;
  }
  if (universePayload && !universePayload.exchange && resolvedExchange) {
    universePayload.exchange = resolvedExchange;
  }
  const marketPricesSnapshotPayload = buildMarketPricesPayload(priceEntry, effectiveTicker);
  const marketStatsSnapshotPayload = buildMarketStatsPayload(statsEntry, effectiveTicker);

  const missingSections = [];
  if (snapshots['market-prices'].snapshot && !marketPricesSnapshotPayload) missingSections.push('market_prices');
  if (snapshots['market-stats'].snapshot && !marketStatsSnapshotPayload) missingSections.push('market_stats');
  if (!snapshots['market-prices'].snapshot) missingSections.push('market_prices');
  if (!snapshots['market-stats'].snapshot) missingSections.push('market_stats');

  let errorPayload = null;
  const universeKnown = Boolean(universeEntry || universeFallback || v7ExactMeta);
  if (eodAttempted && eodBars.length === 0) {
    const lateStaticResult = await fetchStaticEodBar(effectiveTicker, request);
    if (lateStaticResult && lateStaticResult.bar) {
      eodBars = [lateStaticResult.bar];
      eodProvider = lateStaticResult.source;
      eodStatus = computeStatusFromDataDate(lateStaticResult.bar.date, now, maxStaleDays, pendingWindowMinutes);
      eodError = null;
      qualityFlags.add('STATIC_FALLBACK');
    } else if (!eodError) {
      eodError = {
        code: 'EOD_EMPTY',
        message: 'No EOD bars returned',
        details: { ticker: effectiveTicker }
      };
    }
  }

  const unknownTickerByProvider =
    !universeKnown &&
    (
      eodError?.code === 'INVALID_TICKER' ||
      eodError?.code === 'EOD_EMPTY' ||
      (Array.isArray(reasons) && reasons.includes('NO_STATIC_DATA'))
    );
  if (!universeKnown && (!eodAttempted || unknownTickerByProvider)) {
    errorPayload = buildErrorPayload('UNKNOWN_TICKER', `Ticker ${effectiveTicker} is not in the universe`, {
      membership: universePayload?.membership,
      upstream: unknownTickerByProvider ? eodError : null
    });
  }
  if (!errorPayload && !eodAttempted && universeKnown && missingSections.length) {
    errorPayload = buildErrorPayload('DATA_NOT_READY', 'Market prices/stats are not available yet', {
      missing: [...new Set(missingSections)]
    });
  }
  if (missingSections.length) {
    reasons = [...new Set([...(Array.isArray(reasons) ? reasons : []), 'DATA_NOT_READY'])];
  }

  // Prefer EOD provider chain errors over legacy data readiness errors.
  if (eodError && !errorPayload) {
    const isQualityReject = eodError?.code === 'QUALITY_REJECT';
    const isLocked = eodError?.code === 'LOCKED_REFRESH';
    const code = isQualityReject ? 'QUALITY_REJECT' : isLocked ? 'LOCKED_REFRESH' : 'EOD_FETCH_FAILED';
    const message = isQualityReject
      ? 'Quality gate rejected data'
      : isLocked
        ? eodError.message || 'Refresh already in progress'
        : 'Unable to fetch EOD history';
    errorPayload = buildErrorPayload(code, message, {
      upstream: eodError,
      source_chain: sourceChain
    });
  }

  if (eodProvider && (!sourceChain?.selected || sourceChain.selected === 'unknown')) {
    sourceChain = buildSourceChainMetadata({
      ...sourceChain,
      selected: eodProvider,
      fallbackUsed: eodProvider && sourceChain?.primary ? eodProvider !== sourceChain.primary : Boolean(sourceChain?.fallbackUsed)
    });
  }

  const latestBar = pickLatestBar(eodBars);
  const dayChange = computeDayChange(eodBars);
  const indicatorOut = computeIndicators(eodBars);
  reasons = [...new Set([...(Array.isArray(reasons) ? reasons : []), ...(indicatorOut.issues || [])])];

  const indicatorList = Array.isArray(indicatorOut.indicators) ? indicatorOut.indicators : [];
  const indicatorNullCount = indicatorList.reduce((acc, item) => {
    const value = item?.value;
    if (value == null) return acc + 1;
    const num = Number(value);
    if (!Number.isFinite(num)) return acc + 1;
    return acc;
  }, 0);

  const providerHint = eodProvider || sourceChain?.selected || sourceChain?.primary || null;
  const marketPricesPayload = buildMarketPricesFromLatestBar(latestBar, effectiveTicker, providerHint) || marketPricesSnapshotPayload;
  const marketStatsPayload = buildMarketStatsFromIndicators(indicatorOut.indicators, effectiveTicker, latestBar?.date) || marketStatsSnapshotPayload;

  const data = {
    ticker: effectiveTicker,
    name: resolvedName || universePayload?.name || null,
    resolution: {
      ticker: effectiveTicker,
      name: resolvedName || universePayload?.name || null,
      method: resolvedMethod || null,
      canonical_id: resolvedCanonicalId || null,
      exchange: resolvedExchange || universePayload?.exchange || null
    },
    bars: eodBars,
    latest_bar: latestBar,
    change: dayChange,
    indicators: indicatorOut.indicators,
    universe: universePayload,
    market_prices: marketPricesPayload,
    market_stats: marketStatsPayload,
    market_score: scoreEntry,
    breakout_v2: (() => {
      try {
        const stats = processTickerSeries(eodBars || [], {}, { regime_tag: 'UP' });
        return {
          state: stats.state,
          max_level: stats.max_level,
          scores: stats.scores,
          history: stats.history ? stats.history.slice(-30) : []
        };
      } catch (e) {
        return { state: 'ERROR', error: e.message };
      }
    })()
  };

  const asOf =
    marketPricesPayload?.date ||
    marketStatsPayload?.as_of ||
    universePayload.updated_at ||
    null;

  const envelopeProvider = eodProvider || sourceChain?.selected || sourceChain?.primary || 'unknown';
  const envelopeDataDate = parseIsoDay(latestBar?.date) || parseIsoDay(asOf) || todayUtcDate();
  const derivedStatus = envelopeDataDate
    ? computeStatusFromDataDate(envelopeDataDate, now, maxStaleDays, pendingWindowMinutes)
    : errorPayload
      ? 'error'
      : 'fresh';
  let envelopeStatus = eodStatus || derivedStatus;
  if (envelopeStatus === 'error' && !errorPayload && latestBar) {
    // Keep legacy/delisted symbols viewable as stale data instead of hard erroring the whole page.
    envelopeStatus = 'stale';
    qualityFlags.add('DATA_TOO_OLD');
    reasons = [...new Set([...(Array.isArray(reasons) ? reasons : []), 'DATA_TOO_OLD'])];
  }

  const validationPassed = !errorPayload;
  const status = errorPayload
    ? 'ERROR'
    : reasons.includes('INSUFFICIENT_HISTORY')
      ? 'PARTIAL'
      : 'OK';
  const dataSource = servedFrom === 'ASSET'
    ? 'snapshot'
    : (sourceChain?.selected ? 'real_provider' : 'unknown');
  const mode = errorPayload
    ? 'DEGRADED'
    : (servedFrom === 'ASSET' ? 'DEMO' : 'LIVE');
  const metaAsOf = asOf || null;
  const freshness = envelopeStatus === 'fresh'
    ? 'fresh'
    : envelopeStatus === 'stale'
      ? 'stale'
      : 'unknown';
  const buildStart = Date.now();
  const payload = {
    schema_version: '3.0',
    meta: {
      status: envelopeStatus,
      generated_at: nowUtcIso(),
      data_date: envelopeDataDate,
      provider: envelopeProvider,
      quality_flags: Array.from(qualityFlags),
      data_source: dataSource,
      mode,
      v3: v3Meta || undefined,
      asOf: metaAsOf,
      freshness,
      circuit: sourceChain?.circuit || null,
      cache: cacheMeta,
      timings,
      degraded: schedulerState.degraded,
      degraded_reason: schedulerState.reason || null
    },
    metadata: {
      module: MODULE_NAME,
      tier: 'standard',
      domain: 'stocks',
      source: 'stock-api',
      fetched_at: startedAt,
      published_at: startedAt,
      digest: null,
      status,
      record_count: validationPassed ? 1 : 0,
      expected_count: 1,
      validation: {
        passed: validationPassed,
        dropped_records: validationPassed ? 0 : 1,
        drop_ratio: validationPassed ? 0 : 1,
        drop_check_passed: validationPassed,
        drop_threshold: null,
        checks: [],
        warnings: []
      },
      served_from: servedFrom,
      request: {
        ticker: tickerParam,
        normalized_ticker: normalizedTicker,
        effective_ticker: effectiveTicker
      },
      as_of: asOf,
      source_chain: sourceChain,
      telemetry: {
        provider: {
          primary: sourceChain?.primary || 'eodhd',
          selected: envelopeProvider || sourceChain?.selected || null,
          forced: Boolean(sourceChain?.forced),
          fallbackUsed: Boolean(sourceChain?.fallbackUsed),
          primaryFailure: errorPayload ? (sourceChain?.primaryFailure?.code || errorPayload?.code || null) : null
        },
        latencyMs: null,
        ok: !errorPayload,
        httpStatus: errorPayload ? 502 : 200
      },
      indicators: {
        count: indicatorList.length,
        nullCount: indicatorNullCount
      },
      reasons,
      sources
    },
    data,
    error: errorPayload
  };

  let decisionInputs = null;
  {
    // Use the same shared raw-input path as /api/stock-insights-v4 and the offline builder.
    const origin = url.origin;
    const assetFetcher = env?.ASSETS || null;
    async function fetchJsonForAssembly(path) {
      try {
        let res;
        if (assetFetcher && path.startsWith('/data/')) {
          res = await assetFetcher.fetch(new URL(path, origin).toString());
        } else {
          res = await fetch(new URL(path, origin).toString());
        }
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    }
    decisionInputs = await assembleDecisionInputs(effectiveTicker, {
      fetchJson: fetchJsonForAssembly,
      loadCoreInputs: (resolvedTicker) => loadRequestCoreInputs(resolvedTicker, {
        request,
        assetFetcher,
        fetchJson: fetchJsonForAssembly,
      }),
    });
    payload.evaluation_v4 = buildStockInsightsV4Evaluation({
      ticker: effectiveTicker,
      bars: decisionInputs.bars,
      stats: decisionInputs.stats,
      universe: decisionInputs.universe,
      fundamentals: decisionInputs.fundamentals,
      segmentationProfile: decisionInputs.segmentationProfile,
      scientificState: decisionInputs.scientificState,
      forecastState: decisionInputs.forecastState,
      elliottState: decisionInputs.elliottState,
      quantlabState: decisionInputs.quantlabState,
      forecastMeta: decisionInputs.forecastMeta,
      inputFingerprints: decisionInputs.input_fingerprints,
      runtimeControl: decisionInputs.runtimeControl,
      breakoutState: payload.data?.breakout_v2?.state || null,
    });
    payload.meta.evaluation_v4 = {
      requested: true,
      status: payload.evaluation_v4.status || 'unavailable',
      as_of: decisionInputs.as_of || null,
      input_fingerprints: decisionInputs.input_fingerprints || null,
      run_id: decisionInputs.runtimeControl?.run_id || null,
      target_market_date: decisionInputs.runtimeControl?.target_market_date || null,
    };
  }

  // Layer integration: Read from evaluation_v4
  if (payload.evaluation_v4) {
    payload.states = payload.evaluation_v4.states;
    payload.decision = payload.evaluation_v4.decision;
    payload.explanation = payload.evaluation_v4.explanation;
    payload.v6 = payload.evaluation_v4.decision?.v6 || null;
    if (decisionInputs?.runtimeControl?.learning_gate) {
      payload.decision.learning_gate = decisionInputs.runtimeControl.learning_gate;
      payload.decision.minimum_n_not_met = decisionInputs.runtimeControl.learning_gate.minimum_n_not_met === true;
    }
  }

  {
    const decisionBundle = await readDecisionForTicker(resolvedCanonicalId || effectiveTicker, {
      request,
      env,
      targetMarketDate: envelopeDataDate,
    });
    let dailyDecision = decisionBundle.decision || null;
    let analysisReadiness = decisionBundle.analysis_readiness || {
      status: 'FAILED',
      source: 'decision_bundle',
      blocking_reasons: ['bundle_missing'],
      warnings: [],
    };
    if (decisionBundleBlocksPublicReadiness(decisionBundle)) {
      const pageCoreResult = await readPageCoreForTicker(effectiveTicker || resolvedCanonicalId || normalizedTicker, { request, env });
      const publicDecision = buildPublicDecisionFromPageCore(pageCoreResult, decisionBundle);
      if (publicDecision) {
        dailyDecision = publicDecision.decision;
        analysisReadiness = publicDecision.analysisReadiness;
      }
    }
    payload.data.daily_decision = dailyDecision;
    payload.data.analysis_readiness = analysisReadiness;
    payload.daily_decision = payload.data.daily_decision;
    payload.analysis_readiness = payload.data.analysis_readiness;
  }

  // Fundamentals — 2-Layer: Live API (EODHD→FMP) → Static JSON
  {
    let _fundData = null;
    let _fundScope = null;
    try {
      const _scopeUrl = new URL('/data/fundamentals/_scope.json', request.url);
      const _scopeRes = await fetch(_scopeUrl.toString());
      if (_scopeRes.ok) _fundScope = await _scopeRes.json();
    } catch {}
    const _scopeMember = resolveFundamentalsScopeMember(_fundScope, effectiveTicker);

    if (_fundScope && !_scopeMember) {
      _fundData = annotateFundamentalsForScope({
        ticker: effectiveTicker,
        universe: payload.universe || null,
        fundamentals: null,
        scopeDoc: _fundScope,
        targetMarketDate: _fundScope?.target_market_date || payload.metadata?.data_date || null,
      });
    } else {
      // Layer 1: Live API (EODHD primary → FMP fallback)
      try {
        const r = await fetchEodhdFundamentals(effectiveTicker, env, {
          exchange: resolvedExchange,
          providerSymbol: v7ExactMeta?.provider_symbol,
          canonicalId: resolvedCanonicalId,
        });
        if (r.ok && r.data) _fundData = r.data;
      } catch {}
      try {
        if (!_fundData) {
          const r = await fetchFmpFundamentals(effectiveTicker, env);
          if (r.ok && r.data) _fundData = r.data;
        }
      } catch {}
      if (!_fundData) {
        try {
          const _sUrl = new URL('/data/fundamentals/' + encodeURIComponent(effectiveTicker.toUpperCase()) + '.json', request.url);
          const _sRes = await fetch(_sUrl.toString());
          if (_sRes.ok) _fundData = await _sRes.json();
        } catch {}
      }
    }
    let _earningsFeed = null;
    try {
      const _eUrl = new URL('/data/earnings-calendar/latest.json', request.url);
      const _eRes = await fetch(_eUrl.toString());
      if (_eRes.ok) _earningsFeed = await _eRes.json();
    } catch {}
    const mergedCatalysts = mergeCatalystFields({
      ticker: effectiveTicker,
      fundamentals: _fundData,
      earningsFeed: _earningsFeed,
      universe: payload.universe || null,
      name: payload.data?.name || _fundData?.companyName || null,
    });
    payload.data.fundamentals = annotateFundamentalsForScope({
      ticker: effectiveTicker,
      universe: payload.universe || null,
      fundamentals: mergedCatalysts.fundamentals || null,
      scopeDoc: _fundScope,
      targetMarketDate: _fundScope?.target_market_date || payload.metadata?.data_date || null,
    });
    payload.data.catalysts = mergedCatalysts.catalysts || null;
  }

  payload.metadata.digest = await computeDigest(payload);
  timings.t_build_ms = Date.now() - buildStart;
  timings.t_total_ms = Date.now() - requestStart;

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
