import { createTraceId, makeResponse, logServer } from "./_shared.js";

const FEATURE_ID = "health";

export async function onRequestGet({ request, env, data }) {
  const started = Date.now();
  const traceId = data?.traceId || createTraceId(request);
  let bindingsOk = false;
  let envHint = "unknown";
  let version = null;

  try {
    bindingsOk =
      env?.RV_KV && typeof env.RV_KV.get === "function" && typeof env.RV_KV.put === "function";
    envHint =
      env?.CF_PAGES_ENVIRONMENT ||
      (env?.CF_PAGES_BRANCH ? "preview" : env?.CF_PAGES_URL ? "production" : "unknown");
    version = env?.CF_PAGES_COMMIT_SHA || env?.GIT_SHA || null;
  } catch (error) {
    bindingsOk = false;
  }

  const dataPayload = {
    status: bindingsOk ? "ok" : "degraded",
    service: "rubikvault",
    bindings: { RV_KV: bindingsOk },
    envHint,
    version
  };

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
      },
      status: 500
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

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
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
