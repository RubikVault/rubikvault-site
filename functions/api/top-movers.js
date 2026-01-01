import { safeSnippet } from "./_shared.js";
import { fetchJsonWithFallbacks } from "./_shared/parse.js";
import { withResilience } from "./_shared/resilience.js";

const FEATURE_ID = "top-movers";
const VERSION = "v1";
const TTL_STALE = 24 * 60 * 60;
const CIRCUIT_SEC = 1800;
const VOLUME_LIMIT = 10;
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

function normalizeStocks(payload) {
  const results = payload?.quoteResponse?.result || [];
  const map = new Map(results.map((item) => [item.symbol, item]));
  const rows = STOCK_UNIVERSE.map((entry) => {
    const quote = map.get(entry.symbol) || {};
    return {
      symbol: entry.symbol,
      name: quote.shortName || quote.longName || entry.label || entry.symbol,
      price: quote.regularMarketPrice ?? null,
      lastClose: quote.regularMarketPreviousClose ?? quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      volume: quote.regularMarketVolume ?? null,
      ts: new Date().toISOString(),
      source: "yahoo"
    };
  });

  const sortable = rows.filter((row) => typeof row.volume === "number");
  const sorted = sortable.slice().sort((a, b) => b.volume - a.volume);
  const volumeLeaders = sorted.slice(0, VOLUME_LIMIT);
  const volumeLaggards = sorted.slice(-VOLUME_LIMIT).reverse();

  return {
    volumeLeaders,
    volumeLaggards,
    gainers: volumeLeaders,
    losers: volumeLaggards,
    universe: STOCK_UNIVERSE.map((entry) => entry.symbol)
  };
}

function validateTopMovers(data) {
  const movers = data?.movers || [];
  const stocks = data?.stocks || {};
  const count =
    (stocks.volumeLeaders || []).length +
    (stocks.volumeLaggards || []).length +
    (stocks.gainers || []).length +
    (stocks.losers || []).length +
    movers.length;
  if (count > 0) return { passed: true };
  return { passed: false, failReason: "EMPTY_DATA" };
}

async function fetchTopMovers({ signal }) {
  try {
    const result = await fetchJsonWithFallbacks(
      [YAHOO_URL],
      { timeoutMs: 6000, signal },
      "top-movers:stocks"
    );
    const dataPayload = {
      updatedAt: new Date().toISOString(),
      source: "yahoo",
      method: "Top movers are computed by last trading day volume within a fixed mega-cap universe.",
      crypto: [],
      stocks: normalizeStocks(result.json || {})
    };
    return {
      data: dataPayload,
      upstreamStatus: result.upstreamStatus ?? null,
      upstreamUrl: result.chosenUrl || YAHOO_URL,
      snippet: ""
    };
  } catch (error) {
    error.message = error?.message || "Upstream error";
    error.code = error?.code || "UPSTREAM_5XX";
    error.details = error?.details || {};
    if (error?.details?.head) {
      error.details.head = safeSnippet(error.details.head);
    }
    throw error;
  }
}

export async function onRequestGet(context) {
  return withResilience(context, {
    featureId: FEATURE_ID,
    version: VERSION,
    fetcher: fetchTopMovers,
    validator: validateTopMovers,
    ttlStaleSec: TTL_STALE,
    circuitSec: CIRCUIT_SEC,
    upstreamUrl: YAHOO_URL
  });
}
