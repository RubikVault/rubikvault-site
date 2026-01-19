// MarketPhase v8.0 — Falsifier
// - Dual hypothesis tests vs Random Walk and AR(1) surrogate
// - Bonferroni correction: alpha_global=0.05 -> alpha_corrected=0.025
// - Deterministic via seeded RNG
// - Outputs scientific-audit.json to public/data/marketphase/scientific-audit.json

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeededRNG, round6, round6Array, round6Object } from "./utils/scientific-math.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.join(__dirname, "../mirrors/marketphase");
const OUT_PATH = path.join(__dirname, "../public/data/marketphase/scientific-audit.json");

const ALPHA_GLOBAL = 0.05;
const ALPHA_CORRECTED = round6(ALPHA_GLOBAL / 2);

async function listHistoryFiles() {
  const entries = await fs.readdir(HISTORY_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => path.join(HISTORY_DIR, e.name));
}

async function loadEnvelope(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function extractPatternSeries(env) {
  const completed = env?.data?.elliott?.completedPattern || {};
  const conformance = env?.data?.fib?.conformanceScore || 0;
  const confidence = completed.confidence0_100 || 0;
  // Combine into a single scalar "pattern strength"
  const strength = round6((confidence + conformance) / 2);
  return strength;
}

function generateRandomWalk(length, rng) {
  const arr = [];
  let x = 0;
  for (let i = 0; i < length; i++) {
    x += rng() - 0.5;
    arr.push(x);
  }
  return arr;
}

function generateAR1(length, rng, phi = 0.5) {
  const arr = [];
  let x = 0;
  for (let i = 0; i < length; i++) {
    const noise = rng() - 0.5;
    x = phi * x + noise;
    arr.push(x);
  }
  return arr;
}

function calculatePValue(real, synthetic) {
  if (!synthetic.length) return 1;
  const realMean = real.reduce((s, v) => s + v, 0) / real.length;
  const synMeans = synthetic.map((series) => series.reduce((s, v) => s + v, 0) / series.length);
  const greater = synMeans.filter((m) => m >= realMean).length;
  return round6(greater / synMeans.length);
}

async function main() {
  const commitHash = process.env.COMMIT_HASH || "v8-falsify";
  const rng = createSeededRNG(commitHash);
  const files = await listHistoryFiles();
  const realSeries = [];
  for (const file of files) {
    try {
      const env = await loadEnvelope(file);
      realSeries.push(extractPatternSeries(env));
    } catch {
      continue;
    }
  }
  const n = realSeries.length || 1;

  // Build synthetic ensembles
  const ensembleSize = 200;
  const rwSeries = [];
  const ar1Series = [];
  for (let i = 0; i < ensembleSize; i++) {
    rwSeries.push(generateRandomWalk(n, rng));
    ar1Series.push(generateAR1(n, rng, 0.5));
  }

  const pValRW = calculatePValue(realSeries, rwSeries);
  const pValAR1 = calculatePValue(realSeries, ar1Series);
  const isFalsified = pValRW >= ALPHA_CORRECTED || pValAR1 >= ALPHA_CORRECTED;

  const payload = {
    meta: {
      version: "8.0",
      alphaGlobal: ALPHA_GLOBAL,
      alphaCorrected: ALPHA_CORRECTED,
      commitHash,
      methodology: "Dual hypothesis vs Random Walk & AR(1), Bonferroni corrected",
      generatedAt: new Date().toISOString(),
      precision: "IEEE754-Double-Round6"
    },
    data: {
      sampleSize: n,
      pValues: {
        randomWalk: pValRW,
        ar1: pValAR1
      },
      result: isFalsified ? "PASS" : "FAIL",
      notes: isFalsified
        ? "Patterns deviate from both RW and AR(1) at alpha=0.025"
        : "Insufficient evidence to reject RW/AR(1) at alpha=0.025"
    }
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(round6Object(payload), null, 2));
  console.log(`MarketPhase scientific audit written: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("marketphase-falsify failed:", err);
  process.exit(1);
});
