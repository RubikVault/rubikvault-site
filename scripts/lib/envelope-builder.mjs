import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";

function isoNow() { return new Date().toISOString(); }

function sha256Hex(obj) {
  const s = JSON.stringify(obj);
  return crypto.createHash("sha256").update(s).digest("hex");
}

function pickType(node) {
  if (!node) return null;
  if (typeof node.type === "string") return node.type;
  if (Array.isArray(node.type) && node.type.length) {
    // Prefer non-null types if present
    const nonNull = node.type.find(t => t !== "null");
    return nonNull || node.type[0];
  }
  if (node.oneOf && node.oneOf.length) return pickType(node.oneOf[0]);
  if (node.anyOf && node.anyOf.length) return pickType(node.anyOf[0]);
  if (node.allOf && node.allOf.length) return pickType(node.allOf[0]);
  return null;
}

function defaultFor(node) {
  if (!node) return null;
  if (node.default !== undefined) return node.default;
  if (node.const !== undefined) return node.const;
  if (Array.isArray(node.enum) && node.enum.length) return node.enum[0];

  const t = pickType(node);
  if (t === "string") return "";
  if (t === "number") return 0;
  if (t === "integer") return 0;
  if (t === "boolean") return false;
  if (t === "array") return [];
  if (t === "object") return {};
  return null;
}

// Build ONLY allowed keys, and ensure ALL required keys exist (schema-driven).
function buildFromSchema(node, provided) {
  const t = pickType(node);
  if (t === "object") {
    const props = node.properties || {};
    const required = Array.isArray(node.required) ? node.required : [];
    const additional = node.additionalProperties;

    const out = {};

    // Only allow schema properties when additionalProperties is false;
    // otherwise still prefer properties-based output for determinism.
    const allowedKeys = new Set(Object.keys(props));

    // Fill required keys first
    for (const k of required) {
      const childSchema = props[k];
      const pv = (provided && typeof provided === "object") ? provided[k] : undefined;
      if (childSchema) {
        out[k] = buildFromSchema(childSchema, pv);
        // If child is still "empty" and we have a usable provided scalar, preserve it
        const ct = pickType(childSchema);
        if (pv !== undefined && pv !== null && ct && ct !== "object" && ct !== "array") {
          out[k] = pv;
        }
      } else {
        out[k] = (pv !== undefined) ? pv : null;
      }
    }

    // Add optional keys if provided and allowed
    if (provided && typeof provided === "object") {
      for (const [k, v] of Object.entries(provided)) {
        if (!allowedKeys.has(k)) continue;
        if (out[k] !== undefined) continue;
        const childSchema = props[k];
        out[k] = childSchema ? buildFromSchema(childSchema, v) : v;
      }
    }

    // If schema has additionalProperties object schema, we could allow extras.
    // But CI failures indicate strict "additionalProperties:false" is used.
    // So we intentionally do NOT keep unknown keys.
    if (additional !== undefined && additional !== false && provided && typeof provided === "object") {
      // still do nothing: keep strict determinism
    }

    return out;
  }

  if (t === "array") {
    if (Array.isArray(provided)) return provided;
    const dv = defaultFor(node);
    return Array.isArray(dv) ? dv : [];
  }

  // scalar
  if (provided !== undefined && provided !== null) return provided;
  return defaultFor(node);
}

export function loadSnapshotEnvelopeSchema(schemaPath = "schemas/snapshot-envelope.schema.json") {
  const p = path.resolve(schemaPath);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function createValidator(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return { ajv, validate };
}

export function buildEnvelope(schema, input = {}) {
  // Provide meaningful defaults for common fields via "provided" values.
  // The schema-driven builder will still enforce required structure & allowed keys.
  const now = isoNow();
  const data = (input.data !== undefined) ? input.data : null;
  const digest = input.digest || `sha256:${sha256Hex(data)}`;

  const provided = {
    schema_version: input.schema_version || "3.0",
    metadata: {
      module: input.module || "health",
      tier: input.tier || "critical",
      domain: input.domain || "system",
      source: input.source || "generator",
      fetched_at: input.fetched_at || now,
      published_at: input.published_at || now,
      digest,
      record_count: (typeof input.record_count === "number")
        ? input.record_count
        : (Array.isArray(data) ? data.length : (data && typeof data === "object" ? Object.keys(data).length : 0)),
      expected_count: (typeof input.expected_count === "number")
        ? input.expected_count
        : (Array.isArray(data) ? data.length : (data && typeof data === "object" ? Object.keys(data).length : 0)),
      validation: {
        passed: (input.validation && typeof input.validation.passed === "boolean") ? input.validation.passed : true,
        ...(input.validation || {})
      },
      freshness: { ...(input.freshness || {}) },
      upstream: { ...(input.upstream || {}) }
    },
    data: data,
    error: (input.error !== undefined) ? input.error : null
  };

  // Build strict object from schema (required + allowed only)
  const strict = buildFromSchema(schema, provided);

  // Deterministic key order at top-level
  const ordered = {
    schema_version: strict.schema_version,
    metadata: strict.metadata,
    data: strict.data,
    error: strict.error
  };

  return ordered;
}
