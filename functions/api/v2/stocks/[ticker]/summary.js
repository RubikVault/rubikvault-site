import { isV2Enabled, v2GateResponse } from '../../../_shared/v2-gate.js';
import { fetchStockSummary } from '../../../_shared/data-interface.js';
import { readPageCoreForTicker } from '../../../_shared/page-core-reader.js';
import { normalizeTicker } from '../../../_shared/stock-helpers.js';
import { logV2Request, logV2Gate } from '../../../_shared/v2-observability.js';
import { errorEnvelope, jsonEnvelopeResponse } from '../../../_shared/envelope.js';

function buildSummaryFromPageCore(pageCore) {
  const ticker = pageCore?.display_ticker || pageCore?.canonical_asset_id?.split(':')?.pop() || null;
  const asOf = pageCore?.freshness?.as_of || pageCore?.freshness?.generated_at?.slice?.(0, 10) || null;
  const close = Number.isFinite(Number(pageCore?.summary_min?.last_close)) ? Number(pageCore.summary_min.last_close) : null;
  const latestBar = asOf && close != null ? { date: asOf, open: close, high: close, low: close, close, volume: null } : null;
  return {
    ticker,
    canonical_asset_id: pageCore?.canonical_asset_id || null,
    name: pageCore?.identity?.name || ticker,
    latest_bar: latestBar,
    market_prices: { ticker, date: asOf, close, source_provider: 'page-core' },
    market_stats: { stats: {}, as_of: asOf, source_provider: 'page-core' },
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
    daily_decision: {
      pipeline_status: pageCore?.summary_min?.quality_status || 'DEGRADED',
      verdict: pageCore?.summary_min?.decision_verdict || 'WAIT_PIPELINE_INCOMPLETE',
      blocking_reasons: pageCore?.governance_summary?.blocking_reasons || [],
      risk_assessment: { level: 'UNKNOWN' },
    },
    analysis_readiness: {
      status: pageCore?.summary_min?.quality_status || 'DEGRADED',
      source: 'page-core-summary-bridge',
      blocking_reasons: pageCore?.governance_summary?.blocking_reasons || [],
      warnings: pageCore?.governance_summary?.warnings || [],
    },
    module_freshness: { price_as_of: asOf, historical_as_of: asOf, market_stats_as_of: asOf },
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
  const result = await fetchStockSummary(ticker, env, request);
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
