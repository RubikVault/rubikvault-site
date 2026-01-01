import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse
} from "./_shared.js";
import { buildFeaturePayload, resolveDataQuality } from "./_shared/feature-contract.js";

const FEATURE_ID = "arb-breadth-lite";
const CACHE_KEY = "arb-breadth-lite:v1";
const LAST_GOOD_KEY = "arb-breadth-lite:last_good";
const KV_TTL = 30 * 60;
const LAST_GOOD_TTL = 24 * 60 * 60;
const TOP_MOVERS_KEY = "top-movers:v2";

function computeBreadth(gainers, losers) {
  const total = gainers + losers;
  if (!total) return { score: 50, label: "NEUTRAL" };
  const score = Math.round((gainers / total) * 100);
  if (score >= 60) return { score, label: "UP" };
  if (score <= 40) return { score, label: "DOWN" };
  return { score, label: "NEUTRAL" };
}

function buildPayload({
  gainers,
  losers,
  source,
  updatedAt,
  partial,
  reasons,
  dataQualityOverride
}) {
  const breadth = computeBreadth(gainers, losers);
  const data = {
    items: [
      {
        label: breadth.label,
        breadthScore0to100: breadth.score,
        gainers,
        losers,
        explain: [
          `Gainers: ${gainers}`,
          `Losers: ${losers}`
        ],
        sources: [source]
      }
    ]
  };
  return buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source,
    updatedAt,
    data,
    reasons,
    dataQuality:
      dataQualityOverride ||
      resolveDataQuality({
        ok: true,
        isStale: false,
        partial,
        hasData: true
      })
  });
}

async function fetchBreadth(env) {
  const cached = await kvGetJson(env, TOP_MOVERS_KEY);
  const stockData = cached?.value?.data?.stocks || cached?.value?.data?.data?.stocks || {};
  const gainers = Array.isArray(stockData.gainers) ? stockData.gainers.length : 0;
  const losers = Array.isArray(stockData.losers) ? stockData.losers.length : 0;
  const hasData = gainers + losers > 0;

  if (!hasData) {
    return {
      ok: true,
      error: "NO_SOURCE",
      payload: buildPayload({
        gainers: 0,
        losers: 0,
        source: "derived",
        updatedAt: new Date().toISOString(),
        partial: true,
        reasons: ["NO_SOURCE_DATA"],
        dataQualityOverride: "NO_SOURCE"
      })
    };
  }

  return {
    ok: true,
    payload: buildPayload({
      gainers,
      losers,
      source: "top-movers",
      updatedAt: new Date().toISOString(),
      partial: false,
      reasons: []
    })
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  const cached = await kvGetJson(env, CACHE_KEY);
  if (cached?.hit && cached.value?.data) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: { url: "top-movers", status: null, snippet: "" }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "kv",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const fetched = await fetchBreadth(env);
  let payload = fetched.payload;

  if (fetched.ok && payload?.data?.items?.length) {
    const kvPayload = {
      ts: new Date().toISOString(),
      source: payload.source,
      schemaVersion: 1,
      data: payload
    };
    await kvPutJson(env, CACHE_KEY, kvPayload, KV_TTL);
    await kvPutJson(env, LAST_GOOD_KEY, kvPayload, LAST_GOOD_TTL);
  } else {
    const lastGood = await kvGetJson(env, LAST_GOOD_KEY);
    if (lastGood?.hit && lastGood.value?.data) {
      payload = { ...lastGood.value.data, asOf: lastGood.value.ts };
    }
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: false, ttl: KV_TTL, layer: "none" },
    upstream: { url: "top-movers", status: fetched.ok ? 200 : null, snippet: "" },
    error: fetched.ok
      ? {}
      : {
          code: fetched.error || "NO_SOURCE",
          message: "No upstream data; using fallback",
          details: {}
        }
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: fetched.ok ? 200 : null,
    durationMs: Date.now() - started,
    errorCode: fetched.ok ? "" : fetched.error
  });

  return response;
}
