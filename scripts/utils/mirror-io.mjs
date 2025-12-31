import fs from "node:fs";
import path from "node:path";

export function isFiniteNumber(value) {
  return Number.isFinite(value);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries(fn, { retries = 2, baseDelayMs = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const wait = baseDelayMs * Math.pow(2, attempt);
        await sleep(wait);
      }
    }
  }
  throw lastError;
}

export function loadMirror(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function validateBasicMirrorShape(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["mirror_not_object"] };
  }
  const requiredFields = [
    "schemaVersion",
    "mirrorId",
    "runId",
    "updatedAt",
    "asOf",
    "mode",
    "cadence",
    "trust",
    "source",
    "sourceUpstream",
    "dataQuality",
    "delayMinutes",
    "missingSymbols",
    "errors",
    "notes",
    "whyUnique",
    "context",
    "items"
  ];
  for (const field of requiredFields) {
    if (!(field in data)) {
      errors.push(`missing_${field}`);
    }
  }
  if (data.schemaVersion !== "1.0") {
    errors.push("schemaVersion_invalid");
  }
  if (!Array.isArray(data.items)) {
    errors.push("items_not_array");
  }
  if (!Array.isArray(data.missingSymbols)) {
    errors.push("missingSymbols_not_array");
  }
  if (!Array.isArray(data.errors)) {
    errors.push("errors_not_array");
  }
  if (!Array.isArray(data.notes)) {
    errors.push("notes_not_array");
  }
  const allowedModes = ["LIVE", "EOD", "EMPTY"];
  if (data.mode && !allowedModes.includes(data.mode)) {
    errors.push("mode_invalid");
  }
  const allowedCadence = ["LIVE", "EOD", "hourly", "daily", "best_effort", "15m_delayed"];
  if (data.cadence && !allowedCadence.includes(data.cadence)) {
    errors.push("cadence_invalid");
  }
  const allowedTrust = ["raw", "derived", "heuristic"];
  if (data.trust && !allowedTrust.includes(data.trust)) {
    errors.push("trust_invalid");
  }
  const allowedDQ = ["OK", "PARTIAL", "EMPTY", "STALE", "COVERAGE_LIMIT"];
  if (data.dataQuality && !allowedDQ.includes(data.dataQuality)) {
    errors.push("dataQuality_invalid");
  }
  return { ok: errors.length === 0, errors };
}

export function atomicWriteJson(finalPath, data) {
  const dir = path.dirname(finalPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, finalPath);
}

export function saveMirror(finalPath, data) {
  const now = new Date().toISOString();
  const payload = { ...data };
  if (!payload.runId) payload.runId = now;
  if (!payload.updatedAt) payload.updatedAt = now;
  if (!payload.asOf) payload.asOf = payload.updatedAt;
  atomicWriteJson(finalPath, payload);
  return payload;
}

export function redactNotes(notes = []) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => {
    if (typeof note !== "string") return note;
    return note.replace(/(api_key|token|secret|authorization|bearer)/gi, "[redacted]");
  });
}
