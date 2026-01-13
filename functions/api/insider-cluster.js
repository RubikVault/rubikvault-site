import { XMLParser } from "fast-xml-parser";
import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  normalizeFreshness,
  safeFetchText,
  safeSnippet,
  isHtmlLike,
  swrGetOrRefresh,
  kvPutJson
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality
} from "./_shared/feature-contract.js";

const FEATURE_ID = "insider-cluster";
const CACHE_KEY = "insider-cluster:v1";
const LAST_GOOD_KEY = "insider-cluster:last_good";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;
const SEC_FEED = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=4&company=&dateb=&owner=only&count=40&output=atom";

const DEFINITIONS = {
  rules: {
    CLUSTER: "3+ unique insiders within 10 trading days"
  },
  limitations: "Form 4 feed metadata only (no transaction codes)."
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

function extractSymbol(title) {
  if (!title) return null;
  const match = String(title).match(/\(([A-Z]{1,5})\)/);
  return match ? match[1] : null;
}

function parseFeed(xml) {
  if (!xml || isHtmlLike(xml)) return [];
  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    return [];
  }
  let entries = parsed?.feed?.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  return entries.map((entry) => ({
    title: entry?.title || "",
    updated: entry?.updated || entry?.published || "",
    link: entry?.link?.href || entry?.link || ""
  }));
}

async function fetchInsider(env) {
  const res = await safeFetchText(SEC_FEED, {
    userAgent: env.USER_AGENT || "RubikVault/1.0",
    headers: { Accept: "application/atom+xml, application/xml;q=0.9,*/*;q=0.8" }
  });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return {
      ok: false,
      error: { code: "UPSTREAM_5XX", message: "SEC feed unavailable", details: { status: res.status ?? null } },
      snippet: safeSnippet(text)
    };
  }
  const entries = parseFeed(text);
  const now = Date.now();
  const tenDays = 10 * 24 * 60 * 60 * 1000;
  const recent = entries.filter((entry) => {
    const ts = Date.parse(entry.updated || "");
    return ts && now - ts <= tenDays;
  });

  const bySymbol = new Map();
  recent.forEach((entry) => {
    const symbol = extractSymbol(entry.title) || "N/A";
    if (!bySymbol.has(symbol)) {
      bySymbol.set(symbol, { symbol, count: 0, insiders: new Set(), updatedAt: entry.updated });
    }
    const rec = bySymbol.get(symbol);
    rec.count += 1;
    rec.insiders.add(entry.title || "unknown");
  });

  const clusters = Array.from(bySymbol.values())
    .map((item) => ({
      symbol: item.symbol,
      insiderCount: item.insiders.size,
      filings: item.count,
      totalValue: "N/A",
      reason: item.insiders.size >= 3 ? "CLUSTER" : "INSUFFICIENT_CLUSTER",
      updatedAt: item.updatedAt
    }))
    .sort((a, b) => b.insiderCount - a.insiderCount)
    .slice(0, 5);

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "sec-edgar",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: clusters.length < 5,
      hasData: clusters.length > 0
    }),
    confidence: calculateConfidence(clusters.length, 5),
    definitions: DEFINITIONS,
    reasons: ["SEC_FEED_LIMITED"],
    data: {
      clusters,
      items: clusters
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
    fetcher: () => fetchInsider(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "sec-edgar",
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
      data: { clusters: [], items: [] }
    });
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: SEC_FEED, status: null, snippet: swr.error?.snippet || "" },
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
    partial: (payload?.data?.clusters || []).length < 5,
    hasData: (payload?.data?.clusters || []).length > 0
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
    upstream: { url: SEC_FEED, status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus,
    status: 200
  });

  logServer({ feature: FEATURE_ID, traceId, cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv", upstreamStatus: 200, durationMs: Date.now() - started });
  return response;
}
