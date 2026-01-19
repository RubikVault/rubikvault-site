import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { sanitizeForPublic, assertPublicSafe } from "./_lib/sanitize-public.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const MIRROR_ROOT = path.join(ROOT, "mirrors");
const MIRROR_SNAPSHOT_DIR = path.join(MIRROR_ROOT, "snapshots");
const MIRROR_MARKETPHASE_DIR = path.join(MIRROR_ROOT, "marketphase");
const MIRROR_LOCK_DIR = path.join(MIRROR_ROOT, ".locks");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const SNAPSHOT_DIR = path.join(PUBLIC_DATA, "snapshots");
const INTERNAL_DIR = path.join(ROOT, "internal");
const BUDGETS_PATH = path.join(ROOT, "config", "rv-budgets.json");
const PROVIDER_STATE_MIRROR = path.join(MIRROR_ROOT, "provider-state.json");
const USAGE_REPORT_MIRROR = path.join(MIRROR_ROOT, "usage-report.json");
const MANIFEST_MIRROR = path.join(MIRROR_ROOT, "seed-manifest.json");
const ERROR_SUMMARY_PATH = path.join(PUBLIC_DATA, "error-summary.json");
const PROVIDER_STATE_PATH = path.join(PUBLIC_DATA, "provider-state.json");
const USAGE_REPORT_PATH = path.join(PUBLIC_DATA, "usage-report.json");
const SYSTEM_HEALTH_PATH = path.join(PUBLIC_DATA, "system-health.json");
const RUN_REPORT_PATH = path.join(INTERNAL_DIR, "run-report.json");
const MARKETPHASE_PUBLIC = path.join(PUBLIC_DATA, "marketphase");
const MAX_PUBLIC_BYTES = 200 * 1024;

const RUN_ID = new Date().toISOString();
const BUILD_STARTED = Date.now();

const MIRROR_MAP = new Map([
  ["news", "news-headlines"],
  ["market-cockpit", "market-cockpit"],
  ["sp500-sectors", "sp500-sectors"],
  ["sector-rotation", "sp500-sectors"], // sector-rotation mirror maps to sp500-sectors snapshot
  ["tech-signals", "tech-signals"],
  ["alpha-radar", "alpha-radar"],
  ["rvci-engine", "rvci-engine"],
  ["yield-curve", "yield-curve"],
  ["top-movers", "top-movers"],
  ["volume-anomaly", "volume-anomaly"],
  ["why-moved", "why-moved"],
  ["crypto-snapshot", "crypto-snapshot"]
]);

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listJsonFiles(dir) {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function shouldSkipMirrorId(mirrorId) {
  if (!mirrorId) return true;
  if (mirrorId.endsWith(".meta")) return true;
  if (mirrorId.endsWith("_history")) return true;
  if (mirrorId === "provider-state" || mirrorId === "usage-report" || mirrorId === "seed-manifest") {
    return true;
  }
  return false;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function isMirrorEnvelope(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.meta || !payload.raw) return false;
  const meta = payload.meta || {};
  return Boolean(
    Object.prototype.hasOwnProperty.call(meta, "provider") ||
      Object.prototype.hasOwnProperty.call(meta, "dataset") ||
      Object.prototype.hasOwnProperty.call(meta, "fetchedAt") ||
      Object.prototype.hasOwnProperty.call(meta, "source") ||
      Object.prototype.hasOwnProperty.call(meta, "runId")
  );
}

function unwrapEnvelope(payload) {
  if (isMirrorEnvelope(payload)) {
    return { raw: payload.raw, meta: payload.meta };
  }
  return { raw: payload, meta: null };
}

async function writeIfChanged(targetPath, payload, changedFiles, { sanitize = true } = {}) {
  let output = payload;
  if (sanitize) {
    output = sanitizeForPublic(payload);
  }
  const next = JSON.stringify(output, null, 2);
  if (sanitize) {
    assertPublicSafe(output, path.basename(targetPath));
    const byteSize = Buffer.byteLength(next, "utf8");
    if (byteSize > MAX_PUBLIC_BYTES) {
      throw new Error(`public_snapshot_too_large:${path.basename(targetPath)}:${byteSize}`);
    }
  }
  const nextHash = sha256(next);
  let prevHash = null;
  if (fs.existsSync(targetPath)) {
    const prevRaw = fs.readFileSync(targetPath, "utf8");
    prevHash = sha256(prevRaw);
  }
  if (prevHash === nextHash) return false;
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, next);
  changedFiles.push(targetPath);
  return true;
}

