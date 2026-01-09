import fs from "node:fs";
import path from "node:path";

const REGISTRY_PATH = path.join("public", "data", "feature-registry.json");
const MANIFEST_PATH = path.join("public", "data", "seed-manifest.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

const registry = readJson(REGISTRY_PATH);
if (!registry || typeof registry !== "object") {
  fail("Registry payload must be an object");
}
if (!Array.isArray(registry.features)) {
  fail("Registry payload missing features array");
}

const manifest = readJson(MANIFEST_PATH);
if (!manifest || typeof manifest !== "object") {
  fail("Manifest payload must be an object");
}
if (!Array.isArray(manifest.blocks)) {
  fail("Manifest payload missing blocks array");
}

const registryCount = registry.features.length;
const manifestCount = manifest.blocks.length;
if (registryCount < manifestCount) {
  fail(`Registry features (${registryCount}) must be >= manifest blocks (${manifestCount})`);
}

console.log(
  `Public registry OK (features=${registryCount}, manifestBlocks=${manifestCount})`
);
