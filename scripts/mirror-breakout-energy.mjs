import fs from "node:fs";
import path from "node:path";
import { US_TOP_100 } from "../functions/api/_shared/us-universes.js";
import { createBudgetState, createUsageCollector, loadBudgetsConfig } from "./_lib/usage.js";
import { fetchStooqDaily } from "./providers/stooq.js";
import { fetchAlphaVantageDaily } from "./providers/alphavantage.js";
import { acquireLock, releaseLock } from "./_lib/lock.js";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const IS_CI = process.env.GITHUB_ACTIONS === "true";
const KV_KEY = "breakout-energy";
const LIMIT = Number.parseInt(process.env.MIRROR_LIMIT || "35", 10);
const MAX_SYMBOLS = Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : 35;
const OUT_DIRS = ["mirrors"];
const OUT_FILE = "breakout-energy.json";

const MIRROR_REASON = "MIRROR";
const ROOT = process.cwd();
const limits = loadBudgetsConfig(ROOT);
const usage = createUsageCollector(limits);
const budget = createBudgetState(limits, usage);
const stooqCtx = { providerId: "stooq", endpoint: "daily", usage, budget };
const avCtx = { providerId: "alphavantage", endpoint: "daily", usage, budget };

function isHtmlLike(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function isStooqLimit(text) {
  return String(text || "").toLowerCase().includes("exceeded the daily hits limit");
}

function parseStooqCsv(text) {
  const raw = String(text || "").trim();
  if (!raw || isHtmlLike(raw) || isStooqLimit(raw)) return null;
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length || !lines[0].toLowerCase().startsWith("date,")) return null;
  const last = lines[lines.length - 1];
  const [date, open, high, low, close, volume] = last.split(",");
  return {
    date: date || null,
    open: Number.parseFloat(open || "nan"),
    high: Number.parseFloat(high || "nan"),
    low: Number.parseFloat(low || "nan"),
    close: Number.parseFloat(close || "nan"),
    volume: Number.parseInt(volume || "0", 10) || 0,
    barsUsed: lines.length - 1
  };
}

async function fetchStooqBar(ctx, symbol) {
  const result = await fetchStooqDaily(ctx, symbol);
  const rows = Array.isArray(result.data) ? result.data.slice() : [];
  rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const bar = rows[0];
  if (!bar) return null;
  return {
    date: bar.date || null,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    barsUsed: rows.length
  };
}

function buildItem(symbol, bar, provider) {
  return {
    symbol,
    date: bar?.date || null,
    state: "IGNORE",
    score: 0,
    stageScores: { setup: 0, trigger: 0, confirm: 0 },
    signals: [provider],
    meta: {
      universe: "sp500",
      regime_factor: null,
      cooldown_days_left: null,
      data_quality: "PARTIAL"
    },
    metrics: {
      bbw: null,
      bbw_q20: null,
      natr: null,
      rvol: null,
      vol_dry: null,
      dist_sma200: null,
      breakout_level: null
    },
    debug: {
      barsUsed: bar?.barsUsed || 0,
      missingFields: [provider]
    }
  };
}

async function buildPayload() {
  const symbols = US_TOP_100.map((item) => item.s).filter(Boolean).slice(0, MAX_SYMBOLS);
  const items = [];
  let provider = "MIRROR_STOOQ";
  let stooqFailed = false;

  for (const symbol of symbols) {
    try {
      const bar = await fetchStooqBar(stooqCtx, symbol);
      if (!bar) throw new Error("Stooq empty");
      items.push(buildItem(symbol, bar, provider));
    } catch (err) {
      stooqFailed = true;
      break;
    }
  }

  if (stooqFailed) {
    items.length = 0;
    provider = "MIRROR_AV";
    for (const symbol of symbols) {
      let bar = null;
      try {
        const result = await fetchAlphaVantageDaily(avCtx, symbol);
        bar = result?.data || null;
      } catch {
        bar = null;
      }
      if (!bar) continue;
      items.push(buildItem(symbol, bar, provider));
      await new Promise((r) => setTimeout(r, 15000));
    }
  }

  return {
    items,
    provider,
    symbolsTotal: symbols.length,
    symbolsProcessed: items.length
  };
}

function writeMirror(wrapper, hasItems) {
  const json = JSON.stringify(wrapper, null, 2);
  const written = [];
  OUT_DIRS.forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, OUT_FILE);
    if (hasItems || !fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, json);
      written.push(filePath);
    }
  });
  written.forEach((filePath) => {
    console.log(`FILE_WRITE_OK ${filePath}`);
  });
  return written;
}

async function writeKvMirror(wrapper, hasItems) {
  if (!hasItems) {
    console.log("KV_WRITE_SKIP no_items");
    return false;
  }
  if (!CF_ACCOUNT_ID || !CF_KV_NAMESPACE_ID || !CF_API_TOKEN) {
    console.log("KV_WRITE_SKIP missing_secrets");
    return false;
  }
  const key = encodeURIComponent(KV_KEY);
  const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${key}`;
  console.log(`MIRROR_MODE=${IS_CI ? "CI" : "LOCAL"}`);
  console.log(`KV_ENDPOINT=${kvUrl}`);
  let kvRes;
  try {
    kvRes = await fetch(kvUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(wrapper)
    });
  } catch (err) {
    console.error("KV_WRITE_FAILED", err?.message || String(err));
    process.exit(1);
  }
  if (!kvRes.ok) {
    const body = await kvRes.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body.slice(0, 500);
    }
    console.error("KV_WRITE_FAIL", kvRes.status, parsed);
    process.exit(1);
  }
  console.log(`KV_WRITE_OK ${kvRes.status}`);
  return true;
}

const lock = acquireLock({ providerId: "stooq", datasetId: "breakout-energy", ttlSeconds: 900 });
if (!lock.ok) {
  console.log("LOCK_HELD", lock.details?.expiresAt || "active");
  process.exit(0);
}

try {
  const now = new Date().toISOString();
  const result = await buildPayload();
  const hasItems = Array.isArray(result.items) && result.items.length > 0;
  const payload = {
    feature: "breakout-energy",
    traceId: "",
    source: result.provider,
    updatedAt: now,
    dataQuality: {
      status: hasItems ? "OK" : "PARTIAL",
      reason: MIRROR_REASON
    },
    confidence: 0,
    definitions: {},
    reasons: [MIRROR_REASON, result.provider],
    data: {
      items: result.items,
      universe: "sp500",
      regime_factor: null,
      universeSizeTotal: result.symbolsTotal,
      universeSizeProcessed: result.symbolsProcessed
    }
  };

  const wrapper = { ts: now, source: "mirror", payload };
  writeMirror(wrapper, hasItems);
  await writeKvMirror(wrapper, hasItems);

  console.log(`MIRROR_HAS_ITEMS=${hasItems ? "1" : "0"}`);
} finally {
  releaseLock(lock.path);
}
