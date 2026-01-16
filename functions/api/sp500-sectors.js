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
const KV_TTL = 24 * 60 * 60;
const STALE_MAX = 45 * 24 * 60 * 60;
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

function computeRsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (!Number.isFinite(delta)) continue;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (!Number.isFinite(delta)) continue;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeRsiSeries(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return [];
  const output = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (!Number.isFinite(delta)) continue;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  output.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (!Number.isFinite(delta)) continue;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    output.push(rsi);
  }
  return output;
}

function computeStochRsi(values, period = 14) {
  const rsiSeries = computeRsiSeries(values, period);
  if (rsiSeries.length < period) return null;
  const slice = rsiSeries.slice(-period);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const latest = rsiSeries[rsiSeries.length - 1];
  if (max === min) return 0;
  return ((latest - min) / (max - min)) * 100;
}

function computeMacd(values, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  if (!Array.isArray(values) || values.length < longPeriod + signalPeriod) {
    return { macd: null, signal: null, hist: null };
  }
  const kShort = 2 / (shortPeriod + 1);
  const kLong = 2 / (longPeriod + 1);
  const kSignal = 2 / (signalPeriod + 1);
  let emaShort = values[0];
  let emaLong = values[0];
  let signal = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    emaShort = value * kShort + emaShort * (1 - kShort);
    emaLong = value * kLong + emaLong * (1 - kLong);
    const macd = emaShort - emaLong;
    if (index === 0) signal = macd;
    else signal = macd * kSignal + signal * (1 - kSignal);
  });
  const macd = emaShort - emaLong;
  const hist = macd - signal;
  return { macd, signal, hist };
}

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

function computeRelativeSeries(aCloses, bCloses) {
  if (!Array.isArray(aCloses) || !Array.isArray(bCloses)) return [];
  const len = Math.min(aCloses.length, bCloses.length);
  if (len < 30) return [];
  const startA = aCloses.length - len;
  const startB = bCloses.length - len;
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const a = aCloses[startA + i];
    const b = bCloses[startB + i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) continue;
    out.push(a / b);
  }
  return out;
}

async function fetchSp500Sectors(env) {
  const spyRes = await fetchSectorHistory("SPY", env);
  const spyCloses = spyRes.ok ? spyRes.closes : [];
  const spyReturns = spyCloses.length > 2 ? computeReturnsFromDailyCloses(spyCloses) : null;

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
    const relSeries = computeRelativeSeries(closes, spyCloses);
    const relRsi = computeRsi(relSeries, 14);
    const relStochRsi = computeStochRsi(relSeries, 14);
    const macd = computeMacd(relSeries);

    sectors.push({
      symbol: sector.symbol,
      name: sector.name,
      price: latest,
      r1d: returns.r1d,
      r1w: returns.r1w,
      r1m: returns.r1m,
      r1y: returns.r1y,
      rel: spyReturns
        ? {
            r1d: Number.isFinite(returns.r1d) && Number.isFinite(spyReturns.r1d) ? returns.r1d - spyReturns.r1d : null,
            r1w: Number.isFinite(returns.r1w) && Number.isFinite(spyReturns.r1w) ? returns.r1w - spyReturns.r1w : null,
            r1m: Number.isFinite(returns.r1m) && Number.isFinite(spyReturns.r1m) ? returns.r1m - spyReturns.r1m : null,
            r1y: Number.isFinite(returns.r1y) && Number.isFinite(spyReturns.r1y) ? returns.r1y - spyReturns.r1y : null
          }
        : { r1d: null, r1w: null, r1m: null, r1y: null },
      relTech: {
        rsi: relRsi,
        macd: macd.macd,
        macdHist: macd.hist,
        stochRsi: relStochRsi
      },
      proxy: true
    });
  });

  return {
    ok: sectors.length > 0,
    data: {
      updatedAt: new Date().toISOString(),
      spy: {
        ok: Boolean(spyReturns),
        r1d: spyReturns?.r1d ?? null,
        r1w: spyReturns?.r1w ?? null,
        r1m: spyReturns?.r1m ?? null,
        r1y: spyReturns?.r1y ?? null
      },
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

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
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
