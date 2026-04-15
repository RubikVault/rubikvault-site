/**
 * RubikVault V2 Client Adapter
 * Uses the V2/V4 contract path only and returns typed empty state when incomplete.
 */

import { buildCanonicalMarketContext } from './stock-ssot.js';

const V2_TIMEOUT_MS = 15000;

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

export async function fetchV2HistoricalProfile(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/historical-profile`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 historical-profile response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2_historical_profile' };
}

export async function fetchFundamentals(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/fundamentals?ticker=${encodeURIComponent(ticker)}`);
  return { ok: true, data: payload?.data || null, meta: payload?.meta || payload?.metadata || null, source: 'fundamentals' };
}

function settleModule(promise, source) {
  return promise.catch((error) => ({
    ok: false,
    data: null,
    meta: {},
    source,
    error: error instanceof Error ? error.message : String(error || source),
  }));
}

function moduleMissingKeys({ summary, historical, governance, fundamentals, historicalProfile }) {
  return [
    !summary?.data?.ticker && 'summary',
    !(Array.isArray(historical?.data?.bars) || summary?.data?.latest_bar) && 'price_history',
    !governance?.data && 'governance',
    !fundamentals?.data && 'fundamentals',
    !historicalProfile?.data && 'historical_profile',
  ].filter(Boolean);
}

function missingModulesLabel(missingModules = []) {
  return missingModules.length ? missingModules.map((item) => item.replace(/_/g, ' ')).join(', ') : 'unknown';
}

function buildEmptyStatePayload(ticker) {
  return {
    data: {
      ticker,
      name: ticker,
      bars: [],
      market_prices: {},
      market_stats: { stats: {} },
      change: {},
      fundamentals: null,
      module_freshness: {},
    },
    metadata: {
      request: {
        ticker,
        normalized_ticker: ticker,
        effective_ticker: ticker,
      },
      as_of: null,
    },
    meta: {},
    states: {},
    decision: {},
    explanation: {},
    evaluation_v4: null,
    universe: null,
    market_score: null,
    error: null,
    _rv_source: 'empty_state',
  };
}

