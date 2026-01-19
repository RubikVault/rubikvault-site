export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // IMPORTANT: Don't handle /internal/health - let _redirects serve the static file
  // Return early with a pass-through response
  if (url.pathname.startsWith('/internal/health')) {
    // Return a response that allows static file serving to proceed
    // We use a 307 redirect to the exact file path
    const targetPath = url.pathname === '/internal/health' || url.pathname === '/internal/health/'
      ? '/internal/health/index.html'
      : url.pathname;
    
    // Use a temporary redirect (307) which preserves method and lets the static file be served
    const targetUrl = new URL(targetPath, request.url);
    return Response.redirect(targetUrl.toString(), 307);
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
