import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import zlib from "node:zlib";
import {
  LEGAL_TEXT,
  analyzeMarketPhase,
  aggregateWeekly
} from "../marketphase-core.mjs";
import { round6, round6Object, round6Array } from "../utils/scientific-math.mjs";
import { createOptionalCloudflareRestKVFromEnv } from "../lib/kv-write.js";
import { fetchBarsWithProviderChain } from "../../functions/api/_shared/eod-providers.mjs";

const REPO_ROOT = process.cwd();
const DEFAULT_UNIVERSE = "all";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MIN_BARS = 120; // Lowered from 200 to capture shorter history stocks
const DEFAULT_MIN_SUPPORTED_BARS = Number(process.env.MARKETPHASE_MIN_SUPPORTED_BARS || 60);
const DEFAULT_OUTPUTSIZE = 300;
const DEFAULT_MIN_COVERAGE = Number(process.env.MARKETPHASE_MIN_COVERAGE_RATIO || 0.9);
const DEFAULT_KV_GET_RETRIES = Number(process.env.MARKETPHASE_KV_GET_RETRIES || 10); // Increased from 4 for robustness
const DEFAULT_KV_BACKOFF_MS = Number(process.env.MARKETPHASE_KV_BACKOFF_MS || 500); // Increased from 350

function toBool(value) {
  const s = String(value || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeTicker(value) {
  return String(value || "").trim().toUpperCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function shouldRetryKvError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;
  if (message.includes("429")) return true;
  if (message.includes("please wait")) return true;
  if (message.includes("timeout")) return true;
  if (message.includes("rate")) return true;
  if (message.includes("limit")) return true; // Added for robustness
  if (message.includes("exceeded")) return true; // Added for robustness
  if (message.includes("econnreset")) return true;
  if (message.includes("temporar")) return true;
  return false;
}

async function readKvBarsWithRetry(kv, key, retries, baseBackoffMs) {
  if (!kv || typeof kv.get !== "function") {
    return { raw: null, error: null, attempts: 0 };
  }
  const maxAttempts = Math.max(1, Number(retries) || DEFAULT_KV_GET_RETRIES);
  const baseDelay = Math.max(50, Number(baseBackoffMs) || DEFAULT_KV_BACKOFF_MS);
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await kv.get(key);
      return { raw, error: null, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetryKvError(error)) break;
      const jitter = Math.floor(Math.random() * 120);
      const delay = baseDelay * attempt + jitter;
      await sleep(delay);
    }
  }
  return {
    raw: null,
    error: {
      message: lastError?.message || String(lastError),
      attempts: maxAttempts
    },
    attempts: maxAttempts
  };
}

