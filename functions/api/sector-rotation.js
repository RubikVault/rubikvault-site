import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchJson,
  safeFetchText,
  safeSnippet,
  isHtmlLike,
  swrGetOrRefresh,
  normalizeFreshness,
  computeReturnsFromDailyCloses
} from "./_shared.js";

const FEATURE_ID = "sector-rotation";
const KV_TTL = 30 * 60;
const STALE_MAX = 24 * 60 * 60;
const CACHE_KEY = "DASH:SECTOR_ROTATION";
const FMP_BASE = "https://financialmodelingprep.com/api/v3/quote";
const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";

const SECTOR_SYMBOLS = [
  "XLK",
  "XLF",
  "XLV",
  "XLE",
  "XLI",
  "XLP",
  "XLU",
  "XLRE",
  "XLB",
  "XLC",
  "XLY"
];

const GROUPS = {
  offensive: ["XLK", "XLY", "XLC", "XLI"],
  defensive: ["XLU", "XLP", "XLV", "XLRE"],
  cyclical: ["XLE", "XLF", "XLB"]
};

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChangePercent(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/[()%]/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function averageChange(sectors, symbols) {
  const values = sectors
    .filter((item) => symbols.includes(item.symbol))
    .map((item) => item.changePercent)
    .filter((value) => typeof value === "number");
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rotationLabel(offensiveAvg, defensiveAvg) {
  if (offensiveAvg === null || defensiveAvg === null) return "Neutral";
  if (offensiveAvg > defensiveAvg) return "Risk-On";
  if (defensiveAvg > offensiveAvg) return "Risk-Off";
  return "Neutral";
}

function parseStooqCsv(text) {
  if (!text || isHtmlLike(text)) return [];
  const lines = text.trim().split("\n");
  if (lines.length < 3) return [];
  return lines
    .slice(1)
    .map((line) => line.split(","))
    .filter((parts) => parts.length >= 5)
    .map((parts) => Number.parseFloat(parts[4]))
    .filter((value) => Number.isFinite(value));
}

async function fetchStooqHistory(symbol, env) {
  const stooqSymbol = `${symbol}.US`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  const res = await safeFetchText(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  const text = res.text || "";
  if (!res.ok || isHtmlLike(text)) {
    return { ok: false, closes: [], snippet: safeSnippet(text) };
  }
  const closes = parseStooqCsv(text);
  return { ok: closes.length > 1, closes, snippet: "" };
}

async function fetchSectorRotationStooq(env) {
  const spyRes = await fetchStooqHistory("SPY", env);
  const spyReturns = spyRes.ok ? computeReturnsFromDailyCloses(spyRes.closes) : {};
  const spyChange = Number.isFinite(spyReturns?.r1d) ? spyReturns.r1d : null;

  const results = await Promise.allSettled(
    SECTOR_SYMBOLS.map(async (symbol) => {
      const res = await fetchStooqHistory(symbol, env);
      return { symbol, res };
    })
  );

  const sectors = [];
  let upstreamSnippet = "";
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const { symbol, res } = result.value;
    if (!res.ok) {
      upstreamSnippet = upstreamSnippet || res.snippet || "";
      return;
    }
    const closes = res.closes;
    const latest = closes[closes.length - 1] ?? null;
    const returns = computeReturnsFromDailyCloses(closes);
    const changePercent = Number.isFinite(returns?.r1d) ? returns.r1d : null;
    sectors.push({
      symbol,
      name: symbol,
      price: latest,
      changePercent,
      relativeToSpy:
        typeof changePercent === "number" && typeof spyChange === "number"
          ? changePercent - spyChange
          : null
    });
  });

  if (!sectors.length) {
    return {
      ok: false,
      error: { code: "UPSTREAM_5XX", message: "Upstream error", details: {} },
      snippet: upstreamSnippet
    };
  }

  const sorted = [...sectors].sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
  const offensiveAvg = averageChange(sectors, GROUPS.offensive);
  const defensiveAvg = averageChange(sectors, GROUPS.defensive);
  const cyclicalAvg = averageChange(sectors, GROUPS.cyclical);
  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      rotationLabel: rotationLabel(offensiveAvg, defensiveAvg),
      groups: {
        offensive: offensiveAvg,
        defensive: defensiveAvg,
        cyclical: cyclicalAvg
      },
      spyChangePercent: spyChange,
      sectors: sorted,
      source: "stooq"
    }
  };
}

async function fetchSectorRotation(env) {
  if (env.FMP_API_KEY) {
    const url = `${FMP_BASE}/${SECTOR_SYMBOLS.concat("SPY").join(",")}?apikey=${env.FMP_API_KEY}`;
    const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
    if (res.ok && Array.isArray(res.json)) {
      const sectors = res.json
        .map((item) => ({
          symbol: item.symbol,
          name: item.name || item.symbol,
          price: parseNumber(item.price),
          changePercent: parseChangePercent(item.changesPercentage)
        }))
        .filter((item) => SECTOR_SYMBOLS.includes(item.symbol));
      const spy = res.json.find((item) => item.symbol === "SPY");
      const spyChange = spy ? parseChangePercent(spy.changesPercentage) : null;
      const withRelative = sectors.map((sector) => ({
        ...sector,
        relativeToSpy:
          typeof sector.changePercent === "number" && typeof spyChange === "number"
            ? sector.changePercent - spyChange
            : null
      }));
      const sorted = [...withRelative].sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
      const offensiveAvg = averageChange(withRelative, GROUPS.offensive);
      const defensiveAvg = averageChange(withRelative, GROUPS.defensive);
      const cyclicalAvg = averageChange(withRelative, GROUPS.cyclical);
      return {
        ok: true,
        data: {
          updatedAt: new Date().toISOString(),
          rotationLabel: rotationLabel(offensiveAvg, defensiveAvg),
          groups: {
            offensive: offensiveAvg,
            defensive: defensiveAvg,
            cyclical: cyclicalAvg
          },
          spyChangePercent: spyChange,
          sectors: sorted,
          source: "fmp"
        }
      };
    }
  }

  return fetchSectorRotationStooq(env);
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
    fetcher: () => fetchSectorRotation(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "fmp | stooq", status: null, snippet: safeSnippet(swr.error?.snippet || "") },
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

  const upstreamUrl = payload.source === "stooq" ? "stooq" : FMP_BASE;
  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: upstreamUrl, status: 200, snippet: "" },
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