export async function fetchV2StockPage(ticker) {
  const [summary, historical, governance, fundamentals, historicalProfile] = await Promise.all([
    settleModule(fetchV2Summary(ticker), 'v2_summary'),
    settleModule(fetchV2Historical(ticker), 'v2_historical'),
    settleModule(fetchV2Governance(ticker), 'v2_governance'),
    settleModule(fetchFundamentals(ticker), 'fundamentals'),
    settleModule(fetchV2HistoricalProfile(ticker), 'v2_historical_profile'),
  ]);
  const latestHistoricalDate = historical?.data?.bars?.length
    ? historical.data.bars[historical.data.bars.length - 1]?.date
    : summary?.data?.latest_bar?.date || null;

  const missingModules = moduleMissingKeys({ summary, historical, governance, fundamentals, historicalProfile });
  const coreContractOk = Boolean(summary?.data?.ticker && governance?.data);

  if (!coreContractOk) {
    return {
      ok: false,
      mode: 'incomplete',
      source: 'v2',
      ticker,
      missingModules,
      notice: `V2 core modules incomplete (${missingModulesLabel(missingModules)}).`,
      moduleErrors: {
        summary: summary?.error || null,
        historical: historical?.error || null,
        governance: governance?.error || null,
        fundamentals: fundamentals?.error || null,
        historical_profile: historicalProfile?.error || null,
      },
    };
  }

  return {
    ok: true,
    mode: missingModules.length ? 'v2_degraded' : 'full',
    degraded: missingModules.length > 0,
    missingModules,
    notice: missingModules.length
      ? `Partial V2 data available (${missingModulesLabel(missingModules)}). Showing available modules.`
      : null,
    data: {
      summary: summary.data,
      historical: historical?.data || { ticker: summary.data.ticker, bars: summary?.data?.latest_bar ? [summary.data.latest_bar] : [], indicators: [], breakout_v2: null },
      historical_profile: historicalProfile?.data || {
        ticker: summary.data.ticker,
        profile: null,
        regime: null,
        availability: {
          status: 'pending',
          reason: 'Historical profile is still loading or has not been generated for this asset yet.',
        },
      },
      governance: governance.data,
      fundamentals: fundamentals?.data || null,
      legacy: null,
    },
    meta: {
      summary: summary.meta || null,
      historical: historical.meta || null,
      governance: governance.meta || null,
      fundamentals: fundamentals?.meta || null,
      historical_profile: historicalProfile?.meta || null,
      legacy: null,
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
  const typedStatus = String(doc?.typed_status || '').toUpperCase();
  if (typedStatus === 'OUT_OF_SCOPE' || typedStatus === 'NOT_APPLICABLE') return 2;
  if (typedStatus === 'UPDATING') return 0;
  const keys = ['marketCap', 'pe_ttm', 'eps_ttm', 'dividendYield', 'sector', 'industry', 'companyName', 'nextEarningsDate'];
  return keys.filter((key) => doc[key] != null && doc[key] !== '').length;
}

function toIsoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isMeaningfulIdentityName(name, ticker) {
  const label = typeof name === 'string' ? name.trim() : '';
  const symbol = String(ticker || '').trim().toUpperCase();
  return Boolean(label) && label.toUpperCase() !== symbol;
}

function pickIdentityName({ ticker, summaryName, fundamentalsName, universeName }) {
  const candidates = [summaryName, fundamentalsName, universeName];
  for (const candidate of candidates) {
    if (isMeaningfulIdentityName(candidate, ticker)) return String(candidate).trim();
  }
  return ticker || null;
}

function hasMeaningfulIdentity({ ticker, summaryName, fundamentalsName, universeName }) {
  return [summaryName, fundamentalsName, universeName].some((candidate) => isMeaningfulIdentityName(candidate, ticker));
}

function dateLagDays(olderValue, newerValue) {
  const older = toIsoDate(olderValue);
  const newer = toIsoDate(newerValue);
  if (!older || !newer) return null;
  const ms = Date.parse(`${newer}T00:00:00Z`) - Date.parse(`${older}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null;
}

function buildModuleFreshnessMap(v2) {
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
  };
}

export function evaluateV2PromotionGate(v2) {
  const summary = v2?.data?.summary || {};
  const governance = v2?.data?.governance || {};
  const fundamentals = v2?.data?.fundamentals || null;
  const evaluation = governance?.evaluation_v4 || {};
  const moduleFreshness = buildModuleFreshnessMap(v2);
  const latestHistoricalDate = moduleFreshness.historical_as_of;
  const summaryPriceDate = toIsoDate(summary?.market_prices?.date);
  const summaryProvider = String(summary?.market_prices?.source_provider || '').toLowerCase();
  const learningGate = evaluation?.decision?.learning_gate || summary?.decision?.learning_gate || null;
  const learningStatus = String(learningGate?.learning_status || evaluation?.decision?.learning_status || summary?.decision?.learning_status || '').toUpperCase();
  const minimumNNotMet = Boolean(
    learningGate?.minimum_n_not_met === true ||
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
  if (!hasMeaningfulIdentity({
    ticker: summary?.ticker,
    summaryName: summary?.name,
    fundamentalsName: fundamentals?.companyName,
    universeName: governance?.universe?.name,
  })) reasons.push('identity_incomplete');
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
  const fundamentalsTypedStatus = String(fundamentals?.typed_status || '').toUpperCase();
  const fundamentalsNeutral = fundamentalsTypedStatus === 'OUT_OF_SCOPE' || fundamentalsTypedStatus === 'NOT_APPLICABLE';
  if (!isEtf && !fundamentalsNeutral && countMeaningfulFundamentals(fundamentals) < 2) reasons.push('fundamentals_incomplete');

  const warningOnlyReasons = new Set([
    'learning_bootstrap',
    'minimum_n_not_met',
    'fundamentals_incomplete',
    'summary_market_stats_incomplete',
    'identity_incomplete',
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
      has_identity: hasMeaningfulIdentity({
        ticker: summary?.ticker,
        summaryName: summary?.name,
        fundamentalsName: fundamentals?.companyName,
        universeName: governance?.universe?.name,
      }),
      is_etf: isEtf,
    },
  };
}

function pickLatestMarketPrices(summaryPrices, latestBar) {
  const barPrices = latestBar ? {
    ticker: null,
    date: latestBar.date || null,
    close: latestBar.close ?? null,
    open: latestBar.open ?? null,
    high: latestBar.high ?? null,
    low: latestBar.low ?? null,
    volume: latestBar.volume ?? null,
  } : null;
  const candidates = [summaryPrices, barPrices].filter(Boolean);
  candidates.sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));
  return candidates[0] || summaryPrices || {};
}

export function transformV2ToStockShape(v2Data, v2Meta, historicalData = null, governanceData = null, fundamentalsData = null, metaBundle = null, legacyPayload = null, historicalProfileData = null) {
  const bars = historicalData?.bars || (v2Data.latest_bar ? [v2Data.latest_bar] : []);
  const latestBar = historicalData?.bars?.length ? historicalData.bars[historicalData.bars.length - 1] : v2Data.latest_bar;
  const canonicalMarket = buildCanonicalMarketContext({
    ticker: v2Data.ticker,
    summaryPrices: v2Data.market_prices || null,
    summaryStats: hasMeaningfulMarketStats(v2Data.market_stats) ? v2Data.market_stats : null,
    historicalBars: bars,
    historicalIndicators: historicalData?.indicators || null,
    legacyPrices: null,
    legacyStats: null,
  });
  const marketPrices = canonicalMarket.marketPrices || pickLatestMarketPrices(v2Data.market_prices || {}, latestBar);
  const marketStats = canonicalMarket.marketStats || (hasMeaningfulMarketStats(v2Data.market_stats) ? v2Data.market_stats : (v2Data.market_stats || {}));
  const mergedFundamentals = isMeaningfulFundamentals(fundamentalsData) ? fundamentalsData : (fundamentalsData || null);
  const pageAsOf = marketPrices?.date || latestBar?.date || v2Meta?.data_date || null;
  const moduleFreshness = {
    ...(v2Data?.module_freshness || {}),
    price_as_of: marketPrices?.date || null,
    historical_as_of: latestBar?.date || null,
    market_stats_as_of: marketStats?.as_of || latestBar?.date || null,
    scientific_as_of: governanceData?.evaluation_v4?.input_states?.scientific?.as_of || null,
    forecast_as_of: governanceData?.evaluation_v4?.input_states?.forecast?.as_of || null,
    quantlab_as_of: governanceData?.evaluation_v4?.input_states?.quantlab?.as_of || null,
    fundamentals_as_of: mergedFundamentals?.updatedAt || metaBundle?.fundamentals?.asOf || null,
    historical_profile_as_of: historicalProfileData?.profile?.latest_date || historicalProfileData?.regime?.date || null,
  };
  const displayName = pickIdentityName({
    ticker: v2Data.ticker,
    summaryName: v2Data.name,
    fundamentalsName: mergedFundamentals?.companyName,
    universeName: governanceData?.universe?.name,
  });
  const historicalProfile = historicalProfileData || {
    ticker: v2Data.ticker,
    profile: null,
    regime: null,
    availability: {
      status: 'pending',
      reason: 'Historical profile is still loading or has not been generated for this asset yet.',
    },
  };
  const catalysts = v2Data?.catalysts
    || (Array.isArray(mergedFundamentals?.confirmedCatalysts) || mergedFundamentals?.nextEarningsDate
      ? {
        status: Array.isArray(mergedFundamentals?.confirmedCatalysts) && mergedFundamentals.confirmedCatalysts.length > 0 ? 'confirmed' : (mergedFundamentals?.nextEarningsDate ? 'estimated' : 'unavailable'),
        next_earnings_date: mergedFundamentals?.nextEarningsDate || null,
        items: mergedFundamentals?.confirmedCatalysts || [],
      }
      : null);
  return {
    data: {
      ticker: v2Data.ticker,
      name: displayName,
      bars,
      market_prices: marketPrices,
      market_stats: marketStats,
      change: v2Data.change || {},
      breakout_v2: historicalData?.breakout_v2 || null,
      fundamentals: mergedFundamentals,
      catalysts,
      historical_profile: historicalProfile,
      ssot: {
        market_context: {
          issues: canonicalMarket.consistency?.issues || [],
          use_historical_basis: Boolean(canonicalMarket.usedHistoricalBasis),
          key_levels_ready: canonicalMarket.consistency?.keyLevelsReady !== false,
          prices_source: canonicalMarket.sources?.prices || null,
          stats_source: canonicalMarket.sources?.stats || null,
          price_date: marketPrices?.date || null,
          stats_date: marketStats?.as_of || null,
          latest_bar_date: latestBar?.date || null,
        },
        historical_profile: {
          status: historicalProfile?.availability?.status || 'pending',
          reason: historicalProfile?.availability?.reason || null,
          profile_as_of: historicalProfile?.profile?.latest_date || null,
          regime_as_of: historicalProfile?.regime?.date || null,
        },
      },
      source_provenance: {
        market_stats_source: hasMeaningfulMarketStats(v2Data.market_stats) ? 'v2_summary' : 'none',
        fundamentals_source: isMeaningfulFundamentals(fundamentalsData) ? 'fundamentals_endpoint' : 'none',
        identity_source: isMeaningfulIdentityName(v2Data.name, v2Data.ticker) ? 'v2_summary' : isMeaningfulIdentityName(mergedFundamentals?.companyName, v2Data.ticker) ? 'fundamentals' : isMeaningfulIdentityName(governanceData?.universe?.name, v2Data.ticker) ? 'governance_universe' : 'none',
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
      legacy: null,
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
 * Fetch with V2-first, empty-state-on-failure strategy.
 * @param {string} ticker
 * @returns {Promise<{payload:object, source:string, mode:string, notice:string|null, missingModules:string[]}>}
 */
export async function fetchWithFallback(ticker) {
  const logTarget = typeof window !== 'undefined' ? window : globalThis;
  logTarget._rvFallbackLog = logTarget._rvFallbackLog || [];

  let v2Error = null;
  try {
    const v2 = await fetchV2StockPage(ticker);
    if (v2?.ok) {
      logTarget._rvFallbackLog.push({ ticker, source: 'v2', mode: v2.mode, missingModules: v2.missingModules || [] });
      return {
        payload: transformV2ToStockShape(
          v2.data.summary,
          v2.meta.summary,
          v2.data.historical,
          v2.data.governance,
          v2.data.fundamentals,
          v2.meta,
          null,
          v2.data.historical_profile,
        ),
        source: 'v2',
        mode: v2.mode || 'full',
        notice: v2.notice || null,
        missingModules: v2.missingModules || [],
      };
    }
    v2Error = v2;
  } catch (error) {
    v2Error = {
      ok: false,
      mode: 'unavailable',
      source: 'v2',
      ticker,
      missingModules: [],
      notice: error instanceof Error ? error.message : String(error || 'V2 unavailable'),
      error,
    };
  }

  const missingModules = v2Error?.missingModules || [];
  logTarget._rvFallbackLog.push({ ticker, source: 'none', mode: 'empty_state', missingModules });
  return {
    payload: buildEmptyStatePayload(ticker),
    source: 'none',
    mode: 'empty_state',
    notice: `V2 contract unavailable or incomplete (${missingModulesLabel(missingModules)}). Legacy fallback is disabled for this page.`,
    missingModules,
  };
}
