import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet,
  safeFetchJson
} from "./_shared.js";

const FEATURE_ID = "earnings-calendar";
const KV_TTL = 3600;
const FINNHUB_BASE = "https://finnhub.io/api/v1/calendar/earnings";

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

function classifySurprise(actual, estimate) {
  const actualNum = Number(actual);
  const estimateNum = Number(estimate);
  if (!Number.isFinite(actualNum) || !Number.isFinite(estimateNum)) return null;
  if (Math.abs(actualNum - estimateNum) < 1e-6) return "inline";
  return actualNum > estimateNum ? "beat" : "miss";
}

function deriveSentiment(epsResult, revenueResult) {
  const signals = [epsResult, revenueResult].filter(Boolean);
  if (!signals.length) return "unknown";
  if (signals.every((value) => value === "beat")) return "positive";
  if (signals.every((value) => value === "miss")) return "negative";
  if (signals.includes("beat") && signals.includes("miss")) return "mixed";
  if (signals.includes("beat")) return "slightly_positive";
  if (signals.includes("miss")) return "slightly_negative";
  return "neutral";
}

function normalizeFinnhub(payload) {
  const list = Array.isArray(payload?.earningsCalendar) ? payload.earningsCalendar : [];
  const items = list
    .filter((entry) => entry?.symbol && entry?.date)
    .map((entry) => {
      const epsResult = classifySurprise(entry.epsActual, entry.epsEstimate);
      const revenueResult = classifySurprise(entry.revenueActual, entry.revenueEstimate);
      return {
        symbol: entry.symbol,
        company: entry.company || null,
        date: entry.date,
        time: entry.hour || entry.time || null,
        epsEst: entry.epsEstimate ?? null,
        epsActual: entry.epsActual ?? null,
        epsResult,
        revenueEst: entry.revenueEstimate ?? null,
        revenueActual: entry.revenueActual ?? null,
        revenueResult,
        sentiment: deriveSentiment(epsResult, revenueResult),
        ts: new Date().toISOString(),
        source: "finnhub"
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 30);

  return {
    updatedAt: new Date().toISOString(),
    source: "finnhub",
    items
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const url = new URL(request.url);
  const panic =
    request.headers.get("x-rv-panic") === "1" || url.searchParams.get("rv_panic") === "1";

  const bindingResponse = assertBindings(env, FEATURE_ID, traceId);
  if (bindingResponse) {
    return bindingResponse;
  }

  const provider = (env.EARNINGS_PROVIDER || "finnhub").toLowerCase();
  if (provider !== "finnhub") {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "BAD_REQUEST",
        message: "Earnings provider not supported",
        details: { provider, supported: ["finnhub"] }
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

  if (!env.FINNHUB_API_KEY) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "FINNHUB_API_KEY missing",
        details: { missing: ["FINNHUB_API_KEY"] }
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

  const daysParam = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 30;
  const from = formatDate(new Date());
  const to = formatDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  const upstreamUrl = `${FINNHUB_BASE}?from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`;
  let upstreamStatus = null;
  let upstreamSnippet = "";

  try {
    const res = await safeFetchJson(upstreamUrl, { userAgent: env.USER_AGENT || "RubikVault/1.0" });
    upstreamStatus = res.status;
    upstreamSnippet = safeSnippet(res.snippet || "");

    if (!res.ok || !res.json) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const errorCode = mapUpstreamCode(res.status || 502);
      if (cached?.hit && cached.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.value.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: FINNHUB_BASE, status: res.status, snippet: upstreamSnippet },
          error: { code: errorCode, message: `Upstream ${res.status || "error"}`, details: {} },
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
        upstream: { url: FINNHUB_BASE, status: res.status, snippet: upstreamSnippet },
        error: { code: errorCode, message: `Upstream ${res.status || "error"}`, details: {} }
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

    const dataPayload = normalizeFinnhub(res.json);
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
      upstream: { url: FINNHUB_BASE, status: res.status, snippet: upstreamSnippet }
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
      upstream: { url: FINNHUB_BASE, status: upstreamStatus, snippet: upstreamSnippet },
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
