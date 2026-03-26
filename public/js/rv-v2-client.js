/**
 * RubikVault V2 Client Adapter
 * Provides dual-path fetching: V2 endpoints with V1 fallback.
 */

const V2_TIMEOUT_MS = 8000;

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), V2_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch V2 summary for a ticker.
 * @param {string} ticker
 * @returns {Promise<{ok:boolean, data:object, meta:object, source:string, error?:string}>}
 */
export async function fetchV2Summary(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/summary`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2' };
}

export async function fetchV2Historical(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/historical`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 historical response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2_historical' };
}

export async function fetchV2Governance(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/governance`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 governance response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2_governance' };
}

/**
 * Map V2 summary response to the shape stock.html expects from /api/stock.
 * @param {object} v2Data - The data field from V2 summary response
 * @param {object} v2Meta - The meta field from V2 summary response
 * @returns {object} - Compatible with stock.html destructuring
 */
export function transformV2ToStockShape(v2Data, v2Meta, extras = {}) {
  const historicalData = extras.historicalData || null;
  const governanceData = extras.governanceData || null;
  const v1FallbackPayload = extras.v1FallbackPayload || null;
  const bars = historicalData?.bars || v1FallbackPayload?.data?.bars || (v2Data.latest_bar ? [v2Data.latest_bar] : []);
  const marketPrices = v2Data.market_prices || v1FallbackPayload?.data?.market_prices || {};
  const marketStats = v2Data.market_stats || v1FallbackPayload?.data?.market_stats || {};
  const change = v2Data.change || v1FallbackPayload?.data?.change || {};
  return {
    data: {
      ticker: v2Data.ticker,
      bars,
      market_prices: marketPrices,
      market_stats: marketStats,
      change,
      breakout_v2: historicalData?.breakout_v2 || null,
      governance: governanceData || null,
    },
    metadata: {
      request: {
        ticker: v2Data.ticker,
        normalized_ticker: v2Data.ticker,
        effective_ticker: v2Data.ticker,
      },
      as_of: v2Meta?.data_date || null,
      source_chain: { primary: v2Meta?.provider, selected: v2Meta?.provider },
    },
    meta: {
      ...(v2Meta || {}),
      historical_status: extras.historicalMeta?.status || null,
      governance_status: extras.governanceMeta?.status || null,
    },
    states: v2Data.states || {},
    decision: v2Data.decision || {},
    explanation: v2Data.explanation || {},
    v6: v2Data.decision?.v6 || null,
    error: null,
    _rv_source: 'v2',
  };
}

/**
 * Fetch with V2-first, V1-fallback strategy.
 * @param {string} ticker
 * @returns {Promise<{payload:object, source:string}>}
 */
export async function fetchWithFallback(ticker) {
  // Track fallback events
  window._rvFallbackLog = window._rvFallbackLog || [];

  try {
    const v2 = await fetchV2Summary(ticker);
    const [historicalResult, governanceResult] = await Promise.allSettled([
      fetchV2Historical(ticker),
      fetchV2Governance(ticker),
    ]);
    let historicalData = null;
    let historicalMeta = null;
    let governanceData = null;
    let governanceMeta = null;
    if (historicalResult.status === 'fulfilled') {
      historicalData = historicalResult.value.data;
      historicalMeta = historicalResult.value.meta;
    }
    if (governanceResult.status === 'fulfilled') {
      governanceData = governanceResult.value.data;
      governanceMeta = governanceResult.value.meta;
    }

    let v1FallbackPayload = null;
    if (!historicalData?.bars?.length) {
      try {
        const res = await fetch('/api/stock?ticker=' + encodeURIComponent(ticker));
        if (res.ok) {
          v1FallbackPayload = await res.json();
        }
      } catch {
        v1FallbackPayload = null;
      }
    }

    return {
      payload: transformV2ToStockShape(v2.data, v2.meta, {
        historicalData,
        historicalMeta,
        governanceData,
        governanceMeta,
        v1FallbackPayload,
      }),
      source: 'v2',
    };
  } catch (err) {
    console.warn('[RV-V2] Fallback to V1:', err.message);
    window._rvFallbackLog.push({
      ts: new Date().toISOString(),
      ticker,
      from: 'v2',
      to: 'v1',
      error: err.message,
    });
  }

  // V1 fallback
  const res = await fetch('/api/stock?ticker=' + encodeURIComponent(ticker));
  const payload = await res.json();
  return { payload, source: 'v1_fallback' };
}
