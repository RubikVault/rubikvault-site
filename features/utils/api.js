function buildUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const base = (typeof window !== "undefined" && window.RV_CONFIG?.apiBase) ? window.RV_CONFIG.apiBase : "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${prefix}${path}`;
}

function emitDebug(payload) {
  if (typeof window === "undefined") return;
  if (!window.RV_CONFIG?.debug) return;
  window.RV_DEBUG_LOGS = window.RV_DEBUG_LOGS || [];
  window.RV_DEBUG_LOGS.push({ ...payload, ts: Date.now() });
  window.dispatchEvent(new CustomEvent("rv-debug", { detail: payload }));
}

export async function fetchRV(url, { timeoutMs = 10000, ...options } = {}) {
  const requestUrl = buildUrl(url);
  const proxyUrl = `/proxy?url=${encodeURIComponent(requestUrl)}`;
  const shouldProxy =
    typeof window !== "undefined" &&
    (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) &&
    !requestUrl.startsWith(window.location.origin);
  const finalUrl = shouldProxy ? proxyUrl : requestUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();

  emitDebug({ type: "request", url: finalUrl, method: options.method || "GET" });

  try {
    const response = await fetch(finalUrl, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const sourceLabel = shouldProxy ? "Proxy/API" : "API";
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      emitDebug({
        type: "error",
        url: finalUrl,
        status: response.status,
        durationMs,
        message: text || response.statusText
      });
      throw new Error(`${sourceLabel} error ${response.status}: ${text || response.statusText}`);
    }

    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    emitDebug({ type: "success", url: finalUrl, status: response.status, durationMs });
    return response.json();
  } catch (error) {
    const durationMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    emitDebug({
      type: "exception",
      url: finalUrl,
      durationMs,
      message: error?.message || "Request failed"
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
