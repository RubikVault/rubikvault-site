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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SRC_SCI = path.join(ROOT, "public/data/snapshots/stock-analysis.json");
const SRC_FC = path.join(ROOT, "public/data/forecast/latest.json");
const SRC_MP_DIR = path.join(ROOT, "public/data/marketphase");

const OUT_SSOT = path.join(ROOT, "mirrors/features-v2/stock-insights/index.json");
const OUT_PUBLISH = path.join(ROOT, "public/data/features-v2/stock-insights/index.json");

function pickAsOf(...values) {
  for (const v of values) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return null;
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
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
    value: Boolean(value),
    as_of: asOf || null,
    source: String(source || "unknown"),
    status: String(status || (value ? "ok" : "unavailable")),
    reason: reason ? String(reason) : null,
  };
}

async function main() {
  const scientificRaw = (await readJsonSafe(SRC_SCI)) || {};
  const forecastDoc = await readJsonSafe(SRC_FC);
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
  const elliottTickers = new Set(
    marketphaseFiles
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/i, "").toUpperCase())
      .filter(Boolean)
  );

  const scientificTickers = Object.keys(scientificRaw || {})
    .map((k) => String(k || "").toUpperCase())
    .filter(Boolean);
  const forecastTickers = forecastRows
    .map((r) => String(r?.symbol || "").toUpperCase())
    .filter(Boolean);

  const allTickers = Array.from(new Set([...scientificTickers, ...forecastTickers, ...elliottTickers])).sort();

  const rows = {};
  let scientificOk = 0;
  let forecastOk = 0;
  let elliottOk = 0;

  for (const ticker of allTickers) {
    const sciEntry = scientificRaw?.[ticker] || null;
    const sciAvailable = Boolean(sciEntry && sciEntry.status !== "DATA_UNAVAILABLE");
    const fcAvailable = forecastRows.some((r) => String(r?.symbol || "").toUpperCase() === ticker);
    const ewAvailable = elliottTickers.has(ticker);

    if (sciAvailable) scientificOk += 1;
    if (fcAvailable) forecastOk += 1;
    if (ewAvailable) elliottOk += 1;

    rows[ticker] = {
      scientific: contractRecord({
        value: sciAvailable,
        asOf: scientificAsOf,
        source: "stock-analysis.snapshot",
        status: sciAvailable ? "ok" : "unavailable",
        reason: sciAvailable ? null : (sciEntry?.status === "DATA_UNAVAILABLE" ? "DATA_UNAVAILABLE" : "MISSING_SCIENTIFIC_ENTRY"),
      }),
      forecast: contractRecord({
        value: fcAvailable,
        asOf: forecastAsOf,
        source: "forecast.latest",
        status: fcAvailable ? "ok" : "unavailable",
        reason: fcAvailable ? null : "MISSING_FORECAST_ENTRY",
      }),
      elliott: contractRecord({
        value: ewAvailable,
        asOf: marketphaseAsOf,
        source: "marketphase.per_ticker",
        status: ewAvailable ? "ok" : "unavailable",
        reason: ewAvailable ? null : "MISSING_ELLIOTT_ENTRY",
      }),
    };
  }

  const doc = {
    schema_version: "rv.features-v2.stock-insights.index.v1",
    generated_at: new Date().toISOString(),
    source_priority: ["v3_derived", "snapshots", "api_runtime_fallback"],
    counts: {
      tickers_total: allTickers.length,
      scientific_ok_total: scientificOk,
      forecast_ok_total: forecastOk,
      elliott_ok_total: elliottOk,
    },
    rows,
  };

  await ensureDirFor(OUT_SSOT);
  await ensureDirFor(OUT_PUBLISH);

  const json = JSON.stringify(doc, null, 2);
  await fs.writeFile(OUT_SSOT, json, "utf8");
  await fs.writeFile(OUT_PUBLISH, json, "utf8");

  console.log(`[features-v2] wrote ${OUT_SSOT}`);
  console.log(`[features-v2] wrote ${OUT_PUBLISH}`);
  console.log(
    `[features-v2] tickers=${allTickers.length} scientific_ok=${scientificOk} forecast_ok=${forecastOk} elliott_ok=${elliottOk}`
  );
}

main().catch((err) => {
  console.error("[features-v2] build failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
