import { XMLParser } from "fast-xml-parser";
import { parseJsonLenient, fetchTextWithTimeout } from "./_shared/parse.js";

const SCHEMA_VERSION = 1;

export function createTraceId(request) {
  try {
    const url = new URL(request.url);
    const headerTrace = request.headers.get("x-rv-trace") || request.headers.get("x-rv-trace-id");
    return (
      headerTrace ||
      url.searchParams.get("traceId") ||
      url.searchParams.get("trace") ||
      Math.random().toString(36).slice(2, 10)
    );
  } catch (error) {
    return Math.random().toString(36).slice(2, 10);
  }
}

export function rateLimitFallback() {
  return { remaining: "unknown", reset: null, estimated: true };
}

export function safeSnippet(text, max = 300) {
  if (!text) return "";
  const stringValue = String(text);
  return stringValue.length > max ? stringValue.slice(0, max) : stringValue;
}

export function truncate(text, limit = 300) {
  return safeSnippet(text, limit);
}

export function errorObject(code, message, details = {}) {
  return {
    code: code || "",
    message: message || "",
    details: details || {}
  };
}

export function withCoinGeckoKey(url, env) {
  const apiKey = env?.COINGECKO_DEMO_KEY;
  if (!apiKey || !url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("x_cg_demo_api_key", apiKey);
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

export function makeJson({
  ok,
  feature,
  traceId,
  ts,
  data = {},
  cache = {},
  upstream = {},
  rateLimit = rateLimitFallback(),
  error = {},
  isStale = false,
  source,
  freshness,
  cacheStatus,
  sourceMap
} = {}) {
  return {
    ok: Boolean(ok),
    feature: feature || "unknown",
    ts: ts || new Date().toISOString(),
    traceId: traceId || "unknown",
    schemaVersion: SCHEMA_VERSION,
    cache: {
      hit: Boolean(cache.hit),
      ttl: cache.ttl ?? 0,
      layer: cache.layer || "none"
    },
    upstream: {
      url: upstream.url || "",
      status: upstream.status ?? null,
      snippet: upstream.snippet || ""
    },
    rateLimit,
    data,
    error: {
      code: error.code || "",
      message: error.message || "",
      details: error.details || {}
    },
    ...(isStale ? { isStale: true } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
    ...(cacheStatus ? { cacheStatus } : {}),
    ...(sourceMap ? { sourceMap } : {})
  };
}

export function buildPayload(args = {}) {
  return makeJson(args);
}

export function makeResponse({
  ok,
  feature,
  traceId,
  ts,
  data,
  cache,
  upstream,
  rateLimit,
  error,
  isStale,
  status = 200,
  headers = {},
  source,
  freshness,
  cacheStatus,
  sourceMap
} = {}) {
  const payload = makeJson({
    ok,
    feature,
    traceId,
    ts,
    data,
    cache,
    upstream,
    rateLimit,
    error,
    isStale,
    source,
    freshness,
    cacheStatus,
    sourceMap
  });
  return jsonResponse(payload, { status, cacheStatus }, headers);
}

function resolveCacheStatus(payload, override) {
  if (override) return override;
  if (payload?.cacheStatus) return payload.cacheStatus;
  if (payload?.isStale) return "STALE";
  if (payload?.cache?.hit) return "HIT";
  if (payload?.ok === false) return "ERROR";
  return "MISS";
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  let resolvedStatus = status;
  let headers = extraHeaders || {};
  let cacheStatus = "";
  if (typeof status === "object" && status !== null) {
    resolvedStatus = status.status ?? 200;
    cacheStatus = status.cacheStatus || "";
    headers = status.headers || extraHeaders || {};
  }
  const resolvedCache = resolveCacheStatus(payload, cacheStatus);
  return new Response(JSON.stringify(payload), {
    status: resolvedStatus,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Cache": resolvedCache,
      ...headers
    }
  });
}

export function assertBindings(env, feature, traceId) {
  const hasKV =
    env?.RV_KV &&
    typeof env.RV_KV.get === "function" &&
    typeof env.RV_KV.put === "function";
  if (hasKV) return null;

  console.log(
    JSON.stringify({
      feature,
      traceId,
      kv: "none",
      upstreamStatus: null,
      durationMs: 0,
      error: "BINDING_MISSING"
    })
  );

  return makeResponse({
    ok: false,
    feature,
    traceId,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: "", status: null, snippet: "" },
    data: {},
    error: {
      code: "BINDING_MISSING",
      message: "RV_KV binding missing",
      details: {
        action:
          "Cloudflare Dashboard → Pages → Settings → Functions → KV bindings → RV_KV (Preview + Production)"
      }
    },
    status: 500
  });
}

export async function kvGetJson(context, key) {
  const env = context?.env || context;
  if (!env?.RV_KV) return { value: null, hit: false, ttlSecondsRemaining: null };
  const value = await env.RV_KV.get(key, "json");
  return {
    value,
    hit: value !== null,
    ttlSecondsRemaining: null
  };
}

export async function kvPutJson(context, key, value, ttlSeconds) {
  const env = context?.env || context;
  if (!env?.RV_KV) return;
  let expirationTtl = ttlSeconds;
  if (typeof ttlSeconds === "object" && ttlSeconds !== null) {
    expirationTtl = ttlSeconds.expirationTtlSeconds;
  }
  await env.RV_KV.put(key, JSON.stringify(value), {
    expirationTtl
  });
}

export function logServer({ feature, traceId, cacheLayer, kv, upstreamStatus, durationMs }) {
  const layer = cacheLayer || kv;
  const kvValue =
    layer === "kv" ? "kv" : layer === "none" ? "none" : layer === "hit" ? "kv" : "none";
  console.log(
    JSON.stringify({
      feature,
      traceId,
      kv: kvValue,
      upstreamStatus: upstreamStatus ?? null,
      durationMs: durationMs ?? 0
    })
  );
}

export function normalizeSymbolsParam(symbols, options = {}) {
  const { feature = "unknown", traceId = "unknown", ttl = 0 } = options;
  const raw = typeof symbols === "string" ? symbols : "";
  const parts = raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const invalid = [];
  const valid = [];
  parts.forEach((symbol) => {
    if (/^[A-Z0-9.-]+$/.test(symbol)) {
      valid.push(symbol);
    } else {
      invalid.push(symbol);
    }
  });
  const deduped = Array.from(new Set(valid));
  deduped.sort();
  const truncated = deduped.length > 20;
  const limited = deduped.slice(0, 20);
  const ok = Boolean(limited.length) && !invalid.length && !truncated;
  const errorResponse = ok
    ? null
    : makeResponse({
        ok: false,
        feature,
        traceId,
        cache: { hit: false, ttl, layer: "none" },
        upstream: { url: "", status: null, snippet: "" },
        data: {},
        error: {
          code: "BAD_REQUEST",
          message: "symbols parameter invalid",
          details: { invalid, truncated }
        },
        status: 400
      });
  return {
    symbols: limited,
    invalid,
    truncated,
    ok,
    errorResponse
  };
}

export function isFresh(updatedAt, ttlSeconds) {
  if (!updatedAt || !ttlSeconds) return false;
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) / 1000 <= ttlSeconds;
}

