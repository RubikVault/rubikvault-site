#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "features", "feature-registry.json");

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

function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

const registry = readJson(REGISTRY_PATH);
if (!registry || !Array.isArray(registry.features)) {
  process.stderr.write("Missing or invalid registry. Run build-feature-registry first.\n");
  process.exit(1);
}

let created = 0;
registry.features.forEach((feature) => {
  const mirrorPath = feature.mirrorPath || `public/mirrors/${feature.id}.json`;
  const fullPath = path.isAbsolute(mirrorPath) ? mirrorPath : path.join(ROOT, mirrorPath);
  if (fs.existsSync(fullPath)) return;
  const stub = {
    meta: {
      feature: feature.id,
      status: "STUB",
      reason: "MIRROR_MISSING",
      updatedAt: nowIso(),
      schemaVersion: feature.schemaVersion || "v1"
    },
    data: {}
  };
  atomicWriteJson(fullPath, stub);
  created += 1;
});

process.stdout.write(`Stub mirrors created: ${created}\n`);
