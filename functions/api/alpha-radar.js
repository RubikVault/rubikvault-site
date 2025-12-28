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
  kvGetJson
} from "./_shared.js";
import { US_TOP_30 } from "./_shared/us-universes.js";

const FEATURE_ID = "alpha-radar";
const KV_TTL = 6 * 60 * 60;
const STALE_MAX = 48 * 60 * 60;
const CACHE_KEY = "DASH:ALPHA_RADAR";
const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";
const EARNINGS_LAST_GOOD = "earnings-calendar:last_good";

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseStooqCsv(text) {
  if (!text || isHtmlLike(text)) return null;
  const lines = text.trim().split("\n");
  if (lines.length < 3) return null;
  const closes = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const high = parseNumber(parts[2]);
    const low = parseNumber(parts[3]);
    const close = parseNumber(parts[4]);
    const volume = parseNumber(parts[5]);
    if (close === null || high === null || low === null) continue;
    closes.push(close);
    highs.push(high);
    lows.push(low);
    volumes.push(volume ?? 0);
  }
  return { closes, highs, lows, volumes };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / slice.length;
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const output = [];
  let prev = values[0];
  output.push(prev);
  for (let i = 1; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    output.push(prev);
  }
  return output;
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  const slice = trs.slice(-period);
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

function bollinger(values, period = 20, multiplier = 2) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
  const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  const upper = mean + multiplier * std;
  const lower = mean - multiplier * std;
  const latest = values[values.length - 1];
  const percentB = upper === lower ? null : (latest - lower) / (upper - lower);
  return { upper, lower, mean, percentB };
}

function macd(values) {
  if (values.length < 26) return null;
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const length = Math.min(ema12.length, ema26.length);
  const macdSeries = [];
  for (let i = 0; i < length; i += 1) {
    macdSeries.push(ema12[i] - ema26[i]);
  }
  const signalSeries = emaSeries(macdSeries, 9);
  if (!signalSeries.length) return null;
  const hist = macdSeries[macdSeries.length - 1] - signalSeries[signalSeries.length - 1];
  const prevHist =
    macdSeries.length > 1 && signalSeries.length > 1
      ? macdSeries[macdSeries.length - 2] - signalSeries[signalSeries.length - 2]
      : null;
  return { macd: macdSeries[macdSeries.length - 1], signal: signalSeries[signalSeries.length - 1], hist, prevHist };
}

function buildEarningsMap(cached) {
  const map = new Map();
  const items = cached?.value?.data?.items || [];
  items.forEach((item) => {
    if (!item.symbol || !item.date) return;
    map.set(item.symbol, item.date);
  });
  return map;
}

