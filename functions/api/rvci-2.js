/**
 * RVCI 2 - Enhanced RVCI Engine
 * Cloudflare Pages Function
 */

import { serveStaticJson } from './_shared/static-only.js';

export async function onRequestGet(context) {
  return serveStaticJson(context.request, context.env);
}
