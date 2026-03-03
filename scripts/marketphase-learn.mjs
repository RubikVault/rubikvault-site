// MarketPhase v8.0 — Learner (Deterministic Bootstrap)
// - Deterministic PRNG seeded by commit hash (or v8-init)
// - Rolling train/test split (30-day cutoff placeholder)
// - Outputs calibration stats to public/data/marketphase/learn.json

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeededRNG, round6, round6Object } from "./utils/scientific-math.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = path.join(__dirname, "../mirrors/marketphase");
const OUT_PATH = path.join(__dirname, "../public/data/marketphase/learn.json");

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

function extractDeviations(env) {
  const completed = env?.data?.elliott?.completedPattern || {};
  const confidence = typeof completed.confidence0_100 === "number" ? completed.confidence0_100 : 0;
  const conformance = env?.data?.fib?.conformanceScore || 0;
  // deviation: lower confidence & conformance implies higher deviation
  const deviation = round6(100 - ((confidence + conformance) / 2));
  return deviation;
}

function bootstrap(deviations, rng, iterations = 1000) {
  const n = deviations.length;
  if (!n) return { mean: 0, stddev: 0 };
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng() * n);
      sum += deviations[idx];
    }
    samples.push(sum / n);
  }
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
  return { mean: round6(mean), stddev: round6(Math.sqrt(variance)) };
}

async function main() {
  const commitHash = process.env.COMMIT_HASH || "v8-init";
  const rng = createSeededRNG(commitHash);
  const files = await listHistoryFiles();
  const deviations = [];

  for (const file of files) {
    try {
      const env = await loadEnvelope(file);
      deviations.push(extractDeviations(env));
    } catch {
      continue;
    }
  }

  const { mean, stddev } = bootstrap(deviations, rng, 1000);

  const payload = {
    meta: {
      version: "8.0",
      methodology: "Deterministic bootstrap on deviations (confidence/conformance)",
      commitHash,
      precision: "IEEE754-Double-Round6",
      iterations: 1000,
      generatedAt: new Date().toISOString()
    },
    data: {
      sampleSize: deviations.length,
      meanDeviation: mean,
      stddevDeviation: stddev
    }
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(round6Object(payload), null, 2));
  console.log(`MarketPhase learn written: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("marketphase-learn failed:", err);
  process.exit(1);
});
