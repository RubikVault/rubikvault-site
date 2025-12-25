import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  normalizeSymbolsParam,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "quotes";
const KV_TTL = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const rateStore = new Map();

function parseChangePercent(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[%()]/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function getRateState(key) {
  const now = Date.now();
  const entry = rateStore.get(key) || [];
  const fresh = entry.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    rateStore.set(key, fresh);
    const resetMs = RATE_WINDOW_MS - (now - fresh[0]);
    return { limited: true, remaining: 0, resetMs };
  }
  fresh.push(now);
  rateStore.set(key, fresh);
  const resetMs = RATE_WINDOW_MS - (now - fresh[0]);
  return { limited: false, remaining: Math.max(0, RATE_MAX - fresh.length), resetMs };
}

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function normalize(payload, requestedSymbols) {
  const list = Array.isArray(payload) ? payload : [];
  const lookup = new Map(list.map((item) => [String(item.symbol || "").toUpperCase(), item]));
  const now = new Date().toISOString();
  const quotes = requestedSymbols.map((symbol) => {
    const entry = lookup.get(symbol);
    return {
      symbol,
      price: entry?.price ?? null,
      changePercent: parseChangePercent(entry?.changesPercentage),
      ts: now,
      source: "financialmodelingprep"
    };
  });

  return {
    updatedAt: now,
    source: "financialmodelingprep",
    quotes
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    return bindingResponse;
  }

  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") || url.searchParams.get("tickers") || "";
  const { symbols, errorResponse } = normalizeSymbolsParam(symbolsParam, {
    feature: FEATURE_ID,
    traceId,
    ttl: 0
  });
  if (errorResponse) {
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return errorResponse;
  }

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    const resetAt = new Date(Date.now() + rateState.resetMs).toISOString();
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: 429, snippet: "" },
      rateLimit: {
        remaining: "0",
        reset: resetAt,
        estimated: true
      },
      error: {
        code: "RATE_LIMITED",
        message: "Server rate limit",
        details: { retryAfterSeconds: Math.ceil(rateState.resetMs / 1000) }
      },
      status: 429
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 429,
      durationMs: Date.now() - started
    });
    return response;
  }

  const apiKey = env.FMP_API_KEY || env.EARNINGS_API_KEY;
  if (!apiKey) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "Quotes provider key missing",
        details: { missing: ["FMP_API_KEY", "EARNINGS_API_KEY"] }
      },
      status: 500
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

  const cacheKey = `quotes:${symbols.join(",")}`;

  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: "", status: null, snippet: "" }
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
  }

  const upstreamUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols.join(",")}?apikey=${apiKey}`;
  let upstreamStatus = null;
  let upstreamSnippet = "";

  try {
    const res = await fetch(upstreamUrl);
    upstreamStatus = res.status;
    const text = await res.text();
    upstreamSnippet = safeSnippet(text);

    if (!res.ok) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const errorCode = mapUpstreamCode(res.status);

      if (cached?.hit && cached.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.value.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
          error: { code: errorCode, message: `Upstream ${res.status}`, details: {} },
          isStale: true
        });
        logServer({
          feature: FEATURE_ID,
          traceId,
          cacheLayer: "kv",
          upstreamStatus: res.status,
          durationMs: Date.now() - started
        });
        return response;
      }

      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
        error: { code: errorCode, message: `Upstream ${res.status}`, details: {} },
        status: res.status === 429 ? 429 : 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return response;
    }

    let json;
    try {
      json = text ? JSON.parse(text) : [];
    } catch (error) {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
        error: { code: "SCHEMA_INVALID", message: "Invalid JSON", details: {} },
        status: 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return response;
    }

    const data = normalize(json, symbols);
    const kvPayload = {
      ts: new Date().toISOString(),
      source: data.source,
      schemaVersion: 1,
      data
    };

    if (!panic) {
      await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
    }

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data,
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: res.status,
      durationMs: Date.now() - started
    });
    return response;
  } catch (error) {
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
      error: { code: errorCode, message: error?.message || "Request failed", details: {} }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - started
    });
    return response;
  }
}
