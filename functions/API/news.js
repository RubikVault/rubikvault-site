/**
 * Cloudflare Pages Function: /api/news
 * No external npm deps (works on Pages Functions bundler).
 *
 * Query params:
 *   - src: optional comma-separated list of source ids to include
 *   - max: optional max items (default 25, max 60)
 *   - nocache=1 bypasses edge cache
 */
const SOURCES = [
  { id: "reuters_top",     name: "Reuters – Top News",        url: "https://feeds.reuters.com/reuters/topNews" },
  { id: "reuters_markets", name: "Reuters – Business",        url: "https://feeds.reuters.com/reuters/businessNews" },
  { id: "cnbc_top",        name: "CNBC – Top News",           url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { id: "cnbc_markets",    name: "CNBC – Markets",            url: "https://www.cnbc.com/id/15839135/device/rss/rss.html" },
  { id: "yahoo_finance",   name: "Yahoo Finance",             url: "https://finance.yahoo.com/rss/" },
  { id: "seekingalpha",    name: "Seeking Alpha – Market",    url: "https://seekingalpha.com/market_currents.xml" },
  { id: "bloomberg-markets", name: "Bloomberg Markets", url: "https://www.bloomberg.com/feeds/markets.rss" },
  { id: "ft-markets", name: "Financial Times Markets", url: "https://www.ft.com/rss/markets" },
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  // Add more valide
];

const DEFAULT_MAX = 25;
const HARD_MAX = 60;

// --- Utils ---
function clampInt(v, d, min, max) {
  const n = Number.parseInt(v ?? "", 10);
  if (Number.isNaN(n)) return d;
  return Math.max(min, Math.min(max, n));
}

function stripTags(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPubDate(s) {
  const pub = s.querySelector("pubDate") || s.querySelector("updated");
  if (pub) return pub.textContent.trim();
  return new Date().toISOString();
}

function getDesc(s) {
  const desc = s.querySelector("description") || s.querySelector("content");
  if (desc) return stripTags(desc.textContent);
  return "";
}

// --- Fetch ---
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(id);
  return res;
}

// --- Parsing ---
function parseFeedXml(text, sourceName, sourceId) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");
  const isRss = xml.querySelector("rss");
  const isAtom = xml.querySelector("feed");

  if (!isRss && !isAtom) return [];

  const items = xml.querySelectorAll(isRss ? "item" : "entry");
  return Array.from(items).map(item => ({
    title: (item.querySelector("title")?.textContent ?? "").trim(),
    link: (item.querySelector("link")?.getAttribute("href") ?? item.querySelector("link")?.textContent ?? "").trim(),
    pubDate: getPubDate(item),
    description: getDesc(item),
    source: sourceName,
    sourceId,
  }));
}

// --- Normalize & Sort ---
function normalizeItems(items) {
  return items
    .filter(i => i.title && i.link && i.pubDate)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

// --- Response ---
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// --- Handler ---
async function handler(url, selected, maxItems) {
  const tasks = selected.map(async (s) => {
    try {
      const r = await fetchWithTimeout(s.url, 8000);
      if (!r.ok) return [];
      const text = await r.text();
      return parseFeedXml(text, s.name, s.id);
    } catch {
      return [];
    }
  });

  const settled = await Promise.all(tasks);
  const items = normalizeItems(settled.flat()).slice(0, maxItems);

  return jsonResponse({
    ok: true,
    updatedAt: new Date().toISOString(),
    sources: selected.map(s => ({ id: s.id, name: s.name, url: s.url })),
    count: items.length,
    items,
  });
}

// --- Cache Wrapper ---
async function cachedResponse(request, ctx, handlerFn, ttlSeconds) {
  const url = new URL(request.url);
  const nocache = url.searchParams.get("nocache") === "1";
  if (nocache) return handlerFn();

  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });

  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await handlerFn();
  // only cache successful json responses
  if (res.ok) {
    const toCache = new Response(res.body, res);
    toCache.headers.set("cache-control", `public, max-age=${ttlSeconds}`);
    ctx.waitUntil(cache.put(key, toCache));
  }
  return res;
}

export async function onRequestGet(context) {
  const { request, ctx } = context;
  const url = new URL(request.url);

  const maxItems = clampInt(url.searchParams.get("max"), DEFAULT_MAX, 5, HARD_MAX);
  const only = (url.searchParams.get("src") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const selected = only.length
    ? SOURCES.filter(s => only.includes(s.id))
    : SOURCES;

  // Edge cache for the aggregated response.
  return cachedResponse(request, ctx, async () => {
    const tasks = selected.map(async (s) => {
      try {
        const r = await fetchWithTimeout(s.url, 8000);
        if (!r.ok) return [];
        const text = await r.text();
        return parseFeedXml(text, s.name, s.id);
      } catch {
        return [];
      }
    });

    const settled = await Promise.all(tasks);
    const items = normalizeItems(settled.flat()).slice(0, maxItems);

    return jsonResponse({
      ok: true,
      updatedAt: new Date().toISOString(),
      sources: selected.map(s => ({ id: s.id, name: s.name, url: s.url })),
      count: items.length,
      items,
    });
  }, 60); // 60s edge cache
}