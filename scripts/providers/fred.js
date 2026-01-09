import { buildProviderError, fetchWithRetry } from "./_shared.js";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

function parseObservations(payload) {
  const obs = payload?.observations;
  if (!Array.isArray(obs)) return null;
  return obs.map((entry) => {
    const value = Number(entry.value);
    return {
      date: entry.date,
      value: Number.isFinite(value) ? value : null
    };
  });
}

export async function fetchFredSeries(ctx, seriesId, { limit = 1 } = {}) {
  const apiKey = process.env.FRED_API_KEY || "";
  if (!apiKey) {
    throw buildProviderError("PROVIDER_HTTP_ERROR", "missing_fred_api_key", { seriesId });
  }
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: String(limit)
  });
  const url = `${FRED_BASE}?${params.toString()}`;

  const { text } = await fetchWithRetry(url, ctx, {
    headers: { "User-Agent": "RVSeeder/1.0" }
  });

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "fred_json_parse_failed", {
      seriesId,
      message: error?.message || "parse_failed"
    });
  }

  const observations = parseObservations(payload);
  if (!observations) {
    throw buildProviderError("PROVIDER_SCHEMA_MISMATCH", "fred_schema_mismatch", { seriesId });
  }

  const dataAt = observations[0]?.date || null;
  return { data: observations, dataAt };
}
