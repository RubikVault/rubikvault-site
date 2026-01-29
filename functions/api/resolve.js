import { sha256Hex } from './_shared/digest.mjs';
import { resolveSymbol } from './_shared/symbol-resolver.mjs';
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
import { isPrivilegedDebug, redact } from './_shared/observability.js';

const MODULE_NAME = 'resolve';
const DEFAULT_RESOLVE_CACHE_TTL_SECONDS = DEFAULT_TTL_SECONDS;
const DEFAULT_RESOLVE_LOCK_TTL_SECONDS = 30;

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

export async function onRequestGet(context) {
  const { request } = context;
  const env = context?.env || {};
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  const isPrivileged = isPrivilegedDebug(request, env);
  const timings = { t_total_ms: 0, t_kv_ms: null, t_origin_ms: null, t_build_ms: null };
  const requestStart = Date.now();
  const startedAt = nowUtcIso();
  const cache = createCache(env);
  const normalizedQuery = query ? query.trim().toLowerCase() : '';
  const cacheId = normalizedQuery ? `resolve:${normalizedQuery}` : null;
  const cacheTtlSeconds = Number(env?.RESOLVE_CACHE_TTL_SECONDS) || DEFAULT_RESOLVE_CACHE_TTL_SECONDS;
  const lockTtlSeconds = Number(env?.RESOLVE_LOCK_TTL_SECONDS) || DEFAULT_RESOLVE_LOCK_TTL_SECONDS;
  const qualityFlags = [];
  let result;
  let envelopeStatus = 'fresh';

  const primaryKey = cacheId ? cache.dataKey(cacheId) : null;
  const primaryMetaKey = cacheId ? cache.metaKey(cacheId) : null;
  const aliasKey = normalizedQuery ? makeCacheKey('resolve', normalizedQuery) : null;
  const aliasMetaKey = normalizedQuery ? makeCacheKey('meta', `resolve:${normalizedQuery}`) : null;
  const swrKey = normalizedQuery ? makeCacheKey('swr', `resolve:${normalizedQuery}`) : null;

  let cachedData = null;
  let cachedMeta = null;
  let cachedAgeSeconds = null;
  let cachedStale = false;
  let cacheHit = false;
  let swrMarked = undefined;
  let cacheKeyUsed = null;
  let cacheMetaKeyUsed = null;

  if (cacheId) {
    const kvStart = Date.now();
    const cached = await cache.readCached(cacheId);
    cachedData = cached?.data ?? null;
    cachedMeta = cached?.metaLike ?? null;
    cacheKeyUsed = primaryKey;
    cacheMetaKeyUsed = primaryMetaKey;

    if (cachedData == null && aliasKey && aliasKey !== primaryKey) {
      const aliasData = await getJsonKV(env, aliasKey);
      if (aliasData?.meta?.hit) {
        cachedData = aliasData.value;
        cacheKeyUsed = aliasKey;
      }
      if (cachedData && aliasMetaKey) {
        const aliasMeta = await getJsonKV(env, aliasMetaKey);
        if (aliasMeta?.meta?.hit) {
          cachedMeta = aliasMeta.value;
          cacheMetaKeyUsed = aliasMetaKey;
        }
      }
    }
    timings.t_kv_ms = Date.now() - kvStart;
  }

  cachedAgeSeconds = computeAgeSeconds(cachedMeta?.generated_at);
  const cacheFresh = cachedData && cachedAgeSeconds != null && cachedAgeSeconds <= cacheTtlSeconds;
  cachedStale = Boolean(cachedData) && !cacheFresh;

  async function refreshCacheInBackground() {
    if (!cacheId) return;
    try {
      const refreshed = await resolveSymbol(query, request);
      if (refreshed?.ok && refreshed?.data) {
        await cache.writeCached(cacheId, refreshed.data, cacheTtlSeconds, {
          provider: 'asset',
          data_date: todayUtcDate()
        });
      }
      console.log(
        JSON.stringify({
          event: 'swr_refresh',
          module: MODULE_NAME,
          query: normalizedQuery,
          ok: Boolean(refreshed?.ok),
          cache_key: cacheKeyUsed || primaryKey || null
        })
      );
    } catch {
      console.log(
        JSON.stringify({
          event: 'swr_refresh',
          module: MODULE_NAME,
          query: normalizedQuery,
          ok: false,
          cache_key: cacheKeyUsed || primaryKey || null
        })
      );
    }
  }

  if (cacheFresh) {
    cacheHit = true;
    result = { ok: true, data: cachedData };
    envelopeStatus = 'fresh';
  } else if (cachedData) {
    cacheHit = true;
    result = { ok: true, data: cachedData };
    envelopeStatus = 'stale';
    if (cacheId) {
      swrMarked = await tryMarkSWR(env, swrKey, SWR_MARK_TTL_SECONDS);
      if (swrMarked) {
        const refresh = refreshCacheInBackground();
        if (typeof context?.waitUntil === 'function') {
          context.waitUntil(refresh);
        } else {
          refresh.catch(() => {});
        }
      } else {
        envelopeStatus = 'pending';
        qualityFlags.push('LOCKED_REFRESH');
      }
    }
  } else {
    if (cacheId) {
      const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
      if (!gotLock) {
        result = {
          ok: false,
          error: {
            code: 'LOCKED_REFRESH',
            message: 'Resolve refresh already in progress'
          }
        };
        envelopeStatus = 'pending';
        qualityFlags.push('LOCKED_REFRESH');
      } else {
        try {
          const originStart = Date.now();
          result = await resolveSymbol(query, request);
          timings.t_origin_ms = Date.now() - originStart;
          if (result?.ok && result?.data) {
            await cache.writeCached(cacheId, result.data, cacheTtlSeconds, {
              provider: 'asset',
              data_date: todayUtcDate()
            });
          }
          envelopeStatus = result?.ok ? 'fresh' : 'error';
        } catch (error) {
          result = {
            ok: false,
            error: {
              code: 'RESOLVE_FAILED',
              message: 'Resolver crashed',
              details: { message: error?.message || String(error) }
            }
          };
          envelopeStatus = 'error';
        } finally {
          await cache.releaseLock(cacheId);
        }
      }
    } else {
      try {
        const originStart = Date.now();
        result = await resolveSymbol(query, request);
        timings.t_origin_ms = Date.now() - originStart;
        envelopeStatus = result?.ok ? 'fresh' : 'error';
      } catch (error) {
        result = {
          ok: false,
          error: {
            code: 'RESOLVE_FAILED',
            message: 'Resolver crashed',
            details: { message: error?.message || String(error) }
          }
        };
        envelopeStatus = 'error';
      }
    }
  }

  const schedulerStart = Date.now();
  const schedulerState = await loadSchedulerState(env, isPrivileged);
  const schedulerMs = Date.now() - schedulerStart;
  timings.t_kv_ms = (timings.t_kv_ms || 0) + schedulerMs;

  const cacheMetaBase = buildCacheMeta({
    mode: cacheHit && cachedStale ? 'swr' : 'kv',
    key_kind: 'resolve',
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

  const buildStart = Date.now();
  const payload = {
    schema_version: '3.0',
    module: MODULE_NAME,
    meta: {
      status: envelopeStatus,
      generated_at: nowUtcIso(),
      data_date: todayUtcDate(),
      provider: 'asset',
      quality_flags: qualityFlags,
      cache: cacheMeta,
      timings,
      degraded: schedulerState.degraded,
      degraded_reason: schedulerState.reason || null
    },
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      domain: 'stocks',
      source: 'resolve-api',
      fetched_at: startedAt,
      published_at: startedAt,
      digest: null,
      served_from: 'RUNTIME',
      request: {
        q: query
      },
      status: result.ok ? 'OK' : 'ERROR'
    },
    data: result.ok ? result.data : null,
    error: result.ok ? null : buildErrorPayload(result.error.code, result.error.message, result.error.details)
  };

  payload.metadata.digest = await computeDigest(payload);
  timings.t_build_ms = Date.now() - buildStart;
  timings.t_total_ms = Date.now() - requestStart;

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
