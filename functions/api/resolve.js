import { sha256Hex } from './_shared/digest.mjs';
import { resolveSymbol } from './_shared/symbol-resolver.mjs';

const MODULE_NAME = 'resolve';

async function computeDigest(input) {
  const canonical = JSON.stringify(input);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

function buildErrorPayload(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await resolveSymbol(query, request);
  } catch (error) {
    result = {
      ok: false,
      error: {
        code: 'RESOLVE_FAILED',
        message: 'Resolver crashed',
        details: { message: error?.message || String(error) }
      }
    };
  }

  const payload = {
    schema_version: '3.0',
    module: MODULE_NAME,
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      domain: 'stocks',
      source: 'resolve-api',
      fetched_at: startedAt,
      published_at: startedAt,
      digest: null,
      served_from: 'RUNTIME',
      request: {
        q: query
      },
      status: result.ok ? 'OK' : 'ERROR'
    },
    data: result.ok ? result.data : null,
    error: result.ok ? null : buildErrorPayload(result.error.code, result.error.message, result.error.details)
  };

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
