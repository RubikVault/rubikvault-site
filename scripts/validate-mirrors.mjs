import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirrorEnvelope, validateBasicMirrorShape, isFiniteNumber } from "./utils/mirror-io.mjs";
import { BLOCK_REGISTRY } from "../features/blocks-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_ROOT = path.resolve(__dirname, "../mirrors");
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

function normalizeMirrorPayload(mirrorId, envelope) {
  const raw = envelope?.raw ?? envelope;
  const envelopeMeta = envelope?.meta ?? null;
  if (!raw) return { mirror: null, errors: ["mirror_missing"] };
  const errors = [];
  if (!envelopeMeta || typeof envelopeMeta !== "object") {
    errors.push("envelope_missing");
  } else {
    ["provider", "dataset", "fetchedAt", "source", "runId", "ttlSeconds"].forEach((field) => {
      if (envelopeMeta[field] === undefined || envelopeMeta[field] === null || envelopeMeta[field] === "") {
        errors.push(`envelope_meta_missing_${field}`);
      }
    });
  }

  if (raw && typeof raw === "object" && raw.schemaVersion && raw.mirrorId && raw.items) {
    return { mirror: raw, errors };
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
  const legacyErrors = Array.isArray(legacy.errors)
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
    errors: legacyErrors,
    notes,
    whyUnique: legacy.whyUnique || "",
    context,
    items
  };

  return { mirror: coerced, errors: [...errors, "coerced_legacy_shape"] };
}

const failures = [];

for (const entry of Object.values(BLOCK_REGISTRY)) {
  for (const mirrorId of entry.mirrorFiles) {
    const filePath = path.join(MIRROR_ROOT, `${mirrorId}.json`);
    const envelope = loadMirrorEnvelope(filePath);
    if (!envelope) {
      failures.push({ mirrorId, error: "mirror_missing", filePath });
      continue;
    }
    const normalized = normalizeMirrorPayload(mirrorId, envelope);
    if (normalized.errors.length && normalized.errors.includes("mirror_missing")) {
      failures.push({ mirrorId, error: "mirror_missing", filePath });
      continue;
    }
    const envelopeErrors = normalized.errors.filter((err) => err.startsWith("envelope_"));
    if (envelopeErrors.length) {
      failures.push({ mirrorId, error: "envelope_invalid", details: envelopeErrors });
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
    if (mirrorId === "alpha-radar") {
      if (typeof normalized.mirror.generatedAt !== "string" || !normalized.mirror.generatedAt.trim()) {
        failures.push({ mirrorId, error: "generatedAt_missing" });
      }
      if (!normalized.mirror.data || typeof normalized.mirror.data !== "object") {
        failures.push({ mirrorId, error: "data_missing" });
      }
      const picks = normalized.mirror?.data?.picks;
      const top = Array.isArray(picks?.top) ? picks.top : [];
      if (!top.length) {
        failures.push({ mirrorId, error: "picks_top_missing" });
      } else {
        const sample = top[0] || {};
        const required = [
          "symbol",
          "name",
          "close",
          "changePct",
          "stop",
          "setupScore",
          "triggerScore",
          "totalScore",
          "setup",
          "trigger",
          "tags",
          "notes"
        ];
        required.forEach((key) => {
          if (!(key in sample)) {
            failures.push({ mirrorId, error: `pick_missing_${key}` });
          }
        });
        if (!sample.setup || typeof sample.setup !== "object") {
          failures.push({ mirrorId, error: "pick_setup_missing" });
        }
        if (!sample.trigger || typeof sample.trigger !== "object") {
          failures.push({ mirrorId, error: "pick_trigger_missing" });
        }
        if (!Array.isArray(sample.tags)) {
          failures.push({ mirrorId, error: "pick_tags_invalid" });
        }
      }
    }
    if (mirrorId === "tech-signals") {
      if (typeof normalized.mirror.generatedAt !== "string" || !normalized.mirror.generatedAt.trim()) {
        failures.push({ mirrorId, error: "generatedAt_missing" });
      }
      if (!normalized.mirror.data || typeof normalized.mirror.data !== "object") {
        failures.push({ mirrorId, error: "data_missing" });
      }
      const signals = normalized.mirror?.data?.signals;
      const rows = normalized.mirror?.data?.rows;
      if (!Array.isArray(signals) && !Array.isArray(rows)) {
        failures.push({ mirrorId, error: "signals_or_rows_missing" });
      }
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
