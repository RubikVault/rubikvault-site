import { isV2Enabled, v2GateResponse } from '../../../_shared/v2-gate.js';
import { fetchStockSummary } from '../../../_shared/data-interface.js';
import { pageCoreReturnIntegrity, pageCoreStrictOperationalReasons, readPageCoreForTicker } from '../../../_shared/page-core-reader.js';
import { normalizeTicker } from '../../../_shared/stock-helpers.js';
import { logV2Request, logV2Gate } from '../../../_shared/v2-observability.js';
import { errorEnvelope, jsonEnvelopeResponse } from '../../../_shared/envelope.js';

function buildSummaryFromPageCore(pageCore) {
  const ticker = pageCore?.display_ticker || pageCore?.canonical_asset_id?.split(':')?.pop() || null;
  const asOf = pageCore?.freshness?.as_of || pageCore?.freshness?.generated_at?.slice?.(0, 10) || null;
  const close = Number.isFinite(Number(pageCore?.summary_min?.last_close)) ? Number(pageCore.summary_min.last_close) : null;
  const returnIntegrity = pageCoreReturnIntegrity(pageCore);
  const marketStatsMin = pageCore?.market_stats_min && typeof pageCore.market_stats_min === 'object' ? pageCore.market_stats_min : null;
  const marketStats = marketStatsMin?.stats && typeof marketStatsMin.stats === 'object'
    ? {
      stats: marketStatsMin.stats,
      as_of: marketStatsMin.as_of || asOf,
      source_provider: marketStatsMin.stats_source || 'page-core',
    }
    : { stats: {}, as_of: asOf, source_provider: 'missing' };
  const strictReasons = pageCoreStrictOperationalReasons(pageCore);
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
  const latestBar = asOf && close != null ? { date: asOf, open: close, high: close, low: close, close, volume: null } : null;
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
      pct: returnIntegrity.value,
      daily_change_abs: pageCore?.summary_min?.daily_change_abs ?? null,
      daily_change_pct: returnIntegrity.value,
      _rv_return_integrity: returnIntegrity,
    },
    decision: {
      verdict: pageCore?.summary_min?.decision_verdict || null,
      confidence_bucket: pageCore?.summary_min?.decision_confidence_bucket || null,
    },
    daily_decision: {
      schema: 'rv.asset_daily_decision.v1',
      source: 'page-core-summary-bridge',
      pipeline_status: pipelineStatus,
      verdict,
      blocking_reasons: effectiveBlockingReasons,
      risk_assessment: { level: riskLevel },
      signal_quality: signalQuality,
    },
    analysis_readiness: {
      status: pageCoreOperational ? 'READY' : 'FAILED',
      source: 'page-core-summary-bridge',
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
    module_freshness: { price_as_of: asOf, historical_as_of: asOf, market_stats_as_of: asOf },
  };
}

function degradeLegacyFallbackResult(result) {
  if (!result?.ok || !result?.data || typeof result.data !== 'object') return result;
  const data = {
    ...result.data,
    daily_decision: {
      ...(result.data.daily_decision || {}),
      schema: 'rv.asset_daily_decision.v1',
      source: result.data.daily_decision?.source || 'legacy-summary-fallback',
      pipeline_status: 'DEGRADED',
      verdict: result.data.daily_decision?.verdict || result.data.decision?.verdict || 'WAIT_PIPELINE_INCOMPLETE',
      blocking_reasons: Array.from(new Set([
        ...(Array.isArray(result.data.daily_decision?.blocking_reasons) ? result.data.daily_decision.blocking_reasons : []),
        'page_core_unavailable_legacy_fallback',
      ])),
      risk_assessment: result.data.daily_decision?.risk_assessment || { level: 'UNKNOWN' },
      signal_quality: 'suppressed',
    },
    analysis_readiness: {
      ...(result.data.analysis_readiness || {}),
      status: 'FAILED',
      source: result.data.analysis_readiness?.source || 'legacy-summary-fallback',
      decision_bundle_status: 'FAILED',
      decision_public_green: false,
      signal_quality: 'suppressed',
      blocking_reasons: Array.from(new Set([
        ...(Array.isArray(result.data.analysis_readiness?.blocking_reasons) ? result.data.analysis_readiness.blocking_reasons : []),
        'page_core_unavailable_legacy_fallback',
      ])),
    },
  };
  return {
    ...result,
    data,
    meta: {
      ...(result.meta || {}),
      status: result.meta?.status === 'fresh' ? 'degraded' : (result.meta?.status || 'degraded'),
      page_core_fallback: 'legacy_degraded',
    },
  };
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const endpointId = 'v2_summary';
  const start = Date.now();

  // Gate check
  const enabled = await isV2Enabled(env, endpointId);
  logV2Gate({ endpoint: endpointId, enabled });
  if (!enabled) return v2GateResponse(endpointId);

  // Ticker validation
  const rawTicker = params?.ticker || '';
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const envelope = errorEnvelope(
      'INVALID_TICKER',
      'Invalid or missing ticker parameter',
      { provider: 'v2-summary', data_date: todayUtc, status: 'error', version: 'v2' }
    );
    return new Response(JSON.stringify(envelope), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const pageResult = await readPageCoreForTicker(ticker, { request, env });
  if (pageResult.ok) {
    const durationMs = Date.now() - start;
    logV2Request({
      endpoint: endpointId,
      ticker,
      durationMs,
      status: pageResult.freshness_status,
      stale: pageResult.freshness_status === 'stale' || pageResult.freshness_status === 'expired',
      fallbackUsed: false,
      source: 'page-core-summary-bridge',
    });
    return jsonEnvelopeResponse({
      ok: true,
      status: 200,
      data: buildSummaryFromPageCore(pageResult.pageCore),
      meta: {
        provider: 'page-core-summary-bridge',
        status: pageResult.freshness_status || 'fresh',
        run_id: pageResult.run_id,
        canonical_asset_id: pageResult.canonical_id,
        schema_version: 'rv.page_core.v1',
      },
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        'X-Run-Id': pageResult.run_id || '',
        'X-Canonical-Asset-Id': pageResult.canonical_id || '',
        'X-Data-Freshness': pageResult.freshness_status || 'error',
      },
    });
  }

  // Bridge fallback until page-core latest.json is deployed.
  const result = degradeLegacyFallbackResult(await fetchStockSummary(ticker, env, request));
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

  // Build response
  const status = result.ok ? 200 : 502;
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
