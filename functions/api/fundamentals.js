import { sha256Hex } from './_shared/digest.mjs';
import { getTiingoKeyInfo } from './_shared/tiingo-key.mjs';
import { fetchFmpFundamentals } from './_shared/fundamentals-fmp.mjs';
import { kvGetJson } from '../_lib/kv-safe.js';
import { fetchEodhdFundamentals } from './_shared/fundamentals-eodhd.mjs';
import { mergeCatalystFields } from './_shared/catalyst-normalization.mjs';
import {
  annotateFundamentalsForScope,
  resolveFundamentalsScopeMember,
} from './_shared/fundamentals-scope.mjs';

const MODULE_NAME = 'fundamentals';
const TTL_SECONDS = 24 * 60 * 60;
let universeNameCache = null;
let universeNameCachedAt = 0;
const UNIVERSE_NAME_TTL_MS = 5 * 60 * 1000;
const REMOTE_FUNDAMENTALS_FALLBACK = 'https://rubikvault.com';

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

function countMeaningfulFundamentals(doc) {
  if (!doc || typeof doc !== 'object') return 0;
  const keys = ['marketCap', 'pe_ttm', 'eps_ttm', 'pb', 'companyName', 'sector', 'industry', 'nextEarningsDate'];
  return keys.filter((key) => doc[key] != null && doc[key] !== '').length;
}

function inferFundamentalsAssetClass(doc = {}) {
  const haystack = [
    doc.companyName,
    doc.assetClass,
    doc.securityType,
    doc.sector,
    doc.industry,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\betf\b|\bexchange traded fund\b|\btrust\b|\bfund\b|\bucits\b/.test(haystack)) return 'ETF';
  if (/\bindex\b|\bcomposite\b/.test(haystack)) return 'Index';
  return 'Stock';
}

function normalizeOptionalFundamentalsContract(ticker, doc) {
  const base = doc && typeof doc === 'object' ? { ...doc } : null;
  if (!base) return null;
  const assetClass = inferFundamentalsAssetClass(base);
  if (!['ETF', 'Index'].includes(assetClass)) return base;
  return {
    ticker,
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
    updatedAt: base.updatedAt || null,
    ...base,
    assetClass,
    securityType: base.securityType || assetClass,
    typed_status: 'NOT_APPLICABLE',
    typed_reason: assetClass === 'ETF'
      ? 'ETF fundamentals feed is optional for this contract.'
      : 'Index fundamentals are not applicable for this contract.',
  };
}

async function fetchLocalArtifactFundamentals(request, ticker) {
  try {
    const base = new URL(request.url);
    const candidates = [
      new URL(`/data/fundamentals/${encodeURIComponent(ticker)}.json`, base),
      new URL(`/public/data/fundamentals/${encodeURIComponent(ticker)}.json`, base),
    ];
    for (const url of candidates) {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const payload = await res.json();
      if (countMeaningfulFundamentals(payload) >= 2 || payload?.companyName) {
        return normalizeOptionalFundamentalsContract(ticker, payload);
      }
    }
  } catch {
    // ignore local artifact fallback
  }
  return null;
}

async function fetchFundamentalsScopeDoc(request) {
  try {
    const base = new URL(request.url);
    const candidates = [
      new URL('/data/fundamentals/_scope.json', base),
      new URL('/public/data/fundamentals/_scope.json', base),
    ];
    for (const url of candidates) {
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      return await res.json();
    }
  } catch {
    // ignore local scope fallback
  }
  return null;
}

function shouldUseRemoteFundamentalsFallback(request, env) {
  const processEnv = typeof process !== 'undefined' && process?.env ? process.env : {};
  const configured = String(env?.RV_REMOTE_FUNDAMENTALS_BASE || processEnv.RV_REMOTE_FUNDAMENTALS_BASE || REMOTE_FUNDAMENTALS_FALLBACK).trim();
  if (!configured) return false;
  try {
    const current = new URL(request.url);
    const remote = new URL(configured);
    const localHosts = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);
    if (current.host === remote.host) return false;
    return localHosts.has(current.hostname);
  } catch {
    return false;
  }
}

