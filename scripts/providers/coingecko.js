import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://api.coingecko.com/api/v3/simple/price";

export async function fetchCoinGeckoSimple(ctx, { ids = [], vsCurrency = "usd", includeMarketCap = true, include24hChange = true } = {}) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "simple" }) : { endpoint: "simple" };
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "coingecko_missing_ids", {
      httpStatus: null,
      snippet: "ids list empty",
      urlHost: "api.coingecko.com"
    });
  }

  const params = new URLSearchParams({
    ids: list.join(","),
    vs_currencies: vsCurrency,
    include_market_cap: includeMarketCap ? "true" : "false",
    include_24hr_change: include24hChange ? "true" : "false"
  });
  const url = `${BASE_URL}?${params.toString()}`;

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, requestCtx, {
      headers: { "User-Agent": "RVSeeder/1.0" },
      timeoutMs: 15000
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "coingecko_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "api.coingecko.com"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "coingecko_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "api.coingecko.com"
    });
  }

  if (!payload || typeof payload !== "object") {
    throw buildProviderError("PROVIDER_SCHEMA_MISMATCH", "coingecko_schema_mismatch", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "api.coingecko.com"
    });
  }

  return { data: payload, dataAt: new Date().toISOString() };
}
