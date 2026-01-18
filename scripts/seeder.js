import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { atomicWriteJson, saveMirror } from "./utils/mirror-io.mjs";
import { buildGraph, topoSort } from "./_lib/util/dag.js";
import { createProviderStateManager } from "./_lib/provider-state.js";
import { acquireLock, releaseLock } from "./_lib/lock.js";
import { createBudgetState, createUsageCollector } from "./_lib/usage.js";
import { fetchFredSeries } from "./providers/fred.js";
import { fetchEcbSeries } from "./providers/ecb_sdmx.js";
import { fetchStooqDaily } from "./providers/stooq.js";
import { PACKAGE3_RUNNERS } from "./runners/package3/index.js";

const PUBLIC_SNAPSHOT_DIR = path.join("public", "data", "snapshots");
const MIRROR_SNAPSHOT_DIR = path.join("mirrors", "snapshots");
const MANIFEST_PATH = path.join("mirrors", "seed-manifest.json");
const USAGE_PATH = path.join("mirrors", "usage-report.json");
const PROVIDER_STATE_PATH = path.join("mirrors", "provider-state.json");

const DEFAULT_PACKAGES = ["blocks1-12", "blocks13-25", "blocks26-43"];

const YIELD_SERIES = {
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

const MARKET_BREADTH_UNIVERSE = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
  "JPM",
  "UNH",
  "XOM",
  "LLY",
  "AVGO",
  "COST",
  "WMT",
  "PG"
];

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

const PROVIDER_HOSTS = {
  fred: "api.stlouisfed.org",
  ecb: "sdw-wsrest.ecb.europa.eu",
  stooq: "stooq.com",
  marketaux: "api.marketaux.com",
  finnhub: "finnhub.io",
  fmp: "financialmodelingprep.com",
  sec: "data.sec.gov",
  internal: "internal"
};

const TREND_SYMBOLS = ["SPY", "QQQ", "DIA"];
const HEATMAP_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
  "JPM",
  "XOM",
  "LLY",
  "AVGO",
  "COST",
  "WMT",
  "PG",
  "UNH"
];
const BENCHMARK_SYMBOL = "SPY";
const DRAWDOWN_LOOKBACK = 252;
const REALIZED_VOL_DAYS = 20;
const RSI_PERIOD = 14;

const ECB_RATE_KEYS = [
  { id: "MRR", label: "Main Refinancing", key: "FM/D.U2.EUR.4F.KR.MRR_FR.LEV" },
  { id: "DFR", label: "Deposit Facility", key: "FM/D.U2.EUR.4F.KR.DFR.LEV" },
  { id: "MLF", label: "Marginal Lending", key: "FM/D.U2.EUR.4F.KR.MLFR.LEV" }
];

const ECB_FX_KEYS = [
  { pair: "USD/EUR", key: "EXR/D.USD.EUR.SP00.A" },
  { pair: "GBP/EUR", key: "EXR/D.GBP.EUR.SP00.A" },
  { pair: "JPY/EUR", key: "EXR/D.JPY.EUR.SP00.A" }
];

function parseArgs() {
  const onlyIndex = process.argv.indexOf("--only");
  if (onlyIndex === -1) return { only: null };
  return { only: process.argv[onlyIndex + 1] || null };
}

