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
import { fetchStooqDaily, atrPercent } from "./_shared/stooq.js";

const FEATURE_ID = "earnings-reality";
const CACHE_KEY = "earnings-reality:v1";
const LAST_GOOD_KEY = "earnings-reality:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;

const DEFINITIONS = {
  rules: {
    RICH_PREMIUM: "Implied > realized * 1.5",
    CHEAP_PREMIUM: "Implied < realized * 0.7"
  },
  proxies: {
    implied: "ATR% * 1.5",
    realized: "ATR% proxy"
  }
};

async function fetchEarningsReality(env) {
  const cached = await kvGetJson(env, "earnings-calendar:last_good");
  const items = cached?.value?.data?.items || [];
  const now = Date.now();
  const horizon = now + 10 * 24 * 60 * 60 * 1000;

  const upcoming = items
    .filter((item) => item?.symbol && item?.date)
    .filter((item) => {
      const ts = Date.parse(item.date);
      return ts && ts >= now && ts <= horizon;
    })
    .slice(0, 8);

  if (!upcoming.length) {
    const payload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
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
      data: { items: [], missingSymbols: [] }
    });
    return { ok: true, data: payload };
  }

  const results = await Promise.allSettled(
    upcoming.map(async (item) => {
      const series = await fetchStooqDaily(item.symbol, env);
      return { item, series };
    })
  );

  const rows = [];
  const missing = [];

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { item, series } = result.value;
    if (!series.ok) {
      missing.push(item.symbol);
      return;
    }
    const atrPct = atrPercent(series.data.highs, series.data.lows, series.data.closes, 14);
    const implied = atrPct !== null ? atrPct * 1.5 : null;
    const realized = atrPct;
    let flag = "";
    if (implied !== null && realized !== null) {
      if (implied > realized * 1.5) flag = "RICH_PREMIUM";
      if (implied < realized * 0.7) flag = "CHEAP_PREMIUM";
    }
    rows.push({
      symbol: item.symbol,
      company: item.company || "N/A",
      date: item.date,
      impliedMove: implied,
      realizedMove: realized,
      flag
    });
  });

  if (!rows.length) {
    const payload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
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
      data: { items: [], missingSymbols: missing }
    });
    return { ok: true, data: payload };
  }

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: missing.length > 0,
      hasData: rows.length > 0
    }),
    confidence: calculateConfidence(rows.length, upcoming.length || 1),
    definitions: DEFINITIONS,
    reasons: ["PROXY_ATR"],
    data: {
      items: rows.slice(0, 5),
      missingSymbols: missing
    }
  });

  return { ok: true, data: payload };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchEarningsReality(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
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
      data: { items: [], missingSymbols: [] }
    });
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: null, snippet: swr.error?.snippet || "" },
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
    hasData: (payload?.data?.items || []).length > 0
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
    upstream: { url: "stooq", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });

  logServer({ feature: FEATURE_ID, traceId, cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv", upstreamStatus: 200, durationMs: Date.now() - started });
  return response;
}
