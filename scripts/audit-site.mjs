#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOL_VERSION = "audit-site/v1";
const DEFAULTS = {
  mode: "local",
  base: "public",
  format: "json",
  failOn: "none",
  timeoutMs: 10000,
  maxDepth: 6,
  maxItems: 50,
  maxFieldsPerBlock: 500,
  maxBlocks: 200,
  maxAuditTimeMs: 60000,
  maxBlocksLive: 20,
  debug: false
};
let LAST_ARGS = { failOn: DEFAULTS.failOn };

function getByPath(obj, pathExpr) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(pathExpr).split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

const REASON_CODES = [
  "FILE_MISSING",
  "JSON_PARSE_ERROR",
  "FIELD_MISSING",
  "FIELD_NULLISH",
  "TYPE_MISMATCH",
  "FORMAT_INVALID",
  "RANGE_INVALID",
  "DATA_EMPTY",
  "STALE_DATA",
  "UPSTREAM_ERROR",
  "NETWORK_TIMEOUT",
  "RATE_LIMIT_EXCEEDED",
  "CIRCUIT_OPEN",
  "UI_MAPPING_MISMATCH",
  "BASE_URL_MISCONFIG",
  "DEPENDENCY_MISSING",
  "LIMIT_EXCEEDED",
  "UNKNOWN",
  "OK"
];

const SEVERITY_BY_REASON = {
  FILE_MISSING: "CRITICAL",
  JSON_PARSE_ERROR: "CRITICAL",
  BASE_URL_MISCONFIG: "CRITICAL",
  UI_MAPPING_MISMATCH: "CRITICAL",
  UPSTREAM_ERROR: "ERROR",
  FIELD_MISSING: "ERROR",
  TYPE_MISMATCH: "ERROR",
  FORMAT_INVALID: "ERROR",
  RANGE_INVALID: "ERROR",
  STALE_DATA: "WARN",
  DATA_EMPTY: "WARN",
  LIMIT_EXCEEDED: "WARN",
  UNKNOWN: "WARN",
  OK: "INFO",
  DEPENDENCY_MISSING: "WARN",
  RATE_LIMIT_EXCEEDED: "WARN",
  NETWORK_TIMEOUT: "WARN",
  CIRCUIT_OPEN: "WARN",
  FIELD_NULLISH: "ERROR"
};

function redact(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/api[_-]?key=([^&\s]+)/gi, "api_key=***")
    .replace(/token=([^&\s]+)/gi, "token=***")
    .replace(/authorization:\s*bearer\s+([^\s]+)/gi, "authorization: bearer ***")
    .replace(/[a-f0-9]{32,64}/gi, "***")
    .replace(/(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/gi, "$1_***")
    .replace(/AKIA[0-9A-Z]{16}/gi, "AKIA***")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gi, "eyJ***")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "***@***.***")
    .replace(/\+?\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, "+***");
}

function valuePreview(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = redact(value);
    return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
  }
  if (Array.isArray(value)) return `[Array(${value.length})]`;
  if (typeof value === "object") return `{Object(${Object.keys(value).length} keys)}`;
  return redact(String(value));
}

function nowIso() {
  return new Date().toISOString();
}

function stableHash(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[name] = next;
      i += 1;
    } else {
      args[name] = true;
    }
  }
  args.timeoutMs = Number(args.timeoutMs) || DEFAULTS.timeoutMs;
  args.maxDepth = Number(args.maxDepth) || DEFAULTS.maxDepth;
  args.maxItems = Number(args.maxItems) || DEFAULTS.maxItems;
  args.maxFieldsPerBlock = Number(args.maxFieldsPerBlock) || DEFAULTS.maxFieldsPerBlock;
  args.maxBlocks = Number(args.maxBlocks) || DEFAULTS.maxBlocks;
  args.maxAuditTimeMs = Number(args.maxAuditTimeMs) || DEFAULTS.maxAuditTimeMs;
  args.maxBlocksLive = Number(args["max-blocks-live"] || args.maxBlocksLive) || DEFAULTS.maxBlocksLive;
  return args;
}

function debugLog(enabled, message) {
  if (!enabled) return;
  const line = `[DEBUG] [${nowIso()}] ${message}`;
  process.stderr.write(`${line}\n`);
}

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (error) {
    return null;
  }
}

function detectGitSha(auditTrace) {
  const envSha = process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || null;
  if (envSha) return envSha.trim();
  const sha = safeExec("git rev-parse HEAD");
  if (!sha) {
    auditTrace.push({
      step: "git_detection",
      outcome: "failed",
      details: "Not a git repo or git unavailable",
      evidence: []
    });
  }
  return sha;
}

function makeEvidence(type, source, value, context) {
  return {
    type,
    source: redact(String(source || "")),
    value: redact(String(value || "")),
    timestamp: null,
    context: redact(String(context || ""))
  };
}

