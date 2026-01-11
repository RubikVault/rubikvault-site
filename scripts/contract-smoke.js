import fs from "node:fs";
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

function fail(message) {
  throw new Error(message);
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

  // --- SNAPSHOT>=MIRROR guard (tech-signals + alpha-radar) ---
  // If mirror has structural arrays, snapshot must also have them (prevents legacy UI regressions).
  const mirrorPath = path.join(root, "public", "mirrors", "tech-signals.json");
  const snapshotPath = path.join(root, "public", "data", "snapshots", "tech-signals.json");
  const alphaMirrorPath = path.join(root, "public", "mirrors", "alpha-radar.json");
  const alphaSnapPath = path.join(root, "public", "data", "snapshots", "alpha-radar.json");

  const techMirror = JSON.parse(fs.readFileSync(mirrorPath, "utf8"));
  const techSnap = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

  const alphaMirror = fs.existsSync(alphaMirrorPath) ? JSON.parse(fs.readFileSync(alphaMirrorPath, "utf8")) : null;
  const alphaSnap = fs.existsSync(alphaSnapPath) ? JSON.parse(fs.readFileSync(alphaSnapPath, "utf8")) : null;

  const tech_m_rows = Array.isArray(techMirror?.data?.rows) ? techMirror.data.rows.length : 0;
  const tech_s_rows = Array.isArray(techSnap?.data?.rows) ? techSnap.data.rows.length : 0;
  const tech_m_sig = Array.isArray(techMirror?.data?.signals) ? techMirror.data.signals.length : 0;
  const tech_s_sig = Array.isArray(techSnap?.data?.signals) ? techSnap.data.signals.length : 0;
  const tech_s_items = Array.isArray(techSnap?.data?.items) ? techSnap.data.items.length : 0;
  if (tech_m_rows > 0 && tech_s_rows === 0 && tech_s_items === 0) {
    fail("SNAPSHOT>=MIRROR guard: tech-signals snapshot missing rows/items while mirror has rows[]");
  }
  if (tech_m_sig > 0 && tech_s_sig === 0 && tech_s_items === 0) {
    fail("SNAPSHOT>=MIRROR guard: tech-signals snapshot missing signals/items while mirror has signals[]");
  }

  if (alphaSnap) {
    const alpha_m_top = Array.isArray(alphaMirror?.data?.picks?.top) ? alphaMirror.data.picks.top.length : 0;
    const alpha_s_top = Array.isArray(alphaSnap?.data?.picks?.top) ? alphaSnap.data.picks.top.length : 0;
    if (alpha_m_top > 0 && alpha_s_top === 0) {
      fail("SNAPSHOT>=MIRROR guard: alpha-radar snapshot missing picks.top[] while mirror has picks.top[]");
    }
  }
  // --- end SNAPSHOT>=MIRROR guard ---

  console.log("Contract smoke OK");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
