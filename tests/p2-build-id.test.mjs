#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const root = process.cwd();
  const manifestPath = path.join(root, "public", "data", "manifest.json");
  const providerStatePath = path.join(root, "public", "data", "provider-state.json");

  if (!fs.existsSync(manifestPath)) {
    console.log("p2 build_id test: SKIP (public/data/manifest.json not present)");
    return;
  }

  const manifest = readJson(manifestPath);
  const manifestBuildId = manifest.build_id || manifest.active_build_id || null;
  assert(typeof manifestBuildId === "string" && manifestBuildId.length > 0, "manifest build_id missing");

  if (!fs.existsSync(providerStatePath)) {
    console.log("p2 build_id test: OK (provider-state.json not present)");
    return;
  }

  const ps = readJson(providerStatePath);
  const psBuildId = ps?.system?.build_id || null;
  assert(typeof psBuildId === "string" && psBuildId.length > 0, "provider-state system.build_id missing");
  assert(psBuildId === manifestBuildId, `build_id mismatch: manifest=${manifestBuildId} provider-state=${psBuildId}`);

  console.log("p2 build_id test: OK");
}

try {
  main();
} catch (error) {
  console.error(`p2 build_id test: FAIL\n${error.stack || error.message || String(error)}`);
  process.exit(1);
}
