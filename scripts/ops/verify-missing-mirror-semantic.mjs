#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const fileA = args[0] ? path.resolve(args[0]) : path.join(repoRoot, "public/data/marketphase/missing.json");
const fileB = args[1] ? path.resolve(args[1]) : path.join(repoRoot, "public/data/pipeline/missing.json");
const usingDefaultPaths = args.length === 0;

function exitWith(code, message) {
  if (message) console.error(message);
  process.exit(code);
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    exitWith(1, `IO/parse error for ${filePath}: ${err.message}`);
  }
}

if (usingDefaultPaths && (!fs.existsSync(fileA) || !fs.existsSync(fileB))) {
  const missing = [fileA, fileB].filter((filePath) => !fs.existsSync(filePath));
  console.warn(
    `WARN: semantic equivalence check skipped (generated artifacts missing): ${missing.join(", ")}`
  );
  process.exit(0);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function assertDocShape(doc, label) {
  if (!doc || typeof doc !== "object") {
    exitWith(2, `NOT GREEN: ${label} is not an object`);
  }
  for (const key of ["type", "universe", "expected", "missing"]) {
    if (!(key in doc)) {
      exitWith(2, `NOT GREEN: ${label} missing required key: ${key}`);
    }
  }
  if (!Array.isArray(doc.missing)) {
    exitWith(2, `NOT GREEN: ${label}.missing must be an array`);
  }
}

function buildReasonMap(doc, label) {
  const map = new Map();
  for (const entry of doc.missing) {
    if (!entry || typeof entry !== "object") {
      exitWith(2, `NOT GREEN: ${label}.missing entry is not an object`);
    }
    const symbol = entry.symbol || entry.ticker;
    if (!symbol || typeof symbol !== "string") {
      exitWith(2, `NOT GREEN: ${label}.missing entry lacks symbol/ticker`);
    }
    if (map.has(symbol)) {
      exitWith(2, `NOT GREEN: duplicate missing symbol in ${label}: ${symbol}`);
    }
    if (!("reason" in entry)) {
      exitWith(2, `NOT GREEN: ${label}.missing entry missing reason for ${symbol}`);
    }
    map.set(symbol, entry.reason);
  }
  return map;
}

const docA = readJson(fileA);
const docB = readJson(fileB);

assertDocShape(docA, "marketphase/missing.json");
assertDocShape(docB, "pipeline/missing.json");

if (docA.universe !== docB.universe) {
  exitWith(2, `NOT GREEN: universe mismatch (${docA.universe} vs ${docB.universe})`);
}
if (docA.expected !== docB.expected) {
  exitWith(2, `NOT GREEN: expected mismatch (${docA.expected} vs ${docB.expected})`);
}
if (docA.missing.length !== docB.missing.length) {
  exitWith(2, `NOT GREEN: missing length mismatch (${docA.missing.length} vs ${docB.missing.length})`);
}

const mapA = buildReasonMap(docA, "marketphase/missing.json");
const mapB = buildReasonMap(docB, "pipeline/missing.json");

const onlyA = [];
const onlyB = [];

for (const key of mapA.keys()) {
  if (!mapB.has(key)) onlyA.push(key);
}
for (const key of mapB.keys()) {
  if (!mapA.has(key)) onlyB.push(key);
}

if (onlyA.length || onlyB.length) {
  console.error(`NOT GREEN: symbol set mismatch (onlyA=${onlyA.length}, onlyB=${onlyB.length})`);
  if (onlyA.length) console.error(`only in marketphase: ${onlyA.slice(0, 5).join(", ")}`);
  if (onlyB.length) console.error(`only in pipeline: ${onlyB.slice(0, 5).join(", ")}`);
  process.exit(2);
}

for (const symbol of mapA.keys()) {
  const reasonA = mapA.get(symbol);
  const reasonB = mapB.get(symbol);
  if (stableStringify(reasonA) !== stableStringify(reasonB)) {
    console.error(`NOT GREEN: reason mismatch for ${symbol}`);
    console.error("marketphase:", JSON.stringify(reasonA, null, 2));
    console.error("pipeline:", JSON.stringify(reasonB, null, 2));
    process.exit(2);
  }
}

console.log("OK: semantic equivalence (reason map matches)");
