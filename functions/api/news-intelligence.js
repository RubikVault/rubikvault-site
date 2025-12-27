import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "news-intelligence";
const KV_TTL = 3600;
const CACHE_KEY = "rv:news-intelligence:v1";
const UPSTREAM_BASE = "https://api.marketaux.com/v1/news/all";

const NARRATIVES = [
  {
    id: "ai-chips",
    title: "AI Chips",
    symbols: "NVDA,AMD,TSM,ASML",
    search: "AI OR chips OR semiconductor"
  },
  {
    id: "rates",
    title: "Rates",
    symbols: "SPY,QQQ",
    search: "inflation OR fed OR rates OR CPI"
  },
  {
    id: "crypto-reg",
    title: "Crypto Reg",
    symbols: "BTC,ETH",
    search: "ETF OR SEC OR regulation"
  }
];

function shortTrace(traceId) {
  return String(traceId || "").slice(0, 8) || "trace";
}

function bucketSentiment(value) {
  if (value <= -0.5) return "Angst";
  if (value <= -0.15) return "Negativ";
  if (value < 0.15) return "Neutral";
  if (value < 0.5) return "Positiv";
  return "Euphorie";
}

function parseArticles(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.articles)) return json.articles;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

function normalizeItem(item) {
  const sentimentValue = Number(item?.sentiment_score ?? item?.sentiment ?? item?.sentimentScore);
  const matchValue = Number(item?.match_score ?? item?.matchScore);
  return {
    title: item?.title || item?.headline || "",
    url: item?.url || item?.link || "",
    source: item?.source || item?.source_name || item?.sourceName || "",
    publishedAt: item?.published_at || item?.publishedAt || item?.published || "",
    sentimentScore: Number.isFinite(sentimentValue) ? sentimentValue : null,
    matchScore: Number.isFinite(matchValue) ? matchValue : null
  };
}

function selectTopHeadline(items) {
  if (!items.length) return null;
  const withScore = items.filter((item) => typeof item.matchScore === "number");
  const ranked = withScore.length
    ? [...withScore].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    : [...items].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const top = ranked[0];
  return top
    ? {
        title: top.title,
        url: top.url,
        source: top.source || "marketaux",
        publishedAt: top.publishedAt || ""
      }
    : null;
}

function computeSentiment(items) {
  const scores = items
    .map((item) => item.sentimentScore)
    .filter((value) => typeof value === "number");
  if (!scores.length) return { avg: 0, label: "Neutral" };
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const rounded = Number(avg.toFixed(2));
  return { avg: rounded, label: bucketSentiment(rounded) };
}

function computeIntensity(items) {
  const matchSum = items.reduce(
    (sum, item) => sum + (typeof item.matchScore === "number" ? item.matchScore : 0),
    0
  );
  return items.length + Math.round(matchSum / 100);
}

function whyItMatters(id, sentimentAvg, intensity) {
  if (id === "rates" && sentimentAvg <= -0.15) {
    return "Markets may reprice risk; watch yields and growth multiples.";
  }
  if (id === "ai-chips" && intensity >= 6) {
    return "High narrative density often precedes volatility in leaders and suppliers.";
  }
  if (id === "crypto-reg" && Math.abs(sentimentAvg) >= 0.5) {
    return "Reg headlines can drive sharp, nonlinear moves; watch ETF/SEC signals.";
  }
  return "Track narrative shifts for directional risk and volatility cues.";
}

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function buildMarketauxUrl({ symbols, search }, apiKey, publishedAfter) {
  const url = new URL(UPSTREAM_BASE);
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("languages", "en");
  url.searchParams.set("filter_entities", "true");
  url.searchParams.set("group_similar", "true");
  url.searchParams.set("limit", "10");
  url.searchParams.set("published_after", publishedAfter);
  if (symbols) url.searchParams.set("symbols", symbols);
  if (search) url.searchParams.set("search", search);
  return url.toString();
}

async function fetchNarrative(narrative, apiKey, publishedAfter) {
  const url = buildMarketauxUrl(narrative, apiKey, publishedAfter);
  const started = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": "RubikVault/1.0" } });
  const text = await res.text();
  const durationMs = Date.now() - started;
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    return {
      ok: false,
      status: res.status,
      items: [],
      durationMs,
      snippet: safeSnippet(text),
      error: "SCHEMA_INVALID"
    };
  }
  const items = parseArticles(json).map(normalizeItem).filter((item) => item.title && item.url);
  return {
    ok: res.ok,
    status: res.status,
    items,
    durationMs,
    snippet: res.ok ? "" : safeSnippet(text),
    error: res.ok ? "" : mapUpstreamCode(res.status)
  };
}

