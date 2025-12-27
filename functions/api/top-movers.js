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
import { fetchJsonWithFallbacks } from "./_shared/parse.js";

const FEATURE_ID = "top-movers";
const KV_TTL = 240;
const CRYPTO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=6&page=1&sparkline=false&price_change_percentage=24h";
const STOCK_UNIVERSE = [
  { symbol: "AAPL", label: "Apple" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "NVDA", label: "Nvidia" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "META", label: "Meta" },
  { symbol: "GOOGL", label: "Alphabet" },
  { symbol: "GOOG", label: "Alphabet" },
  { symbol: "TSLA", label: "Tesla" },
  { symbol: "BRK-B", label: "Berkshire" },
  { symbol: "JPM", label: "JPMorgan" },
  { symbol: "V", label: "Visa" },
  { symbol: "MA", label: "Mastercard" },
  { symbol: "UNH", label: "UnitedHealth" },
  { symbol: "XOM", label: "Exxon" },
  { symbol: "LLY", label: "Eli Lilly" },
  { symbol: "AVGO", label: "Broadcom" },
  { symbol: "ORCL", label: "Oracle" },
  { symbol: "COST", label: "Costco" },
  { symbol: "WMT", label: "Walmart" },
  { symbol: "PG", label: "Procter & Gamble" }
];
const YAHOO_URL = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
  STOCK_UNIVERSE.map((entry) => entry.symbol).join(",")
)}`;
const UPSTREAM_URL = `${CRYPTO_URL} | ${YAHOO_URL}`;

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function normalizeCrypto(payload) {
  return Array.isArray(payload)
    ? payload.slice(0, 6).map((coin) => ({
        symbol: coin.symbol?.toUpperCase() || "N/A",
        name: coin.name || "Unknown",
        price: coin.current_price ?? null,
        changePercent: coin.price_change_percentage_24h ?? null,
        volume: coin.total_volume ?? null,
        ts: new Date().toISOString(),
        source: "coingecko"
      }))
    : [];
}

function normalizeStocks(payload) {
  const results = payload?.quoteResponse?.result || [];
  const map = new Map(results.map((item) => [item.symbol, item]));
  const rows = STOCK_UNIVERSE.map((entry) => {
    const quote = map.get(entry.symbol) || {};
    return {
      symbol: entry.symbol,
      name: quote.shortName || quote.longName || entry.label || entry.symbol,
      price: quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      ts: new Date().toISOString(),
      source: "yahoo"
    };
  });

  const sortable = rows.filter((row) => typeof row.changePercent === "number");
  const sorted = sortable.slice().sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.slice(0, 6);
  const losers = sorted.slice(-6).reverse();

  return {
    gainers,
    losers,
    universe: STOCK_UNIVERSE.map((entry) => entry.symbol)
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

  const cacheKey = `${FEATURE_ID}:v2`;
  const lastOkKey = "top_movers:last_ok";

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
    const fetchSafe = async (url, context) => {
      try {
        const result = await fetchJsonWithFallbacks([url], {}, context);
        return { ok: true, ...result };
      } catch (error) {
        return { ok: false, error };
      }
    };

    const [cryptoResult, stocksResult] = await Promise.all([
      fetchSafe(withCoinGeckoKey(CRYPTO_URL, env), "top-movers:crypto"),
      fetchSafe(YAHOO_URL, "top-movers:stocks")
    ]);

    const errors = [];
    const sources = [
      { id: "crypto", result: cryptoResult },
      { id: "stocks", result: stocksResult }
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

    const dataPayload = {
      updatedAt: new Date().toISOString(),
      source: "coingecko, yahoo",
      method: "Top movers are computed within a fixed mega-cap universe.",
      crypto: normalizeCrypto(cryptoResult.json || []),
      stocks: normalizeStocks(stocksResult.json || {})
    };

    const hasAnyData =
      (dataPayload.crypto || []).length ||
      (dataPayload.stocks?.gainers || []).length ||
      (dataPayload.stocks?.losers || []).length;

    if (!hasAnyData) {
      const lastOk = await kvGetJson(env, lastOkKey);
      if (lastOk?.hit && lastOk.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: { ...lastOk.value.data, asOf: lastOk.value.ts },
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
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: UPSTREAM_URL, status: null, snippet: upstreamSnippet },
        error: {
          code: "SCHEMA_INVALID",
          message: "Upstream parse failed",
          details: { errors }
        },
        status: 502
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
    const lastOk = await kvGetJson(env, lastOkKey);
    if (lastOk?.hit && lastOk.value?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: { ...lastOk.value.data, asOf: lastOk.value.ts },
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
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_URL, status: null, snippet: upstreamSnippet },
      error: {
        code: error?.code || errorCode,
        message: error?.message || "Request failed",
        details: error?.details || {}
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
