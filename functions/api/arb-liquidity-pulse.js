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
const LAST_GOOD_KEY = "lastgood:liquidity-drain";
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
  const url = new URL(request.url);
  const debugEnabled = url.searchParams.get("debug") === "1";
  const hasKV =
    env?.RV_KV &&
    typeof env.RV_KV.get === "function" &&
    typeof env.RV_KV.put === "function";
  const readMode = env?.__RV_ALLOW_WRITE__ ? "WRITE" : "READONLY";

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
      upstream: { url: "fred", status: null, snippet: "" },
      debug: debugEnabled
        ? {
            keyUsed: CACHE_KEY,
            hasKV,
            readMode,
            cache: { layer: "kv", hit: true, ttl: KV_TTL },
            reason: "",
            attempts: { upstream: "skipped", fallback: "skipped" }
          }
        : undefined
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

  if (!env?.FRED_API_KEY) {
    const lastGood = await kvGetJson(env, LAST_GOOD_KEY);
    if (lastGood?.hit && lastGood.value?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: lastGood.value.data,
        cache: { hit: true, ttl: LAST_GOOD_TTL, layer: "kv" },
        upstream: { url: "fred", status: null, snippet: "" },
        isStale: true,
        meta: { status: "STALE", reason: "MIRROR_FALLBACK" },
        debug: debugEnabled
          ? {
              keyUsed: LAST_GOOD_KEY,
              hasKV,
              readMode,
              cache: { layer: "kv", hit: true, ttl: LAST_GOOD_TTL },
              reason: "ENV_MISSING",
              attempts: { upstream: "skipped", fallback: "hit" }
            }
          : undefined
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - started,
        errorCode: "ENV_MISSING"
      });
      return response;
    }

    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "fred", status: null, snippet: "" },
      error: { code: "ENV_MISSING", message: "FRED_API_KEY missing", details: {} },
      meta: { status: "NO_DATA", reason: "ENV_MISSING" },
      debug: debugEnabled
        ? {
            keyUsed: LAST_GOOD_KEY,
            hasKV,
            readMode,
            cache: { layer: "none", hit: false, ttl: 0 },
            reason: "ENV_MISSING",
            attempts: { upstream: "skipped", fallback: "miss" }
          }
        : undefined
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started,
      errorCode: "ENV_MISSING"
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
    } else {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        data: null,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "fred", status: null, snippet: fetched.snippet || "" },
        error: {
          code: "LASTGOOD_MISSING",
          message: "No cached fallback available",
          details: {}
        },
        meta: { status: "NO_DATA", reason: "LASTGOOD_MISSING" },
        debug: debugEnabled
          ? {
              keyUsed: LAST_GOOD_KEY,
              hasKV,
              readMode,
              cache: { layer: "none", hit: false, ttl: 0 },
              reason: "LASTGOOD_MISSING",
              attempts: { upstream: "fail", fallback: "miss" }
            }
          : undefined
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: null,
        durationMs: Date.now() - started,
        errorCode: "LASTGOOD_MISSING"
      });
      return response;
    }
  }

  const cacheInfo = fetched.ok
    ? { hit: false, ttl: KV_TTL, layer: "none" }
    : { hit: true, ttl: LAST_GOOD_TTL, layer: "kv" };
  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: cacheInfo,
    upstream: { url: "fred", status: fetched.ok ? 200 : null, snippet: fetched.snippet || "" },
    isStale: fetched.ok ? false : true,
    meta: fetched.ok ? undefined : { status: "STALE", reason: "MIRROR_FALLBACK" },
    debug: debugEnabled
      ? {
          keyUsed: fetched.ok ? CACHE_KEY : LAST_GOOD_KEY,
          hasKV,
          readMode,
          cache: { layer: cacheInfo.layer, hit: cacheInfo.hit, ttl: cacheInfo.ttl },
          reason: fetched.ok ? "" : "MIRROR_FALLBACK",
          attempts: { upstream: fetched.ok ? "ok" : "fail", fallback: fetched.ok ? "skipped" : "hit" }
        }
      : undefined
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: cacheInfo.layer,
    upstreamStatus: fetched.ok ? 200 : null,
    durationMs: Date.now() - started,
    errorCode: fetched.ok ? "" : fetched.error
  });

  return response;
}
