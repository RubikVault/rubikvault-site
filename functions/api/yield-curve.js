import { XMLParser } from "fast-xml-parser";
import { safeFetchText, isHtmlLike, safeSnippet } from "./_shared.js";
import { withResilience } from "./_shared/resilience.js";

const FEATURE_ID = "yield-curve";
const VERSION = "v1";
const TTL_STALE = 72 * 60 * 60;
const CIRCUIT_SEC = 1800;
const TREASURY_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/DailyTreasuryYieldCurveRateData.xml";
const TREASURY_CSV_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/DailyTreasuryYieldCurveRateData.csv";

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
    "1m": parseNumber(entry.BC_1MONTH || entry.BC_1Month || entry.BC_1_Month),
    "3m": parseNumber(entry.BC_3MONTH || entry.BC_3Month || entry.BC_3_Month),
    "6m": parseNumber(entry.BC_6MONTH || entry.BC_6Month || entry.BC_6_Month),
    "1y": parseNumber(entry.BC_1YEAR || entry.BC_1Year),
    "2y": parseNumber(entry.BC_2YEAR || entry.BC_2Year),
    "3y": parseNumber(entry.BC_3YEAR || entry.BC_3Year),
    "5y": parseNumber(entry.BC_5YEAR || entry.BC_5Year),
    "7y": parseNumber(entry.BC_7YEAR || entry.BC_7Year),
    "10y": parseNumber(entry.BC_10YEAR || entry.BC_10Year),
    "20y": parseNumber(entry.BC_20YEAR || entry.BC_20Year),
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

function parseCsvLine(line) {
  return line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function parseYieldCurveCsv(csv) {
  if (!csv || isHtmlLike(csv)) return { ok: false, error: "HTML_RESPONSE" };
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return { ok: false, error: "SCHEMA_INVALID" };
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const lastLine = lines[lines.length - 1];
  const values = parseCsvLine(lastLine);
  if (headers.length !== values.length) return { ok: false, error: "SCHEMA_INVALID" };
  const row = Object.fromEntries(headers.map((key, idx) => [key, values[idx]]));
  const date = row.date ? new Date(row.date).toISOString() : new Date().toISOString();
  const yields = {
    "1m": parseNumber(row["1 mo"] || row["1 mo."] || row["1 month"]),
    "3m": parseNumber(row["3 mo"] || row["3 mo."] || row["3 month"]),
    "6m": parseNumber(row["6 mo"] || row["6 mo."] || row["6 month"]),
    "1y": parseNumber(row["1 yr"] || row["1 year"]),
    "2y": parseNumber(row["2 yr"] || row["2 year"]),
    "3y": parseNumber(row["3 yr"] || row["3 year"]),
    "5y": parseNumber(row["5 yr"] || row["5 year"]),
    "7y": parseNumber(row["7 yr"] || row["7 year"]),
    "10y": parseNumber(row["10 yr"] || row["10 year"]),
    "20y": parseNumber(row["20 yr"] || row["20 year"]),
    "30y": parseNumber(row["30 yr"] || row["30 year"])
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

function mergeYieldFallback(current, fallback) {
  if (!fallback) return current;
  const merged = { ...current };
  Object.keys(fallback).forEach((key) => {
    if (merged[key] === null || merged[key] === undefined) {
      merged[key] = fallback[key];
    }
  });
  return merged;
}

function validateYieldCurve(data) {
  const yields = data?.yields || {};
  const count = Object.values(yields).filter((value) => Number.isFinite(value)).length;
  if (count >= 5) return { passed: true };
  return { passed: false, failReason: "NOT_ENOUGH_POINTS" };
}

async function fetchYieldCurve({ env, signal, lastGood }) {
  const ua = env.USER_AGENT || "RubikVault/1.0";
  const xmlRes = await safeFetchText(TREASURY_URL, { userAgent: ua, signal });
  if (xmlRes.ok) {
    const parsed = parseYieldCurve(xmlRes.text || "");
    if (parsed.ok) {
      const fallbackYields = lastGood?.yields || null;
      parsed.data.yields = mergeYieldFallback(parsed.data.yields, fallbackYields);
      return {
        data: parsed.data,
        upstreamStatus: xmlRes.status ?? 200,
        upstreamUrl: TREASURY_URL,
        snippet: ""
      };
    }
  }

  const csvRes = await safeFetchText(TREASURY_CSV_URL, { userAgent: ua, signal });
  if (csvRes.ok) {
    const parsedCsv = parseYieldCurveCsv(csvRes.text || "");
    if (parsedCsv.ok) {
      const fallbackYields = lastGood?.yields || null;
      parsedCsv.data.yields = mergeYieldFallback(parsedCsv.data.yields, fallbackYields);
      return {
        data: parsedCsv.data,
        upstreamStatus: csvRes.status ?? 200,
        upstreamUrl: TREASURY_CSV_URL,
        snippet: ""
      };
    }
  }

  const snippet = safeSnippet(xmlRes.text || csvRes.text || "");
  const status = xmlRes.status || csvRes.status || null;
  const error = new Error("No upstream data");
  error.code = xmlRes.ok || csvRes.ok ? "SCHEMA_INVALID" : "UPSTREAM_FAIL";
  error.status = status;
  error.message = "No upstream data";
  error.details = { snippet };
  throw error;
}

export async function onRequestGet(context) {
  return withResilience(context, {
    featureId: FEATURE_ID,
    version: VERSION,
    fetcher: fetchYieldCurve,
    validator: validateYieldCurve,
    ttlStaleSec: TTL_STALE,
    circuitSec: CIRCUIT_SEC,
    lastGoodKey: "lastgood:yield-curve",
    upstreamUrl: `${TREASURY_URL} | ${TREASURY_CSV_URL}`
  });
}
