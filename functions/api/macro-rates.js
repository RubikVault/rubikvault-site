import {
  assertBindings,
  createTraceId,
  kvGetJson,
  kvPutJson,
  logServer,
  makeResponse,
  safeSnippet
} from "./_shared.js";
import { CPI_SERIES } from "./_shared/macroSeries.js";

const FEATURE_ID = "macro-rates";
const KV_TTL = 21600;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const rateStore = new Map();
const CPI_TTL_SECONDS = 12 * 60 * 60;
const CPI_TTL_MS = CPI_TTL_SECONDS * 1000;

const SERIES = [
  { id: "FEDFUNDS", label: "Fed Funds", group: "rates", region: "US" },
  { id: "DGS1", label: "US 1Y", group: "rates", region: "US" },
  { id: "DGS2", label: "US 2Y", group: "rates", region: "US" },
  { id: "DGS3", label: "US 3Y", group: "rates", region: "US" },
  { id: "DGS5", label: "US 5Y", group: "rates", region: "US" },
  { id: "DGS10", label: "US 10Y", group: "rates", region: "US" },
  { id: "DGS20", label: "US 20Y", group: "rates", region: "US" },
  { id: "DGS30", label: "US 30Y", group: "rates", region: "US" }
];

const FX_SYMBOLS = [
  { symbol: "DX-Y.NYB", label: "DXY", region: "Global" },
  { symbol: "EURUSD=X", label: "EURUSD", region: "Global" },
  { symbol: "GBPUSD=X", label: "GBPUSD", region: "Global" },
  { symbol: "JPY=X", label: "USDJPY", region: "Global" }
];
const FX_URL = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
  FX_SYMBOLS.map((entry) => entry.symbol).join(",")
)}`;

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

async function fetchCpiSeries(env, series, { panic, hasFred }) {
  const cacheKey = `macro-cpi:${series.id}`;
  const cached = await kvGetJson(env, cacheKey);
  if (cached?.hit && cached.value?.data) {
    const cachedTs = Date.parse(cached.value.ts || cached.value.data?.asOf || "");
    const ageMs = Number.isFinite(cachedTs) ? Date.now() - cachedTs : null;
    if (ageMs === null || ageMs < CPI_TTL_MS) {
      return { ...cached.value.data, cached: true };
    }
  }

  if (!hasFred) {
    return {
      seriesId: series.id,
      label: series.label,
      value: null,
      change: null,
      changePercent: null,
      date: null,
      asOf: null,
      source: "fred",
      group: "inflation",
      region: series.region,
      cached: false,
      missing: true
    };
  }

  const upstreamUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
  const res = await fetch(upstreamUrl);
  const text = await res.text();
  if (!res.ok) {
    return {
      seriesId: series.id,
      label: series.label,
      value: null,
      change: null,
      changePercent: null,
      date: null,
      asOf: null,
      source: "fred",
      group: "inflation",
      region: series.region,
      cached: false,
      error: `upstream ${res.status}`
    };
  }
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    return {
      seriesId: series.id,
      label: series.label,
      value: null,
      change: null,
      changePercent: null,
      date: null,
      asOf: null,
      source: "fred",
      group: "inflation",
      region: series.region,
      cached: false,
      error: "parse"
    };
  }

  const obs = parseObservations(json);
  const latest = obs?.latest || null;
  const prior = obs?.prior || null;
  const change = latest && prior ? latest.value - prior.value : null;
  const payload = {
    seriesId: series.id,
    label: series.label,
    value: latest?.value ?? null,
    change,
    changePercent: null,
    date: latest?.date || null,
    asOf: latest?.date || null,
    source: "fred",
    group: "inflation",
    region: series.region,
    cached: false
  };

  if (!panic) {
    const kvPayload = {
      ts: new Date().toISOString(),
      source: "fred",
      schemaVersion: 1,
      data: payload
    };
    await kvPutJson(env, cacheKey, kvPayload, CPI_TTL_SECONDS);
  }

  return payload;
}

function normalizeFx(payload) {
  const results = payload?.quoteResponse?.result || [];
  const map = new Map(results.map((quote) => [quote.symbol, quote]));
  return FX_SYMBOLS.map((entry) => {
    const quote = map.get(entry.symbol) || {};
    return {
      seriesId: entry.symbol,
      label: entry.label,
      value: quote.regularMarketPrice ?? null,
      change: null,
      changePercent: quote.regularMarketChangePercent ?? null,
      date: new Date().toISOString().slice(0, 10),
      source: "yahoo",
      group: "fx",
      region: entry.region
    };
  });
}

function groupBy(items, group) {
  return items.filter((item) => item.group === group);
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();
  const panic =
    request.headers.get("x-rv-panic") === "1" ||
    new URL(request.url).searchParams.get("rv_panic") === "1";

  const bind = assertBindings(env, FEATURE_ID, traceId, { kv: "optional" });
  const bindingResponse = bind?.bindingResponse || null;
  if (bindingResponse) {
    return bindingResponse;
  }

  const hasFred = Boolean(env.FRED_API_KEY);

  const rateKey = request.headers.get("CF-Connecting-IP") || "global";
  const rateState = getRateState(rateKey);
  if (rateState.limited) {
    const response = makeResponse({
      ok: false,
      feature: FEATURE_ID,
      traceId,
      cache: { hit: false, ttl: 0, layer: "none" },
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
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
      upstreamStatus: 429,
      durationMs: Date.now() - started
    });
    return response;
  }

  const cacheKey = `${FEATURE_ID}:v2`;
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

  let upstreamSnippet = "";
  try {
    const items = [];
    const errors = [];

    if (hasFred) {
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
          changePercent: null,
          date: parsed.latest.date,
          source: "fred",
          group: entry.series.group,
          region: entry.series.region
        });
      });
    } else {
      errors.push({ id: "FRED_API_KEY", status: "missing" });
    }

    const cpiSeries = await Promise.all(
      CPI_SERIES.map((series) => fetchCpiSeries(env, series, { panic, hasFred }))
    );
    cpiSeries.forEach((entry) => {
      if (!entry) return;
      items.push(entry);
      if (entry.missing || entry.error) {
        errors.push({ id: entry.seriesId, status: entry.error || "missing" });
      }
    });

    let fxItems = [];
    try {
      const fxRes = await fetch(FX_URL);
      const fxText = await fxRes.text();
      if (fxRes.ok) {
        const fxJson = fxText ? JSON.parse(fxText) : {};
        fxItems = normalizeFx(fxJson);
      } else if (!upstreamSnippet) {
        upstreamSnippet = safeSnippet(fxText);
      }
    } catch (error) {
      // ignore FX errors
    }

    const combined = items.concat(fxItems);
    const cpiPayload = cpiSeries.map((entry) => ({
      region: entry.region,
      label: entry.label,
      value: entry.value ?? null,
      date: entry.date || null,
      asOf: entry.asOf || entry.date || null,
      source: entry.source || "fred"
    }));

    if (!combined.length) {
      const cached = !panic ? await kvGetJson(env, cacheKey) : null;
      const errorCode = !hasFred
        ? "ENV_MISSING"
        : errors.find((entry) => entry.status === 429)
          ? "RATE_LIMITED"
          : errors.find((entry) => entry.status === 403)
            ? "UPSTREAM_403"
            : errors.find((entry) => Number(entry.status) >= 500)
              ? "UPSTREAM_5XX"
              : "UPSTREAM_4XX";

      if (cached?.hit && cached.value?.data) {
        const response = makeResponse({
          ok: true,
          feature: FEATURE_ID,
          traceId,
          data: cached.value.data,
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
          cacheLayer: "kv",
          upstreamStatus: null,
          durationMs: Date.now() - started
        });
        return response;
      }

      const response = makeResponse({
        ok: false,
        feature: FEATURE_ID,
        traceId,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url: "fred", status: null, snippet: upstreamSnippet },
        error: {
          code: errorCode,
          message: !hasFred ? "FRED_API_KEY missing" : "No upstream data",
          details: !hasFred ? { missing: ["FRED_API_KEY"] } : { errors }
        },
        status: 502
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

    const dataPayload = {
      updatedAt: new Date().toISOString(),
      source: hasFred ? "fred, yahoo" : "yahoo",
      series: combined,
      cpi: cpiPayload,
      groups: {
        rates: groupBy(combined, "rates"),
        inflation: groupBy(combined, "inflation"),
        fx: groupBy(combined, "fx")
      }
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
      cache: { hit: false, ttl: panic ? 0 : KV_TTL, layer: "none" },
      upstream: { url: "fred | yahoo", status: 200, snippet: upstreamSnippet },
      error: !hasFred
        ? {
            code: "ENV_MISSING",
            message: "FRED_API_KEY missing",
            details: { missing: ["FRED_API_KEY"] }
          }
        : errors.length
          ? {
              code: mapUpstreamCode(errors[0]?.status || 502),
              message: "Some upstreams failed",
              details: { errors }
            }
          : {}
    });
    logServer({
      feature: FEATURE_ID,
      traceId,
      cacheLayer: "none",
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
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "fred | yahoo", status: null, snippet: upstreamSnippet },
      error: {
        code: errorCode,
        message: error?.message || "Request failed",
        details: {}
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
}
