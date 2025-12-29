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

const FEATURE_ID = "congress-trading";
const CACHE_KEY = "congress-trading:v1";
const LAST_GOOD_KEY = "congress-trading:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;
const SOURCE_URL = "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";

const DEFINITIONS = {
  rules: {
    BUY_CONVICTION: "BUY with high amount range"
  }
};

function parseAmount(range) {
  if (!range) return 0;
  const match = String(range).match(/\$(\d+\.?\d*)([MK]?)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const mult = match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return value * mult;
}

async function fetchCongress() {
  const res = await safeFetchJson(SOURCE_URL, { userAgent: "RubikVault/1.0" });
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false, error: { code: res.error || "UPSTREAM_5XX", message: "No data", details: {} } };
  }
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const filtered = res.json
    .filter((item) => {
      const ts = Date.parse(item.transaction_date || item.notification_date || "");
      return ts && ts >= weekAgo;
    })
    .map((item) => {
      const amount = item.amount || item.amount_range || "";
      const amountValue = parseAmount(amount);
      const action = (item.type || item.transaction_type || "").toUpperCase();
      const conviction = action.includes("BUY") && amountValue >= 250_000 ? "BUY_CONVICTION" : "";
      return {
        politician: item.representative || item.politician || "N/A",
        symbol: item.ticker || item.symbol || "N/A",
        action: action || "N/A",
        amount_range: amount || "N/A",
        date: item.transaction_date || item.notification_date || "N/A",
        track_record: "N/A",
        reason: conviction
      };
    })
    .sort((a, b) => parseAmount(b.amount_range) - parseAmount(a.amount_range))
    .slice(0, 5);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "house-stock-watcher",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: filtered.length < 5,
      hasData: filtered.length > 0
    }),
    confidence: calculateConfidence(filtered.length, 5),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      trades: filtered
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
    fetcher: () => fetchCongress(),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: { dataQuality: "NO_DATA", updatedAt: new Date().toISOString(), source: "house-stock-watcher", traceId, reasons: ["NO_DATA"] },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: SOURCE_URL, status: null, snippet: swr.error?.snippet || "" },
      error: swr.error || { code: "UPSTREAM_5XX", message: "No data", details: {} },
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
    partial: (payload?.data?.trades || []).length < 5,
    hasData: (payload?.data?.trades || []).length > 0
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
    upstream: { url: SOURCE_URL, status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });
  logServer({ feature: FEATURE_ID, traceId, cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv", upstreamStatus: 200, durationMs: Date.now() - started });
  return response;
}
