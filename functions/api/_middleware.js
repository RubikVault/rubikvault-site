import { kvPutJson } from "../_lib/kv-safe.js";
import { isProduction, requireDebugToken } from "./_env.js";
import { createKVGuard } from "./_shared/kv_guard.js";

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

function ensureMeta(payload, fallbackTraceId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const baseMeta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const metaWarnings = Array.isArray(baseMeta.warnings)
    ? baseMeta.warnings
    : baseMeta.warnings
      ? [String(baseMeta.warnings)]
      : [];
  const metaStatus = baseMeta.status || (payload.isStale ? "STALE" : payload.ok ? "LIVE" : "ERROR");
  const metaReason =
    baseMeta.reason !== undefined
      ? baseMeta.reason
      : payload.isStale
        ? "STALE"
        : payload.ok
          ? ""
          : payload?.error?.code || "ERROR";
  payload.meta = {
    ...baseMeta,
    status: metaStatus,
    reason: metaReason ?? "",
    ts: baseMeta.ts || payload.ts || new Date().toISOString(),
    schemaVersion: baseMeta.schemaVersion || payload.schemaVersion || 1,
    traceId: baseMeta.traceId || payload?.trace?.traceId || payload.traceId || fallbackTraceId || "unknown",
    writeMode: baseMeta.writeMode || "NONE",
    circuitOpen: Boolean(baseMeta.circuitOpen),
    warnings: metaWarnings,
    savedAt: baseMeta.savedAt ?? null,
    ageMinutes: baseMeta.ageMinutes ?? null,
    source: baseMeta.source ?? null,
    emptyReason: baseMeta.emptyReason ?? null
  };
  return payload;
}

function normalizeMirrorPayload(payload, featureFallback) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (payload.ok !== undefined) return payload;
  if (payload.schemaVersion !== "rv-mirror-v1") return payload;
  const mirrorId = String(payload.mirrorId || "").trim() || "unknown";
  const feature = mirrorId ? `rv-${mirrorId}` : featureFallback || "mirror";
  const items = Array.isArray(payload.items) ? payload.items : [];
  const mode = payload.mode || payload.dataQuality || "";
  const modeUpper = String(mode).toUpperCase();
  const isEmpty = modeUpper === "EMPTY" || items.length === 0;
  return {
    ok: true,
    feature,
    data: { items, payload },
    meta: {
      status: isEmpty ? "PARTIAL" : "STALE",
      reason: mode || (isEmpty ? "EMPTY" : "MIRROR_FALLBACK"),
      source: "mirror"
    },
    error: null
  };
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
  const debugParam = url.searchParams.get("debug") || "";
  const debugKind = ["1", "kv", "fresh"].includes(debugParam) ? debugParam : "";
  const debugMode = Boolean(debugKind);
  const allowPrefixes = [
    ...(String(env?.RV_KV_ALLOW_PREFIXES || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)),
    "rv:circuit:"
  ];
  const kvGuard = createKVGuard({ RV_KV: env?.RV_KV }, { debugMode, debugKind, allowPrefixes });
  if (env) env.RV_KV = kvGuard;
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

  if (isApi && url.pathname.startsWith("/api/og-image")) {
    if (kvGuard) {
      const passthroughHeaders = new Headers(response.headers);
      passthroughHeaders.set("X-RV-KV", kvGuard.headerValue());
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: passthroughHeaders
      });
    }
    return response;
  }

  const responseContentType = response.headers.get("Content-Type") || "";
  const responseIsJson = responseContentType.includes("application/json");
  if (isApi && !responseIsJson) {
    return response;
  }

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
    if (kvGuard) headers.set("X-RV-KV", kvGuard.headerValue());
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
    try {
      JSON.parse(text);
    } catch (error) {
      console.warn("[RV] JSON parse failed", {
        feature: url.pathname.split("/").slice(-1)[0] || "api",
        message: error?.message || "parse_failed"
      });
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
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
    if (kvGuard) headers.set("X-RV-KV", kvGuard.headerValue());
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Für API JSON: Body EINMAL lesen → logging + Response aus String bauen (fix für "disturbed stream")
  if (isApi && responseIsJson) {
    const text = await response.text();

    // Always enforce a single JSON content-type for API responses
    headers.set("Content-Type", "application/json; charset=utf-8");

    // KV Event Log (best effort)
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      console.warn("[RV] JSON parse failed", {
        feature: url.pathname.split("/").slice(-1)[0] || "api",
        message: error?.message || "parse_failed"
      });
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    if (payload && typeof payload === "object") {
      const featureFallback = url.pathname.split("/").slice(-1)[0] || "api";
      payload = normalizeMirrorPayload(payload, featureFallback);
      if (payload.ok === undefined) {
        payload.ok = response.ok;
      }
      if (!payload.feature) {
        payload.feature = featureFallback;
      }
      if (!Object.prototype.hasOwnProperty.call(payload, "data")) {
        payload.data = {};
      }
      const existingTrace = payload.trace || {};
      payload.trace = {
        traceId: payload.traceId || traceId,
        requestId: existingTrace.requestId || requestId,
        runId: existingTrace.runId || incomingRunId || "",
        parentTraceId: existingTrace.parentTraceId || parentTraceId || ""
      };
      const shouldEnsureMeta =
        payload.meta == null ||
        Object.prototype.hasOwnProperty.call(payload, "feature") ||
        Object.prototype.hasOwnProperty.call(payload, "ok");
      if (shouldEnsureMeta) {
        payload = ensureMeta(payload, traceId);
      }
      if (debugKind === "kv") payload.meta.reason = "DEBUG_KV";
      if (debugKind === "fresh") payload.meta.reason = "DEBUG_FRESH";
      if (debugMode && kvGuard) {
        payload.debug = {
          ...(payload.debug && typeof payload.debug === "object" ? payload.debug : {}),
          kv: kvGuard.toDebugJSON(),
          warnings: kvGuard.metrics.warnings
        };
      }
      const baseError =
        payload && typeof payload.error === "object" && payload.error !== null
          ? payload.error
          : {};
      payload.error = {
        code: baseError.code || "",
        message: baseError.message || "",
        details: baseError.details || {}
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
        const debugActive = ["1", "kv", "fresh"].includes(url.searchParams.get("debug") || "");
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

    const textPayload = payload ? JSON.stringify(payload) : text;
    if (kvGuard) headers.set("X-RV-KV", kvGuard.headerValue());

    return new Response(textPayload, {
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
