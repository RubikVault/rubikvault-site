import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import { createBudgetState, createUsageCollector, loadBudgetsConfig } from "./_lib/usage.js";
import { fetchRssFeed } from "./providers/rss.js";
import { acquireLock, releaseLock } from "./_lib/lock.js";
import { loadMirror, saveMirror } from "./utils/mirror-io.mjs";

const MAX_SOURCES = 8;
const MAX_ITEMS_TOTAL = 60;
const MIN_ITEMS_TO_WRITE = 12;
const TIMEOUT_MS = 4500;
const RETRIES = 1;

const BACKOFF_RULES = {
  RATE_LIMIT_429_SEC: 15 * 60,
  UPSTREAM_5XX_SEC: 5 * 60,
  UPSTREAM_4XX_SEC: 60 * 60
};

const SOURCES = [
  {
    id: "finanzen_news",
    name: "finanzen.net News",
    url: "https://www.finanzen.net/rss/news"
  },
  {
    id: "finanzen_analysen",
    name: "finanzen.net Analysen",
    url: "https://www.finanzen.net/rss/analysen"
  },
  {
    id: "onvista",
    name: "OnVista",
    url: "https://news.onvista.de/rss/woche"
  },
  {
    id: "handelsblatt_finanzen",
    name: "Handelsblatt Finanzen",
    url: "https://www.handelsblatt.com/contentexport/feed/finanzen"
  },
  {
    id: "google_news_markets",
    name: "Google News (Markets)",
    url: "https://news.google.com/rss/search?q=Aktien%20B%C3%B6rse%20DAX&hl=de&gl=DE&ceid=DE:de"
  },
  {
    id: "tagesschau",
    name: "Tagesschau",
    url: "https://www.tagesschau.de/xml/rss2/"
  }
].slice(0, MAX_SOURCES);

function nowIso() {
  return new Date().toISOString();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#([0-9]+);/g, (_, num) => {
      const code = Number(num);
      if (!Number.isFinite(code)) return _;
      return String.fromCharCode(code);
    });
}

function canonicalizeUrl(raw) {
  if (!raw) return "";
  try {
    const url = new URL(String(raw));
    const params = url.searchParams;
    const toDelete = [];
    for (const [k] of params.entries()) {
      if (k.toLowerCase().startsWith("utm_")) toDelete.push(k);
    }
    toDelete.forEach((k) => params.delete(k));
    url.search = params.toString() ? `?${params.toString()}` : "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(raw);
  }
}

function hostnameFromUrl(raw) {
  try {
    const url = new URL(String(raw));
    return url.hostname || "";
  } catch {
    return "";
  }
}

function parsePublishedAt(entry) {
  const candidates = [entry?.isoDate, entry?.pubDate, entry?.published, entry?.updated];
  for (const value of candidates) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function classifyTopic(title) {
  const text = String(title || "").toLowerCase();
  const rules = [
    { topic: "dax", keywords: ["dax", "mdax", "sdax", "tecdax"] },
    { topic: "rates", keywords: ["zins", "zinsen", "yield", "rendite", "bund", "fed", "ecb"] },
    { topic: "crypto", keywords: ["bitcoin", "btc", "ethereum", "eth", "krypto", "crypto"] }
  ];
  for (const rule of rules) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.topic;
  }
  return null;
}

async function fetchFeed(url, ctx) {
  try {
    const result = await fetchRssFeed(ctx, url);
    return { ok: true, status: 200, text: result.data };
  } catch (error) {
    const status = error?.details?.httpStatus ?? 0;
    return { ok: false, status, text: "", error };
  }
}

function isRetryable({ status, error }) {
  if (error) return true;
  if (status >= 500) return true;
  return false;
}

function computeBackoffSeconds(status) {
  if (status === 429) return BACKOFF_RULES.RATE_LIMIT_429_SEC;
  if (status >= 500) return BACKOFF_RULES.UPSTREAM_5XX_SEC;
  if (status >= 400 && status < 500) return BACKOFF_RULES.UPSTREAM_4XX_SEC;
  return 0;
}

