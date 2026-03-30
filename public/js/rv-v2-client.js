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
  try {
    const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/summary`);
    if (!payload.ok) throw new Error(payload.error?.message || 'V2 response not ok');
    return { ok: true, data: payload.data, meta: payload.meta, source: 'v2' };
  } catch (err) {
    throw err;
  }
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

export async function fetchFundamentals(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}`);
  return { ok: true, data: payload?.data || null, meta: payload?.meta || payload?.metadata || null, source: 'fundamentals' };
}

export async function fetchV1Stock(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/stock?ticker=${encodeURIComponent(ticker)}`);
  return { ok: true, data: payload || null, source: 'v1_stock' };
}

export async function fetchV2StockPage(ticker) {
  const [summary, historical, governance, fundamentals] = await Promise.all([
    fetchV2Summary(ticker),
    fetchV2Historical(ticker),
    fetchV2Governance(ticker),
    fetchFundamentals(ticker).catch(() => ({ ok: false, data: null, meta: null, source: 'fundamentals' })),
  ]);
  const latestHistoricalDate = historical?.data?.bars?.length
    ? historical.data.bars[historical.data.bars.length - 1]?.date
    : null;
  const summaryDate = summary?.data?.market_prices?.date || summary?.meta?.data_date || null;
  const needsLegacyEnrichment = Boolean(
    !summary?.data?.name ||
    !governance?.data?.universe?.name ||
    !fundamentals?.ok || !fundamentals?.data ||
    (latestHistoricalDate && summaryDate && latestHistoricalDate > summaryDate)
  );
  const legacy = needsLegacyEnrichment
    ? await fetchV1Stock(ticker).catch(() => ({ ok: false, data: null, source: 'v1_stock' }))
    : { ok: false, data: null, source: 'v1_stock' };

  const fullContractOk = Boolean(
    summary?.data?.ticker &&
    Array.isArray(historical?.data?.bars) &&
    historical.data.bars.length > 1 &&
    governance?.data
  );

  if (!fullContractOk) {
    throw new Error('V2 page contract incomplete');
  }

  return {
    ok: true,
    data: {
      summary: summary.data,
      historical: historical.data,
      governance: governance.data,
      fundamentals: fundamentals?.data || null,
      legacy: legacy?.data || null,
    },
    meta: {
      summary: summary.meta || null,
      historical: historical.meta || null,
      governance: governance.meta || null,
      fundamentals: fundamentals?.meta || null,
      legacy: legacy?.data?.metadata || null,
    },
  };
}

/**
 * Map V2 summary response to the shape stock.html expects from /api/stock.
 * @param {object} v2Data - The data field from V2 summary response
 * @param {object} v2Meta - The meta field from V2 summary response
 * @returns {object} - Compatible with stock.html destructuring
 */
function isMeaningfulFundamentals(doc) {
  if (!doc || typeof doc !== 'object') return false;
  return Object.entries(doc).some(([key, value]) => !['ticker', 'updatedAt'].includes(key) && value != null);
}

function hasMeaningfulMarketStats(doc) {
  const stats = doc?.stats;
  if (!stats || typeof stats !== 'object') return false;
  const keys = ['rsi14', 'sma20', 'sma50', 'sma200', 'atr14'];
  return keys.filter((key) => Number.isFinite(Number(stats[key]))).length >= 3;
}

function countMeaningfulFundamentals(doc) {
  if (!doc || typeof doc !== 'object') return 0;
  const keys = ['marketCap', 'pe_ttm', 'eps_ttm', 'dividendYield', 'sector', 'industry', 'companyName', 'nextEarningsDate'];
  return keys.filter((key) => doc[key] != null && doc[key] !== '').length;
}

function toIsoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function dateLagDays(olderValue, newerValue) {
  const older = toIsoDate(olderValue);
  const newer = toIsoDate(newerValue);
  if (!older || !newer) return null;
  const ms = Date.parse(`${newer}T00:00:00Z`) - Date.parse(`${older}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null;
}

function buildModuleFreshnessMap(v2, legacyPayload = null) {
  const historicalDate = v2?.data?.historical?.bars?.length
    ? v2.data.historical.bars[v2.data.historical.bars.length - 1]?.date
    : null;
  const evaluation = v2?.data?.governance?.evaluation_v4 || null;
  return {
    price_as_of: v2?.data?.summary?.market_prices?.date || historicalDate || null,
    historical_as_of: historicalDate || null,
    scientific_as_of: evaluation?.input_states?.scientific?.as_of || null,
    forecast_as_of: evaluation?.input_states?.forecast?.as_of || null,
    quantlab_as_of: evaluation?.input_states?.quantlab?.as_of || null,
    fundamentals_as_of: v2?.data?.fundamentals?.updatedAt || v2?.meta?.fundamentals?.asOf || null,
    legacy_as_of: legacyPayload?.metadata?.as_of || null,
  };
}

