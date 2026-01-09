import { buildProviderError, fetchWithRetry } from "./_shared.js";

const ECB_BASE = "https://sdw-wsrest.ecb.europa.eu/service/data";

function parseLatestObservation(payload) {
  const obsDimension = payload?.structure?.dimensions?.observation?.[0];
  const obsValues = obsDimension?.values || [];
  const lastIndex = obsValues.length - 1;
  const lastPeriod = obsValues[lastIndex]?.id || obsValues[lastIndex]?.name || null;

  const series = payload?.dataSets?.[0]?.series;
  const firstSeries = series ? Object.values(series)[0] : null;
  const obs = firstSeries?.observations?.[lastIndex];
  const value = Array.isArray(obs) ? obs[0] : null;

  if (!Number.isFinite(value)) return null;
  return { value, period: lastPeriod };
}

export async function fetchEcbSeries(ctx, seriesKey) {
  const url = `${ECB_BASE}/${seriesKey}?format=sdmx-json&lastNObservations=1`;
  const { text, res } = await fetchWithRetry(url, ctx, {
    headers: { "User-Agent": "RVSeeder/1.0" }
  });

  const contentType = res?.headers?.get("content-type") || "";
  const trimmed = String(text || "").trim().toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "ecb_non_json", {
      seriesKey,
      contentType,
      snippet: text.slice(0, 200)
    });
  }
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "ecb_html_payload", {
      seriesKey,
      snippet: text.slice(0, 200)
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "ecb_json_parse_failed", {
      seriesKey,
      message: error?.message || "parse_failed",
      snippet: text.slice(0, 200)
    });
  }

  const latest = parseLatestObservation(payload);
  if (!latest) {
    throw buildProviderError("PROVIDER_SCHEMA_MISMATCH", "ecb_schema_mismatch", { seriesKey });
  }

  return { data: latest, dataAt: latest.period };
}
