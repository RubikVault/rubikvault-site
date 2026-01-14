import {
  assertBindings,
  createTraceId,
  kvGetJson,
  logServer,
  makeResponse,
  safeFetchJson,
  safeFetchText,
  swrGetOrRefresh,
  normalizeFreshness,
  buildMarketauxParams,
  withCoinGeckoKey
} from "./_shared.js";

const FEATURE_ID = "market-cockpit";
const KV_TTL = 15 * 60;
const STALE_MAX = 48 * 60 * 60;
const CACHE_KEY = "DASH:MARKET_COCKPIT";

const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/quotes/VIX.json";
const FNG_STOCKS_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const FNG_CRYPTO_URL = "https://api.alternative.me/fng/?limit=1";
const BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
const CRYPTO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true";
const FMP_BATCH = "https://financialmodelingprep.com/api/v3/quote";
const MARKETAUX_URL = "https://api.marketaux.com/v1/news/all";
const TREASURY_CSV_URL =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/DailyTreasuryYieldCurveRateData.csv";
const YAHOO_DXY_URL =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=DX-Y.NYB";
const YAHOO_INDICES_URL =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=^GSPC,^IXIC,^DJI,^RUT";
const MACRO_CACHE_KEY = "macro-rates:v2";
const SECTOR_CACHE_KEY = "DASH:SP500_SECTORS";

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

