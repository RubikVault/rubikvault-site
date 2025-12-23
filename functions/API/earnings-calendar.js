import { buildPayload, createTraceId, jsonResponse, logServer, truncate } from "./_shared.js";

const FEATURE_ID = "earnings-calendar";
const KV_TTL = 300;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalize(payload) {
  const items = Array.isArray(payload)
    ? payload.slice(0, 20).map((entry) => ({
        symbol: entry.symbol || "",
        company: entry.name || entry.company || "",
        date: entry.date || "",
        epsEst: entry.epsEstimated ?? entry.epsEst ?? null,
        epsActual: entry.eps ?? entry.epsActual ?? null,
        ts: new Date().toISOString(),
        source: "earnings"
      }))
    : [];

  return {
    updatedAt: new Date().toISOString(),
    source: "earnings",
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

  if (!env.EARNINGS_API_KEY) {
    const payload = buildPayload({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: "kv" },
      error: { code: "ENV_MISSING", message: "EARNINGS_API_KEY missing", details: {} }
    });
    logServer({ feature: FEATURE_ID, traceId, kv: "miss", upstreamStatus: null, durationMs: 0 });
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

  const base = env.EARNINGS_API_BASE || "https://financialmodelingprep.com/api/v3/earning_calendar";
  const from = formatDate(new Date());
  const to = formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const upstreamUrl = `${base}?from=${from}&to=${to}&apikey=${env.EARNINGS_API_KEY}`;
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

    const json = text ? JSON.parse(text) : [];
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
