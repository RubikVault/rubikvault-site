import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
const REDACTION_TOKEN = "<redacted>";

const RUN_ID = new Date().toISOString();
const BUILD_STARTED = Date.now();

const MIRROR_MAP = new Map([
  ["news", "news-headlines"],
  ["market-cockpit", "market-cockpit"],
  ["sp500-sectors", "sp500-sectors"],
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

function sanitizeString(value) {
  let next = value;
  const redactions = [
    { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replace: REDACTION_TOKEN },
    { pattern: new RegExp("\\/" + "Users" + "\\/" + "[^/]+", "g"), replace: ("/" + "Users" + "/" + "<redacted>") },
    { pattern: new RegExp("\\/" + "home"  + "\\/" + "[^/]+", "g"), replace: ("/" + "home"  + "/" + "<redacted>") },
    { pattern: new RegExp("[A-Za-z]:\\\\Us" + "ers\\\\[^\\\\]+", "g"), replace: "C:\\Us" + "ers\\<redacted>" },
    { pattern: new RegExp("\\\\Us" + "ers\\\$begin:math:display$^\\\\\\\$end:math:display$+", "g"), replace: "\\Us" + "ers\\<redacted>" },
    { pattern: /\b[A-Za-z0-9-]+\.local\b/gi, replace: REDACTION_TOKEN },
    { pattern: /\b[A-Za-z0-9-]+\.lan\b/gi, replace: REDACTION_TOKEN },
    { pattern: /\b[A-Za-z0-9-]+\.internal\b/gi, replace: REDACTION_TOKEN }
  ];
  for (const rule of redactions) {
    next = next.replace(rule.pattern, rule.replace);
  }
  if (!/https?:\/\//i.test(next) && /^(mirrors|public|internal|\.artifacts)\//i.test(next)) {
    next = REDACTION_TOKEN;
  }
  if (!/https?:\/\//i.test(next) && /^(\/|[A-Za-z]:\\)/.test(next)) {
    next = REDACTION_TOKEN;
  }
  return next;
}

function sanitizeForPublic(payload, state = { redactions: 0 }, seen = new WeakSet()) {
  if (payload === null || payload === undefined) return payload;
  const valueType = typeof payload;
  if (valueType === "string") {
    const sanitized = sanitizeString(payload);
    if (sanitized !== payload) state.redactions += 1;
    return sanitized;
  }
  if (valueType !== "object") return payload;
  if (seen.has(payload)) {
    throw new Error("sanitize_failed:circular_reference");
  }
  seen.add(payload);
  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizeForPublic(entry, state, seen));
  }
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = sanitizeForPublic(value, state, seen);
  }
  return out;
}

