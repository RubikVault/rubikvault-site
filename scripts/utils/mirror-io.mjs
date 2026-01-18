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
    const parsed = JSON.parse(raw);
    if (isMirrorEnvelope(parsed)) {
      return parsed.raw;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

export function loadMirrorEnvelope(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw);
    if (isMirrorEnvelope(parsed)) {
      return { meta: parsed.meta, raw: parsed.raw, envelope: parsed };
    }
    return { meta: null, raw: parsed, envelope: null };
  } catch (err) {
    return null;
  }
}

export function validateBasicMirrorShape(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { ok: false, errors: ["mirror_not_object"] };
  }
  const allowedSchemaVersions = new Set(["1.0", "rv-mirror-v1"]);
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
  if (data.schemaVersion && !allowedSchemaVersions.has(data.schemaVersion)) {
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
  const allowedModes = ["LIVE", "EOD", "EMPTY", "MIRROR"];
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

export function normalizeMirrorMeta(payload) {
  if (!payload || typeof payload !== "object") return { payload, changed: false };
  const now = new Date().toISOString();
  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload?.data?.items)
      ? payload.data.items
      : [];
  const updatedAt = payload?.meta?.updatedAt || payload?.updatedAt || now;
  const existingStatus = payload?.meta?.status || null;
  let status = existingStatus;
  if (!status) {
    if (items.length > 0) {
      status = "OK";
    } else if (payload?.dataQuality === "STUB") {
      status = "STUB";
    } else if (payload?.dataQuality === "ERROR") {
      status = "ERROR";
    } else {
      status = "PARTIAL";
    }
  }
  if (status === "OK" && items.length === 0) {
    status = "PARTIAL";
  }
  const reason = payload?.meta?.reason || (status === "OK" ? null : payload?.dataQuality || "EMPTY_ITEMS");
  const nextMeta = {
    ...(payload.meta && typeof payload.meta === "object" ? payload.meta : {}),
    status,
    updatedAt,
    reason
  };
  const changed =
    !payload.meta ||
    payload.meta.updatedAt !== nextMeta.updatedAt ||
    payload.meta.status !== nextMeta.status ||
    payload.meta.reason !== nextMeta.reason;
  return { payload: { ...payload, meta: nextMeta }, changed };
}

export function isMirrorEnvelope(payload) {
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

function normalizeEnvelopeMeta(rawPayload, meta, finalPath) {
  const now = new Date().toISOString();
  const metaInput = meta && typeof meta === "object" ? meta : {};
  const raw = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const dataset =
    metaInput.dataset ||
    raw.dataset ||
    raw.mirrorId ||
    raw.feature ||
    raw?.meta?.feature ||
    (finalPath ? path.basename(finalPath, ".json") : "unknown");
  const provider =
    metaInput.provider ||
    raw.provider ||
    raw.sourceUpstream ||
    raw.source ||
    raw?.meta?.source ||
    dataset ||
    "unknown";
  const fetchedAt =
    metaInput.fetchedAt ||
    raw.fetchedAt ||
    raw.updatedAt ||
    raw?.meta?.updatedAt ||
    now;
  const ttlSeconds = Number.isFinite(metaInput.ttlSeconds)
    ? metaInput.ttlSeconds
    : Number.isFinite(raw.ttlSeconds)
      ? raw.ttlSeconds
      : Number.isFinite(raw?.meta?.ttlSeconds)
        ? raw.meta.ttlSeconds
        : 3600;
  const source = metaInput.source || raw?.meta?.source || raw.source || "mirror";
  const runId = metaInput.runId || raw.runId || raw?.meta?.runId || now;
  const cost = metaInput.cost ?? raw?.meta?.cost ?? null;
  return { provider, dataset, fetchedAt, ttlSeconds, source, runId, cost };
}

export function saveMirror(finalPath, data) {
  const now = new Date().toISOString();
  const envelopeInput = isMirrorEnvelope(data) ? data : { meta: {}, raw: data };
  const rawPayload = envelopeInput.raw && typeof envelopeInput.raw === "object" ? { ...envelopeInput.raw } : envelopeInput.raw;
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    if (!rawPayload.runId) rawPayload.runId = now;
    if (!rawPayload.updatedAt) rawPayload.updatedAt = now;
    if (!rawPayload.asOf) rawPayload.asOf = rawPayload.updatedAt;
  }
  const normalized = normalizeMirrorMeta(rawPayload);
  const meta = normalizeEnvelopeMeta(normalized.payload, envelopeInput.meta, finalPath);
  const envelope = { meta, raw: normalized.payload };
  atomicWriteJson(finalPath, envelope);
  return envelope;
}

export function redactNotes(notes = []) {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => {
    if (typeof note !== "string") return note;
    return note.replace(/(api_key|token|secret|authorization|bearer)/gi, "[redacted]");
  });
}
