import { jsonEnvelopeResponse } from '../../_shared/envelope.js';
import { readPageCoreForTicker } from '../../_shared/page-core-reader.js';

export async function onRequestGet({ params, request, env, ctx }) {
  const rawTicker = params?.ticker || '';
  const result = await readPageCoreForTicker(rawTicker, { request, env, ctx });
  const headers = {
    'Cache-Control': result.ok
      ? 'public, max-age=300, stale-while-revalidate=300'
      : 'public, max-age=60, stale-while-revalidate=60',
    'X-Run-Id': result.run_id || '',
    'X-Canonical-Asset-Id': result.canonical_id || '',
    'X-Data-Freshness': result.freshness_status || 'error',
    'X-Schema-Version': 'rv.page_core.v1',
  };
  if (result.ok && result.run_id && result.canonical_id) {
    headers.ETag = `"${result.run_id}:${result.canonical_id}"`;
  }

  if (!result.ok) {
    return jsonEnvelopeResponse({
      ok: false,
      status: result.httpStatus || 200,
      data: null,
      error: { code: result.code, message: result.message },
      meta: {
        provider: 'page-core',
        status: result.freshness_status || 'error',
        run_id: result.run_id || null,
        canonical_asset_id: result.canonical_id || null,
        schema_version: 'rv.page_core.v1',
      },
      headers,
    });
  }

  return jsonEnvelopeResponse({
    ok: true,
    status: 200,
    data: result.pageCore,
    meta: {
      provider: 'page-core',
      status: result.freshness_status || 'fresh',
      run_id: result.run_id,
      snapshot_id: result.snapshot_id,
      canonical_asset_id: result.canonical_id,
      schema_version: 'rv.page_core.v1',
    },
    headers,
  });
}