function daysToEarnings(dateStr) {
  if (!dateStr) return null;
  const now = Date.now();
  const target = Date.parse(dateStr);
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

function scorePick(symbol, name, series, earningsDate) {
  const { closes, highs, lows, volumes } = series;
  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] ?? close;
  const latestLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2] ?? latestLow;
  const latestVolume = volumes[volumes.length - 1] ?? 0;

  const sma200 = sma(closes, 200);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const bb = bollinger(closes, 20, 2);
  const macdValues = macd(closes);
  const atr14 = atr(highs, lows, closes, 14);
  const volSma20 = sma(volumes, 20);

  const aboveSma200 = sma200 !== null && close > sma200;
  const emaAboveSma200 = ema21 !== null && sma200 !== null && ema21 > sma200;
  const rsiHealthy = rsi14 !== null && rsi14 >= 45 && rsi14 <= 65;
  const bbHealthy = bb?.percentB !== null && bb.percentB >= 0.2 && bb.percentB <= 0.8;
  const macdPositive = macdValues?.hist !== null && macdValues.hist > 0;

  let setupScore = 0;
  if (aboveSma200) setupScore += 15;
  if (emaAboveSma200) setupScore += 8;
  if (rsiHealthy) setupScore += 8;
  if (bbHealthy) setupScore += 5;
  if (macdPositive) setupScore += 4;

  const emaReclaim = ema21 !== null && close > ema21;
  const higherLow = latestLow > prevLow;
  const macdRising =
    macdValues?.hist !== null && macdValues?.prevHist !== null
      ? macdValues.hist > macdValues.prevHist
      : false;
  const volumeGate = volSma20 !== null && latestVolume > volSma20;
  const bosWindow = highs.slice(-10);
  const bosLevel = bosWindow.length ? Math.max(...bosWindow) : null;
  const bos = bosLevel !== null && close > bosLevel;

  let triggerScore = 0;
  if (emaReclaim) triggerScore += 20;
  if (higherLow) triggerScore += 12;
  if (macdRising) triggerScore += 10;
  if (volumeGate) triggerScore += 10;
  if (bos) triggerScore += 8;

  let totalScore = setupScore + triggerScore;
  const earningsDays = daysToEarnings(earningsDate);
  const earningsRisk = earningsDays !== null && earningsDays <= 3;
  if (earningsRisk && totalScore > 69) totalScore = 69;

  const setupOk = setupScore >= 25;
  const triggerOk = triggerScore >= 35;
  const topPick = setupOk && triggerOk && totalScore >= 70;

  const reasons = [];
  if (aboveSma200) reasons.push("Above SMA200");
  if (emaReclaim) reasons.push("EMA21 reclaim");
  if (higherLow) reasons.push("Higher low");
  if (macdRising) reasons.push("MACD momentum rising");
  if (volumeGate) reasons.push("Volume above 20D");
  if (bos) reasons.push("Break of structure");
  if (earningsRisk) reasons.push("Earnings within 3 days");

  return {
    symbol,
    name,
    setupScore,
    triggerScore,
    totalScore,
    label: topPick ? "TOP PICK" : setupOk || triggerOk ? "WATCHLIST" : "WAIT",
    setup: {
      aboveSma200,
      emaAboveSma200,
      rsiHealthy,
      bbHealthy,
      macdPositive
    },
    trigger: {
      emaReclaim,
      higherLow,
      macdRising,
      volumeGate,
      bos
    },
    reasons,
    stop: atr14 !== null ? close - atr14 * 2 : null,
    earningsRisk,
    earningsDays,
    dataQuality: closes.length >= 200 ? "ok" : "thin",
    close,
    changePercent: prevClose ? ((close / prevClose - 1) * 100) : null
  };
}

async function fetchSeries(symbol, env) {
  const stooqSymbol = `${symbol}.US`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await safeFetchText(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return { ok: false, error: "UPSTREAM_5XX", snippet: safeSnippet(text) };
  }
  const parsed = parseStooqCsv(text);
  if (!parsed || parsed.closes.length < 60) {
    return { ok: false, error: "SCHEMA_INVALID", snippet: safeSnippet(text) };
  }
  return { ok: true, data: parsed, snippet: "" };
}

async function fetchAlphaRadar(env) {
  const cachedEarnings = await kvGetJson(env, EARNINGS_LAST_GOOD);
  const earningsMap = buildEarningsMap(cachedEarnings);

  const results = await Promise.allSettled(
    US_TOP_30.map(async (entry) => {
      const symbol = String(entry.s || "").toUpperCase();
      const name = entry.n || symbol;
      const series = await fetchSeries(symbol, env);
      return { symbol, name, series };
    })
  );

  const picks = [];
  const missingSymbols = [];
  let upstreamSnippet = "";

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, name, series } = result.value;
    if (!series.ok) {
      missingSymbols.push(symbol);
      upstreamSnippet = upstreamSnippet || series.snippet || "";
      return;
    }
    const earningsDate = earningsMap.get(symbol) || null;
    picks.push(scorePick(symbol, name, series.data, earningsDate));
  });

  if (!picks.length) {
    return {
      ok: false,
      error: {
        code: "UPSTREAM_5XX",
        message: "No alpha radar data",
        details: { missingSymbols }
      },
      snippet: upstreamSnippet
    };
  }

  const sortedByTotal = [...picks].sort((a, b) => b.totalScore - a.totalScore);
  const sortedByTrigger = [...picks].sort((a, b) => b.triggerScore - a.triggerScore);
  const sortedBySetup = [...picks].sort((a, b) => b.setupScore - a.setupScore);

  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      source: "stooq",
      partial: missingSymbols.length > 0,
      missingSymbols,
      universe: US_TOP_30.map((entry) => entry.s),
      picks: {
        shortterm: sortedByTrigger.slice(0, 3),
        longterm: sortedBySetup.slice(0, 3),
        top: sortedByTotal.slice(0, 3)
      },
      method: "Alpha Radar v1 (RSI/EMA/SMA/Bollinger/ATR/MACD)",
      warnings: missingSymbols.length ? ["Some symbols unavailable"] : []
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
    fetcher: () => fetchAlphaRadar(env),
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
      error: swr.error || { code: "UPSTREAM_5XX", message: "No upstream data", details: {} },
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
