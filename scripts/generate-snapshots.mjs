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
  { id: "market-cockpit", mirrorId: "market-cockpit", mapData: mapItemsOnly },
  { id: "sp500-sectors", mirrorId: "sp500-sectors", mapData: mapSectors },
  { id: "top-movers", mirrorId: "top-movers", mapData: mapItemsOnly },
  { id: "yield-curve", mirrorId: "yield-curve", mapData: mapItemsOnly },
  { id: "why-moved", mirrorId: "why-moved", mapData: mapItemsOnly },
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

function ensureNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function ensureNonEmptyString(value, fallback = "") {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (fallback !== undefined && fallback !== null) return String(fallback);
  return "";
}

function ensureIsoString(value, fallback) {
  const candidate = ensureNonEmptyString(value);
  if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
  const fallbackCandidate = ensureNonEmptyString(fallback);
  if (fallbackCandidate && Number.isFinite(Date.parse(fallbackCandidate))) return fallbackCandidate;
  return new Date().toISOString();
}

function buildMeta({
  status,
  reason,
  itemsCount,
  updatedAt,
  generatedAt,
  stalenessSec,
  durationMs,
  coveragePct
}) {
  const safeGeneratedAt = ensureIsoString(generatedAt);
  const safeUpdatedAt = ensureIsoString(updatedAt, safeGeneratedAt);
  const safeItemsCount = ensureNumber(itemsCount, 0);
  const safeStatus = ensureNonEmptyString(status, "NO_DATA");
  const safeReason = ensureNonEmptyString(reason, safeStatus === "LIVE" ? "OK" : "NO_DATA");
  const safeDurationMs = ensureNumber(durationMs, 0);
  const safeStalenessSec = ensureNumber(stalenessSec, 0);
  const safeCoveragePct = Number.isFinite(coveragePct)
    ? coveragePct
    : safeStatus === "LIVE" && safeItemsCount > 0
      ? 100
      : 0;

  return {
    status: safeStatus,
    reason: safeReason,
    generatedAt: safeGeneratedAt,
    stalenessSec: safeStalenessSec,
    durationMs: safeDurationMs,
    latencyMs: safeDurationMs,
    itemsCount: safeItemsCount,
    coveragePct: ensureNumber(safeCoveragePct, 0),
    timezoneAssumption: "UTC",
    dataAtDefinition: ensureNonEmptyString(safeUpdatedAt, safeGeneratedAt),
    bytes: 0
  };
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
  // mirror shapes vary across generators; accept multiple common paths
  if (Array.isArray(payload?.items)) return payload.items;

  // "wrapped mirror" shapes
  if (Array.isArray(payload?.payload?.items)) return payload.payload.items;

  // common nested shapes
  if (Array.isArray(payload?.payload?.data?.items)) return payload.payload.data.items;
  if (Array.isArray(payload?.payload?.data?.data?.items)) return payload.payload.data.data.items;

  // IMPORTANT: some mirrors include an extra 'data' layer (payload.data.data.items)
  if (Array.isArray(payload?.payload?.data?.data?.data?.items)) return payload.payload.data.data.data.items;

  return [];
}

function extractItemsFor(id, raw) {
  // Special-case: sp500-sectors mirror stores stock lists under payload.data.data.stocks.{gainers,volumeLeaders}.
  // We derive stable UI items from those lists to avoid NO_DATA.
  if (id === "sp500-sectors") {
    try {
      const stocks = raw?.payload?.data?.data?.stocks;
      if (stocks && typeof stocks === "object") {
        const gainers = Array.isArray(stocks.gainers) ? stocks.gainers : [];
        const volumeLeaders = Array.isArray(stocks.volumeLeaders) ? stocks.volumeLeaders : [];
        const items = [];
        for (const r of gainers) items.push({ list: "gainers", ...(r && typeof r === "object" ? r : { value: r }) });
        for (const r of volumeLeaders) items.push({ list: "volumeLeaders", ...(r && typeof r === "object" ? r : { value: r }) });
        return items;
      }
    } catch (e) {}
  }
  return extractItems(raw);
}

