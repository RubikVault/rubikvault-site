import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  normalizeSymbolsParam,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "quotes";
const KV_TTL = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const rateStore = new Map();
const STOOQ_BASE = "https://stooq.com/q/l/";
const FINNHUB_BASE = "https://finnhub.io/api/v1/quote";
const FMP_BASE = "https://financialmodelingprep.com/api/v3/quote";

function parseChangePercent(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[%()]/g, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

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

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
}

function isLegacyEndpoint(status, text) {
  if (status !== 403) return false;
  return /legacy\s*endpoint/i.test(String(text || ""));
}

function mapToStooqSymbol(symbol) {
  if (symbol === "BTC-USD") return "BTC.V";
  if (symbol === "ETH-USD") return "ETH.V";
  if (symbol.includes(".")) return symbol;
  return `${symbol}.US`;
}

function parseNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStooqCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const columns = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = columns[index] ?? "";
    });
    return row;
  });
}

function normalizeFmp(payload, requestedSymbols) {
  const list = Array.isArray(payload) ? payload : [];
  const lookup = new Map(list.map((item) => [String(item.symbol || "").toUpperCase(), item]));
  const now = new Date().toISOString();
  const quotes = requestedSymbols.map((symbol) => {
    const entry = lookup.get(symbol);
    return {
      symbol,
      price: entry?.price ?? null,
      changePercent: parseChangePercent(entry?.changesPercentage),
      ts: now,
      source: "financialmodelingprep"
    };
  });

  return {
    updatedAt: now,
    source: "financialmodelingprep",
    quotes
  };
}

function normalizeStooq(rows, requestedSymbols, stooqLookup) {
  const now = new Date().toISOString();
  const quotes = requestedSymbols.map((symbol) => {
    const stooqSymbol = stooqLookup.get(symbol);
    const row = stooqSymbol ? rows.get(stooqSymbol) : null;
    const open = parseNumber(row?.Open);
    const close = parseNumber(row?.Close);
    const changePercent =
      open && close && Number.isFinite(open) && Number.isFinite(close) && open !== 0
        ? ((close - open) / open) * 100
        : null;
    return {
      symbol,
      price: close ?? null,
      changePercent,
      ts: now,
      source: "stooq"
    };
  });

  return {
    updatedAt: now,
    source: "stooq",
    quotes
  };
}

function normalizeFinnhub(results, requestedSymbols) {
  const now = new Date().toISOString();
  const lookup = new Map(results.map((entry) => [entry.symbol, entry]));
  const quotes = requestedSymbols.map((symbol) => {
    const entry = lookup.get(symbol);
    return {
      symbol,
      price: entry?.price ?? null,
      changePercent: entry?.changePercent ?? null,
      ts: now,
      source: "finnhub"
    };
  });

  return {
    updatedAt: now,
    source: "finnhub",
    quotes
  };
}

function resolveProviderChain(env) {
  const raw = String(env.QUOTES_PROVIDER || "").trim().toLowerCase();
  const supported = ["stooq", "finnhub", "fmp"];
  if (raw && !supported.includes(raw)) {
    return { ok: false, provider: raw, supported };
  }
  if (raw === "stooq") return { ok: true, provider: "stooq", chain: ["stooq", "finnhub"] };
  if (raw === "finnhub") return { ok: true, provider: "finnhub", chain: ["finnhub", "stooq"] };
  if (raw === "fmp") return { ok: true, provider: "fmp", chain: ["fmp", "finnhub", "stooq"] };
  return { ok: true, provider: "stooq", chain: ["stooq", "finnhub"] };
}

function providerAvailability(provider, env) {
  if (provider === "stooq") return { ok: true, missing: [] };
  if (provider === "finnhub") {
    return env.FINNHUB_API_KEY
      ? { ok: true, missing: [] }
      : { ok: false, missing: ["FINNHUB_API_KEY"] };
  }
  if (provider === "fmp") {
    return env.FMP_API_KEY ? { ok: true, missing: [] } : { ok: false, missing: ["FMP_API_KEY"] };
  }
  return { ok: false, missing: [] };
}

