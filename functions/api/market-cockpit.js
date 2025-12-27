import {
  assertBindings,
  createTraceId,
  logServer,
  makeResponse,
  safeFetchJson,
  swrGetOrRefresh,
  normalizeFreshness,
  buildMarketauxParams
} from "./_shared.js";

const FEATURE_ID = "market-cockpit";
const KV_TTL = 15 * 60;
const STALE_MAX = 48 * 60 * 60;
const CACHE_KEY = "DASH:MARKET_COCKPIT";

const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/quotes/VIX.json";
const FNG_CRYPTO_URL = "https://api.alternative.me/fng/?limit=1";
const FMP_BATCH = "https://financialmodelingprep.com/api/v3/quote";
const MARKETAUX_URL = "https://api.marketaux.com/v1/news/all";

function bucketSentiment(value) {
  if (value <= -0.5) return "Angst";
  if (value <= -0.15) return "Negativ";
  if (value < 0.15) return "Neutral";
  if (value < 0.5) return "Positiv";
  return "Euphorie";
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractVix(json) {
  const candidates = [
    json?.data?.[0]?.last,
    json?.data?.[0]?.lastPrice,
    json?.data?.[0]?.last_price,
    json?.data?.[0]?.last_trade_price,
    json?.data?.last,
    json?.data?.last_price
  ];
  for (const candidate of candidates) {
    const parsed = parseNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function fetchVix(env) {
  const primary = await safeFetchJson(VIX_URL, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (primary.ok && primary.json) {
    const value = extractVix(primary.json);
    if (value !== null) {
      return {
        ok: true,
        value,
        source: "CBOE",
        note: ""
      };
    }
  }

  if (!env.FINNHUB_API_KEY) {
    return { ok: false, value: null, source: "CBOE", note: "FINNHUB_API_KEY missing" };
  }

  const fallbackUrl = `https://finnhub.io/api/v1/quote?symbol=VIXY&token=${env.FINNHUB_API_KEY}`;
  const fallback = await safeFetchJson(fallbackUrl, {
    userAgent: env.USER_AGENT || "RubikVault/1.0"
  });
  if (fallback.ok && fallback.json) {
    const value = parseNumber(fallback.json.c);
    if (value !== null) {
      return {
        ok: true,
        value,
        source: "Finnhub (VIXY proxy)",
        note: "Proxy via VIXY"
      };
    }
  }

  return {
    ok: false,
    value: null,
    source: "CBOE",
    note: "Unavailable"
  };
}

async function fetchFngCrypto(env) {
  const res = await safeFetchJson(FNG_CRYPTO_URL, {
    userAgent: env.USER_AGENT || "RubikVault/1.0"
  });
  if (!res.ok || !res.json) {
    return { ok: false, value: null, label: "", source: "Alternative.me" };
  }
  const entry = Array.isArray(res.json?.data) ? res.json.data[0] : res.json?.data;
  const value = parseNumber(entry?.value);
  return {
    ok: value !== null,
    value,
    label: entry?.value_classification || "",
    source: "Alternative.me"
  };
}

async function fetchMarketaux(env) {
  if (!env.MARKETAUX_KEY) {
    return { ok: false, score: null, label: "", source: "Marketaux", rateLimited: false };
  }
  const params = buildMarketauxParams();
  params.set("api_token", env.MARKETAUX_KEY);
  params.set("languages", "en");
  params.set("filter_entities", "true");
  params.set("group_similar", "true");
  params.set("limit", "10");
  params.set("symbols", "SPY,QQQ,BTC,ETH");
  const url = `${MARKETAUX_URL}?${params.toString()}`;
  const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !res.json) {
    return { ok: false, score: null, label: "", source: "Marketaux", rateLimited: false };
  }
  const items = Array.isArray(res.json?.data) ? res.json.data : [];
  const scores = items
    .map((item) => parseNumber(item?.sentiment_score ?? item?.sentiment))
    .filter((value) => value !== null);
  const avg = scores.length ? scores.reduce((sum, v) => sum + v, 0) / scores.length : 0;
  const rounded = Number(avg.toFixed(2));
  return {
    ok: true,
    score: rounded,
    label: bucketSentiment(rounded),
    source: "Marketaux",
    rateLimited: false
  };
}

function parseChangePercent(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/[()%]/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchProxies(env) {
  if (!env.FMP_API_KEY) {
    return { ok: false, proxies: {}, source: "FMP", note: "FMP_API_KEY missing" };
  }
  const symbols = "UUP,USO,GLD";
  const url = `${FMP_BATCH}/${symbols}?apikey=${env.FMP_API_KEY}`;
  const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !Array.isArray(res.json)) {
    return { ok: false, proxies: {}, source: "FMP", note: "Upstream error" };
  }
  const map = new Map(res.json.map((item) => [item.symbol, item]));
  const build = (symbol, label) => {
    const item = map.get(symbol);
    return {
      symbol,
      label,
      price: parseNumber(item?.price),
      changePercent: parseChangePercent(item?.changesPercentage),
      proxy: true
    };
  };
  return {
    ok: true,
    proxies: {
      usd: build("UUP", "US Dollar (UUP)"),
      oil: build("USO", "Oil (USO)"),
      gold: build("GLD", "Gold (GLD)")
    },
    source: "FMP",
    note: ""
  };
}

function buildRegime({ vix, fngCrypto, newsSentiment }) {
  let score = 50;
  const drivers = [];
  if (typeof vix?.value === "number") {
    if (vix.value < 16) {
      score += 10;
      drivers.push("VIX low");
    } else if (vix.value > 25) {
      score -= 10;
      drivers.push("VIX elevated");
    }
  }
  if (typeof fngCrypto?.value === "number") {
    if (fngCrypto.value >= 60) {
      score += 8;
      drivers.push("Crypto risk-on");
    } else if (fngCrypto.value <= 40) {
      score -= 8;
      drivers.push("Crypto risk-off");
    }
  }
  if (typeof newsSentiment?.score === "number") {
    if (newsSentiment.score >= 0.2) {
      score += 5;
      drivers.push("News tone positive");
    } else if (newsSentiment.score <= -0.2) {
      score -= 5;
      drivers.push("News tone negative");
    }
  }
  let label = "Neutral";
  if (score >= 60) label = "Risk-On";
  if (score <= 40) label = "Risk-Off";
  return { label, score, drivers };
}

async function fetchMarketCockpit(env) {
  const [vixResult, fngResult, newsResult, proxyResult] = await Promise.allSettled([
    fetchVix(env),
    fetchFngCrypto(env),
    fetchMarketaux(env),
    fetchProxies(env)
  ]);

  const vix = vixResult.status === "fulfilled" ? vixResult.value : { ok: false };
  const fngCrypto = fngResult.status === "fulfilled" ? fngResult.value : { ok: false };
  const newsSentiment = newsResult.status === "fulfilled" ? newsResult.value : { ok: false };
  const proxies = proxyResult.status === "fulfilled" ? proxyResult.value : { ok: false };

  const partial = !vix.ok || !fngCrypto.ok || !newsSentiment.ok || !proxies.ok;
  const hasData =
    vix.value !== null ||
    fngCrypto.value !== null ||
    newsSentiment.score !== null ||
    Object.keys(proxies.proxies || {}).length > 0;
  if (!hasData) {
    return {
      ok: false,
      error: {
        code: "UPSTREAM_5XX",
        message: "No upstream data",
        details: {}
      }
    };
  }
  const regime = buildRegime({ vix, fngCrypto, newsSentiment });

  return {
    ok: true,
    data: {
      updatedAt: new Date().toISOString(),
      partial,
      source: "multi",
      regime,
      vix: {
        value: vix.value ?? null,
        source: vix.source || "CBOE",
        note: vix.note || ""
      },
      fngCrypto: {
        value: fngCrypto.value ?? null,
        label: fngCrypto.label || "",
        source: fngCrypto.source || "Alternative.me"
      },
      newsSentiment: {
        score: newsSentiment.score ?? null,
        label: newsSentiment.label || "",
        source: newsSentiment.source || "Marketaux",
        rateLimited: Boolean(newsSentiment.rateLimited)
      },
      proxies: proxies.proxies || {},
      sourceMap: {
        vix: vix.source || "CBOE",
        fngCrypto: fngCrypto.source || "Alternative.me",
        newsSentiment: newsSentiment.source || "Marketaux",
        proxies: proxies.source || "FMP"
      }
    }
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
    fetcher: () => fetchMarketCockpit(env),
    featureName: FEATURE_ID
  });

  const payload = swr.value?.data || swr.value || null;
  if (!payload) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "multi", status: null, snippet: "" },
      error: {
        code: swr.error?.code || "UPSTREAM_5XX",
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

  const ageSeconds = swr.ageSeconds ?? null;
  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: payload,
    cache: { hit: swr.cacheStatus === "HIT" || swr.cacheStatus === "STALE", ttl: KV_TTL, layer: swr.cacheStatus === "MISS" ? "none" : "kv" },
    upstream: { url: "multi", status: 200, snippet: "" },
    isStale: swr.isStale,
    freshness: normalizeFreshness(ageSeconds),
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
