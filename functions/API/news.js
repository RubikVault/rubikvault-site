import { XMLParser } from "fast-xml-parser";
import { buildPayload, createTraceId, jsonResponse, logServer, truncate } from "./_shared.js";

const FEATURE_ID = "news";
const KV_TTL = 300;
const FEEDS = [
  { id: "yahoo", url: "https://finance.yahoo.com/news/rssindex" },
  { id: "cnbc", url: "https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664" }
];

function normalize(items) {
  return {
    updatedAt: new Date().toISOString(),
    source: FEEDS.map((feed) => feed.id).join(","),
    items
  };
}

export async function onRequestGet({ request, env }) {
  const traceId = createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  if (!env?.RV_KV) {
    const payload = buildPayload({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      error: { code: "BINDING_MISSING", message: "RV_KV binding missing", details: {} }
    });
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return jsonResponse(payload, 500);
  }

  const cacheKey = `${FEATURE_ID}:v1`;

  if (!panic) {
    const cached = await env.RV_KV.get(cacheKey, "json");
    if (cached?.data) {
      const payload = buildPayload({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: FEEDS.map((feed) => feed.url).join(" | "), status: null, snippet: "" }
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: "hit",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return jsonResponse(payload);
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
          upstreamSnippet = upstreamSnippet || truncate(text);
          return;
        }
        const xmlObj = parser.parse(text);
        let feedItems = xmlObj.rss?.channel?.item || xmlObj.feed?.entry || [];
        if (!Array.isArray(feedItems)) feedItems = [feedItems];
        feedItems.slice(0, 15).forEach((item) => {
          items.push({
            title: item.title || "",
            link: item.link?.href || item.link || "",
            source: feed.id,
            ts: item.pubDate || item.updated || new Date().toISOString()
          });
        });
      } catch (error) {
        errors.push({ id: feed.id, status: "error" });
      }
    })
  );

  const deduped = Array.from(new Map(items.map((item) => [item.title, item])).values());
  deduped.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const data = normalize(deduped.slice(0, 40));

  if (!deduped.length) {
    const cached = !panic ? await env.RV_KV.get(cacheKey, "json") : null;
    if (cached?.data) {
      const payload = buildPayload({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: {
          url: FEEDS.map((feed) => feed.url).join(" | "),
          status: null,
          snippet: upstreamSnippet
        },
        error: {
          code: "UPSTREAM_ERROR",
          message: "No upstream data",
          details: { errors }
        },
        isStale: true
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: "hit",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return jsonResponse(payload, 200);
    }

    const payload = buildPayload({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: {
        url: FEEDS.map((feed) => feed.url).join(" | "),
        status: null,
        snippet: upstreamSnippet
      },
      error: {
        code: "UPSTREAM_ERROR",
        message: "No upstream data",
        details: { errors }
      }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return jsonResponse(payload, 502);
  }

  const kvPayload = {
    ts: new Date().toISOString(),
    source: data.source,
    schemaVersion: 1,
    data
  };

  if (!panic) {
    await env.RV_KV.put(cacheKey, JSON.stringify(kvPayload), {
      expirationTtl: KV_TTL
    });
  }

  const payload = buildPayload({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data,
    cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
    upstream: {
      url: FEEDS.map((feed) => feed.url).join(" | "),
      status: errors.length ? null : 200,
      snippet: upstreamSnippet
    },
    error: errors.length
      ? {
          code: "UPSTREAM_PARTIAL",
          message: "Some feeds failed",
          details: { errors }
        }
      : {}
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    kv: panic ? "bypass" : "miss",
    upstreamStatus: errors.length ? null : 200,
    durationMs: Date.now() - started
  });
  return jsonResponse(payload);
}
