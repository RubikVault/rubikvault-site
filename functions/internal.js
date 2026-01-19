export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // IMPORTANT: Don't handle /internal/health - let it be handled by functions/internal-health-html.js
  // That function will match /internal-health/* and serve embedded HTML
  // We skip it here so the more specific route can handle it
  if (url.pathname.startsWith('/internal/health')) {
    // Let the request pass through - another function or static file should handle it
    // Return 404 here so the request can be handled by _redirects or other functions
    return new Response('Not found', { status: 404 });
  }

  const required = env?.RV_INTERNAL_TOKEN;
  if (required) {
    const provided =
      request.headers.get("x-rv-internal-token") ||
      url.searchParams.get("token") ||
      "";

    if (!provided || provided !== required) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
  }

  const redirectTo = new URL("/internal-dashboard", request.url);
  const token = url.searchParams.get("token") || "";
  if (token) redirectTo.searchParams.set("token", token);
  return Response.redirect(redirectTo.toString(), 302);
}
