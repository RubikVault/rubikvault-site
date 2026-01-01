function normalizeApiBase(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "api" || trimmed === "./api") return "/api";
  if (trimmed === "/api/" || trimmed === "/api") return "/api";
  if (trimmed.startsWith("./")) {
    const stripped = trimmed.replace(/^\.\/+/, "");
    return `/${stripped}`.replace(/\/+$/, "");
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, "");
}

function createTraceId() {
  return Math.random().toString(36).slice(2, 10);
}

function getRunId() {
  if (typeof window === "undefined") return "";
  return window.__RV_RUN_ID || "";
}

function getDashboardBlock(input) {
  if (typeof window === "undefined") return null;
  const dashboard = window.__RV_DASHBOARD__;
  if (!dashboard || !dashboard.blocks) return null;
  const raw = typeof input === "string" ? input : "";
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) return null;
  const pathOnly = raw.startsWith("/") ? raw.slice(1) : raw;
  const normalized = pathOnly.split("?")[0];
  const slug = normalized.startsWith("api/") ? normalized.slice(4) : normalized;
  if (!slug) return null;
  return dashboard.blocks[slug] || null;
}

function applyPayloadMeta(logger, payload, { requestId, runId, parentTraceId } = {}) {
  if (!logger || !payload) return;
  const mirrorMeta = payload?.data?.mirrorMeta || {};
  const itemsCount = Array.isArray(payload?.data?.items) ? payload.data.items.length : null;
  const responseTrace = payload?.trace || {};
  logger.setTraceId(payload?.traceId || "unknown");
  logger.setMeta({
    cacheLayer: payload?.cache?.layer || "none",
    cacheTtl: payload?.cache?.ttl ?? 0,
    upstreamStatus: payload?.upstream?.status ?? null,
    updatedAt: mirrorMeta.updatedAt || payload?.ts || null,
    itemsCount,
    mode: mirrorMeta.mode || null,
    cadence: mirrorMeta.cadence || null,
    trust: mirrorMeta.trust || null,
    sourceUpstream: mirrorMeta.sourceUpstream || null,
    delayMinutes: mirrorMeta.delayMinutes ?? null,
    dataQuality: payload?.dataQuality || null,
    requestId: responseTrace.requestId || requestId || null,
    runId: responseTrace.runId || runId || null,
    parentTraceId: responseTrace.parentTraceId || parentTraceId || null
  });
}
export function resolveApiBase(explicitBase) {
  const configLoaded = typeof window !== "undefined" && !!window.RV_CONFIG;
  const candidate =
    typeof explicitBase === "string"
      ? explicitBase
      : configLoaded
        ? window.RV_CONFIG?.apiBase
        : "";
  const errors = [];
  if (!configLoaded) errors.push("CONFIG_MISSING");
  const normalized = normalizeApiBase(candidate);
  if (!normalized) errors.push("API_BASE_MISSING");
  const ok = errors.length === 0;
  return {
    ok,
    configLoaded,
    apiBase: ok ? normalized : "",
    apiPrefix: ok ? normalized : "",
    errors
  };
}

function joinUrl(base, path) {
  if (!base) return "";
  const baseClean = base.replace(/\/+$/, "");
  const pathClean = String(path || "").replace(/^\/+/, "");
  return `${baseClean}/${pathClean}`;
}

function buildUrl(url) {
  const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
  if (isAbsolute) {
    return { url, resolution: resolveApiBase(), absolute: true };
  }
  const resolution = resolveApiBase();
  if (!resolution.ok) return { url: "", resolution, absolute: false };
  const path = url.startsWith("/") ? url.slice(1) : url;
  return { url: joinUrl(resolution.apiPrefix, path), resolution, absolute: false };
}