function computeFreshness(asOf, ttlSeconds) {
  const now = Date.now();
  const asOfMs = Date.parse(asOf || "");
  const ageMinutes = Number.isFinite(asOfMs) ? Math.max(0, Math.floor((now - asOfMs) / 60000)) : null;
  const ttlMinutes = ttlSeconds ? Math.max(1, Math.round(ttlSeconds / 60)) : 60;
  let status = "unknown";
  if (ageMinutes === null) {
    status = "unknown";
  } else if (ageMinutes <= ttlMinutes) {
    status = "fresh";
  } else if (ageMinutes <= ttlMinutes * 2) {
    status = "stale";
  } else {
    status = "expired";
  }
  return { status, ageMinutes };
}

function computeSchedule(cadence, ttlSeconds) {
  const cadenceValue = String(cadence || "daily").toLowerCase();
  const windowMinutes =
    cadenceValue === "hourly" || cadenceValue === "live"
      ? 60
      : cadenceValue === "15m_delayed"
        ? 30
        : cadenceValue === "best_effort"
          ? 180
          : cadenceValue === "eod"
            ? 1440
            : 1440;
  const nextAt = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
  const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : windowMinutes * 60;
  return {
    rule: cadenceValue || "daily",
    nextPlannedFetchAt: nextAt,
    expectedNextRunWindowMinutes: windowMinutes,
    ttlSeconds: ttl
  };
}

function buildMetaEnvelope({
  status = "OK",
  reason = "OK",
  asOf,
  ttlSeconds = 3600,
  validation,
  generatedAt: generatedAtOverride
} = {}) {
  const generatedAt = generatedAtOverride || new Date().toISOString();
  const asOfValue = asOf || generatedAt;
  const freshness = computeFreshness(asOfValue, ttlSeconds);
  const schedule = computeSchedule("daily", ttlSeconds);
  const defaultValidation = {
    schema: { ok: true, errors: [] },
    ranges: { ok: true, errors: [] },
    integrity: { ok: true, errors: [] }
  };
  return {
    status,
    reason,
    generatedAt,
    asOf: asOfValue,
    ttlSeconds,
    stale: freshness.status !== "fresh",
    freshness,
    schedule,
    validation: validation || defaultValidation,
    runId: RUN_ID
  };
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/api_key|token|secret|authorization|bearer/i.test(key)) continue;
    out[key] = redactSecrets(val);
  }
  return out;
}

function extractItems(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
  if (Array.isArray(payload?.payload?.data?.items)) return payload.payload.data.items;
  if (Array.isArray(payload?.payload?.data?.data?.items)) return payload.payload.data.data.items;
  if (Array.isArray(payload?.payload?.data?.data?.data?.items)) return payload.payload.data.data.data.items;
  return [];
}

function extractExtraData(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const { items, ...rest } = data;
  return rest && typeof rest === "object" ? rest : {};
}

function extractSectors(payload) {
  if (Array.isArray(payload?.sectors)) return payload.sectors;
  if (Array.isArray(payload?.payload?.data?.data?.sectors)) return payload.payload.data.data.sectors;
  if (Array.isArray(payload?.payload?.data?.sectors)) return payload.payload.data.sectors;
  if (Array.isArray(payload?.items) && payload.items.length && payload.items[0]?.sector) return payload.items;
  return [];
}

async function mapMirrorData(mirrorId, raw) {
  // Handle both sp500-sectors and sector-rotation mirrors (both map to sp500-sectors snapshot)
  if (mirrorId === "sp500-sectors" || mirrorId === "sector-rotation") {
    const sectors = extractSectors(raw);
    const items = extractItems(raw);
    return { items, extraData: { ...extractExtraData(raw), sectors } };
  }
  if (mirrorId === "tech-signals") {
    const items = extractItems(raw);
    return { items, extraData: { ...extractExtraData(raw), signals: items, rows: items } };
  }
  if (mirrorId === "alpha-radar") {
    // Import normalizePick dynamically to normalize items
    const { normalizePick, computeAlphaRadarPicks } = await import("./core/alpha-radar-core.mjs");
    const rawItems = extractItems(raw);
    // Normalize items to include setupScore/triggerScore/totalScore
    const items = Array.isArray(rawItems) ? rawItems.map(normalizePick) : [];
    // Extract picks from raw data (could be in data.picks, picks, or data.data.picks)
    const picks = raw?.data?.picks || raw?.picks || raw?.data?.data?.picks || null;
    // Normalize picks: if picks is an object with top/shortterm/longterm, use computeAlphaRadarPicks
    // Otherwise, if picks is an array or object, try to normalize it
    let normalizedPicks = null;
    if (picks && typeof picks === "object") {
      if (Array.isArray(picks.top) || Array.isArray(picks.shortterm) || Array.isArray(picks.longterm)) {
        // Already structured as { top, shortterm, longterm }
        normalizedPicks = computeAlphaRadarPicks({ picks });
      } else if (Array.isArray(picks)) {
        // Picks is an array, treat as itemsAlpha
        normalizedPicks = computeAlphaRadarPicks({ itemsAlpha: picks });
      } else {
        // Try to extract itemsAlpha or candidates from picks object
        normalizedPicks = computeAlphaRadarPicks(picks);
      }
    }
    const extraData = normalizedPicks ? { ...extractExtraData(raw), picks: normalizedPicks } : extractExtraData(raw);
    return { items, extraData };
  }
  const items = extractItems(raw);
  return { items, extraData: extractExtraData(raw) };
}

