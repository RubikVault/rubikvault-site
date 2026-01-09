import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://api.marketaux.com/v1/news/all";

export async function fetchMarketauxNews(ctx, { symbols = "SPY", limit = 10 } = {}) {
  const apiKey = process.env.MARKETAUX_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("MISSING_SECRET", "missing_marketaux_api_key", {
      httpStatus: null,
      snippet: "missing MARKETAUX_API_KEY",
      urlHost: "api.marketaux.com"
    });
  }

  const params = new URLSearchParams({
    symbols,
    limit: String(limit),
    api_token: apiKey
  });
  const url = `${BASE_URL}?${params.toString()}`;

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, ctx, {
      headers: { "User-Agent": "RVSeeder/1.0" },
      timeoutMs: 15000
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "marketaux_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "api.marketaux.com"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "marketaux_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "api.marketaux.com"
    });
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType && !contentType.includes("application/json")) {
    console.warn("marketaux content-type not json; parsed successfully");
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const items = rows.slice(0, limit).map((row) => ({
    title: row.title || "",
    source: row.source || row.source_name || "",
    sentiment: Number.isFinite(row.sentiment_score) ? row.sentiment_score : null,
    date: row.published_at || row.date || null
  }));

  const dataAt = rows
    .map((row) => row.published_at || row.date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return { data: items, dataAt };
}
