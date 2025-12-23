function buildUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const base =
    typeof window !== "undefined" && window.RV_CONFIG?.apiBase
      ? window.RV_CONFIG.apiBase
      : "API";
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
        "x-rv-trace-id": traceId || "",
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
      throw new Error(`Invalid JSON response (${response.status})`);
    }

    if (!isValidSchema(payload)) {
      throw new Error("Invalid API response schema");
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

    return payload;
  } catch (error) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
    logger?.error("fetch_exception", {
      message: error?.message || "Request failed",
      durationMs: Math.round(durationMs)
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
