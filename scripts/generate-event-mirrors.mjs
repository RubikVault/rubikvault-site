import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { loadMirror, saveMirror, withRetries } from "./utils/mirror-io.mjs";
import { buildBaseMirror, buildSystemHealth } from "./utils/mirror-builders.mjs";
import { createBudgetState, createUsageCollector, loadBudgetsConfig } from "./_lib/usage.js";
import { fetchRssFeed } from "./providers/rss.js";
import { acquireLock, releaseLock } from "./_lib/lock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR_DIRS = [
  path.resolve(__dirname, "../mirrors")
];
const SYSTEM_HEALTH_PATH = path.resolve(__dirname, "../mirrors/system-health.json");

const FEEDS = [
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "WSJ" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
  { url: "https://finance.yahoo.com/rss/", source: "YH" }
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const limits = loadBudgetsConfig(path.resolve(__dirname, ".."));
const usage = createUsageCollector(limits);
const budget = createBudgetState(limits, usage);
const ctx = { providerId: "rss", endpoint: "rss", usage, budget };

async function fetchFeed(feed, ctx) {
  return withRetries(async () => {
    const result = await fetchRssFeed(ctx, feed.url);
    return result.data || "";
  }, { retries: 2, baseDelayMs: 600 });
}

function parseItems(xmlText, source) {
  const parsed = parser.parse(xmlText);
  const items = [];
  const channelItems = parsed?.rss?.channel?.item || [];
  const entries = parsed?.feed?.entry || [];
  const list = Array.isArray(channelItems) ? channelItems : [channelItems];
  const entriesList = Array.isArray(entries) ? entries : [entries];

  list.forEach((item) => {
    if (!item || !item.title || !item.link) return;
    items.push({
      title: String(item.title).trim(),
      url: String(item.link).trim(),
      source,
      publishedAt: item.pubDate || item.published || null
    });
  });

  entriesList.forEach((entry) => {
    const link = entry.link?.href || entry.link?.[0]?.href;
    if (!entry || !entry.title || !link) return;
    items.push({
      title: String(entry.title).trim(),
      url: String(link).trim(),
      source,
      publishedAt: entry.published || entry.updated || null
    });
  });

  return items;
}

function eventContext(prev, lookbackDays, explain) {
  return {
    lookbackWindowDays: lookbackDays,
    explain,
    lastEventAt: prev?.context?.lastEventAt || null,
    lastEventSummary: prev?.context?.lastEventSummary || null
  };
}

async function buildNews() {
  let items = [];
  const errors = [];
  for (const feed of FEEDS) {
    try {
      const xml = await fetchFeed(feed, ctx);
      items = items.concat(parseItems(xml, feed.source));
    } catch (err) {
      errors.push(`${feed.source}:${err.message || err}`);
    }
  }
  const unique = new Map();
  items.forEach((item) => {
    const key = `${item.title}|${item.source}`;
    if (!unique.has(key)) unique.set(key, item);
  });
  items = Array.from(unique.values()).slice(0, 50);

  const prev = loadMirror(path.resolve(__dirname, "../mirrors/news.json"));
  let dataQuality = items.length ? "OK" : "EMPTY";
  let mode = items.length ? "LIVE" : "EMPTY";
  let notes = [];
  if (!items.length && prev && Array.isArray(prev.items) && prev.items.length) {
    items = prev.items;
    dataQuality = "STALE";
    mode = prev.mode || "STALE";
    notes = ["STALE_LAST_GOOD"];
  }

  return buildBaseMirror({
    mirrorId: "news",
    mode,
    cadence: "best_effort",
    trust: "raw",
    sourceUpstream: "rss",
    whyUnique: "RSS-only headlines for key market sources.",
    items,
    context: { feeds: FEEDS.map((f) => f.source) },
    missingSymbols: [],
    errors,
    notes,
    dataQuality,
    asOf: new Date().toISOString()
  });
}

function buildEmptyEvent(id, explain) {
  const prev = loadMirror(path.resolve(__dirname, `../mirrors/${id}.json`));
  return buildBaseMirror({
    mirrorId: id,
    mode: "EMPTY",
    cadence: "daily",
    trust: "heuristic",
    sourceUpstream: "unknown",
    whyUnique: explain,
    items: [],
    context: eventContext(prev, 30, explain),
    missingSymbols: [],
    errors: [],
    notes: ["COVERAGE_LIMIT"],
    dataQuality: "COVERAGE_LIMIT",
    asOf: new Date().toISOString()
  });
}

const lock = acquireLock({ providerId: "rss", datasetId: "event-mirrors", ttlSeconds: 900 });
if (!lock.ok) {
  console.log("LOCK_HELD", lock.details?.expiresAt || "active");
  process.exit(0);
}

try {
  const newsMirror = await buildNews();
  const whyMovedMirror = buildEmptyEvent("why-moved", "Derived event context from news and anomalies.");
  const hypeMirror = buildEmptyEvent("hype-divergence", "Mentions vs price divergence is limited in free mode.");
  const earningsMirror = buildEmptyEvent("earnings", "Earnings coverage is limited in free mode.");
  const congressMirror = buildEmptyEvent("congress-trading", "Congress trading coverage limited in free mode.");
  const insiderMirror = buildEmptyEvent("insider-cluster", "Insider cluster coverage limited in free mode.");
  const analystMirror = buildEmptyEvent("analyst-stampede", "Analyst coverage limited in free mode.");
  const smartMoneyMirror = buildEmptyEvent("smart-money", "Composite scoring limited in free mode.");
  const alphaPerfMirror = buildEmptyEvent("alpha-performance", "Alpha performance tracking not yet available.");
  const earningsRealityMirror = buildEmptyEvent("earnings-reality", "Earnings reality checks limited in free mode.");

  const mirrors = [
    newsMirror,
    whyMovedMirror,
    hypeMirror,
    earningsMirror,
    congressMirror,
    insiderMirror,
    analystMirror,
    smartMoneyMirror,
    alphaPerfMirror,
    earningsRealityMirror
  ];

  for (const mirror of mirrors) {
    for (const dir of MIRROR_DIRS) {
      saveMirror(path.join(dir, `${mirror.mirrorId}.json`), mirror);
    }
  }

  const systemHealth = loadMirror(SYSTEM_HEALTH_PATH) || buildSystemHealth({
    jobs: [],
    mirrors: [],
    selectedSymbols: [],
    skippedSymbols: [],
    overallStatus: "OK"
  });

  const jobEntry = {
    id: "event-mirrors",
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    status: "OK",
    durationMs: 0,
    errors: [],
    notes: []
  };

  systemHealth.jobs = systemHealth.jobs.filter((job) => job.id !== "event-mirrors");
  systemHealth.jobs.push(jobEntry);

  const mirrorUpdates = mirrors.map((mirror) => ({
    id: mirror.mirrorId,
    updatedAt: mirror.updatedAt,
    dataQuality: mirror.dataQuality,
    itemCount: mirror.items.length,
    sizeKB: 0
  }));

  systemHealth.mirrors = systemHealth.mirrors.filter((m) => !mirrorUpdates.find((n) => n.id === m.id));
  systemHealth.mirrors.push(...mirrorUpdates);

  saveMirror(SYSTEM_HEALTH_PATH, systemHealth);
  
  console.log("EVENT_MIRRORS_DONE", mirrors.length);
} finally {
  releaseLock(lock.path);
}
