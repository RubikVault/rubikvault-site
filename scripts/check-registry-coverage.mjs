#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

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

const { FEATURES = [] } = await loadModule("rv-config.js", "rv-config.js");
const { BLOCK_REGISTRY = {} } = await loadModule("features/blocks-registry.js", "blocks-registry.js");

const registryIds = new Set(Object.keys(BLOCK_REGISTRY || {}).map(normalizeFeatureId));
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
  console.error("Missing registry entries:", missing.map((entry) => entry.id).join(", "));
}

if (coverageRaw < 95) {
  console.error(`Coverage below threshold (${coverage}% < 95%).`);
  process.exit(1);
}

if (coverage < 100) {
  console.warn(`Coverage warning: ${coverage}% (< 100%).`);
}
