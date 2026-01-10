import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "registry", "feature-registry.json");
const snapshotsDir = path.join(root, "public", "data", "snapshots");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    throw new Error(`Empty ${filePath}`);
  }
  return JSON.parse(raw);
}

function assertRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("registry must be an object");
  }
  if (!registry.schemaVersion) {
    throw new Error("registry missing schemaVersion");
  }
  if (!Array.isArray(registry.features)) {
    throw new Error("registry missing features array");
  }
  return registry;
}

function loadSnapshotsIndex() {
  if (!fs.existsSync(snapshotsDir)) {
    throw new Error(`Missing snapshots dir: ${snapshotsDir}`);
  }
  return new Set(
    fs
      .readdirSync(snapshotsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, ""))
  );
}

const registry = assertRegistry(readJson(registryPath));
const enabled = registry.features.filter((entry) => entry && entry.enabled !== false);
const snapshotsIndex = loadSnapshotsIndex();

const missing = enabled.filter((entry) => {
  const id = entry.blockId || entry.id;
  return id && !snapshotsIndex.has(id);
});

if (missing.length) {
  console.error("Missing snapshots for enabled blocks:");
  missing.forEach((entry) => {
    const id = entry.blockId || entry.id || "unknown";
    console.error(`- ${id}`);
  });
  process.exit(1);
}

const statusCounts = {};
const nonLive = [];

for (const entry of enabled) {
  const id = entry.blockId || entry.id;
  const snapshotPath = path.join(snapshotsDir, `${id}.json`);
  let snapshot;
  try {
    snapshot = readJson(snapshotPath);
  } catch (error) {
    nonLive.push({ blockId: id, status: "MISSING", reason: "READ_FAIL" });
    statusCounts.MISSING = (statusCounts.MISSING || 0) + 1;
    continue;
  }
  const status = snapshot?.meta?.status || "UNKNOWN";
  const reason = snapshot?.meta?.reason || "UNKNOWN";
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  if (status !== "LIVE") {
    nonLive.push({ blockId: id, status, reason });
  }
}

console.log(`Enabled blocks: ${enabled.length}`);
console.log("Status counts:");
Object.entries(statusCounts).forEach(([key, value]) => {
  console.log(`- ${key}: ${value}`);
});
if (nonLive.length) {
  console.log("Non-LIVE snapshots:");
  nonLive.forEach((entry) => {
    console.log(`- ${entry.blockId}: ${entry.status} (${entry.reason})`);
  });
}
