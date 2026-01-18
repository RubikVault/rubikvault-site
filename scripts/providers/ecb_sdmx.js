import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";
import { XMLParser } from "fast-xml-parser";

const ECB_BASE = "https://data-api.ecb.europa.eu/service/data";

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

function pickRoot(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj["message:GenericData"]) return obj["message:GenericData"];
  if (obj["GenericData"]) return obj["GenericData"];
  if (obj["message:StructureSpecificData"]) return obj["message:StructureSpecificData"];
  if (obj["StructureSpecificData"]) return obj["StructureSpecificData"];
  return obj;
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseLatestObservationXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false
  });
  const parsed = parser.parse(String(xmlText || ""));
  const root = pickRoot(parsed);
  const dataSet = root?.["message:DataSet"] || root?.DataSet;
  const series = dataSet?.["generic:Series"] || dataSet?.Series;
  const seriesList = ensureArray(series);
  const first = seriesList[0];
  const obs = first?.["generic:Obs"] || first?.Obs;
  const obsList = ensureArray(obs);
  const last = obsList[obsList.length - 1];

  const period =
    last?.["generic:ObsDimension"]?.["@_value"] ||
    last?.ObsDimension?.["@_value"] ||
    last?.["generic:ObsDimension"]?.value ||
    last?.ObsDimension?.value ||
    null;

  const valueRaw =
    last?.["generic:ObsValue"]?.["@_value"] ||
    last?.ObsValue?.["@_value"] ||
    last?.["generic:ObsValue"]?.value ||
    last?.ObsValue?.value ||
    null;

  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return null;
  return { value, period };
}

export async function fetchEcbSeries(ctx, seriesKey) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "sdmx" }) : { endpoint: "sdmx" };
  const url = `${ECB_BASE}/${seriesKey}?format=sdmx-json&lastNObservations=1`;
  const { text, res } = await fetchWithRetry(url, requestCtx, {
    headers: {
      "User-Agent": "RVSeeder/1.0",
      Accept: "application/vnd.sdmx.genericdata+xml;version=2.1,application/json"
    },
    timeoutMs: 30000
  });

  const contentType = res?.headers?.get("content-type") || "";
  const trimmed = String(text || "").trim().toLowerCase();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<message")) {
      const latestXml = parseLatestObservationXml(text);
      if (!latestXml) {
        throw buildProviderError(
          "PROVIDER_SCHEMA_MISMATCH",
          "ecb_xml_schema_mismatch",
          normalizeProviderDetails(url, { snippet: text })
        );
      }
      return { data: latestXml, dataAt: latestXml.period };
    }
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
      throw buildProviderError(
        "PROVIDER_BAD_PAYLOAD",
        "ecb_html_payload",
        normalizeProviderDetails(url, { snippet: text })
      );
    }
    throw buildProviderError(
      "PROVIDER_BAD_PAYLOAD",
      "ecb_json_parse_failed",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  if (contentType && !contentType.includes("application/json")) {
    console.warn("ecb content-type not json; parsed successfully", { seriesKey });
  }

  const latest = parseLatestObservation(payload);
  if (!latest) {
    throw buildProviderError(
      "PROVIDER_SCHEMA_MISMATCH",
      "ecb_schema_mismatch",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  return { data: latest, dataAt: latest.period };
}
