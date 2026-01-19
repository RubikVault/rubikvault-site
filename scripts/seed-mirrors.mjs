// Smoke (local):
//   node scripts/seed-mirrors.mjs --dry-run
//   node scripts/seed-mirrors.mjs --dry-run-live

import path from "node:path";
import { buildBaseMirror } from "./utils/mirror-builders.mjs";
import { loadMirror, saveMirror, withRetries } from "./utils/mirror-io.mjs";
import { fetchStooqDaily } from "./utils/stooq-fetch.mjs";

const OUT_DIRS = ["mirrors"];
const FEATURES = ["top-movers", "yield-curve", "sector-rotation", "market-health"];

const QUOTES_PROVIDER = String(process.env.QUOTES_PROVIDER || "").toLowerCase();
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || "";
const FMP_API_KEY = process.env.FMP_API_KEY || "";
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY || "";
const MARKETAUX_KEY = process.env.MARKETAUX_KEY || "";
const ALLOW_YAHOO = process.env.ALLOW_YAHOO === "1";
const ALLOW_TREASURY = process.env.ALLOW_TREASURY === "1";
const MIN_OK_FEATURES = Number(process.env.MIN_OK_FEATURES || 2);
const MAX_FAIL_FEATURES = Number(process.env.MAX_FAIL_FEATURES || 2);
const CRITICAL_FEATURES = new Set(
  String(process.env.CRITICAL_FEATURES || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const DRY_RUN_LIVE = process.argv.includes("--dry-run-live");
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preflight-only");

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
const FMP_QUOTE_URL = "https://financialmodelingprep.com/api/v3/quote";
const FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote";
const TREASURY_CSV_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/DailyTreasuryYieldCurveRateData.csv";
const FRED_YIELD_SERIES = {
  "1m": "DGS1MO",
  "3m": "DGS3MO",
  "6m": "DGS6MO",
  "1y": "DGS1",
  "2y": "DGS2",
  "5y": "DGS5",
  "10y": "DGS10",
  "20y": "DGS20",
  "30y": "DGS30"
};
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true";
const FNG_URL = "https://api.alternative.me/fng/?limit=1&format=json";
const FNG_STOCKS_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
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
const YAHOO_SYMBOLS = [
  { symbol: "^DJI", label: "Dow Jones", type: "index" },
  { symbol: "^GSPC", label: "S&P 500", type: "index" },
  { symbol: "^IXIC", label: "Nasdaq", type: "index" },
  { symbol: "^RUT", label: "Russell 2000", type: "index" },
  { symbol: "GC=F", label: "Gold", type: "commodity" },
  { symbol: "SI=F", label: "Silver", type: "commodity" },
  { symbol: "CL=F", label: "Oil (WTI)", type: "commodity" }
];
const YAHOO_MARKET_URL = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
  YAHOO_SYMBOLS.map((entry) => entry.symbol).join(",")
)}`;

const ALPHAVANTAGE_THROTTLE = { lastCall: 0, minIntervalMs: 12000 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleAlphaVantage() {
  const now = Date.now();
  const waitFor = ALPHAVANTAGE_THROTTLE.minIntervalMs - (now - ALPHAVANTAGE_THROTTLE.lastCall);
  if (waitFor > 0) {
    await sleep(waitFor);
  }
  ALPHAVANTAGE_THROTTLE.lastCall = Date.now();
}

function shouldUseProvider(provider) {
  if (provider.enabledEnv && process.env[provider.enabledEnv] !== "1") {
    return { ok: false, reason: "CONFIG_MISSING", detail: provider.enabledEnv };
  }
  if (provider.keyEnv && !process.env[provider.keyEnv]) {
    return { ok: false, reason: "CONFIG_MISSING", detail: provider.keyEnv };
  }
  if (provider.name === "yahoo" && !ALLOW_YAHOO) {
    return { ok: false, reason: "CONFIG_MISSING", detail: "ALLOW_YAHOO" };
  }
  if (provider.name === "treasury" && !ALLOW_TREASURY) {
    return { ok: false, reason: "CONFIG_MISSING", detail: "ALLOW_TREASURY" };
  }
  if (provider.feature === "top-movers" && QUOTES_PROVIDER) {
    if (provider.name !== QUOTES_PROVIDER) {
      return { ok: false, reason: "CONFIG_MISSING", detail: `QUOTES_PROVIDER=${QUOTES_PROVIDER}` };
    }
  }
  return { ok: true, reason: "READY" };
}

function logEvent(payload) {
  console.log(JSON.stringify(payload));
}

function getCfHeaders(headers) {
  return {
    "cf-ray": headers?.get("cf-ray") || null,
    "server": headers?.get("server") || null,
    "cf-cache-status": headers?.get("cf-cache-status") || null,
    "location": headers?.get("location") || null,
    "content-type": headers?.get("content-type") || null
  };
}

function sanitizeUrl(value) {
  if (!value || typeof value !== "string") return value;
  return value.replace(/([?&](apikey|api_key|token|access_token)=)[^&]+/gi, "$1REDACTED");
}

function logHttpIssue({ op, feature, url, status, text, headers, error }) {
  const snippet = (text || "").slice(0, 200);
  logEvent({
    level: "error",
    op,
    feature,
    url: sanitizeUrl(url),
    http: status ?? null,
    contentType: headers?.get("content-type") || null,
    snippet,
    headers: getCfHeaders(headers),
    error: error || null
  });
}

function buildUpstreamHeaders() {
  return {
    "user-agent": "RVSeeder/1.0 (github-actions)",
    "accept": "application/json",
    "cache-control": "no-cache"
  };
}

async function fetchWithRetry(url, { headers } = {}, retries = 2, backoffMs = [1000, 3000]) {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      const text = await res.text();
      clearTimeout(timer);
      return { res, text };
    } catch (err) {
      clearTimeout(timer);
      const isLast = attempt >= retries;
      if (isLast) {
        err.code = err.name === "AbortError" ? "TIMEOUT" : err.code || "FETCH_ERROR";
        throw err;
      }
      const waitFor = backoffMs[Math.min(attempt, backoffMs.length - 1)] || 1000;
      await sleep(waitFor);
    }
    attempt += 1;
  }
  const error = new Error("retry_exhausted");
  error.code = "RETRY_EXHAUSTED";
  throw error;
}

async function fetchText(url, { headers } = {}) {
  return withRetries(async () => {
    const { res, text } = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      logHttpIssue({ op: "fetch_text", url, status: res.status, text, headers: res.headers, error: "HTTP_ERROR" });
    }
    return { res, text };
  }, { retries: 2, baseDelayMs: 600 });
}

async function fetchJson(url, { headers } = {}) {
  const { res, text } = await fetchText(url, { headers });
  const bytes = Buffer.byteLength(text || "", "utf8");
  if (text.trim().startsWith("<")) {
    logHttpIssue({ op: "fetch_json", url, status: res.status, text, headers: res.headers, error: "HTML_RESPONSE" });
    const error = new Error("HTML response");
    error.httpStatus = res.status;
    error.bytes = bytes;
    throw error;
  }
  if (!res.ok) {
    logHttpIssue({ op: "fetch_json", url, status: res.status, text, headers: res.headers, error: "HTTP_ERROR" });
    const error = new Error(`HTTP ${res.status}`);
    error.httpStatus = res.status;
    error.bytes = bytes;
    throw error;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    logHttpIssue({ op: "fetch_json", url, status: res.status, text, headers: res.headers, error: "JSON_PARSE_ERROR" });
    const error = new Error("JSON parse error");
    error.httpStatus = res.status;
    error.bytes = bytes;
    throw error;
  }
  return { json, bytes, httpStatus: res.status };
}

function normalizeMetaStatus(payload) {
  return payload?.meta?.status || payload?.dataQuality?.status || "UNKNOWN";
}

const PROVIDERS = {
  "top-movers": [
    { name: "alphavantage", keyEnv: "ALPHAVANTAGE_API_KEY", fn: fetchTopMoversAlphaVantage },
    { name: "fmp", keyEnv: "FMP_API_KEY", fn: fetchTopMoversFmp },
    { name: "finnhub", keyEnv: "FINNHUB_API_KEY", fn: fetchTopMoversFinnhub },
    { name: "yahoo", enabledEnv: "ALLOW_YAHOO", fn: fetchTopMoversYahoo }
  ],
  "yield-curve": [
    { name: "fred", keyEnv: "FRED_API_KEY", fn: fetchYieldCurveFRED },
    { name: "treasury", enabledEnv: "ALLOW_TREASURY", fn: fetchYieldCurveTreasury }
  ],
  "sector-rotation": [
    { name: "fmp", keyEnv: "FMP_API_KEY", fn: fetchSectorRotationFmp },
    { name: "stooq", fn: fetchSectorRotationStooq }
  ],
  "market-health": [
    { name: "market-health", fn: fetchMarketHealthUpstream }
  ]
};

function extractTopMoversItems(payload) {
  const stocks = payload?.data?.stocks || {};
  const items =
    stocks.volumeLeaders?.length
      ? stocks.volumeLeaders
      : stocks.gainers?.length
        ? stocks.gainers
        : stocks.losers?.length
          ? stocks.losers
          : [];
  return { items, context: { universe: stocks.universe || [] } };
}

function extractYieldCurveItems(payload) {
  const yields = payload?.data?.yields || {};
  const items = Object.entries(yields)
    .filter(([, value]) => Number.isFinite(value))
    .map(([tenor, value]) => ({ tenor, value }));
  return { items, context: { spreads: payload?.data?.spreads || {} } };
}

function extractSectorRotationItems(payload) {
  const items = Array.isArray(payload?.data?.sectors) ? payload.data.sectors : [];
  // Also preserve sectors in context for build-snapshots.mjs to find them
  const context = {
    sectors: items,
    rotationLabel: payload?.data?.rotationLabel || "Neutral",
    groups: payload?.data?.groups || {},
    spyChangePercent: payload?.data?.spyChangePercent || null
  };
  return { items, context };
}

function extractMarketHealthItems(payload) {
  const indices = payload?.data?.indices || [];
  const commodities = payload?.data?.commodities || [];
  const crypto = payload?.data?.crypto || [];
  const items = [...indices, ...commodities, ...crypto];
  return {
    items,
    context: {
      fng: payload?.data?.fng || null,
      fngStocks: payload?.data?.fngStocks || null,
      btc: payload?.data?.btc || null,
      source: payload?.data?.source || null
    }
  };
}

function extractItems(featureId, payload) {
  switch (featureId) {
    case "top-movers":
      return extractTopMoversItems(payload);
    case "yield-curve":
      return extractYieldCurveItems(payload);
    case "sector-rotation":
      return extractSectorRotationItems(payload);
    case "market-health":
      return extractMarketHealthItems(payload);
    default:
      return { items: Array.isArray(payload?.data?.items) ? payload.data.items : [], context: {} };
  }
}

function validateFeature(featureId, payload, items) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "payload_missing" };
  const metaStatus = normalizeMetaStatus(payload);
  if (!metaStatus || metaStatus === "UNKNOWN") return { ok: false, reason: "meta_missing" };
  if (featureId === "yield-curve") {
    return { ok: items.length >= 5, reason: items.length >= 5 ? null : "not_enough_points" };
  }
  if (featureId === "sector-rotation") {
    return { ok: items.length >= 3, reason: items.length >= 3 ? null : "not_enough_rows" };
  }
  if (featureId === "market-health") {
    const hasData =
      (payload?.data?.indices || []).length ||
      (payload?.data?.commodities || []).length ||
      (payload?.data?.crypto || []).length ||
      payload?.data?.fng ||
      payload?.data?.fngStocks;
    return { ok: Boolean(hasData), reason: hasData ? null : "no_market_data" };
  }
  const ok = items.length > 0;
  return { ok, reason: ok ? null : "empty_items" };
}

function classifyError(err) {
  if (!err) return { reason: "UNKNOWN", httpCode: null };
  if (err.code === "TIMEOUT" || err.name === "AbortError") return { reason: "TIMEOUT", httpCode: null };
  const httpCode = err.httpStatus ?? err.status ?? null;
  if (httpCode === 401) return { reason: "HTTP_401", httpCode };
  if (httpCode === 403) return { reason: "HTTP_403", httpCode };
  if (httpCode === 404) return { reason: "HTTP_404", httpCode };
  if (httpCode === 429) return { reason: "HTTP_429", httpCode };
  if (httpCode && httpCode >= 500) return { reason: "HTTP_5XX", httpCode };
  if (err.message === "HTML response") return { reason: "HTML_RESPONSE", httpCode };
  return { reason: "UNKNOWN", httpCode };
}

function checkTopMoversSanity(items) {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, reason: "empty_items" };
  const hasValid = items.some((item) =>
    item &&
    typeof item.symbol === "string" &&
    item.symbol.length > 0 &&
    Number.isFinite(item.price ?? item.lastClose ?? null) &&
    Number.isFinite(item.changePercent ?? null)
  );
  return { ok: hasValid, reason: hasValid ? null : "missing_fields" };
}

function checkYieldCurveSanity(items) {
  if (!Array.isArray(items)) return { ok: false, reason: "no_points" };
  const validPoints = items.filter((point) => Number.isFinite(point.value));
  const ok = validPoints.length >= 5 && validPoints.every((point) => point.value > 0);
  return { ok, reason: ok ? null : "not_enough_points" };
}

function buildResult(featureId, status, { providerUsed, reason, httpCode, wrote, timestamp }) {
  return {
    feature: featureId,
    status,
    providerUsed: providerUsed || null,
    reason: reason || null,
    httpCode: Number.isFinite(httpCode) ? httpCode : null,
    wrote: Boolean(wrote),
    timestamp: timestamp || new Date().toISOString()
  };
}

async function runProviderWaterfall(featureId) {
  const providers = PROVIDERS[featureId] || [];
  const skipped = [];
  const failures = [];
  for (const provider of providers) {
    const eligibility = shouldUseProvider({ ...provider, feature: featureId });
    if (!eligibility.ok) {
      skipped.push({ provider: provider.name, reason: eligibility.reason, detail: eligibility.detail || null });
      continue;
    }
    try {
      const result = await provider.fn();
      const payload = buildPayload({
        featureId,
        data: result.data,
        upstreamUrl: result.upstreamUrl,
        upstreamStatus: result.upstreamStatus,
        reason: result.reason || null,
        provider: result.provider
      });
      const { items, context } = extractItems(featureId, payload);
      const validation = validateFeature(featureId, payload, items);
      if (!validation.ok) {
        failures.push({ provider: provider.name, reason: "SANITY_FAIL", detail: validation.reason });
        continue;
      }
      if (featureId === "top-movers") {
        const moversCheck = checkTopMoversSanity(items);
        if (!moversCheck.ok) {
          failures.push({ provider: provider.name, reason: "SANITY_FAIL", detail: moversCheck.reason });
          continue;
        }
      }
      if (featureId === "yield-curve") {
        const curveCheck = checkYieldCurveSanity(items);
        if (!curveCheck.ok) {
          failures.push({ provider: provider.name, reason: "SANITY_FAIL", detail: curveCheck.reason });
          continue;
        }
      }
      return {
        ok: true,
        providerUsed: provider.name,
        payload,
        items,
        context,
        httpStatus: result.upstreamStatus ?? null
      };
    } catch (err) {
      const { reason, httpCode } = classifyError(err);
      failures.push({ provider: provider.name, reason, detail: err.message || null, httpCode });
    }
  }
  return {
    ok: false,
    skipped,
    failures
  };
}

function buildMirror(featureId, payload, items, context, sourceUpstreamOverride) {
  const metaStatus = normalizeMetaStatus(payload);
  const mode = metaStatus === "LIVE" ? "LIVE" : metaStatus === "STALE" ? "EOD" : "EMPTY";
  const dataQuality = metaStatus === "LIVE" ? "OK" : metaStatus === "STALE" ? "STALE" : "EMPTY";
  const sourceUpstream = sourceUpstreamOverride || payload?.data?.source || "unknown";
  const mirror = buildBaseMirror({
    mirrorId: featureId,
    mode,
    cadence: "best_effort",
    trust: "derived",
    sourceUpstream,
    whyUnique: `Seeded from ${featureId} upstream`,
    items,
    context,
    errors: payload?.error ? [payload.error] : [],
    notes: payload?.meta?.reason ? [payload.meta.reason] : [],
    dataQuality
  });
  mirror.savedAt = mirror.updatedAt;
  mirror._meta = {
    updated_at: mirror.updatedAt,
    provider: sourceUpstream,
    status: metaStatus === "LIVE" ? "fresh" : "stale"
  };
  mirror.payload = payload;
  return mirror;
}

function buildPayload({ featureId, data, upstreamUrl, upstreamStatus, reason, provider }) {
  const ts = new Date().toISOString();
  const hasData = data && typeof data === "object" && Object.keys(data).length > 0;
  const metaStatus = hasData ? "LIVE" : "EMPTY";
  const safeUpstreamUrl = sanitizeUrl(upstreamUrl || provider || "upstream");
  return {
    ok: hasData,
    feature: featureId,
    ts,
    traceId: "seed",
    schemaVersion: 1,
    cache: { hit: false, ttl: 0, layer: "seed" },
    upstream: { url: safeUpstreamUrl, status: upstreamStatus ?? null, snippet: "" },
    rateLimit: { remaining: "unknown", reset: null, estimated: true },
    dataQuality: {
      status: metaStatus === "LIVE" ? "LIVE" : "NO_DATA",
      reason: metaStatus === "LIVE" ? "LIVE" : reason || "NO_DATA",
      missingFields: []
    },
    meta: {
      status: metaStatus,
      reason: metaStatus === "LIVE" ? null : reason || "NO_DATA"
    },
    data
  };
}

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

function normalizeStocksFromQuotes(results, provider) {
  const map = new Map(results.map((item) => [item.symbol, item]));
  const rows = STOCK_UNIVERSE.map((entry) => {
    const quote = map.get(entry.symbol) || {};
    return {
      symbol: entry.symbol,
      name: quote.shortName || quote.longName || entry.label || entry.symbol,
      price: quote.price ?? quote.regularMarketPrice ?? null,
      lastClose: quote.previousClose ?? quote.regularMarketPreviousClose ?? quote.price ?? quote.regularMarketPrice ?? null,
      changePercent:
        quote.changePercent ?? quote.regularMarketChangePercent ?? (Number.isFinite(quote.dp) ? quote.dp : null),
      volume: quote.volume ?? quote.regularMarketVolume ?? null,
      ts: new Date().toISOString(),
      source: provider
    };
  });
  const volumes = rows.filter((row) => typeof row.volume === "number");
  const sortedByVolume = volumes.slice().sort((a, b) => b.volume - a.volume);
  const fallbackSort = rows
    .slice()
    .sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
  const volumeLeaders = sortedByVolume.length ? sortedByVolume.slice(0, 10) : fallbackSort.slice(0, 10);
  const volumeLaggards = sortedByVolume.length
    ? sortedByVolume.slice(-10).reverse()
    : fallbackSort.slice(-10).reverse();
  return {
    volumeLeaders,
    volumeLaggards,
    gainers: volumeLeaders,
    losers: volumeLaggards,
    universe: STOCK_UNIVERSE.map((entry) => entry.symbol)
  };
}

function buildTopMoversStocks({ gainers, losers, provider }) {
  const gainersRows = Array.isArray(gainers) ? gainers : [];
  const losersRows = Array.isArray(losers) ? losers : [];
  const volumeLeaders = gainersRows.slice(0, 10);
  const volumeLaggards = losersRows.slice(0, 10);
  return {
    volumeLeaders,
    volumeLaggards,
    gainers: volumeLeaders,
    losers: volumeLaggards,
    universe: Array.from(new Set([...gainersRows, ...losersRows].map((row) => row.symbol).filter(Boolean))),
    provider
  };
}

async function fetchTopMoversAlphaVantage() {
  await throttleAlphaVantage();
  const url = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${ALPHAVANTAGE_API_KEY}`;
  const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
  const gainers = Array.isArray(result.json?.top_gainers) ? result.json.top_gainers : [];
  const losers = Array.isArray(result.json?.top_losers) ? result.json.top_losers : [];
  const toRow = (item) => ({
    symbol: item.ticker || item.symbol || null,
    name: item.company_name || item.name || item.ticker || item.symbol || null,
    price: parseNumber(item.price),
    lastClose: null,
    changePercent: parseChangePercent(item.change_percentage || item.changePercent),
    volume: parseNumber(item.volume),
    ts: new Date().toISOString(),
    source: "alphavantage"
  });
  const gainersRows = gainers.map(toRow).filter((row) => row.symbol);
  const losersRows = losers.map(toRow).filter((row) => row.symbol);
  return {
    provider: "alphavantage",
    upstreamStatus: result.httpStatus ?? 200,
    upstreamUrl: url,
    data: {
      updatedAt: new Date().toISOString(),
      source: "alphavantage",
      method: "AlphaVantage TOP_GAINERS_LOSERS.",
      crypto: [],
      stocks: buildTopMoversStocks({ gainers: gainersRows, losers: losersRows, provider: "alphavantage" })
    }
  };
}

