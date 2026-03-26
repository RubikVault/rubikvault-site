/**
 * RubikVault V2 Client Adapter
 * Provides dual-path fetching: V2 endpoints with V1 fallback.
 */

const V2_TIMEOUT_MS = 8000;

/**
 * Fetch V2 summary for a ticker.
 * @param {string} ticker
 * @returns {Promise<{ok:boolean, data:object, meta:object, source:string, error?:string}>}
 */
export async function fetchV2Summary(ticker) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), V2_TIMEOUT_MS);
  try {
    const res = await fetch(
      `/api/v2/stocks/${encodeURIComponent(ticker)}/summary`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error?.message || 'V2 response not ok');
    return { ok: true, data: payload.data, meta: payload.meta, source: 'v2' };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Map V2 summary response to the shape stock.html expects from /api/stock.
 * @param {object} v2Data - The data field from V2 summary response
 * @param {object} v2Meta - The meta field from V2 summary response
 * @returns {object} - Compatible with stock.html destructuring
 */
export function transformV2ToStockShape(v2Data, v2Meta) {
  return {
    data: {
      ticker: v2Data.ticker,
      bars: v2Data.latest_bar ? [v2Data.latest_bar] : [],
      market_prices: v2Data.market_prices || {},
      market_stats: v2Data.market_stats || {},
      change: v2Data.change || {},
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
    meta: v2Meta || {},
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
    return {
      payload: transformV2ToStockShape(v2.data, v2.meta),
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
