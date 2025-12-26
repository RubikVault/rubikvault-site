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
  return {
    value: Number(item.value),
    valueClassification: item.value_classification || item.valueClassification || null
  };
}

function normalizeFngStocks(payload) {
  const data = payload?.fear_and_greed || payload?.fearAndGreed || payload || {};
  const valueRaw = data.score ?? data.value ?? data?.now?.value ?? null;
  const value = Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : null;
  const label = data.rating || data.value_classification || data.classification || data.text || null;
  if (value === null && !label) return null;
  return {
    value,
    valueClassification: label
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

  let upstreamSnippet = "";

  try {
    const [fngRes, stocksRes, cryptoRes, yahooRes] = await Promise.all([
      fetch(FNG_URL),
      fetch(FNG_STOCKS_URL),
      fetch(withCoinGeckoKey(CRYPTO_URL, env)),
      fetch(YAHOO_URL)
    ]);

    const responses = [
      { id: "fng", res: fngRes },
      { id: "stocks", res: stocksRes },
      { id: "crypto", res: cryptoRes },
      { id: "yahoo", res: yahooRes }
    ];
    const texts = await Promise.all(responses.map((entry) => entry.res.text()));
    const errors = [];
    responses.forEach((entry, index) => {
      if (!entry.res.ok) {
        errors.push({ id: entry.id, status: entry.res.status });
        if (!upstreamSnippet) {
          upstreamSnippet = safeSnippet(texts[index]);
        }
      }
    });

    if (errors.length && errors.length === responses.length) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const failingStatus = errors[0]?.status || 502;
      const errorCode = mapUpstreamCode(failingStatus);
      if (cached?.hit && cached.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.value.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: {
            url: UPSTREAM_URL,
            status: failingStatus,
            snippet: upstreamSnippet
          },
          error: {
            code: errorCode,
            message: "Upstream error",
            details: { errors }
          },
          isStale: true
        });
        logServer({
          feature: FEATURE_ID,
          traceId,
          cacheLayer: "kv",
          upstreamStatus: failingStatus,
          durationMs: Date.now() - started
        });
        return response;
      }

      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: {
          url: UPSTREAM_URL,
          status: failingStatus,
          snippet: upstreamSnippet
        },
        error: {
          code: errorCode,
          message: "Upstream error",
          details: { errors }
        },
        status: failingStatus === 429 ? 429 : 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: failingStatus,
        durationMs: Date.now() - started
      });
      return response;
    }

    let fngJson;
    let stocksJson;
    let cryptoJson;
    let yahooJson;
    try {
      fngJson = texts[0] ? JSON.parse(texts[0]) : {};
      stocksJson = texts[1] ? JSON.parse(texts[1]) : {};
      cryptoJson = texts[2] ? JSON.parse(texts[2]) : {};
      yahooJson = texts[3] ? JSON.parse(texts[3]) : {};
    } catch (error) {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: {
          url: UPSTREAM_URL,
          status: 200,
          snippet: safeSnippet(texts.join(""))
        },
        error: { code: "SCHEMA_INVALID", message: "Invalid JSON", details: {} },
        status: 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: 200,
        durationMs: Date.now() - started
      });
      return response;
    }

    const dataPayload = normalize(fngJson, stocksJson, cryptoJson, yahooJson);
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
      upstream: {
        url: UPSTREAM_URL,
        status: 200,
        snippet: safeSnippet(texts.join(""))
      },
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
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: {
        url: UPSTREAM_URL,
        status: null,
        snippet: upstreamSnippet
      },
      error: {
        code: errorCode,
        message: error?.message || "Request failed",
        details: {}
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
