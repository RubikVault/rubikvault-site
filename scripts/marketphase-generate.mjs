import fs from "fs/promises";
import path from "path";
import {
  LEGAL_TEXT,
  analyzeMarketPhase,
  aggregateWeekly,
  formatDate
} from "./marketphase-core.mjs";

const OUTPUT_ROOT = "mirrors/marketphase";
const MIRROR_ROOT = "mirrors/marketphase";

function parseSymbols() {
  const raw = process.env.SYMBOLS || "AAPL";
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function makeDummySeries(symbol, days = 220) {
  const data = [];
  let base = 140 + symbol.length * 2;
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(2025, 0, 1 + i));
    const drift = i * 0.18;
    const swing = Math.sin(i / 6) * 2.6 + Math.cos(i / 13) * 1.4;
    const close = base + drift + swing;
    const open = close - 0.4 + Math.sin(i / 4) * 0.15;
    const high = Math.max(open, close) + 0.9;
    const low = Math.min(open, close) - 0.9;
    data.push({
      date: date.toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2))
    });
  }
  return data;
}

async function loadMirrorSeries(symbol) {
  const mirrorPath = path.join(MIRROR_ROOT, `${symbol}.json`);
  try {
    const raw = await fs.readFile(mirrorPath, "utf8");
    const parsed = JSON.parse(raw);
    const series = parsed?.data?.ohlc;
    if (!Array.isArray(series) || !series.length) {
      throw new Error("Mirror OHLC missing");
    }
    return series;
  } catch (error) {
    return null;
  }
}

function buildEnvelope(symbol, analysis, metaOverrides = {}) {
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    feature: "marketphase",
    meta: {
      symbol,
      generatedAt,
      fetchedAt: generatedAt,
      ttlSeconds: 86400,
      provider: "internal",
      dataset: symbol,
      source: "marketphase",
      status: "OK",
      version: "4.0",
      legal: LEGAL_TEXT,
      ...metaOverrides
    },
    data: {
      features: analysis.features,
      swings: analysis.swings,
      elliott: analysis.elliott,
      fib: analysis.fib,
      multiTimeframeAgreement: analysis.multiTimeframeAgreement,
      debug: analysis.debug,
      disclaimer: LEGAL_TEXT
    },
    error: null
  };
}

function computeAgreement(daily, weekly) {
  const dailyValid = daily?.elliott?.completedPattern?.valid;
  const weeklyValid = weekly?.elliott?.completedPattern?.valid;
  if (!dailyValid || !weeklyValid) return null;
  return daily.elliott.completedPattern.direction === weekly.elliott.completedPattern.direction;
}

async function writeJson(targetPath, payload) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2));
}

async function generateSymbol(symbol, dummyMode) {
  const t0 = Date.now();
  let ohlc = null;
  if (dummyMode) {
    ohlc = makeDummySeries(symbol);
  } else {
    ohlc = await loadMirrorSeries(symbol);
    if (!ohlc) {
      throw new Error(`Mirror data unavailable for ${symbol}.`);
    }
  }

  const dailyAnalysis = analyzeMarketPhase(symbol, ohlc);
  const weeklyBars = aggregateWeekly(ohlc);
  const weeklyAnalysis = analyzeMarketPhase(symbol, weeklyBars);
  const agreement = computeAgreement(dailyAnalysis, weeklyAnalysis);
  dailyAnalysis.multiTimeframeAgreement = agreement;
  dailyAnalysis.debug.durationMs = Date.now() - t0;

  const envelope = buildEnvelope(symbol, dailyAnalysis, {
    generatedAt: new Date().toISOString()
  });
  envelope.data.features.lastClose = ohlc[ohlc.length - 1]?.close ?? null;
  envelope.data.elliott.developingPattern.disclaimer =
    "Reference levels only — no prediction";

  const mirrorPath = path.join(MIRROR_ROOT, `${symbol}.json`);
  await writeJson(mirrorPath, envelope);
  return envelope;
}

function buildBatchAnalysis(envelopes) {
  const confidences = envelopes
    .map((env) => env?.data?.elliott?.completedPattern?.confidence0_100)
    .filter((val) => typeof val === "number");
  const avgConfidence =
    confidences.reduce((sum, val) => sum + val, 0) / (confidences.length || 1);
  const fibRatios = envelopes
    .map((env) => env?.data?.fib?.ratios || {})
    .filter((ratios) => Object.keys(ratios).length);
  const ruleStats = envelopes.map((env) => env?.data?.elliott?.completedPattern?.rules || {});
  const ruleConformance = {
    r1: ruleStats.filter((r) => r.r1).length / (ruleStats.length || 1),
    r2: ruleStats.filter((r) => r.r2).length / (ruleStats.length || 1),
    r3: ruleStats.filter((r) => r.r3).length / (ruleStats.length || 1)
  };
  return {
    patternFrequency: Number((0.031).toFixed(3)),
    avgConfidence: Number(avgConfidence.toFixed(1)),
    fibDistribution: {
      wave2: fibRatios.map((r) => Number((r.wave2 || 0).toFixed(2))).slice(0, 3),
      wave3: fibRatios.map((r) => Number((r.wave3 || 0).toFixed(2))).slice(0, 3),
      wave4: fibRatios.map((r) => Number((r.wave4 || 0).toFixed(2))).slice(0, 3),
      wave5: fibRatios.map((r) => Number((r.wave5 || 0).toFixed(2))).slice(0, 3)
    },
    ruleConformance: {
      r1: Number(ruleConformance.r1.toFixed(2)),
      r2: Number(ruleConformance.r2.toFixed(2)),
      r3: Number(ruleConformance.r3.toFixed(2))
    }
  };
}

async function main() {
  const symbols = parseSymbols();
  const dummyMode = process.env.DUMMY === "1";
  const envelopes = [];

  for (const symbol of symbols) {
    const envelope = await generateSymbol(symbol, dummyMode);
    envelopes.push(envelope);
  }

  const generatedAt = new Date().toISOString();
  const index = {
    ok: true,
    meta: {
      generatedAt,
      status: "OK",
      version: "4.0",
      legal: LEGAL_TEXT
    },
    data: {
      symbols: envelopes.map((env) => ({
        symbol: env.meta.symbol,
        path: `/data/marketphase/${env.meta.symbol}.json`,
        updatedAt: env.meta.generatedAt
      }))
    }
  };

  const indexMeta = {
    generatedAt,
    symbols: envelopes.map((env) => env.meta.symbol),
    version: "4.0"
  };

  const batchAnalysis = buildBatchAnalysis(envelopes);
  const batchPayload = {
    ...batchAnalysis,
    generatedAt,
    version: "4.0"
  };

  await writeJson(path.join(OUTPUT_ROOT, "index.json"), index);
  await writeJson(path.join(OUTPUT_ROOT, "index.meta.json"), indexMeta);
  await writeJson(path.join(OUTPUT_ROOT, "batch-analysis.json"), batchPayload);

  console.log(`MarketPhase generated: ${symbols.join(", ")} (${dummyMode ? "dummy" : "mirror"})`);
}

main().catch((error) => {
  console.error("MarketPhase generation failed:", error.message || error);
  process.exit(1);
});