function makeReason(reasonCode, reason, evidence, severityOverride) {
  const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
  const baseCode = REASON_CODES.includes(reasonCode) ? reasonCode : "UNKNOWN";
  const code = hasEvidence ? baseCode : "UNKNOWN";
  const severity = severityOverride || SEVERITY_BY_REASON[code] || "WARN";
  const safeEvidence = hasEvidence
    ? evidence
    : [makeEvidence("runtime", "validator", "insufficient_evidence", "what evidence was missing")];
  return {
    reasonCode: code,
    severity,
    reason: redact(String(reason || code)),
    evidence: safeEvidence
  };
}

function isIsoLike(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function enumeratePaths(value, currentPath, depth, limits, state) {
  if (state.count >= limits.maxFieldsPerBlock) return;
  if (depth > limits.maxDepth) return;

  if (Array.isArray(value)) {
    state.paths.push({ path: currentPath, value, type: "array" });
    state.count += 1;
    if (value.length === 0) return;
    const max = Math.min(value.length, limits.maxItems);
    for (let i = 0; i < max; i += 1) {
      enumeratePaths(value[i], `${currentPath}/${i}`, depth + 1, limits, state);
      if (state.count >= limits.maxFieldsPerBlock) break;
    }
    return;
  }

  if (value && typeof value === "object") {
    state.paths.push({ path: currentPath, value, type: "object" });
    state.count += 1;
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      enumeratePaths(value[key], `${currentPath}/${key}`, depth + 1, limits, state);
      if (state.count >= limits.maxFieldsPerBlock) break;
    }
    return;
  }

  state.paths.push({ path: currentPath, value, type: typeof value });
  state.count += 1;
}

function collectPaths(root, limits) {
  const state = { paths: [], count: 0 };
  enumeratePaths(root, "", 0, limits, state);
  if (state.paths.length > limits.maxFieldsPerBlock) {
    state.paths = state.paths.slice(0, limits.maxFieldsPerBlock);
  }
  return state.paths;
}

