function buildCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-rv-trace-id, x-rv-feature, x-rv-panic"
  };
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  const isCrossOrigin = origin && origin !== url.origin;
  const allowCors = env?.CROSS_ORIGIN === "true" || isCrossOrigin;

  if (allowCors && request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(origin)
    });
  }

  const response = await next();
  const headers = new Headers(response.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }

  if (allowCors) {
    const corsHeaders = buildCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
    headers.set("Vary", "Origin");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
