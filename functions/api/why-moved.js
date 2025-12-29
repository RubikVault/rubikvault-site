import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  kvGetJson,
  kvPutJson,
  normalizeFreshness,
  swrGetOrRefresh
} from "./_shared.js";
import {
  calculateConfidence,
  buildFeaturePayload,
  resolveDataQuality,
  withReason
} from "./_shared/feature-contract.js";
import { fetchStooqDaily, computeReturn, lastValue } from "./_shared/stooq.js";
import { US_TOP_30 } from "./_shared/us-universes.js";

const FEATURE_ID = "why-moved";
const CACHE_KEY = "why-moved:v1";
const LAST_GOOD_KEY = "why-moved:last_good";
const KV_TTL = 60 * 60;
const STALE_MAX = 24 * 60 * 60;

const DEFINITIONS = {
  reasons: {
    EARNINGS: "Earnings within +/-1 day",
    NEWS: "Headline spike",
    SECTOR: "Sector tailwind",
    MACRO: "Move explained by SPY" 
  }
};

const SECTOR_MAP = {
  AAPL: "XLK",
  MSFT: "XLK",
  NVDA: "XLK",
  AMZN: "XLY",
  TSLA: "XLY",
  META: "XLC",
  GOOGL: "XLC",
  GOOG: "XLC",
  NFLX: "XLC",
  JPM: "XLF",
  XOM: "XLE",
  UNH: "XLV",
  JNJ: "XLV",
  AVGO: "XLK",
  COST: "XLP",
  WMT: "XLP",
  PG: "XLP",
  KO: "XLP",
  PEP: "XLP"
};

function buildNewsIndex(newsItems) {
  const map = new Map();
  (newsItems || []).forEach((item) => {
    const title = String(item.headline || "").toUpperCase();
    if (!title) return;
    for (const entry of US_TOP_30) {
      const symbol = String(entry.s || "").toUpperCase();
      if (!symbol) continue;
      if (title.includes(symbol)) {
        map.set(symbol, (map.get(symbol) || 0) + 1);
      }
    }
  });
  return map;
}

function classifyReasons({ symbol, earningsDate, newsCount, sectorChange, spyMove, stockMove }) {
  let reasons = [];
  if (earningsDate) {
    const diffDays = Math.abs((Date.parse(earningsDate) - Date.now()) / 86400000);
    if (diffDays <= 1) reasons = withReason(reasons, "EARNINGS");
  }
  if (newsCount >= 2) reasons = withReason(reasons, "NEWS");
  if (typeof sectorChange === "number" && typeof stockMove === "number") {
    if ((sectorChange > 0 && stockMove > 0) || (sectorChange < 0 && stockMove < 0)) {
      reasons = withReason(reasons, "SECTOR");
    }
  }
  if (typeof spyMove === "number" && typeof stockMove === "number") {
    if (Math.sign(spyMove) === Math.sign(stockMove) && Math.abs(spyMove) >= 1) {
      reasons = withReason(reasons, "MACRO");
    }
  }
  return reasons;
}

async function fetchWhyMoved(env) {
  const earningsCached = await kvGetJson(env, "earnings-calendar:last_good");
  const earningsItems = earningsCached?.value?.data?.items || [];
  const earningsMap = new Map();
  earningsItems.forEach((item) => {
    if (item?.symbol && item?.date) {
      earningsMap.set(String(item.symbol).toUpperCase(), item.date);
    }
  });

  const newsCached = await kvGetJson(env, "news:v1");
  const newsItems = newsCached?.value?.data?.items || [];
  const newsIndex = buildNewsIndex(newsItems);

  const sectorCached = await kvGetJson(env, "DASH:SECTOR_ROTATION");
  const sectorMap = new Map();
  (sectorCached?.value?.data?.sectors || []).forEach((sector) => {
    if (sector?.symbol) {
      sectorMap.set(sector.symbol, sector.changePercent ?? null);
    }
  });

  const spyRes = await fetchStooqDaily("SPY", env);
  const spyMove = spyRes.ok ? computeReturn(spyRes.data.closes, 1) : null;

  const results = await Promise.allSettled(
    US_TOP_30.map(async (entry) => {
      const symbol = String(entry.s || "").toUpperCase();
      const name = entry.n || symbol;
      const series = await fetchStooqDaily(symbol, env);
      return { symbol, name, series };
    })
  );

  const movers = [];
  const missing = [];

  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, name, series } = result.value;
    if (!series.ok) {
      missing.push(symbol);
      return;
    }
    const close = lastValue(series.data.closes);
    const change = computeReturn(series.data.closes, 1);
    movers.push({
      symbol,
      name,
      close,
      changePercent: change,
      earningsDate: earningsMap.get(symbol) || null,
      newsCount: newsIndex.get(symbol) || 0,
      sectorChange: sectorMap.get(SECTOR_MAP[symbol] || "") ?? null
    });
  });

  if (!movers.length) {
    const payload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: {
        movers: [],
        items: [],
        spyMove,
        missingSymbols: missing
      }
    });
    return { ok: true, data: payload };
  }

  const sorted = [...movers].sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0));
  const top = sorted.slice(0, 5).map((item) => {
    const reasons = classifyReasons({
      symbol: item.symbol,
      earningsDate: item.earningsDate,
      newsCount: item.newsCount,
      sectorChange: item.sectorChange,
      spyMove,
      stockMove: item.changePercent
    });
    const availableSignals = [item.earningsDate, item.newsCount, item.sectorChange, spyMove].filter(
      (value) => value !== null && value !== undefined
    ).length;
    return {
      ...item,
      reasons,
      confidence: calculateConfidence(availableSignals, 4),
      reasonLabel: reasons.length ? reasons[0] : "UNCLASSIFIED"
    };
  });

  const payload = buildFeaturePayload({
    feature: FEATURE_ID,
    traceId: "",
    source: "stooq",
    updatedAt: new Date().toISOString(),
    dataQuality: resolveDataQuality({
      ok: true,
      isStale: false,
      partial: missing.length > 0,
      hasData: top.length > 0
    }),
    confidence: calculateConfidence(US_TOP_30.length - missing.length, US_TOP_30.length),
    definitions: DEFINITIONS,
    reasons: [],
    data: {
      movers: top,
      items: top,
      spyMove,
      missingSymbols: missing
    }
  });

  return { ok: true, data: payload };
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
    fetcher: () => fetchWhyMoved(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const emptyPayload = buildFeaturePayload({
      feature: FEATURE_ID,
      traceId: "",
      source: "stooq",
      updatedAt: new Date().toISOString(),
      dataQuality: resolveDataQuality({
        ok: true,
        isStale: false,
        partial: true,
        hasData: false
      }),
      confidence: 0,
      definitions: DEFINITIONS,
      reasons: ["NO_DATA"],
      data: { movers: [], items: [], spyMove: null, missingSymbols: [] }
    });
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: emptyPayload,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "stooq", status: null, snippet: swr.error?.snippet || "" },
      error: swr.error || { code: "UPSTREAM_5XX", message: "No data", details: {} },
      cacheStatus: "ERROR",
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

  payload.traceId = traceId;
  payload.dataQuality = payload.dataQuality || resolveDataQuality({
    ok: true,
    isStale: swr.isStale,
    partial: payload?.data?.missingSymbols?.length,
    hasData: (payload?.data?.movers || []).length > 0
  });

  if (!swr.isStale) {
    await kvPutJson(env, LAST_GOOD_KEY, { ts: new Date().toISOString(), data: payload }, 24 * 60 * 60);
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
    cacheStatus: swr.cacheStatus,
    status: 200
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
