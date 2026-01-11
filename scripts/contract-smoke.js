import { readFile } from "node:fs/promises";
import path from "node:path";

function validateEnvelope(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (typeof obj.ok !== "boolean") return false;
  if (typeof obj.feature !== "string") return false;
  if (!obj.meta || typeof obj.meta !== "object") return false;
  if (typeof obj.meta.status !== "string") return false;
  if (!obj.data || typeof obj.data !== "object") return false;
  if (!(obj.error === null || typeof obj.error === "object")) return false;
  return true;
}

function hasArray(value) {
  return Array.isArray(value);
}

async function validateTechSignalsPayloads(root) {
  const mirrorPath = path.join(root, "public", "mirrors", "tech-signals.json");
  const snapshotPath = path.join(root, "public", "data", "snapshots", "tech-signals.json");
  const mirrorRaw = JSON.parse(await readFile(mirrorPath, "utf8"));
  const snapshotRaw = JSON.parse(await readFile(snapshotPath, "utf8"));
  const mirrorData = mirrorRaw?.data || {};
  const snapshotData = snapshotRaw?.data || {};
  if (!hasArray(mirrorData.signals) && !hasArray(mirrorData.rows)) {
    throw new Error("Tech Signals mirror missing data.signals/data.rows arrays");
  }
  if (!hasArray(snapshotData.signals) && !hasArray(snapshotData.items) && !hasArray(snapshotData.rows)) {
    throw new Error("Tech Signals snapshot missing signals/items/rows arrays");
  }
}

async function main() {
  const root = process.cwd();
  const schemaPath = path.join(root, "schemas", "api-envelope.schema.json");
  await readFile(schemaPath, "utf8");

  const sample = {
    ok: true,
    feature: "rv-sample",
    meta: { status: "LIVE", reason: "", schemaVersion: "v1" },
    data: { items: [] },
    error: null
  };

  if (!validateEnvelope(sample)) {
    throw new Error("Sample envelope does not match required shape");
  }
  await validateTechSignalsPayloads(root);
  console.log("Contract smoke OK");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