function validateField(pathName, value) {
  const issues = [];
  if (value === undefined) {
    issues.push(
      makeReason(
        "FIELD_MISSING",
        "Field missing",
        [makeEvidence("schema_rule", "generic:presence", pathName, "path not found")]
      )
    );
    return issues;
  }
  if (value === null) {
    issues.push(
      makeReason(
        "FIELD_NULLISH",
        "Field is null",
        [makeEvidence("schema_rule", "generic:nullish", pathName, "value null")]
      )
    );
    return issues;
  }
  if (Array.isArray(value) && value.length === 0) {
    issues.push(
      makeReason(
        "DATA_EMPTY",
        "Array is empty",
        [makeEvidence("schema_rule", "generic:empty", pathName, "empty array")]
      )
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(
      makeReason(
        "TYPE_MISMATCH",
        "Number is not finite",
        [makeEvidence("schema_rule", "generic:type", pathName, `observed=${valuePreview(value)}`)]
      )
    );
  }
  if (typeof value === "string") {
    const lower = pathName.toLowerCase();
    if (/(time|date|updated|timestamp)/.test(lower)) {
      if (!isIsoLike(value)) {
        issues.push(
          makeReason(
            "FORMAT_INVALID",
            "Invalid ISO timestamp",
            [makeEvidence("schema_rule", "generic:timestamp", pathName, `observed=${valuePreview(value)}`)]
          )
        );
      } else {
        const parsed = Date.parse(value);
        const futureLimit = Date.now() + 5 * 60 * 1000;
        if (parsed > futureLimit) {
          issues.push(
            makeReason(
              "RANGE_INVALID",
              "Timestamp too far in future",
              [makeEvidence("schema_rule", "generic:range", pathName, `observed=${valuePreview(value)}`)]
            )
          );
        } else {
          const ageMs = Date.now() - parsed;
          if (ageMs > 48 * 3600 * 1000) {
            issues.push(
              makeReason(
                "STALE_DATA",
                "Timestamp older than 48h",
                [makeEvidence("schema_rule", "generic:stale", pathName, `ageMs=${ageMs}`)],
                "ERROR"
              )
            );
          } else if (ageMs > 24 * 3600 * 1000) {
            issues.push(
              makeReason(
                "STALE_DATA",
                "Timestamp older than 24h",
                [makeEvidence("schema_rule", "generic:stale", pathName, `ageMs=${ageMs}`)],
                "WARN"
              )
            );
          }
        }
      }
    }
  }
  if (typeof value !== "object" && typeof value !== "string" && typeof value !== "number" && value !== null) {
    issues.push(
      makeReason(
        "TYPE_MISMATCH",
        "Unexpected type",
        [makeEvidence("schema_rule", "generic:type", pathName, `observed=${typeof value}`)]
      )
    );
  }
  return sortReasons(issues);
}

function severityFromReasons(reasons) {
  if (!reasons || !reasons.length) return "INFO";
  const ranks = { CRITICAL: 4, ERROR: 3, WARN: 2, INFO: 1 };
  const max = reasons.reduce((acc, item) => Math.max(acc, ranks[item.severity] || 0), 0);
  return Object.entries(ranks).find(([, rank]) => rank === max)?.[0] || "WARN";
}

function sortReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  const ranks = { CRITICAL: 4, ERROR: 3, WARN: 2, INFO: 1 };
  return [...reasons].sort((a, b) => {
    const rankDiff = (ranks[b.severity] || 0) - (ranks[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    return String(a.reasonCode || "").localeCompare(String(b.reasonCode || ""));
  });
}

function gatherServerKeys(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? Object.keys(first).sort() : [];
  }
  return Object.keys(data).sort();
}

function auditBlockJson({
  blockId,
  filePath,
  optional,
  limits,
  auditTrace,
  json,
  uiMappings,
  schemaRules,
  requiredFields
}) {
  const block = {
    blockId,
    file: filePath,
    schemaVersion: "unknown",
    optional: Boolean(optional),
    status: "OK",
    blockErrors: [],
    fields: []
  };
  if (!json) {
    block.status = "ERROR";
    block.blockErrors.push(
      makeReason(
        "JSON_PARSE_ERROR",
        "Failed to parse JSON",
        [makeEvidence("file_system", filePath, "no_json", "parse error")]
      )
    );
    return block;
  }
  block.schemaVersion = json.schemaVersion || json.schema || "unknown";
  const data = json.data ?? json.payload?.data ?? json.payload ?? json;
  const paths = collectPaths(data, limits);
  const pathSet = new Set(paths.map((entry) => entry.path || "/"));
  const fields = [];
  for (const entry of paths) {
    if (fields.length >= limits.maxFieldsPerBlock) break;
    const issues = validateField(entry.path, entry.value);
    const field = {
      path: entry.path || "/",
      label: entry.path ? entry.path.split("/").pop() : "root",
      present: entry.value !== undefined,
      valid: issues.length === 0,
      severity: severityFromReasons(issues),
      valuePreview: valuePreview(entry.value),
      reasons: issues
    };
    fields.push(field);
  }

  const required = Array.isArray(requiredFields) ? requiredFields : [];
  const fieldIndex = new Map(fields.map((field) => [field.path, field]));
  required.forEach((reqPath) => {
    if (!reqPath) return;
    const value = getByPath(json, reqPath);
    const pathKey = `/${String(reqPath).split(".").join("/")}`;
    const issues = [];
    if (value === undefined) {
      issues.push(
        makeReason(
          "FIELD_MISSING",
          "Required field missing",
          [makeEvidence("schema_rule", "registry:required", reqPath, "required field missing")]
        )
      );
    } else if (value === null) {
      issues.push(
        makeReason(
          "FIELD_NULLISH",
          "Required field is null",
          [makeEvidence("schema_rule", "registry:required", reqPath, "required field null")]
        )
      );
    }
    const existing = fieldIndex.get(pathKey);
    if (existing) {
      const merged = sortReasons([...(existing.reasons || []), ...issues]);
      existing.reasons = merged;
      existing.valid = merged.length === 0;
      existing.present = value !== undefined;
      existing.severity = severityFromReasons(merged);
      existing.valuePreview = valuePreview(value);
    } else {
      fields.push({
        path: pathKey,
        label: String(reqPath).split(".").pop(),
        present: value !== undefined,
        valid: issues.length === 0,
        severity: severityFromReasons(issues),
        valuePreview: valuePreview(value),
        reasons: issues
      });
    }
  });

  if (paths.length >= limits.maxFieldsPerBlock) {
    fields.push({
      path: "/",
      label: "limit",
      present: true,
      valid: false,
      severity: "WARN",
      valuePreview: "[limit]",
      reasons: [
        makeReason(
          "LIMIT_EXCEEDED",
          "Max fields limit reached",
          [makeEvidence("runtime", "validator", "max-fields", "max-fields-per-block exceeded")]
        )
      ]
    });
    auditTrace.push({
      step: "validation",
      outcome: "partial",
      details: `Field limit reached for ${blockId}`,
      evidence: []
    });
  }
  let normalizedFields = fields.sort((a, b) => a.path.localeCompare(b.path));
  if (schemaRules && Array.isArray(schemaRules)) {
    normalizedFields = applySchemaRules(normalizedFields, schemaRules);
  }
  block.fields = normalizedFields;
  if (uiMappings && uiMappings[blockId]) {
    const mappings = uiMappings[blockId];
    const missing = [];
    for (const mapping of mappings) {
      if (missing.length >= 10) break;
      if (!pathExists(pathSet, mapping.path)) {
        missing.push(mapping);
        block.blockErrors.push(
          makeReason(
            "UI_MAPPING_MISMATCH",
            "UI references missing data path",
            [
              makeEvidence(
                "feature_file",
                mapping.file,
                `line:${mapping.line}`,
                `missing path ${mapping.path}`
              )
            ]
          )
        );
      }
    }
    if (missing.length === 10 && mappings.length > 10) {
      block.blockErrors.push(
        makeReason(
          "LIMIT_EXCEEDED",
          "UI mapping mismatch limit reached",
          [makeEvidence("runtime", "ui_mapping", "limit", "ui mapping mismatch count exceeded")]
        )
      );
    }
  }
  if (block.blockErrors.length) {
    block.status = "ERROR";
  }
  return block;
}

function auditBlockLocal({
  filePath,
  blockId,
  optional,
  limits,
  auditTrace,
  uiMappings,
  schemaRules,
  requiredFields
}) {
  let raw = null;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return {
      blockId,
      file: filePath,
      schemaVersion: "unknown",
      optional: Boolean(optional),
      status: "ERROR",
      blockErrors: [
        makeReason(
          "FILE_MISSING",
          "Mirror file missing",
          [makeEvidence("file_system", filePath, error.message, "read failed")]
        )
      ],
      fields: []
    };
  }
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      blockId,
      file: filePath,
      schemaVersion: "unknown",
      optional: Boolean(optional),
      status: "ERROR",
      blockErrors: [
        makeReason(
          "JSON_PARSE_ERROR",
          "Failed to parse JSON",
          [makeEvidence("file_system", filePath, error.message, "parse error")]
        )
      ],
      fields: []
    };
  }
  return auditBlockJson({
    blockId,
    filePath,
    optional,
    limits,
    auditTrace,
    json,
    uiMappings,
    schemaRules,
    requiredFields
  });
}

