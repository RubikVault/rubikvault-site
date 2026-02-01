import { sha256Hex } from './_shared/digest.mjs';
import { getTiingoKeyInfo } from './_shared/tiingo-key.mjs';
import { fetchFmpFundamentals } from './_shared/fundamentals-fmp.mjs';
import { kvGetJson } from '../_lib/kv-safe.js';

const MODULE_NAME = 'fundamentals';
const TTL_SECONDS = 24 * 60 * 60;

async function computeDigest(input) {
  const canonical = JSON.stringify(input);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

function buildErrorPayload(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

function normalizeTicker(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 15) return null;
  if (!/^[A-Z0-9.\-]+$/i.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function normalizeFundamentalsFromTiingoRow(ticker, row) {
  const r = row && typeof row === 'object' ? row : {};

  const companyName = pick(r, ['companyName', 'name', 'tickerName', 'company_name', 'CompanyName']);

  const marketCap = toNumber(pick(r, ['marketCap', 'marketCapUSD', 'marketCapTtm', 'market_cap']));
  const pe_ttm = toNumber(pick(r, ['peTTM', 'peTtm', 'pe_ttm', 'peRatioTTM', 'peRatio']));
  const ps_ttm = toNumber(pick(r, ['psTTM', 'psTtm', 'ps_ttm', 'priceToSalesTTM']));
  const pb = toNumber(pick(r, ['pb', 'pbRatio', 'priceToBook']));
  const ev_ebitda = toNumber(pick(r, ['evToEbitda', 'evEbitda', 'ev_ebitda']));

  const revenue_ttm = toNumber(pick(r, ['revenueTTM', 'revenueTtm', 'revenue_ttm']));
  const eps_ttm = toNumber(pick(r, ['epsTTM', 'epsTtm', 'eps_ttm']));

  const grossMargin = toNumber(pick(r, ['grossMargin', 'grossMarginTTM', 'grossMarginTtm']));
  const operatingMargin = toNumber(pick(r, ['operatingMargin', 'operatingMarginTTM', 'operatingMarginTtm']));
  const netMargin = toNumber(pick(r, ['netMargin', 'netMarginTTM', 'netMarginTtm']));

  const nextEarningsDate = pick(r, ['nextEarningsDate', 'nextEarnings', 'earningsDate', 'next_earnings_date']);
  const sourceTimestamp = pick(r, ['date', 'asOfDate', 'asOf', 'sourceTimestamp', 'updatedAt']);

  return {
    ticker,
    companyName: companyName ? String(companyName) : null,
    marketCap,
    pe_ttm,
    ps_ttm,
    pb,
    ev_ebitda,
    revenue_ttm,
    grossMargin,
    operatingMargin,
    netMargin,
    eps_ttm,
    nextEarningsDate: nextEarningsDate ? String(nextEarningsDate) : null,
    updatedAt: sourceTimestamp ? String(sourceTimestamp) : null
  };
}

function buildWatermark({ servedFrom, status, data }) {
  const dataSource = servedFrom ? 'real_provider' : 'unknown';
  const mode = status === 'ERROR' ? 'DEGRADED' : 'LIVE';
  const asOf = data?.updatedAt ? String(data.updatedAt) : null;
  return {
    data_source: dataSource,
    mode,
    asOf,
    freshness: 'unknown'
  };
}

function dataDateFrom(asOf, fallbackIso) {
  if (typeof asOf === 'string' && asOf.length >= 10) return asOf.slice(0, 10);
  return fallbackIso.slice(0, 10);
}

async function fetchTiingoFundamentalsDaily(ticker, env) {
  const keyInfo = getTiingoKeyInfo(env);
  if (!keyInfo.key) {
    return {
      ok: false,
      provider: 'tiingo',
      key: { present: false, source: null },
      error: { code: 'MISSING_API_KEY', message: 'Missing TIINGO_API_KEY' },
      data: null,
      httpStatus: null,
      latencyMs: null
    };
  }

  const controller = new AbortController();
  const timeoutMs = 6000;
  const started = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);
    const apiUrl = new URL(`https://api.tiingo.com/tiingo/fundamentals/${encodeURIComponent(ticker)}/daily`);
    apiUrl.searchParams.set('token', keyInfo.key);
    apiUrl.searchParams.set('startDate', startDate);
    apiUrl.searchParams.set('endDate', endDate);
    apiUrl.searchParams.set('format', 'json');

    const res = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        provider: 'tiingo',
        key: { present: true, source: keyInfo.source },
        error: { code: res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR', message: `HTTP ${res.status}` },
        data: null,
        httpStatus: res.status,
        latencyMs
      };
    }

    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : [];
    const last = rows.length ? rows[rows.length - 1] : null;
    if (!last) {
      return {
        ok: false,
        provider: 'tiingo',
        key: { present: true, source: keyInfo.source },
        error: { code: 'NO_DATA', message: 'No fundamentals rows returned' },
        data: null,
        httpStatus: res.status,
        latencyMs
      };
    }

    return {
      ok: true,
      provider: 'tiingo',
      key: { present: true, source: keyInfo.source },
      error: null,
      data: normalizeFundamentalsFromTiingoRow(ticker, last),
      httpStatus: res.status,
      latencyMs
    };
  } catch (error) {
    const msg = String(error?.message || error || 'network_error');
    const latencyMs = Date.now() - started;
    const lower = msg.toLowerCase();
    const code = lower.includes('abort') || lower.includes('timeout') ? 'TIMEOUT' : 'NETWORK_ERROR';
    return {
      ok: false,
      provider: 'tiingo',
      key: { present: true, source: getTiingoKeyInfo(env).source },
      error: { code, message: msg },
      data: null,
      httpStatus: null,
      latencyMs
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isDebug = url.searchParams.get('debug') === '1';
  const tickerParam = url.searchParams.get('ticker') || '';
  const ticker = normalizeTicker(tickerParam);
  const startedAtIso = new Date().toISOString();

  const key = `fund:${ticker || 'invalid'}`;
  const lastGoodKey = `${key}:last_good`;

  if (!ticker) {
    const wm = buildWatermark({ servedFrom: 'RUNTIME', status: 'ERROR', data: null });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'error',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: wm.data_source,
        mode: wm.mode,
        asOf: wm.asOf,
        freshness: wm.freshness
      },
      metadata: {
        module: MODULE_NAME,
        schema_version: '3.0',
        tier: 'standard',
        domain: 'equities',
        source: 'fundamentals-api',
        fetched_at: startedAtIso,
        published_at: startedAtIso,
        digest: null,
        served_from: 'RUNTIME',
        request: { ticker: tickerParam, normalized_ticker: null },
        status: 'ERROR'
      },
      data: null,
      error: buildErrorPayload('BAD_REQUEST', 'Invalid ticker parameter', { ticker: tickerParam })
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cached = await kvGetJson(env, key);
  if (cached.hit && cached.value) {
    const servedFrom = cached.layer === 'kv' ? 'KV' : 'MEM';
    const wm = buildWatermark({ servedFrom, status: 'OK', data: cached.value });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'fresh',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: wm.data_source,
        mode: wm.mode,
        asOf: wm.asOf,
        freshness: wm.freshness
      },
      metadata: {
        module: MODULE_NAME,
        schema_version: '3.0',
        tier: 'standard',
        domain: 'equities',
        source: 'fundamentals-api',
        fetched_at: startedAtIso,
        published_at: startedAtIso,
        digest: null,
        served_from: servedFrom,
        request: { ticker: tickerParam, normalized_ticker: ticker },
        status: 'OK',
        cache: { hit: true, layer: cached.layer, ttlSeconds: TTL_SECONDS },
        telemetry: {
          provider: {
            primary: 'tiingo',
            selected: 'tiingo',
            forced: false,
            fallbackUsed: false,
            primaryFailure: null
          },
          latencyMs: null,
          ok: true,
          httpStatus: 200
        }
      },
      data: cached.value,
      error: null
    };
    if (isDebug && cached.error) {
      payload.metadata.cache.error = cached.error;
    }
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const primary = await fetchTiingoFundamentalsDaily(ticker, env);
  let upstream = primary;
  const primaryFailure = primary.ok ? null : (primary.error?.code || 'UNKNOWN');
  let fallbackUsed = false;

  const shouldFallbackToFmp = (result) => {
    if (!result || result.ok) return false;
    const code = String(result.error?.code || '').toUpperCase();
    const status = Number(result.httpStatus || 0);
    return (
      code === 'MISSING_API_KEY' ||
      code === 'NO_DATA' ||
      code === 'TIMEOUT' ||
      code === 'NETWORK_ERROR' ||
      code === 'AUTH_FAILED' ||
      code === 'HTTP_ERROR' ||
      status === 429 ||
      (status >= 500 && status < 600)
    );
  };

  if (shouldFallbackToFmp(primary)) {
    const fmpResult = await fetchFmpFundamentals(ticker, env);
    if (fmpResult.ok && fmpResult.data) {
      upstream = fmpResult;
      fallbackUsed = true;
    }
  }

  if (upstream.ok && upstream.data) {
    const wm = buildWatermark({ servedFrom: 'RUNTIME', status: 'OK', data: upstream.data });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'fresh',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: wm.data_source,
        mode: wm.mode,
        asOf: wm.asOf,
        freshness: wm.freshness
      },
      metadata: {
        module: MODULE_NAME,
        schema_version: '3.0',
        tier: 'standard',
        domain: 'equities',
        source: 'fundamentals-api',
        fetched_at: startedAtIso,
        published_at: startedAtIso,
        digest: null,
        served_from: 'RUNTIME',
        request: { ticker: tickerParam, normalized_ticker: ticker },
        status: 'OK',
        provider: {
          selected: upstream.provider,
          fallbackUsed,
          failureReason: fallbackUsed ? primaryFailure : null,
          keyPresent: upstream.key.present,
          keySource: upstream.key.source,
          httpStatus: upstream.httpStatus,
          latencyMs: upstream.latencyMs
        },
        telemetry: {
          provider: {
            primary: 'tiingo',
            selected: upstream.provider,
            forced: false,
            fallbackUsed,
            primaryFailure: fallbackUsed ? primaryFailure : null
          },
          latencyMs: upstream.latencyMs,
          ok: true,
          httpStatus: upstream.httpStatus
        }
      },
      data: upstream.data,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const lastGood = await kvGetJson(env, lastGoodKey);
  if (lastGood.hit && lastGood.value) {
    const servedFrom = lastGood.layer === 'kv' ? 'KV' : 'MEM';
    const wm = buildWatermark({ servedFrom, status: 'PARTIAL', data: lastGood.value });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'stale',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: wm.data_source,
        mode: 'DEGRADED',
        asOf: wm.asOf,
        freshness: wm.freshness
      },
      metadata: {
        module: MODULE_NAME,
        schema_version: '3.0',
        tier: 'standard',
        domain: 'equities',
        source: 'fundamentals-api',
        fetched_at: startedAtIso,
        published_at: startedAtIso,
        digest: null,
        served_from,
        request: { ticker: tickerParam, normalized_ticker: ticker },
        status: 'PARTIAL',
        provider: {
          selected: upstream.provider,
          fallbackUsed: true,
          failureReason: upstream.error?.code || primaryFailure || null,
          keyPresent: upstream.key?.present || false,
          keySource: upstream.key?.source || null,
          httpStatus: upstream.httpStatus,
          latencyMs: upstream.latencyMs
        },
        telemetry: {
          provider: {
            primary: 'tiingo',
            selected: upstream.provider,
            forced: false,
            fallbackUsed: true,
            primaryFailure: upstream.error?.code || primaryFailure || null
          },
          latencyMs: upstream.latencyMs,
          ok: false,
          httpStatus: upstream.httpStatus
        }
      },
      data: lastGood.value,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload = {
    schema_version: '3.0',
    meta: {
      status: 'error',
      generated_at: startedAtIso,
      data_date: dataDateFrom(null, startedAtIso),
      provider: 'fundamentals-api',
      data_source: 'unknown',
      mode: 'DEGRADED',
      asOf: null,
      freshness: 'unknown'
    },
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      tier: 'standard',
      domain: 'equities',
      source: 'fundamentals-api',
      fetched_at: startedAtIso,
      published_at: startedAtIso,
      digest: null,
      served_from: 'RUNTIME',
      request: { ticker: tickerParam, normalized_ticker: ticker },
      status: 'ERROR',
      provider: {
        selected: upstream.provider,
        fallbackUsed: false,
        failureReason: upstream.error?.code || null,
        keyPresent: upstream.key?.present || false,
        keySource: upstream.key?.source || null,
        httpStatus: upstream.httpStatus,
        latencyMs: upstream.latencyMs
      },
      telemetry: {
        provider: {
          primary: 'tiingo',
          selected: upstream.provider,
          forced: false,
          fallbackUsed: false,
          primaryFailure: upstream.error?.code || null
        },
        latencyMs: upstream.latencyMs,
        ok: false,
        httpStatus: upstream.httpStatus
      }
    },
    data: {
      ticker,
      companyName: null,
      marketCap: null,
      pe_ttm: null,
      ps_ttm: null,
      pb: null,
      ev_ebitda: null,
      revenue_ttm: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      eps_ttm: null,
      nextEarningsDate: null,
      updatedAt: null
    },
    error: buildErrorPayload(upstream.error?.code || 'FUNDAMENTALS_UNAVAILABLE', upstream.error?.message || 'Fundamentals unavailable', {
      httpStatus: upstream.httpStatus
    })
  };

  if (!isDebug) {
    payload.metadata.provider.failureReason = null;
  }

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