function toMirrorPath(input) {
  if (typeof input !== "string") return "";
  if (input.startsWith("http://") || input.startsWith("https://")) return "";
  if (input.startsWith("/mirrors/") || input.startsWith("mirrors/")) return input;
  const raw = input.startsWith("/") ? input.slice(1) : input;
  const pathOnly = raw.split("?")[0];
  const normalized = pathOnly.startsWith("api/") ? pathOnly.slice(4) : pathOnly;
  if (!normalized) return "";
  return `/mirrors/${normalized}.json`;
}

function addQuery(url, params = {}) {
  const hasQuery = url.includes("?");
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return url;
  const suffix = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${url}${hasQuery ? "&" : "?"}${suffix}`;
}

function isValidSchema(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.ok === "boolean" &&
    typeof payload.feature === "string" &&
    typeof payload.ts === "string" &&
    typeof payload.traceId === "string" &&
    typeof payload.schemaVersion === "number"
  );
}

function isMirrorSchema(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    payload.schemaVersion === "1.0" &&
    typeof payload.mirrorId === "string"
  );
}

function mirrorToApiPayload(mirror, traceId) {
  const items = Array.isArray(mirror.items) ? mirror.items : [];
  return {
    ok: true,
    feature: mirror.mirrorId || "mirror",
    ts: mirror.updatedAt || new Date().toISOString(),
    traceId: traceId || "mirror",
    schemaVersion: 1,
    cache: { hit: true, ttl: 0, layer: "mirror" },
    upstream: { url: "mirror", status: null, snippet: "" },
    rateLimit: { remaining: "unknown", reset: null, estimated: true },
    dataQuality: {
      status: mirror.dataQuality || "EMPTY",
      reason: mirror.mode || "MIRROR"
    },
    data: {
      items,
      context: mirror.context || {},
      mirrorMeta: {
        mirrorId: mirror.mirrorId || "",
        mode: mirror.mode || "",
        cadence: mirror.cadence || "",
        trust: mirror.trust || "",
        sourceUpstream: mirror.sourceUpstream || "",
        delayMinutes: mirror.delayMinutes ?? null,
        asOf: mirror.asOf || null,
        updatedAt: mirror.updatedAt || null,
        whyUnique: mirror.whyUnique || "",
        missingSymbols: mirror.missingSymbols || [],
        errors: mirror.errors || [],
        notes: mirror.notes || []
      }
    }
  };
}

function makeLocalError({ feature, traceId, status, snippet, code, message, url }) {
  return {
    ok: false,
    feature: feature || "unknown",
    ts: new Date().toISOString(),
    traceId: traceId || "unknown",
    schemaVersion: 1,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: url || "", status: status ?? null, snippet: snippet || "" },
    rateLimit: { remaining: "unknown", reset: null, estimated: true },
    data: {},
    error: {
      code: code || "CLIENT_ERROR",
      message: message || "Client error",
      details: {}
    }
  };
}

export const BINDING_HINT = "Dashboard -> KV Binding (Preview + Prod)";

export function getBindingHint(payload) {
  const action = payload?.error?.details?.action;
  if (action) {
    return `${BINDING_HINT} - ${action}`;
  }
  return BINDING_HINT;
}

export async function fetchJSON(
  input,
  { feature, traceId, timeoutMs = 10000, logger, parentTraceId } = {}
) {
  const effectiveTraceId = traceId || createTraceId();
  const requestId = createTraceId();
  const runId = getRunId();
  const dashboardPayload = getDashboardBlock(input);
  if (dashboardPayload) {
    applyPayloadMeta(logger, dashboardPayload, { requestId, runId, parentTraceId });
    return dashboardPayload;
  }
  const mirrorPath = toMirrorPath(input);
  const usingMirror = Boolean(mirrorPath);
  const { url: requestUrl, resolution, absolute } = usingMirror
    ? {
        url: mirrorPath,
        resolution: { ok: true, configLoaded: true, apiBase: "", apiPrefix: "", errors: [] },
        absolute: false
      }
    : buildUrl(input);
  if (resolution) {
    logger?.setMeta({
      configLoaded: resolution.configLoaded,
      apiBase: resolution.apiBase || "",
      apiPrefix: resolution.apiPrefix || "",
      configErrors: resolution.errors || []
    });
  }
  if (!resolution.ok) {
    const payload = makeLocalError({
      feature,
      traceId,
      status: null,
      snippet: "",
      code: "CONFIG_MISSING",
      message: "Config missing - API disabled",
      url: ""
    });
    payload.error.details = {
      configLoaded: resolution.configLoaded,
      apiBase: resolution.apiBase || null,
      apiPrefix: resolution.apiPrefix || null,
      errors: resolution.errors || []
    };
    logger?.setStatus("FAIL", "CONFIG_MISSING");
    logger?.warn("config_missing", payload.error.details);
    return payload;
  }
  const isCrossOrigin =
    typeof window !== "undefined" &&
    (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) &&
    !requestUrl.startsWith(window.location.origin);
  const proxyUrl = `./proxy?url=${encodeURIComponent(requestUrl)}`;
  const shouldProxy = isCrossOrigin;
  const baseUrl = shouldProxy ? proxyUrl : requestUrl;

  const panic = typeof window !== "undefined" && window.RV_CONFIG?.DEBUG_PANIC_MODE;
  const finalUrl = addQuery(baseUrl, {
    ...(panic ? { rv_panic: "1" } : {}),
    ...(usingMirror ? { t: Date.now() } : {})
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetch(finalUrl, {
      headers: {
        Accept: "application/json",
        "x-rv-feature": feature || "unknown",
        "x-rv-trace": effectiveTraceId,
        "x-rv-trace-id": effectiveTraceId,
        ...(runId ? { "x-rv-run-id": runId } : {}),
        "x-rv-request-id": requestId,
        ...(parentTraceId ? { "x-rv-parent-trace-id": parentTraceId } : {}),
        ...(panic ? { "x-rv-panic": "1" } : {})
      },
      signal: controller.signal
    });

    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    const text = await response.text();
    const snippet = text.slice(0, 300);
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = makeLocalError({
        feature,
        traceId,
        status: response.status,
        snippet,
        code: "SCHEMA_INVALID",
        message: "Invalid JSON response",
        url: finalUrl
      });
    }

    if (payload && payload.payload && typeof payload.payload === "object") {
      payload = payload.payload;
    }

    if (isMirrorSchema(payload)) {
      payload = mirrorToApiPayload(payload, effectiveTraceId);
    }

    if (!isValidSchema(payload)) {
      payload = makeLocalError({
        feature,
        traceId,
        status: response.status,
        snippet,
        code: "SCHEMA_INVALID",
        message: "Invalid API response schema",
        url: finalUrl
      });
    }

    applyPayloadMeta(logger, payload, { requestId, runId, parentTraceId });

    const logPayload = {
      status: response.status,
      durationMs: Math.round(durationMs),
      snippet
    };

    if (response.ok && payload.ok) {
      logger?.info("fetch_ok", logPayload);
    } else {
      logger?.warn("fetch_error", {
        ...logPayload,
        error: payload.error || null
      });
    }

    logger?.info("response_meta", {
        traceId: payload?.traceId || effectiveTraceId || "unknown",
        cacheLayer: payload?.cache?.layer || "none",
        cacheTtl: payload?.cache?.ttl ?? 0,
        cache: payload.cache || {},
        upstreamStatus: payload?.upstream?.status ?? null
      });

    return payload;
  } catch (error) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    logger?.error("fetch_exception", {
      message: error?.message || "Request failed",
      durationMs: Math.round(durationMs)
    });
    return makeLocalError({
      feature,
      traceId: effectiveTraceId,
      status: null,
      snippet: "",
      code: "FETCH_FAILED",
      message: error?.message || "Request failed",
      url: finalUrl
    });
  } finally {
    clearTimeout(timeout);
  }
}
