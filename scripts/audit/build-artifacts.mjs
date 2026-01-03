#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "features", "feature-registry.json");
const MIRRORS_DIR = path.join(ROOT, "public", "mirrors");
const MANIFEST_PATH = path.join(MIRRORS_DIR, "manifest.json");
const HEALTH_PATH = path.join(MIRRORS_DIR, "_health.json");

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

function safeCommit() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

function shouldWrite(filePath, next) {
  if (!fs.existsSync(filePath)) return true;
  const current = fs.readFileSync(filePath, "utf8");
  return current.trim() !== next.trim();
}

const registry = readJson(REGISTRY_PATH);
if (!registry || !Array.isArray(registry.features)) {
  process.stderr.write("Missing or invalid registry. Run build-feature-registry first.\n");
  process.exit(1);
}

const commit = safeCommit();
const generatedAt = nowIso();
const manifestBlocks = [];
const healthFeatures = {};

registry.features.forEach((feature) => {
  const mirrorPath = feature.mirrorPath || `public/mirrors/${feature.id}.json`;
  const fullPath = path.isAbsolute(mirrorPath) ? mirrorPath : path.join(ROOT, mirrorPath);
  let json = null;
  let parseError = null;
  try {
    json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    parseError = error;
  }

  const fileRel = mirrorPath.replace(/^public\//, "");
  const schemaVersion = json?.meta?.schemaVersion || json?.schemaVersion || "v1";
  const updatedAt = json?.meta?.updatedAt || json?.meta?.savedAt || json?.updatedAt || null;
  const staleAfter = Number(feature.staleAfterMinutes || 1440);
  let status = "OK";
  let reasonCode = "OK";
  let ageMinutes = null;

  if (parseError) {
    status = "ERROR";
    reasonCode = "JSON_PARSE_ERROR";
  } else if (!json) {
    status = "ERROR";
    reasonCode = "MIRROR_MISSING";
  } else if (json?.meta?.status === "STUB") {
    status = "STUB";
    reasonCode = "MIRROR_MISSING";
  } else if (updatedAt) {
    const ageMs = Date.now() - Date.parse(updatedAt);
    ageMinutes = Math.max(0, Math.round(ageMs / 60000));
    if (Number.isFinite(ageMinutes) && ageMinutes > staleAfter) {
      status = "STALE";
      reasonCode = "STALE_DATA";
    }
  }

  healthFeatures[feature.id] = {
    status,
    updatedAt: updatedAt || null,
    ageMinutes,
    reasonCode,
    evidence: {
      file: fileRel,
      updatedAt: updatedAt || null,
      staleAfterMinutes: staleAfter,
      errorMessage: parseError ? parseError.message : null
    }
  };

  manifestBlocks.push({
    id: feature.id,
    file: fileRel.replace(/^mirrors\//, "mirrors/"),
    schemaVersion,
    optional: Boolean(feature.optional),
    generatedAt: updatedAt
  });
});

const manifest = {
  version: "1.0",
  generated_at: generatedAt,
  commit,
  blocks: manifestBlocks.sort((a, b) => String(a.id).localeCompare(String(b.id)))
};

const health = {
  generatedAt,
  features: Object.fromEntries(
    Object.entries(healthFeatures).sort(([a], [b]) => String(a).localeCompare(String(b)))
  )
};

const manifestText = JSON.stringify(manifest, null, 2);
const healthText = JSON.stringify(health, null, 2);

if (shouldWrite(MANIFEST_PATH, manifestText) || shouldWrite(HEALTH_PATH, healthText)) {
  const tmpManifest = `${MANIFEST_PATH}.tmp`;
  const tmpHealth = `${HEALTH_PATH}.tmp`;
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(tmpManifest, manifestText);
  fs.writeFileSync(tmpHealth, healthText);
  fs.renameSync(tmpManifest, MANIFEST_PATH);
  fs.renameSync(tmpHealth, HEALTH_PATH);
  process.stdout.write("Artifacts written.\n");
} else {
  process.stdout.write("Artifacts unchanged.\n");
}
