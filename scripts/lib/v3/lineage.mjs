import fs from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./gzip-deterministic.mjs";

export async function buildLineage(rootDir, sourcePaths = [], extra = {}) {
  const sources = [];
  for (const relPath of sourcePaths) {
    const absPath = path.join(rootDir, relPath);
    const exists = await fs.access(absPath).then(() => true).catch(() => false);
    if (!exists) {
      sources.push({ path: relPath, exists: false, sha256: null });
      continue;
    }
    sources.push({
      path: relPath,
      exists: true,
      sha256: await sha256File(absPath)
    });
  }
  return {
    sources,
    ...extra
  };
}

export async function validateLineage(rootDir, lineage) {
  const failures = [];
  for (const source of lineage?.sources || []) {
    const absPath = path.join(rootDir, source.path);
    const exists = await fs.access(absPath).then(() => true).catch(() => false);
    if (!exists) {
      failures.push(`LINEAGE_SOURCE_MISSING:${source.path}`);
      continue;
    }
    if (source.sha256) {
      const actual = await sha256File(absPath);
      if (actual !== source.sha256) {
        failures.push(`LINEAGE_HASH_MISMATCH:${source.path}`);
      }
    }
  }
  return {
    ok: failures.length === 0,
    failures
  };
}
