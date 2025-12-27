import { XMLParser } from "fast-xml-parser";
import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchText,
  isHtmlLike,
  safeSnippet,
  swrGetOrRefresh,
  normalizeFreshness
} from "./_shared.js";

const FEATURE_ID = "yield-curve";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 72 * 60 * 60;
const CACHE_KEY = "DASH:YIELD_CURVE";
const TREASURY_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/DailyTreasuryYieldCurveRateData.xml";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true });

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractEntries(parsed) {
  const feed = parsed?.feed || parsed?.Feed || parsed;
  let entries = feed?.entry || feed?.Entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries;
}

function extractProperties(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.properties) return entry.properties;
  if (entry.content?.properties) return entry.content.properties;
  if (entry["m:properties"]) return entry["m:properties"];
  if (entry.content?.["m:properties"]) return entry.content["m:properties"];
  return entry;
}

function parseYieldCurve(xml) {
  if (!xml || isHtmlLike(xml)) {
    return { ok: false, error: "HTML_RESPONSE" };
  }
  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    return { ok: false, error: "SCHEMA_INVALID" };
  }

  const entries = extractEntries(parsed)
    .map(extractProperties)
    .filter(Boolean);
  if (!entries.length) {
    return { ok: false, error: "SCHEMA_INVALID" };
  }

  const latest = entries
    .map((entry) => {
      const dateRaw = entry.NEW_DATE || entry.DATE || entry.date || entry.Date;
      const date = dateRaw ? new Date(dateRaw).toISOString() : null;
      return { entry, date, dateTs: date ? Date.parse(date) : 0 };
    })
    .sort((a, b) => b.dateTs - a.dateTs)[0];

  const entry = latest?.entry || entries[0];
  const date = latest?.date || new Date().toISOString();

  const yields = {
    "3m": parseNumber(entry.BC_3MONTH || entry.BC_3Month || entry.BC_3_Month),
    "2y": parseNumber(entry.BC_2YEAR || entry.BC_2Year),
    "10y": parseNumber(entry.BC_10YEAR || entry.BC_10Year),
    "30y": parseNumber(entry.BC_30YEAR || entry.BC_30Year)
  };

  const spreads = {
    tenTwo:
      yields["10y"] !== null && yields["2y"] !== null ? yields["10y"] - yields["2y"] : null,
    tenThreeMonth:
      yields["10y"] !== null && yields["3m"] !== null ? yields["10y"] - yields["3m"] : null
  };

  return {
    ok: true,
    data: {
      updatedAt: date,
      yields,
      spreads,
      inversion: {
        tenTwo: spreads.tenTwo !== null ? spreads.tenTwo < 0 : null,
        tenThreeMonth: spreads.tenThreeMonth !== null ? spreads.tenThreeMonth < 0 : null
      },
      source: "US Treasury"
    }
  };
}

async function fetchYieldCurve(env) {
  const res = await safeFetchText(TREASURY_URL, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok) {
    return { ok: false, error: "UPSTREAM_5XX", snippet: safeSnippet(res.text) };
  }
  const parsed = parseYieldCurve(res.text || "");
  if (!parsed.ok) {
    return { ok: false, error: parsed.error || "SCHEMA_INVALID", snippet: safeSnippet(res.text) };
  }
  return { ok: true, data: parsed.data, snippet: "" };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchYieldCurve(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: TREASURY_URL, status: null, snippet: swr.error?.snippet || "" },
      error: {
        code: swr.error?.error || "UPSTREAM_5XX",
        message: "No upstream data",
        details: {}
      },
      cacheStatus: "ERROR"
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: TREASURY_URL, status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
