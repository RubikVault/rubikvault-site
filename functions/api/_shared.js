import { XMLParser } from "fast-xml-parser";
import { Diag, EMPTY_REASONS, STATUS_CODES, sanitizeAny as sanitizeDiagAny } from "./_diag.js";
import { parseJsonLenient, fetchTextWithTimeout } from "./_shared/parse.js";
import { BLOCK_REGISTRY } from "../../features/blocks-registry.js";

const SCHEMA_VERSION = 1;

export function getKv(env) {
  if (env?.RV_KV) return env.RV_KV;
  return null;
}

export function isPreviewHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  return (
    host.endsWith(".pages.dev") ||
    host.startsWith("preview.") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0"
  );
}

function inferStatus(meta = {}, diag, error) {
  if (meta.status) return meta.status;
  if (error) return STATUS_CODES.ERROR;
  const reason = meta.emptyReason || diag?.emptyReason;
  if (reason === EMPTY_REASONS.MISSING_ENV) return STATUS_CODES.LOCKED;
  if (reason === EMPTY_REASONS.STALE) return STATUS_CODES.STALE_OK;
  if (reason) return STATUS_CODES.PARTIAL;
  return STATUS_CODES.OK;
}

export function parseDebug(request, env) {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  const token =
    url.searchParams.get("token") || request.headers.get("x-rv-debug-token") || "";
  const deepAllowed = Boolean(debug && token && env?.RV_DEBUG_TOKEN && token === env.RV_DEBUG_TOKEN);
  const mode = debug ? (deepAllowed ? "deep" : "basic") : "off";
  const info = { debug, mode, deepAllowed, token };
  if (request && typeof request === "object") {
    request.__debugInfo = info;
  }
  return info;
}

