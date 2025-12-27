import { XMLParser } from "fast-xml-parser";
import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "news";
const KV_TTL = 600;
const FEEDS = [
  { id: "yahoo", code: "YH", name: "Yahoo", url: "https://finance.yahoo.com/news/rssindex" },
  {
    id: "cnbc",
    code: "CNBC",
    name: "CNBC",
    url: "https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664"
  },
  {
    id: "reuters",
    code: "RTRS",
    name: "Reuters",
    url: "https://feeds.reuters.com/reuters/businessNews"
  },
  {
    id: "reuters-markets",
    code: "RTRS",
    name: "Reuters",
    url: "https://feeds.reuters.com/reuters/marketsNews"
  }
];

const CATEGORY_RULES = [
  {
    id: "crypto",
    label: "Crypto",
    keywords: ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "xrp", "blockchain"]
  },
  {
    id: "commodities",
    label: "Commodities",
    keywords: ["oil", "crude", "gold", "silver", "copper", "gas", "wheat", "corn", "soy"]
  },
  {
    id: "bonds",
    label: "Bonds",
    keywords: ["treasury", "yield", "bond", "rates", "fed", "inflation", "cpi"]
  },
  {
    id: "etfs",
    label: "ETFs",
    keywords: ["etf", "fund", "spy", "qqq", "voo", "ivv", "ark"]
  }
];

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function stripHtml(value) {
  if (!value) return "";
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function summarize(value, max = 120) {
  const text = stripHtml(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeKey(item) {
  const link = item?.url ? String(item.url) : "";
  if (link) return link;
  return String(item?.headline || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 140);
}

function classifyHeadline(headline) {
  const text = String(headline || "").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return { category: rule.id, label: rule.label };
    }
  }
  return { category: "stocks", label: "Stocks" };
}

function normalize(items) {
  return {
    updatedAt: new Date().toISOString(),
    source: FEEDS.map((feed) => feed.id).join(","),
    items
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    return bindingResponse;
  }

  const cacheKey = `${FEATURE_ID}:v1`;

  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: FEEDS.map((feed) => feed.url).join(" | "), status: null, snippet: "" }
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return response;
    }
  }

  const parser = new XMLParser({ ignoreAttributes: false });
  const items = [];
  const errors = [];
  let upstreamSnippet = "";

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "RubikVault/1.0" }
        });
        const text = await res.text();
        if (!res.ok) {
          errors.push({ id: feed.id, status: res.status });
          upstreamSnippet = upstreamSnippet || safeSnippet(text);
          return;
        }
        const xmlObj = parser.parse(text);
        let feedItems = xmlObj.rss?.channel?.item || xmlObj.feed?.entry || [];
        if (!Array.isArray(feedItems)) feedItems = [feedItems];
        feedItems.slice(0, 15).forEach((item) => {
          const headline = stripHtml(item.title || "");
          if (!headline) return;
          const category = classifyHeadline(headline);
          items.push({
            headline,
            summary: summarize(item.description || item.summary || ""),
            url: item.link?.href || item.link || "",
            source: { code: feed.code, name: feed.name },
            sourceId: feed.id,
            publishedAt: item.pubDate || item.updated || new Date().toISOString(),
            category: category.id,
            categoryLabel: category.label
          });
        });
      } catch (error) {
        errors.push({ id: feed.id, status: "error" });
      }
    })
  );

  const deduped = Array.from(new Map(items.map((item) => [normalizeKey(item), item])).values());
  deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const dataPayload = normalize(deduped.slice(0, 40));

  if (!deduped.length) {
    const cached = !panic ? await kvGetJson(env, cacheKey) : null;

    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: {
          url: FEEDS.map((feed) => feed.url).join(" | "),
          status: null,
          snippet: upstreamSnippet
        },
        error: {
          code: errorCode,
          message: "No upstream data",
          details: { errors }
        },
        isStale: true
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return response;
    }

    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: {
        url: FEEDS.map((feed) => feed.url).join(" | "),
        status: null,
        snippet: upstreamSnippet
      },
      error: {
        code: errorCode,
        message: "No upstream data",
        details: { errors }
      },
      status: 502
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const kvPayload = {
    ts: new Date().toISOString(),
    source: dataPayload.source,
    schemaVersion: 1,
    data: dataPayload
  };

  if (!panic) {
    await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
  }

  const errorCode = errors.length
    ? errors.find((entry) => entry.status === 429)
      ? "RATE_LIMITED"
      : errors.find((entry) => entry.status === 403)
        ? "UPSTREAM_403"
        : errors.find((entry) => Number(entry.status) >= 500)
          ? "UPSTREAM_5XX"
          : "UPSTREAM_4XX"
    : "";

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
    cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
    upstream: {
      url: FEEDS.map((feed) => feed.url).join(" | "),
      status: errors.length ? null : 200,
      snippet: upstreamSnippet
    },
    error: errors.length
      ? {
          code: errorCode,
          message: "Some feeds failed",
          details: { errors }
        }
      : {}
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: errors.length ? null : 200,
    durationMs: Date.now() - started
  });
  return response;
}
