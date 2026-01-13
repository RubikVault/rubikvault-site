import { XMLParser } from "fast-xml-parser";
import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet,
  safeFetchText,
  isHtmlLike
} from "./_shared.js";

const FEATURE_ID = "sentiment";
const KV_TTL = 1200;
const STALE_MAX = 24 * 60 * 60;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateStore = new Map();

const FEEDS = [
  { id: "yahoo", url: "https://finance.yahoo.com/news/rssindex" },
  { id: "cnbc", url: "https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664" }
];

const POSITIVE = [
  "beat",
  "surge",
  "growth",
  "record",
  "upgrade",
  "profit",
  "strong",
  "rally",
  "bull",
  "optimism"
];

const NEGATIVE = [
  "miss",
  "slump",
  "decline",
  "warning",
  "downgrade",
  "loss",
  "weak",
  "selloff",
  "bear",
  "lawsuit"
];

function getRateState(key) {
  const now = Date.now();
  const entry = rateStore.get(key) || [];
  const fresh = entry.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) {
    rateStore.set(key, fresh);
    const resetMs = RATE_WINDOW_MS - (now - fresh[0]);
    return { limited: true, remaining: 0, resetMs };
  }
  fresh.push(now);
  rateStore.set(key, fresh);
  const resetMs = RATE_WINDOW_MS - (now - fresh[0]);
  return { limited: false, remaining: Math.max(0, RATE_MAX - fresh.length), resetMs };
}

function stripHtml(value) {
  if (!value) return "";
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function summarize(value, max = 140) {
  const text = stripHtml(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  POSITIVE.forEach((word) => {
    if (lower.includes(word)) score += 1;
  });
  NEGATIVE.forEach((word) => {
    if (lower.includes(word)) score -= 1;
  });
  return score;
}

function labelFor(score) {
  if (score >= 20) return "Positive";
  if (score <= -20) return "Negative";
  return "Neutral";
}

async function fetchSentimentData() {
  const parser = new XMLParser({ ignoreAttributes: false });
  const items = [];
  const errors = [];
  let upstreamSnippet = "";

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await safeFetchText(feed.url, { userAgent: "RubikVault/1.0" });
        const text = res.text || "";
        if (!res.ok || isHtmlLike(text)) {
          errors.push({
            id: feed.id,
            status: res.status,
            reason: isHtmlLike(text) ? "html-error-page" : "upstream-error"
          });
          upstreamSnippet = upstreamSnippet || safeSnippet(text);
          return;
        }
        const xmlObj = parser.parse(text);
        let feedItems = xmlObj.rss?.channel?.item || xmlObj.feed?.entry || [];
        if (!Array.isArray(feedItems)) feedItems = [feedItems];
        feedItems.slice(0, 12).forEach((item) => {
          const headline = stripHtml(item.title || "");
          const summary = summarize(item.description || item.summary || "");
          const score = scoreText(`${headline} ${summary}`);
          items.push({
            headline,
            summary,
            url: item.link?.href || item.link || "",
            source: feed.id,
            publishedAt: item.pubDate || item.updated || new Date().toISOString(),
            score
          });
        });
      } catch (error) {
        errors.push({ id: feed.id, status: "error" });
      }
    })
  );

  const deduped = Array.from(new Map(items.map((item) => [item.headline, item])).values());
  const errorCode = errors.find((entry) => entry.status === 429)
    ? "RATE_LIMITED"
    : errors.find((entry) => entry.status === 403)
      ? "UPSTREAM_403"
      : errors.find((entry) => Number(entry.status) >= 500)
        ? "UPSTREAM_5XX"
        : errors.length
          ? "UPSTREAM_4XX"
          : "";

  if (!deduped.length) {
    return { ok: false, data: null, errorCode, errors, upstreamSnippet };
  }

  const totalScore = deduped.reduce((sum, item) => sum + item.score, 0);
  const avgScore = totalScore / deduped.length;
  const normalized = Math.max(-100, Math.min(100, Math.round(avgScore * 20)));
  const drivers = [...deduped]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map((item) => ({
      headline: item.headline,
      summary: item.summary,
      url: item.url,
      source: item.source,
      score: item.score
    }));

  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      source: FEEDS.map((feed) => feed.id).join(","),
      heuristic: true,
      score: normalized,
      label: labelFor(normalized),
      drivers
    },
    errorCode,
    errors,
    upstreamSnippet
  };
}

