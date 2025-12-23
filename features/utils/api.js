function buildUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const base =
    typeof window !== "undefined" && window.RV_CONFIG?.apiBase
      ? window.RV_CONFIG.apiBase
      : "./API";
  const baseClean = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = url.startsWith("/") ? url.slice(1) : url;

  if (!baseClean) return `./${path}`;
  if (baseClean.startsWith(".")) return `${baseClean}/${path}`;
  return `${baseClean}/${path}`;
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

export const BINDING_HINT = "Dashboard → KV Binding (Preview + Prod)";

export function getBindingHint(payload) {
  const action = payload?.error?.details?.action;
  if (action) {
    return `${BINDING_HINT} · ${action}`;
  }
  return BINDING_HINT;
}

export async function fetchJSON(input, { feature, traceId, timeoutMs = 10000, logger } = {}) {
  const requestUrl = buildUrl(input);
  const isCrossOrigin =
    typeof window !== "undefined" &&
    (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) &&
    !requestUrl.startsWith(window.location.origin);
  const proxyUrl = `./proxy?url=${encodeURIComponent(requestUrl)}`;
  const shouldProxy = isCrossOrigin;
  const baseUrl = shouldProxy ? proxyUrl : requestUrl;

  const panic = typeof window !== "undefined" && window.RV_CONFIG?.DEBUG_PANIC_MODE;
  const finalUrl = addQuery(baseUrl, panic ? { rv_panic: "1" } : {});

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    const response = await fetch(finalUrl, {
      headers: {
        Accept: "application/json",
        "x-rv-feature": feature || "unknown",
        "x-rv-trace": traceId || "",
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
      traceId: payload?.traceId || traceId || "unknown",
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
      traceId,
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
