function buildUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const base = (typeof window !== "undefined" && window.RV_CONFIG?.apiBase) ? window.RV_CONFIG.apiBase : "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${prefix}${path}`;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rv-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function getDiagnostics() {
  if (typeof window === "undefined") return null;
  return window.RV_DIAGNOSTICS || null;
}

export async function fetchRV(input, init = {}, meta = {}) {
  const { timeoutMs = 10000, ...options } = init || {};
  const requestUrl = buildUrl(input);
  const proxyUrl = `/proxy?url=${encodeURIComponent(requestUrl)}`;
  const shouldProxy =
    typeof window !== "undefined" &&
    (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) &&
    !requestUrl.startsWith(window.location.origin);
  const finalUrl = shouldProxy ? proxyUrl : requestUrl;
  const requestId = createRequestId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  const diagnostics = getDiagnostics();
  diagnostics?.logFetchStart({
    url: finalUrl,
    method: options.method || "GET",
    requestId,
    meta
  });

  try {
    const response = await fetch(finalUrl, {
      ...options,
      headers: {
        Accept: "application/json",
        "x-rv-request-id": requestId,
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const sourceLabel = shouldProxy ? "Proxy/API" : "API";
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      diagnostics?.logFetchError({
        url: finalUrl,
        status: response.status,
        durationMs,
        requestId,
        message: text || response.statusText,
        contentType,
        meta
      });
      throw new Error(`${sourceLabel} error ${response.status}: ${text || response.statusText}`);
    }

    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    const data = await response.json();
    diagnostics?.logFetchSuccess({
      url: finalUrl,
      status: response.status,
      durationMs,
      requestId,
      contentType,
      meta,
      data
    });
    return data;
  } catch (error) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    diagnostics?.logFetchException({
      url: finalUrl,
      durationMs,
      requestId,
      message: error?.message || "Request failed",
      meta
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