async function fetchTopMoversFinnhub() {
  const quotes = [];
  for (const entry of STOCK_UNIVERSE) {
    const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(entry.symbol)}&token=${FINNHUB_API_KEY}`;
    const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
    const data = result.json || {};
    quotes.push({
      symbol: entry.symbol,
      shortName: entry.label,
      price: data.c ?? null,
      previousClose: data.pc ?? null,
      changePercent: Number.isFinite(data.dp) ? data.dp : null,
      volume: null
    });
  }
  return {
    provider: "finnhub",
    upstreamStatus: 200,
    upstreamUrl: "finnhub",
    data: {
      updatedAt: new Date().toISOString(),
      source: "finnhub",
      method: "Top movers computed from fixed mega-cap universe.",
      crypto: [],
      stocks: normalizeStocksFromQuotes(quotes, "finnhub")
    }
  };
}

async function fetchTopMoversFmp() {
  const url = `${FMP_QUOTE_URL}/${STOCK_UNIVERSE.map((entry) => entry.symbol).join(",")}?apikey=${FMP_API_KEY}`;
  const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
  const results = Array.isArray(result.json) ? result.json : [];
  const quotes = results.map((item) => ({
    symbol: item.symbol,
    shortName: item.name,
    price: parseNumber(item.price),
    previousClose: parseNumber(item.previousClose),
    changePercent: parseChangePercent(item.changesPercentage),
    volume: parseNumber(item.volume)
  }));
  return {
    provider: "fmp",
    upstreamStatus: result.httpStatus ?? 200,
    upstreamUrl: FMP_QUOTE_URL,
    data: {
      updatedAt: new Date().toISOString(),
      source: "fmp",
      method: "Top movers computed from fixed mega-cap universe.",
      crypto: [],
      stocks: normalizeStocksFromQuotes(quotes, "fmp")
    }
  };
}

async function fetchTopMoversYahoo() {
  const result = await fetchJson(YAHOO_URL, { headers: buildUpstreamHeaders() });
  const results = result.json?.quoteResponse?.result || [];
  return {
    provider: "yahoo",
    upstreamStatus: result.httpStatus ?? 200,
    upstreamUrl: YAHOO_URL,
    data: {
      updatedAt: new Date().toISOString(),
      source: "yahoo",
      method: "Top movers computed by last trading day volume within a fixed mega-cap universe.",
      crypto: [],
      stocks: normalizeStocksFromQuotes(results, "yahoo")
    }
  };
}

function parseYieldCurveCsv(csv) {
  const trimmed = csv.trim();
  if (!trimmed || trimmed.startsWith("<")) return null;
  const lines = trimmed.split("\n");
  if (lines.length < 2 || !lines[0].toLowerCase().includes("date")) return null;
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const lastLine = lines[lines.length - 1];
  const values = lastLine.split(",").map((v) => v.replace(/^"|"$/g, "").trim());
  if (headers.length !== values.length) return null;
  const row = Object.fromEntries(headers.map((key, idx) => [key, values[idx]]));
  const date = row.date ? new Date(row.date).toISOString() : new Date().toISOString();
  const yields = {
    "1m": parseNumber(row["1 mo"] || row["1 month"]),
    "3m": parseNumber(row["3 mo"] || row["3 month"]),
    "6m": parseNumber(row["6 mo"] || row["6 month"]),
    "1y": parseNumber(row["1 yr"] || row["1 year"]),
    "2y": parseNumber(row["2 yr"] || row["2 year"]),
    "3y": parseNumber(row["3 yr"] || row["3 year"]),
    "5y": parseNumber(row["5 yr"] || row["5 year"]),
    "7y": parseNumber(row["7 yr"] || row["7 year"]),
    "10y": parseNumber(row["10 yr"] || row["10 year"]),
    "20y": parseNumber(row["20 yr"] || row["20 year"]),
    "30y": parseNumber(row["30 yr"] || row["30 year"])
  };
  const spreads = {
    tenTwo:
      yields["10y"] !== null && yields["2y"] !== null ? yields["10y"] - yields["2y"] : null,
    tenThreeMonth:
      yields["10y"] !== null && yields["3m"] !== null ? yields["10y"] - yields["3m"] : null
  };
  return {
    updatedAt: date,
    yields,
    spreads,
    inversion: {
      tenTwo: spreads.tenTwo !== null ? spreads.tenTwo < 0 : null,
      tenThreeMonth: spreads.tenThreeMonth !== null ? spreads.tenThreeMonth < 0 : null
    },
    source: "US Treasury"
  };
}

async function fetchYieldCurveFRED() {
  const yields = {};
  let observedAt = null;
  for (const [tenor, seriesId] of Object.entries(FRED_YIELD_SERIES)) {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
    const obs = Array.isArray(result.json?.observations) ? result.json.observations[0] : null;
    const value = obs ? parseNumber(obs.value) : null;
    if (obs?.date) {
      observedAt = obs.date;
    }
    yields[tenor] = value;
  }
  const updatedAt = observedAt ? new Date(observedAt).toISOString() : new Date().toISOString();
  const spreads = {
    tenTwo:
      yields["10y"] !== null && yields["2y"] !== null ? yields["10y"] - yields["2y"] : null,
    tenThreeMonth:
      yields["10y"] !== null && yields["3m"] !== null ? yields["10y"] - yields["3m"] : null
  };
  return {
    provider: "fred",
    upstreamStatus: 200,
    upstreamUrl: "fred",
    data: {
      updatedAt,
      yields,
      spreads,
      inversion: {
        tenTwo: spreads.tenTwo !== null ? spreads.tenTwo < 0 : null,
        tenThreeMonth: spreads.tenThreeMonth !== null ? spreads.tenThreeMonth < 0 : null
      },
      source: "FRED"
    }
  };
}

async function fetchYieldCurveTreasury() {
  const result = await fetchText(TREASURY_CSV_URL, { headers: { ...buildUpstreamHeaders(), Accept: "text/csv" } });
  const bytes = Buffer.byteLength(result.text || "", "utf8");
  if (!result.res.ok) {
    const error = new Error(`HTTP ${result.res.status}`);
    error.httpStatus = result.res.status;
    error.bytes = bytes;
    throw error;
  }
  const data = parseYieldCurveCsv(result.text || "");
  if (!data) {
    const error = new Error("csv_parse_failed");
    error.httpStatus = result.res.status;
    error.bytes = bytes;
    throw error;
  }
  return {
    provider: "treasury",
    upstreamStatus: result.res.status ?? 200,
    upstreamUrl: TREASURY_CSV_URL,
    data
  };
}

function computeChangePercent(closes) {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

async function fetchSectorRotationFmp() {
  const url = `${FMP_QUOTE_URL}/${SECTOR_SYMBOLS.concat("SPY").join(",")}?apikey=${FMP_API_KEY}`;
  const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
  const list = Array.isArray(result.json) ? result.json : [];
  const spy = list.find((item) => item.symbol === "SPY");
  const spyChange = spy ? parseChangePercent(spy.changesPercentage) : null;
  const sectors = list
    .filter((item) => SECTOR_SYMBOLS.includes(item.symbol))
    .map((item) => ({
      symbol: item.symbol,
      name: item.name || item.symbol,
      price: parseNumber(item.price),
      changePercent: parseChangePercent(item.changesPercentage),
      relativeToSpy:
        typeof spyChange === "number" && Number.isFinite(parseChangePercent(item.changesPercentage))
          ? parseChangePercent(item.changesPercentage) - spyChange
          : null
    }))
    .filter((item) => item.symbol);
  return {
    provider: "fmp",
    upstreamStatus: result.httpStatus ?? 200,
    upstreamUrl: FMP_QUOTE_URL,
    data: {
      updatedAt: new Date().toISOString(),
      rotationLabel: "Neutral",
      groups: {},
      spyChangePercent: spyChange,
      sectors,
      source: "fmp"
    }
  };
}

async function fetchSectorRotationStooq() {
  const spy = await fetchStooqDaily("SPY");
  const spyChange = computeChangePercent(spy?.closes || []);
  const sectors = [];
  for (const symbol of SECTOR_SYMBOLS) {
    try {
      const data = await fetchStooqDaily(symbol);
      const latest = data.closes[data.closes.length - 1] ?? null;
      const changePercent = computeChangePercent(data.closes);
      sectors.push({
        symbol,
        name: symbol,
        price: latest ?? null,
        changePercent,
        relativeToSpy:
          typeof changePercent === "number" && typeof spyChange === "number"
            ? changePercent - spyChange
            : null
      });
    } catch (err) {
      continue;
    }
  }
  return {
    provider: "stooq",
    upstreamStatus: 200,
    upstreamUrl: "stooq",
    data: {
      updatedAt: new Date().toISOString(),
      rotationLabel: "Neutral",
      groups: {},
      spyChangePercent: spyChange ?? null,
      sectors,
      source: "stooq"
    }
  };
}

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

async function fetchMarketHealthUpstream() {
  const fetchSafe = async (url) => {
    try {
      const result = await fetchJson(url, { headers: buildUpstreamHeaders() });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err };
    }
  };

  const yahooPromise = ALLOW_YAHOO
    ? fetchSafe(YAHOO_MARKET_URL)
    : Promise.resolve({ ok: false, error: new Error("CONFIG_MISSING") });

  const [fng, stocks, crypto, yahoo] = await Promise.all([
    fetchSafe(FNG_URL),
    fetchSafe(FNG_STOCKS_URL),
    fetchSafe(COINGECKO_URL),
    yahooPromise
  ]);

  const errors = [];
  if (!fng.ok) errors.push("fng_failed");
  if (!stocks.ok) errors.push("stocks_failed");
  if (!crypto.ok) errors.push("crypto_failed");
  if (!yahoo.ok) errors.push(ALLOW_YAHOO ? "yahoo_failed" : "yahoo_disabled");

  const fngData = normalizeFng(fng.json || {});
  const fngStocks = normalizeFngStocks(stocks.json || {});
  const cryptoData = normalizeCrypto(crypto.json || {});
  const yahooData = ALLOW_YAHOO ? normalizeYahoo(yahoo.json || {}) : { indices: [], commodities: [] };
  const btcEntry = cryptoData.find((entry) => entry.symbol === "BTC");

  const data = {
    updatedAt: new Date().toISOString(),
    source: ALLOW_YAHOO ? "alternative.me, cnn, coingecko, yahoo" : "alternative.me, cnn, coingecko",
    fng: fngData,
    fngStocks,
    btc: btcEntry
      ? {
          usd: btcEntry.price ?? null,
          usd_24h_change: btcEntry.changePercent ?? null
        }
      : { usd: null, usd_24h_change: null },
    crypto: cryptoData,
    indices: yahooData.indices,
    commodities: yahooData.commodities
  };

  const hasData =
    data.fng ||
    data.fngStocks ||
    (data.crypto || []).length ||
    (data.indices || []).length ||
    (data.commodities || []).length;
  if (!hasData) {
    const error = new Error("no_market_data");
    error.httpStatus = null;
    throw error;
  }

  return {
    provider: "alternative.me/cnn/coingecko/yahoo",
    upstreamStatus: 200,
    upstreamUrl: `${FNG_URL} | ${FNG_STOCKS_URL} | ${COINGECKO_URL} | ${YAHOO_MARKET_URL}`,
    data,
    reason: errors.length ? "PARTIAL_UPSTREAM" : null
  };
}

async function seed() {
  if (DRY_RUN) {
    const dryDetails = FEATURES.map((featureId) => {
      const providers = PROVIDERS[featureId] || [];
      const eligible = providers
        .map((provider) => ({ provider, eligibility: shouldUseProvider({ ...provider, feature: featureId }) }))
        .filter((entry) => entry.eligibility.ok)
        .map((entry) => entry.provider.name);
      const status = eligible.length ? "READY" : "CONFIG_MISSING";
      return { feature: featureId, status, eligibleProviders: eligible };
    });
    const readyCount = dryDetails.filter((entry) => entry.status === "READY").length;
    logEvent({
      level: "info",
      op: "dry-run",
      readyCount,
      total: dryDetails.length
    });
    console.log(JSON.stringify({ summary: { readyCount, total: dryDetails.length }, details: dryDetails }));
    return;
  }

  if (FRED_API_KEY && FRED_API_KEY.length) {
    logEvent({ level: "info", op: "env", feature: "fred", configured: true });
  }
  if (MARKETAUX_KEY && MARKETAUX_KEY.length) {
    logEvent({ level: "info", op: "env", feature: "marketaux", configured: true });
  }

  const summary = {
    savedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    summary: { ok: 0, bad: 0, total: FEATURES.length },
    blocks: {}
  };
  const results = [];

  for (const featureId of FEATURES) {
    const mirrorPath = path.resolve(process.cwd(), "mirrors", `${featureId}.json`);
    const existing = loadMirror(mirrorPath);
    const attempt = await runProviderWaterfall(featureId);
    const timestamp = new Date().toISOString();
    if (attempt.ok) {
      const payload = attempt.payload;
      const metaStatus = normalizeMetaStatus(payload);
      const metaReason = payload?.meta?.reason ?? null;
      const { items, context } = extractItems(featureId, payload);
      const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
      logEvent({
        level: "info",
        op: "seed",
        feature: featureId,
        provider: attempt.providerUsed,
        upstream: sanitizeUrl(payload?.upstream?.url || attempt.providerUsed),
        http: attempt.httpStatus,
        bytes,
        metaStatus,
        metaReason,
        dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).length : 0,
        valid: true
      });

      const mirror = buildMirror(featureId, payload, items, context, attempt.providerUsed);
      if (!DRY_RUN_LIVE) {
        for (const dir of OUT_DIRS) {
          const outPath = path.resolve(process.cwd(), dir, `${featureId}.json`);
          saveMirror(outPath, mirror);
        }
      }
      summary.blocks[featureId] = {
        ok: true,
        http: attempt.httpStatus,
        bytes,
        provider: attempt.providerUsed,
        metaStatus,
        metaReason,
        write: DRY_RUN_LIVE ? "SKIPPED" : existing ? "UPDATED" : "CREATED",
        error: null
      };
      summary.summary.ok += 1;
      results.push(buildResult(featureId, "FRESH", {
        providerUsed: attempt.providerUsed,
        reason: "OK",
        httpCode: attempt.httpStatus,
        wrote: !DRY_RUN_LIVE,
        timestamp
      }));
      continue;
    }

    const failedReason = attempt.failures?.[0]?.reason || (attempt.skipped?.length ? "CONFIG_MISSING" : "UNKNOWN");
    const failureHttp = attempt.failures?.[0]?.httpCode ?? null;
    if (attempt.skipped?.length) {
      logEvent({
        level: "warn",
        op: "provider_skip",
        feature: featureId,
        skipped: attempt.skipped
      });
    }
    if (attempt.failures?.length) {
      logEvent({
        level: "error",
        op: "provider_fail",
        feature: featureId,
        failures: attempt.failures
      });
    }

    const status = existing ? "STALE" : "FAILED";
    const okForSummary = status === "STALE";
    summary.blocks[featureId] = {
      ok: okForSummary,
      http: failureHttp,
      bytes: 0,
      provider: null,
      metaStatus: null,
      metaReason: failedReason,
      write: "SKIPPED",
      error: failedReason
    };
    if (okForSummary) {
      summary.summary.ok += 1;
    } else if (failedReason !== "CONFIG_MISSING") {
      summary.summary.bad += 1;
    }
    results.push(buildResult(featureId, status, {
      providerUsed: null,
      reason: failedReason,
      httpCode: failureHttp,
      wrote: false,
      timestamp
    }));
  }

  const healthPath = path.resolve(process.cwd(), "mirrors/_health.json");
  saveMirror(healthPath, {
    schemaVersion: "1.0",
    mirrorId: "_health",
    mode: "EOD",
    cadence: "best_effort",
    trust: "derived",
    sourceUpstream: "seed-mirrors",
    whyUnique: "Seeder health report",
    items: [],
    context: summary
  });

  const okCount = results.filter((entry) => entry.status === "FRESH" || entry.status === "STALE").length;
  const failCount = results.filter((entry) => entry.status === "FAILED" && entry.reason !== "CONFIG_MISSING").length;
  const criticalFailed = results.filter(
    (entry) => CRITICAL_FEATURES.has(entry.feature) && entry.status === "FAILED"
  );

  const summaryLine = {
    summary: {
      okCount,
      failCount,
      criticalFailed: criticalFailed.map((entry) => entry.feature),
      minOk: MIN_OK_FEATURES,
      maxFail: MAX_FAIL_FEATURES
    },
    details: results
  };
  console.log(JSON.stringify(summaryLine));
  console.log(
    `okCount=${okCount} failCount=${failCount} criticalFailed=[${criticalFailed.map((entry) => entry.feature).join(", ")}] exitCode=0`
  );

  if (okCount === 0) {
    process.exit(1);
  }
  if (criticalFailed.length) {
    process.exit(1);
  }
  if (okCount < MIN_OK_FEATURES) {
    process.exit(1);
  }
  if (failCount > MAX_FAIL_FEATURES) {
    process.exit(1);
  }
}

seed().catch((error) => {
  console.error(`[seed-mirrors] fatal: ${error.message}`);
  process.exitCode = 1;
});
