import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

export async function fetchRssFeed(ctx, url) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "rss" }) : { endpoint: "rss" };
  if (!url) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "rss_missing_url", {
      httpStatus: null,
      snippet: "",
      urlHost: ""
    });
  }

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, requestCtx, {
      headers: {
        "User-Agent": "RVSeeder/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      },
      timeoutMs: 15000
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "rss_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: ""
    });
  }

  if (!res.ok) {
    throw buildProviderError(
      "PROVIDER_HTTP_ERROR",
      `rss_http_${res.status}`,
      normalizeProviderDetails(url, { httpStatus: res.status, snippet: text })
    );
  }

  const trimmed = String(text || "").trim().toLowerCase();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw buildProviderError(
      "PROVIDER_BAD_PAYLOAD",
      "rss_html_payload",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  return { data: text, dataAt: new Date().toISOString() };
}
