import { serveStaticJson } from "./_shared/static-only.js";
import { ensureEnvelopeResponse } from "./_shared/envelope.js";


export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  let res = await context.next();

  if (res && typeof res.status === "number" && res.status === 404 && path.startsWith("/api/")) {
    res = await serveStaticJson(request, env);
  }
  return ensureEnvelopeResponse(res);
}
