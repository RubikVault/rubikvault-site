import { kvPutJson } from "../_lib/kv-safe.js";
import { isProduction, requireDebugToken } from "./_env.js";
import { makeResponse, safeSnippet } from "./_shared.js";

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

function isHtmlLikeText(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function buildApiErrorResponse({ feature, traceId, status, headers, text, contentType, code }) {
  const headerObj = Object.fromEntries(headers.entries());
  return makeResponse({
    ok: false,
    feature,
    traceId,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: status ?? null, snippet: safeSnippet(text, 200) },
    data: {},
    error: {
      code: code || "SCHEMA_INVALID",
      message: "API returned non-JSON response",
      details: { contentType: contentType || "" }
    },
    headers: headerObj
  });
}

function isDebugEndpoint(pathname) {
  return (
    pathname === "/api/health" ||
    pathname === "/api/diag" ||
    pathname === "/api/debug-bundle"
  );
}

function shouldLogEvent({ status, dataQuality, debugActive, isWarn }) {
  if (status >= 400) return true;
  if (debugActive) return true;
  if (isWarn) return true;
  return Math.random() < 0.05;
}

function getEventBucket(feature) {
  const minute = new Date().toISOString().slice(0, 16);
  return `${feature}:${minute}`;
}

function canLogSample(feature, maxPerMinute = 5) {
  const store = (globalThis.__RV_EVENT_COUNTS ||= new Map());
  const bucket = getEventBucket(feature);
  const current = store.get(bucket) || 0;
  if (current >= maxPerMinute) return false;
  store.set(bucket, current + 1);
  return true;
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
  const isApi = url.pathname.startsWith("/api/");
  const cronToken = env?.RV_CRON_TOKEN || "";
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-rv-cron") || "";
  const cronTokenHeader = request.headers.get("x-rv-cron-token") || "";
  const tokenOk =
    Boolean(cronToken) &&
    (authHeader === `Bearer ${cronToken}` ||
      (cronHeader === "1" && cronTokenHeader === cronToken));
  const allowWrites = env?.RV_ALLOW_WRITE_ON_VIEW === "1" || tokenOk;
  if (env) env.__RV_ALLOW_WRITE__ = allowWrites;

  // CORS (immer an – du kannst später tighten)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders() });
  }

  // Trace-Id
  const incomingTrace =
    request.headers.get("x-rv-trace-id") || request.headers.get("x-rv-trace");
  const incomingRunId = request.headers.get("x-rv-run-id");
  const incomingRequestId = request.headers.get("x-rv-request-id");
  const parentTraceId =
    request.headers.get("x-rv-parent-trace-id") || request.headers.get("x-rv-parent-trace");
  const traceId = incomingTrace || createTraceId();
  const requestId = incomingRequestId || createTraceId();

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-rv-trace", traceId);
  reqHeaders.set("x-rv-trace-id", traceId);
  if (incomingRunId) reqHeaders.set("x-rv-run-id", incomingRunId);
  reqHeaders.set("x-rv-request-id", requestId);
  if (parentTraceId) reqHeaders.set("x-rv-parent-trace-id", parentTraceId);

  context.data = {
    ...(context.data || {}),
    traceId,
    requestId,
    runId: incomingRunId || null,
    parentTraceId: parentTraceId || null
  };

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

  if (isApi && request.method === "HEAD") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // ETag nur für /quotes und /news (Body wird materialisiert)
  const isQuotes = url.pathname.endsWith("/quotes");
  const isNews = url.pathname.endsWith("/news");
  if (isQuotes || isNews) {
    const ifNoneMatch = request.headers.get("If-None-Match");
    const text = await response.text();
    const trimmed = text.trim();
    const contentType = response.headers.get("Content-Type") || "";
    if (!trimmed.startsWith("{") || isHtmlLikeText(trimmed)) {
      const feature = url.pathname.split("/").slice(-1)[0] || "api";
      return buildApiErrorResponse({
        feature,
        traceId,
        status: response.status,
        headers,
        text,
        contentType,
        code: isHtmlLikeText(trimmed) ? "ROUTING_HTML" : "SCHEMA_INVALID"
      });
    }
    try {
      JSON.parse(text);
    } catch (error) {
      const feature = url.pathname.split("/").slice(-1)[0] || "api";
      return buildApiErrorResponse({
        feature,
        traceId,
        status: response.status,
        headers,
        text,
        contentType,
        code: "SCHEMA_INVALID"
      });
    }
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

  // Für API JSON: Body EINMAL lesen → logging + Response aus String bauen (fix für "disturbed stream")
  if (isApi) {
    const text = await response.text();
    const trimmed = text.trim();
    const contentType = response.headers.get("Content-Type") || "";
    const isJson = contentType.includes("application/json") || trimmed.startsWith("{");

    if (!isJson || isHtmlLikeText(trimmed)) {
      const feature = url.pathname.split("/").slice(-1)[0] || "api";
      return buildApiErrorResponse({
        feature,
        traceId,
        status: response.status,
        headers,
        text,
        contentType,
        code: isHtmlLikeText(trimmed) ? "ROUTING_HTML" : "SCHEMA_INVALID"
      });
    }

    if (isJson) {

      // Defaults (nicht erzwingen, wenn Content-Type schon da ist)
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }

      // KV Event Log (best effort)
      let payload = null;
      let parsedOk = false;
      try {
        payload = JSON.parse(text);
        parsedOk = true;
      } catch (e) {
        payload = null;
      }
      if (!parsedOk) {
        const feature = url.pathname.split("/").slice(-1)[0] || "api";
        return buildApiErrorResponse({
          feature,
          traceId,
          status: response.status,
          headers,
          text,
          contentType,
          code: "SCHEMA_INVALID"
        });
      }

      if (payload && typeof payload === "object") {
        const existingTrace = payload.trace || {};
        payload.trace = {
          traceId: payload.traceId || traceId,
          requestId: existingTrace.requestId || requestId,
          runId: existingTrace.runId || incomingRunId || "",
          parentTraceId: existingTrace.parentTraceId || parentTraceId || ""
        };
      }

      const logEvent = async () => {
        try {
          
          const budget = payload?.data?.budget || payload?.budget || null;
          const dataQualityStatus =
            payload?.dataQuality?.status ||
            payload?.data?.dataQuality?.status ||
            payload?.dataQuality ||
            "";
          const warnStatus = ["STALE", "PARTIAL", "COVERAGE_LIMIT"].includes(
            String(dataQualityStatus)
          );
          const debugActive = url.searchParams.get("debug") === "1";
          const isDebugAllowed = requireDebugToken(env, request);
          if (isDebugEndpoint(url.pathname) && !isDebugAllowed) return;
          if (!shouldLogEvent({ status: response.status, dataQuality: dataQualityStatus, debugActive, isWarn: warnStatus })) {
            return;
          }
          if (!warnStatus && response.status < 400 && !debugActive && !canLogSample(payload?.feature || url.pathname)) {
            return;
          }
          const event = {
            ts: new Date().toISOString(),
            feature: payload?.feature || url.pathname.split("/").slice(-1)[0],
            traceId: payload?.traceId || traceId,
            requestId,
            runId: incomingRunId || "",
            cacheLayer: payload?.cache?.layer || "none",
            upstreamStatus: payload?.upstream?.status ?? null,
            durationMs: Date.now() - started,
            errorCode: payload?.error?.code || (payload ? "" : "SCHEMA_INVALID"),
            httpStatus: response.status,
            ...(budget && typeof budget === "object"
              ? {
                  subrequestUsed: budget.used ?? null,
                  subrequestMax: budget.max ?? null
                }
              : {})
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

      const textPayload = parsedOk && payload ? JSON.stringify(payload) : text;

      return new Response(textPayload, {
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
