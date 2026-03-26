/**
 * RubikVault V2 Client Adapter
 * Provides dual-path fetching: V2 endpoints with V1 fallback.
 */

const V2_TIMEOUT_MS = 8000;
const CORE_METRICS = ['rsi14', 'atr14', 'volatility_20d', 'volatility_percentile', 'bb_upper', 'bb_lower', 'high_52w', 'low_52w', 'range_52w_pct'];

function parseDay(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const direct = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = Date.parse(direct);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

function dayToMillis(value) {
  const normalized = parseDay(value);
  if (!normalized) return null;
  return Date.UTC(Number(normalized.slice(0, 4)), Number(normalized.slice(5, 7)) - 1, Number(normalized.slice(8, 10)));
}

function getIndicatorEntries(indicators) {
  if (Array.isArray(indicators)) return indicators;
  if (Array.isArray(indicators?.indicators)) return indicators.indicators;
  return [];
}

export function statsFromIndicatorEntries(indicators, symbol, asOf) {
  const entries = getIndicatorEntries(indicators);
  if (!entries.length) return null;
  const stats = {};
  for (const item of entries) {
    if (!item || typeof item.id !== 'string') continue;
    stats[item.id] = item.value;
  }
  return { symbol, as_of: asOf || null, stats, coverage: null, warnings: [] };
}

function mergePreferPrimary(primary, secondary) {
  if (!primary && !secondary) return null;
  if (!primary) return secondary || null;
  if (!secondary) return primary || null;
  const merged = { ...secondary };
  for (const [key, value] of Object.entries(primary)) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

export function chooseCanonicalPriceRecord(...records) {
  const available = records.filter(Boolean);
  if (!available.length) return null;
  return available.sort((a, b) => {
    const aTs = dayToMillis(a?.date) ?? -Infinity;
    const bTs = dayToMillis(b?.date) ?? -Infinity;
    return bTs - aTs;
  }).reduce((selected, current) => (selected ? mergePreferPrimary(selected, current) : current), null);
}

export function chooseCanonicalStatsRecord(...records) {
  const available = records.filter(Boolean);
  if (!available.length) return null;
  const score = (record) => {
    const stats = record?.stats || {};
    const complete = CORE_METRICS.filter((key) => Number.isFinite(stats[key])).length;
    const freshness = dayToMillis(record?.as_of) ?? -Infinity;
    return { complete, freshness };
  };
  return available.sort((a, b) => {
    const aScore = score(a);
    const bScore = score(b);
    if (bScore.complete !== aScore.complete) return bScore.complete - aScore.complete;
    return bScore.freshness - aScore.freshness;
  }).reduce((selected, current) => (selected ? mergePreferPrimary(selected, current) : current), null);
}

function isOlderThan(dateValue, maxAgeDays) {
  const ts = dayToMillis(dateValue);
  if (ts == null) return true;
  return Date.now() - ts > maxAgeDays * 86400000;
}

export function deriveIntegrity(priceRecord, statsRecord, meta = {}, statuses = {}) {
  const issues = [];
  const missingMetrics = CORE_METRICS.filter((key) => !Number.isFinite(statsRecord?.stats?.[key]));
  const summaryDate = priceRecord?.date || meta?.data_date || null;
  const historicalDate = statuses?.historicalAsOf || meta?.data_date || null;
  if (meta?.status === 'error') issues.push('summary_error');
  if (meta?.status === 'pending' && !parseDay(summaryDate)) issues.push('summary_pending');
  if (statuses?.historical === 'error') issues.push('historical_error');
  if (statuses?.historical === 'pending' && !parseDay(historicalDate)) issues.push('historical_pending');
  if (statuses?.governance && !['fresh', 'stale', null, undefined].includes(statuses.governance)) issues.push(`governance_${statuses.governance}`);
  if (isOlderThan(summaryDate, 2)) issues.push('stale_price_data');
  if (statuses?.historical === 'stale' && isOlderThan(historicalDate, 2)) issues.push('historical_stale');
  if (missingMetrics.length) issues.push('missing_core_metrics');
  let status = 'ok';
  if (issues.includes('stale_price_data') || issues.includes('summary_error') || issues.includes('summary_pending')) status = 'degraded';
  else if (issues.length) status = 'partial';
  return {
    status,
    issues,
    missingMetrics,
  };
}

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
  const liveBarPrice = v2Data.latest_bar ? {
    symbol: v2Data.ticker,
    date: v2Data.latest_bar.date || null,
    open: v2Data.latest_bar.open ?? null,
    high: v2Data.latest_bar.high ?? null,
    low: v2Data.latest_bar.low ?? null,
    close: v2Data.latest_bar.close ?? null,
    adj_close: v2Data.latest_bar.adjClose ?? v2Data.latest_bar.close ?? null,
    volume: v2Data.latest_bar.volume ?? null,
    currency: 'USD',
    source_provider: v2Meta?.provider || null,
  } : null;
  const historicalStats = statsFromIndicatorEntries(historicalData?.indicators, v2Data.ticker, extras.historicalMeta?.data_date || v2Meta?.data_date || null);
  const marketPrices = chooseCanonicalPriceRecord(v2Data.market_prices, liveBarPrice, v1FallbackPayload?.data?.market_prices) || {};
  const marketStats = chooseCanonicalStatsRecord(v2Data.market_stats, historicalStats, v1FallbackPayload?.data?.market_stats) || {};
  const change = v2Data.change || v1FallbackPayload?.data?.change || {};
  const analysis = {
    snapshotTime: v2Meta?.generated_at || new Date().toISOString(),
    latestDataDate: parseDay(v2Meta?.data_date) || parseDay(marketPrices.date) || parseDay(bars[bars.length - 1]?.date) || null,
    priceAsOf: parseDay(marketPrices.date) || parseDay(bars[bars.length - 1]?.date) || null,
    indicatorAsOf: parseDay(marketStats.as_of) || parseDay(extras.historicalMeta?.data_date) || parseDay(v2Meta?.data_date) || null,
    moduleProvenance: {
      summary: { asOf: parseDay(v2Meta?.data_date) || null, status: v2Meta?.status || null },
      historical: { asOf: parseDay(extras.historicalMeta?.data_date) || null, status: extras.historicalMeta?.status || null },
      governance: { asOf: parseDay(extras.governanceMeta?.data_date) || null, status: extras.governanceMeta?.status || null },
      price: { asOf: parseDay(marketPrices.date) || null, status: isOlderThan(marketPrices.date, 2) ? 'stale' : 'current' },
      indicators: { asOf: parseDay(marketStats.as_of) || null, status: deriveIntegrity(marketPrices, marketStats, v2Meta, { historical: extras.historicalMeta?.status || null }).missingMetrics.length ? 'partial' : 'ok' },
    },
  };
  analysis.integrity = deriveIntegrity(marketPrices, marketStats, v2Meta, {
    historical: extras.historicalMeta?.status || null,
    historicalAsOf: extras.historicalMeta?.data_date || null,
    governance: extras.governanceMeta?.status || null,
  });
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
      analysis,
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
