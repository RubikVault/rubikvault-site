export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Skip /internal/health - handled by functions/internal/health.js
  if (url.pathname.startsWith('/internal/health')) {
    return new Response("Not found", { status: 404 });
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
