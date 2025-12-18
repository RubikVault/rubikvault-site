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

function safeUrl(u) {
  try { return new URL(u).toString(); } catch { return ""; }
}

function pickText(el, selectors) {
  for (const sel of selectors) {
    const n = el.querySelector(sel);
    if (!n) continue;
    const txt = (n.getAttribute && n.getAttribute("href")) || n.textContent || "";
    const cleaned = stripTags(txt);
    if (cleaned) return cleaned;
  }
  return "";
}

function parseDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeItems(items) {
  // de-dupe by link+title
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = `${it.link}||${it.title}`;
    if (!it.link || !it.title || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  // sort desc by date if available
  out.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return out;
}

function parseFeedXml(xmlText, sourceName, sourceId) {
  // Works for RSS 2.0 and Atom feeds.
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  // If XML parsing failed, the document contains <parsererror> in many impls.
  if (doc.querySelector("parsererror")) return [];

  const rssItems = Array.from(doc.querySelectorAll("item"));
  const atomEntries = Array.from(doc.querySelectorAll("entry"));

  const items = [];
  const nodes = rssItems.length ? rssItems : atomEntries;

  for (const n of nodes) {
    const title = stripTags(pickText(n, ["title"]));
    let link = "";

    if (rssItems.length) {
      link = safeUrl(stripTags(pickText(n, ["link"])));
    } else {
      // Atom: prefer <link rel="alternate" href="...">
      const alt = n.querySelector('link[rel="alternate"]');
      link = safeUrl((alt && alt.getAttribute("href")) || "");
      if (!link) {
        const any = n.querySelector("link");
        link = safeUrl((any && any.getAttribute("href")) || (any && any.textContent) || "");
      }
    }

    const rawDate = pickText(n, rssItems.length ? ["pubDate", "dc\\:date", "date"] : ["updated", "published"]);
    const d = parseDate(rawDate);
    const summary = stripTags(pickText(n, rssItems.length ? ["description", "content\\:encoded"] : ["summary", "content"]));

    if (!title || !link) continue;

    items.push({
      source: sourceName,
      sourceId,
      title,
      link,
      summary: summary || "",
      published: d ? d.toISOString() : "",
      ts: d ? d.getTime() : 0,
    });
  }

  return items;
}

async function fetchWithTimeout(url, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "RubikVault/1.0 (+https://rubikvault.com)",
        "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: ctrl.signal,
      cf: { cacheTtl: 0, cacheEverything: false }, // we do our own caching below
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function jsonResponse(obj, init = {}) {
  const body = JSON.stringify(obj, null, 2);
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      ...init.headers,
    },
  });
}

async function cachedResponse(request, ctx, handler, ttlSeconds) {
  const url = new URL(request.url);
  const nocache = url.searchParams.get("nocache") === "1";
  if (nocache) return handler();

  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });

  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await handler();
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