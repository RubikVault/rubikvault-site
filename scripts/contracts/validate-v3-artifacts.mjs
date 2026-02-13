#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = process.cwd();

async function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  const raw = await fs.readFile(abs, "utf8");
  return JSON.parse(raw);
}

async function readNdjsonGzFirst(relPath) {
  const abs = path.join(ROOT, relPath);
  const buf = await fs.readFile(abs);
  const text = zlib.gunzipSync(buf).toString("utf8");
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return null;
  return JSON.parse(first);
}

function compile(ajv, schema) {
  return ajv.compile(schema);
}

function assertValid(validate, value, label) {
  const ok = validate(value);
  if (!ok) {
    const detail = JSON.stringify(validate.errors || [], null, 2);
    throw new Error(`CONTRACT_FAIL:${label}:${detail}`);
  }
}

async function main() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const healthSchema = await readJson("policies/schemas/rv.health.v3.json");
  const manifestSchema = await readJson("policies/schemas/rv.manifest.v3.json");
  const eodSchema = await readJson("policies/schemas/rv.eod.v3.json");
  const fxSchema = await readJson("policies/schemas/rv.fx.v1.json");
  const pulseSchema = await readJson("policies/schemas/rv.pulse.v3.json");
  const newsSchema = await readJson("policies/schemas/rv.news.v2.json");
  const fundamentalsSchema = await readJson("policies/schemas/rv.fundamentals.v1.json");

  const validateHealth = compile(ajv, healthSchema);
  const validateManifest = compile(ajv, manifestSchema);
  const validateEod = compile(ajv, eodSchema);
  const validateFx = compile(ajv, fxSchema);
  const validatePulse = compile(ajv, pulseSchema);
  const validateNews = compile(ajv, newsSchema);
  const validateFundamentals = compile(ajv, fundamentalsSchema);

  assertValid(validateHealth, await readJson("public/data/v3/system/health.json"), "health");

  const manifestPaths = [
    "public/data/v3/universe/manifest.json",
    "public/data/v3/eod/US/manifest.json",
    "public/data/v3/fx/rates/manifest.json",
    "public/data/v3/actions/manifest.json",
    "public/data/v3/series/manifest.json",
    "public/data/v3/pulse/manifest.json",
    "public/data/v3/news/manifest.json",
    "public/data/v3/derived/manifest.json",
    "public/data/v3/fundamentals/manifest.json"
  ];

  for (const manifestPath of manifestPaths) {
    assertValid(validateManifest, await readJson(manifestPath), manifestPath);
  }

  assertValid(validateFx, await readJson("public/data/v3/fx/rates/latest.json"), "fx");
  assertValid(validatePulse, await readJson("public/data/v3/pulse/top-movers/latest.json"), "pulse_top_movers");
  assertValid(validatePulse, await readJson("public/data/v3/pulse/market-health/latest.json"), "pulse_market_health");
  assertValid(validateNews, await readJson("public/data/v3/news/signals/latest.json"), "news_signals");
  assertValid(validateFundamentals, await readJson("public/data/v3/universe/sector-mapping/latest.json"), "sector_mapping");

  const eodFirst = await readNdjsonGzFirst("public/data/v3/eod/US/latest.ndjson.gz");
  if (!eodFirst) throw new Error("CONTRACT_FAIL:eod_latest_empty");
  assertValid(validateEod, eodFirst, "eod_latest_first_row");

  console.log("V3_CONTRACTS_OK");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