export function createResponse({
  feature = "unknown",
  data,
  meta,
  diag,
  error,
  request,
  status
} = {}) {
  const now = new Date().toISOString();
  const resolvedMeta = meta && typeof meta === "object" ? { ...meta } : {};
  const diagEmpty = diag?.emptyReason ?? resolvedMeta.emptyReason ?? null;
  if (diagEmpty !== undefined && resolvedMeta.emptyReason === undefined) {
    resolvedMeta.emptyReason = diagEmpty;
  }
  const traceId =
    resolvedMeta.traceId ||
    request?.headers?.get("x-rv-trace-id") ||
    request?.headers?.get("x-rv-trace") ||
    createTraceId(request || { url: "http://local" });
  resolvedMeta.generatedAt = resolvedMeta.generatedAt || now;
  resolvedMeta.ts = resolvedMeta.ts || now;
  resolvedMeta.schemaVersion = resolvedMeta.schemaVersion || SCHEMA_VERSION;
  resolvedMeta.traceId = traceId;
  resolvedMeta.writeMode = resolvedMeta.writeMode || "NONE";
  resolvedMeta.circuitOpen = Boolean(resolvedMeta.circuitOpen);
  resolvedMeta.source = resolvedMeta.source ?? null;
  resolvedMeta.warnings = Array.isArray(resolvedMeta.warnings)
    ? resolvedMeta.warnings
    : resolvedMeta.warnings
      ? [String(resolvedMeta.warnings)]
      : [];
  resolvedMeta.emptyReason = resolvedMeta.emptyReason ?? null;
  resolvedMeta.ageMinutes = resolvedMeta.ageMinutes ?? null;
  resolvedMeta.savedAt = resolvedMeta.savedAt ?? null;
  resolvedMeta.reason =
    resolvedMeta.reason !== undefined
      ? resolvedMeta.reason
      : diag?.emptyReason || (error ? error.code || "ERROR" : "") || "";
  resolvedMeta.reason =
    typeof resolvedMeta.reason === "string"
      ? resolvedMeta.reason
      : resolvedMeta.reason == null
        ? ""
        : String(resolvedMeta.reason);
  resolvedMeta.status = inferStatus(resolvedMeta, diag, error);
  const resolvedData = data === undefined ? null : data;
  const hasError = Boolean(error);
  const payload = {
    ok: !hasError,
    feature,
    meta: resolvedMeta || {},
    data: resolvedData,
    error: hasError
      ? {
          code: error.code || "ERROR",
          message: error.message || "",
          details: error.details || {}
        }
      : null
  };

  const debugInfo = request && request.__debugInfo ? request.__debugInfo : null;
  if (debugInfo?.debug) {
    payload.debug = {
      mode: debugInfo.mode,
      diag: diag ? diag.serialize(debugInfo.mode) : new Diag().serialize(debugInfo.mode)
    };
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("x-rv-from", "createResponse");
  headers.set("Access-Control-Allow-Origin", "*");
  if (debugInfo?.debug) {
    headers.set("Cache-Control", "no-store");
  } else {
    headers.set("Cache-Control", "public, max-age=60");
  }

  return new Response(JSON.stringify(sanitizeDiagAny(payload)), {
    status: typeof status === "number" ? status : hasError ? 503 : 200,
    headers
  });
}

export async function safeKvGet(env, key, type = "json", diag) {
  const kv = getKv(env);
  if (!kv) {
    if (diag) diag.issue("KV_MISSING", { keyHint: String(key || "").slice(0, 4) });
    return null;
  }
  if (diag) diag.incrementKv("reads");
  try {
    const value = await kv.get(key, type === "json" ? "json" : type);
    return value;
  } catch (error) {
    if (diag) diag.issue("KV_READ_ERROR", { message: error?.message || "KV get failed" });
    return null;
  }
}

export async function safeKvPut(env, key, value, diag, options = {}) {
  const kv = getKv(env);
  const { allowWrite = false, disableOnDebug = false, debugInfo } = options;
  if (!kv) {
    if (diag) diag.issue("KV_MISSING", { keyHint: String(key || "").slice(0, 4) });
    return null;
  }
  if (!allowWrite) {
    if (diag) diag.issue("KV_WRITE_BLOCKED", { keyHint: String(key || "").slice(0, 4) });
    return null;
  }
  if (disableOnDebug && debugInfo?.debug) {
    if (diag) diag.issue("KV_WRITE_SKIPPED_DEBUG", { keyHint: String(key || "").slice(0, 4) });
    return null;
  }
  if (diag) diag.incrementKv("writes");
  try {
    await kv.put(key, typeof value === "string" ? value : JSON.stringify(value));
    return true;
  } catch (error) {
    if (diag) diag.issue("KV_WRITE_ERROR", { message: error?.message || "KV put failed" });
    return false;
  }
}

export async function safeKvList(env, prefix, diag) {
  const kv = getKv(env);
  if (!kv) {
    if (diag) diag.issue("KV_MISSING", { keyHint: String(prefix || "").slice(0, 4) });
    return [];
  }
  if (diag) diag.incrementKv("list");
  try {
    const list = [];
    const iter = await kv.list({ prefix });
    for await (const key of iter.keys || []) {
      list.push(key);
    }
    return list;
  } catch (error) {
    if (diag) diag.issue("KV_LIST_ERROR", { message: error?.message || "KV list failed" });
    return [];
  }
}

export { sanitizeDiagAny as sanitizeAny };

function resolveExpectations(feature) {
  if (!feature || !BLOCK_REGISTRY) return null;
  const byFeature =
    BLOCK_REGISTRY[feature] || BLOCK_REGISTRY[`rv-${feature}`] || BLOCK_REGISTRY[`${feature}`];
  if (!byFeature) return null;
  const freshness = byFeature.freshness || {};
  const freshnessMaxAgeMinutes =
    byFeature.blockType === "LIVE"
      ? freshness.liveMaxMinutes ?? 20
      : Math.round((freshness.okMaxHoursWeekday ?? 24) * 60);
  return {
    blockType: byFeature.blockType || "EVENT",
    expectedMinItems: Number.isFinite(byFeature.expectedMinItems) ? byFeature.expectedMinItems : 0,
    freshnessMaxAgeMinutes
  };
}

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
  requestId,
  runId,
  parentTraceId,
  trace,
  ts,
  data = {},
  cache = {},
  upstream = {},
  rateLimit = rateLimitFallback(),
  error = {},
  meta = {},
  expectations,
  isStale = false,
  source,
  freshness,
  cacheStatus,
  sourceMap
} = {}) {
  const resolvedOk = ok !== undefined ? Boolean(ok) : false;
  const resolvedTrace = {
    traceId: trace?.traceId || traceId || "unknown",
    requestId: trace?.requestId || requestId || "",
    runId: trace?.runId || runId || "",
    parentTraceId: trace?.parentTraceId || parentTraceId || ""
  };
  const resolvedExpectations = expectations || resolveExpectations(feature);
  const metaInput = meta && typeof meta === "object" ? { ...meta } : {};
  const metaWarnings = Array.isArray(metaInput?.warnings) ? metaInput.warnings : [];
  const metaStatus = metaInput?.status || (isStale ? "STALE" : resolvedOk ? "LIVE" : "ERROR");
  const metaReason =
    metaInput?.reason !== undefined
      ? metaInput.reason
      : isStale
        ? "STALE"
        : resolvedOk
          ? ""
          : error?.code || "ERROR";
  const resolvedMeta = {
    ...metaInput,
    status: metaStatus,
    reason:
      typeof metaReason === "string"
        ? metaReason
        : metaReason == null
          ? ""
          : String(metaReason),
    ts: metaInput?.ts || ts || new Date().toISOString(),
    schemaVersion: metaInput?.schemaVersion || SCHEMA_VERSION,
    traceId: metaInput?.traceId || resolvedTrace.traceId,
    writeMode: metaInput?.writeMode || "NONE",
    circuitOpen: Boolean(metaInput?.circuitOpen),
    warnings: metaWarnings,
    savedAt: metaInput?.savedAt ?? null,
    ageMinutes: metaInput?.ageMinutes ?? null
  };
  return {
    ok: resolvedOk,
    feature: feature || "unknown",
    ts: ts || new Date().toISOString(),
    traceId: traceId || "unknown",
    trace: resolvedTrace,
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
    error: resolvedOk
      ? null
      : {
          code: error?.code || "ERROR",
          message: error?.message || "",
          details: error?.details || {},
          ...(error?.hint !== undefined ? { hint: error.hint } : {})
        },
    meta: resolvedMeta,
    ...(isStale ? { isStale: true } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
    ...(cacheStatus ? { cacheStatus } : {}),
    ...(sourceMap ? { sourceMap } : {}),
    ...(resolvedExpectations ? { expectations: resolvedExpectations } : {})
  };
}

export function buildPayload(args = {}) {
  return makeJson(args);
}

export function makeResponse({
  ok,
  feature,
  traceId,
  requestId,
  runId,
  parentTraceId,
  trace,
  ts,
  data,
  cache,
  upstream,
  rateLimit,
  error,
  meta,
  expectations,
  isStale,
  status,
  headers = {},
  source,
  freshness,
  cacheStatus,
  sourceMap
} = {}) {
  const resolvedStatus = typeof status === "number" ? status : ok === false ? 503 : 200;
  const payload = makeJson({
    ok,
    feature,
    traceId,
    requestId,
    runId,
    parentTraceId,
    trace,
    ts,
    data,
    cache,
    upstream,
    rateLimit,
    error,
    meta,
    expectations,
    isStale,
    source,
    freshness,
    cacheStatus,
    sourceMap
  });
  return jsonResponse(payload, { status: resolvedStatus, cacheStatus }, headers);
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
  const responseHeaders = new Headers(headers || {});
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("X-Cache", resolvedCache);
  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }
  return new Response(JSON.stringify(payload), {
    status: resolvedStatus,
    headers: responseHeaders
  });
}

