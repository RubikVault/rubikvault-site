import { isV2Enabled, v2GateResponse } from '../../../_shared/v2-gate.js';
import { fetchStockHistorical } from '../../../_shared/data-interface.js';
import { normalizeTicker } from '../../../_shared/stock-helpers.js';
import { logV2Request, logV2Gate } from '../../../_shared/v2-observability.js';
import { errorEnvelope } from '../../../_shared/envelope.js';

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

  let result = null;
  try {
    result = await fetchStockHistorical(ticker, env, request);
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