function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWriteJson(targetPath, payload) {
  const dir = path.dirname(targetPath);
  ensureDir(dir);
  const tmpDir = path.join(getRepoRoot(), ".tmp", "out");
  ensureDir(tmpDir);
  const tmpPath = path.join(tmpDir, `${path.basename(targetPath)}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, targetPath);
}

function buildMeta({ status, lastSuccess, itemsCount, dedupedCount, sources, commit, runId }) {
  const ageSeconds = lastSuccess ? Math.max(0, Math.floor((Date.now() - Date.parse(lastSuccess)) / 1000)) : 0;
  return {
    schemaVersion: 1,
    status,
    lastSuccess: lastSuccess || null,
    ageSeconds,
    itemsCount,
    dedupedCount,
    sources,
    build: {
      commit: commit || "unknown",
      runId: runId || null
    }
  };
}

function buildSnapshot(items) {
  const now = nowIso();
  return {
    schemaVersion: "rv-mirror-v1",
    mirrorId: "news",
    provider: "rss",
    dataset: "news",
    fetchedAt: now,
    ttlSeconds: 3600,
    source: "rss",
    runId: now,
    updatedAt: now,
    asOf: now,
    mode: items.length ? "LIVE" : "EMPTY",
    cadence: "best_effort",
    trust: "raw",
    sourceUpstream: "rss",
    dataQuality: items.length ? "OK" : "EMPTY",
    delayMinutes: 0,
    missingSymbols: [],
    errors: [],
    notes: [],
    whyUnique: "Aggregated RSS headlines (English-only filter).",
    context: {},
    items
  };
}

async function main() {
  const root = getRepoRoot();
  const lock = acquireLock({ providerId: "rss", datasetId: "news", ttlSeconds: 900 });
  if (!lock.ok) {
    console.log("LOCK_HELD", lock.details?.expiresAt || "active");
    return;
  }
  const limits = loadBudgetsConfig(root);
  const usage = createUsageCollector(limits);
  const budget = createBudgetState(limits, usage);
  const ctx = { providerId: "rss", endpoint: "rss", usage, budget };
  const outNews = path.join(root, "mirrors", "news.json");
  const outMeta = path.join(root, "mirrors", "news.meta.json");

  const existingSnapshot = loadMirror(outNews);
  const hasExisting = Boolean(existingSnapshot && Array.isArray(existingSnapshot.items));

  const parser = new Parser({ timeout: TIMEOUT_MS });

  const sourceStates = [];
  const allItems = [];
  let dedupedCount = 0;
  let lastSuccess = null;

  try {
    for (const src of SOURCES) {
      const started = Date.now();
      let ok = false;
      let items = [];
      let error = null;
      let status = 0;
      let backoffUntil = null;

      try {
        let attempt = 0;
        let lastErr = null;
        let lastStatus = 0;
        while (attempt <= RETRIES) {
          attempt += 1;
          try {
            const res = await fetchFeed(src.url, ctx);
            status = res.status;
            lastStatus = res.status;
            if (!res.ok) {
              lastErr = new Error(`HTTP ${res.status}`);
              if (attempt <= RETRIES && isRetryable({ status: res.status })) {
                continue;
              }
              break;
            }
            const feed = await parser.parseString(res.text);
            const rawItems = Array.isArray(feed?.items) ? feed.items : [];
            items = rawItems
              .slice(0, 20)
              .map((entry) => {
                const title = decodeHtmlEntities(normalizeWhitespace(entry?.title || ""));
                const url = canonicalizeUrl(entry?.link || "");
                const publishedAt = parsePublishedAt(entry) || nowIso();
                const domain = hostnameFromUrl(url);
                return {
                  title,
                  url,
                  publishedAt,
                  source: {
                    name: src.name,
                    domain
                  },
                  topic: parsePublishedAt(entry) ? classifyTopic(title) : null,
                  __sourceId: src.id
                };
              })
              .filter((it) => it.title && it.url);
            ok = true;
            break;
          } catch (e) {
            lastErr = e;
            lastStatus = 0;
            if (attempt <= RETRIES && isRetryable({ error: e })) {
              continue;
            }
            break;
          }
        }

        if (!ok) {
          error = lastErr ? String(lastErr?.message || lastErr) : "unknown";
          const backoffSec = computeBackoffSeconds(lastStatus || 0);
          if (backoffSec > 0) {
            backoffUntil = new Date(Date.now() + backoffSec * 1000).toISOString();
          }
        }

        if (ok) {
          allItems.push(...items);
        }
      } catch (e) {
        error = String(e?.message || e);
      }

      sourceStates.push({
        id: src.id,
        name: src.name,
        url: src.url,
        ok,
        items: ok ? items.length : 0,
        latMs: Date.now() - started,
        error: ok ? null : error,
        backoffUntil
      });
    }
  } finally {
    releaseLock(lock.path);
  }

  const byUrl = new Map();
  for (const item of allItems) {
    const key = canonicalizeUrl(item.url);
    if (!byUrl.has(key)) {
      byUrl.set(key, item);
    } else {
      dedupedCount += 1;
    }
  }

  const normalized = Array.from(byUrl.values())
    .map((item) => {
      const id = sha256Hex(`${item.url}|${item.publishedAt}|${item.__sourceId}`);
      return {
        id,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        source: item.source,
        topic: item.topic
      };
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX_ITEMS_TOTAL);

  const itemsCount = normalized.length;

  if (itemsCount >= MIN_ITEMS_TO_WRITE) {
    lastSuccess = nowIso();
    const snapshot = buildSnapshot(normalized);

    const allOk = sourceStates.length > 0 && sourceStates.every((s) => s.ok);
    const status = allOk ? "ok" : "degraded";

    const commit = process.env.GITHUB_SHA || "local";
    const runId = process.env.GITHUB_RUN_ID || null;
    const meta = buildMeta({
      status,
      lastSuccess,
      itemsCount,
      dedupedCount,
      sources: sourceStates,
      commit,
      runId
    });

    saveMirror(outNews, snapshot);
    atomicWriteJson(outMeta, meta);
    process.exitCode = 0;
    return;
  }

  const commit = process.env.GITHUB_SHA || "local";
  const runId = process.env.GITHUB_RUN_ID || null;

  const anyOk = sourceStates.some((s) => s.ok);
  const status = hasExisting ? (anyOk ? "stale" : "down") : "down";

  const existingMeta = readJsonIfExists(outMeta);
  const previousSuccess = existingMeta?.lastSuccess || null;

  const meta = buildMeta({
    status,
    lastSuccess: previousSuccess,
    itemsCount,
    dedupedCount,
    sources: sourceStates,
    commit,
    runId
  });

  if (hasExisting) {
    atomicWriteJson(outMeta, meta);
    process.exitCode = 0;
    return;
  }

  process.exitCode = 1;
}

main().catch((err) => {
  console.error("update-news failed", err);
  process.exitCode = 1;
});
