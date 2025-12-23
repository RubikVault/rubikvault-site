import { buildPayload, createTraceId, jsonResponse, logServer } from "./_shared.js";

const FEATURE_ID = "health";

export async function onRequestGet({ request, env }) {
  const traceId = createTraceId(request);

  if (!env?.RV_KV) {
    const payload = buildPayload({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      error: { code: "BINDING_MISSING", message: "RV_KV binding missing", details: {} }
    });
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return jsonResponse(payload, 500);
  }

  const payload = buildPayload({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: {
      status: "ok",
      service: "rubikvault"
    },
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: null, snippet: "" }
  });
  logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
  return jsonResponse(payload);
}
