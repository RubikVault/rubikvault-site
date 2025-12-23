function buildCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-rv-trace, If-None-Match, If-Modified-Since",
    "Access-Control-Max-Age": "86400"
  };
}

function createTraceId() {
  return Math.random().toString(36).slice(2, 10);
}

async function computeEtag(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(digest));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `"${hashHex}"`;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const allowCors = env?.CROSS_ORIGIN === "true" || true;

  if (allowCors && request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders()
    });
  }

  const incomingTrace = request.headers.get("x-rv-trace");
  const traceId = incomingTrace || createTraceId();
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-rv-trace", traceId);
  context.data = { ...(context.data || {}), traceId };

  const requestWithTrace = new Request(request, { headers: reqHeaders });
  const response = await next(requestWithTrace);
  const headers = new Headers(response.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  headers.set("x-rv-trace", traceId);

  if (allowCors) {
    const corsHeaders = buildCorsHeaders();
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  }

  const isQuotes = url.pathname.endsWith("/quotes");
  const isNews = url.pathname.endsWith("/news");
  if (isQuotes || isNews) {
    const ifNoneMatch = request.headers.get("If-None-Match");
    const clone = response.clone();
    const text = await clone.text();
    const etag = await computeEtag(text);
    headers.set("ETag", etag);
    headers.set("Cache-Control", "no-cache");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers
      });
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