async function fetchRemoteFundamentals(request, env, ticker) {
  if (!shouldUseRemoteFundamentalsFallback(request, env)) return null;
  const processEnv = typeof process !== 'undefined' && process?.env ? process.env : {};
  const base = String(env?.RV_REMOTE_FUNDAMENTALS_BASE || processEnv.RV_REMOTE_FUNDAMENTALS_BASE || REMOTE_FUNDAMENTALS_FALLBACK).trim();
  if (!base) return null;
  const started = Date.now();
  try {
    const url = new URL('/api/fundamentals', base);
    url.searchParams.set('ticker', ticker);
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RubikVault-LocalFundamentals/1.0'
      }
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        provider: 'main_runtime_fallback',
        key: { present: false, source: null },
        error: { code: 'HTTP_ERROR', message: `HTTP ${res.status}` },
        data: null,
        httpStatus: res.status,
        latencyMs
      };
    }
    const payload = await res.json();
    const data = payload?.data || null;
    if (payload?.ok && countMeaningfulFundamentals(data) >= 2) {
      return {
        ok: true,
        provider: 'main_runtime_fallback',
        key: { present: false, source: null },
        error: null,
        data,
        httpStatus: res.status,
        latencyMs,
        upstream_meta: payload?.meta || null,
        upstream_metadata: payload?.metadata || null
      };
    }
    return {
      ok: false,
      provider: 'main_runtime_fallback',
      key: { present: false, source: null },
      error: { code: 'NO_DATA', message: 'Remote fundamentals fallback returned insufficient data' },
      data,
      httpStatus: res.status,
      latencyMs
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'main_runtime_fallback',
      key: { present: false, source: null },
      error: { code: 'NETWORK_ERROR', message: String(error?.message || error || 'network_error') },
      data: null,
      httpStatus: null,
      latencyMs: Date.now() - started
    };
  }
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

async function fetchUniverseName(request, ticker) {
  const now = Date.now();
  if (!universeNameCache || (now - universeNameCachedAt) > UNIVERSE_NAME_TTL_MS) {
    const baseUrl = new URL(request.url);
    const [v3Universe, allUniverse] = await Promise.all([
      fetchJsonMaybeGzip(new URL('/data/v3/universe/universe.json', baseUrl)),
      fetchJsonMaybeGzip(new URL('/data/universe/all.json', baseUrl)),
    ]);
    const map = new Map();
    const v3Symbols = Array.isArray(v3Universe?.symbols) ? v3Universe.symbols : [];
    for (const row of v3Symbols) {
      const symbol = normalizeTicker(row?.ticker);
      const name = typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : null;
      if (symbol && name && !map.has(symbol)) map.set(symbol, name);
    }
    const allSymbols = Array.isArray(allUniverse) ? allUniverse : [];
    for (const row of allSymbols) {
      const symbol = normalizeTicker(row?.ticker);
      const name = typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : null;
      if (symbol && name && !map.has(symbol)) map.set(symbol, name);
    }
    universeNameCache = map;
    universeNameCachedAt = now;
  }
  return universeNameCache?.get(normalizeTicker(ticker)) || null;
}

