import { kvPutJson } from "../_lib/kv-safe.js";

function buildCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-rv-trace, x-rv-trace-id, If-None-Match, If-Modified-Since",
    "Access-Control-Max-Age": "86400"
  };
}

function createTraceId() {
  return Math.random().toString(36).slice(2, 10);
}

async function computeEtag(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(digest));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `W/"${hashHex}"`;
}

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const url = new URL(request.url);
  const started = Date.now();

  // CORS (immer an – du kannst später tighten)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders() });
  }

  // Trace-Id
  const incomingTrace =
    request.headers.get("x-rv-trace-id") || request.headers.get("x-rv-trace");
  const traceId = incomingTrace || createTraceId();

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-rv-trace", traceId);
  reqHeaders.set("x-rv-trace-id", traceId);

  context.data = { ...(context.data || {}), traceId };

  const requestWithTrace = new Request(request, { headers: reqHeaders });

  // Downstream
  const response = await next(requestWithTrace);

  // Response-Header normalisieren
  const headers = new Headers(response.headers);

  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("x-rv-trace", traceId);
  headers.set("x-rv-trace-id", traceId);

  // CORS Header setzen
  const corsHeaders = buildCorsHeaders();
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

  // ETag nur für /quotes und /news (Body wird materialisiert)
  const isQuotes = url.pathname.endsWith("/quotes");
  const isNews = url.pathname.endsWith("/news");
  if (isQuotes || isNews) {
    const ifNoneMatch = request.headers.get("If-None-Match");
    const text = await response.text();
    const etag = await computeEtag(text);

    headers.set("ETag", etag);
    headers.set("Cache-Control", "no-cache");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304, headers });
    }
    // Content-Type für diese Endpoints nicht erzwingen – nur wenn fehlt
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const isApi = url.pathname.startsWith("/api/");

  // Für API JSON: Body EINMAL lesen → logging + Response aus String bauen (fix für "disturbed stream")
  if (isApi) {
    const contentType = response.headers.get("Content-Type") || "";
    const isJson = contentType.includes("application/json");

    if (isJson) {
      const text = await response.text();

      // Defaults (nicht erzwingen, wenn Content-Type schon da ist)
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }

      // KV Event Log (best effort)
      const logEvent = async () => {
        try {
          let payload = null;
          try {
            payload = JSON.parse(text);
          } catch (e) {
            payload = null;
          }

          const event = {
            ts: new Date().toISOString(),
            feature: payload?.feature || url.pathname.split("/").slice(-1)[0],
            traceId: payload?.traceId || traceId,
            cacheLayer: payload?.cache?.layer || "none",
            upstreamStatus: payload?.upstream?.status ?? null,
            durationMs: Date.now() - started,
            errorCode: payload?.error?.code || (payload ? "" : "SCHEMA_INVALID"),
            httpStatus: response.status
          };

          const hour = new Date().toISOString().slice(0, 13);
          const key = `log:event:${hour}:${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

          await kvPutJson(env, key, event, 86400);
        } catch (e) {
          // ignore
        }
      };

      if (typeof waitUntil === "function") waitUntil(logEvent());
      else await logEvent();

      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    // API aber nicht JSON → stream-through
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Nicht-API → stream-through
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}