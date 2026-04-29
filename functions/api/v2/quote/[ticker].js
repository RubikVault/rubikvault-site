import { jsonEnvelopeResponse } from '../../_shared/envelope.js';
import { normalizeTicker } from '../../_shared/stock-helpers.js';

const QUOTE_KILL_SWITCH_KEY = 'quote:kill_switch';

function isEnabled(env) {
  return String(env?.RV_LIVE_QUOTE_ENABLED || '').trim().toLowerCase() === 'true';
}

function isAllowlisted(env, ticker) {
  const raw = String(env?.RV_LIVE_QUOTE_ALLOWLIST || '').trim().toUpperCase();
  if (!raw) return false;
  return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)).has(ticker);
}

async function kvGet(env, key, options) {
  try {
    if (!env?.RV_KV?.get) return null;
    return await env.RV_KV.get(key, options);
  } catch {
    return null;
  }
}

export async function onRequestGet({ params, env }) {
  const ticker = normalizeTicker(params?.ticker || '');
  if (!ticker) {
    return jsonEnvelopeResponse({
      ok: false,
      status: 400,
      data: null,
      error: { code: 'INVALID_TICKER', message: 'Invalid or missing ticker parameter' },
      meta: { provider: 'live-quote', status: 'error', version: 'v2' },
    });
  }

  const killed = await kvGet(env, QUOTE_KILL_SWITCH_KEY);
  if (killed === '1' || !isEnabled(env)) {
    return jsonEnvelopeResponse({
      ok: false,
      status: 200,
      data: null,
      error: { code: killed === '1' ? 'QUOTE_DISABLED_BY_KILL_SWITCH' : 'QUOTE_DISABLED', message: 'Live quote is disabled' },
      meta: { provider: 'live-quote', status: 'closed', ticker, version: 'v2' },
      headers: { 'Cache-Control': 'public, max-age=30' },
    });
  }

  const cacheKey = `quote:${ticker}`;
  const cached = await kvGet(env, cacheKey, { type: 'json' });
  if (cached?.data) {
    return jsonEnvelopeResponse({
      ok: true,
      status: 200,
      data: cached.data,
      meta: { provider: 'live-quote', status: 'fresh', ticker, source: 'kv', version: 'v2' },
      headers: { 'Cache-Control': 'public, max-age=30' },
    });
  }

  if (!isAllowlisted(env, ticker)) {
    return jsonEnvelopeResponse({
      ok: false,
      status: 200,
      data: null,
      error: { code: 'QUOTE_NOT_ALLOWLISTED', message: 'Live quote ticker is not allowlisted' },
      meta: { provider: 'live-quote', status: 'closed', ticker, version: 'v2' },
      headers: { 'Cache-Control': 'public, max-age=30' },
    });
  }

  const quota = Number(env?.RV_LIVE_QUOTE_DAILY_QUOTA || 0);
  if (quota > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const used = Number(await kvGet(env, `quote:quota:${today}`) || 0);
    if (Number.isFinite(used) && used >= quota) {
      return jsonEnvelopeResponse({
        ok: false,
        status: 200,
        data: null,
        error: { code: 'QUOTE_QUOTA_EXCEEDED', message: 'Live quote advisory quota reached' },
        meta: { provider: 'live-quote', status: 'quota_exceeded', ticker, version: 'v2', quota_advisory: true },
        headers: { 'Cache-Control': 'public, max-age=30' },
      });
    }
  }

  return jsonEnvelopeResponse({
    ok: false,
    status: 200,
    data: null,
    error: { code: 'QUOTE_PROVIDER_NOT_CONFIGURED', message: 'Live quote provider fetch is not enabled in this build' },
    meta: { provider: 'live-quote', status: 'closed', ticker, version: 'v2' },
    headers: { 'Cache-Control': 'public, max-age=30' },
  });
}
