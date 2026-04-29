import { isV2Enabled, v2GateResponse } from '../../../_shared/v2-gate.js';
import { readPageCoreForTicker } from '../../../_shared/page-core-reader.js';
import { normalizeTicker } from '../../../_shared/stock-helpers.js';
import { logV2Request, logV2Gate } from '../../../_shared/v2-observability.js';
import { errorEnvelope, jsonEnvelopeResponse } from '../../../_shared/envelope.js';

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const endpointId = 'v2_governance';
  const start = Date.now();

  const enabled = await isV2Enabled(env, endpointId);
  logV2Gate({ endpoint: endpointId, enabled });
  if (!enabled) return v2GateResponse(endpointId);

  const rawTicker = params?.ticker || '';
  const ticker = normalizeTicker(rawTicker);
  if (!ticker) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    const envelope = errorEnvelope(
      'INVALID_TICKER',
      'Invalid or missing ticker parameter',
      { provider: 'v2-governance', data_date: todayUtc, status: 'error', version: 'v2' }
    );
    return new Response(JSON.stringify(envelope), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const pageResult = await readPageCoreForTicker(ticker, { request, env });
  const durationMs = Date.now() - start;
  const result = pageResult.ok
    ? {
        ok: true,
        data: {
          ticker: pageResult.pageCore.display_ticker || ticker,
          canonical_asset_id: pageResult.canonical_id,
          universe: pageResult.pageCore.identity || null,
          market_score: null,
          evaluation_v4: null,
          governance_summary: pageResult.pageCore.governance_summary || null,
          module_link: pageResult.pageCore.module_links?.governance || null,
        },
        meta: {
          provider: 'page-core-governance',
          status: pageResult.freshness_status || 'fresh',
          run_id: pageResult.run_id,
          canonical_asset_id: pageResult.canonical_id,
          schema_version: 'rv.page_core.v1',
        },
      }
    : {
        ok: false,
        data: null,
        error: { code: pageResult.code, message: pageResult.message },
        meta: {
          provider: 'page-core-governance',
          status: pageResult.freshness_status || 'error',
          run_id: pageResult.run_id || null,
          canonical_asset_id: pageResult.canonical_id || null,
          schema_version: 'rv.page_core.v1',
        },
      };

  logV2Request({
    endpoint: endpointId,
    ticker,
    durationMs,
    status: result.meta?.status,
    stale: result.meta?.status === 'stale',
    fallbackUsed: false,
    source: result.meta?.provider,
  });

  return jsonEnvelopeResponse({
    ok: result.ok,
    status: pageResult.httpStatus || 200,
    data: result.data,
    error: result.error || null,
    meta: result.meta,
    headers: {
      'Cache-Control': result.ok ? 'public, max-age=300, stale-while-revalidate=300' : 'public, max-age=60',
      'X-Run-Id': pageResult.run_id || '',
      'X-Canonical-Asset-Id': pageResult.canonical_id || '',
      'X-Data-Freshness': pageResult.freshness_status || 'error',
    },
  });
}
