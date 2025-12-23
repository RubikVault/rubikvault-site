import { buildPayload, createTraceId, jsonResponse, logServer, truncate } from "./_shared.js";

const FEATURE_ID = "quotes";
const KV_TTL = 90;

function normalize(csvText) {
  const lines = csvText.trim().split("\n");
  const quotes = {};

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 7) continue;

    const symbol = parts[0];
    const close = parseFloat(parts[6]);
    const open = parseFloat(parts[3]);
    if (Number.isNaN(close)) continue;

    let sym = symbol.replace(".US", "").replace(".V", "-USD");
    let changePercent = 0;
    if (!Number.isNaN(open) && open !== 0) {
      changePercent = ((close - open) / open) * 100;
    }

    quotes[sym] = {
      price: close,
      changePercent,
      ts: new Date().toISOString(),
      source: "stooq"
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "stooq",
    quotes
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

  const url = new URL(request.url);
  const tickersParam = url.searchParams.get("tickers") || "SPY";
  const cacheKey = `${FEATURE_ID}:${tickersParam.toUpperCase()}:v1`;

  if (!panic) {
    const cached = await env.RV_KV.get(cacheKey, "json");
    if (cached?.data) {
      const payload = buildPayload({
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
      return jsonResponse(payload);
    }
  }

  const stooqTickers = tickersParam
    .split(",")
    .map((ticker) => {
      const t = ticker.trim().toUpperCase();
      if (t === "BTC-USD") return "BTC.V";
      if (t === "ETH-USD") return "ETH.V";
      if (t.includes(".")) return t;
      return `${t}.US`;
    })
    .join("+");

  const upstreamUrl = `https://stooq.com/q/l/?s=${stooqTickers}&f=sd2t2ohlcv&h&e=csv`;
  let upstreamStatus = null;
  let upstreamSnippet = "";

  try {
    const res = await fetch(upstreamUrl);
    upstreamStatus = res.status;
    const text = await res.text();
    upstreamSnippet = truncate(text);

    if (!res.ok) {
      const cached = !panic ? await env.RV_KV.get(cacheKey, "json") : null;
      if (cached?.data) {
        const payload = buildPayload({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
          error: { code: "UPSTREAM_ERROR", message: `Upstream ${res.status}`, details: {} },
          isStale: true
        });
        logServer({
          feature: FEATURE_ID,
          traceId,
          kv: "hit",
          upstreamStatus: res.status,
          durationMs: Date.now() - started
        });
        return jsonResponse(payload, 200);
      }

      const payload = buildPayload({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
        upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
        error: { code: "UPSTREAM_ERROR", message: `Upstream ${res.status}`, details: {} }
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        kv: panic ? "bypass" : "miss",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return jsonResponse(payload, 502);
    }

    const data = normalize(text);
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
      upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus: res.status,
      durationMs: Date.now() - started
    });
    return jsonResponse(payload);
  } catch (error) {
    const payload = buildPayload({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
      error: { code: "UPSTREAM_EXCEPTION", message: error?.message || "Request failed", details: {} }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus,
      durationMs: Date.now() - started
    });
    return jsonResponse(payload, 502);
  }
}
