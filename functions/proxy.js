const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const ALLOWED_HOSTS = new Set([
  "api.coingecko.com",
  "api.alternative.me"
]);

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  const requestId = request.headers.get("x-rv-request-id") || "unknown";

  if (!targetUrl) {
    return new Response('Missing "url" parameter', { status: 400, headers: CORS_HEADERS });
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    return new Response('Invalid "url" parameter', { status: 400, headers: CORS_HEADERS });
  }

  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const target = new URL(targetUrl);
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Host not allowed", { status: 403, headers: CORS_HEADERS });
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": "RubikVault/1.0 (Cloudflare Proxy)"
      },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body
    });

    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");
    newResponse.headers.set("x-rv-request-id", requestId);
    newResponse.headers.set("Cache-Control", "public, max-age=60");

    return newResponse;
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "proxy_error",
          message: error?.message || "Unknown error"
        },
        requestId
      }),
      {
        status: 500,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "x-rv-request-id": requestId
        }
      }
    );
  }
}
