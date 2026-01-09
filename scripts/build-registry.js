import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertFeatureRegistry(registry) {
  if (!registry || typeof registry !== "object") {
    throw new Error("feature-registry.json must be an object");
  }
  if (!Array.isArray(registry.features)) {
    throw new Error("feature-registry.json features must be an array");
  }
  for (const entry of registry.features) {
    if (!entry.id || !entry.title || !entry.provider) {
      throw new Error(`feature entry missing required fields: ${JSON.stringify(entry)}`);
    }
  }
}

function normalizeFeature(entry) {
  const deps = Array.isArray(entry.dependencies) ? entry.dependencies.slice().sort() : [];
  const base = {
    id: String(entry.id),
    title: String(entry.title),
    tier: String(entry.tier || "CORE"),
    provider: String(entry.provider || "internal"),
    cadencePerDay: Number(entry.cadencePerDay || 0),
    maxFanout: Number(entry.maxFanout || 1),
    primaryKey: String(entry.primaryKey || "items"),
    dependencies: deps
  };
  if (entry.poisonGuard && typeof entry.poisonGuard === "object") {
    base.poisonGuard = {
      minItems: Number(entry.poisonGuard.minItems || 0),
      allowEmpty: Boolean(entry.poisonGuard.allowEmpty)
    };
  }
  if (entry.creditsPerRequest !== undefined) {
    base.creditsPerRequest = Number(entry.creditsPerRequest || 0);
  }
  return base;
}

async function main() {
  const root = process.cwd();
  const srcPath = path.join(root, "registry", "feature-registry.json");
  const destPath = path.join(root, "registry", "registry-built.json");

  const raw = await readFile(srcPath, "utf8");
  const registry = JSON.parse(raw);
  assertFeatureRegistry(registry);

  const features = registry.features.map(normalizeFeature).sort((a, b) => a.id.localeCompare(b.id));
  const built = {
    schemaVersion: registry.schemaVersion || "v1",
    features
  };

  const output = stableStringify(built) + "\n";
  await writeFile(destPath, output, "utf8");
  console.log(`Wrote ${destPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
