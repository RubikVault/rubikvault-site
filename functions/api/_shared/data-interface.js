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

  return {
    ok: true,
    ticker: resolvedTicker,
    name, exchange, country, canonicalId,
    resolution: { ticker: resolvedTicker, canonical_id: canonicalId, exchange },
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

  // Fetch bars via provider chain
  let bars = [];
  let provider = 'eodhd';
  let sourceChain = buildSourceChainMetadata(null);

  try {
    const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
      outputsize: '300',
      allowFailover: true,
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
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No bar data available', retryable: true },
    };
  }

  const latestBar = pickLatestBar(bars);
  const change = computeDayChange(bars);
  const indicators = computeIndicators(bars);
  const marketPrices = buildMarketPricesFromBar(latestBar, effectiveTicker, provider);
  const marketStats = buildMarketStatsFromIndicators(indicators, effectiveTicker, latestBar?.date);
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
      if (uRec) universe = uRec;
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

  return {
    ok: true,
    data: {
      ticker: effectiveTicker,
      name: ctx.name || universe?.name || null,
      resolution: ctx.resolution,
      latest_bar: latestBar,
      change,
      market_prices: snapshotMarketPrices || marketPrices,
      market_stats: snapshotMarketStats || marketStats,
      states,
      decision,
      explanation,
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

  let bars = [];
  let provider = 'eodhd';
  try {
    const chainResult = await fetchBarsWithProviderChain(effectiveTicker, env, {
      outputsize: '300',
      allowFailover: true,
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
    return {
      ok: false, data: null,
      meta: { status: 'error', provider, data_date: todayUtcDate(), version: 'v2' },
      error: { code: 'NO_DATA', message: 'No historical data available', retryable: true },
    };
  }

  const latestBar = pickLatestBar(bars);
  const dataDate = latestBar?.date || todayUtcDate();
  const status = computeStatusFromDataDate(dataDate, now, ttl.max_stale_days, ttl.pending_window_minutes);
  const indicators = computeIndicators(bars);

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
