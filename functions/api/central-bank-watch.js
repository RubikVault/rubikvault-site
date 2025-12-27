import {
  assertBindings,
  createTraceId,
  makeResponse,
  logServer,
  safeFetchText,
  isHtmlLike,
  safeSnippet,
  parseRssAtom,
  mergeAndDedupeItems,
  swrGetOrRefresh,
  normalizeFreshness
} from "./_shared.js";

const FEATURE_ID = "central-bank-watch";
const KV_TTL = 30 * 60;
const STALE_MAX = 24 * 60 * 60;
const CACHE_KEY = "DASH:CENTRAL_BANKS";

const FEEDS = [
  { id: "FED", url: "https://www.federalreserve.gov/feeds/press_all.xml", label: "Federal Reserve" },
  {
    id: "ECB",
    url: "https://www.ecb.europa.eu/rss/pressreleases/en/rss_pressreleases.xml",
    label: "ECB"
  }
];

function normalizeItems(items) {
  const now = Date.now();
  return items.map((item) => {
    const publishedAt = item.publishedAtISO || new Date().toISOString();
    const ageMs = Math.max(0, now - Date.parse(publishedAt));
    return {
      title: item.title,
      link: item.link,
      publishedAt,
      source: item.sourceId || item.source || "",
      breaking: ageMs <= 24 * 60 * 60 * 1000
    };
  });
}

async function fetchCentralBanks(env) {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const res = await safeFetchText(feed.url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
      const text = res.text || "";
      if (!res.ok || isHtmlLike(text)) {
        return {
          ok: false,
          feed: feed.id,
          status: res.status,
          snippet: safeSnippet(text),
          reason: isHtmlLike(text) ? "html-error-page" : "upstream-error"
        };
      }
      const parsed = parseRssAtom(text, { sourceLabel: feed.label }).map((item) => ({
        ...item,
        sourceId: feed.id
      }));
      return { ok: true, items: parsed };
    })
  );

  const errors = [];
  const items = [];
  let upstreamSnippet = "";
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      if (result.value.ok) {
        items.push(result.value.items);
      } else {
        errors.push({
          feed: result.value.feed,
          status: result.value.status,
          reason: result.value.reason
        });
        upstreamSnippet = upstreamSnippet || result.value.snippet || "";
      }
    }
  });

  const merged = mergeAndDedupeItems(items);
  if (!merged.length) {
    return {
      ok: false,
      error: {
        code: "UPSTREAM_5XX",
        message: "No upstream data",
        details: { errors }
      },
      upstreamSnippet
    };
  }

  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      items: normalizeItems(merged),
      source: FEEDS.map((feed) => feed.id).join(",")
    },
    errors,
    upstreamSnippet
  };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) return bindingResponse;

  const swr = await swrGetOrRefresh(context, {
    key: CACHE_KEY,
    ttlSeconds: KV_TTL,
    staleMaxSeconds: STALE_MAX,
    fetcher: () => fetchCentralBanks(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: FEEDS.map((feed) => feed.url).join(" | "), status: null, snippet: "" },
      error: {
        code: "UPSTREAM_5XX",
        message: "No upstream data",
        details: swr.error?.details || {}
      },
      cacheStatus: "ERROR"
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

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus !== "MISS", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: FEEDS.map((feed) => feed.url).join(" | "), status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(swr.ageSeconds),
    cacheStatus: swr.cacheStatus
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: swr.cacheStatus === "MISS" ? "none" : "kv",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
