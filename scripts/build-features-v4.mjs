#!/usr/bin/env node
/**
 * build-features-v4.mjs
 *
 * Additive v4 contract index builder for:
 * - scientific
 * - forecast
 * - elliott
 *
 * Output:
 * - mirrors/features-v4/stock-insights/index.json
 * - public/data/features-v4/stock-insights/index.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SRC_SCI = path.join(ROOT, "public/data/snapshots/stock-analysis.json");
const SRC_FC = path.join(ROOT, "public/data/forecast/latest.json");
const SRC_MP_DIR = path.join(ROOT, "public/data/marketphase");
const SRC_MP_INDEX = path.join(ROOT, "public/data/marketphase/index.json");
const SRC_UNIVERSE = path.join(ROOT, "public/data/universe/v7/search/search_exact_by_symbol.json.gz");

const OUT_SSOT = path.join(ROOT, "mirrors/features-v4/stock-insights/index.json");
const OUT_PUBLISH = path.join(ROOT, "public/data/features-v4/stock-insights/index.json");

function pickAsOf(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return null;
}

async function readJsonSafe(absPath) {
  try {
    const raw = absPath.endsWith(".gz")
      ? zlib.gunzipSync(await fs.readFile(absPath)).toString("utf8")
      : await fs.readFile(absPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function statIsoSafe(absPath) {
  try {
    const st = await fs.stat(absPath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

async function ensureDirFor(absPath) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
}

function stateRow({ value, asOf, source, reason, status }) {
  return {
    value: Boolean(value),
    as_of: asOf || null,
    source: String(source || "unknown"),
    status: String(status || (value ? "ok" : "unavailable")),
    reason: reason ? String(reason) : (value ? null : "NO_DATA"),
  };
}

async function main() {
  const scientificRaw = (await readJsonSafe(SRC_SCI)) || {};
  const forecastDoc = await readJsonSafe(SRC_FC);
  const marketphaseIndexDoc = await readJsonSafe(SRC_MP_INDEX);
  const forecastRows = Array.isArray(forecastDoc?.data?.forecasts) ? forecastDoc.data.forecasts : [];
  const universeExactDoc = (await readJsonSafe(SRC_UNIVERSE)) || {};
  const universeExact = universeExactDoc?.by_symbol && typeof universeExactDoc.by_symbol === "object"
    ? universeExactDoc.by_symbol
    : universeExactDoc;

  let marketphaseFiles = [];
  try {
    marketphaseFiles = await fs.readdir(SRC_MP_DIR);
  } catch {
    marketphaseFiles = [];
  }

  const scientificAsOf = await statIsoSafe(SRC_SCI);
  const forecastAsOf = pickAsOf(forecastDoc?.freshness, forecastDoc?.generated_at, await statIsoSafe(SRC_FC));
  const elliottAsOf = await statIsoSafe(SRC_MP_DIR);

  const scientificTickers = Object.keys(scientificRaw)
    .filter((key) => !String(key || "").startsWith("_"))
    .map((k) => String(k || "").toUpperCase())
    .filter(Boolean);
  const forecastTickers = forecastRows.map((r) => String(r?.symbol || r?.ticker || "").toUpperCase()).filter(Boolean);
  const elliottFullTickers = new Set(
    (Array.isArray(marketphaseIndexDoc?.data?.symbols) ? marketphaseIndexDoc.data.symbols : [])
      .map((row) => String(typeof row === "string" ? row : row?.symbol || "").toUpperCase())
      .filter(Boolean)
  );
  const elliottFileTickers = marketphaseFiles
    .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
    .map((f) => f.replace(/\.json$/i, "").toUpperCase())
    .filter(Boolean);
  const elliottProxyTickers = new Set(
    elliottFileTickers.filter((ticker) => !elliottFullTickers.has(ticker))
  );
  const universeTickers = Object.keys(universeExact).map((k) => String(k || "").toUpperCase()).filter(Boolean);

  const allTickers = Array.from(
    new Set([
      ...universeTickers,
      ...scientificTickers,
      ...forecastTickers,
      ...elliottFullTickers,
      ...elliottProxyTickers
    ])
  ).sort();

  const scientificSet = new Set(scientificTickers);
  const forecastSet = new Set(forecastTickers);
  const elliottSet = elliottFullTickers;

  let scientificOk = 0;
  let forecastOk = 0;
  let elliottOk = 0;
  let elliottProxy = 0;
  let allThreeOk = 0;

  const rows = {};
  for (const ticker of allTickers) {
    const sciEntry = scientificRaw[ticker] || null;
    const scientificValue = Boolean(sciEntry && sciEntry.status !== "DATA_UNAVAILABLE" && scientificSet.has(ticker));
    const forecastValue = forecastSet.has(ticker);
    const elliottValue = elliottSet.has(ticker);
    const elliottProxyValue = !elliottValue && elliottProxyTickers.has(ticker);

    if (scientificValue) scientificOk += 1;
    if (forecastValue) forecastOk += 1;
    if (elliottValue) elliottOk += 1;
    if (elliottProxyValue) elliottProxy += 1;
    if (scientificValue && forecastValue && elliottValue) allThreeOk += 1;

    rows[ticker] = {
      scientific: stateRow({
        value: scientificValue,
        asOf: scientificAsOf,
        source: "stock-analysis.snapshot",
        reason: scientificValue ? null : (sciEntry?.status === "DATA_UNAVAILABLE" ? "DATA_UNAVAILABLE" : "MISSING_SCIENTIFIC_ENTRY"),
      }),
      forecast: stateRow({
        value: forecastValue,
        asOf: forecastAsOf,
        source: "forecast.latest",
        reason: forecastValue ? null : "MISSING_FORECAST_ENTRY",
      }),
      elliott: stateRow({
        value: elliottValue || elliottProxyValue,
        asOf: elliottAsOf,
        source: elliottValue ? "marketphase.index" : elliottProxyValue ? "marketphase.bridge" : "marketphase.per_ticker",
        reason: elliottValue ? null : elliottProxyValue ? "BRIDGE_PAYLOAD" : "MISSING_ELLIOTT_ENTRY",
        status: elliottValue ? "ok" : elliottProxyValue ? "proxy" : "unavailable",
      }),
      v4_shadow_ready: stateRow({
        value: scientificValue && forecastValue && elliottValue,
        asOf: pickAsOf(scientificAsOf, forecastAsOf, elliottAsOf),
        source: "features-v4.index",
        reason: scientificValue && forecastValue && elliottValue ? null : "FEATURE_GAP",
      }),
    };
  }

  const doc = {
    schema_version: "rv.features-v4.stock-insights.index.v1",
    generated_at: new Date().toISOString(),
    source_priority: ["v3_derived", "snapshots", "api_runtime_fallback"],
    counts: {
      tickers_total: allTickers.length,
      scientific_ok_total: scientificOk,
      forecast_ok_total: forecastOk,
      elliott_ok_total: elliottOk,
      elliott_proxy_total: elliottProxy,
      all_three_ok_total: allThreeOk,
    },
    rows,
  };

  await ensureDirFor(OUT_SSOT);
  await ensureDirFor(OUT_PUBLISH);
  const serialized = JSON.stringify(doc, null, 2);
  await fs.writeFile(OUT_SSOT, serialized, "utf8");
  await fs.writeFile(OUT_PUBLISH, serialized, "utf8");

  console.log(`[features-v4] wrote ${OUT_SSOT}`);
  console.log(`[features-v4] wrote ${OUT_PUBLISH}`);
  console.log(
    `[features-v4] tickers=${allTickers.length} scientific_ok=${scientificOk} forecast_ok=${forecastOk} elliott_ok=${elliottOk} elliott_proxy=${elliottProxy} all_three_ok=${allThreeOk}`
  );
}

main().catch((err) => {
  console.error("[features-v4] build failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
