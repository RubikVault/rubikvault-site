#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function die(msg) {
  process.stderr.write(`UNIVERSE_REGISTRY_INVALID: ${msg}\n`);
  process.exit(1);
}

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

function loadJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  try { return JSON.parse(raw); } catch (e) { die(`JSON parse failed for ${p}: ${e.message}`); }
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (!seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

const repoRoot = process.cwd();
const file = path.join(repoRoot, "public/data/registry/universe.v1.json");
if (!fs.existsSync(file)) die(`missing file: ${file}`);

const doc = loadJson(file);
if (!isObj(doc)) die("root must be an object");
if (String(doc.schema_version || "") !== "1.0") die("schema_version must be '1.0'");
if (String(doc.universe_version || "") !== "v1") die("universe_version must be 'v1'");
if (!isObj(doc.groups)) die("groups must be an object");
if (!isObj(doc.symbol_rules)) die("symbol_rules must be an object");

const pat = new RegExp(doc.symbol_rules.allowed_pattern || "^[A-Z0-9.\\-]{1,15}$");
const maxTotal = Number.isFinite(doc.symbol_rules.max_total_symbols) ? doc.symbol_rules.max_total_symbols : 6000;
const dedupe = doc.symbol_rules.dedupe_across_groups !== false;

let all = [];
for (const [groupName, group] of Object.entries(doc.groups)) {
  if (!isObj(group)) die(`group '${groupName}' must be an object`);
  if (!Array.isArray(group.symbols)) die(`group '${groupName}'.symbols must be an array`);
  for (const sym of group.symbols) {
    if (typeof sym !== "string") die(`symbol in '${groupName}' must be string`);
    const s = sym.trim();
    if (!s) die(`empty symbol in '${groupName}'`);
    if (!pat.test(s)) die(`symbol '${s}' in '${groupName}' does not match allowed_pattern`);
    all.push(s);
  }
}

const total = dedupe ? uniq(all).length : all.length;
if (total > maxTotal) die(`too many symbols: ${total} > max_total_symbols=${maxTotal}`);

process.stdout.write(`OK: universe registry v1 valid (symbols_total=${total})\n`);
