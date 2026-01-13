import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  normalizeFreshness,
  safeFetchJson,
  swrGetOrRefresh,
  kvPutJson
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality
} from "./_shared/feature-contract.js";
import { US_TOP_30 } from "./_shared/us-universes.js";

const FEATURE_ID = "analyst-stampede";
const CACHE_KEY = "analyst-stampede:v1";
const LAST_GOOD_KEY = "analyst-stampede:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;

const DEFINITIONS = {
  rules: {
    UPGRADE_SPIKE: "3+ upward changes in 7 days",
    RATING_UPGRADES: "Upgrade count above baseline"
  }
};

async function fetchAnalyst(env) {
  if (!env.FINNHUB_API_KEY) {
    return {
      ok: false,
      error: { code: "ENV_MISSING", message: "FINNHUB_API_KEY missing", details: { missing: ["FINNHUB_API_KEY"] } }
    };
  }

  const symbols = US_TOP_30.slice(0, 5).map((entry) => entry.s);
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_API_KEY}`;
      const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
      return { symbol, res };
    })
  );

  const items = [];
  const missing = [];
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, res } = result.value;
    if (!res.ok || !Array.isArray(res.json) || !res.json.length) {
      missing.push(symbol);
      return;
    }
    const latest = res.json[0];
    const prev = res.json[1] || latest;
    const upgradeSpike =
      (latest?.strongBuy || 0) - (prev?.strongBuy || 0) >= 3 ||
      (latest?.buy || 0) - (prev?.buy || 0) >= 3;
    items.push({
      symbol,
      rating: latest?.rating || "N/A",
      strongBuy: latest?.strongBuy ?? 0,
      buy: latest?.buy ?? 0,
      hold: latest?.hold ?? 0,
      sell: latest?.sell ?? 0,
      reason: upgradeSpike ? "UPGRADE_SPIKE" : ""
    });
  });

  if (!items.length) {
    const payload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "finnhub",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: { signals: [], missingSymbols: missing }
    });
    return { ok: true, data: payload };
  }

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "finnhub",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: missing.length > 0,
      hasData: items.length > 0
    }),
    confidence: calculateConfidence(items.length, symbols.length),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      signals: items,
      missingSymbols: missing
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
    fetcher: () => fetchAnalyst(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "finnhub",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: { signals: [], missingSymbols: [] }
    });
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "finnhub", status: null, snippet: swr.error?.snippet || "" },
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
    partial: (payload?.data?.missingSymbols || []).length,
    hasData: (payload?.data?.signals || []).length > 0
  });

  if (!swr.isStale) {
    await kvPutJson(env, LAST_GOOD_KEY, { ts: new Date().toISOString(), data: payload }, 7 * 24 * 60 * 60);
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: "finnhub", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });

  logServer({ feature: FEATURE_ID, traceId, cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv", upstreamStatus: 200, durationMs: Date.now() - started });
  return response;
}
