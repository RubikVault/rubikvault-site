const SCHEMA_VERSION = 1;

export function createTraceId(request) {
  try {
    const url = new URL(request.url);
    const headerTrace = request.headers.get("x-rv-trace") || request.headers.get("x-rv-trace-id");
    return (
      headerTrace ||
      url.searchParams.get("traceId") ||
      url.searchParams.get("trace") ||
      Math.random().toString(36).slice(2, 10)
    );
  } catch (error) {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function rateLimitFallback() {
  return { remaining: "unknown", reset: null, estimated: true };
}

export function safeSnippet(text, max = 300) {
  if (!text) return "";
  const stringValue = String(text);
  return stringValue.length > max ? stringValue.slice(0, max) : stringValue;
}

export function truncate(text, limit = 300) {
  return safeSnippet(text, limit);
}

export function makeJson({
  ok,
  feature,
  traceId,
  ts,
  data = {},
  cache = {},
  upstream = {},
  rateLimit = rateLimitFallback(),
  error = {},
  isStale = false
} = {}) {
  return {
    ok: Boolean(ok),
    feature: feature || "unknown",
    ts: ts || new Date().toISOString(),
    traceId: traceId || "unknown",
    schemaVersion: SCHEMA_VERSION,
    cache: {
      hit: Boolean(cache.hit),
      ttl: cache.ttl ?? 0,
      layer: cache.layer || "none"
    },
    upstream: {
      url: upstream.url || "",
      status: upstream.status ?? null,
      snippet: upstream.snippet || ""
    },
    rateLimit,
    data,
    error: {
      code: error.code || "",
      message: error.message || "",
      details: error.details || {}
    },
    ...(isStale ? { isStale: true } : {})
  };
}

export function buildPayload(args = {}) {
  return makeJson(args);
}

export function makeResponse({
  ok,
  feature,
  traceId,
  ts,
  data,
  cache,
  upstream,
  rateLimit,
  error,
  isStale,
  status = 200,
  headers = {}
} = {}) {
  const payload = makeJson({
    ok,
    feature,
    traceId,
    ts,
    data,
    cache,
    upstream,
    rateLimit,
    error,
    isStale
  });
  return jsonResponse(payload, status, headers);
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

export function assertBindings(env, feature, traceId) {
  const hasKV =
    env?.RV_KV &&
    typeof env.RV_KV.get === "function" &&
    typeof env.RV_KV.put === "function";
  if (hasKV) return null;

  return makeResponse({
    ok: false,
    feature,
    traceId,
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

export async function kvGetJson(env, key) {
  if (!env?.RV_KV) return null;
  return env.RV_KV.get(key, "json");
}

export async function kvPutJson(env, key, value, ttlSeconds) {
  if (!env?.RV_KV) return;
  await env.RV_KV.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds
  });
}

export function logServer({ feature, traceId, kv, upstreamStatus, durationMs }) {
  console.log(
    JSON.stringify({
      feature,
      traceId,
      kv,
      upstreamStatus,
      durationMs
    })
  );
}

export function normalizeSymbolsParam(symbols) {
  const raw = typeof symbols === "string" ? symbols : "";
  const parts = raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const invalid = [];
  const valid = [];
  parts.forEach((symbol) => {
    if (/^[A-Z0-9.-]+$/.test(symbol)) {
      valid.push(symbol);
    } else {
      invalid.push(symbol);
    }
  });
  const deduped = Array.from(new Set(valid));
  deduped.sort();
  const limited = deduped.slice(0, 20);
  return {
    symbols: limited,
    invalid,
    truncated: deduped.length > 20
  };
}
