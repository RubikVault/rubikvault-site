import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildGraph, findCycle } from "./_lib/util/dag.js";

function isType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateAgainstSchema(registry, schema, label) {
  if (!schema || typeof schema !== "object") {
    throw new Error("feature-registry.schema.json missing or invalid");
  }
  for (const key of schema.required || []) {
    if (!(key in registry)) {
      throw new Error(`${label} missing required field: ${key}`);
    }
  }
  for (const [key, def] of Object.entries(schema.properties || {})) {
    if (key in registry && def.type && !isType(registry[key], def.type)) {
      throw new Error(`${label} field ${key} must be ${def.type}`);
    }
  }

  const featureSchema = schema.properties?.features?.items;
  if (!featureSchema) return new Set();
  const ids = new Set();
  for (const entry of registry.features) {
    for (const key of featureSchema.required || []) {
      if (!(key in entry)) {
        throw new Error(`${label} entry missing required field: ${key}`);
      }
    }
    for (const [key, def] of Object.entries(featureSchema.properties || {})) {
      if (key in entry && def.type && !isType(entry[key], def.type)) {
        throw new Error(`${label} entry ${entry.id} field ${key} must be ${def.type}`);
      }
    }
    if (ids.has(entry.id)) {
      throw new Error(`${label} duplicate id: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return ids;
}

async function main() {
  const root = process.cwd();
  const sourcePath = path.join(root, "registry", "feature-registry.json");
  const builtPath = path.join(root, "registry", "registry-built.json");
  const schemaPath = path.join(root, "schemas", "feature-registry.schema.json");

  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  const built = JSON.parse(await readFile(builtPath, "utf8"));
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));

  const sourceIds = validateAgainstSchema(source, schema, "feature-registry.json");
  const builtIds = validateAgainstSchema(built, schema, "registry-built.json");

  if (sourceIds.size !== builtIds.size) {
    throw new Error("registry-built.json must contain the same features as feature-registry.json");
  }
  for (const id of sourceIds) {
    if (!builtIds.has(id)) {
      throw new Error(`registry-built.json missing feature id: ${id}`);
    }
  }

  const graph = buildGraph(built);
  const cycle = findCycle(graph);
  if (cycle) {
    throw new Error(`Dependency cycle detected: ${cycle.join(" -> ")}`);
  }

  console.log("Registry validation OK");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
