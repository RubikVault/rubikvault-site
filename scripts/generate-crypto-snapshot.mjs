import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveMirror, loadMirror, withRetries } from "./utils/mirror-io.mjs";
import { buildBaseMirror, buildSystemHealth } from "./utils/mirror-builders.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_DIRS = [
  path.resolve(__dirname, "../mirrors"),
  path.resolve(__dirname, "../public/mirrors")
];
const SYSTEM_HEALTH_PATH = path.resolve(__dirname, "../public/mirrors/system-health.json");

const COINS = ["bitcoin", "ethereum", "solana"];
const COIN_MAP = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL" };
const URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINS.join(",")}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;

async function fetchCrypto() {
  return withRetries(async () => {
    const res = await fetch(URL, { headers: { "User-Agent": "RubikVault/1.0" } });
    if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
    return res.json();
  }, { retries: 2, baseDelayMs: 800 });
}

const previous = loadMirror(path.resolve(__dirname, "../public/mirrors/crypto-snapshot.json"));
let items = [];
let errors = [];
let noteFlags = [];

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
