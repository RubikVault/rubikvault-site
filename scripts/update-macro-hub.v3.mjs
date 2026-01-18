import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { sanitizeForPublic, assertPublicSafe } from "./_lib/sanitize-public.mjs";
import { saveMirror } from "./utils/mirror-io.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CATALOG_PATH = path.join(ROOT, "config", "macro-hub.catalog.v3.json");
const SNAPSHOT_PATH = path.join(ROOT, "public", "data", "snapshots", "macro-hub.json");
const LASTGOOD_SNAPSHOT_PATH = SNAPSHOT_PATH; // SSOT lastGood: same path as snapshot
const LASTGOOD_PATH = path.join(ROOT, "public", "data", "snapshots", "macro-hub.lastgood.json");
const PROVIDER_STATE_PATH = path.join(ROOT, "public", "data", "provider-state.json");
const RUNLOG_PATH = path.join(ROOT, "mirrors", "macro-hub-runlog.json");
const MIRROR_PATH = path.join(ROOT, "mirrors", "macro-hub.json");
const MAX_PUBLIC_BYTES = 200 * 1024;

const CONCURRENCY = 5;
const RETRIES = 3;
const TIMEOUT_MS = 8000;
const RUN_ID = new Date().toISOString();

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const FINNHUB_BASE = "https://finnhub.io/api/v1/quote";
const FMP_BASE = "https://financialmodelingprep.com/api/v3";
const ALPHAVANTAGE_BASE = "https://www.alphavantage.co/query";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const DEFILLAMA_BASE = "https://stablecoins.llama.fi";

const DAILY_SERIES = new Set([
  "VIXCLS",
  "VIX3M",
  "T10Y2Y",
  "DGS2",
  "DGS10",
  "DGS30",
  "SOFR",
  "EFFR",
  "BAMLH0A0HYM2",
  "BAMLC0A0CM",
  "BAMLC0A4CBBB",
  "BAA",
  "DTWEXBGS",
  "DEXUSEU",
  "DEXJPUS",
  "GOLDAMGBD228NLBM",
  "DCOILWTICO",
  "WILSHIRE5000IND"
]);
const MONTHLY_SERIES = new Set(["CPIAUCSL", "UNRATE"]);
const QUARTERLY_SERIES = new Set(["GDP"]);

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJson(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(payload, null, 2));
}

