#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "feature-registry.json");

function toFileUrl(filePath) {
  return pathToFileURL(path.join(ROOT, filePath)).href;
}

function normalizeFeatureId(id) {
  if (!id) return "";
  const trimmed = String(id).trim().toLowerCase();
  const noPrefix = trimmed.startsWith("rv-") ? trimmed.slice(3) : trimmed;
  return noPrefix.replace(/-v[0-9]+$/, "");
}

async function loadModule(modulePath, label) {
  try {
    return await import(toFileUrl(modulePath));
  } catch (error) {
    console.error(`Failed to load ${label}:`, error?.message || error);
    process.exit(1);
  }
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error("feature-registry.json missing at repo root");
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("feature-registry.json must be an array");
      process.exit(1);
    }
    return parsed;
  } catch (error) {
    console.error("failed to parse feature-registry.json:", error?.message || error);
    process.exit(1);
  }
}

const { FEATURES = [] } = await loadModule("rv-config.js", "rv-config.js");
const registryEntries = loadRegistry();
const registryIds = new Set(
  registryEntries.map((entry) => normalizeFeatureId(entry.id || entry.feature))
);
const serverSideFeatures = (FEATURES || []).filter((entry) => entry?.api);
const total = serverSideFeatures.length;
const missing = serverSideFeatures.filter(
  (entry) => !registryIds.has(normalizeFeatureId(entry.id))
);

const covered = total - missing.length;
const coverageRaw = total === 0 ? 100 : (covered / total) * 100;
const coverage = Math.round(coverageRaw * 100) / 100;

console.log(
  JSON.stringify(
    {
      totalServerSide: total,
      covered,
      coveragePercent: coverage,
      missing: missing.map((entry) => entry.id)
    },
    null,
    2
  )
);

if (missing.length > 0) {
  const missingIds = missing.map((entry) => entry.id);
  console.error("Add to feature-registry.json:", missingIds.join(", "));
  process.exit(1);
}

if (coverageRaw < 95) {
  console.error(`Coverage below threshold (${coverage}% < 95%).`);
  process.exit(1);
}

if (coverage < 100) {
  console.warn(`Coverage warning: ${coverage}% (< 100%).`);
}
