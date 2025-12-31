import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirror, validateBasicMirrorShape, isFiniteNumber } from "./utils/mirror-io.mjs";
import { BLOCK_REGISTRY } from "../features/blocks-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_ROOT = path.resolve(__dirname, "../public/mirrors");
const now = Date.now();

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

const failures = [];

for (const entry of Object.values(BLOCK_REGISTRY)) {
  for (const mirrorId of entry.mirrorFiles) {
    const filePath = path.join(MIRROR_ROOT, `${mirrorId}.json`);
    const mirror = loadMirror(filePath);
    if (!mirror) {
      failures.push({ mirrorId, error: "mirror_missing", filePath });
      continue;
    }
    const shape = validateBasicMirrorShape(mirror);
    if (!shape.ok) {
      failures.push({ mirrorId, error: "shape_invalid", details: shape.errors });
    }

    const items = Array.isArray(mirror.items) ? mirror.items : [];
    if (entry.blockType === "CONTINUOUS" && items.length < entry.expectedMinItems) {
      failures.push({ mirrorId, error: "continuous_empty", count: items.length });
    }
    if (entry.blockType === "EVENT") {
      const ctx = mirror.context || {};
      if (!ctx.lookbackWindowDays || !ctx.explain) {
        failures.push({ mirrorId, error: "event_missing_context" });
      }
    }
    if (entry.blockType === "LIVE") {
      const updatedAt = toDate(mirror.updatedAt);
      if (updatedAt) {
        const ageMinutes = minutesBetween(now, updatedAt.getTime());
        if (ageMinutes > entry.freshness.liveMaxMinutes && mirror.dataQuality !== "STALE") {
          failures.push({ mirrorId, error: "live_stale_not_marked", ageMinutes });
        }
      }
    }

    const nullableSet = new Set(Object.keys(entry.nullableFields || {}));
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
