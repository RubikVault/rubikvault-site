/**
 * RubikVault V2 Client Adapter
 * Uses the V2/V4 contract path only and returns typed empty state when incomplete.
 */

import { buildCanonicalMarketContext } from './stock-ssot.js?v=20260514-pagecore-price';

const V2_TIMEOUT_MS = 15000;
const V2_RETRY_DELAYS_MS = [250, 750, 2000];
const US_MARKET_HOLIDAYS_2026 = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
const PAGE_CORE_MAX_STALE_TRADING_DAYS = 2;

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
  const routeTicker = routeTickerForAsset(ticker);
  const tickerPath = encodeURIComponent(routeTicker).replace(/%3A/gi, ':');
  const params = new URLSearchParams();
  params.set('v', String(snapshotId));
  const assetId = canonicalAssetId(ticker);
  if (assetId) params.set('asset_id', assetId);
  const payload = await fetchJsonWithTimeout(`/api/v2/page/${tickerPath}?${params.toString()}`);
  return {
    ok: payload?.ok === true,
    data: payload?.data || null,
    meta: payload?.meta || {},
    error: payload?.error || null,
    manifest,
    source: 'page_core',
  };
}

function canonicalAssetQuery(ticker, extraParams = {}) {
  const params = new URLSearchParams();
  const assetId = canonicalAssetId(ticker);
  if (assetId) params.set('asset_id', assetId);
  for (const [key, value] of Object.entries(extraParams || {})) {
    const normalized = String(value || '').trim();
    if (normalized) params.set(key, normalized);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function requestedAssetIdOverride() {
  if (typeof window === 'undefined') return null;
  try {
    const value = String(new URLSearchParams(window.location.search || '').get('asset_id') || '').trim().toUpperCase();
    return /^[A-Z0-9_.-]+:[A-Z0-9_.-]+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function canonicalAssetId(ticker) {
  const override = requestedAssetIdOverride();
  if (override) return override;
  const assetId = String(ticker || '').trim().toUpperCase();
  if (/^[A-Z0-9_.-]+:[A-Z0-9_.-]+$/.test(assetId)) return assetId;
  const dot = assetId.match(/^([A-Z0-9_-]+)\.([A-Z0-9_-]{2,8})$/);
  return dot ? `${dot[2]}:${dot[1]}` : null;
}

function routeTickerForAsset(ticker) {
  const value = String(ticker || '').trim().toUpperCase();
  if (/^[A-Z0-9_.-]+:[A-Z0-9_.-]+$/.test(value)) return value;
  const dot = value.match(/^([A-Z0-9_-]+)\.([A-Z0-9_-]{2,8})$/);
  if (dot) return dot[1];
  return value;
}

function hasRenderableBars(data, minBars = 3) {
  return Array.isArray(data?.bars) && data.bars.length >= minBars;
}

export async function fetchV2Historical(ticker, options = {}) {
  const routeTicker = routeTickerForAsset(ticker);
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(routeTicker)}/historical${canonicalAssetQuery(ticker, {
    target_market_date: options?.targetMarketDate || options?.target_market_date,
  })}`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 historical response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2_historical' };
}

export async function fetchStockApiPayload(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/stock?ticker=${encodeURIComponent(ticker)}`, {
    cache: 'no-store',
    timeoutMs: 12000,
  });
  if (!payload?.ok || !payload?.data) throw new Error(payload?.error?.message || 'Stock API response not ok');
  return { ok: true, data: payload, meta: payload.metadata || payload.meta || {}, source: 'stock_api' };
}

export async function fetchV2Governance(ticker) {
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(ticker)}/governance`);
  if (!payload.ok) throw new Error(payload.error?.message || 'V2 governance response not ok');
  return { ok: true, data: payload.data, meta: payload.meta, source: 'v2_governance' };
}

export async function fetchV2HistoricalProfile(ticker, options = {}) {
  const routeTicker = routeTickerForAsset(ticker);
  const payload = await fetchJsonWithTimeout(`/api/v2/stocks/${encodeURIComponent(routeTicker)}/historical-profile${canonicalAssetQuery(ticker, {
    target_market_date: options?.targetMarketDate || options?.target_market_date,
  })}`);
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

function settleOptionalModuleWithBudget(promise, source, timeoutMs = 4500) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      ok: false,
      data: null,
      meta: {},
      source,
      error: `optional_module_timeout_${timeoutMs}ms`,
    }), timeoutMs);
  });
  return Promise.race([settleModule(promise, source), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function materialPriceMismatch(a, b) {
  const left = finiteNumber(a);
  const right = finiteNumber(b);
  if (left == null || right == null || left <= 0 || right <= 0) return false;
  const diff = Math.abs(left - right);
  return diff > Math.max(0.01, Math.abs(left) * 0.001);
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isUsTradingDay(value) {
  const iso = isoDate(value);
  if (!iso || US_MARKET_HOLIDAYS_2026.has(iso)) return false;
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function tradingDaysBetween(olderValue, newerValue) {
  const older = isoDate(olderValue);
  const newer = isoDate(newerValue);
  if (!older || !newer) return null;
  if (newer <= older) return 0;
  let count = 0;
  const cursor = new Date(`${older}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (isoDay(cursor) <= newer) {
    if (isUsTradingDay(isoDay(cursor))) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// SSOT: functions/api/_shared/return-units.js — client keeps inline copy as defense-in-depth
// (browser cannot import from functions/api/_shared; server normalizes at write-time,
// client re-normalizes idempotently for legacy data or CDN-cached bundles)
export function normalizeReturnDecimal({ pct = null, abs = null, close = null } = {}) {
  const raw = finiteNumber(pct);
  if (raw == null) return { value: null, status: 'missing', reason: 'return missing' };
  const absChange = finiteNumber(abs);
  const lastClose = finiteNumber(close);
  if (absChange != null && lastClose != null) {
    const prevClose = lastClose - absChange;
    if (prevClose > 0) {
      const expected = absChange / prevClose;
      if (Math.abs(raw - expected) <= 0.0005) {
        return { value: Number(expected.toFixed(8)), status: 'ok', reason: null, expected };
      }
      if (Math.abs((raw / 100) - expected) <= 0.0005) {
        return { value: Number(expected.toFixed(8)), status: 'normalized_percent_unit', reason: 'daily_change_pct percent-unit normalized to decimal', raw, expected };
      }
      return { value: raw, status: 'mismatch', reason: 'daily_change_pct mismatches daily_change_abs and last_close', raw, expected };
    }
  }
  return { value: raw, status: Math.abs(raw) > 1 ? 'implausible' : 'ok', reason: Math.abs(raw) > 1 ? 'return plausibility failed' : null };
}

function normalizeChangeObject(change = {}, close = null) {
  const result = normalizeReturnDecimal({
    pct: change?.pct ?? change?.daily_change_pct,
    abs: change?.abs ?? change?.daily_change_abs,
    close,
  });
  return {
    ...change,
    pct: result.value,
    daily_change_pct: result.value,
    _rv_return_integrity: result,
  };
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
  const lagTradingDays = latestBarDate && targetDate ? tradingDaysBetween(latestBarDate, targetDate) : null;
  const latestBarFreshEnough = lagTradingDays != null && lagTradingDays <= PAGE_CORE_MAX_STALE_TRADING_DAYS;
  const primaryBlocker = String(pageCore?.primary_blocker || '');
  const historicalProfileStatus = String(pageCore?.status_contract?.historical_profile_status || pageCore?.status_contract?.hist_profile_status || '').toLowerCase();
  const modelCoverageStatus = String(pageCore?.status_contract?.model_coverage_status || pageCore?.model_coverage?.status || '').toLowerCase();
  const claimsNonOperational = pageCore?.ui_banner_state !== 'all_systems_operational'
    && String(pageCore?.status_contract?.stock_detail_view_status || '').toLowerCase() !== 'operational';
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
  if (targetDate && (!latestBarDate || (!latestBarFreshEnough && latestBarDate < targetDate))) add('bars_stale');
  if (['stale', 'expired', 'missing', 'last_good', 'error'].includes(freshness) && !latestBarFreshEnough) add(`freshness_${freshness}`);
  if (primaryBlocker && !(primaryBlocker === 'bars_stale' && latestBarFreshEnough)) add(`primary_blocker:${primaryBlocker}`);
  if (!['ready', 'available', 'available_via_endpoint', 'not_applicable'].includes(historicalProfileStatus)) add('historical_profile_not_ready');
  if (!['complete', 'ready', 'not_applicable'].includes(modelCoverageStatus)) add('model_coverage_incomplete');
  if (claimsNonOperational && reasons.length > 0) add('ui_banner_not_operational');
  return reasons;
}

function pageCoreToSummary(pageCore) {
  const ticker = pageCore?.display_ticker || pageCore?.canonical_asset_id?.split(':')?.pop() || null;
  const asOf = pageCore?.freshness?.as_of || pageCore?.freshness?.generated_at?.slice?.(0, 10) || null;
  const close = Number.isFinite(Number(pageCore?.summary_min?.last_close)) ? Number(pageCore.summary_min.last_close) : null;
  const normalizedChange = normalizeChangeObject({
    abs: pageCore?.summary_min?.daily_change_abs ?? null,
    pct: pageCore?.summary_min?.daily_change_pct ?? null,
    daily_change_abs: pageCore?.summary_min?.daily_change_abs ?? null,
    daily_change_pct: pageCore?.summary_min?.daily_change_pct ?? null,
  }, close);
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
  const verdict = ['BUY', 'WAIT', 'SELL', 'AVOID', 'UNAVAILABLE', 'INCUBATING'].includes(decisionVerdict)
    ? decisionVerdict
    : 'UNAVAILABLE';
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
      ...normalizedChange,
      abs: pageCore?.summary_min?.daily_change_abs ?? null,
      daily_change_abs: pageCore?.summary_min?.daily_change_abs ?? null,
    },
    breakout_v12: pageCoreToBreakoutV12(pageCore),
    breakout_v2: null,
    breakout_v2_legacy: null,
    decision: {
      verdict: pageCore?.summary_min?.decision_verdict || pageCore?.decision_core_min?.decision?.primary_action || null,
      confidence_bucket: pageCore?.summary_min?.decision_confidence_bucket || null,
      analysis_reliability: pageCore?.summary_min?.decision_analysis_reliability || pageCore?.decision_core_min?.decision?.analysis_reliability || null,
      wait_subtype: pageCore?.summary_min?.decision_wait_subtype || pageCore?.decision_core_min?.decision?.wait_subtype || null,
      primary_setup: pageCore?.summary_min?.decision_primary_setup || pageCore?.decision_core_min?.decision?.primary_setup || null,
      max_entry_price: pageCore?.summary_min?.decision_max_entry_price ?? pageCore?.decision_core_min?.trade_guard?.max_entry_price ?? null,
      invalidation_level: pageCore?.summary_min?.decision_invalidation_level ?? pageCore?.decision_core_min?.trade_guard?.invalidation_level ?? null,
    },
    decision_core_min: pageCore?.decision_core_min || null,
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
    page_core_contract: {
      coverage: pageCore?.coverage || null,
      status_contract: pageCore?.status_contract || null,
      ui_banner_state: pageCore?.ui_banner_state || null,
      primary_blocker: pageCore?.primary_blocker || null,
    },
    module_freshness: {
      price_as_of: asOf,
      historical_as_of: asOf,
      market_stats_as_of: asOf,
    },
  };
}

function pageCoreToGovernance(pageCore) {
  const reason = 'evaluation_inputs_unavailable';
  const targetAsOf = pageCore?.target_market_date || pageCore?.freshness?.as_of || null;
  const coverage = pageCore?.coverage || {};
  const contract = pageCore?.status_contract || {};
  const statusFrom = (value) => String(value || '').trim().toLowerCase();
  const modelStates = pageCore?.model_coverage?.states || {};
  const okState = (status, fallbackReason, okValues = ['available', 'ready', 'operational', 'ok']) => {
    const normalized = statusFrom(status);
    if (okValues.includes(normalized)) return { status: 'ok', as_of: targetAsOf };
    if (normalized === 'not_applicable') return { status: 'not_applicable', as_of: targetAsOf, reason: fallbackReason || 'not_applicable' };
    return null;
  };
  const forecastState = okState(contract.forecast_status || coverage.forecast_status || modelStates.forecast?.status || (coverage.forecast ? 'available' : null), modelStates.forecast?.reason || 'forecast_not_applicable')
    || { status: 'unavailable', reason: 'forecast_unavailable' };
  const scientificState = okState(contract.scientific_status || coverage.scientific_status || modelStates.scientific?.status, modelStates.scientific?.reason || 'scientific_not_applicable')
    || { status: 'unavailable', reason: 'scientific_unavailable' };
  const quantlabState = okState(contract.quantlab_status || coverage.quantlab_status || modelStates.quantlab?.status, modelStates.quantlab?.reason || 'quantlab_not_applicable')
    || { status: 'unavailable', reason: 'quantlab_unavailable' };
  const inputStates = [forecastState, scientificState, quantlabState];
  const required = inputStates.filter((state) => state.status !== 'not_applicable');
  const available = required.filter((state) => state.status === 'ok').length;
  const complete = required.length === 0 || available >= required.length;
  return {
    ticker: pageCore?.display_ticker || null,
    canonical_asset_id: pageCore?.canonical_asset_id || null,
    universe: pageCore?.identity || null,
    market_score: null,
    evaluation_v4: {
      status: complete ? 'ready' : available > 0 ? 'partial_model_inputs' : 'not_built_at_request_time',
      availability: {
        status: complete ? 'ready' : (available > 0 ? 'partial' : 'not_built_at_request_time'),
        reason: complete ? null : reason,
        ui_renderable: complete || available > 0,
      },
      input_states: {
        quantlab: quantlabState,
        forecast: forecastState,
        scientific: scientificState,
      },
      v4_contract: {},
      decision: null,
    },
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
    availability: {
      status: 'page_core_minimal',
      reason: 'Full historical bars are unavailable; page-core can only provide a one-row latest-price fallback.',
      ui_renderable: false,
    },
  };
}

function pageCoreToBreakoutV12(pageCore) {
  const summary = pageCore?.breakout_summary && typeof pageCore.breakout_summary === 'object'
    ? pageCore.breakout_summary
    : null;
  if (!summary) return null;
  const rawState = String(summary.breakout_status || summary.status || summary.label || '').trim();
  const legacyState = String(summary.legacy_state || rawState || '').trim().toUpperCase();
  const breakoutStatus = rawState || (legacyState === 'SETUP' ? 'RIGHT_SIDE_BASE' : 'not_generated');
  const responseStatus = breakoutStatus && !/^not_generated$/i.test(breakoutStatus)
    ? 'ok'
    : 'not_in_current_signal_set';
  return {
    ...summary,
    source: 'page_core_breakout_summary',
    breakout_status: breakoutStatus,
    status: responseStatus,
    label: legacyState || breakoutStatus,
    legacy_state: legacyState || breakoutStatus,
    reason: summary.status_explanation || summary.reason || null,
  };
}

function stockApiToHistorical(stockApiPayload, fallbackTicker = null) {
  const stockData = stockApiPayload?.data || {};
  const bars = Array.isArray(stockData.bars) ? stockData.bars : [];
  if (bars.length < 3) return null;
  return {
    ticker: stockData.ticker || fallbackTicker,
    bars,
    indicators: Array.isArray(stockData.indicators) ? stockData.indicators : [],
    breakout_v12: stockData.breakout_v12 || null,
    breakout_v2: stockData.breakout_v2 || null,
    breakout_v2_legacy: stockData.breakout_v2_legacy || null,
    availability: {
      status: 'stock_api_history',
      reason: 'Full historical bars served from the stock API public history projection.',
      ui_renderable: true,
    },
  };
}

function pageCoreToHistoricalProfile(pageCore) {
  const summary = pageCore?.historical_profile_summary && typeof pageCore.historical_profile_summary === 'object'
    ? pageCore.historical_profile_summary
    : null;
  if (summary?.events && Object.keys(summary.events).length > 0) {
    return {
      ticker: pageCore?.display_ticker || summary.ticker || null,
      profile: {
        latest_date: summary.latest_date || pageCore?.target_market_date || null,
        bars_count: summary.bars_count ?? null,
        events: summary.events,
      },
      regime: summary.regime || null,
      availability: { status: 'ready', reason: null },
    };
  }
  return {
    ticker: pageCore?.display_ticker || null,
    profile: null,
    regime: null,
    availability: {
      status: pageCore?.status_contract?.historical_profile_status || 'not_generated',
      reason: 'Historical profile has not been generated for this asset yet.',
    },
  };
}

function optionalHydrationEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('rv_optional') === '0' || window.__RV_DISABLE_OPTIONAL_HYDRATION === true) return false;
    return params.get('rv_optional') === '1';
  } catch {
    return false;
  }
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
      verdict: 'UNAVAILABLE',
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
      const shouldHydrateOptional = optionalHydrationEnabled();
      const targetMarketDate = String(pageCore.data?.target_market_date || pageCore.meta?.data_date || '').slice(0, 10);
      const shouldHydrateHistorical = shouldHydrateOptional;
      const shouldHydrateHistoricalProfile = shouldHydrateOptional
        && String(pageCore.data?.status_contract?.historical_profile_status || '').toLowerCase() === 'available_via_endpoint';
      const [stockApiResult, historicalResult, historicalProfileResult, fundamentalsResult] = await Promise.all([
        shouldHydrateOptional
          ? settleOptionalModuleWithBudget(fetchStockApiPayload(ticker), 'stock_api', 12000)
          : Promise.resolve({ ok: false, data: null, meta: {}, source: 'stock_api', error: 'optional_hydration_disabled' }),
        shouldHydrateHistorical
          ? settleOptionalModuleWithBudget(fetchV2Historical(ticker, { targetMarketDate }), 'v2_historical')
          : Promise.resolve({ ok: false, data: null, meta: {}, source: 'v2_historical', error: 'optional_hydration_disabled' }),
        shouldHydrateHistoricalProfile
          ? settleOptionalModuleWithBudget(fetchV2HistoricalProfile(ticker, { targetMarketDate }), 'v2_historical_profile')
          : Promise.resolve({ ok: false, data: null, meta: {}, source: 'v2_historical_profile', error: 'optional_hydration_disabled' }),
        shouldHydrateOptional
          ? settleOptionalModuleWithBudget(fetchFundamentals(ticker), 'fundamentals')
          : Promise.resolve({ ok: false, data: null, meta: {}, source: 'fundamentals', error: 'optional_hydration_disabled' }),
      ]);
      const stockApiPayload = stockApiResult?.data || null;
      const stockApiData = stockApiPayload?.data || null;
      const stockApiHistorical = stockApiToHistorical(stockApiPayload, summary.ticker);
      const pageCoreHistorical = pageCoreToHistorical(pageCore.data);
      const pageCoreBreakout = pageCoreToBreakoutV12(pageCore.data);
      const historicalBase = hasRenderableBars(stockApiHistorical)
        ? stockApiHistorical
        : hasRenderableBars(historicalResult?.data)
          ? historicalResult.data
          : stockApiHistorical || historicalResult?.data || pageCoreHistorical;
      const historical = {
        ...historicalBase,
        breakout_v12: pageCoreBreakout || historicalBase?.breakout_v12 || stockApiData?.breakout_v12 || null,
        breakout_v2: historicalBase?.breakout_v2 || stockApiData?.breakout_v2 || null,
        breakout_v2_legacy: historicalBase?.breakout_v2_legacy || stockApiData?.breakout_v2_legacy || null,
      };
      const historicalProfile = stockApiData?.historical_profile || historicalProfileResult?.data || pageCoreToHistoricalProfile(pageCore.data);
      const fundamentals = stockApiData?.fundamentals || fundamentalsResult?.data || null;
      const missingModules = moduleMissingKeys({
        summary: { data: summary },
        historical: stockApiHistorical ? { data: historical } : (historicalResult?.data ? historicalResult : { data: historical }),
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
          historical: stockApiHistorical
            ? { ...(stockApiResult?.meta || {}), provider: 'stock_api', status: 'fresh' }
            : (historicalResult?.meta || { provider: 'page-core', status: 'fresh' }),
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
    const stackBullish = sma20 > sma50 && sma50 > sma200;
    const stackBearish = sma20 < sma50 && sma50 < sma200;
    if (stackBullish && price > sma20) trend = 'STRONG_UP';
    else if (stackBullish && price > sma200) trend = 'UP';
    else if (stackBullish) trend = 'RANGE';
    else if (stackBearish && price < sma20) trend = 'STRONG_DOWN';
    else if (stackBearish && price < sma200) trend = 'DOWN';
    else if (stackBearish) trend = 'RANGE';
    else trend = 'RANGE';
  }
  let momentum = 'UNKNOWN';
  if (Number.isFinite(rsi14)) {
    const macdHist = Number(stats?.macd_hist);
    if (rsi14 >= 80) momentum = 'OVERBOUGHT';
    else if (rsi14 <= 20) momentum = 'OVERSOLD';
    else if (rsi14 >= 60 || (rsi14 >= 50 && Number.isFinite(macdHist) && macdHist > 0)) momentum = 'BULLISH';
    else if (rsi14 <= 40 || (rsi14 <= 50 && Number.isFinite(macdHist) && macdHist < 0)) momentum = 'BEARISH';
    else momentum = 'NEUTRAL';
  }
  let volatility = 'UNKNOWN';
  if (Number.isFinite(volPctile)) {
    const normalizedVolPctile = volPctile <= 1 ? volPctile * 100 : volPctile;
    volatility = normalizedVolPctile > 90 ? 'EXTREME' : normalizedVolPctile > 75 ? 'HIGH' : normalizedVolPctile < 10 ? 'COMPRESSED' : normalizedVolPctile < 25 ? 'LOW' : 'NORMAL';
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
  const decisionCoreMin = v2Data?.decision_core_min || null;
  const historicalBars = Array.isArray(historicalData?.bars) ? historicalData.bars : [];
  const summaryPriceDate = toIsoDate(v2Data?.market_prices?.date);
  const historicalLatestDate = historicalBars.length ? toIsoDate(historicalBars[historicalBars.length - 1]?.date) : null;
  const summaryProvider = String(v2Data?.market_prices?.source_provider || '').toLowerCase();
  const summaryHasPageCoreBasis = Boolean(
    summaryPriceDate
    && (
      decisionCoreMin
      || v2Data?.page_core_contract
      || v2Data?.canonical_asset_id
      || ['page-core', 'page_core', 'historical-bars'].includes(summaryProvider)
    )
  );
  const summaryClose = finiteNumber(v2Data?.market_prices?.close);
  const historicalLatestClose = historicalBars.length ? finiteNumber(historicalBars[historicalBars.length - 1]?.close ?? historicalBars[historicalBars.length - 1]?.adjClose) : null;
  const historicalBarsPriceCompatible = !summaryHasPageCoreBasis || !materialPriceMismatch(summaryClose, historicalLatestClose);
  const historicalBarsCurrentEnough = Boolean(
    historicalBars.length
    && historicalBarsPriceCompatible
    && (!summaryPriceDate
      || !historicalLatestDate
      || (summaryHasPageCoreBasis ? historicalLatestDate === summaryPriceDate : historicalLatestDate >= summaryPriceDate))
  );
  const bars = historicalBarsCurrentEnough ? historicalBars : (v2Data.latest_bar ? [v2Data.latest_bar] : []);
  const latestBar = bars.length ? bars[bars.length - 1] : v2Data.latest_bar;
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
  const normalizedChange = normalizeChangeObject(v2Data.change || {}, marketPrices?.close ?? latestBar?.close ?? null);
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
  const assetClass = String(governanceData?.universe?.asset_class || governanceData?.universe?.security_type || '').toUpperCase();
  const catalysts = v2Data?.catalysts
    || (Array.isArray(mergedFundamentals?.confirmedCatalysts) || mergedFundamentals?.nextEarningsDate
      ? {
        status: Array.isArray(mergedFundamentals?.confirmedCatalysts) && mergedFundamentals.confirmedCatalysts.length > 0 ? 'confirmed' : (mergedFundamentals?.nextEarningsDate ? 'estimated' : 'unavailable'),
        next_earnings_date: mergedFundamentals?.nextEarningsDate || null,
        items: mergedFundamentals?.confirmedCatalysts || [],
      }
      : {
        status: assetClass && assetClass !== 'STOCK' ? 'not_applicable' : 'not_generated',
        reason: assetClass && assetClass !== 'STOCK' ? 'Catalyst calendar is not applicable for this asset class.' : 'Catalyst calendar has not been published for this asset yet.',
        next_earnings_date: null,
        items: [],
      });
  return {
    data: {
      ticker: v2Data.ticker,
      name: displayName,
      bars,
      market_prices: marketPrices,
      market_stats: marketStats,
      change: normalizedChange,
      breakout_v12: historicalData?.breakout_v12 || v2Data?.breakout_v12 || null,
      breakout_v2: historicalData?.breakout_v2 || v2Data?.breakout_v2 || null,
      breakout_v2_legacy: historicalData?.breakout_v2_legacy || v2Data?.breakout_v2_legacy || null,
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
        page_core: v2Data.page_core_contract || null,
      },
      source_provenance: {
        market_stats_source: hasMeaningfulMarketStats(v2Data.market_stats) ? 'v2_summary' : 'none',
        fundamentals_source: isMeaningfulFundamentals(fundamentalsData) ? 'fundamentals_endpoint' : 'none',
        identity_source: isMeaningfulIdentityName(v2Data.name, v2Data.ticker) ? 'v2_summary' : isMeaningfulIdentityName(mergedFundamentals?.companyName, v2Data.ticker) ? 'fundamentals' : isMeaningfulIdentityName(governanceData?.universe?.name, v2Data.ticker) ? 'governance_universe' : 'none',
      },
      module_freshness: moduleFreshness,
      daily_decision: v2Data.daily_decision || null,
      analysis_readiness: v2Data.analysis_readiness || null,
      decision_core_min: decisionCoreMin,
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
    decision: decisionCoreMin ? { ...(v2Data.decision || {}), decision_core_min: decisionCoreMin } : (v2Data.decision || {}),
    decision_core_min: decisionCoreMin,
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
