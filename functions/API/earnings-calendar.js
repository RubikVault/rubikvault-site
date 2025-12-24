import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "earnings-calendar";
const KV_TTL = 3600;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
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

  if (!env.EARNINGS_API_KEY) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "EARNINGS_API_KEY missing",
        details: { missing: ["EARNINGS_API_KEY"] }
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

  const cacheKey = `${FEATURE_ID}:v1`;
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
    upstreamSnippet = safeSnippet(text);

    if (!res.ok) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const errorCode = mapUpstreamCode(res.status);
      if (cached?.hit && cached.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.value.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
          error: { code: errorCode, message: `Upstream ${res.status}`, details: {} },
          isStale: true
        });
        logServer({
          feature: FEATURE_ID,
          traceId,
          cacheLayer: "kv",
          upstreamStatus: res.status,
          durationMs: Date.now() - started
        });
        return response;
      }

      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
        error: { code: errorCode, message: `Upstream ${res.status}`, details: {} },
        status: res.status === 429 ? 429 : 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return response;
    }

    let json;
    try {
      json = text ? JSON.parse(text) : [];
    } catch (error) {
      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet },
        error: { code: "SCHEMA_INVALID", message: "Invalid JSON", details: {} },
        status: 502
      });
      logServer({
        feature: FEATURE_ID,
        traceId,
        cacheLayer: "none",
        upstreamStatus: res.status,
        durationMs: Date.now() - started
      });
      return response;
    }

    const dataPayload = normalize(json);
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
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: upstreamUrl, status: res.status, snippet: upstreamSnippet }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: res.status,
      durationMs: Date.now() - started
    });
    return response;
  } catch (error) {
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
      error: { code: errorCode, message: error?.message || "Request failed", details: {} }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - started
    });
    return response;
  }
}
