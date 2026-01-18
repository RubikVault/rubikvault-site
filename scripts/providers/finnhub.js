import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://finnhub.io/api/v1";

export async function fetchFinnhubOptionChain(ctx, { symbol = "SPY" } = {}) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "option-chain" }) : { endpoint: "option-chain" };
  const apiKey = process.env.FINNHUB_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("MISSING_SECRET", "missing_finnhub_api_key", {
      httpStatus: null,
      snippet: "missing FINNHUB_API_KEY",
      urlHost: "finnhub.io"
    });
  }

  const params = new URLSearchParams({ symbol, token: apiKey });
  const url = `${BASE_URL}/stock/option-chain?${params.toString()}`;

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
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "finnhub_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "finnhub.io"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "finnhub_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "finnhub.io"
    });
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType && !contentType.includes("application/json")) {
    console.warn("finnhub content-type not json; parsed successfully");
  }

  const chain = Array.isArray(payload?.data) ? payload.data : [];
  return { data: chain, dataAt: payload?.date || null };
}
