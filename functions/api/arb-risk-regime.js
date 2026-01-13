import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse
} from "./_shared.js";
import { buildFeaturePayload, resolveDataQuality } from "./_shared/feature-contract.js";
import { fetchStooqDaily, lastValue } from "./_shared/stooq.js";

const FEATURE_ID = "arb-risk-regime";
const CACHE_KEY = "arb-risk-regime:v1";
const LAST_GOOD_KEY = "arb-risk-regime:last_good";
const KV_TTL = 30 * 60;
const LAST_GOOD_TTL = 24 * 60 * 60;
const VIX_SYMBOL = "VIXY";
const UPSTREAM_URL = `https://stooq.com/q/d/l/?s=${VIX_SYMBOL}.US&i=d`;

function classifyRegime(vixValue) {
  if (!Number.isFinite(vixValue)) {
    return { label: "NEUTRAL", score: 50, explain: ["VIX proxy unavailable; using neutral baseline."] };
  }
  if (vixValue <= 18) {
    return { label: "RISK-ON", score: 75, explain: ["Volatility is subdued vs recent history."] };
  }
  if (vixValue <= 25) {
    return { label: "NEUTRAL", score: 50, explain: ["Volatility sits in the mid-range."] };
  }
  return { label: "RISK-OFF", score: 25, explain: ["Volatility elevated; risk appetite reduced."] };
}

function buildPayload({ vixValue, source, updatedAt, partial, reasons }) {
  const regime = classifyRegime(vixValue);
  const explain = [...regime.explain];
  if (Number.isFinite(vixValue)) {
    explain.push(`Proxy VIX (${VIX_SYMBOL}) last close: ${vixValue.toFixed(2)}.`);
  }
  const data = {
    items: [
      {
        label: regime.label,
        score0to100: regime.score,
        vixValue: Number.isFinite(vixValue) ? vixValue : null,
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
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial,
      hasData: true
    })
  });
}

async function fetchRiskRegime(env) {
  const series = await fetchStooqDaily(VIX_SYMBOL, env);
  if (!series.ok) {
    return {
      ok: false,
      error: series.error || "UPSTREAM_5XX",
      snippet: series.snippet || "",
      payload: buildPayload({
        vixValue: null,
        source: "derived",
        updatedAt: new Date().toISOString(),
        partial: true,
        reasons: ["DERIVED_FALLBACK"]
      })
    };
  }
  const vixValue = lastValue(series.data.closes);
  const payload = buildPayload({
    vixValue,
    source: "stooq",
    updatedAt: new Date().toISOString(),
    partial: !Number.isFinite(vixValue),
    reasons: []
  });
  return { ok: true, payload };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) return bindingResponse;

  const cached = await kvGetJson(env, CACHE_KEY);
  if (cached?.hit && cached.value?.data) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: { url: UPSTREAM_URL, status: null, snippet: "" }
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

  const fetched = await fetchRiskRegime(env);
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
    upstream: { url: UPSTREAM_URL, status: fetched.ok ? 200 : null, snippet: fetched.snippet || "" },
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