function validateRanges(items) {
  const errors = [];
  if (!Array.isArray(items)) return { ok: true, errors };
  items.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    for (const [key, value] of Object.entries(item)) {
      if (typeof value !== "number" || Number.isNaN(value)) continue;
      const lower = key.toLowerCase();
      if (lower.includes("rsi") && (value < 0 || value > 100)) {
        errors.push(`items[${idx}].${key} out of range (0-100)`);
      }
      if ((lower.includes("price") || lower.includes("close") || lower.includes("open")) && value <= 0) {
        errors.push(`items[${idx}].${key} must be > 0`);
      }
      if ((lower.includes("yield") || lower.includes("rate")) && value < -5) {
        errors.push(`items[${idx}].${key} unusually low`);
      }
      if ((lower.includes("pct") || lower.includes("percent")) && (value < -1000 || value > 1000)) {
        errors.push(`items[${idx}].${key} percent out of bounds`);
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

function validateIntegrity(meta) {
  const errors = [];
  if (!meta.generatedAt) errors.push("generatedAt missing");
  if (!meta.asOf) errors.push("asOf missing");
  const asOfMs = Date.parse(meta.asOf || "");
  if (Number.isFinite(asOfMs) && asOfMs > Date.now() + 5 * 60 * 1000) {
    errors.push("asOf is in the future");
  }
  if (!meta.freshness) errors.push("freshness missing");
  if (!meta.schedule) errors.push("schedule missing");
  return { ok: errors.length === 0, errors };
}

function validateSchema(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") {
    return { ok: false, errors: ["snapshot not object"] };
  }
  if (!snapshot.meta || typeof snapshot.meta !== "object") errors.push("meta missing");
  if (!snapshot.data || typeof snapshot.data !== "object") errors.push("data missing");
  if (!snapshot.blockId) errors.push("blockId missing");
  return { ok: errors.length === 0, errors };
}

async function buildSnapshot({ blockId, raw, mirrorMeta, lastGoodSnapshot = null }) {
  const generatedAt = new Date().toISOString();
  const asOf = mirrorMeta.asOf || mirrorMeta.updatedAt || generatedAt;
  const ttlSeconds = Number.isFinite(mirrorMeta.ttlSeconds) ? mirrorMeta.ttlSeconds : 3600;
  const freshness = computeFreshness(asOf, ttlSeconds);
  const schedule = computeSchedule(mirrorMeta.cadence || mirrorMeta.mode || "daily", ttlSeconds);
  let { items, extraData } = await mapMirrorData(blockId, raw);
  
  // --- LASTGOOD fallback: if items empty, fill from lastGood ---
  let lastGoodUsed = 0;
  let lastGoodFilled = 0;
  if (lastGoodSnapshot) {
    const lastGoodData = lastGoodSnapshot?.data || {};
    const lastGoodItems = lastGoodData.items;
    const lastGoodSectors = lastGoodData.sectors;
    
    // Fill items from lastGood if empty
    if ((!Array.isArray(items) || items.length === 0) && Array.isArray(lastGoodItems) && lastGoodItems.length > 0) {
      items = lastGoodItems.map((item) => ({
        ...item,
        derivedFromLastGood: true,
        derivationReason: "LASTGOOD_FALLBACK"
      }));
      lastGoodUsed += items.length;
      lastGoodFilled += items.length;
    }
    
    // Fill sectors from lastGood if empty (for sp500-sectors)
    if (blockId === "sp500-sectors") {
      const currentSectors = extraData.sectors || [];
      if ((!Array.isArray(currentSectors) || currentSectors.length === 0) && 
          Array.isArray(lastGoodSectors) && lastGoodSectors.length > 0) {
        extraData.sectors = lastGoodSectors.map((sector) => ({
          ...sector,
          derivedFromLastGood: true,
          derivationReason: "LASTGOOD_FALLBACK"
        }));
        lastGoodUsed += extraData.sectors.length;
        lastGoodFilled += extraData.sectors.length;
      }
    }
    
    // Also merge other extraData from lastGood if current is empty
    const { items: _, sectors: __, ...lastGoodRest } = lastGoodData;
    if (Object.keys(extraData).length === 0 && Object.keys(lastGoodRest).length > 0) {
      extraData = { ...lastGoodRest, ...extraData };
    } else if (Object.keys(lastGoodRest).length > 0) {
      // Merge missing keys from lastGood
      for (const [key, value] of Object.entries(lastGoodRest)) {
        if (!(key in extraData) || (Array.isArray(extraData[key]) && extraData[key].length === 0)) {
          extraData[key] = value;
        }
      }
    }
  }
  
  // --- NEVER EMPTY: if still empty after lastGood, create minimal placeholder ---
  // This ensures UI never shows completely empty blocks (per .cursorrules rule 7.1)
  if ((!Array.isArray(items) || items.length === 0) && !lastGoodSnapshot) {
    // Create minimal placeholder item so UI has something to display
    items = [{
      id: `${blockId}_status`,
      label: blockId.replace(/^rv-/, "").replace(/-/g, " "),
      value: "NO_DATA",
      unit: "",
      derivedFromLastGood: false,
      derivationReason: "EMPTY_AFTER_FALLBACK",
      stale: true,
      staleReason: "missing"
    }];
    lastGoodFilled = 1; // Track that we created placeholder
  }
  
  const sanitizedItems = redactSecrets(items);
  const data = { items: sanitizedItems, ...redactSecrets(extraData) };
  const itemsCount = sanitizedItems.length;
  const sourceUpstream = typeof mirrorMeta.sourceUpstream === "string" ? mirrorMeta.sourceUpstream : null;
  const sourceValue = typeof mirrorMeta.source === "string" ? mirrorMeta.source : null;
  // Determine status: if items empty after lastGood fallback, mark as PARTIAL
  const hasItems = sanitizedItems.length > 0;
  const status = mirrorMeta.status || (hasItems ? "LIVE" : "PARTIAL");
  const reason = mirrorMeta.reason || (hasItems ? "OK" : (lastGoodUsed > 0 ? "LASTGOOD_FALLBACK" : "EMPTY_ITEMS"));
  
  const meta = {
    status,
    reason,
    generatedAt,
    asOf,
    source: sourceUpstream || sourceValue || "mirror",
    ttlSeconds,
    stale: freshness.status !== "fresh" || lastGoodUsed > 0,
    itemsCount,
    stalenessSec: Number.isFinite(freshness.ageMinutes) ? freshness.ageMinutes * 60 : null,
    freshness,
    schedule,
    runId: RUN_ID
  };
  
  // Add lastGood debug info if used
  if (lastGoodUsed > 0) {
    if (!meta.notes) meta.notes = {};
    if (typeof meta.notes !== "object") meta.notes = {};
    meta.notes.lastGoodUsed = lastGoodUsed;
    meta.notes.lastGoodFilled = lastGoodFilled;
    
    if (!data.debug) data.debug = {};
    data.debug.lastGood = {
      used: lastGoodUsed,
      filled: lastGoodFilled,
      reason: "EMPTY_ITEMS_FALLBACK"
    };
  }
  const schema = validateSchema({ blockId, meta, data });
  const ranges = validateRanges(sanitizedItems);
  const integrity = validateIntegrity(meta);
  meta.validation = {
    schema: { ok: schema.ok, errors: schema.errors },
    ranges: { ok: ranges.ok, errors: ranges.errors },
    integrity: { ok: integrity.ok, errors: integrity.errors }
  };
  return {
    schemaVersion: "v3",
    blockId,
    generatedAt,
    dataAt: asOf,
    meta,
    data
  };
}

function buildRvciSnapshot(latest) {
  const generatedAt = latest?.meta?.generatedAt || new Date().toISOString();
  const asOf = latest?.meta?.dataAsOf || latest?.meta?.marketDate || generatedAt;
  const ttlSeconds = 24 * 60 * 60;
  const freshness = computeFreshness(asOf, ttlSeconds);
  const schedule = computeSchedule("daily", ttlSeconds);
  const meta = {
    status: latest?.meta?.status || "OK",
    reason: latest?.meta?.reason || latest?.meta?.status || "OK",
    generatedAt,
    asOf,
    source: "rvci",
    ttlSeconds,
    stale: freshness.status !== "fresh",
    freshness,
    schedule,
    runId: RUN_ID
  };
  const data = {
    counts: latest?.data?.counts || {},
    paths: latest?.data?.paths || {},
    meta: latest?.meta || {},
    error: latest?.error || null
  };
  const schema = validateSchema({ blockId: "rvci-engine", meta, data });
  const integrity = validateIntegrity(meta);
  meta.validation = {
    schema: { ok: schema.ok, errors: schema.errors },
    ranges: { ok: true, errors: [] },
    integrity: { ok: integrity.ok, errors: integrity.errors }
  };
  return {
    schemaVersion: "v3",
    blockId: "rvci-engine",
    generatedAt,
    dataAt: asOf,
    meta,
    data
  };
}

async function collectMirrorInputs() {
  const mirrors = {};
  const mirrorFiles = await listJsonFiles(MIRROR_ROOT);
  mirrorFiles.forEach((filePath) => {
    const base = path.basename(filePath, ".json");
    if (shouldSkipMirrorId(base)) return;
    mirrors[base] = loadJson(filePath);
  });
  const snapshotFiles = await listJsonFiles(MIRROR_SNAPSHOT_DIR);
  snapshotFiles.forEach((filePath) => {
    const base = path.basename(filePath, ".json");
    if (shouldSkipMirrorId(base)) return;
    mirrors[base] = loadJson(filePath);
  });
  // Fallback: if sector-rotation mirror is missing from mirrors/, try public/mirrors/
  // This handles cases where mirrors are generated in public/mirrors/ instead of mirrors/
  if (!mirrors["sector-rotation"]) {
    const publicMirrorPath = path.join(ROOT, "public", "mirrors", "sector-rotation.json");
    if (fs.existsSync(publicMirrorPath)) {
      const publicMirror = loadJson(publicMirrorPath);
      if (publicMirror) {
        mirrors["sector-rotation"] = publicMirror;
      }
    }
  }
  return mirrors;
}

function normalizeMirrorMeta(raw, envelopeMeta, blockId) {
  const envelope = envelopeMeta && typeof envelopeMeta === "object" ? envelopeMeta : {};
  if (!raw || typeof raw !== "object") {
    return {
      status: "ERROR",
      reason: "MIRROR_MISSING",
      sourceUpstream: envelope.provider || envelope.source || "mirror",
      updatedAt: envelope.fetchedAt || null,
      asOf: envelope.fetchedAt || null,
      ttlSeconds: envelope.ttlSeconds || null,
      cadence: envelope.cadence || "daily",
      source: envelope.source || "mirror"
    };
  }
  if (raw.meta && typeof raw.meta === "object" && raw.meta.status) {
    return {
      status: raw.meta.status,
      reason: raw.meta.reason || raw.meta.status,
      sourceUpstream: envelope.provider || raw.meta.source || raw.sourceUpstream || raw.source,
      updatedAt: raw.meta.updatedAt || raw.updatedAt || raw.generatedAt || envelope.fetchedAt,
      asOf: raw.asOf || raw.meta.asOf || raw.dataAt || raw.updatedAt || raw.generatedAt || envelope.fetchedAt,
      ttlSeconds: raw.meta.ttlSeconds || raw.ttlSeconds || envelope.ttlSeconds || null,
      cadence: raw.cadence || raw.meta.cadence || raw.mode,
      source: raw.source || envelope.source || "mirror"
    };
  }
  return {
    status: raw.mode || (Array.isArray(raw.items) && raw.items.length ? "LIVE" : "PARTIAL"),
    reason: raw.dataQuality || "OK",
    sourceUpstream: envelope.provider || raw.sourceUpstream || raw.source,
    updatedAt: raw.updatedAt || envelope.fetchedAt,
    asOf: raw.asOf || raw.updatedAt || envelope.fetchedAt,
    ttlSeconds: raw.ttlSeconds || envelope.ttlSeconds || null,
    cadence: raw.cadence || raw.mode,
    source: raw.source || envelope.source || "mirror"
  };
}

function buildErrorSummary(errorEntries) {
  const grouped = new Map();
  errorEntries.forEach((entry) => {
    const key = `${entry.code}:${entry.provider}:${entry.dataset}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, count: 1, firstSeenAt: entry.firstSeenAt, lastSeenAt: entry.lastSeenAt });
      return;
    }
    existing.count += 1;
    existing.lastSeenAt = entry.lastSeenAt;
  });
  return Array.from(grouped.values()).slice(0, 200);
}

async function buildProviderState() {
  const stateEnvelope = loadJson(PROVIDER_STATE_MIRROR);
  const statePayload = unwrapEnvelope(stateEnvelope).raw;
  const state = statePayload || { schemaVersion: "v1", providers: {} };
  const locks = await listJsonFiles(MIRROR_LOCK_DIR);
  const lockEntries = locks.map((filePath) => {
    const payload = loadJson(filePath) || {};
    return {
      provider: payload.provider || payload.providerId || "unknown",
      dataset: payload.dataset || payload.datasetId || path.basename(filePath, ".json"),
      lockedAt: payload.lockedAt || payload.createdAt || null,
      expiresAt: payload.expiresAt || null
    };
  });
  const providers = state.providers || {};
  lockEntries.forEach((lock) => {
    if (!providers[lock.provider]) providers[lock.provider] = {};
    const entry = providers[lock.provider];
    if (!Array.isArray(entry.locks)) entry.locks = [];
    entry.locks.push({ dataset: lock.dataset, lockedAt: lock.lockedAt, expiresAt: lock.expiresAt });
  });
  return {
    schemaVersion: state.schemaVersion || "v1",
    generatedAt: new Date().toISOString(),
    providers
  };
}

function applyBudgetReport(usage, budgets) {
  const thresholds = budgets?.thresholds || { warnPct: 0.2, criticalPct: 0.05 };
  const providers = {};
  const monthly = usage?.monthly || {};
  const daily = usage?.daily || usage?.providers || {};
  const monthlyProviders = monthly.providers || monthly;
  const dailyProviders = daily.providers || daily;
  const budgetProviders = budgets?.providers || {};

  Object.keys(budgetProviders).forEach((providerId) => {
    const limits = budgetProviders[providerId] || {};
    const dailyLimit = limits.dailyRequests ?? null;
    const monthlyLimit = limits.monthlyRequests ?? null;
    const dailyUsed = dailyProviders?.[providerId]?.requests ?? 0;
    const monthlyUsed = monthlyProviders?.[providerId]?.requests ?? dailyUsed;
    const dailyRemaining = dailyLimit === null ? null : Math.max(0, dailyLimit - dailyUsed);
    const monthlyRemaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - monthlyUsed);
    const dailyPct = dailyLimit ? dailyRemaining / dailyLimit : null;
    const monthlyPct = monthlyLimit ? monthlyRemaining / monthlyLimit : null;
    const status =
      dailyPct !== null && dailyPct <= thresholds.criticalPct
        ? "red"
        : dailyPct !== null && dailyPct <= thresholds.warnPct
          ? "yellow"
          : "green";

    const endpointBudgets = limits.endpoints || {};
    const endpointDaily = dailyProviders?.[providerId]?.endpoints || {};
    const endpointMonthly = monthlyProviders?.[providerId]?.endpoints || {};
    const endpoints = {};
    Object.keys(endpointBudgets).forEach((endpointId) => {
      const endpointLimit = endpointBudgets[endpointId] || {};
      const endpointDailyLimit = endpointLimit.dailyRequests ?? null;
      const endpointMonthlyLimit = endpointLimit.monthlyRequests ?? null;
      const endpointDailyUsed = endpointDaily?.[endpointId]?.requests ?? 0;
      const endpointMonthlyUsed = endpointMonthly?.[endpointId]?.requests ?? endpointDailyUsed;
      const endpointDailyRemaining =
        endpointDailyLimit === null ? null : Math.max(0, endpointDailyLimit - endpointDailyUsed);
      const endpointMonthlyRemaining =
        endpointMonthlyLimit === null ? null : Math.max(0, endpointMonthlyLimit - endpointMonthlyUsed);
      const endpointDailyPct = endpointDailyLimit ? endpointDailyRemaining / endpointDailyLimit : null;
      const endpointMonthlyPct = endpointMonthlyLimit ? endpointMonthlyRemaining / endpointMonthlyLimit : null;
      const endpointStatus =
        endpointDailyPct !== null && endpointDailyPct <= thresholds.criticalPct
          ? "red"
          : endpointDailyPct !== null && endpointDailyPct <= thresholds.warnPct
            ? "yellow"
            : "green";
      endpoints[endpointId] = {
        daily: {
          used: endpointDailyUsed,
          limit: endpointDailyLimit,
          remaining: endpointDailyRemaining,
          pctRemaining: endpointDailyPct
        },
        monthly: {
          used: endpointMonthlyUsed,
          limit: endpointMonthlyLimit,
          remaining: endpointMonthlyRemaining,
          pctRemaining: endpointMonthlyPct
        },
        status: endpointStatus
      };
    });

    providers[providerId] = {
      daily: { used: dailyUsed, limit: dailyLimit, remaining: dailyRemaining, pctRemaining: dailyPct },
      monthly: { used: monthlyUsed, limit: monthlyLimit, remaining: monthlyRemaining, pctRemaining: monthlyPct },
      status,
      endpoints
    };
  });

  const cloudflareLimits = budgets?.cloudflare || {};
  const cfDailyUsed = usage?.cloudflare?.daily ?? 0;
  const cfMonthlyUsed = usage?.cloudflare?.monthly ?? 0;
  const cfDailyLimit = cloudflareLimits.dailyRequests ?? null;
  const cfMonthlyLimit = cloudflareLimits.monthlyRequests ?? null;
  const cfDailyRemaining = cfDailyLimit === null ? null : Math.max(0, cfDailyLimit - cfDailyUsed);
  const cfMonthlyRemaining = cfMonthlyLimit === null ? null : Math.max(0, cfMonthlyLimit - cfMonthlyUsed);
  const cfDailyPct = cfDailyLimit ? cfDailyRemaining / cfDailyLimit : null;
  const cfMonthlyPct = cfMonthlyLimit ? cfMonthlyRemaining / cfMonthlyLimit : null;

  return {
    generatedAt: new Date().toISOString(),
    thresholds,
    providers,
    cloudflare: {
      daily: { used: cfDailyUsed, limit: cfDailyLimit, remaining: cfDailyRemaining, pctRemaining: cfDailyPct },
      monthly: { used: cfMonthlyUsed, limit: cfMonthlyLimit, remaining: cfMonthlyRemaining, pctRemaining: cfMonthlyPct }
    },
    notes: usage?.notes || []
  };
}

async function copyMarketphase(changedFiles) {
  if (!fs.existsSync(MIRROR_MARKETPHASE_DIR)) return;
  await fsp.mkdir(MARKETPHASE_PUBLIC, { recursive: true });
  const files = await listJsonFiles(MIRROR_MARKETPHASE_DIR);
  for (const filePath of files) {
    const filename = path.basename(filePath);
    const payload = loadJson(filePath);
    if (!payload) continue;
    const { raw } = unwrapEnvelope(payload);
    if (!raw) continue;
    await writeIfChanged(path.join(MARKETPHASE_PUBLIC, filename), raw, changedFiles);
  }
}

function runBundleGenerator() {
  const genPath = path.join(ROOT, "scripts", "build-bundle-and-render-plan.mjs");
  if (!fs.existsSync(genPath)) return { ok: true, skipped: true };
  const res = spawnSync(process.execPath, [genPath], { stdio: "inherit" });
  if (res.status !== 0) {
    return { ok: false, error: `bundle_generator_failed:${res.status}` };
  }
  return { ok: true, skipped: false };
}

async function main() {
  const budgets = loadJson(BUDGETS_PATH) || {};
  const mirrors = await collectMirrorInputs();
  const changedFiles = [];
  const errors = [];
  const snapshotStatuses = [];
  const lastGoodAsOf = {};

  const entries = Object.entries(mirrors);
  for (const [mirrorId, raw] of entries) {
    const blockId = MIRROR_MAP.get(mirrorId) || mirrorId;
    if (!blockId) continue;
    const unwrapped = unwrapEnvelope(raw);
    const mirrorMeta = normalizeMirrorMeta(unwrapped.raw, unwrapped.meta, blockId);
    
    // Load lastGood snapshot for fallback
    const snapshotPath = path.join(SNAPSHOT_DIR, `${blockId}.json`);
    const lastGoodSnapshot = loadJson(snapshotPath);
    
    const snapshot = await buildSnapshot({ blockId, raw: unwrapped.raw, mirrorMeta, lastGoodSnapshot });
    const valid = snapshot.meta.validation.schema.ok &&
      snapshot.meta.validation.ranges.ok &&
      snapshot.meta.validation.integrity.ok;
    if (!valid) {
      const existing = loadJson(snapshotPath);
      if (existing?.dataAt) lastGoodAsOf[blockId] = existing.dataAt;
      errors.push({
        code: "VALIDATION_FAILED",
        severity: "error",
        provider: mirrorMeta.sourceUpstream || "mirror",
        dataset: blockId,
        message: snapshot.meta.validation,
        firstSeenAt: snapshot.generatedAt,
        lastSeenAt: snapshot.generatedAt,
        runId: RUN_ID
      });
      snapshotStatuses.push({ blockId, status: "FAIL", reason: "VALIDATION_FAILED" });
      continue;
    }
    await writeIfChanged(snapshotPath, snapshot, changedFiles);
    snapshotStatuses.push({ blockId, status: "OK", reason: snapshot.meta.reason || "OK" });
  }

  if (!mirrors["rvci-engine"]) {
    const rvciLatestPath = path.join(PUBLIC_DATA, "rvci_latest.json");
    if (fs.existsSync(rvciLatestPath)) {
      const latest = loadJson(rvciLatestPath);
      if (latest) {
        const snapshot = buildRvciSnapshot(latest);
        const valid = snapshot.meta.validation.schema.ok && snapshot.meta.validation.integrity.ok;
        const snapshotPath = path.join(SNAPSHOT_DIR, "rvci-engine.json");
        if (!valid) {
          const existing = loadJson(snapshotPath);
          if (existing?.dataAt) lastGoodAsOf["rvci-engine"] = existing.dataAt;
          errors.push({
            code: "VALIDATION_FAILED",
            severity: "error",
            provider: "rvci",
            dataset: "rvci-engine",
            message: snapshot.meta.validation,
            firstSeenAt: snapshot.generatedAt,
            lastSeenAt: snapshot.generatedAt,
            runId: RUN_ID
          });
          snapshotStatuses.push({ blockId: "rvci-engine", status: "FAIL", reason: "VALIDATION_FAILED" });
        } else {
          await writeIfChanged(snapshotPath, snapshot, changedFiles);
          snapshotStatuses.push({ blockId: "rvci-engine", status: "OK", reason: snapshot.meta.reason || "OK" });
        }
      } else {
        errors.push({
          code: "RVCI_LATEST_INVALID",
          severity: "error",
          provider: "rvci",
          dataset: "rvci-engine",
          message: "rvci_latest.json invalid",
          firstSeenAt: RUN_ID,
          lastSeenAt: RUN_ID,
          runId: RUN_ID
        });
        snapshotStatuses.push({ blockId: "rvci-engine", status: "FAIL", reason: "INVALID_INPUT" });
      }
    } else {
      errors.push({
        code: "RVCI_LATEST_MISSING",
        severity: "error",
        provider: "rvci",
        dataset: "rvci-engine",
        message: "rvci_latest.json missing",
        firstSeenAt: RUN_ID,
        lastSeenAt: RUN_ID,
        runId: RUN_ID
      });
      snapshotStatuses.push({ blockId: "rvci-engine", status: "FAIL", reason: "MISSING_INPUT" });
    }
  }

  if (fs.existsSync(MANIFEST_MIRROR)) {
    const manifestEnvelope = loadJson(MANIFEST_MIRROR);
    const manifest = unwrapEnvelope(manifestEnvelope).raw;
    if (manifest) {
      await writeIfChanged(path.join(PUBLIC_DATA, "seed-manifest.json"), manifest, changedFiles);
    }
  }

  await copyMarketphase(changedFiles);

  const providerState = await buildProviderState();
  const providerMeta = buildMetaEnvelope({
    status: "OK",
    reason: "OK",
    asOf: providerState.generatedAt,
    generatedAt: providerState.generatedAt
  });
  await writeIfChanged(PROVIDER_STATE_PATH, { ...providerState, meta: providerMeta }, changedFiles);

  const usageEnvelope = loadJson(USAGE_REPORT_MIRROR);
  const usageRaw = unwrapEnvelope(usageEnvelope).raw || {};
  const usageReport = applyBudgetReport(usageRaw, budgets);
  const usageMeta = buildMetaEnvelope({
    status: "OK",
    reason: "OK",
    asOf: usageReport.generatedAt,
    generatedAt: usageReport.generatedAt
  });
  await writeIfChanged(USAGE_REPORT_PATH, { ...usageReport, meta: usageMeta }, changedFiles);

  const errorGeneratedAt = new Date().toISOString();
  const errorSummary = buildErrorSummary(errors);
  const errorMeta = buildMetaEnvelope({
    status: "OK",
    reason: "OK",
    asOf: errorGeneratedAt,
    generatedAt: errorGeneratedAt
  });
  await writeIfChanged(ERROR_SUMMARY_PATH, {
    generatedAt: errorGeneratedAt,
    items: errorSummary,
    meta: errorMeta
  }, changedFiles);

  const bundleResult = runBundleGenerator();
  if (!bundleResult.ok) {
    errors.push({
      code: "BUNDLE_GENERATION_FAILED",
      severity: "error",
      provider: "registry",
      dataset: "render-plan",
      message: bundleResult.error,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      runId: RUN_ID
    });
  }

  const buildStatus = errors.length ? "FAIL" : "OK";
  const systemGeneratedAt = new Date().toISOString();
  const systemMeta = buildMetaEnvelope({
    status: buildStatus === "OK" ? "OK" : "ERROR",
    reason: buildStatus,
    asOf: systemGeneratedAt,
    generatedAt: systemGeneratedAt
  });
  const systemHealth = {
    generatedAt: systemGeneratedAt,
    buildStatus,
    reasons: errors.map((err) => `${err.dataset}:${err.code}`),
    summary: {
      total: snapshotStatuses.length,
      ok: snapshotStatuses.filter((s) => s.status === "OK").length,
      fail: snapshotStatuses.filter((s) => s.status !== "OK").length
    },
    lastGoodAsOf,
    snapshots: snapshotStatuses,
    runId: RUN_ID,
    meta: systemMeta
  };
  await writeIfChanged(SYSTEM_HEALTH_PATH, systemHealth, changedFiles);

  const runReport = {
    runId: RUN_ID,
    durationMs: Date.now() - BUILD_STARTED,
    changedFiles,
    counts: {
      snapshots: snapshotStatuses.length,
      errors: errors.length
    }
  };
  await writeIfChanged(RUN_REPORT_PATH, runReport, changedFiles, { sanitize: false });

  console.log(`build-snapshots complete: ${snapshotStatuses.length} snapshots (${changedFiles.length} changed)`);
}

main().catch((error) => {
  console.error("build-snapshots failed:", error.message || error);
  process.exit(1);
});

// RV_V3_META_POSTFIX_BEGIN
// Ensure required debug snapshots are always public-safe and include meta.* contract.
import { withMeta } from "./_lib/with-meta.mjs";

async function rvEnsureMetaFile(filePath, opts = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.meta && obj.data !== undefined) return false;
    const wrapped = withMeta(obj, opts);
    await fs.writeFile(filePath, JSON.stringify(wrapped, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

async function rvEnsureMetaForDebugOutputs() {
  const runId = new Date().toISOString();
  const files = [
    SYSTEM_HEALTH_PATH,
    PROVIDER_STATE_PATH,
    USAGE_REPORT_PATH,
    ERROR_SUMMARY_PATH,
  ];
  let changed = 0;
  for (const p of files) {
    const did = await rvEnsureMetaFile(p, { runId });
    if (did) changed += 1;
  }
  return changed;
}
// RV_V3_META_POSTFIX_END
