import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchJson,
  safeSnippet,
  swrGetOrRefresh,
  normalizeFreshness
} from "./_shared.js";

const FEATURE_ID = "sector-rotation";
const KV_TTL = 30 * 60;
const STALE_MAX = 24 * 60 * 60;
const CACHE_KEY = "DASH:SECTOR_ROTATION";
const FMP_BASE = "https://financialmodelingprep.com/api/v3/quote";

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

async function fetchSectorRotation(env) {
  if (!env.FMP_API_KEY) {
    return {
      ok: false,
      error: { code: "ENV_MISSING", message: "FMP_API_KEY missing", details: { missing: ["FMP_API_KEY"] } }
    };
  }
  const url = `${FMP_BASE}/${SECTOR_SYMBOLS.join(",")}?apikey=${env.FMP_API_KEY}`;
  const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false, error: { code: "UPSTREAM_5XX", message: "Upstream error", details: {} }, snippet: res.snippet || "" };
  }
  const sectors = res.json
    .map((item) => ({
      symbol: item.symbol,
      name: item.name || item.symbol,
      price: parseNumber(item.price),
      changePercent: parseChangePercent(item.changesPercentage)
    }))
    .filter((item) => SECTOR_SYMBOLS.includes(item.symbol));
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
      sectors: sorted
    }
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
      upstream: { url: FMP_BASE, status: null, snippet: safeSnippet(swr.error?.snippet || "") },
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
    upstream: { url: FMP_BASE, status: 200, snippet: "" },
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
