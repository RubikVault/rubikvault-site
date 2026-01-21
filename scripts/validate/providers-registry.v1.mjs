#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function die(msg) {
  process.stderr.write(`PROVIDERS_REGISTRY_INVALID: ${msg}\n`);
  process.exit(1);
}

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

function loadJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  try { return JSON.parse(raw); } catch (e) { die(`JSON parse failed for ${p}: ${e.message}`); }
}

const repoRoot = process.cwd();
const file = path.join(repoRoot, "public", "data", "registry", "providers.v1.json");
if (!fs.existsSync(file)) die(`missing file: ${file}`);

const doc = loadJson(file);
if (!isObj(doc)) die("root must be an object");
if (String(doc.schema_version || "") !== "1.0") die("schema_version must be '1.0'");
if (String(doc.providers_version || "") !== "v1") die("providers_version must be 'v1'");

if (!Array.isArray(doc.providers)) die("providers must be an array");

const requiredKeys = ["id", "base_url", "auth_env_var", "default_throttle_ms", "burst_cap", "timeout_ms"];
const seenIds = new Set();
for (const provider of doc.providers) {
  if (!isObj(provider)) die("provider entry must be an object");
  for (const key of requiredKeys) {
    if (!(key in provider)) die(`provider '${provider.id || "unknown"}' missing required key '${key}'`);
  }
  const id = String(provider.id || "").trim();
  if (!id) die("provider id must be a non-empty string");
  if (seenIds.has(id)) die(`duplicate provider id '${id}'`);
  seenIds.add(id);

  if (typeof provider.base_url !== "string" || !provider.base_url.trim()) {
    die(`provider '${id}' base_url must be a non-empty string`);
  }
  if (typeof provider.auth_env_var !== "string" || !provider.auth_env_var.trim()) {
    die(`provider '${id}' auth_env_var must be a non-empty string`);
  }
  const throttle = Number(provider.default_throttle_ms);
  if (!Number.isFinite(throttle) || throttle < 0) {
    die(`provider '${id}' default_throttle_ms must be a non-negative number`);
  }
  const burst = Number(provider.burst_cap);
  if (!Number.isFinite(burst) || burst < 0) {
    die(`provider '${id}' burst_cap must be a non-negative number`);
  }
  const timeout = Number(provider.timeout_ms);
  if (!Number.isFinite(timeout) || timeout < 0) {
    die(`provider '${id}' timeout_ms must be a non-negative number`);
  }
}

process.stdout.write(`OK: providers registry v1 valid (providers=${doc.providers.length})\n`);