async function withCatalysts(request, ticker, data) {
  const baseData = data && typeof data === 'object' ? data : null;
  if (!ticker || !baseData) return baseData;
  let earningsFeed = null;
  try {
    const feedUrl = new URL('/data/earnings-calendar/latest.json', request.url);
    const response = await fetch(feedUrl.toString());
    if (response.ok) earningsFeed = await response.json();
  } catch {}
  return mergeCatalystFields({
    ticker,
    fundamentals: baseData,
    earningsFeed,
    name: baseData?.companyName || null,
  }).fundamentals;
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
  const scopeDoc = await fetchFundamentalsScopeDoc(request);

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

  const scopeMember = resolveFundamentalsScopeMember(scopeDoc, ticker);
  if (scopeDoc && !scopeMember) {
    const neutralData = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: null,
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'fresh',
        generated_at: startedAtIso,
        data_date: dataDateFrom(scopeDoc?.target_market_date, startedAtIso),
        provider: 'fundamentals-api',
        data_source: 'scope_contract',
        mode: 'LIVE',
        asOf: scopeDoc?.target_market_date || null,
        freshness: 'scope_neutral'
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
          selected: 'scope_contract',
          fallbackUsed: false,
          failureReason: null,
          keyPresent: false,
          keySource: null,
          httpStatus: 200,
          latencyMs: null
        },
        telemetry: {
          provider: {
            primary: 'scope_contract',
            selected: 'scope_contract',
            forced: false,
            fallbackUsed: false,
            primaryFailure: null
          },
          latencyMs: null,
          ok: true,
          httpStatus: 200
        }
      },
      data: neutralData,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cached = await kvGetJson(env, key);
  if (cached.hit && cached.value) {
    const servedFrom = cached.layer === 'kv' ? 'KV' : 'MEM';
    const enrichedCached = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: await withCatalysts(request, ticker, cached.value),
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const wm = buildWatermark({ servedFrom, status: 'OK', data: enrichedCached });
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
      data: enrichedCached,
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

  const localArtifact = await fetchLocalArtifactFundamentals(request, ticker);
  if (localArtifact) {
    const enrichedLocalArtifact = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: await withCatalysts(request, ticker, localArtifact),
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const wm = buildWatermark({ servedFrom: 'RUNTIME', status: 'OK', data: enrichedLocalArtifact });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'fresh',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: 'local_artifact',
        mode: 'LIVE',
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
          selected: 'local_artifact',
          fallbackUsed: false,
          failureReason: null,
          keyPresent: false,
          keySource: null,
          httpStatus: 200,
          latencyMs: null
        },
        telemetry: {
          provider: {
            primary: 'local_artifact',
            selected: 'local_artifact',
            forced: false,
            fallbackUsed: false,
            primaryFailure: null
          },
          latencyMs: null,
          ok: true,
          httpStatus: 200
        }
      },
      data: enrichedLocalArtifact,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const primary = await fetchTiingoFundamentalsDaily(ticker, env);
  let upstream = primary;
  const primaryFailure = primary.ok ? null : (primary.error?.code || 'UNKNOWN');
  let fallbackUsed = false;
  let lastFailure = primary;

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
    // Try EODHD before FMP
    const eodhdResult = await fetchEodhdFundamentals(ticker, env);
    if (eodhdResult.ok && eodhdResult.data) {
      upstream = eodhdResult;
      fallbackUsed = true;
    } else {
      lastFailure = eodhdResult;
      const fmpResult = await fetchFmpFundamentals(ticker, env);
      if (fmpResult.ok && fmpResult.data) {
        upstream = fmpResult;
        fallbackUsed = true;
      } else {
        lastFailure = fmpResult;
        if (!upstream.ok && eodhdResult?.error && String(eodhdResult.error.code || '').toUpperCase() !== 'MISSING_API_KEY') {
          upstream = eodhdResult;
        } else if (!upstream.ok && fmpResult?.error && String(fmpResult.error.code || '').toUpperCase() !== 'MISSING_API_KEY') {
          upstream = fmpResult;
        }
      }
    }
  }

  if (upstream.ok && upstream.data) {
    const enrichedUpstream = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: await withCatalysts(request, ticker, upstream.data),
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const wm = buildWatermark({ servedFrom: 'RUNTIME', status: 'OK', data: enrichedUpstream });
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
      data: enrichedUpstream,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const remoteFallback = await fetchRemoteFundamentals(request, env, ticker);
  if (remoteFallback?.ok && remoteFallback.data) {
    const enrichedRemoteFallback = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: await withCatalysts(request, ticker, remoteFallback.data),
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const wm = buildWatermark({ servedFrom: 'RUNTIME', status: 'OK', data: enrichedRemoteFallback });
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'fresh',
        generated_at: startedAtIso,
        data_date: dataDateFrom(wm.asOf, startedAtIso),
        provider: 'fundamentals-api',
        data_source: wm.data_source,
        mode: wm.mode,
        asOf: remoteFallback.upstream_meta?.asOf || wm.asOf,
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
          selected: remoteFallback.provider,
          fallbackUsed: true,
          failureReason: upstream.error?.code || primaryFailure || null,
          keyPresent: false,
          keySource: null,
          httpStatus: remoteFallback.httpStatus,
          latencyMs: remoteFallback.latencyMs
        },
        telemetry: {
          provider: {
            primary: 'tiingo',
            selected: remoteFallback.provider,
            forced: false,
            fallbackUsed: true,
            primaryFailure: upstream.error?.code || primaryFailure || null
          },
          latencyMs: remoteFallback.latencyMs,
          ok: true,
          httpStatus: remoteFallback.httpStatus
        },
        upstream: {
          meta: remoteFallback.upstream_meta || null,
          metadata: remoteFallback.upstream_metadata || null,
        }
      },
      data: enrichedRemoteFallback,
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
    const enrichedLastGood = annotateFundamentalsForScope({
      ticker,
      universe: { name: await fetchUniverseName(request, ticker) },
      fundamentals: await withCatalysts(request, ticker, lastGood.value),
      scopeDoc,
      targetMarketDate: scopeDoc?.target_market_date || null,
    });
    const wm = buildWatermark({ servedFrom, status: 'PARTIAL', data: enrichedLastGood });
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
      data: enrichedLastGood,
      error: null
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const neutralFallbackData = annotateFundamentalsForScope({
    ticker,
    universe: { name: await fetchUniverseName(request, ticker) },
    fundamentals: null,
    scopeDoc,
    targetMarketDate: scopeDoc?.target_market_date || null,
  });
  const payload = {
    schema_version: '3.0',
    meta: {
      status: neutralFallbackData.coverage_expected ? 'stale' : 'fresh',
      generated_at: startedAtIso,
      data_date: dataDateFrom(null, startedAtIso),
      provider: 'fundamentals-api',
      data_source: neutralFallbackData.coverage_expected ? 'scope_refresh_pending' : 'scope_contract',
      mode: neutralFallbackData.coverage_expected ? 'DEGRADED' : 'LIVE',
      asOf: neutralFallbackData.scope_target_market_date || null,
      freshness: neutralFallbackData.coverage_expected ? 'refresh_pending' : 'scope_neutral'
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
      status: neutralFallbackData.coverage_expected ? 'PARTIAL' : 'OK',
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
    data: neutralFallbackData,
    error: neutralFallbackData.coverage_expected
      ? buildErrorPayload(upstream.error?.code || lastFailure?.error?.code || 'FUNDAMENTALS_REFRESH_PENDING', upstream.error?.message || lastFailure?.error?.message || 'Fundamentals refresh pending', {
        httpStatus: upstream.httpStatus || lastFailure?.httpStatus || null
      })
      : null
  };

  if (!isDebug) {
    payload.metadata.provider.failureReason = null;
  }

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
