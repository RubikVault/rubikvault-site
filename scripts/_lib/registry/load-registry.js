import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadRegistryBuilt(rootDir = process.cwd()) {
  const filePath = path.join(rootDir, "registry", "registry-built.json");
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export function getEntry(registry, featureId) {
  const list = Array.isArray(registry?.features) ? registry.features : [];
  return list.find((entry) => entry.id === featureId) || null;
}
