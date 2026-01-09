import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { atomicWriteJson } from "./utils/mirror-io.mjs";
import { buildGraph, topoSort } from "./_lib/util/dag.js";
import { fetchFredSeries } from "./providers/fred.js";
import { fetchEcbSeries } from "./providers/ecb_sdmx.js";
import { fetchStooqDaily } from "./providers/stooq.js";

const SNAPSHOT_DIR = path.join("public", "data", "snapshots");
const MANIFEST_PATH = path.join("public", "data", "seed-manifest.json");
const USAGE_PATH = path.join("public", "data", "usage-report.json");

const BLOCK_PACKAGE = "blocks1-12";

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

const ECB_RATE_KEYS = [
  { id: "MRR", label: "Main Refinancing", key: "FM/M.U2.EUR.4F.KR.MRR_FR.LEV" },
  { id: "DFR", label: "Deposit Facility", key: "FM/M.U2.EUR.4F.KR.DFR.LEV" },
  { id: "MLF", label: "Marginal Lending", key: "FM/M.U2.EUR.4F.KR.MLFR.LEV" }
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

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function createUsageCollector(limits) {
  const providers = {};
  const notes = [];

  function ensure(providerId) {
    if (!providers[providerId]) {
      const limit = limits?.providers?.[providerId] || {};
      providers[providerId] = {
        requests: 0,
        credits: 0,
        bytesIn: 0,
        latencyMs: 0,
        limitRequests: limit.dailyRequests ?? null,
        limitCredits: limit.dailyCredits ?? null,
        remainingRequests: limit.dailyRequests ?? null,
        remainingCredits: limit.dailyCredits ?? null,
        errorsByReason: {}
      };
    }
    return providers[providerId];
  }

  function record(providerId, { requests = 0, credits = 0, bytesIn = 0, latencyMs = 0 }) {
    const entry = ensure(providerId);
    entry.requests += requests;
    entry.credits += credits;
    entry.bytesIn += bytesIn;
    entry.latencyMs += latencyMs;
    if (entry.limitRequests !== null) {
      entry.remainingRequests = Math.max(0, entry.limitRequests - entry.requests);
    }
    if (entry.limitCredits !== null) {
      entry.remainingCredits = Math.max(0, entry.limitCredits - entry.credits);
    }
  }

  function recordError(providerId, reason) {
    const entry = ensure(providerId);
    entry.errorsByReason[reason] = (entry.errorsByReason[reason] || 0) + 1;
  }

  function getProvider(providerId) {
    return ensure(providerId);
  }

  function addNote(note) {
    notes.push(note);
  }

  function snapshot(day) {
    const totals = Object.values(providers).reduce(
      (acc, entry) => {
        acc.requests += entry.requests;
        acc.credits += entry.credits;
        return acc;
      },
      { requests: 0, credits: 0 }
    );
    return {
      day,
      providers,
      totals,
      notes
    };
  }

  return { record, recordError, getProvider, addNote, snapshot };
}

function createBudgetState(limits, usage) {
  return {
    reserve(providerId) {
      const entry = limits?.providers?.[providerId];
      if (!entry || entry.dailyRequests === undefined) return true;
      const current = usage.getProvider(providerId).requests || 0;
      if (current >= entry.dailyRequests) {
        usage.recordError(providerId, "BUDGET_EXCEEDED");
        return false;
      }
      return true;
    },
    remaining(providerId) {
      const entry = limits?.providers?.[providerId];
      if (!entry || entry.dailyRequests === undefined) return null;
      const current = usage.getProvider(providerId).requests || 0;
      return Math.max(0, entry.dailyRequests - current);
    }
  };
}

function computeCoverage(itemsCount, maxFanout) {
  if (!maxFanout) return 0;
  return Math.min(100, Math.round((itemsCount / maxFanout) * 100));
}

function buildSnapshot(entry, { items, dataAt, status, reason, generatedAt, latencyMs, extraData }) {
  const itemsCount = items.length;
  const coveragePct = computeCoverage(itemsCount, entry.maxFanout);
  const effectiveDataAt = dataAt || generatedAt;
  const stalenessSec = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(effectiveDataAt)) / 1000));

  return {
    schemaVersion: "v1",
    blockId: entry.blockId,
    title: entry.title,
    generatedAt,
    dataAt: effectiveDataAt,
    meta: {
      status,
      reason,
      stalenessSec,
      coveragePct,
      timezoneAssumption: entry.timezoneAssumption,
      dataAtDefinition: entry.dataAtDefinition,
      latencyMs,
      itemsCount
    },
    data: {
      items,
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
  const filePath = path.join(SNAPSHOT_DIR, `${blockId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function orderEntries(entries) {
  const registry = { features: entries };
  const graph = buildGraph(registry);
  const order = topoSort(graph);
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
    const point = result.data[0];
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
  const latest = result.data[0];
  const prior = result.data[12];
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

  const unratePoint = unrate.data[0];
  if (unratePoint && Number.isFinite(unratePoint.value)) {
    items.push({ series: "UNRATE", value: unratePoint.value, date: unratePoint.date });
  }
  const payrollLatest = payroll.data[0];
  const payrollPrev = payroll.data[1];
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
  const point = result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    items.push({ series: "WTI", value: point.value, date: point.date });
  }
  return { items, dataAt: point?.date || null };
}

async function runCreditStressProxy(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "BAMLH0A0HYM2", { limit: 1 });
  const point = result.data[0];
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
    const rows = result.data;
    if (!Array.isArray(rows) || rows.length < 2) continue;
    const latest = rows[0];
    const prev = rows[1];
    if (!Number.isFinite(latest.close) || !Number.isFinite(prev.close)) continue;
    const changePct = ((latest.close - prev.close) / prev.close) * 100;
    items.push({ symbol, close: latest.close, changePct, date: latest.date });
    seriesMap[symbol] = rows;
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
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
    const recent = rows.slice(0, 20);
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
    const rows = result.data;
    if (!Array.isArray(rows) || rows.length < 6) continue;
    const latest = rows[0];
    const prior = rows[5];
    if (!Number.isFinite(latest.close) || !Number.isFinite(prior.close)) continue;
    const returnPct = ((latest.close - prior.close) / prior.close) * 100;
    items.push({ symbol, close: latest.close, returnPct, date: latest.date });
    if (!dataAt || latest.date > dataAt) dataAt = latest.date;
  }

  return { items, dataAt };
}

async function runVolRegime(entry, ctx) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFredSeries(seriesCtx, "VIXCLS", { limit: 1 });
  const point = result.data[0];
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
  const point = result.data[0];
  const items = [];
  if (point && Number.isFinite(point.value)) {
    items.push({ series: "RRPONTSYD", value: point.value, date: point.date });
  }
  return { items, dataAt: point?.date || null };
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
  "liquidity-conditions-proxy": runLiquidityConditions
};

async function runBlock(entry, ctx, cache) {
  const started = Date.now();
  const runner = RUNNERS[entry.blockId];
  if (!runner) {
    throw new Error(`missing runner for ${entry.blockId}`);
  }
  const result = await runner(entry, ctx, cache);
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

  return { snapshot, evaluation, latencyMs };
}

function writeUsageReport(usage) {
  const day = new Date().toISOString().slice(0, 10);
  const report = usage.snapshot(day);
  atomicWriteJson(USAGE_PATH, report);
}

function writeSeedManifest(manifest) {
  atomicWriteJson(MANIFEST_PATH, manifest);
}

async function main() {
  const { only } = parseArgs();
  execSync("node scripts/build-registry.js", { stdio: "inherit" });

  const registry = loadJson(path.join("registry", "feature-registry.json"));
  if (!registry || !Array.isArray(registry.features)) {
    throw new Error("registry load failed");
  }

  let entries = registry.features;
  if (only === "blocks1-12") {
    entries = entries.filter((entry) => entry.package === BLOCK_PACKAGE);
  }
  entries = orderEntries(entries);

  const limits = loadJson(path.join("registry", "limits.json"));
  const usage = createUsageCollector(limits);
  const budget = createBudgetState(limits, usage);

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
        const { snapshot, evaluation } = await runBlock(entry, ctx, cache);
        const snapshotPath = path.join(SNAPSHOT_DIR, `${entry.blockId}.json`);

        if (evaluation.allowed) {
          atomicWriteJson(snapshotPath, snapshot);
        } else {
          const existing = readExistingSnapshot(entry.blockId);
          if (!existing) {
            atomicWriteJson(snapshotPath, snapshot);
          }
        }

        manifest.blocks.push({
          blockId: entry.blockId,
          title: entry.title,
          status: snapshot.meta.status,
          reason: snapshot.meta.reason,
          itemsCount: snapshot.meta.itemsCount,
          coveragePct: snapshot.meta.coveragePct,
          wroteSnapshot: evaluation.allowed,
          durationMs: Date.now() - started
        });
      } catch (error) {
        const reason = error?.reason || "ERROR";
        usage.recordError(entry.provider, reason);
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
      }
    }
  } finally {
    writeSeedManifest(manifest);
    writeUsageReport(usage);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
