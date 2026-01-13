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
import { shouldSkipUpstream, recordUpstreamResult } from "./_circuit.js";

const FEATURE_ID = "congress-trading";
const CACHE_KEY = "congress-trading:v1";
const LAST_GOOD_KEY = "congress-trading:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;
const LAST_GOOD_TTL = 7 * 24 * 60 * 60;

const SOURCE_URL =
  "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";

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
  const mult =
    match[2]?.toUpperCase() === "M"
      ? 1_000_000
      : match[2]?.toUpperCase() === "K"
        ? 1_000
        : 1;
  return value * mult;
}

async function fetchCongress() {
  const res = await safeFetchJson(SOURCE_URL, { userAgent: "RubikVault/1.0" });
  if (!res.ok || !Array.isArray(res.json)) {
    const code =
      res.status === 403
        ? "UPSTREAM_403"
        : res.error === "SCHEMA_INVALID" || res.error === "HTML_RESPONSE"
          ? "SCHEMA_INVALID"
          : "UPSTREAM_5XX";
    return {
      ok: false,
      error: {
        code,
        message: code === "UPSTREAM_403" ? "Upstream returned 403" : "No upstream data",
        details: { status: res.status ?? null },
        snippet: res.snippet || ""
      }
    };
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
      const conviction =
        action.includes("BUY") && amountValue >= 250_000 ? "BUY_CONVICTION" : "";
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
      trades: filtered,
      items: filtered,
      meta: { lastUpdated: new Date().toISOString() }
    }
  });

  return { ok: true, data: payload };
}

async function readLastGood(env) {
  try {
    if (!env?.RV_KV?.get) return null;
    const lastGood = await env.RV_KV.get(LAST_GOOD_KEY, "json");
    if (!lastGood || !lastGood.data) return null;
    return lastGood; // { ts, data }
  } catch {
    return null;
  }
}

function extractLastEventAt(lastGood) {
  if (!lastGood?.data) return null;
  return (
    lastGood.data?.data?.meta?.lastUpdated ||
    lastGood.data?.updatedAt ||
    lastGood.ts ||
    null
  );
}

