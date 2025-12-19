const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

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

  if (!targetUrl) {
    return new Response('Missing "url" parameter', { status: 400, headers: CORS_HEADERS });
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    return new Response('Invalid "url" parameter', { status: 400, headers: CORS_HEADERS });
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
    newResponse.headers.set("Cache-Control", "public, max-age=60");

    return newResponse;
  } catch (error) {
    return new Response(`Proxy error: ${error?.message || "Unknown error"}`, {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
