import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMirror, saveMirror } from "./utils/mirror-io.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "mirrors");
const SEED_MANIFEST_PATH = path.join(DATA_DIR, "seed-manifest.json");
const USAGE_REPORT_PATH = path.join(DATA_DIR, "usage-report.json");
const HEALTH_PATH = path.join(DATA_DIR, "health.json");
const HEALTH_HISTORY_PATH = path.join(DATA_DIR, "health_history.json");

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function readJsonIfExists(filePath) {
  const payload = loadMirror(filePath);
  return payload || null;
}

function summarizeBlocks(seedManifest) {
  const blocks = Array.isArray(seedManifest?.blocks) ? seedManifest.blocks : [];
  const counts = { LIVE: 0, PARTIAL: 0, ERROR: 0 };
  const byReason = {};

  for (const b of blocks) {
    const status = String(b?.status || "ERROR").toUpperCase();
    const reason = String(b?.reason || "UNKNOWN");
    if (status === "LIVE") counts.LIVE += 1;
    else if (status === "PARTIAL") counts.PARTIAL += 1;
    else counts.ERROR += 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  const total = blocks.length;
  const okPct = total ? (counts.LIVE + counts.PARTIAL) / total : 0;

  return { blocks, counts: { ...counts, total }, okPct, byReason };
}

function summarizeUsage(usageReport) {
  const providers = usageReport?.providers && typeof usageReport.providers === "object" ? usageReport.providers : {};
  const totals = usageReport?.totals && typeof usageReport.totals === "object" ? usageReport.totals : {};
  return { providers, totals };
}

function buildHealth(seedManifest, usageReport) {
  const marketDate = todayUtc();
  const generatedAt = new Date().toISOString();

  const blocksSummary = summarizeBlocks(seedManifest);
  const usageSummary = summarizeUsage(usageReport);

  const inputs = [];
  if (Array.isArray(seedManifest?.blocks)) inputs.push("mirrors/seed-manifest.json");
  if (usageReport) inputs.push("mirrors/usage-report.json");

  let status = "LIVE";
  let reason = null;
  if (!blocksSummary.counts.total) {
    status = "ERROR";
    reason = "NO_BLOCKS";
  } else if (blocksSummary.counts.ERROR > 0) {
    status = "PARTIAL";
    reason = "BLOCK_ERRORS";
  }

  return {
    schemaVersion: "1.0.0",
    meta: {
      blockId: "health",
      generatedAt,
      marketDate,
      dataAsOf: seedManifest?.generatedAt || generatedAt,
      status,
      coveragePct: blocksSummary.counts.total ? blocksSummary.okPct : 0,
      reason,
      inputs
    },
    data: {
      blocks: blocksSummary.blocks,
      summary: {
        ...blocksSummary.counts,
        okPct: blocksSummary.okPct,
        reasons: blocksSummary.byReason
      },
      usage: usageSummary
    }
  };
}

function normalizeHistory(history) {
  if (!history || typeof history !== "object") return { schemaVersion: "1.0.0", items: [] };
  if (!Array.isArray(history.items)) return { schemaVersion: "1.0.0", items: [] };
  return { schemaVersion: "1.0.0", items: history.items };
}

function upsertHistory(history, health) {
  const marketDate = health?.meta?.marketDate;
  const items = Array.isArray(history.items) ? history.items.slice() : [];
  const filtered = items.filter((item) => item?.meta?.marketDate && item.meta.marketDate !== marketDate);
  filtered.push(health);
  filtered.sort((a, b) => String(a?.meta?.marketDate || "").localeCompare(String(b?.meta?.marketDate || "")));
  const last30 = filtered.slice(-30);
  return { schemaVersion: "1.0.0", items: last30 };
}

async function main() {
  const seedManifest = await readJsonIfExists(SEED_MANIFEST_PATH);
  if (!seedManifest) {
    throw new Error("seed-manifest.json missing or invalid");
  }
  const usageReport = await readJsonIfExists(USAGE_REPORT_PATH);

  const health = buildHealth(seedManifest, usageReport);
  saveMirror(HEALTH_PATH, health);

  const historyRaw = await readJsonIfExists(HEALTH_HISTORY_PATH);
  const history = normalizeHistory(historyRaw);
  const updated = upsertHistory(history, health);
  saveMirror(HEALTH_HISTORY_PATH, updated);

  console.log(`[health] wrote health.json + health_history.json for ${health.meta.marketDate}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
