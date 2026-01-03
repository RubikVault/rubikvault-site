#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "features", "feature-registry.json");
const MIRRORS_DIR = path.join(ROOT, "public", "mirrors");

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeId(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  const noPrefix = trimmed.startsWith("rv-") ? trimmed.slice(3) : trimmed;
  return noPrefix.toLowerCase();
}

function titleCase(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        out[key] = sortObject(value[key]);
      });
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value), null, 2);
}

function extractHtmlFeatures() {
  const htmlPaths = [
    path.join(ROOT, "public", "index.html"),
    path.join(ROOT, "index.html")
  ];
  const htmlPath = htmlPaths.find((p) => fs.existsSync(p));
  if (!htmlPath) return [];
  const html = fs.readFileSync(htmlPath, "utf8");
  const regex = /data-rv-feature="([^"]+)"/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(html))) {
    const normalized = normalizeId(match[1]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

function extractMirrorFeatures() {
  if (!fs.existsSync(MIRRORS_DIR)) return [];
  return fs
    .readdirSync(MIRRORS_DIR)
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !["manifest.json", "_health.json"].includes(file))
    .map((file) => file.replace(/\.json$/, ""))
    .map(normalizeId)
    .filter(Boolean);
}

function defaultEntry(id) {
  return {
    id,
    name: titleCase(id),
    mirrorPath: `public/mirrors/${id}.json`,
    schemaVersion: "v1",
    staleAfterMinutes: 1440,
    critical: false,
    requiredFields: ["meta.status", "meta.updatedAt"],
    providers: [],
    _deprecated: false
  };
}

function mergeFeature(existing, discovered, now) {
  const merged = { ...discovered, ...(existing || {}) };
  merged._lastSeen = now;
  merged._deprecated = false;
  if (merged._deprecatedReason) delete merged._deprecatedReason;
  if (merged._deprecatedAt) delete merged._deprecatedAt;
  return merged;
}

function buildRegistry() {
  const now = nowIso();
  const htmlFeatures = extractHtmlFeatures();
  const mirrorFeatures = extractMirrorFeatures();
  const discoveredIds = Array.from(new Set([...htmlFeatures, ...mirrorFeatures])).sort();

  const existing = readJson(REGISTRY_PATH);
  const existingFeatures = Array.isArray(existing?.features) ? existing.features : [];
  const existingById = new Map(existingFeatures.map((entry) => [String(entry.id).toLowerCase(), entry]));

  const features = [];
  discoveredIds.forEach((id) => {
    const discovered = defaultEntry(id);
    const existingEntry = existingById.get(id);
    features.push(mergeFeature(existingEntry, discovered, now));
  });

  existingFeatures.forEach((entry) => {
    const id = normalizeId(entry.id);
    if (!id) return;
    if (!discoveredIds.includes(id)) {
      const deprecated = { ...entry };
      deprecated._deprecated = true;
      deprecated._deprecatedAt = now;
      deprecated._deprecatedReason = "Removed from discovery (HTML/mirrors)";
      deprecated._lastSeen = deprecated._lastSeen || now;
      features.push(deprecated);
    }
  });

  const sorted = features.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    registryVersion: "1.0",
    generatedAt: now,
    features: sorted
  };
}

function writeRegistry(registry) {
  const next = stableStringify(registry);
  if (fs.existsSync(REGISTRY_PATH)) {
    const current = fs.readFileSync(REGISTRY_PATH, "utf8");
    if (current.trim() === next.trim()) {
      process.stdout.write("Registry unchanged.\n");
      return;
    }
  }
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  const tmpPath = `${REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmpPath, next);
  fs.renameSync(tmpPath, REGISTRY_PATH);
  process.stdout.write(`Registry written: ${REGISTRY_PATH}\n`);
}

const registry = buildRegistry();
writeRegistry(registry);

const stats = {
  total: registry.features.length,
  deprecated: registry.features.filter((f) => f._deprecated).length
};
process.stdout.write(`Summary: total=${stats.total} deprecated=${stats.deprecated}\n`);