function assertPublicSafe(payload, label) {
  const violations = [];
  const checks = [
    /\/Users\/[^/]+/i,
    /\/home\/[^/]+/i,
    new RegExp("[A-Za-z]:\\\\Us" + "ers\\\\[^\\\\]+", "i"),
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
    /\b[A-Za-z0-9-]+\.local\b/i,
    /\b[A-Za-z0-9-]+\.lan\b/i,
    /\b[A-Za-z0-9-]+\.internal\b/i
  ];
  function walk(node) {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      if (/https?:\/\//i.test(node)) return;
      for (const regex of checks) {
        if (regex.test(node)) {
          violations.push(regex.toString());
          return;
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  }
  walk(payload);
  if (violations.length) {
    throw new Error(`sanitize_failed:${label || "payload"}:${violations.join(",")}`);
  }
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

function mapMirrorData(mirrorId, raw) {
  if (mirrorId === "sp500-sectors") {
    const sectors = extractSectors(raw);
    const items = extractItems(raw);
    return { items, extraData: { ...extractExtraData(raw), sectors } };
  }
  if (mirrorId === "tech-signals") {
    const items = extractItems(raw);
    return { items, extraData: { ...extractExtraData(raw), signals: items, rows: items } };
  }
  if (mirrorId === "alpha-radar") {
    const items = extractItems(raw);
    const picks = raw?.data?.picks || raw?.picks || null;
    const extraData = picks && typeof picks === "object" ? { ...extractExtraData(raw), picks } : extractExtraData(raw);
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

function buildSnapshot({ blockId, raw, mirrorMeta }) {
  const generatedAt = new Date().toISOString();
  const asOf = mirrorMeta.asOf || mirrorMeta.updatedAt || generatedAt;
  const ttlSeconds = Number.isFinite(mirrorMeta.ttlSeconds) ? mirrorMeta.ttlSeconds : 3600;
  const freshness = computeFreshness(asOf, ttlSeconds);
  const schedule = computeSchedule(mirrorMeta.cadence || mirrorMeta.mode || "daily", ttlSeconds);
  const { items, extraData } = mapMirrorData(blockId, raw);
  const sanitizedItems = redactSecrets(items);
  const data = { items: sanitizedItems, ...redactSecrets(extraData) };
  const itemsCount = sanitizedItems.length;
  const sourceUpstream = typeof mirrorMeta.sourceUpstream === "string" ? mirrorMeta.sourceUpstream : null;
  const sourceValue = typeof mirrorMeta.source === "string" ? mirrorMeta.source : null;
  const meta = {
    status: mirrorMeta.status || (sanitizedItems.length ? "LIVE" : "PARTIAL"),
    reason: mirrorMeta.reason || (sanitizedItems.length ? "OK" : "EMPTY"),
    generatedAt,
    asOf,
    source: sourceUpstream || sourceValue || "mirror",
    ttlSeconds,
    stale: freshness.status !== "fresh",
    itemsCount,
    stalenessSec: Number.isFinite(freshness.ageMinutes) ? freshness.ageMinutes * 60 : null,
    freshness,
    schedule,
    runId: RUN_ID
  };
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
    const snapshot = buildSnapshot({ blockId, raw: unwrapped.raw, mirrorMeta });
    const valid = snapshot.meta.validation.schema.ok &&
      snapshot.meta.validation.ranges.ok &&
      snapshot.meta.validation.integrity.ok;

    const snapshotPath = path.join(SNAPSHOT_DIR, `${blockId}.json`);
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

  if (fs.existsSync(MANIFEST_MIRROR)) {
    const manifestEnvelope = loadJson(MANIFEST_MIRROR);
    const manifest = unwrapEnvelope(manifestEnvelope).raw;
    if (manifest) {
      await writeIfChanged(path.join(PUBLIC_DATA, "seed-manifest.json"), manifest, changedFiles);
    }
  }

  await copyMarketphase(changedFiles);

  const providerState = await buildProviderState();
  await writeIfChanged(PROVIDER_STATE_PATH, providerState, changedFiles);

  const usageEnvelope = loadJson(USAGE_REPORT_MIRROR);
  const usageRaw = unwrapEnvelope(usageEnvelope).raw || {};
  const usageReport = applyBudgetReport(usageRaw, budgets);
  await writeIfChanged(USAGE_REPORT_PATH, usageReport, changedFiles);

  const errorSummary = buildErrorSummary(errors);
  await writeIfChanged(ERROR_SUMMARY_PATH, {
    generatedAt: new Date().toISOString(),
    items: errorSummary
  }, changedFiles);

  const buildStatus = errors.length ? "FAIL" : "OK";
  const systemHealth = {
    generatedAt: new Date().toISOString(),
    buildStatus,
    reasons: errors.map((err) => `${err.dataset}:${err.code}`),
    summary: {
      total: snapshotStatuses.length,
      ok: snapshotStatuses.filter((s) => s.status === "OK").length,
      fail: snapshotStatuses.filter((s) => s.status !== "OK").length
    },
    lastGoodAsOf,
    snapshots: snapshotStatuses,
    runId: RUN_ID
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

// RV_V3_GENERATE_BUNDLE_AND_RENDERPLAN
// Build bundle.json + render-plan.json from public/features/feature-registry.json (static SSOT for UI)
try {
  const { default: path } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const gen = path.resolve(here, "build-bundle-and-render-plan.mjs");
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(process.execPath, [gen], { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`bundle/render-plan generator failed: ${res.status}`);
} catch (e) {
  console.error("WARN: bundle/render-plan generation failed:", e && e.message ? e.message : e);
}


  process.exit(1);
});



// --- v3 SSOT glue: always (re)generate public/data/bundle.json + public/data/render-plan.json
try {
  const { execFileSync } = await import("node:child_process");
  const gen = "scripts/build-bundle-and-render-plan.mjs";
  if (fs.existsSync(gen)) {
    execFileSync(process.execPath, [gen], { stdio: "inherit", env: { ...process.env, RV_RUN_ID: process.env.RV_RUN_ID || new Date().toISOString() } });
  }
} catch (e) {
  console.error("WARN: bundle/render-plan generation hook failed:", e?.message || e);
}

