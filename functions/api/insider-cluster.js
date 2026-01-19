import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  return serveStaticJson(context.request, "insider-cluster", null, context);
}
