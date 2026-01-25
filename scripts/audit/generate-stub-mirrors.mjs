#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { saveMirror } from "../utils/mirror-io.mjs";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "public", "data", "feature-registry.v1.json");

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

const registry = readJson(REGISTRY_PATH);
if (!registry || !Array.isArray(registry.features)) {
  process.stderr.write("Missing or invalid registry. Run build-feature-registry first.\n");
  process.exit(1);
}

let created = 0;
registry.features.forEach((feature) => {
  const mirrorPath = feature.mirrorPath || `mirrors/${feature.id}.json`;
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
  saveMirror(fullPath, stub);
  created += 1;
});

process.stdout.write(`Stub mirrors created: ${created}\n`);
