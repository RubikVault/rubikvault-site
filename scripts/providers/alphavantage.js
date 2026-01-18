import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const BASE_URL = "https://www.alphavantage.co/query";

function parseDailyPayload(payload) {
  const series = payload?.["Time Series (Daily)"];
  if (!series || typeof series !== "object") return null;
  const dates = Object.keys(series).sort().reverse();
  const latest = dates[0];
  const bar = latest ? series[latest] : null;
  if (!latest || !bar) return null;
  return {
    date: latest,
    open: Number.parseFloat(bar["1. open"] || "nan"),
    high: Number.parseFloat(bar["2. high"] || "nan"),
    low: Number.parseFloat(bar["3. low"] || "nan"),
    close: Number.parseFloat(bar["4. close"] || "nan"),
    volume: Number.parseInt(bar["6. volume"] || "0", 10) || 0,
    barsUsed: dates.length
  };
}

export async function fetchAlphaVantageDaily(ctx, symbol) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "daily" }) : { endpoint: "daily" };
  const apiKey = process.env.AV_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("MISSING_SECRET", "missing_av_api_key", {
      httpStatus: null,
      snippet: "missing AV_API_KEY",
      urlHost: "www.alphavantage.co"
    });
  }

  const url = `${BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(
    symbol
  )}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;

  let res;
  let text;
  try {
    ({ res, text } = await fetchWithRetry(url, requestCtx, {
      headers: { "User-Agent": "RVSeeder/1.0" },
      timeoutMs: 20000
    }));
  } catch (error) {
    if (error?.reason) {
      error.details = normalizeProviderDetails(url, error.details || {});
      throw error;
    }
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", error?.message || "alphavantage_fetch_failed", {
      httpStatus: null,
      snippet: "",
      urlHost: "www.alphavantage.co"
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "alphavantage_json_parse_failed", {
      httpStatus: res.status,
      snippet: String(text || "").slice(0, 200),
      urlHost: "www.alphavantage.co"
    });
  }

  if (payload?.Note) {
    throw buildProviderError(
      "RATE_LIMITED",
      "alphavantage_rate_limited",
      normalizeProviderDetails(url, { snippet: payload.Note })
    );
  }

  const parsed = parseDailyPayload(payload);
  if (!parsed) {
    throw buildProviderError(
      "PROVIDER_SCHEMA_MISMATCH",
      "alphavantage_schema_mismatch",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  return { data: parsed, dataAt: parsed.date || null };
}