function pathExists(pathSet, target) {
  if (!target) return false;
  if (pathSet.has(target)) return true;
  for (const entry of pathSet) {
    if (entry.startsWith(`${target}/`)) return true;
  }
  return false;
}

function toPath(prefix, segment) {
  const parts = prefix.split(".").concat(segment.split("."));
  return `/${parts.join("/")}`;
}

function scanFeatureFiles(featuresDir, auditTrace) {
  if (!fs.existsSync(featuresDir)) {
    auditTrace.push({
      step: "ui_mapping_scan",
      outcome: "skipped",
      details: "features directory missing",
      evidence: []
    });
    return {};
  }
  const files = fs.readdirSync(featuresDir).filter((file) => /\.(js|mjs|ts)$/.test(file));
  const mappings = {};
  let dynamicDetected = false;
  files.forEach((file) => {
    const base = file.replace(/\.(js|mjs|ts)$/, "");
    const blockId = base.startsWith("rv-") ? base.slice(3) : base;
    const fullPath = path.join(featuresDir, file);
    let content = "";
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      return;
    }
    const lines = content.split("\n");
    const regexes = [
      { prefix: "data", re: /\bdata\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g },
      { prefix: "payload.data", re: /\bpayload\.data\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)/g }
    ];
    lines.forEach((line, idx) => {
      if (/\bdata\s*\[|\bpayload\s*\[/.test(line)) dynamicDetected = true;
      regexes.forEach(({ prefix, re }) => {
        let match;
        while ((match = re.exec(line))) {
          const pathHint = toPath(prefix, match[1]);
          mappings[blockId] = mappings[blockId] || [];
          if (mappings[blockId].length >= 50) return;
          mappings[blockId].push({
            path: pathHint,
            file: fullPath,
            line: idx + 1
          });
        }
      });
    });
  });
  if (dynamicDetected) {
    auditTrace.push({
      step: "ui_mapping_scan",
      outcome: "partial",
      details: "dynamic_path_detected, skipped dynamic patterns",
      evidence: []
    });
  } else {
    auditTrace.push({
      step: "ui_mapping_scan",
      outcome: "success",
      details: `Scanned ${files.length} feature files`,
      evidence: []
    });
  }
  return mappings;
}

function matchRule(rulePath, actualPath) {
  const ruleParts = rulePath.split("/").filter(Boolean);
  const actualParts = actualPath.split("/").filter(Boolean);
  if (ruleParts.length !== actualParts.length) return false;
  for (let i = 0; i < ruleParts.length; i += 1) {
    if (ruleParts[i] === "*") continue;
    if (ruleParts[i] !== actualParts[i]) return false;
  }
  return true;
}

function applySchemaRules(fields, schemaRules) {
  if (!Array.isArray(schemaRules) || schemaRules.length === 0) return fields;
  return fields.map((field) => {
    const rule = schemaRules.find((entry) => matchRule(entry.path, field.path));
    if (!rule) return field;
    if (rule.required === false) {
      const filtered = (field.reasons || []).map((reason) => {
        if (reason.reasonCode === "FIELD_MISSING" || reason.reasonCode === "FIELD_NULLISH") {
          return { ...reason, severity: "WARN" };
        }
        return reason;
      });
      return {
        ...field,
        reasons: filtered,
        severity: severityFromReasons(filtered)
      };
    }
    return field;
  });
}

async function loadSchemaRegistry(auditTrace) {
  const filePath = path.join(process.cwd(), "features", "schema-registry.js");
  if (!fs.existsSync(filePath)) {
    auditTrace.push({
      step: "schema_registry",
      outcome: "skipped",
      details: "schema registry missing",
      evidence: []
    });
    return { blockSchemas: {}, validators: {} };
  }
  try {
    const mod = await import(pathToFileURL(filePath).href);
    return {
      blockSchemas: mod.BLOCK_SCHEMAS || {},
      validators: mod.VALIDATORS || {}
    };
  } catch (error) {
    auditTrace.push({
      step: "schema_registry",
      outcome: "failed",
      details: "schema registry import failed",
      evidence: [makeEvidence("runtime", filePath, error.message, "schema registry import")]
    });
    return { blockSchemas: {}, validators: {} };
  }
}

