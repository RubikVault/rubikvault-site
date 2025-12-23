import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";

const FEATURE_ID = "macro-rates";
const KV_TTL = 21600;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateStore = new Map();

const SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds" },
  { id: "CPIAUCSL", label: "CPI (All Urban)" },
  { id: "DGS10", label: "US 10Y" },
  { id: "DGS2", label: "US 2Y" }
];

function mapUpstreamCode(status) {
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "UPSTREAM_403";
  if (status >= 400 && status < 500) return "UPSTREAM_4XX";
  if (status >= 500) return "UPSTREAM_5XX";
  return "UPSTREAM_5XX";
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

function parseObservations(payload) {
  const list = Array.isArray(payload?.observations) ? payload.observations : [];
  const values = list
    .map((entry) => ({
      date: entry.date,
      value: entry.value
    }))
    .filter((entry) => entry.value !== ".")
    .map((entry) => ({
      date: entry.date,
      value: Number.parseFloat(entry.value)
    }))
    .filter((entry) => Number.isFinite(entry.value));

  if (values.length < 1) return null;
  const latest = values[0];
  const prior = values[1] || null;
  return {
    latest,
    prior
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
    logServer({ feature: FEATURE_ID, traceId, kv: "none", upstreamStatus: null, durationMs: 0 });
    return bindingResponse;
  }

  if (!env.FRED_API_KEY) {
    return makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      error: {
        code: "ENV_MISSING",
        message: "FRED_API_KEY missing",
        details: { missing: ["FRED_API_KEY"] }
      },
      status: 500
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

  const cacheKey = `${FEATURE_ID}:v1`;
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

  let upstreamSnippet = "";
  try {
    const responses = await Promise.all(
      SERIES.map(async (series) => {
        const upstreamUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
        const res = await fetch(upstreamUrl);
        const text = await res.text();
        if (!res.ok) {
          upstreamSnippet = upstreamSnippet || safeSnippet(text);
          return {
            ok: false,
            status: res.status,
            series,
            upstreamUrl
          };
        }
        let json;
        try {
          json = text ? JSON.parse(text) : {};
        } catch (error) {
          upstreamSnippet = upstreamSnippet || safeSnippet(text);
          return {
            ok: false,
            status: 502,
            series,
            upstreamUrl,
            schemaInvalid: true
          };
        }
        return { ok: true, series, upstreamUrl, payload: json, status: res.status };
      })
    );

    const items = [];
    const errors = [];
    responses.forEach((entry) => {
      if (!entry.ok) {
        errors.push({ id: entry.series.id, status: entry.status });
        return;
      }
      const parsed = parseObservations(entry.payload);
      if (!parsed) {
        errors.push({ id: entry.series.id, status: "no_data" });
        return;
      }
      const change = parsed.prior ? parsed.latest.value - parsed.prior.value : null;
      items.push({
        seriesId: entry.series.id,
        label: entry.series.label,
        value: parsed.latest.value,
        change,
        date: parsed.latest.date,
        source: "fred"
      });
    });

    if (!items.length) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const errorCode = errors.find((entry) => entry.status === 429)
        ? "RATE_LIMITED"
        : errors.find((entry) => entry.status === 403)
          ? "UPSTREAM_403"
          : errors.find((entry) => Number(entry.status) >= 500)
            ? "UPSTREAM_5XX"
            : "UPSTREAM_4XX";

      if (cached?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.data,
          cache: { hit: true, ttl: KV_TTL, layer: "kv" },
          upstream: { url: "fred", status: null, snippet: upstreamSnippet },
          error: {
            code: errorCode,
            message: "No upstream data",
            details: { errors }
          },
          isStale: true
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

      return makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
        upstream: { url: "fred", status: null, snippet: upstreamSnippet },
        error: {
          code: errorCode,
          message: "No upstream data",
          details: { errors }
        },
        status: 502
      });
    }

    const dataPayload = {
      updatedAt: new Date().toISOString(),
      source: "fred",
      series: items
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

    const errorCode = errors.length
      ? errors.find((entry) => entry.status === 429)
        ? "RATE_LIMITED"
        : errors.find((entry) => entry.status === 403)
          ? "UPSTREAM_403"
          : errors.find((entry) => Number(entry.status) >= 500)
            ? "UPSTREAM_5XX"
            : "UPSTREAM_4XX"
      : "";

    const response = makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: dataPayload,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: { url: "fred", status: 200, snippet: upstreamSnippet },
      error: errors.length
        ? {
            code: errorCode,
            message: "Partial upstream data",
            details: { errors }
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
  } catch (error) {
    const errorCode = error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_5XX";
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: KV_TTL, layer: panic ? "none" : "kv" },
      upstream: { url: "fred", status: null, snippet: upstreamSnippet },
      error: { code: errorCode, message: error?.message || "Request failed", details: {} }
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      kv: panic ? "bypass" : "miss",
      upstreamStatus: null,
      durationMs: Date.now() - started
    });
    return response;
  }
}
