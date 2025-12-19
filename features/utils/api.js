function buildUrl(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const base = (typeof window !== "undefined" && window.RV_CONFIG?.apiBase) ? window.RV_CONFIG.apiBase : "";
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${prefix}${path}`;
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
      throw new Error(`${sourceLabel} error ${response.status}: ${text || response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