export function normalizeFreshness(ageSeconds) {
  if (typeof ageSeconds !== "number") return "unknown";
  if (ageSeconds <= 0) return "fresh";
  if (ageSeconds <= 3600) return "recent";
  if (ageSeconds <= 86400) return "stale";
  return "stale";
}

function extractUpdatedAt(value) {
  const candidate =
    value?.updatedAt ||
    value?.ts ||
    value?.data?.updatedAt ||
    value?.data?.ts ||
    value?.data?.updated_at ||
    value?.data?.updated ||
    null;
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export async function swrGetOrRefresh(
  context,
  { key, ttlSeconds, staleMaxSeconds, fetcher, featureName }
) {
  const env = context?.env || context;
  const cached = await kvGetJson(env, key);
  if (cached?.hit && cached.value) {
    const updatedAt = extractUpdatedAt(cached.value);
    const ageSeconds = updatedAt ? Math.max(0, (Date.now() - Date.parse(updatedAt)) / 1000) : null;
    const fresh = updatedAt ? isFresh(updatedAt, ttlSeconds) : false;
    const withinStale =
      typeof ageSeconds === "number" && typeof staleMaxSeconds === "number"
        ? ageSeconds <= staleMaxSeconds
        : false;
    if (fresh) {
      return {
        value: cached.value,
        cacheStatus: "HIT",
        isStale: false,
        ageSeconds
      };
    }

    if (withinStale) {
      if (typeof context?.waitUntil === "function" && typeof fetcher === "function") {
        context.waitUntil(
          (async () => {
            try {
              const refreshed = await fetcher();
              if (refreshed?.ok) {
                await kvPutJson(env, key, refreshed.data, ttlSeconds);
              }
            } catch (error) {
              console.warn("[swrGetOrRefresh] refresh_failed", {
                feature: featureName || key,
                message: error?.message || "Failed"
              });
            }
          })()
        );
      }
      return {
        value: cached.value,
        cacheStatus: "STALE",
        isStale: true,
        ageSeconds
      };
    }
  }

  if (typeof fetcher === "function") {
    const freshValue = await fetcher();
    if (freshValue?.ok) {
      await kvPutJson(env, key, freshValue.data, ttlSeconds);
      return {
        value: freshValue.data,
        cacheStatus: "MISS",
        isStale: false,
        ageSeconds: 0
      };
    }
    return {
      value: freshValue?.data || null,
      cacheStatus: "ERROR",
      isStale: false,
      ageSeconds: null,
      error: freshValue?.error || null
    };
  }

  return { value: null, cacheStatus: "ERROR", isStale: false, ageSeconds: null };
}

export async function safeFetch(url, options = {}) {
  const { timeoutMs = 6000, headers = {}, userAgent } = options;
  const finalHeaders = {
    Accept: "*/*",
    ...headers,
    ...(userAgent ? { "User-Agent": userAgent } : {})
  };
  return fetchTextWithTimeout(url, { headers: finalHeaders }, timeoutMs);
}

export function isHtmlLike(text) {
  if (!text) return false;
  const trimmed = String(text).trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

export async function safeFetchText(url, options = {}) {
  const response = await safeFetch(url, options);
  return response;
}

export async function safeFetchJson(url, options = {}) {
  const response = await safeFetch(url, options);
  if (isHtmlLike(response.text)) {
    return {
      ok: false,
      status: response.status,
      json: null,
      error: "HTML_RESPONSE",
      snippet: safeSnippet(response.text)
    };
  }
  try {
    const json = parseJsonLenient(response.text || "", url);
    return { ok: response.ok, status: response.status, json, error: "", snippet: "" };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      json: null,
      error: error?.code || "SCHEMA_INVALID",
      snippet: safeSnippet(response.text)
    };
  }
}

export function parseRssAtom(xmlString, { sourceLabel } = {}) {
  if (!xmlString || isHtmlLike(xmlString)) return [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (error) {
    return [];
  }
  let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
  if (!Array.isArray(items)) items = [items];
  return items
    .map((item) => {
      const title = item?.title?.text || item?.title || "";
      const link = item?.link?.href || item?.link || item?.guid?.text || item?.guid || "";
      const publishedRaw = item?.pubDate || item?.updated || item?.published || "";
      const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : "";
      return {
        title: String(title || "").trim(),
        link: String(link || "").trim(),
        publishedAtISO: publishedAt,
        source: sourceLabel || ""
      };
    })
    .filter((item) => item.title && item.link);
}

function normalizeKey(item) {
  const title = String(item?.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let domain = "";
  try {
    domain = new URL(item?.link || "").hostname.replace(/^www\./, "");
  } catch (error) {
    domain = "";
  }
  return `${title}:${domain}`;
}

export function mergeAndDedupeItems(listOfItemArrays) {
  const items = listOfItemArrays.flat().filter(Boolean);
  const map = new Map();
  items.forEach((item) => {
    const key = normalizeKey(item);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.publishedAtISO || 0) - new Date(a.publishedAtISO || 0)
  );
}

export function buildMarketauxParams() {
  const publishedAfter = new Date(Date.now() - 48 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams();
  params.set("published_after", publishedAfter);
  return params;
}

export function computeReturnsFromDailyCloses(closes = []) {
  const cleaned = closes.filter((value) => typeof value === "number");
  if (cleaned.length < 2) {
    return { r1d: null, r1w: null, r1m: null, r1y: null };
  }
  const lastIndex = cleaned.length - 1;
  const current = cleaned[lastIndex];
  const pick = (offset) => (lastIndex - offset >= 0 ? cleaned[lastIndex - offset] : null);
  const calc = (past) => (past ? ((current / past - 1) * 100) : null);
  return {
    r1d: calc(pick(1)),
    r1w: calc(pick(5)),
    r1m: calc(pick(21)),
    r1y: calc(pick(252))
  };
}

// Legacy helpers preserved for add-only compatibility.
export function jsonResponseLegacy(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

export function makeResponseLegacy({
  ok,
  feature,
  traceId,
  cache = cacheFallback(),
  upstream = {},
  rateLimit = rateLimitFallback(),
  data = {},
  error = {},
  isStale = false,
  status = 200,
  headers = {}
} = {}) {
  const payload = makeJson({
    ok,
    feature,
    traceId,
    cache,
    upstream,
    rateLimit,
    data,
    error,
    isStale
  });
  return jsonResponseLegacy(payload, status, headers);
}

export async function kvGetJsonLegacy(env, key) {
  return kvGetJson(env, key);
}

export async function kvPutJsonLegacy(env, key, value, ttlSeconds) {
  return kvPutJson(env, key, value, ttlSeconds);
}