function buildNarrativePayload(narrative, items, prevMap) {
  const sentiment = computeSentiment(items);
  const intensity = computeIntensity(items);
  const prev = prevMap?.get(narrative.id);
  const sentimentPrev = typeof prev?.sentimentAvg === "number" ? prev.sentimentAvg : null;
  const intensityPrev = typeof prev?.intensity === "number" ? prev.intensity : null;
  const breakingRisk =
    (typeof sentimentPrev === "number" &&
      Math.abs(sentiment.avg - sentimentPrev) >= 0.25) ||
    (typeof intensityPrev === "number" &&
      intensityPrev > 0 &&
      intensity >= 2 * intensityPrev);

  return {
    id: narrative.id,
    title: narrative.title,
    sentimentAvg: sentiment.avg,
    sentimentLabel: sentiment.label,
    intensity,
    breakingRisk: Boolean(breakingRisk),
    topHeadline: selectTopHeadline(items),
    whyItMatters: whyItMatters(narrative.id, sentiment.avg, intensity)
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

  if (!env.MARKETAUX_KEY) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: {
        status: "FAIL",
        updatedAt: new Date().toISOString(),
        ttlSec: KV_TTL,
        source: "marketaux",
        trace: shortTrace(traceId),
        narratives: []
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_BASE, status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "MARKETAUX_KEY missing",
        details: { missing: ["MARKETAUX_KEY"] }
      },
      status: 500
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

  const cached = !panic ? await kvGetJson(env, CACHE_KEY) : null;
  const prevNarratives = cached?.value?.data?.narratives || [];
  const prevMap = new Map(prevNarratives.map((item) => [item.id, item]));
  const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const results = await Promise.all(
    NARRATIVES.map((narrative) => fetchNarrative(narrative, env.MARKETAUX_KEY, publishedAfter))
  );

  const available = results.filter((result) => result.ok && result.items.length);
  const upstreamMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  const upstreamStatus = results.find((result) => !result.ok)?.status || 200;
  const upstreamSnippet = results.find((result) => result.snippet)?.snippet || "";
  const errorCode = results.find((result) => result.error)?.error || "";

  if (!available.length) {
    if (cached?.hit && cached.value?.data) {
      const ageSec = cached.value?.ts
        ? Math.max(0, Math.floor((Date.now() - Date.parse(cached.value.ts)) / 1000))
        : null;
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: {
          ...cached.value.data,
          status: "WARN",
          trace: shortTrace(traceId),
          ttlSec: KV_TTL,
          debug: {
            cache: { hit: true, ageSec },
            upstream: { status: upstreamStatus ?? null, ms: upstreamMs }
          }
        },
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: UPSTREAM_BASE, status: upstreamStatus ?? null, snippet: upstreamSnippet },
        error: {
          code: errorCode || "UPSTREAM_5XX",
          message: "Upstream unavailable; serving cached",
          details: {}
        },
        isStale: true
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: upstreamStatus ?? null,
        durationMs: Date.now() - started
      });
      return response;
    }

    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      data: {
        status: "FAIL",
        updatedAt: new Date().toISOString(),
        ttlSec: KV_TTL,
        source: "marketaux",
        trace: shortTrace(traceId),
        narratives: [],
        debug: {
          cache: { hit: false, ageSec: null },
          upstream: { status: upstreamStatus ?? null, ms: upstreamMs }
        }
      },
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: UPSTREAM_BASE, status: upstreamStatus ?? null, snippet: upstreamSnippet },
      error: {
        code: errorCode || "UPSTREAM_5XX",
        message: "No upstream data",
        details: {}
      },
      status: 502
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: upstreamStatus ?? null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const narratives = NARRATIVES.map((narrative, index) => {
    const result = results[index];
    const items = result.ok ? result.items : [];
    return buildNarrativePayload(narrative, items, prevMap);
  });

  const dataPayload = {
    status: available.length >= 2 ? "OK" : "WARN",
    updatedAt: new Date().toISOString(),
    ttlSec: KV_TTL,
    source: "marketaux",
    trace: shortTrace(traceId),
    narratives,
    debug: {
      cache: { hit: false, ageSec: null },
      upstream: { status: upstreamStatus ?? 200, ms: upstreamMs }
    }
  };

  if (!panic) {
    await kvPutJson(
      env,
      CACHE_KEY,
      { ts: new Date().toISOString(), data: dataPayload },
      KV_TTL
    );
  }

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
    cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
    upstream: { url: UPSTREAM_BASE, status: upstreamStatus ?? 200, snippet: upstreamSnippet },
    error: errorCode
      ? {
          code: errorCode,
          message: "Some narratives failed",
          details: {}
        }
      : {}
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: upstreamStatus ?? 200,
    durationMs: Date.now() - started
  });
  return response;
}
