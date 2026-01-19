export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Handle /internal/health by serving HTML directly
  // Since Cloudflare Functions execute BEFORE _redirects,
  // we must serve the file here, not just redirect
  if (url.pathname.startsWith('/internal/health')) {
    const targetPath = url.pathname === '/internal/health' || url.pathname === '/internal/health/'
      ? '/internal/health/index.html'
      : url.pathname;
    
    // Try to fetch static file using ASSETS binding (Cloudflare Pages)
    if (context.env && context.env.ASSETS) {
      try {
        const assetUrl = new URL(targetPath, request.url);
        const assetRequest = new Request(assetUrl.toString(), {
          method: 'GET',
          headers: request.headers
        });
        
        const assetResponse = await context.env.ASSETS.fetch(assetRequest);
        
        if (assetResponse && assetResponse.ok) {
          const html = await assetResponse.text();
          return new Response(html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Served-By': 'internal.js-function'
            }
          });
        }
      } catch (err) {
        console.error('ASSETS fetch failed:', err.message);
        // Continue to fallback
      }
    }
    
    // Fallback: Return HTML with meta refresh redirect
    // This helps if ASSETS binding is not available
    const redirectUrl = new URL(targetPath, request.url).toString();
    return new Response(`<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=${redirectUrl}">
  <script>window.location.href = ${JSON.stringify(redirectUrl)};</script>
</head>
<body>
  <p>Redirecting to <a href="${redirectUrl}">Mission Control Dashboard</a>...</p>
</body>
</html>`, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Location': redirectUrl
      }
    });
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
