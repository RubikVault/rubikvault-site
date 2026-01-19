export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Skip /internal/health - let static files be served by _redirects
  // Return undefined/null to let the request pass through to static file serving
  if (url.pathname.startsWith('/internal/health')) {
    // Don't handle this - let Cloudflare Pages serve the static file
    // We can't return undefined, so we'll just not handle it in this function
    // But since this function matches /internal/*, we need to handle it
    // Best approach: redirect to the exact path that exists
    const targetPath = url.pathname === '/internal/health' || url.pathname === '/internal/health/' 
      ? '/internal/health/index.html'
      : url.pathname;
    return Response.redirect(new URL(targetPath, request.url), 301);
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