export function evaluateV2PromotionGate(v2, legacyPayload = null) {
  const summary = v2?.data?.summary || {};
  const governance = v2?.data?.governance || {};
  const fundamentals = v2?.data?.fundamentals || null;
  const evaluation = governance?.evaluation_v4 || {};
  const moduleFreshness = buildModuleFreshnessMap(v2, legacyPayload);
  const latestHistoricalDate = moduleFreshness.historical_as_of;
  const summaryPriceDate = toIsoDate(summary?.market_prices?.date);
  const summaryProvider = String(summary?.market_prices?.source_provider || '').toLowerCase();
  const learningStatus = String(evaluation?.decision?.learning_status || summary?.decision?.learning_status || '').toUpperCase();
  const minimumNNotMet = Boolean(
    evaluation?.decision?.minimum_n_not_met ||
    evaluation?.decision?.safety?.trigger === 'minimum_n_not_met' ||
    summary?.decision?.minimum_n_not_met
  );
  const reasons = [];

  if (!latestHistoricalDate) reasons.push('historical_missing');
  if (!summaryPriceDate) reasons.push('summary_price_missing');
  if (summaryProvider === 'stock-analysis-seed') reasons.push('summary_price_seed');
  if (latestHistoricalDate && summaryPriceDate && summaryPriceDate < latestHistoricalDate) reasons.push('summary_price_stale_vs_historical');
  if (!hasMeaningfulMarketStats(summary?.market_stats)) reasons.push('summary_market_stats_incomplete');
  if (!(summary?.name || governance?.universe?.name || fundamentals?.companyName || legacyPayload?.data?.name)) reasons.push('identity_incomplete');
  if (learningStatus === 'BOOTSTRAP') reasons.push('learning_bootstrap');
  if (minimumNNotMet) reasons.push('minimum_n_not_met');

  const laggedModules = ['scientific_as_of', 'forecast_as_of', 'quantlab_as_of']
    .map((key) => ({ key, lag: dateLagDays(moduleFreshness[key], latestHistoricalDate) }))
    .filter((entry) => entry.lag != null && entry.lag > 5)
    .map((entry) => `${entry.key}_stale_${entry.lag}d`);
  reasons.push(...laggedModules);

  const assetClassHay =
    `${summary?.ticker || ''} ${summary?.name || ''} ${governance?.universe?.name || ''} ${governance?.universe?.asset_class || ''} ${governance?.universe?.security_type || ''}`.toLowerCase();
  const isEtf = /\betf\b|\bexchange traded fund\b|\btrust\b/.test(assetClassHay);
  if (!isEtf && countMeaningfulFundamentals(fundamentals) < 2) reasons.push('fundamentals_incomplete');

  const warningOnlyReasons = new Set([
    'learning_bootstrap',
    'minimum_n_not_met',
    'fundamentals_incomplete',
  ]);
  const blockingReasons = reasons.filter((reason) => !warningOnlyReasons.has(reason));

  return {
    promote: blockingReasons.length === 0,
    reasons,
    blocking_reasons: blockingReasons,
    warning_reasons: reasons.filter((reason) => warningOnlyReasons.has(reason)),
    moduleFreshness,
    coverage: {
      fundamentals_fields: countMeaningfulFundamentals(fundamentals),
      has_identity: Boolean(summary?.name || governance?.universe?.name || fundamentals?.companyName || legacyPayload?.data?.name),
      is_etf: isEtf,
    },
  };
}

function pickLatestMarketPrices(summaryPrices, latestBar, legacyPayload) {
  const legacyPrices = legacyPayload?.data?.market_prices || null;
  const barPrices = latestBar ? {
    ticker: legacyPayload?.data?.ticker || null,
    date: latestBar.date || null,
    close: latestBar.close ?? null,
    open: latestBar.open ?? null,
    high: latestBar.high ?? null,
    low: latestBar.low ?? null,
    volume: latestBar.volume ?? null,
  } : null;
  const candidates = [summaryPrices, legacyPrices, barPrices].filter(Boolean);
  candidates.sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  return candidates[0] || summaryPrices || {};
}

