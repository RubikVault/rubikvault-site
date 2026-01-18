import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const FRED_GRAPH_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

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

function parseFredGraphCsv(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map((v) => v.trim().toUpperCase());
  const dateIdx = header.indexOf("DATE") >= 0 ? header.indexOf("DATE") : header.indexOf("OBSERVATION_DATE");
  const valueIdx = header.findIndex((h, idx) => idx !== dateIdx);
  if (dateIdx < 0 || valueIdx < 0) return null;
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    const date = (cols[dateIdx] || "").trim();
    const valueRaw = (cols[valueIdx] || "").trim();
    const valueNum = Number(valueRaw);
    out.push({
      date,
      value: Number.isFinite(valueNum) ? valueNum : null
    });
  }
  return out.filter((row) => row.date);
}

export async function fetchFredSeries(ctx, seriesId, { limit = 1 } = {}) {
  const apiKey = process.env.FRED_API_KEY || "";
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "series" }) : { endpoint: "series" };

  if (apiKey) {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: String(limit)
    });
    const url = `${FRED_BASE}?${params.toString()}`;

    const { res, text } = await fetchWithRetry(url, requestCtx, {
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

  const csvParams = new URLSearchParams({ id: seriesId });
  const url = `${FRED_GRAPH_BASE}?${csvParams.toString()}`;
  const { res, text } = await fetchWithRetry(url, requestCtx, {
    headers: { "User-Agent": "RVSeeder/1.0" },
    timeoutMs: 10000
  });

  const contentType = res.headers.get("content-type") || "";
  const trimmed = String(text || "").trim().toLowerCase();
  if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
    throw buildProviderError(
      "PROVIDER_BAD_PAYLOAD",
      "fredgraph_html_payload",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  const observations = parseFredGraphCsv(text);
  if (!observations || !observations.length) {
    throw buildProviderError(
      "PROVIDER_SCHEMA_MISMATCH",
      "fredgraph_schema_mismatch",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  const filtered = observations
    .filter((row) => row && row.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, Math.max(1, Number(limit) || 1));

  if (!contentType.includes("text/csv")) {
    console.warn("fredgraph content-type not csv; parsed successfully", { seriesId });
  }

  const dataAt = filtered.map((entry) => entry.date).filter(Boolean).sort().slice(-1)[0] || null;
  return { data: filtered, dataAt };
}
