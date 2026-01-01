import { safeSnippet, withCoinGeckoKey } from "./_shared.js";
import { fetchJsonWithFallbacks } from "./_shared/parse.js";
import { withResilience } from "./_shared/resilience.js";

const FEATURE_ID = "market-health";
const VERSION = "v1";
const TTL_STALE = 24 * 60 * 60;
const CIRCUIT_SEC = 1800;
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

function validateMarketHealth(data) {
  const hasAnyData =
    data?.fng ||
    data?.fngStocks ||
    (data?.crypto || []).length ||
    (data?.indices || []).length ||
    (data?.commodities || []).length;
  if (hasAnyData) return { passed: true };
  return { passed: false, failReason: "EMPTY_DATA" };
}

async function fetchMarketHealth({ env, signal, lastGood }) {
  const fetchSafe = async (url, context) => {
    try {
      const result = await fetchJsonWithFallbacks([url], { timeoutMs: 6000, signal }, context);
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
  let upstreamSnippet = "";
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
  if (lastGood) {
    dataPayload = mergeLastGood(dataPayload, lastGood);
  }

  const hasAnyData =
    dataPayload.fng ||
    dataPayload.fngStocks ||
    (dataPayload.crypto || []).length ||
    (dataPayload.indices || []).length ||
    (dataPayload.commodities || []).length;

  if (!hasAnyData) {
    const error = new Error("No upstream data");
    const status = errors.find((entry) => entry.status)?.status ?? null;
    error.status = status;
    error.code = status === 429 ? "RATE_LIMITED" : status === 403 ? "UPSTREAM_403" : "UPSTREAM_5XX";
    error.details = { errors };
    error.message = "No upstream data";
    throw error;
  }

  return {
    data: dataPayload,
    upstreamStatus: 200,
    upstreamUrl: UPSTREAM_URL,
    snippet: upstreamSnippet
  };
}

export async function onRequestGet(context) {
  return withResilience(context, {
    featureId: FEATURE_ID,
    version: VERSION,
    fetcher: fetchMarketHealth,
    validator: validateMarketHealth,
    ttlStaleSec: TTL_STALE,
    circuitSec: CIRCUIT_SEC,
    upstreamUrl: UPSTREAM_URL
  });
}