export function transformV2ToStockShape(v2Data, v2Meta, historicalData = null, governanceData = null, fundamentalsData = null, metaBundle = null, legacyPayload = null) {
  const bars = historicalData?.bars || (v2Data.latest_bar ? [v2Data.latest_bar] : []);
  const marketStats = hasMeaningfulMarketStats(v2Data.market_stats) ? v2Data.market_stats : (legacyPayload?.data?.market_stats || v2Data.market_stats || {});
  const latestBar = historicalData?.bars?.length ? historicalData.bars[historicalData.bars.length - 1] : v2Data.latest_bar;
  const marketPrices = pickLatestMarketPrices(v2Data.market_prices || {}, latestBar, legacyPayload);
  const mergedFundamentals = isMeaningfulFundamentals(fundamentalsData) ? fundamentalsData : (legacyPayload?.data?.fundamentals || fundamentalsData || null);
  const pageAsOf = marketPrices?.date || latestBar?.date || v2Meta?.data_date || null;
  const moduleFreshness = {
    ...(v2Data?.module_freshness || {}),
    price_as_of: marketPrices?.date || null,
    historical_as_of: latestBar?.date || null,
    scientific_as_of: governanceData?.evaluation_v4?.input_states?.scientific?.as_of || null,
    forecast_as_of: governanceData?.evaluation_v4?.input_states?.forecast?.as_of || null,
    quantlab_as_of: governanceData?.evaluation_v4?.input_states?.quantlab?.as_of || null,
    fundamentals_as_of: mergedFundamentals?.updatedAt || metaBundle?.fundamentals?.asOf || null,
  };
  return {
    data: {
      ticker: v2Data.ticker,
      name: v2Data.name || mergedFundamentals?.companyName || governanceData?.universe?.name || legacyPayload?.data?.name || v2Data.ticker || null,
      bars,
      market_prices: marketPrices,
      market_stats: marketStats,
      change: v2Data.change || {},
      breakout_v2: historicalData?.breakout_v2 || null,
      fundamentals: mergedFundamentals,
      source_provenance: {
        market_stats_source: hasMeaningfulMarketStats(v2Data.market_stats) ? 'v2_summary' : (legacyPayload?.data?.market_stats ? 'legacy_inline' : 'none'),
        fundamentals_source: isMeaningfulFundamentals(fundamentalsData) ? 'fundamentals_endpoint' : (legacyPayload?.data?.fundamentals ? 'legacy_inline' : 'none'),
        identity_source: v2Data.name ? 'v2_summary' : mergedFundamentals?.companyName ? 'fundamentals' : governanceData?.universe?.name ? 'governance_universe' : (legacyPayload?.data?.name ? 'legacy_inline' : 'none'),
      },
      module_freshness: moduleFreshness,
    },
    metadata: {
      request: {
        ticker: v2Data.ticker,
        normalized_ticker: v2Data.ticker,
        effective_ticker: v2Data.ticker,
      },
      as_of: pageAsOf,
      source_chain: { primary: v2Meta?.provider, selected: v2Meta?.provider },
    },
    meta: {
      summary: v2Meta || null,
      historical: metaBundle?.historical || null,
      governance: metaBundle?.governance || null,
      fundamentals: metaBundle?.fundamentals || null,
      legacy: metaBundle?.legacy || null,
    },
    states: v2Data.states || {},
    decision: v2Data.decision || {},
    explanation: v2Data.explanation || {},
    v6: v2Data.decision?.v6 || null,
    evaluation_v4: governanceData?.evaluation_v4 || null,
    universe: governanceData?.universe || null,
    market_score: governanceData?.market_score || null,
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
    const v2 = await fetchV2StockPage(ticker);
    const gate = evaluateV2PromotionGate(v2, v2.data.legacy);
    if (!gate.promote) {
      window._rvFallbackLog.push({
        ts: new Date().toISOString(),
        ticker,
        from: 'v2',
        to: 'v1',
        error: `promotion_gate:${gate.reasons.join(',') || 'blocked'}`,
      });
      const res = await fetch('/api/stock?ticker=' + encodeURIComponent(ticker));
      const payload = await res.json();
      return { payload, source: 'v1_fallback' };
    }
    return {
      payload: transformV2ToStockShape(
        v2.data.summary,
        v2.meta.summary,
        v2.data.historical,
        v2.data.governance,
        v2.data.fundamentals,
        v2.meta,
        v2.data.legacy
      ),
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
