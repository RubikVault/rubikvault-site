import { buildPayload, createTraceId, jsonResponse, logServer, truncate } from "./_shared.js";

const FEATURE_ID = "price-snapshot";
const KV_TTL = 90;
const UPSTREAM_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";

function normalize(payload) {
  const assets = [
    { key: "bitcoin", label: "Bitcoin", symbol: "BTC" },
    { key: "ethereum", label: "Ethereum", symbol: "ETH" },
    { key: "solana", label: "Solana", symbol: "SOL" }
  ].map((asset) => {
    const data = payload[asset.key] || {};
    return {
      symbol: asset.symbol,
      label: asset.label,
      price: data.usd ?? null,
      changePercent: data.usd_24h_change ?? null,
      ts: new Date().toISOString(),
      source: "coingecko"
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    source: "coingecko",
    assets
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
        upstream: { url: UPSTREAM_URL, status: null, snippet: "" }
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

  let upstreamStatus = null;
  let upstreamSnippet = "";

  try {
    const res = await fetch(UPSTREAM_URL);
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
          upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet },
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
        upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet },
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

    const json = text ? JSON.parse(text) : {};
    const data = normalize(json);
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
      upstream: { url: UPSTREAM_URL, status: res.status, snippet: upstreamSnippet }
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
      upstream: { url: UPSTREAM_URL, status: upstreamStatus, snippet: upstreamSnippet },
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