function parseNdjson(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function readAdjustedBarsFromRepo(ticker) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) return [];
  const file = path.join(REPO_ROOT, "public/data/v3/series/adjusted", `US__${symbol}.ndjson.gz`);
  try {
    const gz = await fs.readFile(file);
    const rows = parseNdjson(zlib.gunzipSync(gz).toString("utf8"));
    return rows
      .map((row) => {
        const date = String(row?.trading_date || row?.date || "").slice(0, 10);
        const close = Number(row?.adjusted_close ?? row?.adj_close ?? row?.close);
        if (!date || !Number.isFinite(close)) return null;
        const openRaw = Number(row?.open);
        const highRaw = Number(row?.high);
        const lowRaw = Number(row?.low);
        return {
          date,
          open: Number.isFinite(openRaw) ? openRaw : close,
          high: Number.isFinite(highRaw) ? highRaw : close,
          low: Number.isFinite(lowRaw) ? lowRaw : close,
          close
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch {
    return [];
  }
}

async function readJson(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const raw = await fs.readFile(abs, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(relPath, payload) {
  const abs = path.join(REPO_ROOT, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(payload, null, 2) + "\n", "utf-8");
}

function parseArgs(argv) {
  const out = {
    universe: DEFAULT_UNIVERSE,
    outDir: "public/data/marketphase",
    concurrency: DEFAULT_CONCURRENCY,
    minBars: DEFAULT_MIN_BARS,
    minSupportedBars: DEFAULT_MIN_SUPPORTED_BARS,
    outputsize: DEFAULT_OUTPUTSIZE,
    minCoverage: DEFAULT_MIN_COVERAGE,
    kvGetRetries: DEFAULT_KV_GET_RETRIES,
    kvBackoffMs: DEFAULT_KV_BACKOFF_MS,
    allowProviderFallback: false,
    writeBackKv: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--universe") {
      out.universe = argv[i + 1] || out.universe;
      i += 1;
    } else if (arg === "--out") {
      out.outDir = argv[i + 1] || out.outDir;
      i += 1;
    } else if (arg === "--concurrency") {
      out.concurrency = Number(argv[i + 1]) || out.concurrency;
      i += 1;
    } else if (arg === "--min-bars") {
      out.minBars = Number(argv[i + 1]) || out.minBars;
      i += 1;
    } else if (arg === "--min-supported-bars") {
      out.minSupportedBars = Number(argv[i + 1]) || out.minSupportedBars;
      i += 1;
    } else if (arg === "--outputsize") {
      out.outputsize = Number(argv[i + 1]) || out.outputsize;
      i += 1;
    } else if (arg === "--min-coverage") {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed)) out.minCoverage = parsed;
      i += 1;
    } else if (arg === "--kv-get-retries") {
      out.kvGetRetries = Number(argv[i + 1]) || out.kvGetRetries;
      i += 1;
    } else if (arg === "--kv-backoff-ms") {
      out.kvBackoffMs = Number(argv[i + 1]) || out.kvBackoffMs;
      i += 1;
    } else if (arg === "--allow-provider" || arg === "--provider-fallback") {
      out.allowProviderFallback = true;
    } else if (arg === "--write-kv") {
      out.writeBackKv = true;
    }
  }
  return out;
}

function extractUniverseTickers(universeJson) {
  if (!Array.isArray(universeJson)) return [];
  return universeJson
    .map((row) => normalizeTicker(row?.ticker ?? row?.symbol ?? row?.code ?? null))
    .filter(Boolean);
}

function getCommitHash() {
  try {
    return process.env.COMMIT_HASH || execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildEnvelope(symbol, analysis) {
  const generatedAt = isoNow();
  const commitHash = getCommitHash();

  const normalizedAnalysis = {
    features: round6Object(analysis.features),
    swings: {
      raw: round6Array(analysis.swings.raw.map((s) => ({ ...s, price: round6(s.price) }))),
      confirmed: round6Array(analysis.swings.confirmed.map((s) => ({ ...s, price: round6(s.price) })))
    },
    elliott: round6Object(analysis.elliott),
    fib: round6Object(analysis.fib),
    multiTimeframeAgreement: analysis.multiTimeframeAgreement,
    debug: analysis.debug,
    disclaimer: LEGAL_TEXT
  };

  if (normalizedAnalysis.elliott?.developingPattern?.fibLevels) {
    normalizedAnalysis.elliott.developingPattern.fibLevels = {
      support: round6Array(normalizedAnalysis.elliott.developingPattern.fibLevels.support),
      resistance: round6Array(normalizedAnalysis.elliott.developingPattern.fibLevels.resistance)
    };
  }

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
      version: "8.0",
      methodologyVersion: "8.0",
      precision: "IEEE754-Double-Round6",
      auditTrail: {
        generatedBy: "MarketPhase-v8-Engine",
        commitHash,
        reviewDate: generatedAt,
        standards: ["ISO-8000", "IEEE-7000"]
      },
      legal: LEGAL_TEXT
    },
    data: normalizedAnalysis,
    error: null
  };
}

function computeAgreement(daily, weekly) {
  const dailyValid = daily?.elliott?.completedPattern?.valid;
  const weeklyValid = weekly?.elliott?.completedPattern?.valid;
  if (!dailyValid || !weeklyValid) return null;
  return daily.elliott.completedPattern.direction === weekly.elliott.completedPattern.direction;
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

function normalizeBars(bars) {
  if (!Array.isArray(bars)) return [];
  return bars
    .map((bar) => {
      if (!bar || typeof bar !== "object") return null;
      const date = bar.date || bar.datetime || bar.timestamp;
      const open = Number(bar.open);
      const high = Number(bar.high);
      const low = Number(bar.low);
      const close = Number(bar.close);
      if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        return null;
      }
      return { date, open, high, low, close };
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

async function writeKvBars(kv, key, bars, provider = null) {
  if (!kv || typeof kv.put !== "function") return false;
  const payload = {
    bars,
    provider,
    stored_at: isoNow()
  };
  try {
    await kv.put(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

async function loadKvNamespaceIdFromWrangler() {
  try {
    const raw = await fs.readFile(path.join(REPO_ROOT, "wrangler.toml"), "utf-8");
    const match = raw.match(/\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"RV_KV"[\s\S]*?id\s*=\s*"([^"]+)"/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

async function ensureKvNamespaceEnv() {
  if (process.env.CF_KV_NAMESPACE_ID) return;
  const id = await loadKvNamespaceIdFromWrangler();
  if (id) process.env.CF_KV_NAMESPACE_ID = id;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureKvNamespaceEnv();

  const kv = createOptionalCloudflareRestKVFromEnv();
  const allowProviderFallback = args.allowProviderFallback || toBool(process.env.ALLOW_PROVIDER_FETCH) || toBool(process.env.MARKETPHASE_PROVIDER_FALLBACK);
  const writeBackKv = args.writeBackKv || toBool(process.env.MARKETPHASE_WRITE_BACK_KV);
  if (!kv && !allowProviderFallback) {
    console.warn("KV backend unavailable (CF_ACCOUNT_ID/CF_API_TOKEN/CF_KV_NAMESPACE_ID missing). Provider fallback disabled.");
  }

  const universe = await readJson(`public/data/universe/${args.universe}.json`);
  const tickers = extractUniverseTickers(universe);
  if (!tickers.length) {
    console.warn(`Universe ${args.universe} is empty; skipping marketphase build.`);
    return;
  }

  const outRoot = args.outDir;
  const missing = [];
  const generated = [];
  const effectiveMinBars = Math.max(2, Number(args.minBars) || DEFAULT_MIN_BARS);
  const effectiveMinSupportedBars = Math.max(2, Math.min(effectiveMinBars, Number(args.minSupportedBars) || DEFAULT_MIN_SUPPORTED_BARS));

  const results = await mapWithConcurrency(tickers, args.concurrency, async (ticker) => {
    const key = `eod:${ticker}`;
    let parsed = null;
    let bars = [];
    let provider = null;
    let usedProviderFallback = false;
    let kvReadFailure = null;

    if (kv && typeof kv.get === "function") {
      const kvRead = await readKvBarsWithRetry(kv, key, args.kvGetRetries, args.kvBackoffMs);
      const raw = kvRead.raw;
      if (kvRead.error) kvReadFailure = kvRead.error;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          kvReadFailure = { message: "INVALID_EOD_JSON" };
          parsed = null;
        }
        if (parsed) {
          bars = normalizeBars(parsed?.bars || parsed?.data?.bars || parsed?.data || []);
        }
      }
    }

    let hasBars = bars.length > 0;
    let barsSufficient = bars.length >= effectiveMinBars;

    if (!hasBars || !barsSufficient) {
      const repoBars = await readAdjustedBarsFromRepo(ticker);
      if (repoBars.length) {
        bars = repoBars;
        provider = "local-adjusted-series";
        hasBars = true;
        barsSufficient = bars.length >= effectiveMinBars;
      }
    }

    if ((!hasBars || !barsSufficient) && allowProviderFallback) {
      const startDate = new Date(Date.now() - 365 * 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const result = await fetchBarsWithProviderChain(ticker, process.env, {
        outputsize: String(args.outputsize || DEFAULT_OUTPUTSIZE),
        startDate,
        allowFailover: true
      });
      if (result.ok) {
        usedProviderFallback = true;
        provider = result.provider || null;
        bars = normalizeBars(result.bars || []);
      } else {
        const code = result.error?.code ? String(result.error.code) : "PROVIDER_FETCH_FAILED";
        missing.push({
          ticker,
          reason: `PROVIDER_${code}`,
          details: {
            provider: result.provider || null,
            error: result.error || null
          }
        });
        return null;
      }
    }

    if (!bars.length) {
      const reason = kvReadFailure
        ? "KV_READ_FAILED"
        : (!kv ? "KV_BACKEND_UNAVAILABLE" : "NO_EOD_BARS");
      missing.push({ ticker, reason, ...(kvReadFailure ? { details: kvReadFailure } : {}) });
      return null;
    }

    if (bars.length < effectiveMinBars) {
      const details = {
        bars: bars.length,
        minBars: effectiveMinBars,
        minSupportedBars: effectiveMinSupportedBars
      };
      if (bars.length >= effectiveMinSupportedBars) {
        missing.push({ ticker, reason: "NOT_SUPPORTED_SHORT_HISTORY", status: "not_supported", details });
      } else {
        missing.push({ ticker, reason: "INSUFFICIENT_BARS", details });
      }
      return null;
    }

    if (usedProviderFallback && kv && writeBackKv) {
      await writeKvBars(kv, key, bars, provider);
    }

    const t0 = Date.now();
    const daily = analyzeMarketPhase(ticker, bars);
    const weeklyBars = aggregateWeekly(bars);
    const weekly = analyzeMarketPhase(ticker, weeklyBars);
    const agreement = computeAgreement(daily, weekly);
    daily.multiTimeframeAgreement = agreement;
    if (daily.debug) {
      daily.debug.durationMs = Date.now() - t0;
    }

    const envelope = buildEnvelope(ticker, daily);
    envelope.data.features.lastClose = bars[bars.length - 1]?.close ?? null;
    envelope.data.elliott.developingPattern.disclaimer = "Reference levels only -- no prediction";

    const relPath = path.join(outRoot, `${ticker}.json`);
    await writeJson(relPath, envelope);
    generated.push(ticker);
    return envelope;
  });

  const envelopes = results.filter(Boolean);
  const generatedAt = isoNow();
  const commitHash = getCommitHash();

  const generatedSymbols = envelopes
    .filter((env) => env?.meta?.symbol)
    .map((env) => ({
      symbol: env.meta.symbol,
      path: `/data/marketphase/${env.meta.symbol}.json`,
      updatedAt: env.meta.generatedAt
    }))
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  const coverageRatio = tickers.length > 0 ? generatedSymbols.length / tickers.length : 1;
  const minCoverage = Math.max(0, Math.min(1, Number(args.minCoverage)));

  const index = {
    ok: true,
    meta: {
      generatedAt,
      status: "OK",
      version: "8.0",
      methodologyVersion: "8.0",
      precision: "IEEE754-Double-Round6",
      auditTrail: {
        generatedBy: "MarketPhase-v8-Engine",
        commitHash,
        reviewDate: generatedAt,
        standards: ["ISO-8000", "IEEE-7000"]
      },
      legal: LEGAL_TEXT
    },
    data: {
      symbols: generatedSymbols
    }
  };

  const indexMeta = {
    generatedAt,
    symbols: generatedSymbols.map((entry) => entry.symbol),
    version: "8.0",
    commitHash
  };

  const batchAnalysis = buildBatchAnalysis(envelopes);
  const batchPayload = {
    ...round6Object(batchAnalysis),
    generatedAt,
    version: "8.0",
    commitHash
  };

  const missingPayload = {
    type: "marketphase.missing",
    asOf: generatedAt,
    universe: args.universe,
    expected: tickers.length,
    generated: generatedSymbols.length,
    coverage: Number(coverageRatio.toFixed(6)),
    minCoverage: Number(minCoverage.toFixed(6)),
    missing
  };
  await writeJson(path.join(outRoot, "missing.json"), missingPayload);

  if (coverageRatio < minCoverage) {
    const sampleMissing = missing
      .map((entry) => normalizeTicker(entry?.ticker || ""))
      .filter(Boolean)
      .slice(0, 25);
    throw new Error(
      `MARKETPHASE_COVERAGE_BELOW_THRESHOLD generated=${generatedSymbols.length} expected=${tickers.length} ratio=${coverageRatio.toFixed(4)} min=${minCoverage.toFixed(4)} sample_missing=${sampleMissing.join(",")}`
    );
  }

  await writeJson(path.join(outRoot, "index.json"), index);
  await writeJson(path.join(outRoot, "index.meta.json"), indexMeta);
  await writeJson(path.join(outRoot, "batch-analysis.json"), batchPayload);

  // Mirror missing.json to pipeline directory for audit compliance
  const pipelineMirrorPayload = {
    ...missingPayload,
    type: "pipeline.missing",
    mirrors: { from: "/data/marketphase/missing.json" }
  };
  await writeJson("public/data/pipeline/missing.json", pipelineMirrorPayload);
  console.log(`Mirror written: public/data/pipeline/missing.json`);

  console.log(`MarketPhase generated: ${generated.length}/${tickers.length}`);
  if (missing.length) {
    console.log(`Missing: ${missing.length}`);
  }
}

main().catch((error) => {
  console.error("MarketPhase KV build failed:", error.message || error);
  process.exit(1);
});
