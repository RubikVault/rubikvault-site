import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  kvGetJson,
  kvPutJson,
  normalizeFreshness,
  swrGetOrRefresh
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality,
  withReason
} from "./_shared/feature-contract.js";
import { fetchStooqDaily, sma, computeReturn, lastValue } from "./_shared/stooq.js";

const FEATURE_ID = "market-regime";
const CACHE_KEY = "market-regime:v1";
const LAST_GOOD_KEY = "market-regime:last_good";
const KV_TTL = 30 * 60;
const STALE_MAX = 24 * 60 * 60;

const DEFINITIONS = {
  rules: {
    SPY_ABOVE_SMA50: "+20",
    VIX_LOW: "+15",
    VIX_5D_DROP: "+10",
    QQQ_OUTPERF: "+10",
    IWM_POSITIVE_5D: "+10",
    CURVE_STEEPENING: "+10"
  },
  labels: {
    RISK_ON: ">=70",
    NEUTRAL: "40..69",
    RISK_OFF: "<40"
  }
};

async function fetchMarketRegime(env) {
  const [spyRes, qqqRes, iwmRes, vixRes] = await Promise.all([
    fetchStooqDaily("SPY", env),
    fetchStooqDaily("QQQ", env),
    fetchStooqDaily("IWM", env),
    fetchStooqDaily("^VIX", env)
  ]);

  const vixProxyRes = vixRes.ok ? vixRes : await fetchStooqDaily("VIXY", env);

  const cachedCurve = await kvGetJson(env, "DASH:YIELD_CURVE");
  const curveData = cachedCurve?.value?.data || null;

  const metrics = {
    spy: spyRes.ok ? spyRes.data : null,
    qqq: qqqRes.ok ? qqqRes.data : null,
    iwm: iwmRes.ok ? iwmRes.data : null,
    vix: vixProxyRes.ok ? vixProxyRes.data : null,
    curve: curveData
  };

  const hasAnyData = Boolean(metrics.spy || metrics.qqq || metrics.iwm || metrics.vix);
  if (!hasAnyData) {
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
      data: {
        riskOnScore: null,
        label: "NEUTRAL",
        vixProxy: false,
        spy: { close: null, sma50: null, r1d: null, r5d: null },
        qqq: { r5d: null },
        iwm: { r5d: null },
        vix: { value: null, change5d: null },
        yields: { tenTwo: null, updatedAt: null }
      }
    });
    return { ok: true, data: payload };
  }

  const reasons = [];
  let score = 0;
  let availableSignals = 0;
  let totalSignals = 6;

  let spyClose = null;
  let spySma50 = null;
  let spy5d = null;
  if (metrics.spy) {
    spyClose = lastValue(metrics.spy.closes);
    spySma50 = sma(metrics.spy.closes, 50);
    spy5d = computeReturn(metrics.spy.closes, 5);
    availableSignals += 1;
    if (spyClose !== null && spySma50 !== null && spyClose > spySma50) {
      score += 20;
      reasons.push("SPY_ABOVE_SMA50");
    }
  }

  let vixValue = null;
  let vix5d = null;
  let vixProxy = false;
  if (metrics.vix) {
    vixValue = lastValue(metrics.vix.closes);
    vix5d = computeReturn(metrics.vix.closes, 5);
    vixProxy = !vixRes.ok;
    availableSignals += 2;
    if (vixValue !== null && vixValue < 20) {
      score += 15;
      reasons.push("VIX_LOW");
    }
    if (vix5d !== null && vix5d <= -5) {
      score += 10;
      reasons.push("VIX_5D_DROP");
    }
  } else {
    totalSignals -= 2;
  }

  if (metrics.qqq && metrics.spy) {
    const qqq5d = computeReturn(metrics.qqq.closes, 5);
    if (qqq5d !== null && spy5d !== null) {
      availableSignals += 1;
      if (qqq5d > spy5d) {
        score += 10;
        reasons.push("QQQ_OUTPERF");
      }
    } else {
      totalSignals -= 1;
    }
  } else {
    totalSignals -= 1;
  }

  if (metrics.iwm) {
    const iwm5d = computeReturn(metrics.iwm.closes, 5);
    if (iwm5d !== null) {
      availableSignals += 1;
      if (iwm5d > 0) {
        score += 10;
        reasons.push("IWM_POSITIVE_5D");
      }
    } else {
      totalSignals -= 1;
    }
  } else {
    totalSignals -= 1;
  }

  let curveSlope = null;
  if (curveData?.yields) {
    const ten = curveData.yields["10y"];
    const two = curveData.yields["2y"];
    if (typeof ten === "number" && typeof two === "number") {
      curveSlope = ten - two;
      availableSignals += 1;
      if (curveSlope > 0) {
        score += 10;
        reasons.push("CURVE_STEEPENING");
      }
    } else {
      totalSignals -= 1;
    }
  } else {
    totalSignals -= 1;
  }

  const label = score >= 70 ? "RISK_ON" : score >= 40 ? "NEUTRAL" : "RISK_OFF";
  const confidence = calculateConfidence(availableSignals, totalSignals || 1);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: availableSignals < totalSignals,
      hasData: true
    }),
    confidence,
    definitions: DEFINITIONS,
    reasons,
    data: {
      riskOnScore: Math.max(0, Math.min(100, score)),
      label,
      vixProxy,
      spy: {
        close: spyClose,
        sma50: spySma50,
        r1d: metrics.spy ? computeReturn(metrics.spy.closes, 1) : null,
        r5d: spy5d
      },
      qqq: {
        r5d: metrics.qqq ? computeReturn(metrics.qqq.closes, 5) : null
      },
      iwm: {
        r5d: metrics.iwm ? computeReturn(metrics.iwm.closes, 5) : null
      },
      vix: {
        value: vixValue,
        change5d: vix5d
      },
      yields: {
        tenTwo: curveSlope,
        updatedAt: curveData?.updatedAt || null
      }
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
    fetcher: () => fetchMarketRegime(env),
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
      data: {
        riskOnScore: null,
        label: "NEUTRAL",
        vixProxy: false,
        spy: { close: null, sma50: null, r1d: null, r5d: null },
        qqq: { r5d: null },
        iwm: { r5d: null },
        vix: { value: null, change5d: null },
        yields: { tenTwo: null, updatedAt: null }
      }
    });
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
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
    partial: payload?.data?.confidence < 1,
    hasData: true
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
