export async function onRequestGet(context) {
  const { request, env } = context;

  // Always redirect to /internal-dashboard (let _redirects handle it)
  // If token is required, it will be checked by /internal-dashboard handler
  const url = new URL(request.url);
  const redirectTo = new URL("/internal-dashboard", request.url);
  const token = url.searchParams.get("token") || "";
  if (token) redirectTo.searchParams.set("token", token);
  return Response.redirect(redirectTo.toString(), 302);
}