async function fetchStooqQuotes(symbols) {
  const stooqSymbols = symbols.map(mapToStooqSymbol);
  const upstreamUrl = `${STOOQ_BASE}?s=${stooqSymbols.join(",")}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(upstreamUrl);
  const text = await res.text();
  const snippet = safeSnippet(text);
  if (!res.ok) {
    return { ok: false, status: res.status, snippet, upstream: "stooq" };
  }

  const rows = parseStooqCsv(text);
  if (!rows.length) {
    return { ok: false, status: 502, snippet, upstream: "stooq" };
  }

  const lookup = new Map(
    rows.map((row) => [String(row.Symbol || "").toUpperCase(), row])
  );
  const stooqLookup = new Map(
    symbols.map((symbol) => [symbol, String(mapToStooqSymbol(symbol)).toUpperCase()])
  );
  const data = normalizeStooq(lookup, symbols, stooqLookup);
  return { ok: true, status: res.status, data, snippet, upstream: "stooq" };
}

async function fetchFinnhubQuotes(symbols, env) {
  const token = env.FINNHUB_API_KEY;
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const url = `${FINNHUB_BASE}?symbol=${encodeURIComponent(symbol)}&token=${token}`;
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) {
          return {
            symbol,
            ok: false,
            status: res.status,
            snippet: safeSnippet(text)
          };
        }
        let json;
        try {
          json = text ? JSON.parse(text) : {};
        } catch (error) {
          return {
            symbol,
            ok: false,
            status: 502,
            snippet: safeSnippet(text)
          };
        }
        return {
          symbol,
          ok: true,
          status: res.status,
          price: Number.isFinite(json.c) ? json.c : null,
          changePercent: Number.isFinite(json.dp) ? json.dp : null,
          snippet: ""
        };
      } catch (error) {
        return {
          symbol,
          ok: false,
          status: 502,
          snippet: safeSnippet(error?.message || "Request failed")
        };
      }
    })
  );

  const failures = results.filter((entry) => !entry.ok);
  const successes = results.filter((entry) => entry.ok && entry.price !== null);
  const status = failures[0]?.status ?? 200;
  const snippet = failures[0]?.snippet || "";

  if (!successes.length) {
    return {
      ok: false,
      status,
      snippet,
      upstream: "finnhub",
      legacy: isLegacyEndpoint(status, snippet)
    };
  }

  const data = normalizeFinnhub(results, symbols);
  return { ok: true, status: 200, data, snippet, upstream: "finnhub" };
}

async function fetchFmpQuotes(symbols, env) {
  const apiKey = env.FMP_API_KEY;
  const upstreamUrl = `${FMP_BASE}/${symbols.join(",")}?apikey=${apiKey}`;
  const res = await fetch(upstreamUrl);
  const text = await res.text();
  const snippet = safeSnippet(text);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      snippet,
      upstream: "financialmodelingprep",
      legacy: isLegacyEndpoint(res.status, text)
    };
  }

  let json;
  try {
    json = text ? JSON.parse(text) : [];
  } catch (error) {
    return { ok: false, status: 502, snippet, upstream: "financialmodelingprep" };
  }

  const data = normalizeFmp(json, symbols);
  return { ok: true, status: res.status, data, snippet, upstream: "financialmodelingprep" };
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

  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") || url.searchParams.get("tickers") || "";
  const { symbols, errorResponse } = normalizeSymbolsParam(symbolsParam, {
    feature: FEATURE_ID,
    traceId,
    ttl: 0
  });
  if (errorResponse) {
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return errorResponse;
  }

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    const resetAt = new Date(Date.now() + rateState.resetMs).toISOString();
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: 429, snippet: "" },
      rateLimit: {
        remaining: "0",
        reset: resetAt,
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

  const providerInfo = resolveProviderChain(env);
  if (!providerInfo.ok) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "Quotes provider not supported",
        details: { provider: providerInfo.provider, supported: providerInfo.supported }
      },
      status: 400
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

  const providerErrors = [];
  const availableProviders = providerInfo.chain.filter((provider) => {
    const availability = providerAvailability(provider, env);
    if (!availability.ok) {
      providerErrors.push({ provider, missing: availability.missing, reason: "ENV_MISSING" });
    }
    return availability.ok;
  });

  if (!availableProviders.length) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "Quotes provider key missing",
        details: { providers: providerErrors }
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

  const cacheKey = `quotes:${symbols.join(",")}`;

  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.hit && cached.value?.data) {
      const response = makeResponse({
        ok: true,
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

  let result = null;

  for (const provider of availableProviders) {
    if (provider === "stooq") {
      result = await fetchStooqQuotes(symbols);
    } else if (provider === "finnhub") {
      result = await fetchFinnhubQuotes(symbols, env);
    } else if (provider === "fmp") {
      result = await fetchFmpQuotes(symbols, env);
    } else {
      result = { ok: false, status: 502, snippet: "", upstream: provider };
    }

    if (result.ok) {
      break;
    }

    providerErrors.push({
      provider,
      status: result.status,
      legacy: Boolean(result.legacy)
    });

    if (result.legacy || provider !== availableProviders[availableProviders.length - 1]) {
      continue;
    }
  }

  if (result?.ok) {
    const kvPayload = {
      ts: new Date().toISOString(),
      source: result.data.source,
      schemaVersion: 1,
      data: result.data
    };

    if (!panic) {
      await kvPutJson(env, cacheKey, kvPayload, KV_TTL);
    }

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: result.data,
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: result.upstream, status: result.status, snippet: result.snippet }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: result.status,
      durationMs: Date.now() - started
    });
    return response;
  }

  const cached = !panic ? await kvGetJson(env, cacheKey) : null;
  if (cached?.hit && cached.value?.data) {
    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: cached.value.data,
      cache: { hit: true, ttl: KV_TTL, layer: "kv" },
      upstream: {
        url: result?.upstream || "",
        status: result?.status ?? null,
        snippet: result?.snippet || ""
      },
      error: { code: mapUpstreamCode(result?.status ?? 502), message: "Upstream error", details: {} },
      isStale: true
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "kv",
      upstreamStatus: result?.status ?? null,
      durationMs: Date.now() - started
    });
    return response;
  }

  const status = result?.status ?? 502;
  const response = makeResponse({
    ok: false,
    feature: FEATURE_ID,
    traceId,
    cache: { hit: false, ttl: 0, layer: "none" },
    upstream: { url: result?.upstream || "", status, snippet: result?.snippet || "" },
    error: {
      code: mapUpstreamCode(status),
      message: `Upstream ${status}`,
      details: { providers: providerErrors }
    },
    status: status === 429 ? 429 : 502
  });
  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: "none",
    upstreamStatus: status,
    durationMs: Date.now() - started
  });
  return response;
}
