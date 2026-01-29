import { getTiingoKeyInfo } from './tiingo-key.mjs';
import { checkCircuit, recordFailure, recordSuccess, circuitSnapshotForMeta } from './circuit.js';

function toIsoDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeAuthFailure(err) {
  if (!err || typeof err !== 'object') return err;
  const status = err?.details?.status;
  const upstreamCode = err?.details?.code;
  const statusNum = Number.isFinite(Number(status)) ? Number(status) : null;
  const upstreamNum = Number.isFinite(Number(upstreamCode)) ? Number(upstreamCode) : null;
  const effective = statusNum || upstreamNum;
  if (effective === 401 || effective === 403) {
    return {
      ...err,
      code: 'AUTH_FAILED',
      original_code: err.code
    };
  }
  return err;
}

export function getForcedProvider(env) {
  const forced = String(env?.RV_FORCE_PROVIDER || '').trim().toLowerCase();
  if (forced === 'tiingo') return 'tiingo';
  if (forced === 'twelvedata') return 'twelvedata';
  return null;
}

function resolveProviderMode(env) {
  const mode = String(env?.PROVIDER_MODE || 'PRIMARY_ONLY').trim().toUpperCase();
  return mode === 'FAILOVER_ALLOWED' ? 'FAILOVER_ALLOWED' : 'PRIMARY_ONLY';
}

async function guardedFetch(env, provider, fetcher) {
  const circuit = await checkCircuit(env, provider);
  const circuitMeta = circuitSnapshotForMeta(circuit.state, provider);
  if (!circuit.allow) {
    return {
      ok: false,
      provider,
      error: { code: 'CB_OPEN', message: `Circuit open for ${provider}` },
      circuit: circuitMeta
    };
  }

  const result = await fetcher();
  if (result.ok) {
    await recordSuccess(env, provider);
  } else {
    await recordFailure(env, provider, result.error?.code || null);
  }
  return { ...result, circuit: circuitMeta };
}

export async function fetchTiingoBars(symbol, env, options = {}) {
  const keyInfo = getTiingoKeyInfo(env);
  const apiKey = keyInfo.key;
  if (!apiKey) {
    return {
      ok: false,
      provider: 'tiingo',
      error: { code: 'MISSING_API_KEY', message: 'Missing TIINGO_API_KEY' },
      key: { present: false, source: null }
    };
  }

  const startDate = options.startDate || null;
  const url = new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`);
  url.searchParams.set('token', apiKey);
  url.searchParams.set('resampleFreq', 'daily');
  if (startDate) url.searchParams.set('startDate', startDate);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: 'tiingo',
        error: normalizeAuthFailure({
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}`,
          details: { status: response.status }
        })
      };
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return {
        ok: false,
        provider: 'tiingo',
        error: { code: 'BAD_PAYLOAD', message: 'Tiingo payload not array' }
      };
    }

    const bars = payload
      .map((row) => {
        const date = toIsoDate(row?.date);
        const close = toNumber(row?.close);
        const open = toNumber(row?.open);
        const high = toNumber(row?.high);
        const low = toNumber(row?.low);
        const volume = toNumber(row?.volume);
        if (!date) return null;
        return { date, open, high, low, close, volume };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return { ok: true, provider: 'tiingo', bars, key: { present: true, source: keyInfo.source } };
  } catch (error) {
    return {
      ok: false,
      provider: 'tiingo',
      error: { code: 'NETWORK_ERROR', message: error?.message || 'network_error' },
      key: { present: true, source: keyInfo.source }
    };
  }
}

