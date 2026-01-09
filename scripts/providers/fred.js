import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

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
    throw buildProviderError("MISSING_SECRET", "missing_fred_api_key", {
      httpStatus: null,
      snippet: "missing FRED_API_KEY",
      urlHost: "api.stlouisfed.org"
    });
  }
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: String(limit)
  });
  const url = `${FRED_BASE}?${params.toString()}`;

  const { res, text } = await fetchWithRetry(url, ctx, {
    headers: { "User-Agent": "RVSeeder/1.0" },
    timeoutMs: 10000
  });

  const contentType = res.headers.get("content-type") || "";

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    if (contentType.includes("application/json")) {
      throw buildProviderError(
        "PROVIDER_BAD_PAYLOAD",
        "fred_json_parse_failed",
        normalizeProviderDetails(url, { snippet: text })
      );
    }
    const trimmed = String(text || "").trim().toLowerCase();
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw buildProviderError(
        "PROVIDER_BAD_PAYLOAD",
        "fred_html_payload",
        normalizeProviderDetails(url, { snippet: text })
      );
    }
    throw buildProviderError(
      "PROVIDER_BAD_PAYLOAD",
      "fred_json_parse_failed",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  if (!contentType.includes("application/json")) {
    console.warn("fred content-type not json; parsed successfully", { seriesId });
  }

  const observations = parseObservations(payload);
  if (!observations) {
    throw buildProviderError(
      "PROVIDER_SCHEMA_MISMATCH",
      "fred_schema_mismatch",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  const dataAt = observations
    .map((entry) => entry.date)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  return { data: observations, dataAt };
}
