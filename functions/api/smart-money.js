import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  normalizeFreshness,
  kvGetJson,
  kvPutJson,
  swrGetOrRefresh
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality
} from "./_shared/feature-contract.js";

const FEATURE_ID = "smart-money";
const CACHE_KEY = "smart-money:v1";
const LAST_GOOD_KEY = "smart-money:last_good";
const KV_TTL = 60 * 60;
const STALE_MAX = 24 * 60 * 60;

const WEIGHTS = {
  insider: 0.35,
  volume: 0.25,
  analyst: 0.2,
  congress: 0.2
};

const DEFINITIONS = {
  components: WEIGHTS
};

function normalizeWeights(components) {
  const available = Object.entries(components).filter(([, value]) => value !== null);
  const totalWeight = available.reduce((sum, [key]) => sum + (WEIGHTS[key] || 0), 0);
  const normalized = {};
  available.forEach(([key]) => {
    normalized[key] = totalWeight ? (WEIGHTS[key] || 0) / totalWeight : 0;
  });
  return normalized;
}

async function fetchSmartMoney(env) {
  const [insider, volume, analyst, congress] = await Promise.all([
    kvGetJson(env, "insider-cluster:last_good"),
    kvGetJson(env, "volume-anomaly:last_good"),
    kvGetJson(env, "analyst-stampede:last_good"),
    kvGetJson(env, "congress-trading:last_good")
  ]);

  const insiderCount = insider?.value?.data?.data?.clusters?.length || 0;
  const volumeCount = volume?.value?.data?.data?.signals?.length || 0;
  const analystCount = analyst?.value?.data?.data?.signals?.length || 0;
  const congressCount = congress?.value?.data?.data?.trades?.length || 0;

  const components = {
    insider: insiderCount ? Math.min(1, insiderCount / 5) : null,
    volume: volumeCount ? Math.min(1, volumeCount / 5) : null,
    analyst: analystCount ? Math.min(1, analystCount / 5) : null,
    congress: congressCount ? Math.min(1, congressCount / 5) : null
  };

  const weights = normalizeWeights(components);
  const score = Object.entries(components).reduce((sum, [key, value]) => {
    if (value === null) return sum;
    return sum + value * (weights[key] || 0);
  }, 0);

  const availableComponents = Object.values(components).filter((value) => value !== null).length;

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "internal",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: availableComponents < 4,
      hasData: availableComponents > 0
    }),
    confidence: calculateConfidence(availableComponents, 4),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      score: Math.round(score * 100),
      components,
      weights,
      availableComponents
    }
  });

  return { ok: true, data: payload };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) return bindingResponse;

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchSmartMoney(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: { dataQuality: "NO_DATA", updatedAt: new Date().toISOString(), source: "internal", traceId, reasons: ["NO_DATA"] },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "kv", status: null, snippet: swr.error?.snippet || "" },
      error: swr.error || { code: "NO_DATA", message: "No data", details: {} },
      cacheStatus: "ERROR",
      status: 200
    });
    logServer({ feature: FEATURE_ID, traceId, cacheLayer: "none", upstreamStatus: null, durationMs: Date.now() - started });
    return response;
  }

  payload.traceId = traceId;
  payload.dataQuality = payload.dataQuality || resolveDataQuality({
    ok: true,
    isStale: swr.isStale,
    partial: payload?.data?.availableComponents < 4,
    hasData: payload?.data?.availableComponents > 0
  });

  if (!swr.isStale) {
    await kvPutJson(env, LAST_GOOD_KEY, { ts: new Date().toISOString(), data: payload }, 24 * 60 * 60);
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: "kv", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });

  logServer({ feature: FEATURE_ID, traceId, cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv", upstreamStatus: 200, durationMs: Date.now() - started });
  return response;
}
