import { jsonResponse, makeJson, safeSnippet, logServer } from "../_shared.js";

function nowIso() {
  return new Date().toISOString();
}

function createTraceId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    // ignore
  }
  return Math.random().toString(36).slice(2, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultValidator(data) {
  if (Array.isArray(data)) {
    return { passed: data.length > 0 };
  }
  if (data && typeof data === "object") {
    return { passed: Object.keys(data).length > 0 };
  }
  return { passed: false, failReason: "EMPTY_DATA" };
}

function isDataEmpty(data) {
  if (!data || typeof data !== "object") return true;
  if (Array.isArray(data)) return data.length === 0;
  return Object.keys(data).length === 0;
}

function enforceEnvelope(response) {
  const next = response || {};
  const meta = next.meta || {};
  if (!meta.status) {
    meta.status = "EMPTY";
    meta.reason = meta.reason || "MISSING_STATUS";
    next.ok = false;
  }
  const dataEmpty = isDataEmpty(next.data);
  if (meta.status === "LIVE" && dataEmpty) {
    meta.status = "EMPTY";
    meta.reason = "LIVE_WITHOUT_DATA";
    next.ok = false;
    if (!next.error || !next.error.code) {
      next.error = { code: "LIVE_WITHOUT_DATA", message: "Live response without data" };
    }
  }
  if (meta.status === "STALE" && dataEmpty) {
    meta.status = "EMPTY";
    meta.reason = "NO_LASTGOOD_AVAILABLE";
    next.ok = false;
    if (!next.error || !next.error.code) {
      next.error = { code: "NO_LASTGOOD_AVAILABLE", message: "Stale response without data" };
    }
  }
  next.meta = meta;
  return next;
}

function parseSavedAt(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function ageMinutes(savedAtMs) {
  if (!Number.isFinite(savedAtMs)) return null;
  const diffMs = Date.now() - savedAtMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.round(diffMs / 60000);
}

function normalizeFetcherResult(result) {
  if (result && typeof result === "object" && "data" in result) {
    return result;
  }
  return { data: result, upstreamStatus: null, upstreamUrl: "", snippet: "" };
}

function mapRetryable(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  const status = error.status ?? error.statusCode ?? null;
  if (typeof status === "number" && status >= 500) return true;
  if (error.code === "UPSTREAM_5XX" || error.code === "UPSTREAM_TIMEOUT") return true;
  return false;
}

function mapCircuitStatus(error) {
  const status = error?.status ?? error?.statusCode ?? null;
  if (status === 403 || status === 429) return status;
  if (error?.code === "UPSTREAM_403") return 403;
  if (error?.code === "RATE_LIMITED" || error?.code === "UPSTREAM_429") return 429;
  return null;
}

export async function withResilience(context, cfg) {
  const { request, env } = context;
  const traceId = createTraceId();
  const url = new URL(request.url);
  const hostname = url.hostname || "";
  const isPreview =
    env?.ENV_HINT === "preview" ||
    hostname.includes("pages.dev") ||
    (env?.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== "main");
  const isDebug = url.searchParams.get("debug") === "1";
  const KV = env?.RV_KV || null;
  const featureId = cfg.featureId || "unknown";
  const version = cfg.version || "v1";
  const lastGoodKey = `rv:lastgood:${featureId}:${version}`;
  const circuitKey = `rv:circuit:${featureId}:${version}`;
  const nowMs = Date.now();
  const timings = { kv: 0, fetch: 0, total: 0 };

  let lastGood = null;
  let circuitOpen = false;
  let lastGoodValid = false;
  let lastGoodQuality = { passed: false, failReason: "NO_DATA_YET" };
  let savedAtMs = null;

  const kvStart = Date.now();
  if (KV) {
    try {
      lastGood = await KV.get(lastGoodKey, { type: "json" });
      circuitOpen = (await KV.get(circuitKey)) != null;
    } catch (error) {
      lastGood = null;
      circuitOpen = false;
    }
  }
  timings.kv = Date.now() - kvStart;

  if (lastGood?.data) {
    const validator = cfg.validator || defaultValidator;
    lastGoodQuality = validator(lastGood.data);
    lastGoodValid = Boolean(lastGoodQuality?.passed);
    savedAtMs = parseSavedAt(lastGood?.meta?.savedAt);
  }

  const meta = {
    status: "EMPTY",
    savedAt: savedAtMs ? new Date(savedAtMs).toISOString() : null,
    ageMinutes: ageMinutes(savedAtMs),
    traceId,
    circuitOpen: Boolean(circuitOpen),
    reason: null
  };

  if (isPreview || circuitOpen) {
    if (lastGoodValid) {
      meta.status = "STALE";
      meta.reason = isPreview ? "PREVIEW" : "CIRCUIT_OPEN";
      const payload = makeJson({
        ok: true,
        feature: featureId,
        traceId,
        data: lastGood.data,
        cache: { hit: true, ttl: cfg.ttlStaleSec, layer: "kv" },
        upstream: { url: cfg.upstreamUrl || "", status: null, snippet: "" },
        error: {},
        isStale: true
      });
      const response = { ...payload, meta };
      if (isDebug) {
        response.debug = {
          upstreamStatus: null,
          quality: lastGoodQuality,
          timingsMs: { kv: timings.kv, fetch: 0, total: Date.now() - nowMs }
        };
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - nowMs,
        errorCode: meta.reason || ""
      });
      return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "STALE" });
    }

    meta.status = "EMPTY";
    meta.reason = isPreview ? "PREVIEW" : "CIRCUIT_OPEN";
    const error = {
      code: "NO_DATA_YET",
      message: "No cached data available"
    };
    const payload = makeJson({
      ok: false,
      feature: featureId,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: cfg.upstreamUrl || "", status: null, snippet: "" },
      error
    });
    const response = { ...payload, meta };
    if (isDebug) {
      response.debug = {
        upstreamStatus: null,
        quality: lastGoodQuality,
        timingsMs: { kv: timings.kv, fetch: 0, total: Date.now() - nowMs }
      };
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - nowMs,
      errorCode: error.code
    });
    return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "ERROR" });
  }

  let fetchResult = null;
  let fetchError = null;
  let upstreamStatus = null;
  let upstreamUrl = cfg.upstreamUrl || "";
  let upstreamSnippet = "";
  let retryOnce = false;

  const runFetch = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await cfg.fetcher({
        signal: controller.signal,
        env,
        request,
        lastGood: lastGood?.data || null
      });
      return normalizeFetcherResult(res);
    } finally {
      clearTimeout(timeout);
    }
  };

  const fetchStart = Date.now();
  try {
    fetchResult = await runFetch();
    upstreamStatus = fetchResult?.upstreamStatus ?? null;
    upstreamUrl = fetchResult?.upstreamUrl || upstreamUrl;
    upstreamSnippet = fetchResult?.snippet || "";
  } catch (error) {
    fetchError = error;
    retryOnce = mapRetryable(error);
  }

  if (retryOnce) {
    await sleep(800);
    try {
      fetchResult = await runFetch();
      fetchError = null;
      upstreamStatus = fetchResult?.upstreamStatus ?? null;
      upstreamUrl = fetchResult?.upstreamUrl || upstreamUrl;
      upstreamSnippet = fetchResult?.snippet || "";
    } catch (error) {
      fetchError = error;
    }
  }
  timings.fetch = Date.now() - fetchStart;

  if (fetchError) {
    const circuitStatus = mapCircuitStatus(fetchError);
    if (KV && circuitStatus) {
      try {
        await KV.put(circuitKey, "1", { expirationTtl: cfg.circuitSec });
        meta.circuitOpen = true;
      } catch (error) {
        // ignore
      }
    }

    if (lastGoodValid) {
      meta.status = "STALE";
      meta.reason = "UPSTREAM_FAIL";
      const payload = makeJson({
        ok: true,
        feature: featureId,
        traceId,
        data: lastGood.data,
        cache: { hit: true, ttl: cfg.ttlStaleSec, layer: "kv" },
        upstream: { url: upstreamUrl, status: upstreamStatus, snippet: safeSnippet(fetchError?.message || "") },
        error: {
          code: fetchError?.code || "UPSTREAM_FAIL",
          message: fetchError?.message || "Upstream failed"
        },
        isStale: true
      });
      const response = { ...payload, meta };
      if (isDebug) {
        response.debug = {
          upstreamStatus,
          quality: lastGoodQuality,
          timingsMs: { kv: timings.kv, fetch: timings.fetch, total: Date.now() - nowMs }
        };
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus,
        durationMs: Date.now() - nowMs,
        errorCode: fetchError?.code || "UPSTREAM_FAIL"
      });
      return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "STALE" });
    }

    meta.status = "EMPTY";
    meta.reason = "UPSTREAM_MISSING";
    const payload = makeJson({
      ok: false,
      feature: featureId,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: safeSnippet(fetchError?.message || "") },
      error: {
        code: fetchError?.code || "UPSTREAM_MISSING",
        message: fetchError?.message || "Upstream missing"
      }
    });
    const response = { ...payload, meta };
    if (isDebug) {
      response.debug = {
        upstreamStatus,
        quality: lastGoodQuality,
        timingsMs: { kv: timings.kv, fetch: timings.fetch, total: Date.now() - nowMs }
      };
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - nowMs,
      errorCode: fetchError?.code || "UPSTREAM_MISSING"
    });
    return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "ERROR" });
  }

  const validator = cfg.validator || defaultValidator;
  const quality = validator(fetchResult?.data);
  if (!quality?.passed) {
    meta.status = "STALE";
    meta.reason = "QUALITY_FAIL";
    if (lastGoodValid) {
      const payload = makeJson({
        ok: true,
        feature: featureId,
        traceId,
        data: lastGood.data,
        cache: { hit: true, ttl: cfg.ttlStaleSec, layer: "kv" },
        upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
        error: {
          code: "QUALITY_FAIL",
          message: quality?.failReason || "Validator failed"
        },
        isStale: true
      });
      const response = { ...payload, meta };
      if (isDebug) {
        response.debug = {
          upstreamStatus,
          quality,
          timingsMs: { kv: timings.kv, fetch: timings.fetch, total: Date.now() - nowMs }
        };
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus,
        durationMs: Date.now() - nowMs,
        errorCode: "QUALITY_FAIL"
      });
      return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "STALE" });
    }

    meta.status = "EMPTY";
    meta.reason = "EMPTY_DATA";
    const payload = makeJson({
      ok: false,
      feature: featureId,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
      error: {
        code: "EMPTY_DATA",
        message: quality?.failReason || "Validator failed"
      }
    });
    const response = { ...payload, meta };
    if (isDebug) {
      response.debug = {
        upstreamStatus,
        quality,
        timingsMs: { kv: timings.kv, fetch: timings.fetch, total: Date.now() - nowMs }
      };
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - nowMs,
      errorCode: "EMPTY_DATA"
    });
    return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "ERROR" });
  }

  let writeSavedAt = lastGood?.meta?.savedAt || null;
  const lastSavedMs = parseSavedAt(writeSavedAt);
  const shouldWrite =
    !Number.isFinite(lastSavedMs) || nowMs - lastSavedMs >= 60000;

  if (KV && shouldWrite) {
    try {
      writeSavedAt = nowIso();
      await KV.put(
        lastGoodKey,
        JSON.stringify({ data: fetchResult.data, meta: { savedAt: writeSavedAt } }),
        { expirationTtl: cfg.ttlStaleSec }
      );
    } catch (error) {
      // ignore write failures
    }
  }

  meta.status = "LIVE";
  meta.reason = null;
  meta.savedAt = writeSavedAt || nowIso();
  meta.ageMinutes = ageMinutes(parseSavedAt(meta.savedAt));

  const payload = makeJson({
    ok: true,
    feature: featureId,
    traceId,
    data: fetchResult.data,
    cache: { hit: false, ttl: cfg.ttlStaleSec, layer: "none" },
    upstream: { url: upstreamUrl, status: upstreamStatus ?? 200, snippet: upstreamSnippet },
    error: {}
  });
  const response = { ...payload, meta };
  if (isDebug) {
    response.debug = {
      upstreamStatus: upstreamStatus ?? null,
      quality,
      timingsMs: { kv: timings.kv, fetch: timings.fetch, total: Date.now() - nowMs }
    };
  }
  logServer({
    feature: featureId,
    traceId,
    cacheLayer: "none",
    upstreamStatus: upstreamStatus ?? 200,
    durationMs: Date.now() - nowMs,
    errorCode: ""
  });
  return jsonResponse(enforceEnvelope(response), { status: 200, cacheStatus: "MISS" });
}
