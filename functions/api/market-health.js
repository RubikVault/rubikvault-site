import {
  createTraceId,
  logServer,
  makeResponse,
  safeSnippet,
  withCoinGeckoKey
} from "./_shared.js";
import { fetchJsonWithFallbacks } from "./_shared/parse.js";
import { kvGetJson, kvPutJson } from "../_lib/kv-safe.js";
import { shouldSkipUpstream, recordUpstreamResult } from "./_circuit.js";

const FEATURE_ID = "market-health";
const KV_TTL = 420;
const FNG_URL = "https://api.alternative.me/fng/?limit=1&format=json";
const FNG_STOCKS_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const CRYPTO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true";
const YAHOO_SYMBOLS = [
  { symbol: "^DJI", label: "Dow Jones", type: "index" },
  { symbol: "^GSPC", label: "S&P 500", type: "index" },
  { symbol: "^IXIC", label: "Nasdaq", type: "index" },
  { symbol: "^RUT", label: "Russell 2000", type: "index" },
  { symbol: "GC=F", label: "Gold", type: "commodity" },
  { symbol: "SI=F", label: "Silver", type: "commodity" },
  { symbol: "CL=F", label: "Oil (WTI)", type: "commodity" }
];
const YAHOO_URL = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
  YAHOO_SYMBOLS.map((entry) => entry.symbol).join(",")
)}`;
const UPSTREAM_URL = `${FNG_URL} | ${FNG_STOCKS_URL} | ${CRYPTO_URL} | ${YAHOO_URL}`;

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function normalizeFng(payload) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!item) return null;
  const value = Number(item.value);
  const timestamp = Number(item.timestamp);
  return {
    value: Number.isFinite(value) ? value : null,
    valueClassification: item.value_classification || item.valueClassification || null,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now()
  };
}

function normalizeFngStocks(payload) {
  const data = payload?.fear_and_greed || payload?.fearAndGreed || payload || {};
  const valueRaw = data.score ?? data.value ?? data?.now?.value ?? null;
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : null;
  const label = data.rating || data.value_classification || data.classification || data.text || null;
  if (value === null && !label) return null;
  const timestampRaw = data.timestamp || data.lastUpdated || data.last_updated || null;
  const timestamp = Number.isFinite(Number(timestampRaw)) ? Number(timestampRaw) : Date.now();
  return {
    value,
    valueClassification: label,
    timestamp
  };
}

function normalizeCrypto(payload) {
  const assets = [
    { key: "bitcoin", label: "Bitcoin", symbol: "BTC" },
    { key: "ethereum", label: "Ethereum", symbol: "ETH" },
    { key: "solana", label: "Solana", symbol: "SOL" },
    { key: "ripple", label: "XRP", symbol: "XRP" }
  ];
  return assets.map((asset) => {
    const data = payload?.[asset.key] || {};
    return {
      symbol: asset.symbol,
      label: asset.label,
      price: data.usd ?? null,
      changePercent: data.usd_24h_change ?? null,
      ts: new Date().toISOString(),
      source: "coingecko"
    };
  });
}

function normalizeYahoo(payload) {
  const results = payload?.quoteResponse?.result || [];
  const map = new Map(results.map((quote) => [quote.symbol, quote]));
  const indices = [];
  const commodities = [];
  YAHOO_SYMBOLS.forEach((entry) => {
    const quote = map.get(entry.symbol) || {};
    const item = {
      symbol: entry.symbol,
      label: entry.label,
      price: quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      ts: new Date().toISOString(),
      source: "yahoo"
    };
    if (entry.type === "index") {
      indices.push(item);
    } else {
      commodities.push(item);
    }
  });
  return { indices, commodities };
}

function normalize(fngPayload, stocksPayload, cryptoPayload, yahooPayload) {
  const fngCrypto = normalizeFng(fngPayload);
  const fngStocks = normalizeFngStocks(stocksPayload);
  const crypto = normalizeCrypto(cryptoPayload);
  const yahoo = normalizeYahoo(yahooPayload);
  const btcEntry = crypto.find((entry) => entry.symbol === "BTC");

  return {
    updatedAt: new Date().toISOString(),
    source: "alternative.me, cnn, coingecko, yahoo",
    fng: fngCrypto,
    fngStocks,
    btc: btcEntry
      ? {
          usd: btcEntry.price ?? null,
          usd_24h_change: btcEntry.changePercent ?? null
        }
      : { usd: null, usd_24h_change: null },
    crypto,
    indices: yahoo.indices,
    commodities: yahoo.commodities
  };
}

function mergeLastGood(current, lastGood) {
  if (!lastGood) return current;
  return {
    ...current,
    fng: current.fng || lastGood.fng,
    fngStocks: current.fngStocks || lastGood.fngStocks,
    btc: current.btc?.usd ? current.btc : lastGood.btc,
    crypto: current.crypto?.length ? current.crypto : lastGood.crypto || [],
    indices: current.indices?.length ? current.indices : lastGood.indices || [],
    commodities: current.commodities?.length ? current.commodities : lastGood.commodities || []
  };
}

function minutesSince(ts) {
  const parsed = Date.parse(ts || "");
  if (!Number.isFinite(parsed)) return null;
  const diffMs = Date.now() - parsed;
  if (diffMs < 0) return 0;
  return Math.round(diffMs / 60000);
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const hasKV =
    env?.RV_KV && typeof env.RV_KV.get === "function" && typeof env.RV_KV.put === "function";
  if (!hasKV) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: null, snippet: "" },
      error: {
        code: "BINDING_MISSING",
        message: "RV_KV binding missing",
        details: {
          action:
            "Cloudflare Dashboard → Pages → Settings → Functions → KV bindings → RV_KV (Preview + Production)"
        }
      }
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

  const cacheKey = `${FEATURE_ID}:v1`;
  const lastOkKey = "market_health:last_ok";

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

  const circuit = await shouldSkipUpstream(FEATURE_ID, env, env.RV_KV, Date.now());
  if (circuit.skip) {
    const lastOk = await kvGetJson(env, lastOkKey);
    if (lastOk?.hit && lastOk.value?.data) {
      const delayMinutes = minutesSince(lastOk.value.ts);
      const dataPayload = {
        ...lastOk.value.data,
        asOf: lastOk.value.ts,
        dataQuality: { status: "STALE", reason: "STALE", missingFields: [] },
        mode: "STALE",
        delayMinutes,
        reasons: ["CIRCUIT_OPEN", lastOk.value?.data?.source ? "LAST_GOOD" : ""].filter(Boolean)
      };
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: dataPayload,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: UPSTREAM_URL, status: null, snippet: "" },
        error: {
          code: "UPSTREAM_5XX",
          message: "Upstream circuit open; serving last-good snapshot.",
          details: { circuitUntil: circuit.untilTs }
        },
        isStale: true
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

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: {
        updatedAt: new Date().toISOString(),
        source: "none",
        dataQuality: { status: "PARTIAL", reason: "NO_DATA", missingFields: [] },
        mode: "EMPTY",
        reasons: ["CIRCUIT_OPEN"]
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: null, snippet: "" },
      error: {
        code: "UPSTREAM_5XX",
        message: "Upstream circuit open; no last-good snapshot.",
        details: { circuitUntil: circuit.untilTs }
      },
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

  let upstreamSnippet = "";

  try {
    const fetchSafe = async (url, context) => {
      try {
        const result = await fetchJsonWithFallbacks([url], {}, context);
        return { ok: true, ...result };
      } catch (error) {
        return { ok: false, error };
      }
    };

    const [fngResult, stocksResult, cryptoResult, yahooResult] = await Promise.all([
      fetchSafe(FNG_URL, "market-health:fng"),
      fetchSafe(FNG_STOCKS_URL, "market-health:stocks"),
      fetchSafe(withCoinGeckoKey(CRYPTO_URL, env), "market-health:crypto"),
      fetchSafe(YAHOO_URL, "market-health:yahoo")
    ]);

    const errors = [];
    const sources = [
      { id: "fng", result: fngResult },
      { id: "stocks", result: stocksResult },
      { id: "crypto", result: cryptoResult },
      { id: "yahoo", result: yahooResult }
    ];

    sources.forEach(({ id, result }) => {
      if (!result.ok) {
        errors.push({ id, status: null, code: result.error?.code || "SCHEMA_INVALID" });
        if (!upstreamSnippet && result.error?.details?.head) {
          upstreamSnippet = safeSnippet(result.error.details.head);
        }
        return;
      }
      if (!result.upstreamOk) {
        errors.push({ id, status: result.upstreamStatus || null });
      }
    });

    let dataPayload = normalize(
      fngResult.json || {},
      stocksResult.json || {},
      cryptoResult.json || {},
      yahooResult.json || {}
    );
    if (!panic) {
      const lastOk = await kvGetJson(env, lastOkKey);
      if (lastOk?.hit && lastOk.value?.data) {
        dataPayload = mergeLastGood(dataPayload, lastOk.value.data);
      }
    }

    const hasAnyData =
      dataPayload.fng ||
      dataPayload.fngStocks ||
      (dataPayload.crypto || []).length ||
      (dataPayload.indices || []).length ||
      (dataPayload.commodities || []).length;

    if (!hasAnyData) {
      await recordUpstreamResult(FEATURE_ID, env, env.RV_KV, {
        ok: false,
        code: "UPSTREAM_5XX",
        status: errors[0]?.status ?? null
      });
      const lastOk = await kvGetJson(env, lastOkKey);
      if (lastOk?.hit && lastOk.value?.data) {
        const delayMinutes = minutesSince(lastOk.value.ts);
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: {
            ...lastOk.value.data,
            asOf: lastOk.value.ts,
            dataQuality: { status: "STALE", reason: "STALE", missingFields: [] },
            mode: "STALE",
            delayMinutes,
            reasons: ["FALLBACK_LAST_GOOD"]
          },
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: UPSTREAM_URL, status: null, snippet: upstreamSnippet },
          error: {
            code: "SCHEMA_INVALID",
            message: "Upstream parse failed",
            details: { errors }
          },
          isStale: true
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

      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: UPSTREAM_URL, status: null, snippet: upstreamSnippet },
        error: {
          code: "SCHEMA_INVALID",
          message: "Upstream parse failed",
          details: { errors }
        },
        status: 200,
        data: {
          updatedAt: new Date().toISOString(),
          source: "none",
          dataQuality: { status: "PARTIAL", reason: "NO_DATA", missingFields: [] },
          mode: "EMPTY",
          reasons: ["UPSTREAM_5XX"]
        }
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

    const kvPayload = {
      ts: new Date().toISOString(),
      source: dataPayload.source,
      schemaVersion: 1,
      data: dataPayload
    };

    if (!panic) {
      await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
      await kvPutJson(env, lastOkKey, kvPayload, 24 * 60 * 60);
    }

    await recordUpstreamResult(FEATURE_ID, env, env.RV_KV, {
      ok: true,
      code: "",
      status: 200
    });

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: dataPayload,
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: 200, snippet: upstreamSnippet },
      error: errors.length
        ? {
            code: mapUpstreamCode(errors[0]?.status || 502),
            message: "Some upstreams failed",
            details: { errors }
          }
        : {}
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 200,
      durationMs: Date.now() - started
    });
    return response;
  } catch (error) {
    await recordUpstreamResult(FEATURE_ID, env, env.RV_KV, {
      ok: false,
      code: error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX",
      status: error?.status ?? null
    });
    const lastOk = await kvGetJson(env, lastOkKey);
    if (lastOk?.hit && lastOk.value?.data) {
      const delayMinutes = minutesSince(lastOk.value.ts);
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: {
          ...lastOk.value.data,
          asOf: lastOk.value.ts,
          dataQuality: { status: "STALE", reason: "STALE", missingFields: [] },
          mode: "STALE",
          delayMinutes,
          reasons: ["FALLBACK_LAST_GOOD"]
        },
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: UPSTREAM_URL, status: null, snippet: upstreamSnippet },
        error: {
          code: error?.code || "SCHEMA_INVALID",
          message: "Upstream parse failed",
          details: error?.details || {}
        },
        isStale: true
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
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: {
        url: UPSTREAM_URL,
        status: null,
        snippet: upstreamSnippet
      },
      error: {
        code: error?.code || errorCode,
        message: error?.message || "Request failed",
        details: error?.details || {}
      },
      data: {
        updatedAt: new Date().toISOString(),
        source: "none",
        dataQuality: { status: "PARTIAL", reason: "NO_DATA", missingFields: [] },
        mode: "EMPTY",
        reasons: [error?.code || errorCode]
      }
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
}