function normalizeFngStocks(payload) {
  const data = payload?.fear_and_greed || payload?.fearAndGreed || payload || {};
  const valueRaw = data.score ?? data.value ?? data?.now?.value ?? null;
  const value = parseNumber(valueRaw);
  const label = data.rating || data.value_classification || data.classification || data.text || "";
  const timestampRaw = data.timestamp || data.lastUpdated || data.last_updated || null;
  const timestamp = Number.isFinite(Number(timestampRaw)) ? Number(timestampRaw) : Date.now();
  if (value === null && !label) return null;
  return { value, label, timestamp };
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

async function fetchFngStocks(env) {
  const res = await safeFetchJson(FNG_STOCKS_URL, {
    userAgent: env.USER_AGENT || "RubikVault/1.0"
  });
  if (!res.ok || !res.json) {
    return { ok: false, value: null, label: "", source: "CNN" };
  }
  const normalized = normalizeFngStocks(res.json);
  if (!normalized) {
    return { ok: false, value: null, label: "", source: "CNN" };
  }
  return {
    ok: normalized.value !== null || Boolean(normalized.label),
    value: normalized.value,
    label: normalized.label,
    source: "CNN"
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

async function fetchBtc(env) {
  const url = withCoinGeckoKey(BTC_URL, env);
  const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !res.json) {
    return { ok: false, price: null, changePercent: null, source: "CoinGecko" };
  }
  const data = res.json?.bitcoin || {};
  return {
    ok: data.usd !== undefined,
    price: parseNumber(data.usd),
    changePercent: parseNumber(data.usd_24h_change),
    source: "CoinGecko"
  };
}

async function fetchCrypto(env) {
  const url = withCoinGeckoKey(CRYPTO_URL, env);
  const res = await safeFetchJson(url, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !res.json) {
    return {
      ok: false,
      btc: { price: null, changePercent: null },
      eth: { price: null, changePercent: null },
      sol: { price: null, changePercent: null },
      xrp: { price: null, changePercent: null },
      source: "CoinGecko"
    };
  }
  const data = res.json || {};
  return {
    ok: true,
    btc: {
      price: parseNumber(data.bitcoin?.usd),
      changePercent: parseNumber(data.bitcoin?.usd_24h_change)
    },
    eth: {
      price: parseNumber(data.ethereum?.usd),
      changePercent: parseNumber(data.ethereum?.usd_24h_change)
    },
    sol: {
      price: parseNumber(data.solana?.usd),
      changePercent: parseNumber(data.solana?.usd_24h_change)
    },
    xrp: {
      price: parseNumber(data.ripple?.usd),
      changePercent: parseNumber(data.ripple?.usd_24h_change)
    },
    source: "CoinGecko"
  };
}

async function fetchDxy(env) {
  const res = await safeFetchJson(YAHOO_DXY_URL, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !res.json) {
    return { ok: false, value: null, changePercent: null, source: "Yahoo" };
  }
  const quote = res.json?.quoteResponse?.result?.[0] || {};
  return {
    ok: quote.regularMarketPrice !== undefined,
    value: parseNumber(quote.regularMarketPrice),
    changePercent: parseNumber(quote.regularMarketChangePercent),
    source: "Yahoo"
  };
}

async function fetchIndices(env) {
  const res = await safeFetchJson(YAHOO_INDICES_URL, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
  if (!res.ok || !res.json || !Array.isArray(res.json?.quoteResponse?.result)) {
    return {
      ok: false,
      sp500: { value: null, changePercent: null },
      nasdaq: { value: null, changePercent: null },
      dow: { value: null, changePercent: null },
      russell: { value: null, changePercent: null },
      source: "Yahoo"
    };
  }
  const quotes = res.json.quoteResponse.result;
  const map = new Map(quotes.map((q) => [q.symbol, q]));
  
  const buildIndex = (symbol) => {
    const quote = map.get(symbol);
    if (!quote) return { value: null, changePercent: null };
    return {
      value: parseNumber(quote.regularMarketPrice),
      changePercent: parseNumber(quote.regularMarketChangePercent)
    };
  };
  
  return {
    ok: true,
    sp500: buildIndex("^GSPC"),
    nasdaq: buildIndex("^IXIC"),
    dow: buildIndex("^DJI"),
    russell: buildIndex("^RUT"),
    source: "Yahoo"
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

function parseCsvLine(line) {
  return line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function parseYieldCurveCsv(csv) {
  if (!csv) return null;
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const lastLine = lines[lines.length - 1];
  const values = parseCsvLine(lastLine);
  if (headers.length !== values.length) return null;
  const row = Object.fromEntries(headers.map((key, idx) => [key, values[idx]]));
  const yields = {
    "1y": parseNumber(row["1 yr"] || row["1 year"]),
    "2y": parseNumber(row["2 yr"] || row["2 year"]),
    "3y": parseNumber(row["3 yr"] || row["3 year"]),
    "5y": parseNumber(row["5 yr"] || row["5 year"]),
    "7y": parseNumber(row["7 yr"] || row["7 year"]),
    "10y": parseNumber(row["10 yr"] || row["10 year"]),
    "20y": parseNumber(row["20 yr"] || row["20 year"]),
    "30y": parseNumber(row["30 yr"] || row["30 year"])
  };
  return {
    updatedAt: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
    yields,
    source: "US Treasury"
  };
}

function pickByLabel(list, label) {
  return list.find((item) => item.label === label) || null;
}

function buildMacroSummary(macro) {
  if (!macro) return { rates: [], fx: [], cpi: [], updatedAt: null };
  const series = Array.isArray(macro.series) ? macro.series : [];
  const rates = [
    pickByLabel(series, "Fed Funds"),
    pickByLabel(series, "US 2Y"),
    pickByLabel(series, "US 10Y"),
    pickByLabel(series, "US 30Y")
  ].filter(Boolean);
  const fx = [
    pickByLabel(series, "DXY"),
    pickByLabel(series, "EURUSD"),
    pickByLabel(series, "GBPUSD"),
    pickByLabel(series, "USDJPY")
  ].filter(Boolean);
  const cpi = Array.isArray(macro.cpi) ? macro.cpi : [];
  return {
    rates,
    fx,
    cpi,
    updatedAt: macro.updatedAt || null
  };
}

function buildSectorPerformance(sectorData) {
  if (!sectorData || !Array.isArray(sectorData.sectors)) {
    return { top: [], bottom: [], updatedAt: null };
  }
  const sorted = [...sectorData.sectors].sort((a, b) => (b.r1d ?? -999) - (a.r1d ?? -999));
  const top = sorted.slice(0, 3);
  const bottom = sorted.slice(-3).reverse();
  return {
    top,
    bottom,
    updatedAt: sectorData.updatedAt || null
  };
}

async function fetchYields(env) {
  const cached = await kvGetJson(env, "DASH:YIELD_CURVE");
  if (cached?.hit && cached.value?.data?.yields) {
    return {
      ok: true,
      yields: cached.value.data.yields || {},
      updatedAt: cached.value.data.updatedAt || cached.value.ts,
      source: cached.value.data.source || "US Treasury"
    };
  }
  const res = await safeFetchText(TREASURY_CSV_URL, {
    userAgent: env.USER_AGENT || "RubikVault/1.0"
  });
  if (!res.ok) {
    return { ok: false, yields: {}, updatedAt: null, source: "US Treasury" };
  }
  const parsed = parseYieldCurveCsv(res.text || "");
  if (!parsed) {
    return { ok: false, yields: {}, updatedAt: null, source: "US Treasury" };
  }
  return { ok: true, ...parsed };
}

function buildRegime({ vix, fngCrypto, fngStocks, newsSentiment }) {
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
  if (typeof fngStocks?.value === "number") {
    if (fngStocks.value >= 60) {
      score += 6;
      drivers.push("Stocks risk-on");
    } else if (fngStocks.value <= 40) {
      score -= 6;
      drivers.push("Stocks risk-off");
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
  const [macroCached, sectorCached] = await Promise.all([
    kvGetJson(env, MACRO_CACHE_KEY),
    kvGetJson(env, SECTOR_CACHE_KEY)
  ]);

  const [vixResult, fngResult, fngStocksResult, newsResult, proxyResult, cryptoResult, dxyResult, yieldsResult, indicesResult] =
    await Promise.allSettled([
    fetchVix(env),
    fetchFngCrypto(env),
    fetchFngStocks(env),
    fetchMarketaux(env),
    fetchProxies(env),
    fetchCrypto(env),
    fetchDxy(env),
    fetchYields(env),
    fetchIndices(env)
  ]);

  const vix = vixResult.status === "fulfilled" ? vixResult.value : { ok: false };
  const fngCrypto = fngResult.status === "fulfilled" ? fngResult.value : { ok: false };
  const fngStocks = fngStocksResult.status === "fulfilled" ? fngStocksResult.value : { ok: false };
  const newsSentiment = newsResult.status === "fulfilled" ? newsResult.value : { ok: false };
  const proxies = proxyResult.status === "fulfilled" ? proxyResult.value : { ok: false };
  const crypto = cryptoResult.status === "fulfilled" ? cryptoResult.value : { ok: false, btc: {}, eth: {}, sol: {}, xrp: {}, source: "CoinGecko" };
  const dxy = dxyResult.status === "fulfilled" ? dxyResult.value : { ok: false };
  const yields = yieldsResult.status === "fulfilled" ? yieldsResult.value : { ok: false };
  const indices = indicesResult.status === "fulfilled" ? indicesResult.value : { ok: false, sp500: {}, nasdaq: {}, dow: {}, russell: {}, source: "Yahoo" };
  const macroSummary = buildMacroSummary(macroCached?.value?.data);
  const sectorPerformance = buildSectorPerformance(sectorCached?.value?.data);

  const partial =
    !vix.ok ||
    !fngCrypto.ok ||
    !fngStocks.ok ||
    !newsSentiment.ok ||
    !proxies.ok ||
    !crypto.ok ||
    !dxy.ok ||
    !yields.ok ||
    !indices.ok ||
    (!macroSummary.rates.length && !macroSummary.fx.length && !macroSummary.cpi.length) ||
    !sectorPerformance.top.length;
  const hasData =
    vix.value !== null ||
    fngCrypto.value !== null ||
    fngStocks.value !== null ||
    newsSentiment.score !== null ||
    Object.keys(proxies.proxies || {}).length > 0 ||
    crypto.btc?.price !== null ||
    crypto.eth?.price !== null ||
    crypto.sol?.price !== null ||
    crypto.xrp?.price !== null ||
    dxy.value !== null ||
    indices.sp500?.value !== null ||
    indices.nasdaq?.value !== null ||
    indices.dow?.value !== null ||
    Object.keys(yields.yields || {}).length > 0;
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
  const regime = buildRegime({ vix, fngCrypto, fngStocks, newsSentiment });

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
      fngStocks: {
        value: fngStocks.value ?? null,
        label: fngStocks.label || "",
        source: fngStocks.source || "CNN"
      },
      newsSentiment: {
        score: newsSentiment.score ?? null,
        label: newsSentiment.label || "",
        source: newsSentiment.source || "Marketaux",
        rateLimited: Boolean(newsSentiment.rateLimited)
      },
      btc: {
        price: crypto.btc?.price ?? null,
        changePercent: crypto.btc?.changePercent ?? null,
        source: crypto.source || "CoinGecko"
      },
      eth: {
        price: crypto.eth?.price ?? null,
        changePercent: crypto.eth?.changePercent ?? null,
        source: crypto.source || "CoinGecko"
      },
      sol: {
        price: crypto.sol?.price ?? null,
        changePercent: crypto.sol?.changePercent ?? null,
        source: crypto.source || "CoinGecko"
      },
      xrp: {
        price: crypto.xrp?.price ?? null,
        changePercent: crypto.xrp?.changePercent ?? null,
        source: crypto.source || "CoinGecko"
      },
      dxy: {
        value: dxy.value ?? null,
        changePercent: dxy.changePercent ?? null,
        source: dxy.source || "Yahoo"
      },
      indices: {
        sp500: {
          value: indices.sp500?.value ?? null,
          changePercent: indices.sp500?.changePercent ?? null,
          source: indices.source || "Yahoo"
        },
        nasdaq: {
          value: indices.nasdaq?.value ?? null,
          changePercent: indices.nasdaq?.changePercent ?? null,
          source: indices.source || "Yahoo"
        },
        dow: {
          value: indices.dow?.value ?? null,
          changePercent: indices.dow?.changePercent ?? null,
          source: indices.source || "Yahoo"
        },
        russell: {
          value: indices.russell?.value ?? null,
          changePercent: indices.russell?.changePercent ?? null,
          source: indices.source || "Yahoo"
        }
      },
      yields: {
        updatedAt: yields.updatedAt || null,
        source: yields.source || "US Treasury",
        values: yields.yields || {}
      },
      macroSummary,
      sectorPerformance,
      proxies: proxies.proxies || {},
      sourceMap: {
        vix: vix.source || "CBOE",
        fngCrypto: fngCrypto.source || "Alternative.me",
        fngStocks: fngStocks.source || "CNN",
        newsSentiment: newsSentiment.source || "Marketaux",
        proxies: proxies.source || "FMP",
        crypto: crypto.source || "CoinGecko",
        dxy: dxy.source || "Yahoo",
        indices: indices.source || "Yahoo",
        yields: yields.source || "US Treasury",
        macro: macroSummary.updatedAt ? "macro-rates" : "kv",
        sectors: sectorPerformance.updatedAt ? "sp500-sectors" : "kv"
      }
    }
  };
}

export async function onRequestGet(context) {
  const { request, env, data } = context;
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
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