function sanitizeAndWritePublic(filePath, payload) {
  const sanitized = sanitizeForPublic(payload);
  assertPublicSafe(sanitized, path.basename(filePath));
  const raw = JSON.stringify(sanitized, null, 2);
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > MAX_PUBLIC_BYTES) {
    throw new Error(`public_snapshot_too_large:${path.basename(filePath)}:${bytes}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, raw);
}

function toDateString(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit) return;
    const task = queue.shift();
    if (!task) return;
    active += 1;
    task()
      .catch(() => {})
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return function run(task) {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        }
      });
      next();
    });
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(fn, { retries = RETRIES } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const base = 300 * Math.pow(2, attempt);
        const jitter = base * (0.8 + Math.random() * 0.4);
        await sleep(jitter);
      }
    }
  }
  throw lastError;
}

function loadBudgets() {
  const configPath = path.join(ROOT, "config", "rv-budgets.json");
  if (fs.existsSync(configPath)) {
    const payload = readJson(configPath);
    if (payload && typeof payload === "object") return payload;
  }
  const providers = {};
  const ids = ["fred", "finnhub", "fmp", "alphavantage", "coingecko", "defillama", "eia"];
  ids.forEach((id) => {
    const daily = Number(process.env[`RV_BUDGET_${id.toUpperCase()}_DAILY`] || "");
    const monthly = Number(process.env[`RV_BUDGET_${id.toUpperCase()}_MONTHLY`] || "");
    if (Number.isFinite(daily) || Number.isFinite(monthly)) {
      providers[id] = {
        dailyRequests: Number.isFinite(daily) ? daily : null,
        monthlyRequests: Number.isFinite(monthly) ? monthly : null
      };
    }
  });
  return { providers };
}

function createBudgetGuard(budgets) {
  const usage = {};
  function getProviderBudget(providerId) {
    const providers = budgets?.providers || {};
    return providers[providerId] || {};
  }
  function getEndpointBudget(providerId, endpointId) {
    const provider = getProviderBudget(providerId);
    const endpoints = provider?.endpoints || {};
    return endpoints[endpointId] || {};
  }
  function canCall(providerId, endpointId) {
    const providerBudget = getProviderBudget(providerId);
    const endpointBudget = endpointId ? getEndpointBudget(providerId, endpointId) : {};
    const limit = endpointBudget.dailyRequests ?? providerBudget.dailyRequests ?? null;
    if (limit === null || limit === undefined) return true;
    const used = usage?.[providerId]?.[endpointId || "__total"] || 0;
    return used < limit;
  }
  function record(providerId, endpointId) {
    if (!usage[providerId]) usage[providerId] = {};
    const key = endpointId || "__total";
    usage[providerId][key] = (usage[providerId][key] || 0) + 1;
  }
  function toProviderCalls() {
    const out = {};
    Object.keys(usage).forEach((provider) => {
      const totals = usage[provider] || {};
      const sum = Object.values(totals).reduce((acc, v) => acc + Number(v || 0), 0);
      out[provider.toUpperCase()] = sum;
    });
    return out;
  }
  return { canCall, record, usage, toProviderCalls };
}

async function fetchJson(url, { provider, endpoint, headers } = {}) {
  const limiter = fetchJson.limiter;
  const budget = fetchJson.budget;
  if (!budget.canCall(provider, endpoint)) {
    const error = new Error("BUDGET_EXCEEDED");
    error.code = "BUDGET_EXCEEDED";
    throw error;
  }
  return limiter(() => withRetries(async () => {
    budget.record(provider, endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...(headers || {}) },
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        const err = new Error(`HTTP_${response.status}`);
        err.status = response.status;
        err.body = text.slice(0, 200);
        throw err;
      }
      if (!text.trim()) {
        const err = new Error("EMPTY_RESPONSE");
        throw err;
      }
      try {
        return JSON.parse(text);
      } catch (error) {
        const err = new Error("INVALID_JSON");
        err.body = text.slice(0, 200);
        throw err;
      }
    } finally {
      clearTimeout(timeout);
    }
  }));
}

fetchJson.limiter = createLimiter(CONCURRENCY);
fetchJson.budget = createBudgetGuard(loadBudgets());

function toNumber(value) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num : null;
}

function normalizeSeriesObservations(observations = []) {
  const items = observations
    .map((obs) => ({ date: obs.date, value: toNumber(obs.value) }))
    .filter((obs) => obs.date && obs.value !== null);
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

function inferCadence(seriesId) {
  if (MONTHLY_SERIES.has(seriesId)) return "monthly";
  if (QUARTERLY_SERIES.has(seriesId)) return "quarterly";
  return "daily";
}

function selectLatest(series, asOfDate, weekendRule = "forwardFill") {
  if (!Array.isArray(series) || !series.length) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const obs = series[i];
    if (obs.date <= asOfDate) {
      if (weekendRule === "none" && obs.date !== asOfDate) return null;
      return { ...obs, index: i };
    }
  }
  return null;
}

function offsetForWindow(window, cadence) {
  const match = String(window || "").toUpperCase().match(/(\d+)([A-Z]+)/);
  if (!match) return 1;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "D") return value;
  if (unit === "M") return cadence === "monthly" ? value : value * 30;
  if (unit === "Q") return cadence === "quarterly" ? value : value * 90;
  if (unit === "Y") return cadence === "monthly" ? value * 12 : value * 365;
  return value;
}

function computeChange(series, index, { type, window, unit }, cadence) {
  if (!series || index === null || index === undefined) return { change: null, changeUnit: unit || "" };
  const offset = offsetForWindow(window, cadence);
  const prevIndex = index - offset;
  if (prevIndex < 0 || !series[prevIndex]) return { change: null, changeUnit: unit || "" };
  const current = series[index].value;
  const prev = series[prevIndex].value;
  if (current === null || prev === null) return { change: null, changeUnit: unit || "" };
  if (type === "pct") {
    if (prev === 0) return { change: null, changeUnit: unit || "%" };
    return { change: ((current - prev) / prev) * 100, changeUnit: unit || "%" };
  }
  if (type === "delta") {
    return { change: current - prev, changeUnit: unit || "" };
  }
  return { change: null, changeUnit: unit || "" };
}

function computeYoY(series, index, cadence) {
  const offset = cadence === "monthly" ? 12 : 1;
  const prevIndex = index - offset;
  if (prevIndex < 0 || !series[prevIndex]) return null;
  const current = series[index].value;
  const prev = series[prevIndex].value;
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function computeQoQ(series, index) {
  const prevIndex = index - 1;
  if (prevIndex < 0 || !series[prevIndex]) return null;
  const current = series[index].value;
  const prev = series[prevIndex].value;
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function computeReturn(series, index, window) {
  const offset = offsetForWindow(window, "daily");
  const prevIndex = index - offset;
  if (prevIndex < 0 || !series[prevIndex]) return null;
  const current = series[index].value;
  const prev = series[prevIndex].value;
  if (current === null || prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function applyBpIfNeeded(value, unit) {
  if (value === null || value === undefined) return null;
  if (unit === "bp") return value * 100;
  return value;
}

function computeStale(observedAt, ttlHours) {
  if (!observedAt) return { stale: true, reason: "missing" };
  const ageMs = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(ageMs)) return { stale: true, reason: "invalid_date" };
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours > ttlHours) return { stale: true, reason: "ttl_exceeded" };
  return { stale: false, reason: null };
}

async function fetchFredSeries(seriesId, limit, apiKey, errors) {
  if (!apiKey) {
    errors.push({ provider: "FRED", metric: seriesId, message: "missing_api_key" });
    return null;
  }
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const payload = await fetchJson(url, { provider: "fred", endpoint: "series" });
    const observations = Array.isArray(payload?.observations) ? payload.observations : [];
    return normalizeSeriesObservations(observations);
  } catch (error) {
    errors.push({ provider: "FRED", metric: seriesId, message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchFinnhubQuote(symbol, apiKey, errors) {
  if (!apiKey) {
    errors.push({ provider: "FINNHUB", metric: symbol, message: "missing_api_key" });
    return null;
  }
  const url = `${FINNHUB_BASE}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await fetchJson(url, { provider: "finnhub", endpoint: "quote" });
    const value = toNumber(payload?.c);
    const prev = toNumber(payload?.pc);
    if (value === null) return null;
    return { value, prev, observedAt: toDateString(new Date()) };
  } catch (error) {
    errors.push({ provider: "FINNHUB", metric: symbol, message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchFmpQuotes(symbols, apiKey, errors) {
  if (!apiKey) {
    errors.push({ provider: "FMP", metric: "quotes", message: "missing_api_key" });
    return null;
  }
  const url = `${FMP_BASE}/quote/${encodeURIComponent(symbols.join(","))}?apikey=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await fetchJson(url, { provider: "fmp", endpoint: "quotes" });
    if (!Array.isArray(payload)) return null;
    const map = {};
    payload.forEach((entry) => {
      const symbol = entry?.symbol;
      const value = toNumber(entry?.price);
      const prev = toNumber(entry?.previousClose);
      if (!symbol || value === null) return;
      map[symbol.toUpperCase()] = {
        value,
        prev,
        observedAt: entry?.timestamp ? new Date(entry.timestamp * 1000).toISOString().slice(0, 10) : toDateString()
      };
    });
    return map;
  } catch (error) {
    errors.push({ provider: "FMP", metric: "quotes", message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchAlphaVantageQuote(symbol, apiKey, errors) {
  if (!apiKey) {
    errors.push({ provider: "ALPHAVANTAGE", metric: symbol, message: "missing_api_key" });
    return null;
  }
  const url = `${ALPHAVANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await fetchJson(url, { provider: "alphavantage", endpoint: "quote" });
    const quote = payload?.["Global Quote"] || {};
    const value = toNumber(quote?.["05. price"]);
    const prev = toNumber(quote?.["08. previous close"]);
    if (value === null) return null;
    return { value, prev, observedAt: toDateString() };
  } catch (error) {
    errors.push({ provider: "ALPHAVANTAGE", metric: symbol, message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchFmpHistory(symbol, apiKey, limit, errors) {
  if (!apiKey) {
    errors.push({ provider: "FMP", metric: `${symbol}_history`, message: "missing_api_key" });
    return null;
  }
  const url = `${FMP_BASE}/historical-price-full/${encodeURIComponent(symbol)}?timeseries=${limit}&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await fetchJson(url, { provider: "fmp", endpoint: "history" });
    const items = Array.isArray(payload?.historical) ? payload.historical : [];
    const series = items
      .map((row) => ({ date: row?.date, value: toNumber(row?.close) }))
      .filter((row) => row.date && row.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    return series.length ? series : null;
  } catch (error) {
    errors.push({ provider: "FMP", metric: `${symbol}_history`, message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchAlphaVantageHistory(symbol, apiKey, errors) {
  if (!apiKey) {
    errors.push({ provider: "ALPHAVANTAGE", metric: `${symbol}_history`, message: "missing_api_key" });
    return null;
  }
  const url = `${ALPHAVANTAGE_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
  try {
    const payload = await fetchJson(url, { provider: "alphavantage", endpoint: "history" });
    const series = payload?.["Time Series (Daily)"] || null;
    if (!series || typeof series !== "object") return null;
    const points = Object.entries(series)
      .map(([date, row]) => ({ date, value: toNumber(row?.["4. close"]) }))
      .filter((row) => row.date && row.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    return points.length ? points : null;
  } catch (error) {
    errors.push({ provider: "ALPHAVANTAGE", metric: `${symbol}_history`, message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchCoinGeckoSimple(errors) {
  const url = `${COINGECKO_BASE}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`;
  try {
    return await fetchJson(url, { provider: "coingecko", endpoint: "simple" });
  } catch (error) {
    errors.push({ provider: "COINGECKO", metric: "simple", message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchCoinGeckoGlobal(errors) {
  const url = `${COINGECKO_BASE}/global`;
  try {
    return await fetchJson(url, { provider: "coingecko", endpoint: "global" });
  } catch (error) {
    errors.push({ provider: "COINGECKO", metric: "global", message: error.message || "fetch_failed" });
    return null;
  }
}

async function fetchDefiLlamaStable(errors) {
  const url = `${DEFILLAMA_BASE}/stablecoins`;
  try {
    return await fetchJson(url, { provider: "defillama", endpoint: "stable" });
  } catch (error) {
    errors.push({ provider: "DEFILLAMA", metric: "stablecoins", message: error.message || "fetch_failed" });
    return null;
  }
}

function buildMetaValidation(counts, total) {
  const ok = counts.total === total && counts.null <= total;
  return {
    schema: { ok, errors: ok ? [] : ["count_mismatch"] },
    ranges: { ok: true, errors: [] },
    integrity: { ok: true, errors: [] }
  };
}

function buildFreshness(asOfDate, ttlHours) {
  const asOf = new Date(asOfDate).getTime();
  const ageMinutes = Number.isFinite(asOf) ? Math.floor((Date.now() - asOf) / 60000) : null;
  const ttlMinutes = ttlHours * 60;
  let status = "unknown";
  if (ageMinutes === null) status = "unknown";
  else if (ageMinutes <= ttlMinutes) status = "fresh";
  else if (ageMinutes <= ttlMinutes * 2) status = "stale";
  else status = "expired";
  return { status, ageMinutes };
}

async function main() {
  // --- Load lastGood from SSOT (same path as snapshot) ---
  const lastGood = readJson(LASTGOOD_SNAPSHOT_PATH) || readJson(LASTGOOD_PATH);
  
  const catalog = readJson(CATALOG_PATH);
  if (!catalog) {
    throw new Error("macro-hub catalog missing");
  }
  const metricsList = Array.isArray(catalog.metrics) ? catalog.metrics : [];
  const categories = catalog.categories || {};

  const errors = [];
  const rawSources = {};

  const fredKey = process.env.FRED_API_KEY || "";
  const finnhubKey = process.env.FINNHUB_API_KEY || "";
  const fmpKey = process.env.FMP_API_KEY || "";
  const alphaKey = process.env.ALPHAVANTAGE_API_KEY || "";
  const coingeckoKey = process.env.COINGECKO_DEMO_KEY || "";

  const asOfDate = toDateString();

  const fredSeriesIds = new Set();
  metricsList.forEach((metric) => {
    metric.sources
      .filter((src) => src.provider === "FRED" && src.symbol)
      .forEach((src) => fredSeriesIds.add(src.symbol));
  });

  const fredSeriesData = {};
  for (const seriesId of fredSeriesIds) {
    const cadence = inferCadence(seriesId);
    const lookback = metricsList
      .filter((metric) => metric.sources.some((src) => src.provider === "FRED" && src.symbol === seriesId))
      .map((metric) => metric.history?.lookbackDays || 30)
      .reduce((a, b) => Math.max(a, b), 30);
    const limit = Math.max(5, Math.min(400, Math.ceil(lookback)));
    const data = await fetchFredSeries(seriesId, limit, fredKey, errors);
    if (data) {
      fredSeriesData[seriesId] = { cadence, series: data };
    }
  }

  rawSources.fred = Object.keys(fredSeriesData);

  const symbols = ["SPY", "QQQ", "IWM", "EWG", "EWJ"];
  const equityQuotes = {};
  if (finnhubKey) {
    await Promise.all(
      symbols.map(async (symbol) => {
        const quote = await fetchFinnhubQuote(symbol, finnhubKey, errors);
        if (quote) equityQuotes[symbol] = { ...quote, source: "FINNHUB" };
      })
    );
  }
  const missingQuotes = symbols.filter((symbol) => !equityQuotes[symbol]);
  if (missingQuotes.length) {
    const fmpQuotes = await fetchFmpQuotes(missingQuotes, fmpKey, errors);
    if (fmpQuotes) {
      missingQuotes.forEach((symbol) => {
        if (fmpQuotes[symbol]) {
          equityQuotes[symbol] = { ...fmpQuotes[symbol], source: "FMP" };
        }
      });
    }
  }
  const missingAfterFmp = symbols.filter((symbol) => !equityQuotes[symbol]);
  if (missingAfterFmp.length && alphaKey) {
    await Promise.all(
      missingAfterFmp.map(async (symbol) => {
        const quote = await fetchAlphaVantageQuote(symbol, alphaKey, errors);
        if (quote) equityQuotes[symbol] = { ...quote, source: "ALPHAVANTAGE" };
      })
    );
  }

  const spyHistory = (await fetchFmpHistory("SPY", fmpKey, 260, errors)) ||
    (await fetchAlphaVantageHistory("SPY", alphaKey, errors));

  const cgSimple = await fetchCoinGeckoSimple(errors);
  const cgGlobal = await fetchCoinGeckoGlobal(errors);
  const llamaStable = await fetchDefiLlamaStable(errors);

  rawSources.equities = { quotes: Object.keys(equityQuotes), history: spyHistory ? "SPY" : null };
  rawSources.crypto = {
    coingeckoSimple: Boolean(cgSimple),
    coingeckoGlobal: Boolean(cgGlobal),
    defillamaStable: Boolean(llamaStable)
  };

  const metricData = {};
  const freshnessFlags = {};

  function setMetric(id, payload, { fresh = false, derived = false } = {}) {
    metricData[id] = payload;
    freshnessFlags[id] = fresh || derived;
  }

  function fromLastGood(id) {
    const fallback = lastGood?.data?.[id] || null;
    if (fallback) {
      setMetric(id, { ...fallback, stale: true, staleReason: "lastgood" }, { fresh: false });
      return true;
    }
    return false;
  }

  metricsList.forEach((metric) => {
    const id = metric.id;
    const unit = metric.unit || "";
    if (metric.sources.some((src) => src.provider === "FRED")) {
      const fredSource = metric.sources.find((src) => src.provider === "FRED");
      const seriesId = fredSource?.symbol;
      const seriesWrap = seriesId ? fredSeriesData[seriesId] : null;
      const series = seriesWrap?.series || null;
      const cadence = seriesWrap?.cadence || "daily";
      const latest = series ? selectLatest(series, asOfDate, metric.weekendRule) : null;
      if (!latest) {
        if (fromLastGood(id)) return;
      }
      if (latest) {
        let value = latest.value;
        if (metric.value?.type === "yoy") {
          value = computeYoY(series, latest.index, cadence);
        } else if (metric.value?.type === "qoq") {
          value = computeQoQ(series, latest.index);
        }
        value = applyBpIfNeeded(value, unit);
        let changeValue = null;
        if (metric.value?.type === "yoy") {
          const offset = offsetForWindow(metric.change?.window || "1M", cadence);
          const prevIndex = latest.index - offset;
          const prevValue = prevIndex >= 0 ? computeYoY(series, prevIndex, cadence) : null;
          changeValue =
            value !== null && prevValue !== null
              ? value - prevValue
              : null;
        } else if (metric.value?.type === "qoq") {
          const offset = offsetForWindow(metric.change?.window || "1Q", cadence);
          const prevIndex = latest.index - offset;
          const prevValue = prevIndex >= 0 ? computeQoQ(series, prevIndex) : null;
          changeValue =
            value !== null && prevValue !== null
              ? value - prevValue
              : null;
        } else {
          const changeResult = computeChange(series, latest.index, metric.change || {}, cadence);
          changeValue = changeResult.change;
          if (metric.change?.unit === "bp" && metric.change?.type === "delta") {
            changeValue = changeValue === null ? null : changeValue * 100;
          }
        }
        const observedAt = latest.date;
        const staleInfo = computeStale(observedAt, metric.ttlHours || 24);
        setMetric(id, {
          value,
          change: changeValue,
          changeUnit: metric.change?.unit || "",
          unit,
          observedAt,
          source: `FRED:${seriesId}`,
          stale: staleInfo.stale,
          staleReason: staleInfo.reason
        }, { fresh: true });
      }
      return;
    }

    if (metric.sources.some((src) => src.provider === "FINNHUB" || src.provider === "FMP" || src.provider === "ALPHAVANTAGE")) {
      const symbol = metric.sources[0]?.symbol || id;
      const quote = equityQuotes[symbol];
      if (!quote) {
        if (fromLastGood(id)) return;
      }
      if (quote) {
        const value = quote.value;
        const prev = quote.prev;
        const change = prev ? ((value - prev) / prev) * 100 : null;
        const staleInfo = computeStale(quote.observedAt, metric.ttlHours || 24);
        setMetric(id, {
          value,
          change,
          changeUnit: metric.change?.unit || "%",
          unit,
          observedAt: quote.observedAt,
          source: `${quote.source}:${symbol}`,
          stale: staleInfo.stale,
          staleReason: staleInfo.reason,
          instrument: symbol,
          displayAs: symbol === "SPY" ? "S&P 500 (proxy)" : symbol === "QQQ" ? "Nasdaq 100 (proxy)" : symbol === "IWM" ? "Russell 2000 (proxy)" : symbol === "EWG" ? "Germany (proxy)" : symbol === "EWJ" ? "Japan (proxy)" : null
        }, { fresh: true });
      }
      return;
    }

    if (metric.sources.some((src) => src.provider === "COINGECKO")) {
      if (id === "BTCUSD" || id === "ETHUSD") {
        const coin = id === "BTCUSD" ? "bitcoin" : "ethereum";
        const value = toNumber(cgSimple?.[coin]?.usd);
        const change = toNumber(cgSimple?.[coin]?.usd_24h_change);
        if (value === null) {
          if (fromLastGood(id)) return;
        }
        if (value !== null) {
          setMetric(id, {
            value,
            change,
            changeUnit: metric.change?.unit || "%",
            unit,
            observedAt: asOfDate,
            source: `COINGECKO:${coin}`,
            stale: false,
            staleReason: null
          }, { fresh: true });
        }
        return;
      }
      if (id === "CRY_MCAP") {
        const value = toNumber(cgGlobal?.data?.total_market_cap?.usd);
        const change = toNumber(cgGlobal?.data?.market_cap_change_percentage_24h_usd);
        if (value === null) {
          if (fromLastGood(id)) return;
        }
        if (value !== null) {
          setMetric(id, {
            value,
            change,
            changeUnit: metric.change?.unit || "%",
            unit,
            observedAt: asOfDate,
            source: "COINGECKO:GLOBAL",
            stale: false,
            staleReason: null
          }, { fresh: true });
        }
        return;
      }
      if (id === "BTC_DOM") {
        const value = toNumber(cgGlobal?.data?.market_cap_percentage?.btc);
        if (value === null) {
          if (fromLastGood(id)) return;
        }
        if (value !== null) {
          setMetric(id, {
            value,
            change: null,
            changeUnit: metric.change?.unit || "pts",
            unit,
            observedAt: asOfDate,
            source: "COINGECKO:GLOBAL",
            stale: false,
            staleReason: null
          }, { fresh: true });
        }
        return;
      }
    }

    if (metric.sources.some((src) => src.provider === "DEFILLAMA")) {
      const total = toNumber(llamaStable?.totalCirculatingUSD) ?? toNumber(llamaStable?.totalCirculating) ?? null;
      if (total === null) {
        if (fromLastGood(id)) return;
      }
      if (total !== null) {
        setMetric(id, {
          value: total,
          change: null,
          changeUnit: metric.change?.unit || "%",
          unit,
          observedAt: asOfDate,
          source: "DEFILLAMA:stablecoins",
          stale: false,
          staleReason: null
        }, { fresh: true });
      }
      return;
    }

    if (metric.sources.some((src) => src.provider === "LASTGOOD")) {
      if (!fromLastGood(id)) {
        setMetric(id, {
          value: null,
          change: null,
          changeUnit: metric.change?.unit || "",
          unit,
          observedAt: null,
          source: "LASTGOOD",
          stale: true,
          staleReason: "missing"
        }, { fresh: false });
      }
      return;
    }

    if (!metricData[id]) {
      setMetric(id, {
        value: null,
        change: null,
        changeUnit: metric.change?.unit || "",
        unit,
        observedAt: null,
        source: "UNKNOWN",
        stale: true,
        staleReason: "missing"
      }, { fresh: false });
    }
  });

  function getMetric(id) {
    return metricData[id] || null;
  }

  function deriveMetric(id, compute, sourceLabel) {
    const result = compute();
    if (!result) {
      if (fromLastGood(id)) return;
      setMetric(id, {
        value: null,
        change: null,
        changeUnit: "",
        unit: metricsList.find((m) => m.id === id)?.unit || "",
        observedAt: null,
        source: sourceLabel,
        stale: true,
        staleReason: "missing"
      }, { fresh: false });
      return;
    }
    const { value, change, observedAt } = result;
    const metric = metricsList.find((m) => m.id === id) || {};
    const staleInfo = computeStale(observedAt, metric.ttlHours || 24);
    setMetric(id, {
      value,
      change,
      changeUnit: metric.change?.unit || "",
      unit: metric.unit || "",
      observedAt,
      source: sourceLabel,
      stale: staleInfo.stale,
      staleReason: staleInfo.reason
    }, { derived: true });
  }

  deriveMetric("VIXRATIO", () => {
    const vix = getMetric("VIXCLS");
    const vix3m = getMetric("VIX3M");
    if (!vix || !vix3m || vix.value === null || vix3m.value === null || vix3m.value === 0) return null;
    const value = vix.value / vix3m.value;
    const prev = null;
    return { value, change: prev, observedAt: vix.observedAt || vix3m.observedAt };
  }, "DERIVED:VIXCLS/VIX3M");

  deriveMetric("STRESS", () => {
    const baa = getMetric("BAA_YLD");
    const ten = getMetric("US10Y");
    if (!baa || !ten || baa.value === null || ten.value === null) return null;
    const value = (baa.value - ten.value) * 100;
    return { value, change: null, observedAt: baa.observedAt || ten.observedAt };
  }, "DERIVED:BAA_YLD-US10Y");

  deriveMetric("VOL_TERM", () => {
    const vix = getMetric("VIXCLS");
    const vix3m = getMetric("VIX3M");
    if (!vix || !vix3m || vix.value === null || vix3m.value === null) return null;
    const value = vix3m.value - vix.value;
    return { value, change: null, observedAt: vix.observedAt || vix3m.observedAt };
  }, "DERIVED:VIX3M-VIXCLS");

  deriveMetric("RISKREG", () => {
    const vix = getMetric("VIXCLS");
    const curve = getMetric("CURVE10_2");
    const hy = getMetric("HY_OAS");
    if (!vix || !curve || !hy || vix.value === null || curve.value === null || hy.value === null) return null;
    let score = 50;
    if (vix.value > 25) score += 15;
    if (vix.value < 15) score -= 10;
    if (curve.value < 0) score += 10;
    if (hy.value > 500) score += 10;
    if (hy.value < 350) score -= 5;
    score = Math.max(0, Math.min(100, score));
    return { value: score, change: null, observedAt: vix.observedAt || curve.observedAt || hy.observedAt };
  }, "DERIVED:RISKREG");

  if (spyHistory && spyHistory.length) {
    const latest = selectLatest(spyHistory, asOfDate, "forwardFill");
    if (latest) {
      const ret20 = computeReturn(spyHistory, latest.index, "20D");
      const ret200 = computeReturn(spyHistory, latest.index, "200D");
      if (ret20 !== null) {
        const prevRet20 = latest.index > 0 ? computeReturn(spyHistory, latest.index - 1, "20D") : null;
        setMetric("SPY_20D", {
          value: ret20,
          change: prevRet20 !== null ? ret20 - prevRet20 : null,
          changeUnit: "%",
          unit: "%",
          observedAt: latest.date,
          source: "FMP:SPY",
          stale: false,
          staleReason: null
        }, { derived: true });
      }
      if (ret200 !== null) {
        const prevRet200 = latest.index > 0 ? computeReturn(spyHistory, latest.index - 1, "200D") : null;
        setMetric("SPY_200D", {
          value: ret200,
          change: prevRet200 !== null ? ret200 - prevRet200 : null,
          changeUnit: "%",
          unit: "%",
          observedAt: latest.date,
          source: "FMP:SPY",
          stale: false,
          staleReason: null
        }, { derived: true });
      }
    }
  }

  deriveMetric("HY_OAS_1M", () => {
    const metric = getMetric("HY_OAS");
    const series = fredSeriesData["BAMLH0A0HYM2"]?.series || null;
    if (!metric || !series) return null;
    const latest = selectLatest(series, asOfDate, "forwardFill");
    if (!latest) return null;
    const offset = 30;
    const pastIndex = latest.index - offset;
    if (pastIndex < 0 || !series[pastIndex]) return null;
    const value = (latest.value - series[pastIndex].value) * 100;
    return { value, change: null, observedAt: latest.date };
  }, "DERIVED:HY_OAS_1M");

  deriveMetric("CURVE_1M", () => {
    const series = fredSeriesData["T10Y2Y"]?.series || null;
    if (!series) return null;
    const latest = selectLatest(series, asOfDate, "forwardFill");
    if (!latest) return null;
    const offset = 30;
    const pastIndex = latest.index - offset;
    if (pastIndex < 0 || !series[pastIndex]) return null;
    const value = (latest.value - series[pastIndex].value) * 100;
    return { value, change: null, observedAt: latest.date };
  }, "DERIVED:CURVE_1M");

  deriveMetric("BUFFETT", () => {
    const wil = fredSeriesData["WILSHIRE5000IND"]?.series || null;
    const gdp = fredSeriesData["GDP"]?.series || null;
    if (!wil || !gdp) return null;
    const wilLatest = selectLatest(wil, asOfDate, "forwardFill");
    if (!wilLatest) return null;
    const gdpLatest = selectLatest(gdp, asOfDate, "forwardFill");
    if (!gdpLatest || gdpLatest.value === 0) return null;
    const value = (wilLatest.value / gdpLatest.value) * 100;
    return { value, change: null, observedAt: wilLatest.date };
  }, "DERIVED:WILSHIRE/GDP");

  metricsList.forEach((metric) => {
    if (metricData[metric.id]) return;
    if (!fromLastGood(metric.id)) {
      setMetric(metric.id, {
        value: null,
        change: null,
        changeUnit: metric.change?.unit || "",
        unit: metric.unit || "",
        observedAt: null,
        source: "MISSING",
        stale: true,
        staleReason: "missing"
      }, { fresh: false });
    }
  });

  const total = metricsList.length;
  const freshOrDerivedOk = Object.values(freshnessFlags).filter(Boolean).length;
  const nullCount = Object.values(metricData).filter((m) => m.value === null).length;
  const staleMetrics = Object.entries(metricData)
    .filter(([, m]) => m.stale)
    .map(([id, m]) => ({ id, reason: m.staleReason || "stale" }));

  const counts = {
    total,
    freshOrDerivedOk,
    stale: staleMetrics.length,
    null: nullCount
  };

  const providerCalls = fetchJson.budget.toProviderCalls();

  // Determine status based on data quality
  const status = freshOrDerivedOk >= 30 ? "LIVE" : (freshOrDerivedOk >= 10 ? "PARTIAL" : "STALE");
  const reason = freshOrDerivedOk >= 30 ? "OK" : (freshOrDerivedOk >= 10 ? "PARTIAL" : "INSUFFICIENT_DATA");
  const generatedAt = new Date().toISOString();
  const ttlSeconds = 24 * 60 * 60; // 24h

  const meta = {
    // v3 snapshot contract (required by validate-snapshots.js)
    status,
    reason,
    generatedAt,
    asOf: asOfDate,
    source: "multi",
    ttlSeconds,
    runId: RUN_ID,
    // Additional meta fields
    version: "3.0",
    asOfDate,
    updatedAt: generatedAt,
    counts,
    providerCalls,
    errors,
    staleMetrics,
    notes: {
      equitiesAreProxies: true,
      proxyMap: { "SPY": "S&P 500", "QQQ": "Nasdaq 100", "IWM": "Russell 2000", "EWG": "Germany", "EWJ": "Japan" }
    }
  };

  meta.validation = buildMetaValidation(counts, 40);
  meta.schedule = {
    rule: "daily",
    nextPlannedFetchAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    expectedNextRunWindowMinutes: 1440,
    ttlSeconds
  };
  meta.freshness = buildFreshness(asOfDate, 24);

  const snapshot = {
    meta,
    data: metricData,
    categories: catalog.categories
  };

  // --- LASTGOOD fallback to enforce "never empty" ---
  try {
    const lastGoodData = lastGood?.data || {};
    let lastGoodUsed = 0;
    let lastGoodFilled = 0;
    
    // For each metric that is null/stale/missing, fill from lastGood
    for (const [metricId, currentMetric] of Object.entries(metricData)) {
      const isEmptyValue = (v) => {
        if (v === null || v === undefined) return true;
        if (typeof v === "number") return !Number.isFinite(v);
        if (typeof v === "string") return v.trim().length === 0;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "object") return Object.keys(v).length === 0;
        return false;
      };
      
      // Check if primary display value is empty
      const needsFallback = currentMetric.value === null || 
                           currentMetric.stale === true ||
                           (isEmptyValue(currentMetric.value) && !isEmptyValue(lastGoodData[metricId]?.value));
      
      if (needsFallback && lastGoodData[metricId]) {
        const lastGoodMetric = lastGoodData[metricId];
        lastGoodUsed += 1;
        
        // Merge: keep current meta flags but fill empty values from lastGood
        const merged = { ...currentMetric };
        for (const [key, lgValue] of Object.entries(lastGoodMetric)) {
          if (key === "value" && isEmptyValue(merged.value) && !isEmptyValue(lgValue)) {
            merged.value = lgValue;
            lastGoodFilled += 1;
          } else if (key === "change" && isEmptyValue(merged.change) && !isEmptyValue(lgValue)) {
            merged.change = lgValue;
            lastGoodFilled += 1;
          } else if (!(key in merged) && !isEmptyValue(lgValue)) {
            // If current lacked field entirely, allow lastGood to supply it
            merged[key] = lgValue;
          } else if (key in merged && isEmptyValue(merged[key]) && !isEmptyValue(lgValue)) {
            merged[key] = lgValue;
            lastGoodFilled += 1;
          }
        }
        
        merged.derivedFromLastGood = true;
        merged.derivationReason = "LASTGOOD_FALLBACK";
        if (merged.stale !== false) merged.stale = true;
        if (!merged.staleReason || merged.staleReason === "missing") {
          merged.staleReason = "lastgood_fallback";
        }
        
        metricData[metricId] = merged;
        snapshot.data[metricId] = merged;
      }
    }
    
    // Update meta with lastGood stats
    if (lastGood && Object.keys(lastGoodData).length > 0) {
      if (!snapshot.meta.notes || typeof snapshot.meta.notes !== "object") {
        snapshot.meta.notes = snapshot.meta.notes || {};
      }
      snapshot.meta.notes.lastGoodIndexLoaded = true;
    }
    if (lastGoodUsed > 0) {
      if (!snapshot.meta.notes || typeof snapshot.meta.notes !== "object") {
        snapshot.meta.notes = snapshot.meta.notes || {};
      }
      snapshot.meta.notes.lastGoodUsed = lastGoodUsed;
      snapshot.meta.notes.lastGoodFilledFields = lastGoodFilled;
    }
    
    // Add debug info
    snapshot.data.debug = snapshot.data.debug || {};
    snapshot.data.debug.lastGood = {
      available: lastGood ? Object.keys(lastGoodData).length : 0,
      used: lastGoodUsed,
      filledFields: lastGoodFilled,
      beforeMetrics: Object.keys(metricData).length,
      afterMetrics: Object.keys(snapshot.data).length
    };
    
    // Recompute counts after fallback
    const freshOrDerivedOkAfter = Object.values(snapshot.data)
      .filter((m) => m && !m.stale && m.value !== null).length;
    const nullCountAfter = Object.values(snapshot.data)
      .filter((m) => m && m.value === null).length;
    const staleCountAfter = Object.values(snapshot.data)
      .filter((m) => m && m.stale === true).length;
    
    snapshot.meta.counts = {
      total: counts.total,
      freshOrDerivedOk: Math.max(freshOrDerivedOk, freshOrDerivedOkAfter),
      stale: staleCountAfter,
      null: nullCountAfter
    };
    
  } catch (e) {
    snapshot.meta = snapshot.meta || {};
    snapshot.meta.status = "PARTIAL";
    snapshot.meta.reason = snapshot.meta.reason || "LASTGOOD_MERGE_ERROR";
    console.error("lastGood merge error:", e.message);
  }

  saveMirror(MIRROR_PATH, {
    schemaVersion: "rv-mirror-v1",
    mirrorId: "macro-hub",
    runId: RUN_ID,
    updatedAt: meta.updatedAt,
    asOf: asOfDate,
    mode: "EOD",
    cadence: "daily",
    trust: "derived",
    source: "macro-hub",
    sourceUpstream: "multi",
    dataQuality: counts.freshOrDerivedOk >= 30 ? "OK" : "PARTIAL",
    delayMinutes: 0,
    missingSymbols: [],
    errors,
    notes: [],
    whyUnique: "macro-hub raw provider payloads",
    context: { providerCalls, runId: RUN_ID, rawSources },
    items: []
  });

  const runlog = {
    runId: RUN_ID,
    updatedAt: meta.updatedAt,
    asOfDate,
    providerCalls,
    counts,
    errors,
    budgets: fetchJson.budget.usage,
    sources: rawSources
  };
  await writeJson(RUNLOG_PATH, runlog);

  sanitizeAndWritePublic(SNAPSHOT_PATH, snapshot);

  // Save as lastGood if quality is sufficient
  const finalFreshCount = snapshot.meta.counts?.freshOrDerivedOk || freshOrDerivedOk;
  if (finalFreshCount >= 30) {
    sanitizeAndWritePublic(LASTGOOD_PATH, snapshot);
  }

  // --- Update provider-state with providerCalls/errors from snapshot.meta ---
  try {
    const providerState = readJson(PROVIDER_STATE_PATH) || {
      schemaVersion: "v1",
      generatedAt: new Date().toISOString(),
      providers: {},
      meta: {
        status: "OK",
        reason: "OK"
      }
    };
    
    const prov = providerState.providers && typeof providerState.providers === "object" 
      ? providerState.providers 
      : {};
    
    const pc = snapshot.meta.providerCalls || {};
    const errs = Array.isArray(snapshot.meta.errors) ? snapshot.meta.errors : [];
    
    // Build provider stats from calls and errors
    const byProv = {};
    for (const [k, v] of Object.entries(pc)) {
      const providerKey = k.toLowerCase();
      byProv[providerKey] = byProv[providerKey] || { calls: 0, errors: 0 };
      byProv[providerKey].calls = Number(v) || 0;
    }
    for (const e of errs) {
      const p = String(e?.provider || "UNKNOWN").toLowerCase();
      byProv[p] = byProv[p] || { calls: 0, errors: 0 };
      byProv[p].errors += 1;
    }
    
    // Update providers map
    for (const [p, stat] of Object.entries(byProv)) {
      prov[p] = {
        ...(prov[p] || {}),
        status: stat.errors > 0 ? "PARTIAL" : (stat.calls > 0 ? "OK" : "EMPTY"),
        calls: stat.calls,
        errors: stat.errors,
        lastSeen: new Date().toISOString()
      };
    }
    
    providerState.providers = prov;
    providerState.generatedAt = new Date().toISOString();
    providerState.meta = providerState.meta || {};
    providerState.meta.status = Object.values(prov).some((p) => p.errors > 0) ? "PARTIAL" : "OK";
    
    sanitizeAndWritePublic(PROVIDER_STATE_PATH, providerState);
  } catch (e) {
    console.error("provider-state update error:", e.message);
  }

  console.log(`macro-hub snapshot built: ${snapshot.meta.counts?.freshOrDerivedOk || freshOrDerivedOk}/40 fresh_or_derived`);
  if (snapshot.data.debug?.lastGood?.used > 0) {
    console.log(`  lastGood fallback: ${snapshot.data.debug.lastGood.used} metrics, ${snapshot.data.debug.lastGood.filledFields} fields filled`);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
