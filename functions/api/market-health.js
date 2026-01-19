import { serveStaticJson } from "./_shared/static-only.js";

// Cloudflare Pages Functions export format
export async function onRequestGet(context) {
  return serveStaticJson(context.request);
}
