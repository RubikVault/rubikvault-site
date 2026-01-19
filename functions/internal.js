export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // IMPORTANT: /internal/health should be handled by static files
  // This function matches /internal/* but we want to skip /internal/health
  // The best approach: read and serve the HTML file directly
  if (url.pathname.startsWith('/internal/health')) {
    const targetPath = url.pathname === '/internal/health' || url.pathname === '/internal/health/'
      ? '/internal/health/index.html'
      : url.pathname;
    
    // Try multiple approaches to serve the static file
    // Approach 1: Use ASSETS binding if available (Cloudflare Pages feature)
    if (context.env && context.env.ASSETS) {
      try {
        const assetRequest = new Request(new URL(targetPath, request.url));
        const assetResponse = await context.env.ASSETS.fetch(assetRequest);
        if (assetResponse.ok) {
          return new Response(assetResponse.body, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          });
        }
      } catch (err) {
        // Fall through to next approach
      }
    }
    
    // Approach 2: Redirect - _redirects should handle this
    // Use 301 permanent redirect so browser caches the redirect
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
