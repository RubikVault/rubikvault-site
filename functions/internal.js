export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Handle /internal/health by fetching static file via ASSETS binding
  if (url.pathname.startsWith('/internal/health')) {
    const targetPath = url.pathname === '/internal/health' || url.pathname === '/internal/health/'
      ? '/internal/health/index.html'
      : url.pathname;
    
    // Try to fetch static file using ASSETS binding
    try {
      if (context.env && context.env.ASSETS) {
        const assetRequest = new Request(new URL(targetPath, request.url));
        const response = await context.env.ASSETS.fetch(assetRequest);
        if (response.ok) {
          return new Response(response.body, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store'
            }
          });
        }
      }
    } catch (err) {
      console.error('Error fetching static file:', err);
    }
    
    // Fallback: redirect
    return Response.redirect(new URL(targetPath, request.url), 302);
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
