import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  return serveStaticJson(context.request, "central-bank-watch", null, context);
}