async function _onRequestGetInner({ request, env, data, waitUntil }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) {
    return bindingResponse;
  }

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    const response = makeResponse({
      ok: false,
      meta: { status: "NO_DATA", reason: "" },
      meta: { status: "NO_DATA", reason: "RATE_LIMITED" },
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: 429, snippet: "" },
      rateLimit: {
        remaining: "0",
        reset: new Date(Date.now() + rateState.resetMs).toISOString(),
        estimated: true
      },
      error: {
        code: "RATE_LIMITED",
        message: "Server rate limit",
        details: { retryAfterSeconds: Math.ceil(rateState.resetMs / 1000) }
      },
      status: 429
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 429,
      durationMs: Date.now() - started
    });
    return response;
  }

  const cacheKey = `${FEATURE_ID}:v1`;
  const cached = !panic ? await kvGetJson(env, cacheKey) : null;
  const cachedAgeSec = cached?.value?.ts
    ? Math.max(0, Math.floor((Date.now() - Date.parse(cached.value.ts)) / 1000))
    : null;
  const cacheFresh = cached?.hit && cachedAgeSec !== null && cachedAgeSec <= KV_TTL;
  const cacheUsable =
    cached?.hit && cached.value?.data && (cachedAgeSec === null || cachedAgeSec <= STALE_MAX);

  if (cacheFresh) {
    const response = makeResponse({
      ok: true,
      meta: { status: "LIVE", reason: "" },
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: { url: "", status: null, snippet: "" },
      isStale: false,
      cacheStatus: "HIT"
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

  if (cacheUsable && !panic) {
    if (typeof waitUntil === "function") {
      waitUntil(
        (async () => {
          try {
            const fresh = await fetchSentimentData();
            if (fresh.ok && fresh.data) {
              await kvPutJson(
                env,
                cacheKey,
                {
                  ts: new Date().toISOString(),
                  source: fresh.data.source,
                  schemaVersion: 1,
                  data: fresh.data
                },
                KV_TTL
              );
            }
          } catch (error) {
            // ignore refresh failure
          }
        })()
      );
    }

    const response = makeResponse({
      ok: true,
      meta: { status: "LIVE", reason: "" },
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: { url: "feeds", status: null, snippet: "" },
      error: {
        code: "STALE_FALLBACK",
        message: "Serving cached fallback data",
        details: { staleAgeSec: cachedAgeSec }
      },
      isStale: true,
      cacheStatus: "STALE"
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

  const fresh = await fetchSentimentData();
  if (!fresh.ok || !fresh.data) {
    const errorCode = fresh.errorCode || "UPSTREAM_5XX";
    const upstreamSnippet = fresh.upstreamSnippet || "";
    const errors = fresh.errors || [];
    if (cacheUsable) {
      const response = makeResponse({
        ok: true,
      meta: { status: "LIVE", reason: "" },
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: "feeds", status: null, snippet: upstreamSnippet },
        error: {
          code: errorCode,
          message: "No upstream data",
          details: { errors }
        },
        isStale: true,
        cacheStatus: "STALE"
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
      meta: { status: "NO_DATA", reason: "" },
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "feeds", status: null, snippet: upstreamSnippet },
      error: {
        code: errorCode,
        message: "No upstream data",
        details: { errors }
      }
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

  const dataPayload = fresh.data;

  if (!panic) {
    await kvPutJson(
      env,
      cacheKey,
      {
        ts: new Date().toISOString(),
        source: dataPayload.source,
        schemaVersion: 1,
        data: dataPayload
      },
      KV_TTL
    );
  }

  const errorCode = fresh.errorCode || "";
  const upstreamSnippet = fresh.upstreamSnippet || "";
  const errors = fresh.errors || [];

  const response = makeResponse({
    ok: true,
      meta: { status: "LIVE", reason: "" },
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
    cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
    upstream: { url: "feeds", status: 200, snippet: upstreamSnippet },
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
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}

// Legacy handler preserved for add-only compatibility (not exported).
async function onRequestGetLegacy({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) {
    return bindingResponse;
  }

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    const response = makeResponse({
      ok: false,
      meta: { status: "NO_DATA", reason: "" },
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: 429, snippet: "" },
      rateLimit: {
        remaining: "0",
        reset: new Date(Date.now() + rateState.resetMs).toISOString(),
        estimated: true
      },
      error: {
        code: "RATE_LIMITED",
        message: "Server rate limit",
        details: { retryAfterSeconds: Math.ceil(rateState.resetMs / 1000) }
      },
      status: 429
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 429,
      durationMs: Date.now() - started
    });
    return response;
  }

  const cacheKey = `${FEATURE_ID}:v1`;
  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
      meta: { status: "LIVE", reason: "" },
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: "", status: null, snippet: "" }
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
        feedItems.slice(0, 12).forEach((item) => {
          const headline = stripHtml(item.title || "");
          const summary = summarize(item.description || item.summary || "");
          const score = scoreText(`${headline} ${summary}`);
          items.push({
            headline,
            summary,
            url: item.link?.href || item.link || "",
            source: feed.id,
            publishedAt: item.pubDate || item.updated || new Date().toISOString(),
            score
          });
        });
      } catch (error) {
        errors.push({ id: feed.id, status: "error" });
      }
    })
  );

  const deduped = Array.from(new Map(items.map((item) => [item.headline, item])).values());
  if (!deduped.length) {
    const cached = !panic ? await kvGetJson(env, cacheKey) : null;
    const errorCode = errors.find((entry) => entry.status === 429)
      ? "RATE_LIMITED"
      : errors.find((entry) => entry.status === 403)
        ? "UPSTREAM_403"
        : errors.find((entry) => Number(entry.status) >= 500)
          ? "UPSTREAM_5XX"
          : "UPSTREAM_4XX";
    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
      meta: { status: "LIVE", reason: "" },
        feature: FEATURE_ID,
        traceId,
        data: cached.value.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: "feeds", status: null, snippet: upstreamSnippet },
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
      meta: { status: "NO_DATA", reason: "" },
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "feeds", status: null, snippet: upstreamSnippet },
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

  const totalScore = deduped.reduce((sum, item) => sum + item.score, 0);
  const avgScore = totalScore / deduped.length;
  const normalized = Math.max(-100, Math.min(100, Math.round(avgScore * 20)));
  const drivers = [...deduped]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3)
    .map((item) => ({
      headline: item.headline,
      summary: item.summary,
      url: item.url,
      source: item.source,
      score: item.score
    }));

  const dataPayload = {
    updatedAt: new Date().toISOString(),
    source: FEEDS.map((feed) => feed.id).join(","),
    heuristic: true,
    score: normalized,
    label: labelFor(normalized),
    drivers
  };

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
      meta: { status: "LIVE", reason: "" },
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
    cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
    upstream: { url: "feeds", status: 200, snippet: upstreamSnippet },
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
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}


/* RV_CONTRACT_WRAP_V1: enforce {ok,feature,meta.status,meta.reason} on every response */
export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  try {
    const res = await _onRequestGetInner(context);
    // If it's already a Response, try to parse JSON safely (clone via text)
    const text = await res.text();
    try {
      const obj = text ? JSON.parse(text) : null;
      const ok =
        obj &&
        typeof obj === "object" &&
        typeof obj.ok === "boolean" &&
        typeof obj.feature === "string" &&
        obj.meta &&
        typeof obj.meta === "object" &&
        typeof obj.meta.status === "string" &&
        typeof obj.meta.reason === "string";
      if (ok) {
        return makeResponse(obj);
      }
    } catch (_) {
      // fall through
    }
    // Contract fail -> NO_DATA wrapper
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      meta: { status: "NO_DATA", reason: "CONTRACT_WRAP" },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: { code: "CONTRACT_INVALID", message: "Response contract invalid", details: {} }
    });
  } catch (error) {
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      meta: { status: "NO_DATA", reason: "HANDLER_THROW" },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: { code: "HANDLER_THROW", message: error?.message || "Unhandled error", details: {} }
    });
  }
}