export async function fetchTwelveDataBars(symbol, env, options = {}) {
  const apiKey = env?.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      provider: 'twelvedata',
      error: { code: 'MISSING_API_KEY', message: 'Missing TWELVEDATA_API_KEY' }
    };
  }

  const outputsize = options.outputsize || '260';
  const url = new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', '1day');
  url.searchParams.set('outputsize', String(outputsize));
  url.searchParams.set('apikey', apiKey);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: 'twelvedata',
        error: normalizeAuthFailure({
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}`,
          details: { status: response.status }
        })
      };
    }

    const payload = await response.json();
    if (payload?.status === 'error') {
      return {
        ok: false,
        provider: 'twelvedata',
        error: normalizeAuthFailure({
          code: 'UPSTREAM_ERROR',
          message: payload?.message || 'Twelve Data error',
          details: payload
        })
      };
    }

    const values = Array.isArray(payload?.values) ? payload.values : [];
    const bars = values
      .map((row) => {
        const date = toIsoDate(row?.datetime);
        const close = toNumber(row?.close);
        const open = toNumber(row?.open);
        const high = toNumber(row?.high);
        const low = toNumber(row?.low);
        const volume = toNumber(row?.volume);
        if (!date) return null;
        return { date, open, high, low, close, volume };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return { ok: true, provider: 'twelvedata', bars };
  } catch (error) {
    return {
      ok: false,
      provider: 'twelvedata',
      error: { code: 'NETWORK_ERROR', message: error?.message || 'network_error' }
    };
  }
}

export async function fetchBarsWithProviderChain(symbol, env, options = {}) {
  const forced = getForcedProvider(env);
  const providerMode = resolveProviderMode(env);
  const allowFailover = providerMode === 'FAILOVER_ALLOWED' && options.allowFailover === true;
  const chain = {
    primary: 'tiingo',
    secondary: 'twelvedata',
    forced: forced,
    selected: null,
    fallbackUsed: false,
    failureReason: null,
    primaryFailure: null,
    mode: providerMode,
    allowFailover
  };

  const startDate = options.startDate || null;

  const fetchFromProvider = async (provider) => {
    if (provider === 'tiingo') return fetchTiingoBars(symbol, env, { startDate });
    if (provider === 'twelvedata') return fetchTwelveDataBars(symbol, env, { outputsize: options.outputsize || '260' });
    return { ok: false, provider, error: { code: 'PROVIDER_UNKNOWN', message: 'Unknown provider' } };
  };

  if (forced) {
    const result = await guardedFetch(env, forced, () => fetchFromProvider(forced));
    if (!result.ok) {
      chain.failureReason = 'FORCED_PROVIDER_FAILED';
      chain.primaryFailure = result.error;
      chain.circuit = result.circuit;
      return { ok: false, chain, error: result.error, bars: [], circuit: result.circuit };
    }
    chain.selected = forced;
    chain.circuit = result.circuit;
    return { ok: true, chain, bars: result.bars, provider: forced, circuit: result.circuit };
  }

  const primaryResult = await guardedFetch(env, chain.primary, () => fetchFromProvider(chain.primary));
  if (primaryResult.ok) {
    chain.selected = chain.primary;
    chain.circuit = primaryResult.circuit;
    return { ok: true, chain, bars: primaryResult.bars, provider: chain.primary, circuit: primaryResult.circuit };
  }

  chain.primaryFailure = primaryResult.error;
  chain.circuit = primaryResult.circuit;

  if (allowFailover) {
    const secondaryResult = await guardedFetch(env, chain.secondary, () => fetchFromProvider(chain.secondary));
    if (secondaryResult.ok) {
      chain.selected = chain.secondary;
      chain.fallbackUsed = true;
      chain.failureReason = 'PRIMARY_FAILED_FALLBACK_OK';
      chain.circuit = secondaryResult.circuit;
      return { ok: true, chain, bars: secondaryResult.bars, provider: chain.secondary, circuit: secondaryResult.circuit };
    }

    chain.selected = null;
    chain.fallbackUsed = true;
    chain.failureReason = 'BOTH_FAILED';
    return {
      ok: false,
      chain,
      error: {
        code: 'BOTH_FAILED',
        message: 'Both providers failed',
        details: { primary: primaryResult.error, secondary: secondaryResult.error }
      },
      bars: [],
      circuit: secondaryResult.circuit
    };
  }

  chain.selected = null;
  return {
    ok: false,
    chain,
    error: {
      code: primaryResult.error?.code || 'PRIMARY_FAILED',
      message: primaryResult.error?.message || 'Primary provider failed',
      details: { primary: primaryResult.error, secondary: null }
    },
    bars: [],
    circuit: primaryResult.circuit
  };
}
