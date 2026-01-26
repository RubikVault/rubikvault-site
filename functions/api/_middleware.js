import { serveStaticJson } from "./_shared/static-only.js";


export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const res = await context.next();

  if (res && typeof res.status === "number" && res.status === 404 && path.startsWith("/api/")) {
    return serveStaticJson(request, env);
  }
  return res;
}
