import { createTraceId, makeResponse, logServer } from "./_shared.js";
import { isProduction, requireDebugToken } from "./_env.js";

const FEATURE_ID = "health";


export async function onRequestGet({ request, env, data }) {
  const started = Date.now();
  const traceId = data?.traceId || createTraceId(request);
  let bindingsOk = false;
  let envHint = "unknown";
  let version = null;
  let colo = null;
  let host = "";
  const prod = isProduction(env, request);

  try {
    bindingsOk =
      env?.RV_KV && typeof env.RV_KV.get === "function" && typeof env.RV_KV.put === "function";
    envHint =
      env?.CF_PAGES_ENVIRONMENT ||
      (env?.CF_PAGES_BRANCH ? "preview" : env?.CF_PAGES_URL ? "production" : "unknown");
    version = env?.CF_PAGES_COMMIT_SHA || env?.GIT_SHA || null;
    colo = env?.CF?.colo || null;
    host = request?.headers?.get("host") || "";
  } catch (error) {
    bindingsOk = false;
  }

  const dataPayload = {
    status: bindingsOk ? "ok" : "degraded",
    service: "rubikvault",
    bindings: { RV_KV: bindingsOk },
    envHint,
    version,
    cf: { colo },
    host,
    env: { hasKV: bindingsOk },
    prod
  };

  if (!requireDebugToken(env, request)) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: {
        status: "redacted",
        reason: "missing_debug_token",
        service: "rubikvault",
        envHint,
        host,
        prod
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  if (!bindingsOk) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: dataPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BINDING_MISSING",
        message: "RV_KV binding missing",
        details: {
          action:
            "Cloudflare Dashboard → Pages → Settings → Functions → KV bindings → RV_KV (Preview + Production)"
        }
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  // Enhanced data for Internal Dashboard
  const enhancedData = {
    ...dataPayload,
    blocks_ok: 0, // Would need to be calculated from actual block status
    blocks_total: 0, // Would need to be calculated from FEATURES
    api_calls_24h: 0, // Would need to be tracked in KV
    cache_hit_rate: 0 // Would need to be calculated from cache stats
  };

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: enhancedData,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: null, snippet: "" }
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: null,
    durationMs: Date.now() - started
  });
  return response;
}
