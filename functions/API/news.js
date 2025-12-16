export async function onRequestGet() {
  // Kostenlos & ohne Key: RSS (Yahoo Finance)
  const feeds = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US",
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD&region=US&lang=en-US"
  ];

  try {
    const items = [];

    for (const f of feeds) {
      const res = await fetch(f, { headers: { "user-agent": "RubikVault/1.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      items.push(...extractRssItems(xml));
    }

    // dedupe by title
    const seen = new Set();
    const unique = [];
    for (const it of items) {
      const key = (it.title || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(it);
      if (unique.length >= 12) break;
    }

    return json({ items: unique, source: "Yahoo Finance RSS" });
  } catch (e) {
    return json({ items: [], error: e.message }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function extractRssItems(xml) {
  // Minimal-Parser: <item> ... <title>... <link>...
  const items = [];
  const itemBlocks = xml.split("<item>").slice(1);

  for (const block of itemBlocks) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    if (title) items.push({ title: decode(title), link: link ? decode(link) : "" });
    if (items.length >= 12) break;
  }
  return items;
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function decode(s) {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}