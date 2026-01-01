import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeFetchJson
} from "./_shared.js";
import { buildFeaturePayload, resolveDataQuality } from "./_shared/feature-contract.js";

const FEATURE_ID = "arb-liquidity-pulse";
const CACHE_KEY = "arb-liquidity-pulse:v1";
const LAST_GOOD_KEY = "arb-liquidity-pulse:last_good";
const KV_TTL = 6 * 60 * 60;
const LAST_GOOD_TTL = 7 * 24 * 60 * 60;
const SERIES_ID = "WALCL";

function parseObservations(payload) {
  const list = Array.isArray(payload?.observations) ? payload.observations : [];
  const values = list
    .map((entry) => ({
      date: entry.date,
      value: Number.parseFloat(entry.value)
    }))
    .filter((entry) => Number.isFinite(entry.value));
  return values;
}

function buildPayload({
  latestValue,
  delta30dPct,
  source,
  updatedAt,
  partial,
  reasons,
  dataQualityOverride
}) {
  let label = "FLAT";
  if (Number.isFinite(delta30dPct)) {
    if (delta30dPct > 1) label = "UP";
    else if (delta30dPct < -1) label = "DOWN";
  }
  const explain = [];
  if (Number.isFinite(delta30dPct)) {
    explain.push(`30d change: ${delta30dPct.toFixed(2)}%.`);
  } else {
    explain.push("30d change unavailable; using neutral label.");
  }
  const data = {
    items: [
      {
        label,
        delta30dPct: Number.isFinite(delta30dPct) ? delta30dPct : null,
        latestValue: Number.isFinite(latestValue) ? latestValue : null,
        explain,
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

async function fetchLiquidity(env) {
  if (!env?.FRED_API_KEY) {
    return {
      ok: true,
      error: "ENV_MISSING",
      payload: buildPayload({
        latestValue: null,
        delta30dPct: null,
        source: "derived",
        updatedAt: new Date().toISOString(),
        partial: true,
        reasons: ["ENV_MISSING", "FRED_KEY_MISSING"],
        dataQualityOverride: "ENV_MISSING"
      })
    };
  }

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${SERIES_ID}&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=40`;
  const response = await safeFetchJson(url, { timeoutMs: 6000 });
  if (!response.ok || !response.json) {
    return {
      ok: false,
      error: response.error || "UPSTREAM_5XX",
      snippet: response.snippet || "",
      payload: buildPayload({
        latestValue: null,
        delta30dPct: null,
        source: "derived",
        updatedAt: new Date().toISOString(),
        partial: true,
        reasons: ["UPSTREAM_FAIL"]
      })
    };
  }

  const values = parseObservations(response.json);
  const latest = values[0]?.value;
  const prior = values.find((entry) => {
    const diffMs = new Date(values[0]?.date || "").getTime() - new Date(entry.date).getTime();
    return Number.isFinite(diffMs) && diffMs >= 30 * 24 * 60 * 60 * 1000;
  });
  const delta30dPct =
    Number.isFinite(latest) && Number.isFinite(prior?.value) && prior.value !== 0
      ? ((latest / prior.value - 1) * 100)
      : null;

  return {
    ok: true,
    payload: buildPayload({
      latestValue: latest,
      delta30dPct,
      source: "fred",
      updatedAt: new Date().toISOString(),
      partial: !Number.isFinite(latest) || !Number.isFinite(delta30dPct),
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
      upstream: { url: "fred", status: null, snippet: "" }
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

  const fetched = await fetchLiquidity(env);
  let payload = fetched.payload;

  if (fetched.ok) {
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
    upstream: { url: "fred", status: fetched.ok ? 200 : null, snippet: fetched.snippet || "" },
    error: fetched.ok
      ? {}
      : {
          code: fetched.error || "UPSTREAM_5XX",
          message: "Upstream unavailable; using fallback",
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
