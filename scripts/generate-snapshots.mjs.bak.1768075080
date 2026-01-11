import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_DIR = path.join(ROOT, "public", "data", "snapshots");
const TMP_DIR = path.join(SNAPSHOT_DIR, ".tmp");
const MIRROR_DIRS = [
  path.join(ROOT, "public", "mirrors"),
  path.join(ROOT, "public", "mirror")
];

const SNAPSHOTS = [
  { id: "top-movers", mirrorId: "top-movers", mapData: mapItemsOnly },
  { id: "yield-curve", mirrorId: "yield-curve", mapData: mapItemsOnly },
  { id: "why-moved", mirrorId: "why-moved", mapData: mapItemsOnly },
  { id: "sp500-sectors", mirrorId: "sp500-sectors", mapData: mapSectors },
  { id: "tech-signals", mirrorId: "tech-signals", mapData: mapSignals },
  { id: "volume-anomaly", mirrorId: "volume-anomaly", mapData: mapItemsOnly }
];

function normalizeId(rawId) {
  const raw = String(rawId || "");
  const match = raw.match(/^(\d+):(.*)$/);
  if (!match) return raw;
  return match[2] || "";
}

function ensureUniqueIds(entries) {
  const seen = new Map();
  entries.forEach((entry) => {
    const normalized = normalizeId(entry.id);
    if (seen.has(normalized)) {
      throw new Error(
        `Duplicate snapshot id after normalization: ${entry.id} conflicts with ${seen.get(normalized)}`
      );
    }
    seen.set(normalized, entry.id);
  });
}

async function findMirrorPath(mirrorId) {
  const candidates = MIRROR_DIRS.map((dir) => path.join(dir, `${mirrorId}.json`));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function readMirrorJson(mirrorId) {
  const mirrorPath = await findMirrorPath(mirrorId);
  if (!mirrorPath) {
    const error = new Error(`Mirror not found for ${mirrorId}`);
    error.code = "MIRROR_MISSING";
    throw error;
  }
  const raw = await fs.readFile(mirrorPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const parseError = new Error(`Mirror JSON parse failed for ${mirrorId}`);
    parseError.code = "MIRROR_PARSE_ERROR";
    parseError.cause = error;
    throw parseError;
  }
}

function extractItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.payload?.data?.data?.items)) return payload.payload.data.data.items;
  if (Array.isArray(payload?.payload?.data?.items)) return payload.payload.data.items;
  return [];
}

function extractSectors(payload) {
  if (Array.isArray(payload?.sectors)) return payload.sectors;
  if (Array.isArray(payload?.payload?.data?.data?.sectors)) return payload.payload.data.data.sectors;
  if (Array.isArray(payload?.payload?.data?.sectors)) return payload.payload.data.sectors;
  if (Array.isArray(payload?.items) && payload.items.length && payload.items[0]?.sector) return payload.items;
  return [];
}

function mapItemsOnly(raw) {
  const items = extractItems(raw);
  return { data: { items }, itemsCount: items.length };
}

function mapSectors(raw) {
  const sectors = extractSectors(raw);
  const items = extractItems(raw);
  const itemsCount = sectors.length || items.length;
  return { data: { items, sectors }, itemsCount };
}

function mapSignals(raw) {
  const items = extractItems(raw);
  return { data: { items, signals: items }, itemsCount: items.length };
}

function pickUpdatedAt(raw) {
  const candidates = [
    raw?.updatedAt,
    raw?.asOf,
    raw?.ts,
    raw?.meta?.updatedAt,
    raw?.payload?.data?.updatedAt,
    raw?.payload?.data?.data?.updatedAt
  ];
  return candidates.find((value) => value && typeof value === "string") || null;
}

function computeStalenessSec(updatedAt, generatedAt) {
  if (!updatedAt) return 0;
  const updatedMs = Date.parse(updatedAt);
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(updatedMs) || !Number.isFinite(generatedMs)) return 0;
  return Math.max(0, Math.floor((generatedMs - updatedMs) / 1000));
}

async function atomicWriteJson(targetPath, payload) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const tmpPath = path.join(TMP_DIR, `${path.basename(targetPath)}.tmp`);
  let serialized = JSON.stringify(payload, null, 2);
  payload.meta.bytes = Buffer.byteLength(serialized);
  serialized = JSON.stringify(payload, null, 2);
  await fs.writeFile(tmpPath, serialized);
  await fs.rename(tmpPath, targetPath);
  return Buffer.byteLength(serialized);
}

async function generateSnapshot(entry) {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  let mirrorPayload = null;
  let metaStatus = "ERROR";
  let metaReason = "MIRROR_ERROR";
  let data = { items: [] };
  let ok = false;
  let itemsCount = 0;

  try {
    mirrorPayload = await readMirrorJson(entry.mirrorId);
    if (!mirrorPayload || (typeof mirrorPayload !== "object")) {
      const schemaErr = new Error(`Mirror schema invalid for ${entry.mirrorId}`);
      schemaErr.code = "MIRROR_SCHEMA_EMPTY";
      throw schemaErr;
    }

    const mapped = entry.mapData(mirrorPayload);
    data = mapped.data;
    itemsCount = mapped.itemsCount;
    if (itemsCount > 0) {
      metaStatus = "LIVE";
      metaReason = "OK";
      ok = true;
    } else {
      metaStatus = "NO_DATA";
      metaReason = "EMPTY_ITEMS";
      ok = false;
    }
  } catch (error) {
    metaStatus = "ERROR";
    metaReason = error?.code || "MIRROR_ERROR";
    ok = false;
  }

  const updatedAt = pickUpdatedAt(mirrorPayload);
  const durationMs = Date.now() - started;
  const stalenessSec = computeStalenessSec(updatedAt, generatedAt);

  const envelope = {
    ok,
    feature: entry.id,
    meta: {
      status: metaStatus,
      reason: metaReason,
      generatedAt,
      stalenessSec,
      durationMs,
      bytes: 0
    },
    data
  };

  const targetPath = path.join(SNAPSHOT_DIR, `${entry.id}.json`);
  const bytes = await atomicWriteJson(targetPath, envelope);
  return {
    id: entry.id,
    status: metaStatus,
    reason: metaReason,
    generatedAt,
    durationMs,
    bytes,
    itemsCount,
    updatedAt: updatedAt || null
  };
}

async function main() {
  ensureUniqueIds(SNAPSHOTS);
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    snapshots: {}
  };

  for (const entry of SNAPSHOTS) {
    const summary = await generateSnapshot(entry);
    manifest.snapshots[entry.id] = summary;
    console.log(
      `[snapshot] ${entry.id} status=${summary.status} reason=${summary.reason} items=${summary.itemsCount} durationMs=${summary.durationMs}`
    );
  }

  const manifestPath = path.join(SNAPSHOT_DIR, "manifest.json");
  await atomicWriteJson(manifestPath, {
    ok: true,
    feature: "snapshots-manifest",
    meta: {
      status: "LIVE",
      reason: "OK",
      generatedAt: manifest.generatedAt,
      stalenessSec: 0,
      durationMs: 0,
      bytes: 0
    },
    data: manifest
  });
}

main().catch((error) => {
  console.error("[snapshot] failed", error);
  process.exit(1);
});
