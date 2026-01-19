export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Allow /internal/health to pass through to static files
  if (url.pathname.startsWith('/internal/health')) {
    // Let _redirects handle routing to static files
    return context.next();
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
