import { createTraceId, makeResponse, logServer } from "./_shared.js";

const FEATURE_ID = "health";

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const bindingsOk =
    env?.RV_KV && typeof env.RV_KV.get === "function" && typeof env.RV_KV.put === "function";
  const envHint =
    env?.CF_PAGES_ENVIRONMENT ||
    (env?.CF_PAGES_BRANCH ? "preview" : env?.CF_PAGES_URL ? "production" : "unknown");
  const version = env?.CF_PAGES_COMMIT_SHA || env?.GIT_SHA || null;

  if (!bindingsOk) {
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: {
        status: "degraded",
        service: "rubikvault",
        bindings: { RV_KV: false },
        envHint,
        version
      },
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
  }

  const payload = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: {
      status: "ok",
      service: "rubikvault",
      bindings: { RV_KV: true },
      envHint,
      version
    },
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: null, snippet: "" }
  });
  logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
  return payload;
}
