/**
 * RubikVault V2 Client Adapter
 * Uses the V2/V4 contract path only and returns typed empty state when incomplete.
 */

import { buildCanonicalMarketContext } from './stock-ssot.js';

const V2_TIMEOUT_MS = 15000;
const V2_RETRY_DELAYS_MS = [250, 750, 2000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableFetchError(error) {
  if (error?.name === 'AbortError') return true;
  const status = Number(error?.status || 0);
  return status >= 500;
}

async function fetchJsonWithTimeout(url, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < V2_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || V2_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: options.cache });
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt >= V2_RETRY_DELAYS_MS.length - 1 || !retryableFetchError(error)) throw error;
      await sleep(V2_RETRY_DELAYS_MS[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('fetch_failed');
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

export async function fetchPageCoreManifest() {
  return fetchJsonWithTimeout('/data/page-core/latest.json', { cache: 'no-store' });
}

export async function fetchPageCore(ticker) {
  const manifest = await fetchPageCoreManifest();
  const snapshotId = manifest?.snapshot_id || manifest?.run_id || Date.now();
  const payload = await fetchJsonWithTimeout(`/api/v2/page/${encodeURIComponent(ticker)}?v=${encodeURIComponent(snapshotId)}`);
  return {
    ok: payload?.ok === true,
    data: payload?.data || null,
    meta: payload?.meta || {},
    error: payload?.error || null,
    manifest,
    source: 'page_core',
  };
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

function isoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function strictPageCoreReasons(pageCore) {
  const reasons = [];
  const add = (reason) => {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };
  const marketStatsMin = pageCore?.market_stats_min && typeof pageCore.market_stats_min === 'object'
    ? pageCore.market_stats_min
    : null;
  const stats = marketStatsMin?.stats && typeof marketStatsMin.stats === 'object' ? marketStatsMin.stats : null;
  const latestBarDate = isoDate(marketStatsMin?.latest_bar_date || pageCore?.latest_bar_date || pageCore?.freshness?.as_of);
  const priceDate = isoDate(marketStatsMin?.price_date || latestBarDate);
  const statsDate = isoDate(marketStatsMin?.as_of || marketStatsMin?.stats_date || pageCore?.stats_date);
  const targetDate = isoDate(pageCore?.target_market_date);
  const freshness = String(pageCore?.freshness?.status || '').toLowerCase();
  if (pageCore?.ui_banner_state !== 'all_systems_operational'
    && String(pageCore?.status_contract?.stock_detail_view_status || '').toLowerCase() !== 'operational') {
    add('ui_banner_not_operational');
  }
  if (!marketStatsMin) add('missing_market_stats_basis');
  else {
    if (!stats || Object.keys(stats).length === 0) add('missing_market_stats_values');
    if (!marketStatsMin.price_source) add('missing_price_source');
    if (!marketStatsMin.stats_source) add('missing_stats_source');
    if (!latestBarDate) add('missing_latest_bar_date');
    if (!priceDate) add('missing_price_date');
    if (!statsDate) add('missing_stats_date');
    if (priceDate && latestBarDate && priceDate !== latestBarDate) add('price_latest_bar_date_mismatch');
    if (statsDate && latestBarDate && statsDate !== latestBarDate) add('stats_latest_bar_date_mismatch');
    if (Array.isArray(marketStatsMin.issues) && marketStatsMin.issues.length) add(`market_stats_issue:${marketStatsMin.issues[0]}`);
  }
  if (pageCore?.key_levels_ready !== true || marketStatsMin?.key_levels_ready === false) add('key_levels_not_ready');
  if (targetDate && (!latestBarDate || latestBarDate < targetDate)) add('bars_stale');
  if (['stale', 'expired', 'missing', 'last_good', 'error'].includes(freshness)) add(`freshness_${freshness}`);
  if (pageCore?.primary_blocker) add(`primary_blocker:${pageCore.primary_blocker}`);
  return reasons;
}

function pageCoreToSummary(pageCore) {
  const ticker = pageCore?.display_ticker || pageCore?.canonical_asset_id?.split(':')?.pop() || null;
  const asOf = pageCore?.freshness?.as_of || pageCore?.freshness?.generated_at?.slice?.(0, 10) || null;
  const close = Number.isFinite(Number(pageCore?.summary_min?.last_close)) ? Number(pageCore.summary_min.last_close) : null;
  const marketStatsMin = pageCore?.market_stats_min && typeof pageCore.market_stats_min === 'object' ? pageCore.market_stats_min : null;
  const marketStats = marketStatsMin?.stats && typeof marketStatsMin.stats === 'object'
    ? {
      stats: marketStatsMin.stats,
      as_of: marketStatsMin.as_of || asOf,
      source_provider: marketStatsMin.stats_source || 'page-core',
    }
    : { stats: {}, as_of: asOf, source_provider: 'missing' };
  const strictReasons = strictPageCoreReasons(pageCore);
  const pageCoreOperational = strictReasons.length === 0;
  const pipelineStatus = pageCoreOperational ? 'OK' : 'DEGRADED';
  const decisionVerdict = String(pageCore?.summary_min?.decision_verdict || '').toUpperCase();
  const verdict = ['BUY', 'WAIT', 'SELL', 'AVOID'].includes(decisionVerdict)
    ? decisionVerdict
    : (pageCoreOperational ? 'WAIT' : 'WAIT_PIPELINE_INCOMPLETE');
  const rawRiskLevel = String(pageCore?.summary_min?.risk_level || pageCore?.governance_summary?.risk_level || '').toUpperCase();
  const riskLevel = rawRiskLevel || 'UNKNOWN';
  const blockingReasons = Array.isArray(pageCore?.governance_summary?.blocking_reasons)
    ? pageCore.governance_summary.blocking_reasons
    : [];
  const effectiveBlockingReasons = pageCoreOperational
    ? []
    : [...strictReasons, pageCore?.primary_blocker, ...blockingReasons].filter(Boolean);
  const signalQuality = pageCoreOperational ? 'fresh' : 'suppressed';
  const latestBar = asOf && close != null ? {
    date: asOf,
    open: close,
    high: close,
    low: close,
    close,
    volume: null,
  } : null;
  const dailyDecision = {
    schema: 'rv.asset_daily_decision.v1',
    source: 'page-core',
    pipeline_status: pipelineStatus,
    verdict,
    blocking_reasons: effectiveBlockingReasons,
    risk_assessment: { level: riskLevel },
    signal_quality: signalQuality,
  };
  return {
    ticker,
    canonical_asset_id: pageCore?.canonical_asset_id || null,
    name: pageCore?.identity?.name || ticker,
    latest_bar: latestBar,
    market_prices: {
      ticker,
      date: marketStatsMin?.price_date || asOf,
      close,
      source_provider: marketStatsMin?.price_source || 'page-core',
    },
    market_stats: marketStats,
    change: {
      abs: pageCore?.summary_min?.daily_change_abs ?? null,
      pct: pageCore?.summary_min?.daily_change_pct ?? null,
      daily_change_abs: pageCore?.summary_min?.daily_change_abs ?? null,
      daily_change_pct: pageCore?.summary_min?.daily_change_pct ?? null,
    },
    decision: {
      verdict: pageCore?.summary_min?.decision_verdict || null,
      confidence_bucket: pageCore?.summary_min?.decision_confidence_bucket || null,
    },
    daily_decision: dailyDecision,
    analysis_readiness: {
      status: pageCoreOperational ? 'READY' : 'FAILED',
      source: 'page-core',
      decision_bundle_status: pageCoreOperational ? 'OK' : 'FAILED',
      decision_public_green: pageCoreOperational,
      signal_quality: signalQuality,
      blocking_reasons: effectiveBlockingReasons,
      warnings: pageCore?.governance_summary?.warnings || [],
    },
    module_freshness: {
      price_as_of: asOf,
      historical_as_of: asOf,
      market_stats_as_of: asOf,
    },
  };
}

function pageCoreToGovernance(pageCore) {
  return {
    ticker: pageCore?.display_ticker || null,
    canonical_asset_id: pageCore?.canonical_asset_id || null,
    universe: pageCore?.identity || null,
    market_score: null,
    evaluation_v4: null,
    governance_summary: pageCore?.governance_summary || null,
  };
}

function pageCoreToHistorical(pageCore) {
  const summary = pageCoreToSummary(pageCore);
  return {
    ticker: summary.ticker,
    bars: summary.latest_bar ? [summary.latest_bar] : [],
    indicators: [],
    breakout_v2: null,
    availability: { status: 'page_core_minimal', reason: 'Full history loads lazily.' },
  };
}

function pageCoreToHistoricalProfile(pageCore) {
  return {
    ticker: pageCore?.display_ticker || null,
    profile: null,
    regime: null,
    availability: { status: 'pending', reason: 'Historical profile loads lazily.' },
  };
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
    daily_decision: {
      pipeline_status: 'FAILED',
      verdict: 'WAIT_PIPELINE_INCOMPLETE',
      blocking_reasons: ['bundle_missing'],
      risk_assessment: { level: 'UNKNOWN' },
    },
    analysis_readiness: {
      status: 'FAILED',
      source: 'empty_state',
      blocking_reasons: ['bundle_missing'],
      warnings: [],
    },
    explanation: {},
    evaluation_v4: null,
    universe: null,
    market_score: null,
    error: null,
    _rv_source: 'empty_state',
  };
}

export async function fetchV2StockPage(ticker) {
  try {
    const pageCore = await fetchPageCore(ticker);
    if (pageCore?.ok && pageCore.data) {
      const summary = pageCoreToSummary(pageCore.data);
      const governance = pageCoreToGovernance(pageCore.data);
      const [historicalResult, historicalProfileResult, fundamentalsResult] = await Promise.all([
        settleModule(fetchV2Historical(ticker), 'v2_historical'),
        settleModule(fetchV2HistoricalProfile(ticker), 'v2_historical_profile'),
        settleModule(fetchFundamentals(ticker), 'fundamentals'),
      ]);
      const historical = historicalResult?.data || pageCoreToHistorical(pageCore.data);
      const historicalProfile = historicalProfileResult?.data || pageCoreToHistoricalProfile(pageCore.data);
      const fundamentals = fundamentalsResult?.data || null;
      const missingModules = moduleMissingKeys({
        summary: { data: summary },
        historical: historicalResult?.data ? historicalResult : { data: historical },
        governance: { data: governance },
        fundamentals: fundamentalsResult?.data ? fundamentalsResult : { data: fundamentals },
        historicalProfile: historicalProfileResult?.data ? historicalProfileResult : { data: historicalProfile },
      });
      return {
        ok: true,
        mode: missingModules.length ? 'page_core_hydrated_degraded' : 'page_core_hydrated',
        degraded: missingModules.length > 0,
        missingModules,
        notice: missingModules.length
          ? `Critical page data available (${missingModulesLabel(missingModules)} loading separately).`
          : null,
        data: {
          summary,
          historical,
          historical_profile: historicalProfile,
          governance,
          fundamentals,
          legacy: null,
        },
        meta: {
          summary: pageCore.meta || null,
          historical: historicalResult?.meta || { provider: 'page-core', status: 'fresh' },
          governance: pageCore.meta || null,
          fundamentals: fundamentalsResult?.meta || null,
          historical_profile: historicalProfileResult?.meta || { provider: 'page-core', status: 'pending' },
          legacy: null,
          page_core: pageCore.meta || null,
        },
      };
    }
    if (pageCore?.error?.code === 'INVALID_OR_UNMAPPED_TICKER') {
      return {
        ok: false,
        mode: 'unmapped',
        source: 'page_core',
        ticker,
        missingModules: ['page_core'],
        notice: pageCore.error?.message || 'Ticker is not mapped in page-core.',
        moduleErrors: { page_core: pageCore.error?.message || null },
      };
    }
  } catch {
    // Page-core is new infra; bridge falls back to old V2 path until latest.json exists in prod.
  }

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
  const coreContractOk = Boolean(
    summary?.data?.ticker
    || summary?.data?.name
    || summary?.data?.latest_bar
    || governance?.data?.universe
    || governance?.data?.governance_summary
  );

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

function deriveStatesFromMarketContext({ stats = {}, close = null, latestBar = null } = {}) {
  const price = Number.isFinite(Number(close)) ? Number(close) : Number(latestBar?.close ?? latestBar?.adjClose);
  const sma20 = Number(stats?.sma20);
  const sma50 = Number(stats?.sma50);
  const sma200 = Number(stats?.sma200);
  const rsi14 = Number(stats?.rsi14);
  const volPctile = Number(stats?.volatility_percentile);
  let trend = 'UNKNOWN';
  if (Number.isFinite(price) && Number.isFinite(sma20) && Number.isFinite(sma50) && Number.isFinite(sma200)) {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) trend = 'STRONG_UP';
    else if (price > sma50 && sma50 >= sma200) trend = 'UP';
    else if (price < sma20 && sma20 < sma50 && sma50 < sma200) trend = 'STRONG_DOWN';
    else if (price < sma50 && sma50 <= sma200) trend = 'DOWN';
    else trend = 'RANGE';
  }
  let momentum = 'UNKNOWN';
  if (Number.isFinite(rsi14)) {
    if (rsi14 < 30) momentum = 'OVERSOLD';
    else if (rsi14 < 45) momentum = 'BEARISH';
    else if (rsi14 <= 55) momentum = 'NEUTRAL';
    else if (rsi14 <= 70) momentum = 'BULLISH';
    else momentum = 'OVERBOUGHT';
  }
  let volatility = 'UNKNOWN';
  if (Number.isFinite(volPctile)) {
    volatility = volPctile >= 0.9 ? 'EXTREME' : volPctile >= 0.7 ? 'HIGH' : volPctile <= 0.25 ? 'LOW' : 'NORMAL';
  }
  return {
    trend,
    momentum,
    volatility,
    liquidity: Number(latestBar?.volume) > 0 ? 'ADEQUATE' : 'UNKNOWN',
    data_quality_state: 'OK',
  };
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
  const perAssetGateEnabled = learningGate?.per_asset_gate_enabled === true ||
    evaluation?.decision?.per_asset_gate_enabled === true ||
    summary?.decision?.per_asset_gate_enabled === true;
  const minimumNNotMet = !perAssetGateEnabled && Boolean(
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
  const derivedStates = deriveStatesFromMarketContext({ stats: marketStats?.stats || {}, close: marketPrices?.close, latestBar });
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
          key_levels_ready: canonicalMarket.consistency?.keyLevelsReady === true
            && Boolean(canonicalMarket.marketPrices)
            && Boolean(canonicalMarket.marketStats),
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
      daily_decision: v2Data.daily_decision || null,
      analysis_readiness: v2Data.analysis_readiness || null,
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
    states: Object.keys(v2Data.states || {}).length ? v2Data.states : derivedStates,
    decision: v2Data.decision || {},
    daily_decision: v2Data.daily_decision || null,
    analysis_readiness: v2Data.analysis_readiness || null,
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
