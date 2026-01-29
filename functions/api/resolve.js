import { sha256Hex } from './_shared/digest.mjs';
import { resolveSymbol } from './_shared/symbol-resolver.mjs';
import { createCache } from './_shared/cache-law.js';

const MODULE_NAME = 'resolve';
const DEFAULT_RESOLVE_CACHE_TTL_SECONDS = 60 * 60;
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

export async function onRequestGet(context) {
  const { request } = context;
  const env = context?.env || {};
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  const startedAt = new Date().toISOString();
  const cache = createCache(env);
  const cacheId = query ? `resolve:${query.trim().toLowerCase()}` : null;
  const cacheTtlSeconds = Number(env?.RESOLVE_CACHE_TTL_SECONDS) || DEFAULT_RESOLVE_CACHE_TTL_SECONDS;
  const lockTtlSeconds = Number(env?.RESOLVE_LOCK_TTL_SECONDS) || DEFAULT_RESOLVE_LOCK_TTL_SECONDS;
  const qualityFlags = [];
  let result;
  let envelopeStatus = 'fresh';

  let cachedData = null;
  let cachedMeta = null;
  if (cacheId) {
    const cached = await cache.readCached(cacheId);
    cachedData = cached?.data || null;
    cachedMeta = cached?.metaLike || null;
  }

  const cachedGeneratedAt = cachedMeta?.generated_at ? Date.parse(cachedMeta.generated_at) : null;
  const cacheAgeSeconds = Number.isFinite(cachedGeneratedAt)
    ? Math.max(0, Math.floor((Date.now() - cachedGeneratedAt) / 1000))
    : null;
  const cacheFresh = cachedData && cacheAgeSeconds != null && cacheAgeSeconds <= cacheTtlSeconds;

  if (cacheFresh) {
    result = { ok: true, data: cachedData };
    envelopeStatus = 'fresh';
  } else if (cachedData) {
    result = { ok: true, data: cachedData };
    envelopeStatus = 'stale';
    if (cacheId) {
      const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
      if (!gotLock) {
        envelopeStatus = 'pending';
        qualityFlags.push('LOCKED_REFRESH');
      }
      const refresh = (async () => {
        if (!gotLock) return;
        try {
          const refreshed = await resolveSymbol(query, request);
          if (refreshed?.ok && refreshed?.data) {
            await cache.writeCached(cacheId, refreshed.data, cacheTtlSeconds, {
              provider: 'asset',
              data_date: ''
            });
          }
        } finally {
          await cache.releaseLock(cacheId);
        }
      })();
      if (typeof context?.waitUntil === 'function') {
        context.waitUntil(refresh);
      } else {
        refresh.catch(() => {});
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
          result = await resolveSymbol(query, request);
          if (result?.ok && result?.data) {
            await cache.writeCached(cacheId, result.data, cacheTtlSeconds, {
              provider: 'asset',
              data_date: ''
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
        result = await resolveSymbol(query, request);
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

  const payload = {
    schema_version: '3.0',
    module: MODULE_NAME,
    meta: {
      status: envelopeStatus,
      generated_at: new Date().toISOString(),
      data_date: '',
      provider: 'asset',
      quality_flags: qualityFlags
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

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
