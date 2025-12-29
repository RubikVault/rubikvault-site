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
import { fetchStooqDaily, computeReturn } from "./_shared/stooq.js";

const FEATURE_ID = "alpha-performance";
const CACHE_KEY = "alpha-performance:v1";
const LAST_GOOD_KEY = "alpha-performance:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;

const DEFINITIONS = {
  rules: {
    takeProfit: "+5%",
    stopLoss: "-3%",
    timeExit: "20 trading days"
  }
};

function computeStats(outcomes) {
  const wins = outcomes.filter((item) => item.result === "WIN");
  const losses = outcomes.filter((item) => item.result === "LOSS");
  const winAvg = wins.length ? wins.reduce((sum, item) => sum + item.return, 0) / wins.length : 0;
  const lossAvg = losses.length ? losses.reduce((sum, item) => sum + item.return, 0) / losses.length : 0;
  const hitRate = outcomes.length ? wins.length / outcomes.length : 0;
  const expectancy = outcomes.length ? hitRate * winAvg + (1 - hitRate) * lossAvg : 0;
  return {
    hitRate,
    avgWin: winAvg,
    avgLoss: lossAvg,
    expectancy
  };
}

async function fetchAlphaPerformance(env) {
  const alphaCache = await kvGetJson(env, "DASH:ALPHA_RADAR");
  const picks = alphaCache?.value?.data?.picks || null;
  const symbols = picks?.top?.map((pick) => pick.symbol).filter(Boolean) || [];

  if (!symbols.length) {
    return { ok: false, error: { code: "NO_DATA", message: "No Alpha Radar picks", details: {} } };
  }

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const series = await fetchStooqDaily(symbol, env);
      return { symbol, series };
    })
  );

  const outcomes = [];
  const missing = [];

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, series } = result.value;
    if (!series.ok) {
      missing.push(symbol);
      return;
    }
    const returns = computeReturn(series.data.closes, 20);
    let resultLabel = "NEUTRAL";
    if (returns >= 5) resultLabel = "WIN";
    if (returns <= -3) resultLabel = "LOSS";
    outcomes.push({ symbol, result: resultLabel, return: returns });
  });

  if (!outcomes.length) {
    return { ok: false, error: { code: "NO_DATA", message: "No price history", details: { missing } } };
  }

  const stats = computeStats(outcomes);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: missing.length > 0,
      hasData: outcomes.length > 0
    }),
    confidence: calculateConfidence(outcomes.length, symbols.length || 1),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      totalSignals: outcomes.length,
      last60d: outcomes.length,
      hitRate: Number(stats.hitRate.toFixed(2)),
      avgWin: Number(stats.avgWin.toFixed(2)),
      avgLoss: Number(stats.avgLoss.toFixed(2)),
      expectancy: Number(stats.expectancy.toFixed(2)),
      outcomes,
      missingSymbols: missing,
      methodology: "Proxy using 20D return vs +5%/-3% thresholds"
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
    fetcher: () => fetchAlphaPerformance(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: { dataQuality: "NO_DATA", updatedAt: new Date().toISOString(), source: "stooq", traceId, reasons: ["NO_DATA"] },
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
    hasData: (payload?.data?.outcomes || []).length > 0
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
