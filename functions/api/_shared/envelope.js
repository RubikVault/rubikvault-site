const CORE_STATUS = new Set(["fresh", "stale", "closed", "pending", "error"]);
const LEGACY_STATUS = new Set([
  "ok",
  "live",
  "partial",
  "empty",
  "no_data",
  "stub",
  "unknown",
  "fail",
  "failed"
]);

const ALLOWED_STATUS = new Set([...CORE_STATUS, ...LEGACY_STATUS]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nowIso() {
  return new Date().toISOString();
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function toIsoDate(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return "";
}

function extractDataDate(meta, metadata, data) {
  const candidates = [
    meta?.data_date,
    meta?.dataDate,
    meta?.asOf,
    meta?.as_of,
    meta?.updatedAt,
    meta?.updated_at,
    meta?.generatedAt,
    metadata?.as_of,
    metadata?.asOf,
    metadata?.published_at,
    metadata?.publishedAt,
    metadata?.fetched_at,
    metadata?.fetchedAt,
    metadata?.data_date,
    data?.as_of,
    data?.date
  ];
  for (const value of candidates) {
    const iso = toIsoDate(value);
    if (iso) return iso;
  }
  return "";
}

function normalizeError(error, ok, statusCode) {
  if (error == null) {
    if (ok) return null;
    const code = statusCode ? `HTTP_${statusCode}` : "ERROR";
    const message = statusCode ? `HTTP ${statusCode}` : "Unknown error";
    return { code, message };
  }
  if (typeof error === "string") {
    return { code: "ERROR", message: error };
  }
  if (isObject(error)) {
    const code = typeof error.code === "string" ? error.code : "ERROR";
    const message = typeof error.message === "string" ? error.message : "Unknown error";
    const details = "details" in error ? error.details : undefined;
    return details !== undefined ? { code, message, details } : { code, message };
  }
  return { code: "ERROR", message: "Unknown error" };
}

function isAllowedStatus(value) {
  if (typeof value !== "string") return false;
  return ALLOWED_STATUS.has(value.toLowerCase());
}

function deriveStatus({ ok, meta, metadata }) {
  const raw = pickString(meta?.status, metadata?.status) || "";
  const rawLower = raw.toLowerCase();
  if (rawLower.includes("closed")) return "closed";
  if (rawLower.includes("pending")) return "pending";
  if (rawLower.includes("stale") || rawLower.includes("partial") || rawLower.includes("empty") || rawLower.includes("no_data") || rawLower.includes("stub")) {
    return "stale";
  }
  if (!ok) return "error";
  return "fresh";
}

export function ensureEnvelopePayload(payload, { statusCode } = {}) {
  const obj = isObject(payload) ? payload : { data: payload ?? null };
  const hasError = obj.error !== undefined && obj.error !== null;
  let ok = typeof obj.ok === "boolean" ? obj.ok : !hasError;
  if (hasError) ok = false;
  if (typeof statusCode === "number" && statusCode >= 400) ok = false;

  obj.ok = ok;
  obj.error = normalizeError(obj.error, ok, statusCode);
  if (!ok && obj.error == null) {
    obj.error = normalizeError(null, ok, statusCode);
  }
  if (!("data" in obj)) obj.data = null;

  const existingMeta = isObject(obj.meta) ? { ...obj.meta } : {};
  const metadata = isObject(obj.metadata) ? obj.metadata : null;

  const statusCandidate = pickString(existingMeta.status, metadata?.status);
  const status = isAllowedStatus(statusCandidate)
    ? statusCandidate
    : deriveStatus({ ok, meta: existingMeta, metadata });
  existingMeta.status = status;

  const provider = pickString(
    existingMeta.provider,
    metadata?.source,
    metadata?.provider,
    existingMeta.source,
    metadata?.module
  ) || "unknown";
  existingMeta.provider = provider;

  const dataDate = extractDataDate(existingMeta, metadata, obj.data);
  existingMeta.data_date = dataDate;
  existingMeta.generated_at = nowIso();

  if (!Array.isArray(existingMeta.quality_flags)) {
    const flags = [];
    if (metadata?.validation && metadata.validation.passed === false) {
      flags.push("VALIDATION_FAILED");
    }
    if (flags.length) existingMeta.quality_flags = flags;
  }

  if (existingMeta.version == null) {
    const version = pickString(
      metadata?.schema_version,
      metadata?.schemaVersion,
      existingMeta.schema_version,
      existingMeta.schemaVersion
    );
    if (version) existingMeta.version = version;
  }

  obj.meta = existingMeta;
  return obj;
}

export function assertEnvelope(value) {
  if (!isObject(value)) throw new Error("Envelope must be an object");
  if (typeof value.ok !== "boolean") throw new Error("Envelope.ok must be boolean");
  if (!isObject(value.meta)) throw new Error("Envelope.meta must be object");

  const meta = value.meta;
  if (!isAllowedStatus(meta.status)) {
    throw new Error(`Envelope.meta.status invalid: ${meta.status}`);
  }
  if (typeof meta.generated_at !== "string" || Number.isNaN(Date.parse(meta.generated_at))) {
    throw new Error("Envelope.meta.generated_at must be ISO string");
  }
  if (typeof meta.data_date !== "string") {
    throw new Error("Envelope.meta.data_date must be string");
  }
  if (meta.data_date && !ISO_DATE_RE.test(meta.data_date)) {
    throw new Error("Envelope.meta.data_date must be YYYY-MM-DD or empty");
  }
  if (typeof meta.provider !== "string" || !meta.provider.trim()) {
    throw new Error("Envelope.meta.provider must be non-empty string");
  }

  if (!("data" in value)) throw new Error("Envelope.data missing");
  if (!("error" in value)) throw new Error("Envelope.error missing");

  if (value.error !== null && !isObject(value.error)) {
    throw new Error("Envelope.error must be object or null");
  }
  if (isObject(value.error)) {
    if (typeof value.error.code !== "string") throw new Error("Envelope.error.code missing");
    if (typeof value.error.message !== "string") throw new Error("Envelope.error.message missing");
  }
}

export function okEnvelope(data, metaPartial) {
  const provider = pickString(metaPartial?.provider);
  if (!provider) throw new Error("meta.provider is required");
  const envelope = {
    ok: true,
    data: data ?? null,
    error: null,
    meta: {
      status: metaPartial?.status || "fresh",
      generated_at: nowIso(),
      data_date: metaPartial?.data_date || "",
      provider,
      quality_flags: metaPartial?.quality_flags,
      warnings: metaPartial?.warnings,
      timings_ms: metaPartial?.timings_ms,
      version: metaPartial?.version
    }
  };
  assertEnvelope(envelope);
  return envelope;
}

export function errorEnvelope(code, message, metaPartial, details) {
  const provider = pickString(metaPartial?.provider);
  if (!provider) throw new Error("meta.provider is required");
  const envelope = {
    ok: false,
    data: null,
    error: {
      code: String(code || "ERROR"),
      message: String(message || "Unknown error"),
      ...(details !== undefined ? { details } : {})
    },
    meta: {
      status: metaPartial?.status || "error",
      generated_at: nowIso(),
      data_date: metaPartial?.data_date || "",
      provider,
      quality_flags: metaPartial?.quality_flags,
      warnings: metaPartial?.warnings,
      timings_ms: metaPartial?.timings_ms,
      version: metaPartial?.version
    }
  };
  assertEnvelope(envelope);
  return envelope;
}

export function jsonEnvelopeResponse({
  ok,
  data,
  error,
  meta,
  status = 200,
  headers = {}
} = {}) {
  const envelope = ok
    ? okEnvelope(data, meta || {})
    : errorEnvelope(error?.code, error?.message, meta || {}, error?.details);
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(envelope), { status, headers: responseHeaders });
}

export async function ensureEnvelopeResponse(response) {
  if (!response) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return response;

  let text = "";
  try {
    text = await response.clone().text();
  } catch {
    return response;
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return response;
  }

  const nextPayload = ensureEnvelopePayload(payload, { statusCode: response.status });
  try {
    assertEnvelope(nextPayload);
  } catch (error) {
    const fallback = errorEnvelope(
      "ENVELOPE_INVALID",
      "Envelope validation failed",
      { provider: "unknown", data_date: "" },
      { message: String(error?.message || error || "validation_error") }
    );
    const fallbackHeaders = new Headers(response.headers);
    fallbackHeaders.set("Content-Type", "application/json; charset=utf-8");
    fallbackHeaders.delete("Content-Length");
    fallbackHeaders.delete("Content-Encoding");
    return new Response(JSON.stringify(fallback), { status: 500, headers: fallbackHeaders });
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  return new Response(JSON.stringify(nextPayload), {
    status: response.status,
    headers
  });
}

export const META_STATUS_VALUES = Array.from(ALLOWED_STATUS);
