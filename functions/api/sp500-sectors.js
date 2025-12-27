import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchText,
  isHtmlLike,
  safeSnippet,
  swrGetOrRefresh,
  normalizeFreshness,
  computeReturnsFromDailyCloses
} from "./_shared.js";

const FEATURE_ID = "sp500-sectors";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 7 * 24 * 60 * 60;
const CACHE_KEY = "DASH:SP500_SECTORS";

const SECTORS = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLP", name: "Consumer Staples" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLC", name: "Communication" },
  { symbol: "XLY", name: "Consumer Discretionary" }
];

function mapToStooq(symbol) {
  return `${symbol}.US`;
}

function parseStooqCsv(text) {
  if (!text || isHtmlLike(text)) return [];
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const closes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;
    const close = Number(parts[4]);
    if (Number.isFinite(close)) {
      closes.push(close);
    }
  }
  return closes;
}

async function fetchSectorHistory(symbol, env) {
  const stooqSymbol = mapToStooq(symbol);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await safeFetchText(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return { ok: false, closes: [], snippet: safeSnippet(text) };
  }
  const closes = parseStooqCsv(text);
  return { ok: closes.length > 1, closes, snippet: "" };
}

async function fetchSp500Sectors(env) {
  const results = await Promise.allSettled(
    SECTORS.map(async (sector) => {
      const res = await fetchSectorHistory(sector.symbol, env);
      return { sector, res };
    })
  );

  const sectors = [];
  const missingSymbols = [];
  let upstreamSnippet = "";

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { sector, res } = result.value;
    if (!res.ok) {
      missingSymbols.push(sector.symbol);
      upstreamSnippet = upstreamSnippet || res.snippet || "";
      return;
    }
    const closes = res.closes;
    const latest = closes[closes.length - 1] ?? null;
    const returns = computeReturnsFromDailyCloses(closes);
    sectors.push({
      symbol: sector.symbol,
      name: sector.name,
      price: latest,
      r1d: returns.r1d,
      r1w: returns.r1w,
      r1m: returns.r1m,
      r1y: returns.r1y,
      proxy: true
    });
  });

  return {
    ok: sectors.length > 0,
    data: {
      updatedAt: new Date().toISOString(),
      sectors,
      missingSymbols,
      source: "stooq"
    },
    upstreamSnippet
  };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchSp500Sectors(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: null, snippet: swr.error?.snippet || "" },
      error: {
        code: "UPSTREAM_5XX",
        message: "No upstream data",
        details: {}
      },
      cacheStatus: "ERROR"
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

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: "stooq", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
