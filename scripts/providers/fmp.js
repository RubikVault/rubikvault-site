import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://financialmodelingprep.com/api";

async function fetchFmpJson(ctx, path, params) {
  const apiKey = process.env.FMP_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("MISSING_SECRET", "missing_fmp_api_key", {
      httpStatus: null,
      snippet: "missing FMP_API_KEY",
      urlHost: "financialmodelingprep.com"
    });
  }

  const search = new URLSearchParams({ ...params, apikey: apiKey });
  const url = `${BASE_URL}${path}?${search.toString()}`;

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, ctx, {
      headers: { "User-Agent": "RVSeeder/1.0" }
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "fmp_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "financialmodelingprep.com"
    });
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "fmp_non_json", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "financialmodelingprep.com"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "fmp_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "financialmodelingprep.com"
    });
  }

  return { payload, url };
}

export async function fetchFmpEarningsCalendar(ctx, { limit = 10 } = {}) {
  const { payload, url } = await fetchFmpJson(ctx, "/v3/earning_calendar", { limit });
  const rows = Array.isArray(payload) ? payload : [];
  const dataAt = rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  return { data: rows, dataAt, urlHost: new URL(url).host };
}

export async function fetchFmpInsiderTrades(ctx, { limit = 10 } = {}) {
  const { payload, url } = await fetchFmpJson(ctx, "/v4/insider-trading", { limit });
  const rows = Array.isArray(payload) ? payload : [];
  const dataAt = rows
    .map((row) => row.transactionDate || row.date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  return { data: rows, dataAt, urlHost: new URL(url).host };
}

export async function fetchFmpAnalystRevisions(ctx, { symbol = "SPY" } = {}) {
  const { payload, url } = await fetchFmpJson(ctx, "/v3/analyst-stock-recommendations", { symbol });
  const rows = Array.isArray(payload) ? payload : [];
  const dataAt = rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  return { data: rows, dataAt, urlHost: new URL(url).host };
}