function extractSectors(payload) {
  if (Array.isArray(payload?.sectors)) return payload.sectors;
  if (Array.isArray(payload?.payload?.data?.data?.sectors)) return payload.payload.data.data.sectors;
  if (Array.isArray(payload?.payload?.data?.sectors)) return payload.payload.data.sectors;
  if (Array.isArray(payload?.items) && payload.items.length && payload.items[0]?.sector) return payload.items;
  return [];
}

function mapItemsOnly(raw, id) {
  const items = extractItemsFor(id, raw);
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
  return { data: { items, signals: items, rows: items }, itemsCount: items.length };
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

    const mapped = entry.mapData(mirrorPayload, entry.id);
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
    meta: buildMeta({
      status: metaStatus,
      reason: metaReason,
      itemsCount,
      updatedAt,
      generatedAt,
      stalenessSec,
      durationMs
    }),
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
  let liveCount = 0;
  let totalDurationMs = 0;

  for (const entry of SNAPSHOTS) {
    const summary = await generateSnapshot(entry);
    manifest.snapshots[entry.id] = summary;
    totalDurationMs += summary.durationMs;
    if (summary.status === "LIVE") liveCount += 1;
    console.log(
      `[snapshot] ${entry.id} status=${summary.status} reason=${summary.reason} items=${summary.itemsCount} durationMs=${summary.durationMs}`
    );
  }

  const manifestPath = path.join(SNAPSHOT_DIR, "manifest.json");
  const totalCount = Object.keys(manifest.snapshots).length;
  await atomicWriteJson(manifestPath, {
    ok: true,
    feature: "snapshots-manifest",
    meta: buildMeta({
      status: "LIVE",
      reason: "OK",
      itemsCount: totalCount,
      updatedAt: manifest.generatedAt,
      generatedAt: manifest.generatedAt,
      stalenessSec: 0,
      durationMs: totalDurationMs,
      coveragePct: totalCount ? Math.round((liveCount / totalCount) * 100) : 0
    }),
    data: manifest
  });
}


// --- SNAPSHOT>=MIRROR (structural parity guard) ---
// Goal: snapshots must not lose structural fields compared to mirrors, otherwise legacy UI drops indicators.
// Policy: for selected mirror-backed features, merge snapshot.data with mirror.data for specific keys.

function deepClone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

function mergePreferSnapshot(snapshotData, mirrorData, keys) {
  const out = deepClone(snapshotData) || {};
  const m = mirrorData || {};
  for (const k of keys) {
    if (out[k] == null || (Array.isArray(out[k]) && out[k].length === 0)) {
      if (m[k] != null) out[k] = deepClone(m[k]);
    }
  }
  return out;
}

function enforceStructuralParity({ id, snapshot, mirror }) {
  if (!snapshot || !mirror) return snapshot;
  const snap = deepClone(snapshot);
  const mir = mirror;

  // Tech Signals: legacy UI needs signals[] and rows[] (watchlist/top tables).
  if (id === "tech-signals") {
    snap.data = mergePreferSnapshot(snap.data, mir.data, ["signals", "rows"]);
    // If producer mapped to items, keep it, but do not drop rows.
  }

  // Alpha Radar: legacy UI needs picks.{top,shortterm,longterm} at minimum.
  if (id === "alpha-radar" || id === "alpha-radar-lite") {
    snap.data = mergePreferSnapshot(snap.data, mir.data, ["picks", "meta", "universe"]);
    // If picks exists but is partial, also fill missing pick-buckets.
    if (snap.data && mir.data && snap.data.picks && mir.data.picks) {
      snap.data.picks = mergePreferSnapshot(snap.data.picks, mir.data.picks, ["top", "shortterm", "longterm"]);
    }
  }

  return snap;
}
// --- end SNAPSHOT>=MIRROR ---


main().catch((error) => {
  console.error("[snapshot] failed", error);
  process.exit(1);
});