function loadFeatureRegistry(auditTrace) {
  const filePath = path.join(process.cwd(), "public", "data", "feature-registry.v1.json");
  if (!fs.existsSync(filePath)) {
    auditTrace.push({
      step: "feature_registry",
      outcome: "skipped",
      details: "feature registry missing",
      evidence: []
    });
    return null;
  }
  try {
    const registry = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!registry || !Array.isArray(registry.features)) {
      auditTrace.push({
        step: "feature_registry",
        outcome: "failed",
        details: "feature registry invalid",
        evidence: [makeEvidence("file_system", filePath, "invalid_registry", "missing features array")]
      });
      return null;
    }
    auditTrace.push({
      step: "feature_registry",
      outcome: "success",
      details: `Loaded ${registry.features.length} features from registry`,
      evidence: []
    });
    return registry;
  } catch (error) {
    auditTrace.push({
      step: "feature_registry",
      outcome: "failed",
      details: "feature registry parse failed",
      evidence: [makeEvidence("file_system", filePath, error.message, "registry parse")]
    });
    return null;
  }
}

function normalizeSnapshotPath(inputPath) {
  if (!inputPath) return "";
  return inputPath
    .replace(/^public\/mirrors\//, "public/data/snapshots/")
    .replace(/^mirrors\//, "data/snapshots/");
}

function resolveMirrorFile(basePath, id, mirrorPath) {
  const resolved = mirrorPath ? normalizeSnapshotPath(mirrorPath) : "";
  if (resolved) {
    if (path.isAbsolute(resolved)) return resolved;
    return path.join(process.cwd(), resolved);
  }
  return path.join(basePath, "data", "snapshots", `${id}.json`);
}

function resolveMirrorUrl(baseUrl, id, mirrorPath) {
  const rel = mirrorPath
    ? normalizeSnapshotPath(mirrorPath).replace(/^public\//, "").replace(/^\/+/, "")
    : `data/snapshots/${id}.json`;
  return `${baseUrl.replace(/\/+$/, "")}/${rel}`;
}

function discoverBlocksFromRegistry(registry, basePath) {
  return registry.features.map((feature) => {
    const id = String(feature.blockId || feature.id || "").toLowerCase();
    const mirrorPath = feature.mirrorPath || `public/data/snapshots/${id}.json`;
    return {
      id,
      file: resolveMirrorFile(basePath, id, mirrorPath),
      mirrorPath,
      optional: Boolean(feature.optional || feature._deprecated),
      critical: Boolean(feature.critical),
      requiredFields: Array.isArray(feature.requiredFields) ? feature.requiredFields : []
    };
  });
}

function discoverLocalBlocks(base, auditTrace) {
  const manifestPath = path.join(base, "data", "snapshots", "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const blocks = Array.isArray(manifest.blocks) ? manifest.blocks : [];
      auditTrace.push({
        step: "discovery",
        outcome: "success",
        details: `Found ${blocks.length} blocks via manifest`,
        evidence: []
      });
      return blocks.map((entry) => ({
        id: entry.id || entry.file?.replace(/^data\/snapshots\//, "").replace(/\.json$/, "") || "unknown",
        file: path.join(base, entry.file || ""),
        optional: Boolean(entry.optional)
      }));
    } catch (error) {
      auditTrace.push({
        step: "discovery",
        outcome: "failed",
        details: "Manifest parse failed, fallback to scan",
        evidence: [makeEvidence("file_system", manifestPath, error.message, "manifest parse")]
      });
    }
  }
  const dir = path.join(base, "data", "snapshots");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json")
    : [];
  const blocks = files.map((file) => ({
    id: file.replace(/\.json$/, ""),
    file: path.join(dir, file),
    optional: false
  }));
  auditTrace.push({
    step: "discovery",
    outcome: "success",
    details: `Found ${blocks.length} blocks via scan`,
    evidence: []
  });
  return blocks;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function auditLive({ base, args, auditTrace, uiMappings, schemaRegistry, featureRegistry }) {
  let blocks = [];
  if (featureRegistry && Array.isArray(featureRegistry.features)) {
    blocks = featureRegistry.features.map((feature) => {
      const id = String(feature.blockId || feature.id || "").toLowerCase();
      const mirrorPath = feature.mirrorPath
        ? normalizeSnapshotPath(feature.mirrorPath).replace(/^public\//, "")
        : `data/snapshots/${id}.json`;
      return {
        id,
        file: mirrorPath.startsWith("/") ? mirrorPath.slice(1) : mirrorPath,
        optional: Boolean(feature.optional || feature._deprecated),
        requiredFields: Array.isArray(feature.requiredFields) ? feature.requiredFields : []
      };
    });
    auditTrace.push({
      step: "discovery",
      outcome: "success",
      details: `Found ${blocks.length} blocks via registry`,
      evidence: []
    });
  } else {
    const registryUrl = `${base.replace(/\/+$/, "")}/data/feature-registry.v1.json`;
    let registryJson;
    try {
      const { response, text } = await fetchWithTimeout(registryUrl, args.timeoutMs);
      if (!response.ok) {
        auditTrace.push({
          step: "discovery",
          outcome: "failed",
          details: "Registry fetch failed",
          evidence: [makeEvidence("http_response", registryUrl, response.status, "registry fetch")]
        });
        return {
          meta: { error: "BASE_URL_MISCONFIG" },
          blocks: [],
          fatalReason: makeReason(
            "BASE_URL_MISCONFIG",
            "Registry missing or fetch failed",
            [makeEvidence("http_response", registryUrl, response.status, "registry fetch")]
          )
        };
      }
      registryJson = JSON.parse(text);
    } catch (error) {
      auditTrace.push({
        step: "discovery",
        outcome: "failed",
        details: "Registry fetch/parse failed",
        evidence: [makeEvidence("http_response", registryUrl, error.message, "registry fetch")]
      });
      return {
        meta: { error: "BASE_URL_MISCONFIG" },
        blocks: [],
        fatalReason: makeReason(
          "BASE_URL_MISCONFIG",
          "Registry fetch/parse failed",
          [makeEvidence("http_response", registryUrl, error.message, "registry fetch")]
        )
      };
    }
    const features = Array.isArray(registryJson?.features) ? registryJson.features : [];
    if (!features.length) {
      auditTrace.push({
        step: "discovery",
        outcome: "failed",
        details: "Registry empty or invalid",
        evidence: [makeEvidence("http_response", registryUrl, "empty", "registry parse")]
      });
      return {
        meta: { error: "BASE_URL_MISCONFIG" },
        blocks: [],
        fatalReason: makeReason(
          "BASE_URL_MISCONFIG",
          "Registry empty",
          [makeEvidence("http_response", registryUrl, "empty", "registry parse")]
        )
      };
    }
    blocks = features.map((entry) => {
      const id = String(entry.blockId || entry.id || "unknown").toLowerCase();
      return {
        id,
        file: `data/snapshots/${id}.json`,
        optional: Boolean(entry.optional || entry._deprecated),
        requiredFields: Array.isArray(entry.requiredFields) ? entry.requiredFields : []
      };
    });
  }

  const maxBlocks = Math.min(blocks.length, args.maxBlocksLive);
  const limitedBlocks = blocks.slice(0, maxBlocks);
  let totalFailures = 0;
  const results = [];
  const auditStart = Date.now();

  const queue = [...limitedBlocks];
  const concurrency = 3;
  const inFlight = new Set();

  async function processBlock(entry) {
    if (Date.now() - auditStart > args.maxAuditTimeMs) {
      return {
        blockId: entry.id,
        file: entry.file,
        status: "NOT_AUDITED",
        blockErrors: [
          makeReason(
            "LIMIT_EXCEEDED",
            "Audit timeout reached",
            [makeEvidence("runtime", "timer", "timeout", "max-audit-time-ms exceeded")]
          )
        ],
        fields: []
      };
    }
    if (totalFailures >= 5) {
      return {
        blockId: entry.id,
        file: entry.file,
        status: "NOT_AUDITED",
        blockErrors: [
          makeReason(
            "CIRCUIT_OPEN",
            "Circuit breaker open",
            [makeEvidence("runtime", "circuit", "open", "global failure count exceeded")]
          )
        ],
        fields: []
      };
    }
    const url = `${base.replace(/\/+$/, "")}/${entry.file}`;
    let response;
    let text = "";
    let retry = 0;
    let lastError = null;
    while (retry < 2) {
      try {
        const fetched = await fetchWithTimeout(url, args.timeoutMs);
        response = fetched.response;
        text = fetched.text;
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after") || "1");
          await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 10) * 1000));
          retry += 1;
          continue;
        }
        if (response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          retry += 1;
          continue;
        }
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retry += 1;
      }
    }
    if (!response || response.status >= 500 || lastError) {
      totalFailures += 1;
      return {
        blockId: entry.id,
        file: entry.file,
        status: "ERROR",
        blockErrors: [
          makeReason(
            lastError ? "NETWORK_TIMEOUT" : "UPSTREAM_ERROR",
            "Live fetch failed",
            [makeEvidence("http_response", url, lastError?.message || response?.status || "unknown", "live fetch")]
          )
        ],
        fields: []
      };
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      totalFailures += 1;
      return {
        blockId: entry.id,
        file: entry.file,
        status: "ERROR",
        blockErrors: [
          makeReason(
            "JSON_PARSE_ERROR",
            "Live JSON parse failed",
            [makeEvidence("http_response", url, error.message, "parse error")]
          )
        ],
        fields: []
      };
    }
    const schemaRules =
      schemaRegistry?.blockSchemas?.[entry.id] ||
      schemaRegistry?.blockSchemas?.[String(entry.id).toLowerCase()] ||
      schemaRegistry?.blockSchemas?.["*"] ||
      null;
    return auditBlockJson({
      blockId: entry.id,
      filePath: url,
      optional: Boolean(entry.optional),
      limits: {
        maxDepth: args.maxDepth,
        maxItems: args.maxItems,
        maxFieldsPerBlock: args.maxFieldsPerBlock
      },
      auditTrace,
      json,
      uiMappings,
      schemaRules,
      requiredFields: entry.requiredFields
    });
  }

  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift();
      const result = await processBlock(entry);
      results.push(result);
      if (totalFailures >= 5 || Date.now() - auditStart > args.maxAuditTimeMs) {
        while (queue.length > 0) {
          const remaining = queue.shift();
          results.push({
            blockId: remaining.id,
            file: remaining.file,
            status: "NOT_AUDITED",
            blockErrors: [
              makeReason(
                Date.now() - auditStart > args.maxAuditTimeMs ? "LIMIT_EXCEEDED" : "CIRCUIT_OPEN",
                Date.now() - auditStart > args.maxAuditTimeMs
                  ? "Audit timeout reached"
                  : "Circuit breaker open",
                [
                  makeEvidence(
                    "runtime",
                    Date.now() - auditStart > args.maxAuditTimeMs ? "timer" : "circuit",
                    Date.now() - auditStart > args.maxAuditTimeMs ? "timeout" : "open",
                    Date.now() - auditStart > args.maxAuditTimeMs
                      ? "max-audit-time-ms exceeded"
                      : "global failure count exceeded"
                  )
                ]
              )
            ],
            fields: []
          });
        }
        break;
      }
    }
  }

  for (let i = 0; i < concurrency; i += 1) {
    const task = worker();
    inFlight.add(task);
    task.finally(() => inFlight.delete(task));
  }
  await Promise.all(inFlight);

  return { blocks: results, fatalReason: null };
}

