#!/usr/bin/env node
/**
 * build-features-v2.mjs
 *
 * Additive v2 feature-contract index builder for:
 * - Forecast
 * - Scientific
 * - Elliott
 *
 * SSOT output: mirrors/features-v2/stock-insights/index.json
 * Publish output: public/data/features-v2/stock-insights/index.json
 *
 * Non-breaking: does not modify existing v1 artifacts.
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

const OUT_BASE_SSOT = path.join(ROOT, "mirrors/features-v2/stock-insights");
const OUT_BASE_PUBLISH = path.join(ROOT, "public/data/features-v2/stock-insights");

function pickAsOf(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return null;
}

function shardKeyForTicker(ticker) {
  const first = String(ticker || "").charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : "_";
}

async function readJsonSafe(filePath) {
  try {
    const raw = filePath.endsWith(".gz")
      ? zlib.gunzipSync(await fs.readFile(filePath)).toString("utf8")
      : await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function statIsoSafe(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function contractRecord({ value, asOf, source, status, reason }) {
  return {
    value: value || null,
    as_of: asOf || null,
    source: String(source || "unknown"),
    status: String(status || (value ? "ok" : "unavailable")),
    reason: reason ? String(reason) : null,
  };
}

async function main() {
  console.log("[features-v2] Loading source artifacts...");
  const scientificRaw = (await readJsonSafe(SRC_SCI)) || {};
  const forecastDoc = await readJsonSafe(SRC_FC);
  const marketphaseIndexDoc = await readJsonSafe(SRC_MP_INDEX);
  const forecastRows = Array.isArray(forecastDoc?.data?.forecasts) ? forecastDoc.data.forecasts : [];

  const scientificAsOf = await statIsoSafe(SRC_SCI);
  const forecastAsOf = pickAsOf(forecastDoc?.freshness, forecastDoc?.generated_at, await statIsoSafe(SRC_FC));
  const marketphaseAsOf = await statIsoSafe(SRC_MP_DIR);

  let marketphaseFiles = [];
  try {
    marketphaseFiles = await fs.readdir(SRC_MP_DIR);
  } catch {
    marketphaseFiles = [];
  }
  const elliottFullTickers = new Set(
    (Array.isArray(marketphaseIndexDoc?.data?.symbols) ? marketphaseIndexDoc.data.symbols : [])
      .map((row) => String(typeof row === "string" ? row : row?.symbol || "").toUpperCase())
      .filter(Boolean)
  );
  const elliottFileTickers = new Set(
    marketphaseFiles
      .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
      .map((f) => f.replace(/\.json$/i, "").toUpperCase())
      .filter(Boolean)
  );
  const elliottProxyTickers = new Set(
    [...elliottFileTickers].filter((ticker) => !elliottFullTickers.has(ticker))
  );

  const scientificTickers = Object.keys(scientificRaw || {})
    .filter((key) => !String(key || "").startsWith("_"))
    .map((k) => String(k || "").toUpperCase())
    .filter(Boolean);
  const forecastTickers = forecastRows
    .map((r) => String(r?.symbol || r?.ticker || "").toUpperCase())
    .filter(Boolean);

  const allTickersSet = new Set([
    ...scientificTickers,
    ...forecastTickers,
    ...elliottFullTickers,
    ...elliottProxyTickers
  ]);
  const allTickers = Array.from(allTickersSet).sort();

  const shards = {};
  let scientificOk = 0;
  let forecastOk = 0;
  let elliottOk = 0;
  let elliottProxy = 0;

  console.log(`[features-v2] Processing ${allTickers.length} tickers into shards...`);

  for (const ticker of allTickers) {
    const sciEntry = scientificRaw?.[ticker] || null;
    const sciAvailable = Boolean(sciEntry && sciEntry.status !== "DATA_UNAVAILABLE");
    const fcEntry = forecastRows.find((r) => String(r?.symbol || r?.ticker || "").toUpperCase() === ticker) || null;
    const fcAvailable = Boolean(fcEntry);
    const ewFull = elliottFullTickers.has(ticker);
    const ewProxy = !ewFull && elliottProxyTickers.has(ticker);

    if (sciAvailable) scientificOk += 1;
    if (fcAvailable) forecastOk += 1;
    if (ewFull) elliottOk += 1;
    if (ewProxy) elliottProxy += 1;

    const row = {
      scientific: contractRecord({
        value: sciAvailable ? sciEntry : null,
        asOf: scientificAsOf,
        source: "stock-analysis.snapshot",
        status: sciAvailable ? "ok" : (sciEntry?.status === "DATA_UNAVAILABLE" ? "unavailable" : (sciEntry?.status === "ERROR" ? "error" : "unavailable")),
        reason: sciAvailable ? null : (sciEntry?.reason || sciEntry?.status || "MISSING_SCIENTIFIC_ENTRY"),
      }),
      forecast: contractRecord({
        value: fcAvailable ? fcEntry : null,
        asOf: forecastAsOf,
        source: "forecast.latest",
        status: fcAvailable ? "ok" : "unavailable",
        reason: fcAvailable ? null : "MISSING_FORECAST_ENTRY",
      }),
      elliott: contractRecord({
        value: ewFull || ewProxy ? { active: true } : null, // placeholders; full depth loaded by API if needed from marketphase/{ticker}.json
        asOf: marketphaseAsOf,
        source: ewFull ? "marketphase.index" : ewProxy ? "marketphase.bridge" : "marketphase.per_ticker",
        status: ewFull ? "ok" : ewProxy ? "proxy" : "unavailable",
        reason: ewFull ? null : ewProxy ? "BRIDGE_PAYLOAD" : "MISSING_ELLIOTT_ENTRY",
      }),
    };

    const sKey = shardKeyForTicker(ticker);
    if (!shards[sKey]) shards[sKey] = {};
    shards[sKey][ticker] = row;
  }

  const generatedAt = new Date().toISOString();
  const meta = {
    schema_version: "rv.features-v2.stock-insights.meta.v1",
    generated_at: generatedAt,
    counts: {
      tickers_total: allTickers.length,
      scientific_ok_total: scientificOk,
      forecast_ok_total: forecastOk,
      elliott_ok_total: elliottOk,
      elliott_proxy_total: elliottProxy,
    },
    shard_map: Object.keys(shards).sort(),
    shard_template: "/data/features-v2/stock-insights/shards/{shard}.json"
  };

  // Write Meta
  const metaJson = JSON.stringify(meta, null, 2);
  await ensureDirFor(path.join(OUT_BASE_PUBLISH, "index.json"));
  await fs.writeFile(path.join(OUT_BASE_PUBLISH, "index.json"), metaJson, "utf8");
  await ensureDirFor(path.join(OUT_BASE_SSOT, "index.json"));
  await fs.writeFile(path.join(OUT_BASE_SSOT, "index.json"), metaJson, "utf8");

  // Write Shards
  for (const [sKey, rows] of Object.entries(shards)) {
    const shardDoc = {
      schema_version: "rv.features-v2.stock-insights.shard.v1",
      generated_at: generatedAt,
      shard: sKey,
      rows,
    };
    const shardJson = JSON.stringify(shardDoc, null, 0); // Minimize shard size
    const shardJsonPretty = JSON.stringify(shardDoc, null, 2);

    const pubPath = path.join(OUT_BASE_PUBLISH, "shards", `${sKey}.json`);
    const ssotPath = path.join(OUT_BASE_SSOT, "shards", `${sKey}.json`);

    await ensureDirFor(pubPath);
    await fs.writeFile(pubPath, shardJson, "utf8");
    await ensureDirFor(ssotPath);
    await fs.writeFile(ssotPath, shardJsonPretty, "utf8");
  }

  console.log(`[features-v2] Wrote meta and ${Object.keys(shards).length} shards to ${OUT_BASE_PUBLISH}`);
  console.log(
    `[features-v2] tickers=${allTickers.length} scientific_ok=${scientificOk} forecast_ok=${forecastOk} elliott_ok=${elliottOk} elliott_proxy=${elliottProxy}`
  );
}

main().catch((err) => {
  console.error("[features-v2] build failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
