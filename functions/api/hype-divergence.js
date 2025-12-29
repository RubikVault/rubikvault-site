import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  kvGetJson,
  kvPutJson,
  normalizeFreshness,
  safeFetchJson,
  swrGetOrRefresh
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality
} from "./_shared/feature-contract.js";
import { fetchStooqDaily, computeReturn } from "./_shared/stooq.js";
import { US_TOP_30 } from "./_shared/us-universes.js";

const FEATURE_ID = "hype-divergence";
const CACHE_KEY = "hype-divergence:v1";
const LAST_GOOD_KEY = "hype-divergence:last_good";
const COUNTS_KEY = "hype-divergence:counts";
const KV_TTL = 30 * 60;
const STALE_MAX = 24 * 60 * 60;

const REDDIT_FEEDS = [
  "https://www.reddit.com/r/wallstreetbets/new.json?limit=100",
  "https://www.reddit.com/r/stocks/new.json?limit=100"
];

const DEFINITIONS = {
  signals: {
    BAGHOLDER_RISK: "Mentions spike (z>=2) while price <=0%",
    STEALTH_RALLY: "Mentions drop (z<=-1) while price >=2%"
  }
};

function buildRegex(symbol) {
  if (!symbol) return /(?!)/g;
  const safe = escapeRegExp(symbol);
  return new RegExp(`(^|[^A-Z0-9])\\$?${safe}([^A-Z0-9]|$)`, "g");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitles(feedJson) {
  const items = feedJson?.data?.children || [];
  return items
    .map((child) => child?.data?.title)
    .filter(Boolean)
    .map((title) => String(title).toUpperCase());
}

function computeZScore(current, previous) {
  const prev = previous ?? 0;
  const std = Math.max(1, prev * 0.5);
  return (current - prev) / std;
}

async function fetchHypeData(env) {
  const results = await Promise.allSettled(
    REDDIT_FEEDS.map((url) => safeFetchJson(url, { userAgent: "RubikVault/1.0" }))
  );

  const titles = [];
  const errors = [];
  let upstreamSnippet = "";
  results.forEach((result, idx) => {
    if (result.status !== "fulfilled" || !result.value?.ok || !result.value?.json) {
      const errorCode = result.value?.error || "UPSTREAM_5XX";
      if (!upstreamSnippet) upstreamSnippet = result.value?.snippet || "";
      errors.push({ source: REDDIT_FEEDS[idx], code: errorCode, status: result.value?.status ?? null });
      return;
    }
    titles.push(...extractTitles(result.value.json));
  });

  if (!titles.length) {
    const hasSchemaIssue = errors.some(
      (entry) => entry.code === "SCHEMA_INVALID" || entry.code === "HTML_RESPONSE"
    );
    return {
      ok: false,
      error: {
        code: hasSchemaIssue ? "SCHEMA_INVALID" : "UPSTREAM_5XX",
        message: "No upstream data",
        details: { errors }
      },
      snippet: upstreamSnippet
    };
  }

  const previousCounts = (await kvGetJson(env, COUNTS_KEY))?.value?.counts || {};
  const signals = [];
  const missing = [];

  for (const entry of US_TOP_30) {
    const symbol = String(entry.s || "").toUpperCase();
    const regex = buildRegex(symbol);
    const count = titles.reduce((sum, title) => sum + (title.match(regex)?.length || 0), 0);
    const prev = previousCounts[symbol] || 0;
    const z = computeZScore(count, prev);

    const series = await fetchStooqDaily(symbol, env);
    const change3d = series.ok ? computeReturn(series.data.closes, 3) : null;
    if (!series.ok) missing.push(symbol);

    let signal = "";
    if (z >= 2 && (change3d ?? 0) <= 0) signal = "BAGHOLDER_RISK";
    if (z <= -1 && (change3d ?? 0) >= 2) signal = "STEALTH_RALLY";

    if (signal) {
      signals.push({
        symbol,
        mentions: count,
        zscore: Number(z.toFixed(2)),
        change3d,
        signal,
        confidence: Math.min(1, Math.abs(z) / 3)
      });
    }
  }

  const sorted = signals.sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore)).slice(0, 5);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "reddit",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: errors.length > 0 || missing.length > 0,
      hasData: sorted.length > 0
    }),
    confidence: calculateConfidence(US_TOP_30.length - missing.length, US_TOP_30.length),
    definitions: DEFINITIONS,
    reasons: errors.length ? ["REDDIT_PARTIAL"] : [],
    data: {
      signals: sorted,
      errors,
      missingSymbols: missing
    }
  });

  await kvPutJson(env, COUNTS_KEY, { ts: new Date().toISOString(), counts: Object.fromEntries(
    US_TOP_30.map((entry) => {
      const symbol = String(entry.s || "").toUpperCase();
      const regex = buildRegex(symbol);
      const count = titles.reduce((sum, title) => sum + (title.match(regex)?.length || 0), 0);
      return [symbol, count];
    })
  ) }, 24 * 60 * 60);

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
    fetcher: () => fetchHypeData(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const isSchemaInvalid = swr.error?.code === "SCHEMA_INVALID";
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "reddit",
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
      data: {
        signals: [],
        errors: swr.error?.details?.errors || [],
        missingSymbols: []
      }
    });
    const response = makeResponse({
      ok: !isSchemaInvalid,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "reddit", status: null, snippet: swr.error?.snippet || "" },
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
    partial: payload?.data?.errors?.length,
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
    upstream: { url: "reddit", status: 200, snippet: "" },
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
