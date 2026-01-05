import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirror, validateBasicMirrorShape, isFiniteNumber } from "./utils/mirror-io.mjs";
import { BLOCK_REGISTRY } from "../features/blocks-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_ROOT = path.resolve(__dirname, "../public/mirrors");
const now = Date.now();
const warnings = [];
const continuousEmptySoftAllow = new Set(["alpha-radar", "volume-anomaly", "breakout-energy"]);

function minutesBetween(a, b) {
  return Math.abs(a - b) / 60000;
}

function toDate(value) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function checkNumbers(value, errors, pathParts, nullableSet) {
  if (value === null) {
    const key = pathParts[pathParts.length - 1];
    if (!nullableSet.has(key)) {
      errors.push(`null_not_allowed:${pathParts.join(".")}`);
    }
    return;
  }
  if (typeof value === "number") {
    if (!isFiniteNumber(value)) {
      errors.push(`non_finite:${pathParts.join(".")}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => checkNumbers(item, errors, [...pathParts, String(idx)], nullableSet));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, val]) => checkNumbers(val, errors, [...pathParts, key], nullableSet));
  }
}

function normalizeDataQuality(rawStatus) {
  const status = String(rawStatus || "").toUpperCase();
  if (status === "LIVE" || status === "OK") return "OK";
  if (status === "PARTIAL") return "PARTIAL";
  if (status === "EMPTY") return "EMPTY";
  if (status === "STALE") return "STALE";
  if (status === "COVERAGE_LIMIT") return "COVERAGE_LIMIT";
  return "EMPTY";
}

function normalizeMirrorPayload(mirrorId, raw) {
  if (!raw) return { mirror: null, errors: ["mirror_missing"] };
  if (raw && typeof raw === "object" && raw.schemaVersion && raw.mirrorId && raw.items) {
    return { mirror: raw, errors: [] };
  }

  const legacy = raw && typeof raw === "object" ? raw : { items: Array.isArray(raw) ? raw : [] };
  const items = Array.isArray(legacy.items)
    ? legacy.items
    : Array.isArray(legacy?.data?.items)
      ? legacy.data.items
      : Array.isArray(legacy?.rows)
        ? legacy.rows
        : [];
  const meta = legacy.meta || {};
  const nowIso = new Date().toISOString();
  const updatedAt = meta.updatedAt || meta.ts || legacy.updatedAt || nowIso;
  const asOf = legacy.asOf || meta.asOf || updatedAt;
  const dataQuality = normalizeDataQuality(meta.status || legacy.dataQuality || (legacy.ok === false ? "ERROR" : null));
  const errors = Array.isArray(legacy.errors)
    ? legacy.errors
    : legacy.error
      ? [legacy.error.code || "ERROR"]
      : [];
  const missingSymbols = Array.isArray(legacy.missingSymbols) ? legacy.missingSymbols : [];
  const notes = Array.isArray(legacy.notes) ? legacy.notes : [];
  const context = legacy.context || meta || {};

  const coerced = {
    schemaVersion: "rv-mirror-v1",
    mirrorId,
    runId: meta.traceId || legacy.traceId || updatedAt,
    updatedAt,
    asOf,
    mode: legacy.mode || meta.mode || "MIRROR",
    cadence: legacy.cadence || meta.cadence || "best_effort",
    trust: legacy.trust || "derived",
    source: legacy.source || "mirror",
    sourceUpstream: legacy.sourceUpstream || meta.source || "unknown",
    dataQuality,
    delayMinutes: meta.ageMinutes ?? 0,
    missingSymbols,
    errors,
    notes,
    whyUnique: legacy.whyUnique || "",
    context,
    items
  };

  return { mirror: coerced, errors: ["coerced_legacy_shape"] };
}

const failures = [];

for (const entry of Object.values(BLOCK_REGISTRY)) {
  for (const mirrorId of entry.mirrorFiles) {
    const filePath = path.join(MIRROR_ROOT, `${mirrorId}.json`);
    const mirror = loadMirror(filePath);
    if (!mirror) {
      failures.push({ mirrorId, error: "mirror_missing", filePath });
      continue;
    }
    const normalized = normalizeMirrorPayload(mirrorId, mirror);
    if (normalized.errors.length && normalized.errors.includes("mirror_missing")) {
      failures.push({ mirrorId, error: "mirror_missing", filePath });
      continue;
    }
    if (normalized.errors.length && !normalized.errors.includes("mirror_missing")) {
      warnings.push({ mirrorId, warning: "shape_coerced", details: normalized.errors });
    }
    const shape = validateBasicMirrorShape(normalized.mirror);
    if (!shape.ok) {
      warnings.push({ mirrorId, warning: "shape_invalid", details: shape.errors });
      if (!normalized.mirror) continue;
    }

    const items = Array.isArray(normalized.mirror.items) ? normalized.mirror.items : [];
    if (entry.blockType === "CONTINUOUS" && items.length < entry.expectedMinItems) {
      const payload = { mirrorId, warning: "continuous_empty", count: items.length };
      warnings.push(payload);
    }
    if (entry.blockType === "EVENT") {
      const ctx = normalized.mirror.context || {};
      if (!ctx.lookbackWindowDays || !ctx.explain) {
        warnings.push({ mirrorId, warning: "event_missing_context" });
      }
    }
    if (entry.blockType === "LIVE") {
      const updatedAt = toDate(normalized.mirror.updatedAt);
      if (updatedAt) {
        const ageMinutes = minutesBetween(now, updatedAt.getTime());
        if (ageMinutes > entry.freshness.liveMaxMinutes) {
          const payload = { mirrorId, warning: "live_stale_not_marked", ageMinutes };
          warnings.push(payload);
          normalized.mirror.dataQuality = "STALE";
        }
      }
    }

    const nullableSet = new Set(Object.keys(entry.nullableFields || {}));
    if (mirrorId === "top-movers") nullableSet.add("lastClose");
    items.forEach((item, idx) => {
      const errors = [];
      checkNumbers(item, errors, [mirrorId, "items", String(idx)], nullableSet);
      if (errors.length) {
        failures.push({ mirrorId, error: "item_numeric_invalid", details: errors });
      }
    });
  }
}

if (failures.length) {
  console.error("MIRROR_VALIDATION_FAILED");
  failures.forEach((failure) => {
    console.error(JSON.stringify(failure));
  });
  process.exit(1);
}

console.log("MIRROR_VALIDATION_OK");
if (warnings.length) {
  console.warn("WARNINGS_PRESENT");
  warnings.forEach((warning) => console.warn(JSON.stringify(warning)));
}
