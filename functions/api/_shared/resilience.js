import { jsonResponse, makeJson, safeSnippet, logServer } from "../_shared.js";

const ALLOW_EMPTY_FEATURES = new Set();

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

function isHtmlLike(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
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

function enforceEnvelope(response, { allowEmptyData = false, lastGoodData = null, hasLastGood = false } = {}) {
  const next = response || {};
  const meta = next.meta || {};
  if (!meta.ts) meta.ts = nowIso();
  if (!meta.schemaVersion) meta.schemaVersion = 1;
  if (!Array.isArray(meta.warnings)) meta.warnings = [];
  if (typeof meta.reason !== "string") {
    meta.reason = meta.reason == null ? "" : String(meta.reason);
  }
  if (!meta.status) {
    meta.status = "EMPTY";
    meta.reason = meta.reason || "MISSING_STATUS";
    next.ok = false;
  }
  const dataEmpty = isDataEmpty(next.data);
  if (meta.status === "LIVE" && dataEmpty && !allowEmptyData) {
    meta.warnings.push("EMPTY_LIVE_GUARD");
    if (hasLastGood && lastGoodData) {
      meta.status = "STALE";
      meta.reason = meta.reason || "EMPTY_LIVE_GUARD";
      next.data = lastGoodData;
      next.ok = true;
    } else {
      meta.status = "EMPTY";
      meta.reason = meta.reason || "NO_DATA_YET";
      next.ok = false;
      if (!next.error || !next.error.code) {
        next.error = { code: "LIVE_WITHOUT_DATA", message: "Live response without data" };
      }
    }
  }
  if (meta.status === "STALE" && dataEmpty) {
    meta.warnings.push("STALE_WITHOUT_DATA");
    if (hasLastGood && lastGoodData) {
      next.data = lastGoodData;
      next.ok = true;
    } else {
      meta.status = "EMPTY";
      meta.reason = meta.reason || "NO_LASTGOOD_AVAILABLE";
      next.ok = false;
      if (!next.error || !next.error.code) {
        next.error = { code: "NO_LASTGOOD_AVAILABLE", message: "Stale response without data" };
      }
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

function computeAllowWrites(request, env) {
  if (env?.RV_ALLOW_WRITE_ON_VIEW === "1") return true;
  const token = env?.RV_CRON_TOKEN || "";
  if (!token) return false;
  const auth = request?.headers?.get("authorization") || "";
  const cronHeader = request?.headers?.get("x-rv-cron") || "";
  const cronTokenHeader = request?.headers?.get("x-rv-cron-token") || "";
  return (
    auth === `Bearer ${token}` ||
    (cronHeader === "1" && cronTokenHeader === token)
  );
}

function resolveHttpStatus(payload) {
  return payload?.ok === false ? 503 : 200;
}

async function loadMirrorPayload(origin, featureId) {
  if (!origin || !featureId) return null;
  const url = `${origin}/data/snapshots/${featureId}.json`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok || isHtmlLike(text)) return null;
    const payload = JSON.parse(text);
    if (payload && typeof payload === "object") return payload;
  } catch (error) {
    return null;
  }
  return null;
}

function extractMirrorData(payload) {
  if (!payload || typeof payload !== "object") return null;
  const inner = payload.payload && typeof payload.payload === "object" ? payload.payload : payload;
  if (inner && typeof inner === "object" && inner.data) return inner.data;
  if (Array.isArray(inner?.items) || inner?.context) {
    return { items: inner.items || [], context: inner.context || {} };
  }
  return inner;
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
  const allowWrites = computeAllowWrites(request, env);
  const readOnly = !allowWrites;
  const KV = env?.RV_KV || null;
  const hasKV = KV && typeof KV.get === "function";
  const featureId = cfg.featureId || "unknown";
  const version = cfg.version || "v1";
  const allowEmptyData =
    cfg.allowEmptyData === true || ALLOW_EMPTY_FEATURES.has(featureId);
  const lastGoodKey = cfg.lastGoodKey || `rv:lastgood:${featureId}:${version}`;
  const circuitKey = cfg.circuitKey || `rv:circuit:${featureId}:${version}`;
  const nowMs = Date.now();
  const timings = { kv: 0, fetch: 0, total: 0 };

  let lastGood = null;
  let circuitOpen = false;
  let lastGoodValid = false;
  let lastGoodQuality = { passed: false, failReason: "NO_DATA_YET" };
  let savedAtMs = null;

  const kvStart = Date.now();
  if (hasKV) {
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
    reason: null,
    writeMode: allowWrites ? "WRITE" : "READONLY"
  };
  let retryOnce = false;
  const buildDebugInfo = ({ upstreamStatus, quality, cacheLayer, cacheHit, fetchMs } = {}) => ({
    upstreamStatus: upstreamStatus ?? null,
    quality: quality || null,
    timingsMs: {
      kv: timings.kv,
      fetch: fetchMs ?? 0,
      total: Date.now() - nowMs
    },
    keyUsed: lastGoodKey,
    hasKV: Boolean(hasKV),
    readMode: readOnly ? "READONLY" : "WRITE",
    cache: { layer: cacheLayer || "none", hit: Boolean(cacheHit) },
    reason: meta.reason || "",
    attempts: { retried: Boolean(retryOnce) }
  });

  if (isPreview || circuitOpen || readOnly) {
    const reason = !hasKV
      ? "BINDING_MISSING"
      : isPreview
        ? "PREVIEW"
        : circuitOpen
          ? "CIRCUIT_OPEN"
          : "READONLY";
    const mirrorPayload =
      !lastGoodValid || isPreview || !hasKV || readOnly
        ? await loadMirrorPayload(url.origin, featureId)
        : null;
    if (mirrorPayload) {
      const mirrorData = extractMirrorData(mirrorPayload);
      const mirrorQuality = (cfg.validator || defaultValidator)(mirrorData);
      if (mirrorQuality?.passed) {
        meta.status = "STALE";
        meta.reason = !hasKV ? "BINDING_MISSING" : "MIRROR_FALLBACK";
        const payload = makeJson({
          ok: true,
          feature: featureId,
          traceId,
          data: mirrorData,
          cache: { hit: true, ttl: cfg.ttlStaleSec, layer: "mirror" },
          upstream: { url: "mirror", status: null, snippet: "" },
          error: {},
          isStale: true
        });
        const response = { ...payload, meta };
        if (isDebug) {
          response.debug = buildDebugInfo({
            upstreamStatus: null,
            quality: mirrorQuality,
            cacheLayer: "mirror",
            cacheHit: true,
            fetchMs: 0
          });
        }
        logServer({
          feature: featureId,
          traceId,
          cacheLayer: "mirror",
          upstreamStatus: null,
          durationMs: Date.now() - nowMs,
          errorCode: meta.reason || ""
        });
        const httpStatus = resolveHttpStatus(response);
        return jsonResponse(
          enforceEnvelope(response, {
            allowEmptyData,
            lastGoodData: lastGood?.data || null,
            hasLastGood: lastGoodValid
          }),
          { status: httpStatus, cacheStatus: "STALE" }
        );
      }
    }

    if (lastGoodValid) {
      meta.status = "STALE";
      meta.reason = "MIRROR_FALLBACK";
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
        response.debug = buildDebugInfo({
          upstreamStatus: null,
          quality: lastGoodQuality,
          cacheLayer: "kv",
          cacheHit: true,
          fetchMs: 0
        });
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus: null,
        durationMs: Date.now() - nowMs,
        errorCode: meta.reason || ""
      });
      const httpStatus = resolveHttpStatus(response);
      return jsonResponse(
        enforceEnvelope(response, {
          allowEmptyData,
          lastGoodData: lastGood?.data || null,
          hasLastGood: lastGoodValid
        }),
        { status: httpStatus, cacheStatus: "STALE" }
      );
    }

    meta.status = "NO_DATA";
    meta.reason = !hasKV ? "BINDING_MISSING" : "LASTGOOD_MISSING";
    const error = {
      code: meta.reason || "LASTGOOD_MISSING",
      message: !hasKV
        ? "KV binding missing and no mirror fallback available"
        : "No cached data available"
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
      response.debug = buildDebugInfo({
        upstreamStatus: null,
        quality: lastGoodQuality,
        cacheLayer: "none",
        cacheHit: false,
        fetchMs: 0
      });
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus: null,
      durationMs: Date.now() - nowMs,
      errorCode: error.code
    });
    const httpStatus = resolveHttpStatus(response);
    return jsonResponse(
      enforceEnvelope(response, {
        allowEmptyData,
        lastGoodData: lastGood?.data || null,
        hasLastGood: lastGoodValid
      }),
      { status: httpStatus, cacheStatus: "ERROR" }
    );
  }

  let fetchResult = null;
  let fetchError = null;
  let upstreamStatus = null;
  let upstreamUrl = cfg.upstreamUrl || "";
  let upstreamSnippet = "";
  retryOnce = false;

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
    if (KV && circuitStatus && allowWrites) {
      meta.circuitOpen = true;
    }

    if (lastGoodValid) {
      meta.status = "STALE";
      meta.reason = "MIRROR_FALLBACK";
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
        response.debug = buildDebugInfo({
          upstreamStatus,
          quality: lastGoodQuality,
          cacheLayer: "kv",
          cacheHit: true,
          fetchMs: timings.fetch
        });
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus,
        durationMs: Date.now() - nowMs,
        errorCode: fetchError?.code || "UPSTREAM_FAIL"
      });
      const httpStatus = resolveHttpStatus(response);
      return jsonResponse(
        enforceEnvelope(response, {
          allowEmptyData,
          lastGoodData: lastGood?.data || null,
          hasLastGood: lastGoodValid
        }),
        { status: httpStatus, cacheStatus: "STALE" }
      );
    }

    meta.status = "NO_DATA";
    meta.reason = !hasKV ? "BINDING_MISSING" : "LASTGOOD_MISSING";
    const payload = makeJson({
      ok: false,
      feature: featureId,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: safeSnippet(fetchError?.message || "") },
      error: {
        code: meta.reason || "LASTGOOD_MISSING",
        message: fetchError?.message || "No upstream data and no cached data"
      }
    });
    const response = { ...payload, meta };
    if (isDebug) {
      response.debug = buildDebugInfo({
        upstreamStatus,
        quality: lastGoodQuality,
        cacheLayer: "none",
        cacheHit: false,
        fetchMs: timings.fetch
      });
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - nowMs,
      errorCode: meta.reason || "LASTGOOD_MISSING"
    });
    const httpStatus = resolveHttpStatus(response);
    return jsonResponse(
      enforceEnvelope(response, {
        allowEmptyData,
        lastGoodData: lastGood?.data || null,
        hasLastGood: lastGoodValid
      }),
      { status: httpStatus, cacheStatus: "ERROR" }
    );
  }

  const validator = cfg.validator || defaultValidator;
  const quality = validator(fetchResult?.data);
  if (!quality?.passed) {
    meta.status = "STALE";
    meta.reason = "MIRROR_FALLBACK";
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
        response.debug = buildDebugInfo({
          upstreamStatus,
          quality,
          cacheLayer: "kv",
          cacheHit: true,
          fetchMs: timings.fetch
        });
      }
      logServer({
        feature: featureId,
        traceId,
        cacheLayer: "kv",
        upstreamStatus,
        durationMs: Date.now() - nowMs,
        errorCode: "QUALITY_FAIL"
      });
      const httpStatus = resolveHttpStatus(response);
      return jsonResponse(
        enforceEnvelope(response, {
          allowEmptyData,
          lastGoodData: lastGood?.data || null,
          hasLastGood: lastGoodValid
        }),
        { status: httpStatus, cacheStatus: "STALE" }
      );
    }

    meta.status = "NO_DATA";
    meta.reason = !hasKV ? "BINDING_MISSING" : "LASTGOOD_MISSING";
    const payload = makeJson({
      ok: false,
      feature: featureId,
      traceId,
      data: null,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: upstreamUrl, status: upstreamStatus, snippet: upstreamSnippet },
      error: {
        code: meta.reason || "LASTGOOD_MISSING",
        message: quality?.failReason || "No cached data available"
      }
    });
    const response = { ...payload, meta };
    if (isDebug) {
      response.debug = buildDebugInfo({
        upstreamStatus,
        quality,
        cacheLayer: "none",
        cacheHit: false,
        fetchMs: timings.fetch
      });
    }
    logServer({
      feature: featureId,
      traceId,
      cacheLayer: "none",
      upstreamStatus,
      durationMs: Date.now() - nowMs,
      errorCode: meta.reason || "LASTGOOD_MISSING"
    });
    const httpStatus = resolveHttpStatus(response);
    return jsonResponse(
      enforceEnvelope(response, {
        allowEmptyData,
        lastGoodData: lastGood?.data || null,
        hasLastGood: lastGoodValid
      }),
      { status: httpStatus, cacheStatus: "ERROR" }
    );
  }

  let writeSavedAt = lastGood?.meta?.savedAt || null;
  const lastSavedMs = parseSavedAt(writeSavedAt);
  const shouldWrite =
    !Number.isFinite(lastSavedMs) || nowMs - lastSavedMs >= 60000;

  if (KV && shouldWrite && allowWrites) {
    writeSavedAt = nowIso();
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
    response.debug = buildDebugInfo({
      upstreamStatus: upstreamStatus ?? null,
      quality,
      cacheLayer: "none",
      cacheHit: false,
      fetchMs: timings.fetch
    });
  }
  logServer({
    feature: featureId,
    traceId,
    cacheLayer: "none",
    upstreamStatus: upstreamStatus ?? 200,
    durationMs: Date.now() - nowMs,
    errorCode: ""
  });
  const httpStatus = resolveHttpStatus(response);
  return jsonResponse(
    enforceEnvelope(response, {
      allowEmptyData,
      lastGoodData: lastGood?.data || null,
      hasLastGood: lastGoodValid
    }),
    { status: httpStatus, cacheStatus: "MISS" }
  );
}
