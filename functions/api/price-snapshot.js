import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet,
  withCoinGeckoKey
} from "./_shared.js";
import { checkAndIncrementProviderBudget } from "../_shared/provider_budget.js";

const FEATURE_ID = "price-snapshot";
const KV_TTL = 180;
const UPSTREAM_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true";

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function buildFallbackData() {
  const now = new Date().toISOString();
  // Fallback data shape must match normal 'data' payload.
  // Keep it minimal but valid so UI/contract never breaks.
  if ("price" === "price") {
    return {
      updatedAt: now,
      source: "coingecko",
      assets: [
        { symbol: "BTC", label: "Bitcoin", price: null, changePercent: null, ts: now, source: "coingecko" },
        { symbol: "ETH", label: "Ethereum", price: null, changePercent: null, ts: now, source: "coingecko" },
        { symbol: "SOL", label: "Solana", price: null, changePercent: null, ts: now, source: "coingecko" },
        { symbol: "XRP", label: "XRP", price: null, changePercent: null, ts: now, source: "coingecko" }
      ]
    };
  }
  return {
    updatedAt: now,
    source: "coingecko",
    assets: [
      { symbol: "BTC", label: "Bitcoin", price: null, changePercent: null, ts: now, source: "coingecko" },
      { symbol: "ETH", label: "Ethereum", price: null, changePercent: null, ts: now, source: "coingecko" }
    ]
  };
}

function normalize(payload) {
  const assets = [
    { key: "bitcoin", label: "Bitcoin", symbol: "BTC" },
    { key: "ethereum", label: "Ethereum", symbol: "ETH" },
    { key: "solana", label: "Solana", symbol: "SOL" },
    { key: "ripple", label: "XRP", symbol: "XRP" }
  ].map((asset) => {
    const data = payload[asset.key] || {};
    return {
      symbol: asset.symbol,
      label: asset.label,
      price: data.usd ?? null,
      changePercent: data.usd_24h_change ?? null,
      ts: new Date().toISOString(),
      source: "coingecko"
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    source: "coingecko",
    assets
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) {
    return bindingResponse;
  }

  const cacheKey = `${FEATURE_ID}:v1`;

  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
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
  }

  const budgetMax = Number(env?.RV_BUDGET_COINGECKO_PER_DAY || 0) || 0;
  const budget = await checkAndIncrementProviderBudget(env, "coingecko", budgetMax);
  if (budget.limited) {
    const cached = !panic ? await kvGetJson(env, cacheKey) : null;
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: cached?.hit && cached.value?.data ? cached.value.data : buildFallbackData(),
      cache: cached?.hit ? { hit: true, ttl: KV_TTL, layer: "kv" } : { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: null, snippet: "" },
      error: { code: "COVERAGE_LIMIT", message: "Provider budget exceeded", details: budget },
      meta: { status: "PARTIAL", reason: "COVERAGE_LIMIT", budget },
      isStale: true
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: cached?.hit ? "kv" : "none",
      upstreamStatus: 429,
      durationMs: Date.now() - started,
      errorCode: "COVERAGE_LIMIT"
    });
    return response;
  }

  let upstreamStatus = null;
  let upstreamSnippet = "";

  try {
    const res = await fetch(withCoinGeckoKey(UPSTREAM_URL, env));
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
          upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet },
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
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: buildFallbackData(),
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet },
        error: { code: errorCode, message: `Upstream ${res.status}`, details: {} },
        isStale: true
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
      json = text ? JSON.parse(text) : {};
    } catch (error) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: buildFallbackData(),
        isStale: true,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet },
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

    const dataPayload = normalize(json);
    const kvPayload = {
      ts: new Date().toISOString(),
      source: dataPayload.source,
      schemaVersion: 1,
      data: dataPayload
    };

    if (!panic) {
      await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
    }

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: dataPayload,
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet }
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
      meta: { status: "NO_DATA", reason: "UPSTREAM_ERROR" },
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: upstreamStatus, snippet: upstreamSnippet },
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
