import { sha256Hex } from '../_shared/digest.mjs';
import { getTiingoKeyInfo } from '../_shared/tiingo-key.mjs';

const MODULE_NAME = 'diagnostics-tiingo';

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

function mapErrorCode({ httpStatus, error }) {
  if (!httpStatus) {
    const name = String(error?.name || '').toLowerCase();
    const msg = String(error?.message || '').toLowerCase();
    if (name.includes('abort') || msg.includes('timeout')) return 'TIMEOUT';
    return 'NETWORK_ERROR';
  }
  if (httpStatus === 401 || httpStatus === 403) return 'AUTH_FAILED';
  return 'HTTP_ERROR';
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isDebug = url.searchParams.get('debug') === '1';
  const startedAtIso = new Date().toISOString();

  const keyInfo = getTiingoKeyInfo(env);
  const keyPresent = Boolean(keyInfo.key);

  let canReachTiingo = false;
  let httpStatus = null;
  let errorCode = null;
  let latencyMs = null;

  if (keyPresent) {
    const controller = new AbortController();
    const timeoutMs = 6000;
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tiingoUrl = new URL('https://api.tiingo.com/tiingo/daily/AAPL/prices');
      tiingoUrl.searchParams.set('token', keyInfo.key);
      tiingoUrl.searchParams.set('resampleFreq', 'daily');
      tiingoUrl.searchParams.set('startDate', startDate);

      const res = await fetch(tiingoUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      httpStatus = res.status;
      canReachTiingo = res.ok;
      latencyMs = Date.now() - started;
      if (!res.ok) {
        errorCode = mapErrorCode({ httpStatus: res.status, error: null });
      }
    } catch (error) {
      latencyMs = Date.now() - started;
      canReachTiingo = false;
      errorCode = mapErrorCode({ httpStatus: null, error });
    } finally {
      clearTimeout(timer);
    }
  } else {
    canReachTiingo = false;
    errorCode = 'MISSING_API_KEY';
  }

  const payload = {
    schema_version: '3.0',
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      tier: 'standard',
      domain: 'system',
      source: 'diagnostics',
      fetched_at: startedAtIso,
      published_at: startedAtIso,
      digest: null,
      served_from: 'RUNTIME',
      request: {
        debug: isDebug
      },
      status: canReachTiingo ? 'OK' : 'ERROR'
    },
    data: {
      keyPresent,
      keySource: keyInfo.source,
      canReachTiingo,
      httpStatus,
      errorCode,
      latencyMs
    },
    error: null
  };

  if (!canReachTiingo) {
    payload.error = buildErrorPayload(errorCode || 'TIINGO_UNAVAILABLE', 'Tiingo diagnostics failed', {
      httpStatus
    });
    if (!isDebug) {
      payload.error.details = { httpStatus };
    }
  }

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