function buildCoveragePayload({ traceId, lastEventAt, upstreamBlocked }) {
  return buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: traceId || "",
    source: "coverage-limit",
    updatedAt: new Date().toISOString(),
    dataQuality: "COVERAGE_LIMIT",
    confidence: 0,
    definitions: DEFINITIONS,
    reasons: ["COVERAGE_LIMIT"],
    data: {
      trades: [],
      items: [],
      meta: { lastUpdated: lastEventAt || null },
      context: {
        lookbackWindowDays: 7,
        explain:
          "Free-tier coverage is limited; this block is empty by design when upstream access is blocked.",
        lastEventAt: lastEventAt || null,
        provider: "none",
        upstreamBlocked: Boolean(upstreamBlocked)
      },
      mode: "EMPTY"
    }
  });
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) return bindingResponse;

  const circuit = await shouldSkipUpstream(FEATURE_ID, env, env.RV_KV, Date.now());
  if (circuit.skip) {
    const lastGood = await readLastGood(env);
    const lastEventAt = extractLastEventAt(lastGood);
    const payload = buildCoveragePayload({
      traceId,
      lastEventAt,
      upstreamBlocked: true
    });

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: payload,
      cache: {
        hit: Boolean(lastGood),
        ttl: LAST_GOOD_TTL,
        layer: lastGood ? "kv" : "none"
      },
      upstream: {
        url: SOURCE_URL,
        status: 403,
        snippet: ""
      },
      error: {
        code: "UPSTREAM_403",
        message: "Upstream access blocked (expected coverage limit).",
        details: { status: 403, circuitUntil: circuit.untilTs }
      },
      cacheStatus: "COVERAGE_LIMIT",
      status: 200
    });

    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: lastGood ? "kv" : "none",
      upstreamStatus: 403,
      durationMs: Date.now() - started
    });

    return response;
  }

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchCongress(),
    featureName: FEATURE_ID
  });

  let payload = swr.value?.data || swr.value || null;
  if (swr.error?.code) {
    await recordUpstreamResult(FEATURE_ID, env, env.RV_KV, {
      ok: false,
      code: swr.error.code,
      status: swr.error?.details?.status ?? null
    });
  }

  // ✅ Fallback: wenn Upstream scheitert (z.B. 403), liefere LAST_GOOD statt leeres NO_DATA
  if (!payload && swr.error) {
    if (swr.error?.code === "UPSTREAM_403") {
      const lastGood = await readLastGood(env);
      const lastEventAt = extractLastEventAt(lastGood);
      const coveragePayload = buildCoveragePayload({
        traceId,
        lastEventAt,
        upstreamBlocked: true
      });

      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: coveragePayload,
        cache: {
          hit: Boolean(lastGood),
          ttl: LAST_GOOD_TTL,
          layer: lastGood ? "kv" : "none"
        },
        upstream: {
          url: SOURCE_URL,
          status: swr.error?.details?.status ?? 403,
          snippet: swr.error?.snippet || ""
        },
        error: {
          code: "UPSTREAM_403",
          message: "Upstream access blocked (expected coverage limit).",
          details: { status: swr.error?.details?.status ?? 403 }
        },
        cacheStatus: "COVERAGE_LIMIT",
        status: 200
      });

      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: lastGood ? "kv" : "none",
        upstreamStatus: swr.error?.details?.status ?? 403,
        durationMs: Date.now() - started
      });

      return response;
    }
    const lastGood = await readLastGood(env);
    if (lastGood?.data) {
      payload = lastGood.data;

      // Markiere bewusst als stale + fallback
      payload.traceId = traceId;
      payload.updatedAt = payload.updatedAt || lastGood.ts || new Date().toISOString();
      payload.dataQuality = resolveDataQuality({
        ok: true,
        isStale: true,
        partial: (payload?.data?.trades || []).length < 5,
        hasData: (payload?.data?.trades || []).length > 0
      });

      // reasons erweitern, ohne vorhandene zu zerstören
      payload.reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
      if (!payload.reasons.includes("FALLBACK_LAST_GOOD")) {
        payload.reasons.push("FALLBACK_LAST_GOOD");
      }
      if (swr.error?.code && !payload.reasons.includes(swr.error.code)) {
        payload.reasons.push(swr.error.code);
      }

      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: payload,
        cache: { hit: true, ttl: LAST_GOOD_TTL, layer: "kv" },
        upstream: {
          url: SOURCE_URL,
          status: swr.error?.details?.status ?? null,
          snippet: swr.error?.snippet || ""
        },
        isStale: true,
        freshness: "STALE",
        cacheStatus: "FALLBACK_LAST_GOOD",
        error: swr.error,
        status: 200
      });

      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: swr.error?.details?.status ?? null,
        durationMs: Date.now() - started
      });

      return response;
    }
  }

  // Kein Payload -> bisheriges Verhalten (NO_DATA / SCHEMA_INVALID)
  if (!payload) {
    const isSchemaInvalid = swr.error?.code === "SCHEMA_INVALID";
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "house-stock-watcher",
      updatedAt: new Date().toISOString(),
      dataQuality: isSchemaInvalid
        ? "SCHEMA_INVALID"
        : resolveDataQuality({
            ok: true,
            isStale: false,
            partial: true,
            hasData: false
          }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: [isSchemaInvalid ? "SCHEMA_INVALID" : "NO_DATA"],
      data: { trades: [], items: [], meta: { lastUpdated: null } }
    });

    const response = makeResponse({
      ok: !isSchemaInvalid,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: {
        url: SOURCE_URL,
        status: swr.error?.details?.status ?? null,
        snippet: swr.error?.snippet || ""
      },
      error: swr.error || { code: "UPSTREAM_5XX", message: "No data", details: {} },
      cacheStatus: "ERROR",
      status: 200
    });

    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: swr.error?.details?.status ?? null,
      durationMs: Date.now() - started
    });

    return response;
  }

  // Normaler Erfolgspfad
  payload.traceId = traceId;
  payload.dataQuality =
    payload.dataQuality ||
    resolveDataQuality({
      ok: true,
      isStale: swr.isStale,
      partial: (payload?.data?.trades || []).length < 5,
      hasData: (payload?.data?.trades || []).length > 0
    });

  if (swr.cacheStatus === "MISS") {
    await recordUpstreamResult(FEATURE_ID, env, env.RV_KV, {
      ok: true,
      code: "",
      status: 200
    });
  }

  // LAST_GOOD nur schreiben, wenn wir nicht stale sind
  if (!swr.isStale) {
    await kvPutJson(
      env,
      LAST_GOOD_KEY,
      { ts: new Date().toISOString(), data: payload },
      LAST_GOOD_TTL
    );
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: {
      hit: swr.cacheStatus !== "MISS",
      ttl: KV_TTL,
      layer: swr.cacheStatus === "MISS" ? "none" : "kv"
    },
    upstream: { url: SOURCE_URL, status: 200, snippet: "" },
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
