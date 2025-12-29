import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  kvPutJson,
  normalizeFreshness,
  swrGetOrRefresh
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality
} from "./_shared/feature-contract.js";
import {
  fetchStooqDaily,
  sma,
  computeReturn,
  lastValue,
  atrPercent,
  bodyPercent
} from "./_shared/stooq.js";
import { US_TOP_30 } from "./_shared/us-universes.js";

const FEATURE_ID = "volume-anomaly";
const CACHE_KEY = "volume-anomaly:v1";
const LAST_GOOD_KEY = "volume-anomaly:last_good";
const KV_TTL = 60 * 60;
const STALE_MAX = 24 * 60 * 60;

const DEFINITIONS = {
  signals: {
    ABSORPTION: "RVOL>=2.5 and |return|<=0.6% and candle_body<=30%",
    BREAKOUT_FUEL: "RVOL>=2.0 and close near high"
  }
};

function classifySignal({ rvol, changePercent, bodyPct, closeLocation }) {
  if (rvol >= 2.5 && Math.abs(changePercent ?? 999) <= 0.6 && bodyPct !== null && bodyPct <= 0.3) {
    return "ABSORPTION";
  }
  if (rvol >= 2.0 && closeLocation !== null && closeLocation >= 0.8) {
    return "BREAKOUT_FUEL";
  }
  return "RVOL_HIGH";
}

async function fetchVolumeAnomaly(env) {
  const results = await Promise.allSettled(
    US_TOP_30.map(async (entry) => {
      const symbol = String(entry.s || "").toUpperCase();
      const name = entry.n || symbol;
      const series = await fetchStooqDaily(symbol, env);
      return { symbol, name, series };
    })
  );

  const anomalies = [];
  const missing = [];

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, name, series } = result.value;
    if (!series.ok) {
      missing.push(symbol);
      return;
    }
    const data = series.data;
    const volumes = data.volumes;
    const closes = data.closes;
    const highs = data.highs;
    const lows = data.lows;
    const opens = data.opens;
    const latestVol = lastValue(volumes);
    const volSma20 = sma(volumes, 20);
    const rvol = latestVol !== null && volSma20 ? latestVol / volSma20 : null;
    const changePercent = computeReturn(closes, 1);
    const open = lastValue(opens);
    const high = lastValue(highs);
    const low = lastValue(lows);
    const close = lastValue(closes);
    const bodyPct = bodyPercent(open, high, low, close);
    const closeLocation =
      high !== null && low !== null && high !== low ? (close - low) / (high - low) : null;
    const atrPct = atrPercent(highs, lows, closes, 14);

    if (rvol === null) return;

    const signal = classifySignal({ rvol, changePercent, bodyPct, closeLocation });
    const score = Math.max(
      0,
      Math.min(100, Math.round((rvol * 25) + (atrPct ? 20 - Math.min(20, atrPct) : 0)))
    );

    anomalies.push({
      symbol,
      name,
      price: close,
      changePercent,
      rvol,
      signal,
      score,
      bodyPct,
      closeLocation,
      atrPct
    });
  });

  if (!anomalies.length) {
    return {
      ok: false,
      error: { code: "UPSTREAM_5XX", message: "No volume data", details: { missing } }
    };
  }

  const sorted = anomalies.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: missing.length > 0,
      hasData: sorted.length > 0
    }),
    confidence: calculateConfidence(US_TOP_30.length - missing.length, US_TOP_30.length),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      signals: sorted,
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
    fetcher: () => fetchVolumeAnomaly(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: {
        dataQuality: "NO_DATA",
        updatedAt: new Date().toISOString(),
        source: "stooq",
        traceId,
        reasons: ["NO_DATA"]
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: null, snippet: swr.error?.snippet || "" },
      error: swr.error || { code: "UPSTREAM_5XX", message: "No data", details: {} },
      cacheStatus: "ERROR",
      status: 200
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  payload.traceId = traceId;
  payload.dataQuality = payload.dataQuality || resolveDataQuality({
    ok: true,
    isStale: swr.isStale,
    partial: payload?.data?.missingSymbols?.length,
    hasData: (payload?.data?.signals || []).length > 0
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
    upstream: { url: "stooq", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
