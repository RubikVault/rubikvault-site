const SCHEMA_VERSION = 1;

export function createTraceId(request) {
  try {
    const url = new URL(request.url);
    const headerTrace = request.headers.get("x-rv-trace-id");
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

export function truncate(text, limit = 300) {
  if (!text) return "";
  return text.length > limit ? text.slice(0, limit) : text;
}

export function buildPayload({
  ok,
  feature,
  traceId,
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
    ts: new Date().toISOString(),
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

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
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
