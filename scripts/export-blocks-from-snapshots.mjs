import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_DIR = path.join(ROOT, "public", "data", "snapshots");
const BLOCKS_DIR = path.join(ROOT, "public", "data", "blocks");
const TMP_DIR = path.join(BLOCKS_DIR, ".tmp");

const NON_FREE_PROVIDERS = new Set(["marketaux", "finnhub", "fmp", "sec"]);

function parseArgs() {
  return {
    allowPaid: process.argv.includes("--allow-paid")
  };
}

async function loadFeatureRegistry() {
  const candidates = [
    path.join(ROOT, "public", "data", "feature-registry.json"),
    path.join(ROOT, "registry", "feature-registry.json")
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.features)) {
        return parsed.features;
      }
    } catch {
      continue;
    }
  }
  return [];
}

function buildBlockPolicy(features, { allowPaid }) {
  const byBlockId = new Map();
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const blockId = String(feature.blockId || feature.id || "").trim();
    if (!blockId) continue;
    byBlockId.set(blockId, feature);
  }

  function isAllowed(blockId) {
    if (allowPaid) return true;
    const feature = byBlockId.get(blockId);
    if (!feature) return true;
    const provider = String(feature.provider || "").toLowerCase();
    const requiredSecrets = Array.isArray(feature.requiredSecrets) ? feature.requiredSecrets : [];
    if (requiredSecrets.length > 0) return false;
    if (NON_FREE_PROVIDERS.has(provider)) return false;
    return true;
  }

  return { isAllowed };
}

async function listSnapshotFiles() {
  const entries = await fs.readdir(SNAPSHOT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => name !== "manifest.json");
}

async function atomicWrite(targetPath, payload) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tmpPath = path.join(TMP_DIR, `${path.basename(targetPath)}.tmp`);
  await fs.writeFile(tmpPath, payload);
  await fs.rename(tmpPath, targetPath);
}

async function exportSnapshotFile(fileName) {
  const sourcePath = path.join(SNAPSHOT_DIR, fileName);
  const raw = await fs.readFile(sourcePath, "utf8");

  let blockId = fileName.replace(/\.json$/i, "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.blockId === "string" && parsed.blockId.trim()) {
      blockId = parsed.blockId.trim();
    }
  } catch {
    return { fileName, ok: false, reason: "SNAPSHOT_JSON_PARSE_ERROR" };
  }

  const targetPath = path.join(BLOCKS_DIR, `${blockId}.latest.json`);
  await atomicWrite(targetPath, raw);
  return { fileName, ok: true, blockId };
}

async function removeStaleOutputs(blockIds) {
  for (const blockId of blockIds) {
    const targetPath = path.join(BLOCKS_DIR, `${blockId}.latest.json`);
    try {
      await fs.unlink(targetPath);
    } catch {
      continue;
    }
  }
}

async function main() {
  await fs.mkdir(BLOCKS_DIR, { recursive: true });

  const args = parseArgs();
  const features = await loadFeatureRegistry();
  const policy = buildBlockPolicy(features, args);

  let exported = 0;
  let skipped = 0;
  let failed = 0;
  const skippedBlockIds = new Set();

  const files = await listSnapshotFiles();
  for (const fileName of files) {
    try {
      const raw = await fs.readFile(path.join(SNAPSHOT_DIR, fileName), "utf8");
      let blockId = fileName.replace(/\.json$/i, "");
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && typeof parsed.blockId === "string" && parsed.blockId.trim()) {
          blockId = parsed.blockId.trim();
        }
      } catch {
        failed += 1;
        continue;
      }

      if (!policy.isAllowed(blockId)) {
        skipped += 1;
        skippedBlockIds.add(blockId);
        continue;
      }

      const result = await exportSnapshotFile(fileName);
      if (result.ok) exported += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  if (skippedBlockIds.size > 0) {
    await removeStaleOutputs(Array.from(skippedBlockIds));
  }

  console.log(`[export-blocks] exported=${exported} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
