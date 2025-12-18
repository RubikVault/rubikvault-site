export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const filter = (url.searchParams.get("filter") || "all").toLowerCase();
  const nocache = url.searchParams.get("nocache") === "1";

  // ---- Config ----
  const TTL_SECONDS = 90;
  const FEED_TIMEOUT_MS = 5000;
  const MAX_ITEMS = 60; // backend cap
  const MAX_PER_FEED = 12; // cap per source

  // Only public RSS/Atom URLs (no login, no keys, no scraping)
  const FEEDS = [
    { id: "reuters-business", category: "macro", language: "en", priority: 1, url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best" },
    { id: "coindesk", category: "crypto", language: "en", priority: 2, url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { id: "cointelegraph", category: "crypto", language: "en", priority: 3, url: "https://cointelegraph.com/rss" },
    { id: "economist-finance", category: "macro", language: "en", priority: 4, url: "https://www.economist.com/finance-and-economics/rss.xml" },
    { id: "ft-home", category: "macro", language: "en", priority: 5, url: "https://www.ft.com/rss/home" },
  ];

  // ---- Cache handling (Cloudflare HTTP Cache) ----
  const cache = caches.default;
  const cacheKeyUrl = new URL(url.origin + "/api/news");
  cacheKeyUrl.searchParams.set("filter", filter);
  cacheKeyUrl.searchParams.set("v", "1");

  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

  if (!nocache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const startedAt = Date.now();

  // ---- Helpers ----
  const nowIso = () => new Date().toISOString();

  const stripTags = (s) =>
    String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeUrl = (u) => {
    try {
      const x = new URL(u);
      x.hash = "";
      // remove obvious tracking parameters but keep essential query if needed
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => x.searchParams.delete(k));
      return x.toString();
    } catch {
      return String(u || "").trim();
    }
  };

  const safeDateIso = (s) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  // Tiny XML extraction: robust enough for RSS/Atom without external libs
  const getFirstTag = (xml, tagNames) => {
    for (const tag of tagNames) {
      // supports namespaces like <dc:date>
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const m = xml.match(re);
      if (m && m[1]) return m[1].trim();
    }
    return null;
  };

  const getAllItems = (xml) => {
    // RSS: <item> ... </item>
    const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
    if (rssItems.length) return { type: "rss", items: rssItems };

    // Atom: <entry> ... </entry>
    const atomItems = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
    return { type: atomItems.length ? "atom" : "unknown", items: atomItems };
  };

  const parseRssItem = (chunk, feed) => {
    const title = stripTags(getFirstTag(chunk, ["title"]) || "");
    const linkRaw = getFirstTag(chunk, ["link"]) || "";
    const link = normalizeUrl(stripTags(linkRaw));

    const pub =
      safeDateIso(stripTags(getFirstTag(chunk, ["pubDate", "dc:date", "date"]) || "")) ||
      safeDateIso(stripTags(getFirstTag(chunk, ["updated"]) || "")) ||
      null;

    const desc = stripTags(getFirstTag(chunk, ["description", "summary", "content:encoded"]) || "");
    return {
      id: "",
      title,
      url: link,
      source: feed.id,
      category: feed.category,
      publishedAt: pub || nowIso(),
      summary: desc ? desc.slice(0, 240) : "",
    };
  };

  const parseAtomEntry = (chunk, feed) => {
    const title = stripTags(getFirstTag(chunk, ["title"]) || "");

    // Atom link can be <link href="..."/>
    let link = null;
    const hrefMatch = chunk.match(/<link\b[^>]*href="([^"]+)"/i);
    if (hrefMatch && hrefMatch[1]) link = normalizeUrl(hrefMatch[1]);
    if (!link) {
      const linkTag = getFirstTag(chunk, ["link"]);
      link = normalizeUrl(stripTags(linkTag || ""));
    }

    const pub =
      safeDateIso(stripTags(getFirstTag(chunk, ["updated"]) || "")) ||
      safeDateIso(stripTags(getFirstTag(chunk, ["published"]) || "")) ||
      null;

    const summary = stripTags(getFirstTag(chunk, ["summary", "content"]) || "");
    return {
      id: "",
      title,
      url: link || "",
      source: feed.id,
      category: feed.category,
      publishedAt: pub || nowIso(),
      summary: summary ? summary.slice(0, 240) : "",
    };
  };

  const makeId = async (u, t) => {
    const enc = new TextEncoder();
    const data = enc.encode(`${u}::${t}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 24);
  };

  // ---- Fetch + parse feeds ----
  const selectedFeeds = FEEDS.filter((f) => filter === "all" || f.category === filter).sort((a, b) => a.priority - b.priority);

  const failures = [];
  const items = [];

  const fetchFeed = async (feed) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

    try {
      const res = await fetch(feed.url, {
        method: "GET",
        headers: {
          "User-Agent": "RubikVault/1.0 (RSS Aggregator)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        failures.push({ source: feed.id, reason: `http_${res.status}` });
        return;
      }

      const xml = await res.text();
      const { type, items: chunks } = getAllItems(xml);

      const parsed = [];
      for (const chunk of chunks.slice(0, MAX_PER_FEED)) {
        const obj = type === "atom" ? parseAtomEntry(chunk, feed) : parseRssItem(chunk, feed);
        if (!obj.title || !obj.url) continue;
        obj.id = await makeId(obj.url, obj.title);
        parsed.push(obj);
      }

      items.push(...parsed);
    } catch (e) {
      const reason = e && e.name === "AbortError" ? "timeout" : "fetch_error";
      failures.push({ source: feed.id, reason });
    } finally {
      clearTimeout(timer);
    }
  };

  // Limit concurrency (avoid CPU/timeouts)
  const CONCURRENCY = 4;
  const queue = [...selectedFeeds];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }).map(async () => {
    while (queue.length) {
      const feed = queue.shift();
      await fetchFeed(feed);
    }
  });
  await Promise.all(workers);

  // ---- Dedupe + sort ----
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = normalizeUrl(it.url).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const finalItems = deduped.slice(0, MAX_ITEMS);

  const body = {
    items: finalItems,
    meta: {
      generatedAt: nowIso(),
      ttlSeconds: TTL_SECONDS,
      cached: false,
      filter,
      sourcesOk: selectedFeeds.length - failures.length,
      sourcesFail: failures.length,
      failures,
      durationMs: Date.now() - startedAt,
    },
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });

  // Put into cache (even for nocache=1 we still cache result; nocache just bypasses read)
  await cache.put(cacheKey, response.clone());

  return response;
}