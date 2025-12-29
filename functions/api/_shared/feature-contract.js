export function calculateConfidence(availableSignals, totalSignals) {
  if (!totalSignals) return 0;
  const raw = availableSignals / totalSignals;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

export function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((reason) => String(reason || "").trim())
    .filter(Boolean);
}

export function resolveDataQuality({ ok, isStale, partial, hasData }) {
  if (!ok || !hasData) return "NO_DATA";
  if (isStale) return "STALE";
  if (partial) return "PARTIAL";
  return "LIVE";
}

export function buildFeaturePayload({
  feature,
  traceId,
  source,
  updatedAt,
  data,
  definitions,
  reasons,
  confidence,
  dataQuality
}) {
  return {
    feature,
    traceId,
    updatedAt: updatedAt || new Date().toISOString(),
    source: source || "unknown",
    dataQuality: dataQuality || "NO_DATA",
    confidence: Number.isFinite(confidence) ? confidence : 0,
    definitions: definitions || {},
    reasons: normalizeReasons(reasons),
    data: data || {}
  };
}

export function withReason(list, code) {
  const next = Array.isArray(list) ? list.slice() : [];
  if (code) next.push(code);
  return next;
}
