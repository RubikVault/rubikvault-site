import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveMirror, loadMirror } from "./utils/mirror-io.mjs";
import { buildBaseMirror, buildSystemHealth } from "./utils/mirror-builders.mjs";
import { createBudgetState, createUsageCollector, loadBudgetsConfig } from "./_lib/usage.js";
import { fetchCoinGeckoSimple } from "./providers/coingecko.js";
import { acquireLock, releaseLock } from "./_lib/lock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_DIRS = [path.resolve(__dirname, "../mirrors")];
const SYSTEM_HEALTH_PATH = path.resolve(__dirname, "../mirrors/system-health.json");

const COINS = ["bitcoin", "ethereum", "solana"];
const COIN_MAP = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL" };
async function fetchCrypto() {
  const limits = loadBudgetsConfig(path.resolve(__dirname, ".."));
  const usage = createUsageCollector(limits);
  const budget = createBudgetState(limits, usage);
  const ctx = { providerId: "coingecko", endpoint: "simple", usage, budget };
  const result = await fetchCoinGeckoSimple(ctx, {
    ids: COINS,
    vsCurrency: "usd",
    includeMarketCap: true,
    include24hChange: true
  });
  return result.data || {};
}

const lock = acquireLock({ providerId: "coingecko", datasetId: "crypto-snapshot", ttlSeconds: 900 });
if (!lock.ok) {
  console.log("LOCK_HELD", lock.details?.expiresAt || "active");
  process.exit(0);
}

try {
  const previous = loadMirror(path.resolve(__dirname, "../mirrors/crypto-snapshot.json"));
  let items = [];
  const errors = [];
  const noteFlags = [];

  try {
    const data = await fetchCrypto();
    items = COINS.map((coin) => {
      const payload = data[coin] || {};
      return {
        symbol: COIN_MAP[coin],
        price: Number.isFinite(payload.usd) ? payload.usd : null,
        change24h: Number.isFinite(payload.usd_24h_change) ? payload.usd_24h_change : null,
        marketCap: Number.isFinite(payload.usd_market_cap) ? payload.usd_market_cap : null
      };
    }).filter((item) => item.price !== null);
  } catch (err) {
    errors.push(String(err.message || err));
  }

  if (!items.length && previous) {
    items = previous.items || [];
    if (items.length) {
      noteFlags.push("STALE_LAST_GOOD");
    }
  }

  const mode = items.length ? "LIVE" : "EMPTY";
  const dataQuality = items.length ? (noteFlags.includes("STALE_LAST_GOOD") ? "STALE" : "OK") : "EMPTY";

  const mirror = buildBaseMirror({
    mirrorId: "crypto-snapshot",
    mode,
    cadence: "hourly",
    trust: "raw",
    sourceUpstream: "coingecko",
    whyUnique: "Live crypto snapshot from CoinGecko.",
    items,
    context: { coins: COINS },
    missingSymbols: [],
    errors,
    notes: noteFlags,
    dataQuality,
    asOf: new Date().toISOString()
  });

  for (const dir of MIRROR_DIRS) {
    saveMirror(path.join(dir, "crypto-snapshot.json"), mirror);
  }

  const systemHealth = loadMirror(SYSTEM_HEALTH_PATH) || buildSystemHealth({
    jobs: [],
    mirrors: [],
    selectedSymbols: [],
    skippedSymbols: [],
    overallStatus: "OK"
  });

  const jobEntry = {
    id: "crypto-snapshot",
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    status: errors.length ? "FAILED" : "OK",
    durationMs: 0,
    errors,
    notes: []
  };

  systemHealth.jobs = systemHealth.jobs.filter((job) => job.id !== "crypto-snapshot");
  systemHealth.jobs.push(jobEntry);

  systemHealth.mirrors = systemHealth.mirrors.filter((m) => m.id !== "crypto-snapshot");
  systemHealth.mirrors.push({
    id: "crypto-snapshot",
    updatedAt: mirror.updatedAt,
    dataQuality: mirror.dataQuality,
    itemCount: mirror.items.length,
    sizeKB: 0
  });

  saveMirror(SYSTEM_HEALTH_PATH, systemHealth);

  console.log("CRYPTO_SNAPSHOT_DONE", items.length);
} finally {
  releaseLock(lock.path);
}
