function isEmptyData(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function normalizeDataQuality(input, { ok, isStale, error, data, partial } = {}) {
  if (input && typeof input === "object" && input.status) {
    return {
      status: input.status,
      reason: input.reason || input.status,
      missingFields: input.missingFields || []
    };
  }
  if (typeof input === "string") {
    if (input === "LIVE") return { status: "LIVE", reason: "LIVE", missingFields: [] };
    if (input === "STALE") return { status: "PARTIAL", reason: "STALE", missingFields: [] };
    if (input === "PARTIAL") return { status: "PARTIAL", reason: "PARTIAL", missingFields: [] };
    if (input === "NO_DATA") return { status: "PARTIAL", reason: "NO_DATA", missingFields: [] };
    return { status: ok ? "PARTIAL" : "FAIL", reason: input, missingFields: [] };
  }
  if (!ok) {
    return { status: "FAIL", reason: error?.code || "FAIL", missingFields: [] };
  }
  if (isEmptyData(data)) {
    return { status: "PARTIAL", reason: "NO_DATA", missingFields: [] };
  }
  if (isStale) return { status: "PARTIAL", reason: "STALE", missingFields: [] };
  if (partial) return { status: "PARTIAL", reason: "PARTIAL", missingFields: [] };
  return { status: "LIVE", reason: "LIVE", missingFields: [] };
}

export function normalizeResponse(raw, defaults = {}) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const now = new Date().toISOString();
  const ok = typeof payload.ok === "boolean" ? payload.ok : false;
  const feature = payload.feature || defaults.feature || "unknown";
  const ts = payload.ts || defaults.ts || now;
  const traceId = payload.traceId || defaults.traceId || "unknown";
  const schemaVersion =
    typeof payload.schemaVersion === "number" ? payload.schemaVersion : 1;
  const cache = {
    hit: Boolean(payload.cache?.hit),
    ttl: Number(payload.cache?.ttl ?? 0),
    layer: payload.cache?.layer || "none"
  };
  const upstream = {
    url: payload.upstream?.url || "",
    status: payload.upstream?.status ?? null,
    snippet: payload.upstream?.snippet || ""
  };
  const rateLimit =
    payload.rateLimit || { remaining: "unknown", reset: null, estimated: true };
  const data = payload.data ?? defaults.data ?? {};
  const nestedData = payload.data?.data;
  const error = payload.error;
  const dataQualityInput = payload.dataQuality || payload.data?.dataQuality;
  const dataQuality = normalizeDataQuality(dataQualityInput, {
    ok,
    isStale: payload.isStale,
    error,
    data: nestedData ?? data,
    partial: payload.partial
  });

  return {
    ok,
    feature,
    ts,
    traceId,
    schemaVersion,
    cache,
    upstream,
    rateLimit,
    dataQuality,
    data,
    error,
    isStale: Boolean(payload.isStale)
  };
}

export function unwrapFeatureData(envelope) {
  const meta = envelope?.data || {};
  const data = meta?.data && typeof meta.data === "object" ? meta.data : meta;
  return { meta, data };
}

export function formatMetaLines({ meta, envelope, where = "Pages Function" }) {
  return `
    <div class="rv-native-note">Updated: ${meta.updatedAt || envelope.ts || "N/A"}</div>
    <div class="rv-native-note">Source: ${meta.source || "N/A"}</div>
    <div class="rv-native-note">Trace: ${envelope.traceId || "N/A"}</div>
    <div class="rv-native-note">Cache: ${(envelope.cache?.layer || "none").toUpperCase()} (${envelope.cache?.ttl ?? 0}s)</div>
    <div class="rv-native-note">Upstream: ${envelope.upstream?.status ?? "—"}</div>
    <div class="rv-native-note">Where: ${where}</div>
  `;
}
