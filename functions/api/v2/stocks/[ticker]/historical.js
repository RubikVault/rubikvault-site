import { isV2Enabled, v2GateResponse } from '../../../_shared/v2-gate.js';
import { getStaticBars } from '../../../_shared/history-store.mjs';
import { normalizeTicker } from '../../../_shared/stock-helpers.js';
import { logV2Request, logV2Gate } from '../../../_shared/v2-observability.js';
import { errorEnvelope } from '../../../_shared/envelope.js';
import { latestUsMarketSessionIso, parseIsoDay } from '../../../_shared/market-calendar.js';

function pickLatestBar(bars) {
  return Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null;
}

function historicalLimitForRequest(request) {
  try {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 1500;
  } catch { /* keep default */ }
  return 750;
}

function runtimeHistoricalKey({ ticker, request }) {
  try {
    const params = new URL(request.url).searchParams;
    const assetId = String(params.get('asset_id') || '').trim().toUpperCase();
    const match = assetId.match(/^([A-Z0-9_.-]+):([A-Z0-9_.-]+)$/);
    if (match) return `${match[1]}__${match[2]}`.replace(/[^A-Z0-9_.-]/g, '');
  } catch { /* fall back */ }
  return `US__${String(ticker || '').trim().toUpperCase()}`.replace(/[^A-Z0-9_.-]/g, '');
}

function targetMarketDateForRuntimeCache(env, request = null) {
  try {
    const params = new URL(request?.url || '').searchParams;
    const requested = parseIsoDay(
      params.get('target_market_date')
      || params.get('target_date')
      || params.get('as_of')
      || params.get('data_date')
    );
    if (requested) return requested;
  } catch { /* fall through */ }
  const forced = parseIsoDay(env?.TARGET_MARKET_DATE || env?.RV_TARGET_MARKET_DATE || env?.TARGET_DATE);
  return forced || latestUsMarketSessionIso(new Date());
}

function runtimeHistoricalDataDate(payload) {
  const metaDate = parseIsoDay(payload?.meta?.data_date || payload?.meta?.as_of || payload?.target_market_date);
  if (metaDate) return metaDate;
  const bars = Array.isArray(payload?.data?.bars) ? payload.data.bars : [];
  return parseIsoDay(bars.length ? bars[bars.length - 1]?.date : null);
}

async function fastRuntimeHistoricalCacheResponse({ ticker, request, env }) {
  const key = runtimeHistoricalKey({ ticker, request });
  if (!key) return null;
  try {
    const origin = new URL(request.url).origin;
    const url = new URL(`/data/v3/runtime/historical/${encodeURIComponent(key)}.json`, origin);
    const assetFetcher = env?.ASSETS || null;
    const response = assetFetcher
      ? await assetFetcher.fetch(url.toString())
      : await fetch(url.toString());
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    const dataDate = runtimeHistoricalDataDate(payload);
    const targetDate = targetMarketDateForRuntimeCache(env, request);
    if (!payload || (targetDate && (!dataDate || dataDate < targetDate))) return null;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-RV-API-Version': '2',
        'X-RV-Historical-Provider': 'runtime_historical_cache',
      },
    });
  } catch {
    return null;
  }
}

function fastStaticHistoricalResponse({ ticker, request, env }) {
  const targetDate = targetMarketDateForRuntimeCache(env, request);
  return getStaticBars(ticker, new URL(request.url).origin, env?.ASSETS || null, { targetMarketDate: targetDate })
    .then((bars) => {
      if (!Array.isArray(bars) || bars.length < 60) return null;
      const limit = historicalLimitForRequest(request);
      const limitedBars = bars.length > limit ? bars.slice(-limit) : bars;
      const latest = pickLatestBar(limitedBars);
      const dataDate = latest?.date || new Date().toISOString().slice(0, 10);
      const status = targetDate && dataDate < targetDate ? 'stale' : 'fresh';
      return {
        ok: true,
        data: {
          ticker,
          bars: limitedBars,
          indicators: [],
          indicator_issues: [],
          breakout_v12: {
            status: 'not_generated',
            source: 'historical_fast_static_store',
            reason: 'Historical endpoint fast path returns chart bars only.',
          },
          breakout_v2: null,
          breakout_v2_legacy: null,
        },
        meta: {
          status,
          generated_at: new Date().toISOString(),
          data_date: dataDate,
          provider: 'static_store',
          quality_flags: ['STATIC_FAST_HISTORY', `BAR_LIMIT_${limit}`],
          version: 'v2',
        },
        error: null,
      };
    })
    .catch(() => null);
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const endpointId = 'v2_historical';
  const start = Date.now();

  const enabled = await isV2Enabled(env, endpointId);
  logV2Gate({ endpoint: endpointId, enabled });
  if (!enabled) return v2GateResponse(endpointId);

  const rawTicker = params?.ticker || '';
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const envelope = errorEnvelope(
      'INVALID_TICKER',
      'Invalid or missing ticker parameter',
      { provider: 'v2-historical', data_date: todayUtc, status: 'error', version: 'v2' }
    );
    return new Response(JSON.stringify(envelope), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const cachedResponse = await fastRuntimeHistoricalCacheResponse({ ticker, request, env });
  if (cachedResponse) {
    logV2Request({
      endpoint: endpointId,
      ticker,
      durationMs: Date.now() - start,
      status: 'fresh',
      stale: false,
      fallbackUsed: false,
      source: 'runtime_historical_cache',
    });
    return cachedResponse;
  }

  let result = null;
  try {
    result = await fastStaticHistoricalResponse({ ticker, request, env });
    if (!result) {
      const { fetchStockHistorical } = await import('../../../_shared/data-interface.js');
      result = await fetchStockHistorical(ticker, env, request);
    }
  } catch (err) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    result = {
      ok: false,
      data: {
        ticker,
        bars: [],
        indicators: [],
        indicator_issues: ['historical_runtime_exception'],
        breakout_v12: null,
        breakout_v2: null,
        breakout_v2_legacy: null,
        availability: {
          status: 'degraded',
          reason: 'Historical data could not be prepared in the current runtime.',
          ui_renderable: false,
        },
      },
      meta: {
        status: 'degraded',
        generated_at: new Date().toISOString(),
        data_date: todayUtc,
        provider: 'typed-degraded-runtime-fallback',
        quality_flags: ['HISTORICAL_RUNTIME_EXCEPTION'],
        version: 'v2',
      },
      error: {
        code: 'HISTORICAL_RUNTIME_EXCEPTION',
        message: err?.message || 'Historical runtime exception',
        retryable: true,
      },
    };
  }
  const durationMs = Date.now() - start;

  logV2Request({
    endpoint: endpointId,
    ticker,
    durationMs,
    status: result.meta?.status,
    stale: result.meta?.status === 'stale',
    fallbackUsed: false,
    source: result.meta?.provider,
  });

  const status = result.ok || result?.meta?.provider === 'typed-degraded-runtime-fallback' ? 200 : 502;
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