export function assertBindings(env, feature, traceId, opts = {}) {
  const kvMode = (opts && opts.kv) ? String(opts.kv) : "required";
  const hasKV = Boolean(
    env?.RV_KV &&
      typeof env.RV_KV.get === "function" &&
      typeof env.RV_KV.put === "function"
  );

  // Optional mode: do not hard-fail the request when KV is missing.
  if (kvMode === "optional") {
    return { hasKV, kvMode, bindingResponse: null };
  }

  // Required mode: preserve previous behavior (hard fail).
  if (!hasKV) {
    const payload = {
      ok: false,
      feature,
      ts: new Date().toISOString(),
      traceId,
      schemaVersion: 1,
      data: null,
      error: {
        code: "BINDING_MISSING",
        message: "RV_KV binding missing",
        details: {
          hint: "Cloudflare Dashboard → Pages → Settings → Functions → KV bindings → RV_KV (Preview + Production)"
        }
      },
      meta: {
        status: "FAIL",
        reason: "BINDING_MISSING"
      }
    };
    return { hasKV, kvMode, bindingResponse: jsonResponse(payload, 500) };
  }

  return { hasKV, kvMode, bindingResponse: null };
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

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

async function computeKvEtag(value) {
  const text = stableStringify(value);
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function resolveEtagKey(rawKey) {
  const key = String(rawKey || "");
  if (key.startsWith("lastgood:")) {
    const feature = key.slice("lastgood:".length).split(":")[0] || "unknown";
    return `etag:${feature}`;
  }
  if (key.startsWith("rv:lastgood:")) {
    const feature = key.slice("rv:lastgood:".length).split(":")[0] || "unknown";
    return `etag:${feature}`;
  }
  const lastGoodIdx = key.indexOf(":last_good");
  if (lastGoodIdx > 0) {
    const feature = key.slice(0, lastGoodIdx) || "unknown";
    return `etag:${feature}`;
  }
  return null;
}

export async function kvPutJson(context, key, value, ttlSeconds) {
  const env = context?.env || context;
  if (!env?.RV_ALLOW_WRITE_ON_VIEW && !env?.__RV_ALLOW_WRITE__) return;
  if (!env?.RV_KV) return;
  let expirationTtl = ttlSeconds;
  if (typeof ttlSeconds === "object" && ttlSeconds !== null) {
    expirationTtl = ttlSeconds.expirationTtlSeconds;
  }
  const etagKey = resolveEtagKey(key);
  if (etagKey) {
    try {
      const nextEtag = await computeKvEtag(value);
      const prevEtag = await env.RV_KV.get(etagKey);
      if (prevEtag && prevEtag === nextEtag) return;
      await env.RV_KV.put(etagKey, nextEtag, { expirationTtl });
    } catch (error) {
      // ignore etag throttling failures
    }
  }
  await env.RV_KV.put(key, JSON.stringify(value), {
    expirationTtl
  });
}

export function logServer({
  feature,
  traceId,
  requestId,
  cacheLayer,
  kv,
  upstream,
  upstreamStatus,
  durationMs,
  httpStatus,
  dataQuality,
  errorCode
}) {
  const layer = cacheLayer || kv;
  const kvValue =
    layer === "kv" ? "kv" : layer === "none" ? "none" : layer === "hit" ? "kv" : "none";
  const upstreamValue = upstream || { status: upstreamStatus ?? null };
  const quality =
    typeof dataQuality === "string" ? dataQuality : dataQuality?.status || dataQuality?.reason || "";
  console.log(
    JSON.stringify({
      feature: feature || "unknown",
      traceId: traceId || "unknown",
      requestId: requestId || "",
      cacheLayer: layer || "none",
      upstream: upstreamValue,
      upstreamStatus: upstreamValue?.status ?? upstreamStatus ?? null,
      durationMs: durationMs ?? 0,
      httpStatus: httpStatus ?? null,
      dataQuality: quality || "",
      errorCode: errorCode || "",
      kv: kvValue
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

// NEW: harden fetcher() so thrown errors never become 500s.
function normalizeFetcherResult(result, err) {
  if (result && typeof result === "object") return result;
  const msg = err ? String(err?.message || err) : "Fetcher returned invalid value";
  return {
    ok: false,
    data: null,
    error: {
      code: "SCHEMA_INVALID",
      message: msg,
      details: { thrown: Boolean(err), name: err?.name || null }
    }
  };
}

async function runFetcherSafely(fetcher, featureName, key) {
  if (typeof fetcher !== "function") {
    return {
      ok: false,
      data: null,
      error: {
        code: "SCHEMA_INVALID",
        message: "Fetcher missing",
        details: { feature: featureName || key }
      }
    };
  }
  try {
    const res = await fetcher();
    return normalizeFetcherResult(res, null);
  } catch (err) {
    console.warn("[swrGetOrRefresh] fetcher_threw", {
      feature: featureName || key,
      message: err?.message || String(err || "Fetcher threw")
    });
    return normalizeFetcherResult(null, err);
  }
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
      // background refresh: never throw, never disturb the response body pipeline
      if (typeof context?.waitUntil === "function") {
        context.waitUntil(
          (async () => {
            const refreshed = await runFetcherSafely(fetcher, featureName, key);
            if (refreshed?.ok) {
              await kvPutJson(env, key, refreshed.data, ttlSeconds);
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

  // MISS or too-old stale: do a foreground fetch, but never throw.
  const freshValue = await runFetcherSafely(fetcher, featureName, key);

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
