import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { saveMirror, validateBasicMirrorShape, loadMirror, atomicWriteJson } from "./utils/mirror-io.mjs";
import { selectUniverse } from "./utils/universe.mjs";
import { processSymbols } from "./utils/eod-market-symbols.mjs";
import { buildEodMirrors } from "./utils/eod-market-mirrors.mjs";
import { buildDigest, buildSystemHealth } from "./utils/mirror-builders.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_DIRS = [
  path.resolve(__dirname, "../mirrors")
];
const SYSTEM_HEALTH_PATH = path.resolve(__dirname, "../mirrors/system-health.json");
const DAILY_DIGEST_PATH = path.resolve(__dirname, "../mirrors/daily-digest.json");
const PREV_REGIME_PATH = path.resolve(__dirname, "../mirrors/market-regime.json");

const CONTINUOUS_MIN_ITEMS = {
  quotes: 3,
  "market-cockpit": 1,
  "market-health": 1,
  "price-snapshot": 3,
  "top-movers": 1,
  "tech-signals": 3,
  "alpha-radar": 3,
  "market-regime": 1,
  "volume-anomaly": 1,
  "breakout-energy": 1
};

function fallbackToLastGood(mirrorId, mirror) {
  const expected = CONTINUOUS_MIN_ITEMS[mirrorId] || 0;
  if (mirror.items.length >= expected) return mirror;
  const prevPath = path.resolve(__dirname, `../mirrors/${mirrorId}.json`);
  const prev = loadMirror(prevPath);
  if (prev && Array.isArray(prev.items) && prev.items.length >= expected) {
    return {
      ...prev,
      dataQuality: "STALE",
      notes: [...(prev.notes || []), "STALE_LAST_GOOD"],
      updatedAt: mirror.updatedAt
    };
  }
  return mirror;
}

const { selected: universe, skipped } = selectUniverse();
const data = await processSymbols(universe);
const asOfIso = data.latestAsOf ? new Date(`${data.latestAsOf}T21:00:00Z`).toISOString() : new Date().toISOString();

const { mirrors } = buildEodMirrors({
  universe,
  skipped,
  data,
  asOfIso,
  prevRegimePath: PREV_REGIME_PATH
});

const mirrorSummary = [];
for (const [mirrorId, mirrorDataRaw] of Object.entries(mirrors)) {
  const mirrorData = fallbackToLastGood(mirrorId, mirrorDataRaw);
  const validation = validateBasicMirrorShape(mirrorData);
  if (!validation.ok) {
    throw new Error(`mirror_invalid:${mirrorId}`);
  }
  for (const dir of MIRROR_DIRS) {
    saveMirror(path.join(dir, `${mirrorId}.json`), mirrorData);
  }
  mirrorSummary.push({
    id: mirrorId,
    updatedAt: mirrorData.updatedAt,
    dataQuality: mirrorData.dataQuality,
    itemCount: mirrorData.items.length,
    sizeKB: 0
  });
}

const systemHealth = buildSystemHealth({
  jobs: [
    {
      id: "eod-market",
      lastRunAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      status: data.errors.length ? "FAILED" : "OK",
      durationMs: 0,
      errors: data.errors,
      notes: []
    }
  ],
  mirrors: mirrorSummary,
  selectedSymbols: universe,
  skippedSymbols: skipped,
  overallStatus: data.errors.length ? "DEGRADED" : "OK"
});

saveMirror(SYSTEM_HEALTH_PATH, systemHealth);

saveMirror(DAILY_DIGEST_PATH, buildDigest({
  highlights: ["EOD mirrors updated"],
  signals: mirrors["breakout-energy"].items.slice(0, 3).map((item) => `${item.symbol} breakout energy`),
  changes: [],
  sources: Object.keys(mirrors)
}));

console.log("EOD_MARKET_MIRRORS_DONE", universe.length, "symbols");
