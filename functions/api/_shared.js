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

export function withCoinGeckoKey(url, env) {
  const apiKey = env?.COINGECKO_DEMO_KEY;
  if (!apiKey || !url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("x_cg_demo_api_key", apiKey);
    return parsed.toString();
  } catch (error) {
    return url;
  }
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

  console.log(
    JSON.stringify({
      feature,
      traceId,
      kv: "none",
      upstreamStatus: null,
      durationMs: 0,
      error: "BINDING_MISSING"
    })
  );

  return makeResponse({
    ok: false,
    feature,
    traceId,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: null, snippet: "" },
    data: {},
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
  if (!env?.RV_KV) return { value: null, hit: false, ttlSecondsRemaining: null };
  const value = await env.RV_KV.get(key, "json");
  return {
    value,
    hit: value !== null,
    ttlSecondsRemaining: null
  };
}

export async function kvPutJson(env, key, value, ttlSeconds) {
  if (!env?.RV_KV) return;
  await env.RV_KV.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds
  });
}

export function logServer({ feature, traceId, cacheLayer, kv, upstreamStatus, durationMs }) {
  const layer = cacheLayer || kv;
  const kvValue =
    layer === "kv" ? "kv" : layer === "none" ? "none" : layer === "hit" ? "kv" : "none";
  console.log(
    JSON.stringify({
      feature,
      traceId,
      kv: kvValue,
      upstreamStatus: upstreamStatus ?? null,
      durationMs: durationMs ?? 0
    })
  );
}

export function normalizeSymbolsParam(symbols, options = {}) {
  const { feature = "unknown", traceId = "unknown", ttl = 0 } = options;
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
  const truncated = deduped.length > 20;
  const limited = deduped.slice(0, 20);
  const ok = Boolean(limited.length) && !invalid.length && !truncated;
  const errorResponse = ok
    ? null
    : makeResponse({
        ok: false,
        feature,
        traceId,
        cache: { hit: false, ttl, layer: "none" },
        upstream: { url: "", status: null, snippet: "" },
        data: {},
        error: {
          code: "BAD_REQUEST",
          message: "symbols parameter invalid",
          details: { invalid, truncated }
        },
        status: 400
      });
  return {
    symbols: limited,
    invalid,
    truncated,
    ok,
    errorResponse
  };
}
