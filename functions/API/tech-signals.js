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

const FEATURE_ID = "tech-signals";
const KV_TTL = 1800;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateStore = new Map();

function mapToStooq(symbol) {
  if (symbol === "BTC-USD") return "BTC.V";
  if (symbol === "ETH-USD") return "ETH.V";
  if (symbol.includes(".")) return symbol;
  return `${symbol}.US`;
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

function computeRsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function movingAverage(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
}

function classifyRsi(value) {
  if (value === null) return "Unknown";
  if (value < 30) return "Oversold";
  if (value > 70) return "Overbought";
  return "Neutral";
}

function classifyMa(ma20, ma50) {
  if (ma20 === null || ma50 === null) return "Unknown";
  if (ma20 > ma50) return "Bullish";
  if (ma20 < ma50) return "Bearish";
  return "Neutral";
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return bindingResponse;
  }

  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols") || "";
  const { symbols, invalid, truncated } = normalizeSymbolsParam(symbolsParam);
  if (!symbols.length || invalid.length || truncated) {
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "symbols parameter invalid",
        details: { invalid, truncated }
      },
      status: 400
    });
  }

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: "none" },
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
  }

  const cacheKey = `${FEATURE_ID}:${symbols.join(",")}:v1`;
  if (!panic) {
    const cached = await kvGetJson(env, cacheKey);
    if (cached?.data) {
      const response = makeResponse({
        ok: true,
        feature: FEATURE_ID,
        traceId,
        data: cached.data,
        cache: { hit: true, ttl: KV_TTL, layer: "kv" },
        upstream: { url: "", status: null, snippet: "" }
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: "hit",
        upstreamStatus: null,
        durationMs: Date.now() - started
      });
      return response;
    }
  }

  const signals = [];
  const skipped = [];
  let upstreamSnippet = "";

  await Promise.all(
    symbols.map(async (symbol) => {
      const stooqSymbol = mapToStooq(symbol);
      const upstreamUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
      try {
        const res = await fetch(upstreamUrl);
        const text = await res.text();
        if (!res.ok) {
          upstreamSnippet = upstreamSnippet || safeSnippet(text);
          skipped.push({ symbol, reason: `upstream ${res.status}` });
          return;
        }
        const lines = text.trim().split("\n");
        if (lines.length < 3) {
          skipped.push({ symbol, reason: "insufficient history" });
          return;
        }
        const values = lines
          .slice(1)
          .map((line) => line.split(","))
          .filter((parts) => parts.length >= 5)
          .map((parts) => Number.parseFloat(parts[4]))
          .filter((value) => Number.isFinite(value));

        if (values.length < 50) {
          skipped.push({ symbol, reason: "insufficient history" });
          return;
        }

        const rsi = computeRsi(values, 14);
        const ma20 = movingAverage(values, 20);
        const ma50 = movingAverage(values, 50);
        signals.push({
          symbol,
          rsi,
          rsiLabel: classifyRsi(rsi),
          ma20,
          ma50,
          maRegime: classifyMa(ma20, ma50),
          ts: new Date().toISOString(),
          source: "stooq"
        });
      } catch (error) {
        skipped.push({ symbol, reason: "upstream error" });
      }
    })
  );

  if (!signals.length) {
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: { url: "stooq", status: null, snippet: upstreamSnippet },
      error: {
        code: "SCHEMA_VALID",
        message: "Insufficient history",
        details: { skipped }
      },
      status: 200
    });
  }

  const dataPayload = {
    updatedAt: new Date().toISOString(),
    source: "stooq",
    signals,
    skipped
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

  const response = makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: dataPayload,
    cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
    upstream: { url: "stooq", status: 200, snippet: upstreamSnippet },
    error: skipped.length
      ? {
          code: "SCHEMA_VALID",
          message: "Insufficient history for some symbols",
          details: { skipped }
        }
      : {}
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    kv: panic ? "bypass" : "miss",
    upstreamStatus: 200,
    durationMs: Date.now() - started
  });
  return response;
}
