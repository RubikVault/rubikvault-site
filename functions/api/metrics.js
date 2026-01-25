import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const v = url.searchParams.get("v");
  if (v !== "5") {
    return serveStaticJson(context.request, "metrics", null, context);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const omit = (url.searchParams.get("omit") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const omitSet = new Set(omit);

  const TOTAL_METRICS = 43;
  const baseMetricId = omitSet.has("rates.us10y") ? "risk.vix" : "rates.us10y";
  const metricsById = {};

  if (!omitSet.has(baseMetricId)) {
    metricsById[baseMetricId] = {
      id: baseMetricId,
      groupId: "stub",
      label: baseMetricId,
      value: 0,
      valueType: "number",
      unit: "index",
      asOf: nowIso,
      cadence: "daily",
      change: { d1: null, w1: null, m1: null },
      spark: [],
      quality: {
        isFresh: false,
        isStale: true,
        marketClosed: false,
        consecutiveFails: 0,
        validation: "OK"
      },
      display: {
        trend: "flat",
        severity: "neutral",
        badgeText: "STUB",
        tooltip: "Stub metric (metrics snapshot missing)"
      },
      source: { primary: "stub", fallbackUsed: false }
    };
  }

  const metricsCount = Object.keys(metricsById).length;
  const requiredMissing = Math.max(0, TOTAL_METRICS - metricsCount);
  const missingMetricIds = omitSet.size > 0
    ? Array.from(omitSet).slice(0, requiredMissing)
    : [];
  while (missingMetricIds.length < requiredMissing) {
    missingMetricIds.push(`stub.missing.${missingMetricIds.length + 1}`);
  }

  const payload = {
    meta: {
      status: "PARTIAL",
      requestId: `rv-${now.getTime()}-${Math.random().toString(16).slice(2)}`,
      asOf: nowIso,
      generatedAt: nowIso,
      ageSeconds: 0,
      version: "5.0",
      source: { primary: "stub", fallbackUsed: false },
      cache: { hit: false, ttlSeconds: 0, kvAvailable: false },
      circuitOpen: false,
      missingMetricIds,
      metricsCount,
      groupsCount: 9
    },
    data: {
      groups: [],
      metricsById,
      signals: [],
      uiDefaults: { defaultUi: "stub", availableUis: ["stub"] }
    },
    error: null
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-RV-Source": "METRICS_V5_FALLBACK"
    }
  });
}