function summarize(blocks) {
  const summary = {
    blockCount: blocks.length,
    fieldCount: 0,
    issueCount: 0,
    bySeverity: { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 },
    byReasonCode: {}
  };
  blocks.forEach((block) => {
    const fields = block.fields || [];
    summary.fieldCount += fields.length;
    fields.forEach((field) => {
      const reasons = field.reasons || [];
      if (reasons.length) summary.issueCount += reasons.length;
      reasons.forEach((reason) => {
        summary.bySeverity[reason.severity] = (summary.bySeverity[reason.severity] || 0) + 1;
        summary.byReasonCode[reason.reasonCode] = (summary.byReasonCode[reason.reasonCode] || 0) + 1;
      });
    });
    (block.blockErrors || []).forEach((reason) => {
      summary.issueCount += 1;
      summary.bySeverity[reason.severity] = (summary.bySeverity[reason.severity] || 0) + 1;
      summary.byReasonCode[reason.reasonCode] = (summary.byReasonCode[reason.reasonCode] || 0) + 1;
    });
  });
  summary.byReasonCode = Object.fromEntries(Object.entries(summary.byReasonCode).sort(([a], [b]) => a.localeCompare(b)));
  return summary;
}

function outputJson(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function outputNdjson(report) {
  process.stdout.write(`${JSON.stringify({ type: "meta", data: report.meta })}\n`);
  report.auditTrace.forEach((entry) => process.stdout.write(`${JSON.stringify({ type: "trace", data: entry })}\n`));
  report.blocks.forEach((block) => process.stdout.write(`${JSON.stringify({ type: "block", data: block })}\n`));
  process.stdout.write(`${JSON.stringify({ type: "summary", data: report.summary })}\n`);
}

function outputTable(report) {
  const lines = [];
  lines.push(`Blocks: ${report.summary.blockCount} | Issues: ${report.summary.issueCount}`);
  lines.push(`BySeverity: ${JSON.stringify(report.summary.bySeverity)}`);
  lines.push(`ByReasonCode: ${JSON.stringify(report.summary.byReasonCode)}`);
  report.blocks.forEach((block) => {
    const issues = (block.fields || []).filter((field) => (field.reasons || []).length);
    if (!issues.length) return;
    lines.push(`\n[${block.blockId}] ${block.file}`);
    issues.forEach((field) => {
      const reason = field.reasons[0];
      lines.push(`  - ${field.path}: ${reason.reasonCode} (${reason.severity})`);
    });
  });
  process.stdout.write(`${lines.join("\n")}\n`);
}

function outputGithub(report) {
  report.blocks.forEach((block) => {
    const issues = (block.fields || []).filter((field) => (field.reasons || []).length);
    issues.forEach((field) => {
      const reason = field.reasons[0];
      if (reason.severity === "WARN") {
        process.stdout.write(
          `::warning file=${block.file},title=${block.blockId}.${field.path}::${reason.reason}\n`
        );
      } else if (reason.severity === "ERROR" || reason.severity === "CRITICAL") {
        process.stdout.write(
          `::error file=${block.file},title=${block.blockId}.${field.path}::${reason.reason}\n`
        );
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "live" && args.url) {
    args.base = args.url;
  }
  LAST_ARGS = args;
  const start = Date.now();
  const auditTrace = [];
  const gitSha = detectGitSha(auditTrace) || null;
  const runId = stableHash(`${args.mode}|${args.base}|${gitSha || "nogit"}|${TOOL_VERSION}`);
  const meta = {
    timestamp: nowIso(),
    runId,
    mode: args.mode,
    source: null,
    base: args.mode === "local" ? args.base : null,
    url: args.mode === "live" ? args.base : null,
    gitSha,
    durationMs: 0,
    toolVersion: TOOL_VERSION
  };

  const schemaRegistry = await loadSchemaRegistry(auditTrace);
  const featureRegistry = loadFeatureRegistry(auditTrace);
  const uiMappings = scanFeatureFiles(path.join(process.cwd(), "features"), auditTrace);

  let blocks = [];
  const source = featureRegistry ? "registry" : "discovery";
  meta.source = source;

  if (args.mode === "local") {
    const basePath = path.isAbsolute(args.base) ? args.base : path.join(process.cwd(), args.base);
    const discovered = featureRegistry
      ? discoverBlocksFromRegistry(featureRegistry, basePath)
      : discoverLocalBlocks(basePath, auditTrace);
    const ordered = discovered.sort((a, b) => a.id.localeCompare(b.id));
    if (ordered.length > args.maxBlocks) {
      auditTrace.push({
        step: "discovery",
        outcome: "partial",
        details: `Block limit exceeded (${ordered.length} > ${args.maxBlocks})`,
        evidence: []
      });
    }
    const limited = ordered.slice(0, args.maxBlocks);
    const limits = {
      maxDepth: args.maxDepth,
      maxItems: args.maxItems,
      maxFieldsPerBlock: args.maxFieldsPerBlock
    };
    const auditStart = Date.now();
    for (let i = 0; i < limited.length; i += 1) {
      const entry = limited[i];
      if (Date.now() - auditStart > args.maxAuditTimeMs) {
        auditTrace.push({
          step: "timeout",
          outcome: "partial",
          details: "Timeout reached, blocks remaining",
          evidence: []
        });
        const remaining = limited.slice(i);
        remaining.forEach((entry) => {
          blocks.push({
            blockId: entry.id,
            file: entry.file,
            schemaVersion: "unknown",
            optional: Boolean(entry.optional),
            status: "NOT_AUDITED",
            blockErrors: [
              makeReason(
                "LIMIT_EXCEEDED",
                "Audit timeout reached",
                [makeEvidence("runtime", "timer", "timeout", "max-audit-time-ms exceeded")]
              )
            ],
            fields: []
          });
        });
        break;
      }
      const schemaRules =
        schemaRegistry.blockSchemas?.[entry.id] ||
        schemaRegistry.blockSchemas?.[String(entry.id).toLowerCase()] ||
        schemaRegistry.blockSchemas?.["*"] ||
        null;
      blocks.push(
        auditBlockLocal({
          filePath: entry.file,
          blockId: entry.id,
          optional: entry.optional,
          limits,
          auditTrace,
          uiMappings,
          schemaRules,
          requiredFields: entry.requiredFields
        })
      );
    }
  } else if (args.mode === "live") {
    const live = await auditLive({
      base: args.base,
      args,
      auditTrace,
      uiMappings,
      schemaRegistry,
      featureRegistry
    });
    if (live.fatalReason) {
      const report = {
        meta: { ...meta, durationMs: Date.now() - start },
        summary: {
          blockCount: 0,
          fieldCount: 0,
          issueCount: 1,
          bySeverity: { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 1 },
          byReasonCode: { [live.fatalReason.reasonCode]: 1 }
        },
        auditTrace,
        blocks: []
      };
      outputJson(report);
      if (args.failOn === "none") process.exit(0);
      process.exit(2);
    }
    blocks = live.blocks || [];
  } else {
    process.stderr.write("Unsupported mode\n");
    process.exit(1);
  }

  blocks = blocks.sort((a, b) => a.blockId.localeCompare(b.blockId));

  const summary = summarize(blocks);
  const report = {
    meta: { ...meta, durationMs: Date.now() - start, source },
    summary,
    auditTrace,
    blocks
  };

  if (args.format === "ndjson") outputNdjson(report);
  else if (args.format === "table") outputTable(report);
  else if (args.format === "github") outputGithub(report);
  else outputJson(report);

  const hasCritical = summary.bySeverity.CRITICAL > 0;
  const hasError = summary.bySeverity.ERROR > 0;
  if (args.failOn === "critical") {
    process.exit(hasCritical ? 2 : 0);
  }
  if (args.failOn === "bad") {
    process.exit(hasCritical ? 2 : hasError ? 1 : 0);
  }
  process.exit(0);
}

main().catch((error) => {
  const report = {
    meta: {
      timestamp: nowIso(),
      runId: stableHash(`crash|${TOOL_VERSION}`),
      mode: "unknown",
      base: "unknown",
      gitSha: null,
      durationMs: 0,
      toolVersion: TOOL_VERSION
    },
    summary: {
      blockCount: 0,
      fieldCount: 0,
      issueCount: 1,
      bySeverity: { INFO: 0, WARN: 1, ERROR: 0, CRITICAL: 0 },
      byReasonCode: { UNKNOWN: 1 }
    },
    auditTrace: [
      {
        step: "runtime",
        outcome: "failed",
        details: "Unhandled exception",
        evidence: [makeEvidence("runtime", "audit-site", error.message, "crash")]
      }
    ],
    blocks: []
  };
  outputJson(report);
  process.exit(LAST_ARGS.failOn === "none" ? 0 : 1);
});
