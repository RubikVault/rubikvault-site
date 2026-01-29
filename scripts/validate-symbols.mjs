#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function formatAjvErrors(errors = []) {
  return errors.map((err) => {
    const loc = err.instancePath || err.schemaPath || "(root)";
    const msg = err.message || "schema error";
    return `- ${loc} ${msg}`;
  });
}

function fail(message, details = []) {
  console.error(`❌ ${message}`);
  if (details.length) {
    details.forEach((line) => console.error(line));
  }
  process.exit(1);
}

const root = process.cwd();
const symbolsPath = path.join(root, "config", "symbols.json");
const schemaPath = path.join(root, "config", "symbols.schema.json");

if (!fs.existsSync(symbolsPath)) {
  fail(`symbols file missing: ${symbolsPath}`);
}
if (!fs.existsSync(schemaPath)) {
  fail(`symbols schema missing: ${schemaPath}`);
}

let symbols;
let schema;
try {
  symbols = readJson(symbolsPath);
} catch (error) {
  fail(`unable to parse symbols JSON: ${symbolsPath}`, [String(error?.message || error)]);
}

try {
  schema = readJson(schemaPath);
} catch (error) {
  fail(`unable to parse symbols schema: ${schemaPath}`, [String(error?.message || error)]);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const valid = validate(symbols);
if (!valid) {
  fail("symbols.json failed schema validation", formatAjvErrors(validate.errors));
}

const issues = [];
const uuidSet = new Set();
const assetIdSet = new Set();
const activePairSet = new Set();

symbols.forEach((entry, index) => {
  const label = entry?.asset_id ? `${entry.asset_id} (#${index})` : `index ${index}`;
  const uuid = entry?.uuid;
  const assetId = entry?.asset_id;
  const ticker = entry?.ticker;
  const mic = entry?.mic;
  const active = entry?.active !== false;

  if (uuidSet.has(uuid)) {
    issues.push(`- duplicate uuid: ${uuid} (${label})`);
  } else {
    uuidSet.add(uuid);
  }

  if (assetIdSet.has(assetId)) {
    issues.push(`- duplicate asset_id: ${assetId} (${label})`);
  } else {
    assetIdSet.add(assetId);
  }

  // Enforce unique (ticker, mic) among active symbols. Inactive entries may duplicate.
  if (active) {
    const pairKey = `${ticker}::${mic}`;
    if (activePairSet.has(pairKey)) {
      issues.push(`- duplicate active (ticker, mic): ${ticker}/${mic} (${label})`);
    } else {
      activePairSet.add(pairKey);
    }
  }
});

if (issues.length) {
  fail("symbols.json failed uniqueness checks", issues);
}

console.log("✅ symbols.json validation passed");