function sortByDateDesc(rows) {
  return rows.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function latestDateFromRows(rows) {
  return (
    rows
      .map((row) => row.date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null
  );
}

function latestByDate(entries) {
  const sorted = entries
    .filter((entry) => entry && entry.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return sorted[0] || null;
}

function maxDate(...dates) {
  return dates.filter(Boolean).sort().slice(-1)[0] || null;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function computeRsi(closes, period = RSI_PERIOD) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  const window = closes.slice(0, period + 1).reverse();
  const deltas = [];
  for (let i = 1; i < window.length; i += 1) {
    deltas.push(window[i] - window[i - 1]);
  }
  const gains = deltas.filter((value) => value > 0);
  const losses = deltas.filter((value) => value < 0).map((value) => Math.abs(value));
  const avgGain = average(gains) ?? 0;
  const avgLoss = average(losses) ?? 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeRealizedVol(closes, period = REALIZED_VOL_DAYS) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  const window = closes.slice(0, period + 1).reverse();
  const returns = [];
  for (let i = 1; i < window.length; i += 1) {
    const prev = window[i - 1];
    const curr = window[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    returns.push((curr - prev) / prev);
  }
  if (!returns.length) return null;
  const mean = average(returns) ?? 0;
  const variance = average(returns.map((value) => (value - mean) ** 2)) ?? 0;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function movingAverage(closes, period) {
  if (!Array.isArray(closes) || closes.length < period) return null;
  return average(closes.slice(0, period));
}

async function getStooqSeries(ctx, symbol, cache) {
  if (!cache.stooqSeries) cache.stooqSeries = {};
  if (cache.stooqSeries[symbol]) return cache.stooqSeries[symbol];
  const seriesCtx = { ...ctx, providerId: ctx.providerId || "stooq" };
  const result = await fetchStooqDaily(seriesCtx, symbol);
  const rows = Array.isArray(result.data) ? sortByDateDesc(result.data) : [];
  cache.stooqSeries[symbol] = rows;
  return rows;
}

function getSnapshot(cache, blockId) {
  if (cache.snapshots && cache.snapshots[blockId]) {
    return cache.snapshots[blockId];
  }
  return readExistingSnapshot(blockId);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function computeCoverage(itemsCount, maxFanout) {
  if (!maxFanout) return 0;
  return Math.min(100, Math.round((itemsCount / maxFanout) * 100));
}

function buildSnapshot(
  entry,
  { items, dataAt, status, reason, generatedAt, latencyMs, extraData, metaDetails }
) {
  const safeItems = Array.isArray(items) ? items : [];
  const itemsCount = safeItems.length;
  const coveragePct = computeCoverage(itemsCount, entry.maxFanout);
  const safeGeneratedAt = generatedAt || new Date().toISOString();
  const effectiveDataAt = dataAt || safeGeneratedAt;
  const stalenessSec = Math.max(
    0,
    Math.floor((Date.parse(safeGeneratedAt) - Date.parse(effectiveDataAt)) / 1000)
  );
  const safeStatus = typeof status === "string" && status ? status : "ERROR";
  const safeReason = typeof reason === "string" && reason ? reason : "UNKNOWN";
  const safeLatencyMs = Number.isFinite(latencyMs) ? latencyMs : 0;
  const safeCoveragePct = Number.isFinite(coveragePct) ? coveragePct : 0;
  const safeStalenessSec = Number.isFinite(stalenessSec) ? stalenessSec : 0;
  const safeTimezone = entry.timezoneAssumption || "UTC";
  const safeDataAtDef = entry.dataAtDefinition || "unknown";
  let details = metaDetails && typeof metaDetails === "object" ? metaDetails : undefined;
  if (!details && safeStatus === "ERROR") {
    details = {
      httpStatus: null,
      retryAfterSec: null,
      urlHost: entry.provider || "",
      snippet: safeReason.slice(0, 200),
      at: safeGeneratedAt
    };
  }

  return {
    schemaVersion: "v1",
    blockId: entry.blockId,
    title: entry.title,
    generatedAt: safeGeneratedAt,
    dataAt: effectiveDataAt,
    meta: {
      status: safeStatus,
      reason: safeReason,
      stalenessSec: safeStalenessSec,
      coveragePct: safeCoveragePct,
      timezoneAssumption: safeTimezone,
      dataAtDefinition: safeDataAtDef,
      latencyMs: safeLatencyMs,
      itemsCount,
      ...(details ? { details } : {})
    },
    data: {
      items: safeItems,
      ...(extraData || {})
    }
  };
}

function evaluateSnapshot(entry, itemsCount, coveragePct) {
  const minItems = entry.validators?.minItems ?? 0;
  const minCoverage = entry.validators?.minCoveragePct ?? 0;
  const allowDegraded = entry.poisonGuard?.allowDegradedWrite ?? false;
  const meetsMin = itemsCount >= minItems && coveragePct >= minCoverage;
  if (!meetsMin) {
    return { allowed: false, status: "ERROR", reason: "POISON_GUARD" };
  }
  if (coveragePct < 100 && allowDegraded) {
    return { allowed: true, status: "PARTIAL", reason: "DEGRADED_COVERAGE" };
  }
  if (coveragePct < 100 && !allowDegraded) {
    return { allowed: false, status: "ERROR", reason: "POISON_GUARD" };
  }
  return { allowed: true, status: "LIVE", reason: "OK" };
}

function readExistingSnapshot(blockId) {
  const filePath = path.join(PUBLIC_SNAPSHOT_DIR, `${blockId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function isPlaceholderSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return true;
  const meta = snapshot?.meta;
  if (!meta || typeof meta !== "object") return true;
  const status = meta.status;
  const reason = meta.reason;
  const itemsCount = meta.itemsCount;
  const dataAt = snapshot?.dataAt || "";
  if (typeof status !== "string" || !status.trim()) return true;
  if (typeof reason !== "string" || !reason.trim()) return true;
  if (!Number.isFinite(itemsCount)) return true;
  if (status === "ERROR" && (!meta.details || typeof meta.details !== "object")) return true;
  if (reason === "SEED_NOT_RUN") return true;
  if (String(dataAt).startsWith("1970-01-01")) return true;
  return false;
}

function buildErrorSnapshot(entry, reason, generatedAt, metaDetails) {
  return buildSnapshot(entry, {
    items: [],
    dataAt: generatedAt,
    status: "ERROR",
    reason,
    generatedAt,
    latencyMs: 0,
    extraData: {},
    metaDetails
  });
}

function orderEntries(entries) {
  const registry = { features: entries };
  const graph = buildGraph(registry);
  const order = topoSort(graph).reverse();
  const lookup = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered = order.map((id) => lookup.get(id)).filter(Boolean);
  return ordered.length ? ordered : entries;
}

async function runUsYieldCurve(entry, ctx) {
  const items = [];
  let dataAt = null;
  for (const [maturity, seriesId] of Object.entries(YIELD_SERIES)) {
    const seriesCtx = { ...ctx, providerId: entry.provider };
    const result = await fetchFredSeries(seriesCtx, seriesId, { limit: 1 });
    const point = latestByDate(result.data) || result.data[0];
    if (!point || !Number.isFinite(point.value)) continue;
    items.push({ maturity, value: point.value, date: point.date });
    if (!dataAt || point.date > dataAt) dataAt = point.date;
  }
  return { items, dataAt, extraData: { curve: items.slice() } };
}

async function runEcbRatesBoard(entry, ctx) {
  const items = [];
  let dataAt = null;
  for (const rate of ECB_RATE_KEYS) {
    const seriesCtx = { ...ctx, providerId: entry.provider };
    const result = await fetchEcbSeries(seriesCtx, rate.key);
    if (!Number.isFinite(result.data.value)) continue;
    items.push({ id: rate.id, label: rate.label, value: result.data.value, date: result.data.period });
    if (!dataAt || result.data.period > dataAt) dataAt = result.data.period;
  }
  return { items, dataAt };
}

async function runInflationPulse(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "CPIAUCSL", { limit: 13 });
  const sorted = result.data
    .filter((entry) => entry && entry.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = sorted[0];
  const prior = sorted[12];
  const yoy = latest && prior && Number.isFinite(latest.value) && Number.isFinite(prior.value)
    ? ((latest.value - prior.value) / prior.value) * 100
    : null;
  const items = [];
  if (latest && Number.isFinite(latest.value)) {
    items.push({ series: "CPI", value: latest.value, yoyPct: yoy, date: latest.date });
  }
  return { items, dataAt: latest?.date || result.dataAt };
}

async function runLaborPulse(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const unrate = await fetchFredSeries(seriesCtx, "UNRATE", { limit: 1 });
  const payroll = await fetchFredSeries(seriesCtx, "PAYEMS", { limit: 2 });
  const items = [];

  const unratePoint = latestByDate(unrate.data) || unrate.data[0];
  if (unratePoint && Number.isFinite(unratePoint.value)) {
    items.push({ series: "UNRATE", value: unratePoint.value, date: unratePoint.date });
  }
  const payrollSorted = payroll.data
    .filter((entry) => entry && entry.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const payrollLatest = payrollSorted[0];
  const payrollPrev = payrollSorted[1];
  let payrollChange = null;
  if (payrollLatest && payrollPrev && Number.isFinite(payrollLatest.value) && Number.isFinite(payrollPrev.value)) {
    payrollChange = payrollLatest.value - payrollPrev.value;
  }
  if (payrollLatest && Number.isFinite(payrollLatest.value)) {
    items.push({ series: "PAYEMS", value: payrollLatest.value, change: payrollChange, date: payrollLatest.date });
  }

  const dataAt = [unratePoint?.date, payrollLatest?.date].filter(Boolean).sort().slice(-1)[0] || null;
  return { items, dataAt };
}

async function runEnergyMacro(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "DCOILWTICO", { limit: 1 });
  const point = latestByDate(result.data) || result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    items.push({ series: "WTI", value: point.value, date: point.date });
  }
  return { items, dataAt: point?.date || null };
}

async function runCreditStressProxy(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "BAMLH0A0HYM2", { limit: 1 });
  const point = latestByDate(result.data) || result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    items.push({ series: "HY_OAS", value: point.value, date: point.date });
  }
  return { items, dataAt: point?.date || null };
}

async function runFxBoard(entry, ctx) {
  const items = [];
  let dataAt = null;
  for (const pair of ECB_FX_KEYS) {
    const seriesCtx = { ...ctx, providerId: entry.provider };
    const result = await fetchEcbSeries(seriesCtx, pair.key);
    if (!Number.isFinite(result.data.value)) continue;
    items.push({ pair: pair.pair, value: result.data.value, date: result.data.period });
    if (!dataAt || result.data.period > dataAt) dataAt = result.data.period;
  }
  return { items, dataAt };
}

async function runMarketBreadth(entry, ctx, cache) {
  const items = [];
  const seriesMap = {};
  let dataAt = null;
  let universe = MARKET_BREADTH_UNIVERSE.slice();
  const remaining = ctx.budget.remaining(entry.provider);
  if (Number.isFinite(remaining) && remaining > 0 && remaining < universe.length) {
    const minItems = entry.validators?.minItems || 1;
    universe = universe.slice(0, Math.max(remaining, minItems));
    ctx.usage.addNote(`Budget tight: reduced market-breadth universe to ${universe.length}`);
  }

  for (const symbol of universe) {
    const seriesCtx = { ...ctx, providerId: entry.provider };
    const result = await fetchStooqDaily(seriesCtx, symbol);
    const rows = Array.isArray(result.data) ? sortByDateDesc(result.data) : [];
    if (!Array.isArray(rows) || rows.length < 2) continue;
    const latest = rows[0];
    const prev = rows[1];
    if (!Number.isFinite(latest.close) || !Number.isFinite(prev.close)) continue;
    const changePct = ((latest.close - prev.close) / prev.close) * 100;
    items.push({ symbol, close: latest.close, changePct, date: latest.date });
    seriesMap[symbol] = rows;
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  if (!dataAt) {
    dataAt = latestDateFromRows(Object.values(seriesMap).flat());
  }
  cache.seriesMap = seriesMap;
  const advancers = items.filter((row) => row.changePct > 0).length;
  const decliners = items.filter((row) => row.changePct < 0).length;
  const unchanged = items.length - advancers - decliners;

  return { items, dataAt, extraData: { summary: { advancers, decliners, unchanged } } };
}

async function runHighsVsLows(entry, ctx, cache) {
  const items = [];
  let dataAt = null;
  const seriesMap = cache.seriesMap || {};

  for (const [symbol, rows] of Object.entries(seriesMap)) {
    if (!Array.isArray(rows) || rows.length < 20) continue;
    const recent = sortByDateDesc(rows).slice(0, 20);
    const highs = Math.max(...recent.map((row) => row.close));
    const lows = Math.min(...recent.map((row) => row.close));
    const latest = recent[0];
    const isHigh = Number.isFinite(latest.close) && latest.close >= highs;
    const isLow = Number.isFinite(latest.close) && latest.close <= lows;
    items.push({ symbol, close: latest.close, isHigh, isLow, date: latest.date });
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  const highs = items.filter((row) => row.isHigh).length;
  const lows = items.filter((row) => row.isLow).length;
  if (!dataAt) {
    dataAt = latestDateFromRows(Object.values(seriesMap).flat());
  }
  return { items, dataAt, extraData: { summary: { highs, lows } } };
}

async function runSectorRotation(entry, ctx) {
  const items = [];
  let dataAt = null;
  let symbols = SECTOR_SYMBOLS.slice();
  const remaining = ctx.budget.remaining(entry.provider);
  if (Number.isFinite(remaining) && remaining > 0 && remaining < symbols.length) {
    const minItems = entry.validators?.minItems || 1;
    symbols = symbols.slice(0, Math.max(remaining, minItems));
    ctx.usage.addNote(`Budget tight: reduced sector rotation symbols to ${symbols.length}`);
  }

  for (const symbol of symbols) {
    const seriesCtx = { ...ctx, providerId: entry.provider };
    const result = await fetchStooqDaily(seriesCtx, symbol);
    const rows = Array.isArray(result.data) ? sortByDateDesc(result.data) : [];
    if (!Array.isArray(rows) || rows.length < 6) continue;
    const latest = rows[0];
    const prior = rows[5];
    if (!Number.isFinite(latest.close) || !Number.isFinite(prior.close)) continue;
    const returnPct = ((latest.close - prior.close) / prior.close) * 100;
    items.push({ symbol, close: latest.close, returnPct, date: latest.date });
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  if (!dataAt) {
    dataAt = latestDateFromRows(items);
  }
  return { items, dataAt };
}

async function runVolRegime(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "VIXCLS", { limit: 1 });
  const point = latestByDate(result.data) || result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    const regime = point.value < 15 ? "low" : point.value < 25 ? "mid" : "high";
    items.push({ series: "VIX", value: point.value, regime, date: point.date });
  }
  return { items, dataAt: point?.date || null };
}

async function runLiquidityConditions(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "RRPONTSYD", { limit: 1 });
  const point = latestByDate(result.data) || result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    items.push({ series: "RRPONTSYD", value: point.value, date: point.date });
  }
  return { items, dataAt: point?.date || null };
}

async function runRiskRegimeLite(entry, ctx, cache) {
  const volSnapshot = getSnapshot(cache, "vol-regime");
  const breadthSnapshot = getSnapshot(cache, "market-breadth");
  const volItem = volSnapshot?.data?.items?.[0];
  const breadthSummary = breadthSnapshot?.data?.summary || {};
  const breadthItems = Array.isArray(breadthSnapshot?.data?.items) ? breadthSnapshot.data.items : [];

  const advancers = Number.isFinite(breadthSummary.advancers)
    ? breadthSummary.advancers
    : breadthItems.filter((row) => row.changePct > 0).length;
  const decliners = Number.isFinite(breadthSummary.decliners)
    ? breadthSummary.decliners
    : breadthItems.filter((row) => row.changePct < 0).length;
  const total = advancers + decliners;
  const breadthRatio = total > 0 ? advancers / total : null;

  if (!volItem || !Number.isFinite(volItem.value) || total === 0) {
    const error = new Error("risk regime inputs missing");
    error.reason = "NO_DATA";
    throw error;
  }

  let regime = "neutral";
  if (volItem.regime === "high" || (breadthRatio !== null && breadthRatio < 0.4)) {
    regime = "risk-off";
  } else if (volItem.regime === "low" && breadthRatio !== null && breadthRatio > 0.55) {
    regime = "risk-on";
  }

  const dataAt = maxDate(volSnapshot?.dataAt, breadthSnapshot?.dataAt);
  const items = [
    {
      regime,
      volRegime: volItem.regime || null,
      vix: volItem.value,
      breadthRatio,
      advancers,
      decliners,
      date: dataAt
    }
  ];
  return { items, dataAt };
}

async function runDrawdownMonitor(entry, ctx, cache) {
  const rows = await getStooqSeries({ ...ctx, providerId: entry.provider }, BENCHMARK_SYMBOL, cache);
  const window = rows.slice(0, DRAWDOWN_LOOKBACK).filter((row) => Number.isFinite(row.close));
  const latest = window[0];
  if (!latest) {
    const error = new Error("drawdown source missing");
    error.reason = "NO_DATA";
    throw error;
  }
  const maxClose = Math.max(...window.map((row) => row.close));
  const drawdownPct = maxClose ? ((latest.close - maxClose) / maxClose) * 100 : null;
  const items = [
    {
      symbol: BENCHMARK_SYMBOL,
      close: latest.close,
      maxClose,
      drawdownPct,
      date: latest.date
    }
  ];
  return { items, dataAt: latest.date || null };
}

async function runTrendStrengthBoard(entry, ctx, cache) {
  const items = [];
  let dataAt = null;

  for (const symbol of TREND_SYMBOLS) {
    const rows = await getStooqSeries({ ...ctx, providerId: entry.provider }, symbol, cache);
    const closes = rows.map((row) => row.close).filter(Number.isFinite);
    const ma50 = movingAverage(closes, 50);
    const ma200 = movingAverage(closes, 200);
    const latest = rows[0];
    if (!latest || !Number.isFinite(ma50) || !Number.isFinite(ma200)) continue;
    const slopePct = ma200 ? ((ma50 - ma200) / ma200) * 100 : null;
    items.push({ symbol, ma50, ma200, slopePct, date: latest.date });
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  return { items, dataAt };
}

async function runMomentumHeatmapLite(entry, ctx, cache) {
  const items = [];
  let dataAt = null;

  for (const symbol of HEATMAP_SYMBOLS) {
    const rows = await getStooqSeries({ ...ctx, providerId: entry.provider }, symbol, cache);
    const closes = rows.map((row) => row.close).filter(Number.isFinite);
    const rsi = computeRsi(closes, RSI_PERIOD);
    const latest = rows[0];
    if (!latest || !Number.isFinite(rsi)) continue;
    const bucket =
      rsi >= 70 ? "hot" : rsi >= 55 ? "warm" : rsi >= 45 ? "neutral" : rsi >= 30 ? "cool" : "weak";
    items.push({ symbol, rsi, bucket, date: latest.date });
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  return { items, dataAt };
}

async function runVolatilityTermLite(entry, ctx, cache) {
  const volSnapshot = getSnapshot(cache, "vol-regime");
  const volItem = volSnapshot?.data?.items?.[0];
  if (!volItem || !Number.isFinite(volItem.value)) {
    const error = new Error("vol regime missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const rows = await getStooqSeries({ ...ctx, providerId: entry.provider }, BENCHMARK_SYMBOL, cache);
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  const realized = computeRealizedVol(closes, REALIZED_VOL_DAYS);
  const latest = rows[0];
  if (!latest || !Number.isFinite(realized)) {
    const error = new Error("realized vol missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const dataAt = maxDate(volSnapshot?.dataAt, latest.date);
  const items = [
    {
      symbol: BENCHMARK_SYMBOL,
      vix: volItem.value,
      realized,
      spread: volItem.value - realized,
      date: dataAt
    }
  ];
  return { items, dataAt };
}

async function runSectorRelativeStrength(entry, ctx, cache) {
  const sectorSnapshot = getSnapshot(cache, "sector-rotation");
  const sectorItems = Array.isArray(sectorSnapshot?.data?.items) ? sectorSnapshot.data.items : [];
  if (!sectorItems.length) {
    const error = new Error("sector rotation missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const rows = await getStooqSeries({ ...ctx, providerId: entry.provider }, BENCHMARK_SYMBOL, cache);
  if (rows.length < 6 || !Number.isFinite(rows[0]?.close) || !Number.isFinite(rows[5]?.close)) {
    const error = new Error("benchmark returns missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const spyReturnPct = ((rows[0].close - rows[5].close) / rows[5].close) * 100;
  const items = sectorItems
    .filter((item) => Number.isFinite(item.returnPct))
    .map((item) => ({
      symbol: item.symbol,
      sectorReturnPct: item.returnPct,
      spyReturnPct,
      relativeStrength: item.returnPct - spyReturnPct,
      date: item.date || rows[0].date
    }));

  const dataAt = maxDate(sectorSnapshot?.dataAt, rows[0].date);
  return { items, dataAt };
}

async function runCreditSpreadProxyLite(entry, ctx, cache) {
  const creditSnapshot = getSnapshot(cache, "credit-stress-proxy");
  const item = creditSnapshot?.data?.items?.[0];
  if (!item || !Number.isFinite(item.value)) {
    const error = new Error("credit proxy missing");
    error.reason = "NO_DATA";
    throw error;
  }
  const level = item.value >= 5 ? "stress" : item.value >= 3 ? "elevated" : "calm";
  const items = [
    {
      series: item.series || "HY_OAS",
      value: item.value,
      level,
      date: item.date || creditSnapshot.dataAt
    }
  ];
  return { items, dataAt: creditSnapshot?.dataAt || null };
}

async function runLiquidityDelta(entry, ctx, cache) {
  const liquiditySnapshot = getSnapshot(cache, "liquidity-conditions-proxy");
  const item = liquiditySnapshot?.data?.items?.[0];
  if (!item || !Number.isFinite(item.value)) {
    const error = new Error("liquidity proxy missing");
    error.reason = "NO_DATA";
    throw error;
  }
  const previousSnapshot = readExistingSnapshot("liquidity-conditions-proxy");
  const prevItem = !isPlaceholderSnapshot(previousSnapshot) ? previousSnapshot?.data?.items?.[0] : null;
  const prevValue = Number.isFinite(prevItem?.value) ? prevItem.value : null;
  const delta = prevValue === null ? null : item.value - prevValue;
  const deltaPct = prevValue && prevValue !== 0 ? (delta / prevValue) * 100 : null;
  const items = [
    {
      series: item.series || "RRPONTSYD",
      value: item.value,
      prevValue,
      delta,
      deltaPct,
      date: item.date || liquiditySnapshot.dataAt
    }
  ];
  return { items, dataAt: liquiditySnapshot?.dataAt || null };
}

async function runMacroSurpriseLite(entry, ctx, cache) {
  const inflationSnapshot = getSnapshot(cache, "inflation-pulse");
  const laborSnapshot = getSnapshot(cache, "labor-pulse");
  const items = [];

  if (inflationSnapshot?.data?.items?.length) {
    const current = inflationSnapshot.data.items[0];
    const prevSnapshot = readExistingSnapshot("inflation-pulse");
    const prevItem = !isPlaceholderSnapshot(prevSnapshot) ? prevSnapshot?.data?.items?.[0] : null;
    const delta = Number.isFinite(prevItem?.value) ? current.value - prevItem.value : null;
    items.push({ series: current.series || "CPI", value: current.value, delta, date: current.date });
  }

  if (laborSnapshot?.data?.items?.length) {
    const prevSnapshot = readExistingSnapshot("labor-pulse");
    const prevItems = !isPlaceholderSnapshot(prevSnapshot) ? prevSnapshot?.data?.items || [] : [];
    for (const current of laborSnapshot.data.items) {
      const prevItem = prevItems.find((item) => item.series === current.series);
      const delta = Number.isFinite(prevItem?.value) ? current.value - prevItem.value : null;
      items.push({ series: current.series, value: current.value, delta, date: current.date });
    }
  }

  if (!items.length) {
    const error = new Error("macro snapshots missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const dataAt = maxDate(inflationSnapshot?.dataAt, laborSnapshot?.dataAt);
  return { items, dataAt };
}

async function runMarketStressComposite(entry, ctx, cache) {
  const riskSnapshot = getSnapshot(cache, "risk-regime-lite");
  const creditSnapshot = getSnapshot(cache, "credit-spread-proxy-lite");
  const volSnapshot = getSnapshot(cache, "volatility-term-lite");

  const riskItem = riskSnapshot?.data?.items?.[0];
  const creditItem = creditSnapshot?.data?.items?.[0];
  const volItem = volSnapshot?.data?.items?.[0];

  if (!riskItem && !creditItem && !volItem) {
    const error = new Error("stress inputs missing");
    error.reason = "NO_DATA";
    throw error;
  }

  let score = 50;
  if (riskItem?.regime === "risk-off") score += 15;
  if (riskItem?.regime === "risk-on") score -= 10;
  if (Number.isFinite(creditItem?.value)) {
    if (creditItem.value >= 5) score += 20;
    else if (creditItem.value >= 3) score += 10;
  }
  if (Number.isFinite(volItem?.spread)) {
    if (volItem.spread >= 10) score += 15;
    else if (volItem.spread >= 5) score += 8;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const dataAt = maxDate(riskSnapshot?.dataAt, creditSnapshot?.dataAt, volSnapshot?.dataAt);
  const items = [
    {
      score,
      regime: riskItem?.regime || null,
      creditLevel: creditItem?.level || null,
      volSpread: volItem?.spread ?? null,
      date: dataAt
    }
  ];
  return { items, dataAt };
}

async function runBreadthDelta(entry, ctx, cache) {
  const breadthSnapshot = getSnapshot(cache, "market-breadth");
  const summary = breadthSnapshot?.data?.summary || {};
  const itemsList = Array.isArray(breadthSnapshot?.data?.items) ? breadthSnapshot.data.items : [];
  const advancers = Number.isFinite(summary.advancers)
    ? summary.advancers
    : itemsList.filter((row) => row.changePct > 0).length;
  const decliners = Number.isFinite(summary.decliners)
    ? summary.decliners
    : itemsList.filter((row) => row.changePct < 0).length;

  if (!itemsList.length && advancers + decliners === 0) {
    const error = new Error("breadth snapshot missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const prevSnapshot = readExistingSnapshot("market-breadth");
  const prevSummary = !isPlaceholderSnapshot(prevSnapshot) ? prevSnapshot?.data?.summary || {} : {};
  const prevItems = !isPlaceholderSnapshot(prevSnapshot) ? prevSnapshot?.data?.items || [] : [];
  const prevAdv = Number.isFinite(prevSummary.advancers)
    ? prevSummary.advancers
    : prevItems.filter((row) => row.changePct > 0).length;
  const prevDec = Number.isFinite(prevSummary.decliners)
    ? prevSummary.decliners
    : prevItems.filter((row) => row.changePct < 0).length;

  const items = [
    {
      advancers,
      decliners,
      advancersDelta: advancers - (prevAdv || 0),
      declinersDelta: decliners - (prevDec || 0),
      netDelta: advancers - decliners - ((prevAdv || 0) - (prevDec || 0)),
      date: breadthSnapshot?.dataAt || null
    }
  ];
  return { items, dataAt: breadthSnapshot?.dataAt || null };
}

async function runRegimeTransitionWatch(entry, ctx, cache) {
  const currentSnapshot = getSnapshot(cache, "risk-regime-lite");
  const currentItem = currentSnapshot?.data?.items?.[0];
  if (!currentItem?.regime) {
    const error = new Error("risk regime missing");
    error.reason = "NO_DATA";
    throw error;
  }

  const prevSnapshot = readExistingSnapshot("risk-regime-lite");
  const prevItem = !isPlaceholderSnapshot(prevSnapshot) ? prevSnapshot?.data?.items?.[0] : null;
  const prevRegime = prevItem?.regime || null;
  const changed = prevRegime ? prevRegime !== currentItem.regime : false;
  const dataAt = currentSnapshot?.dataAt || null;

  const items = [
    {
      from: prevRegime,
      to: currentItem.regime,
      changed,
      date: dataAt
    }
  ];
  return { items, dataAt };
}

async function runMarketHealthSummary(entry, ctx, cache) {
  const blockIds = [
    "us-yield-curve",
    "ecb-rates-board",
    "inflation-pulse",
    "labor-pulse",
    "energy-macro",
    "credit-stress-proxy",
    "fx-board",
    "market-breadth",
    "highs-vs-lows",
    "sector-rotation",
    "vol-regime",
    "liquidity-conditions-proxy",
    "risk-regime-lite",
    "drawdown-monitor",
    "trend-strength-board",
    "momentum-heatmap-lite",
    "volatility-term-lite",
    "sector-relative-strength",
    "credit-spread-proxy-lite",
    "liquidity-delta",
    "macro-surprise-lite",
    "market-stress-composite",
    "breadth-delta",
    "regime-transition-watch"
  ];

  const items = [];
  let dataAt = null;
  let live = 0;
  let partial = 0;
  let error = 0;

  for (const blockId of blockIds) {
    const snapshot = getSnapshot(cache, blockId);
    const status = snapshot?.meta?.status || "ERROR";
    const reason = snapshot?.meta?.reason || "NO_DATA";
    if (status === "LIVE") live += 1;
    else if (status === "PARTIAL") partial += 1;
    else error += 1;
    items.push({ blockId, status, reason });
    if (snapshot?.dataAt && snapshot.dataAt > (dataAt || "")) dataAt = snapshot.dataAt;
  }

  const extraData = {
    summary: {
      live,
      partial,
      error,
      total: blockIds.length
    }
  };

  return { items, dataAt, extraData };
}

const RUNNERS = {
  "us-yield-curve": runUsYieldCurve,
  "ecb-rates-board": runEcbRatesBoard,
  "inflation-pulse": runInflationPulse,
  "labor-pulse": runLaborPulse,
  "energy-macro": runEnergyMacro,
  "credit-stress-proxy": runCreditStressProxy,
  "fx-board": runFxBoard,
  "market-breadth": runMarketBreadth,
  "highs-vs-lows": runHighsVsLows,
  "sector-rotation": runSectorRotation,
  "vol-regime": runVolRegime,
  "liquidity-conditions-proxy": runLiquidityConditions,
  "risk-regime-lite": runRiskRegimeLite,
  "drawdown-monitor": runDrawdownMonitor,
  "trend-strength-board": runTrendStrengthBoard,
  "momentum-heatmap-lite": runMomentumHeatmapLite,
  "volatility-term-lite": runVolatilityTermLite,
  "sector-relative-strength": runSectorRelativeStrength,
  "credit-spread-proxy-lite": runCreditSpreadProxyLite,
  "liquidity-delta": runLiquidityDelta,
  "macro-surprise-lite": runMacroSurpriseLite,
  "market-stress-composite": runMarketStressComposite,
  "breadth-delta": runBreadthDelta,
  "regime-transition-watch": runRegimeTransitionWatch,
  "market-health-summary": runMarketHealthSummary
};

async function runBlock(entry, ctx, cache) {
  const started = Date.now();
  const runner =
    entry.package === "blocks26-43" ? PACKAGE3_RUNNERS[entry.blockId] : RUNNERS[entry.blockId];
  if (!runner) {
    throw new Error(`missing runner for ${entry.blockId}`);
  }
  const result =
    entry.package === "blocks26-43"
      ? await runner({ ...ctx, cache }, entry)
      : await runner(entry, ctx, cache);
  const latencyMs = Date.now() - started;

  const items = Array.isArray(result.items) ? result.items : [];
  const coveragePct = computeCoverage(items.length, entry.maxFanout);
  const evaluation = evaluateSnapshot(entry, items.length, coveragePct);
  const snapshot = buildSnapshot(entry, {
    items,
    dataAt: result.dataAt,
    status: evaluation.status,
    reason: evaluation.reason,
    generatedAt: new Date().toISOString(),
    latencyMs,
    extraData: result.extraData
  });

  const dataAtCheckBlocks = new Set(["market-breadth", "sector-rotation"]);
  if (dataAtCheckBlocks.has(entry.blockId) && snapshot.meta.status === "LIVE") {
    if (String(snapshot.dataAt || "") < "2020-01-01") {
      snapshot.meta.status = "ERROR";
      snapshot.meta.reason = "DATAAT_OUTDATED";
      evaluation.allowed = false;
    }
  }

  if (!cache.snapshots) cache.snapshots = {};
  cache.snapshots[entry.blockId] = snapshot;

  return { snapshot, evaluation, latencyMs };
}

function writeUsageReport(usage) {
  const day = new Date().toISOString().slice(0, 10);
  const report = usage.snapshot(day);
  saveMirror(USAGE_PATH, report);
}

function writeSeedManifest(manifest) {
  saveMirror(MANIFEST_PATH, manifest);
}

function listMissingSecrets(entry) {
  const required = Array.isArray(entry.requiredSecrets) ? entry.requiredSecrets : [];
  return required.filter((name) => !process.env[name]);
}

function getMaxRequests(entry) {
  if (Number.isFinite(entry.maxRequestsPerRun)) return Number(entry.maxRequestsPerRun);
  return entry.provider === "internal" ? 0 : 1;
}

function buildMetaDetails(providerId, rawDetails = {}, extra = {}) {
  const details = rawDetails && typeof rawDetails === "object" ? rawDetails : {};
  const snippet = String(details.snippet || extra.snippet || "").slice(0, 200);
  const urlHost = details.urlHost || PROVIDER_HOSTS[providerId] || providerId || "";
  return {
    httpStatus: details.httpStatus ?? null,
    retryAfterSec: details.retryAfterSec ?? null,
    urlHost,
    snippet,
    at: details.at || new Date().toISOString(),
    ...extra
  };
}

async function main() {
  const { only } = parseArgs();
  execSync("node scripts/build-registry.js", { stdio: "inherit" });

  const registry = loadJson(path.join("registry", "feature-registry.json"));
  if (!registry || !Array.isArray(registry.features)) {
    throw new Error("registry load failed");
  }

  const effectiveOnly = only || null;
  let entries = registry.features.filter((entry) => DEFAULT_PACKAGES.includes(entry.package));
  if (effectiveOnly) {
    entries = registry.features.filter((entry) => entry.package === effectiveOnly);
  }
  entries = orderEntries(entries);

  const limits = loadJson(path.join("config", "rv-budgets.json"));
  const usage = createUsageCollector(limits);
  const budget = createBudgetState(limits, usage);
  const providerIds = Array.from(new Set(entries.map((entry) => entry.provider || "internal")));
  const providerState = createProviderStateManager(PROVIDER_STATE_PATH, providerIds);

  const manifest = {
    schemaVersion: "v1",
    runId: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    blocks: []
  };

  const cache = {};

  try {
    for (const entry of entries) {
      const ctx = { usage, budget };
      const started = Date.now();
      try {
        const missingSecrets = listMissingSecrets(entry);
        if (missingSecrets.length) {
          const reason = "MISSING_SECRET";
          usage.recordError(entry.provider, reason);
          const generatedAt = new Date().toISOString();
          const details = buildMetaDetails(entry.provider, null, {
            snippet: `missing ${missingSecrets.join(",")}`.slice(0, 200)
          });
          providerState.recordSkip(entry.provider, reason, details);
          const existing = readExistingSnapshot(entry.blockId);
          const placeholder = isPlaceholderSnapshot(existing);
          let wroteSnapshot = false;
          if (placeholder) {
            const errorSnapshot = buildErrorSnapshot(entry, reason, generatedAt, details);
            atomicWriteJson(path.join(MIRROR_SNAPSHOT_DIR, `${entry.blockId}.json`), errorSnapshot);
            wroteSnapshot = true;
          }
          manifest.blocks.push({
            blockId: entry.blockId,
            title: entry.title,
            status: "ERROR",
            reason,
            itemsCount: 0,
            coveragePct: 0,
            wroteSnapshot,
            durationMs: Date.now() - started
          });
          continue;
        }

        const circuitCheck = providerState.shouldSkip(entry.provider);
        if (circuitCheck.skip) {
          const reason = circuitCheck.reason || "CIRCUIT_OPEN";
          usage.recordError(entry.provider, reason);
          const generatedAt = new Date().toISOString();
          const details = buildMetaDetails(entry.provider, circuitCheck.details, {
            snippet:
              reason === "CIRCUIT_OPEN"
                ? `circuit open until ${circuitCheck.details?.openUntil || "unknown"}`
                : `cooldown until ${circuitCheck.details?.cooldownUntil || "unknown"}`
          });
          providerState.recordSkip(entry.provider, reason, details);
          const existing = readExistingSnapshot(entry.blockId);
          const placeholder = isPlaceholderSnapshot(existing);
          let wroteSnapshot = false;
          if (placeholder) {
            const errorSnapshot = buildErrorSnapshot(entry, reason, generatedAt, details);
            atomicWriteJson(path.join(MIRROR_SNAPSHOT_DIR, `${entry.blockId}.json`), errorSnapshot);
            wroteSnapshot = true;
          }
          manifest.blocks.push({
            blockId: entry.blockId,
            title: entry.title,
            status: "ERROR",
            reason,
            itemsCount: 0,
            coveragePct: 0,
            wroteSnapshot,
            durationMs: Date.now() - started
          });
          continue;
        }

        const maxRequests = getMaxRequests(entry);
        if (maxRequests > 0) {
          const remaining = budget.remaining(entry.provider);
          if (Number.isFinite(remaining) && remaining < maxRequests) {
            const reason = "BUDGET_EXHAUSTED";
            usage.recordError(entry.provider, reason);
            const generatedAt = new Date().toISOString();
            const details = buildMetaDetails(entry.provider, null, {
              snippet: `budget remaining ${remaining}`.slice(0, 200)
            });
            providerState.recordSkip(entry.provider, reason, details);
            const existing = readExistingSnapshot(entry.blockId);
            const placeholder = isPlaceholderSnapshot(existing);
            let wroteSnapshot = false;
            if (placeholder) {
              const errorSnapshot = buildErrorSnapshot(entry, reason, generatedAt, details);
              atomicWriteJson(path.join(MIRROR_SNAPSHOT_DIR, `${entry.blockId}.json`), errorSnapshot);
              wroteSnapshot = true;
            }
            manifest.blocks.push({
              blockId: entry.blockId,
              title: entry.title,
              status: "ERROR",
              reason,
              itemsCount: 0,
              coveragePct: 0,
              wroteSnapshot,
              durationMs: Date.now() - started
            });
            continue;
          }
        }

        const lock = acquireLock({
          providerId: entry.provider || "internal",
          datasetId: entry.blockId,
          ttlSeconds: entry.lockTtlSeconds || 600
        });
        if (!lock.ok) {
          const reason = "LOCK_HELD";
          usage.recordError(entry.provider, reason);
          providerState.recordSkip(entry.provider, reason, {
            snippet: `lock ${lock.details?.expiresAt || "active"}`.slice(0, 200)
          });
          manifest.blocks.push({
            blockId: entry.blockId,
            title: entry.title,
            status: "ERROR",
            reason,
            itemsCount: 0,
            coveragePct: 0,
            wroteSnapshot: false,
            durationMs: Date.now() - started
          });
          continue;
        }

        try {
          const { snapshot, evaluation } = await runBlock(entry, ctx, cache);
          const snapshotPath = path.join(MIRROR_SNAPSHOT_DIR, `${entry.blockId}.json`);
          const existing = readExistingSnapshot(entry.blockId);
          const placeholder = isPlaceholderSnapshot(existing);
          let wroteSnapshot = false;

          if (snapshot.meta.status === "ERROR") {
            const errorDetails = buildMetaDetails(entry.provider, snapshot.meta.details, {
              snippet: snapshot.meta.reason
            });
            snapshot.meta.details = errorDetails;
            providerState.recordFailure(entry.provider, snapshot.meta.reason, errorDetails);
          } else {
            providerState.recordSuccess(entry.provider);
          }

          if (evaluation.allowed) {
            atomicWriteJson(snapshotPath, snapshot);
            wroteSnapshot = true;
          } else {
            if (placeholder) {
              const errorDetails = buildMetaDetails(entry.provider, snapshot.meta.details, {
                snippet: snapshot.meta.reason
              });
              const errorSnapshot = buildErrorSnapshot(entry, snapshot.meta.reason, snapshot.generatedAt, errorDetails);
              atomicWriteJson(snapshotPath, errorSnapshot);
              wroteSnapshot = true;
            }
          }

          manifest.blocks.push({
            blockId: entry.blockId,
            title: entry.title,
            status: snapshot.meta.status,
            reason: snapshot.meta.reason,
            itemsCount: snapshot.meta.itemsCount,
            coveragePct: snapshot.meta.coveragePct,
            wroteSnapshot,
            durationMs: Date.now() - started
          });
        } finally {
          releaseLock(lock.path);
        }
      } catch (error) {
        const rawReason = error?.reason || "ERROR";
        const reason = rawReason === "BUDGET_EXCEEDED" ? "BUDGET_EXHAUSTED" : rawReason;
        usage.recordError(entry.provider, reason);
        const generatedAt = new Date().toISOString();
        const existing = readExistingSnapshot(entry.blockId);
        const placeholder = isPlaceholderSnapshot(existing);
        let wroteSnapshot = false;
        const details = buildMetaDetails(entry.provider, error?.details, {
          snippet: reason
        });
        providerState.recordFailure(entry.provider, reason, details);
        if (placeholder) {
          const errorSnapshot = buildErrorSnapshot(entry, reason, generatedAt, details);
          atomicWriteJson(path.join(MIRROR_SNAPSHOT_DIR, `${entry.blockId}.json`), errorSnapshot);
          wroteSnapshot = true;
        }
        manifest.blocks.push({
          blockId: entry.blockId,
          title: entry.title,
          status: "ERROR",
          reason,
          itemsCount: 0,
          coveragePct: 0,
          wroteSnapshot,
          durationMs: Date.now() - started
        });
      }
    }
  } finally {
    providerState.save();
    writeSeedManifest(manifest);
    writeUsageReport(usage);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
