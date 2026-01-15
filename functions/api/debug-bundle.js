import { createTraceId, makeResponse, safeSnippet } from "./_shared.js";
import { hash8, kvPutJson } from "../_lib/kv-safe.js";
import { isProduction, requireDebugToken } from "./_env.js";

const SCHEMA = "RUBIKVAULT_DEBUG_BUNDLE_V1";
const EVENT_TTL = 24 * 60 * 60;


function redactKey(key) {
  return /api_key|token|secret|authorization|bearer/i.test(String(key || ""));
}

function redactValue(value) {
  if (typeof value !== "string") return value;
  if (/api_key|token|secret|authorization|bearer/i.test(value)) return "[REDACTED]";
  return value;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (redactKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitize(redactValue(val));
      }
    });
    return result;
  }
  return redactValue(value);
}

function hourBucket(date) {
  return new Date(date).toISOString().slice(0, 13);
}

async function listEvents(env, limit) {
  const rv = env?.RV_KV;
  if (!rv || typeof rv.list !== "function" || typeof rv.get !== "function") return [];
  const now = new Date();
  const currentHour = hourBucket(now);
  const previousHour = hourBucket(new Date(now.getTime() - 60 * 60 * 1000));
  const keys = [];
  try {
    const listed = await rv.list({ prefix: `log:event:${currentHour}:`, limit });
    listed?.keys?.forEach((key) => keys.push(key.name));
  } catch (error) {
    // ignore list errors
  }
  if (keys.length < 20) {
    try {
      const listed = await rv.list({ prefix: `log:event:${previousHour}:`, limit });
      listed?.keys?.forEach((key) => keys.push(key.name));
    } catch (error) {
      // ignore list errors
    }
  }

  const events = [];
  for (const key of keys.slice(0, limit)) {
    try {
      const value = await rv.get(key, "json");
      if (value) events.push(value);
    } catch (error) {
      // ignore read errors
    }
  }

  return events
    .filter(Boolean)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
    .slice(0, limit);
}

async function fetchJsonSafe(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    const text = await response.text();
    clearTimeout(timer);
    try {
      const json = JSON.parse(text);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          json,
          reason: `HTTP_${response.status}`,
          errorSnippet: safeSnippet(text)
        };
      }
      return { ok: true, status: response.status, json };
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        reason: "SCHEMA_INVALID",
        errorSnippet: safeSnippet(text)
      };
    }
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      reason: "FETCH_FAILED",
      errorSnippet: error?.message || "Fetch failed"
    };
  }
}

function summarizeErrors(events) {
  const counts = new Map();
  events.forEach((event) => {
    if (!event?.errorCode) return;
    counts.set(event.errorCode, (counts.get(event.errorCode) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, hash: hash8(code) }))
    .slice(0, 10);
}

function summarizeSeverity(events) {
  const counts = { OK: 0, DEGRADED: 0, WARN: 0, CRITICAL: 0 };
  const byFeature = {};
  events.forEach((event) => {
    let severity = "OK";
    if (!event?.traceId) severity = "CRITICAL";
    else if (event?.errorCode === "SCHEMA_INVALID") severity = "CRITICAL";
    else if (event?.httpStatus >= 500) severity = "CRITICAL";
    else if (["STALE", "PARTIAL", "COVERAGE_LIMIT"].includes(String(event?.dataQuality || ""))) {
      severity = "DEGRADED";
    } else if (event?.httpStatus >= 400) {
      severity = "WARN";
    }
    counts[severity] = (counts[severity] || 0) + 1;
    if (event?.feature) byFeature[event.feature] = severity;
  });
  return { countsBySeverity: counts, countsByFeature: byFeature };
}

function isBlockDown(event) {
  if (!event) return false;
  const dq = String(event.dataQuality || "").toUpperCase();
  const code = String(event.errorCode || "").toUpperCase();
  if (dq === "COVERAGE_LIMIT" || code === "COVERAGE_LIMIT") return false;
  if (dq === "STALE") return false;
  if (event.feature === "congress-trading" && code === "UPSTREAM_403") return false;
  if (event.feature === "market-health" && dq === "PARTIAL" && code === "UPSTREAM_5XX") {
    return false;
  }
  return Boolean(event.errorCode);
}

export async function onRequestGet({ request, env, data }) {
  try {
    const traceId = data?.traceId || createTraceId(request);
    const url = new URL(request.url);
    const internalToken =
      request.headers.get("x-rv-internal-token") || url.searchParams.get("token") || "";
    const host = request.headers.get("host") || "";
    const prod = isProduction(env, request);
    const envHint = host.endsWith(".pages.dev")
      ? "preview"
      : prod
        ? "prod"
        : env?.CF_PAGES_ENVIRONMENT || (env?.CF_PAGES_BRANCH ? "preview" : "dev");
    const version = env?.CF_PAGES_COMMIT_SHA || env?.GIT_SHA || null;

    const bindingPresent = Boolean(env?.RV_KV && typeof env.RV_KV.get === "function");
    const hasKV = bindingPresent;
    const debugAllowed = requireDebugToken(env, request);
    const kvErrors = [];
    const kvWarnings = [];
    let opsWorking = null;

    if (!bindingPresent) kvWarnings.push("KV_BINDING_MISSING");
    if (envHint === "preview" && !bindingPresent) {
      kvWarnings.push("Preview env missing KV binding or wrong namespace");
    }
    if (!debugAllowed) kvErrors.push("DEBUG_TOKEN_REQUIRED");

    if (debugAllowed && bindingPresent) {
      try {
        await env.RV_KV.get("_health_check_key");
        opsWorking = true;
      } catch (error) {
        opsWorking = false;
        kvErrors.push("KV_OP_FAILED");
      }
    }

    const infra = {
      kv: {
        hasKV,
        bindingPresent,
        opsWorking,
        binding: "RV_KV",
        errors: kvErrors,
        warnings: kvWarnings
      },
      notes: []
    };

    const limitParam = Number(url.searchParams.get("limit") || 200);
    const limit = Math.max(20, Math.min(500, Number.isFinite(limitParam) ? limitParam : 200));
    const recentEvents = await listEvents(env, limit);

    const summaryBase = {
      status: hasKV ? "OK" : "FAIL",
      topErrorCodes: summarizeErrors(recentEvents),
      blocksDown: [],
      endpointsDown: []
    };
    if (opsWorking === false && summaryBase.status === "OK") {
      summaryBase.status = "DEGRADED";
    }

    let health = null;
    let diag = null;
    let attempts = [];

    if (debugAllowed) {
      const origin = url.origin;
      const targets = [
        { name: "health", url: `${origin}/api/health` },
        { name: "diag", url: `${origin}/api/diag` }
      ];
      const targetsWithToken = targets.map((t) => {
        if (!internalToken) return t;
        try {
          const u = new URL(t.url);
          u.searchParams.set("token", internalToken);
          return { ...t, url: u.toString() };
        } catch {
          return t;
        }
      });
      const settled = await Promise.allSettled(
        targetsWithToken.map((target) => fetchJsonSafe(target.url))
      );
      attempts = settled.map((result, index) => {
        const target = targetsWithToken[index];
        if (result.status === "fulfilled") {
          const value = result.value || {};
          return {
            name: target.name,
            url: target.url,
            ok: Boolean(value.ok),
            status: value.status ?? 0,
            reason: value.reason || "",
            errorSnippet: value.errorSnippet || ""
          };
        }
        const message = result.reason?.message || String(result.reason || "Fetch failed");
        return {
          name: target.name,
          url: target.url,
          ok: false,
          status: 0,
          reason: "FETCH_FAILED",
          errorSnippet: message
        };
      });
      const healthResult = settled[0]?.status === "fulfilled" ? settled[0].value : null;
      const diagResult = settled[1]?.status === "fulfilled" ? settled[1].value : null;
      health = healthResult?.json || null;
      diag = diagResult?.json || null;
    }

    const diagSummary = diag?.data?.summary || null;
    if (diagSummary?.endpointsFail > 0) summaryBase.status = hasKV ? "DEGRADED" : "FAIL";
    const diagEndpoints = diag?.data?.endpoints || diag?.endpoints || [];
    summaryBase.endpointsDown = Array.isArray(diagEndpoints)
      ? diagEndpoints.filter((entry) => entry.severityRank < 6).map((entry) => entry.path)
      : [];
    summaryBase.blocksDown = recentEvents
      .filter((event) => isBlockDown(event))
      .map((event) => event.feature)
      .filter((value, index, self) => self.indexOf(value) === index);

    const severitySummary = summarizeSeverity(recentEvents);
    const bundleId = hash8(`${summaryBase.status}:${summaryBase.topErrorCodes?.[0]?.code || ""}`);
    const summary = {
      ...summaryBase,
      bundleId,
      generatedAt: new Date().toISOString(),
      ...severitySummary
    };

    const dataPayload = debugAllowed
      ? { prod, host }
      : { status: "redacted", reason: "missing_debug_token", prod, host };

    const bundleData = {
      schema: SCHEMA,
      meta: {
        ts: new Date().toISOString(),
        envHint,
        host,
        version,
        traceId,
        prod,
        branch: env?.CF_PAGES_BRANCH || null,
        pagesEnv: env?.CF_PAGES_ENVIRONMENT || null
      },
      infra,
      health: sanitize(health || {}),
      diag: sanitize(diag || {}),
      recentEvents: sanitize(recentEvents),
      data: dataPayload,
      client: {},
      correlations: [],
      summary,
      attempts
    };

    const response = makeResponse({
      ok: true,
      feature: "debug-bundle",
      traceId,
      data: bundleData,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      meta: { envHint, host, version }
    });

    if (hasKV && debugAllowed) {
      const key = `log:event:${hourBucket(new Date())}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const event = {
        ts: new Date().toISOString(),
        feature: "debug-bundle",
        traceId,
        requestId: data?.requestId || "",
        cacheLayer: "none",
        upstreamStatus: null,
        durationMs: 0,
        errorCode: "",
        httpStatus: 200
      };
      kvPutJson(env, key, event, EVENT_TTL).catch(() => {});
    }

    return response;
  } catch (error) {
    return makeResponse({
      ok: false,
      feature: "debug-bundle",
      traceId: createTraceId(request),
      data: {},
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url: "", status: null, snippet: "" },
      meta: { status: "ERROR", reason: "DEBUG_BUNDLE_FAILED" },
      error: {
        code: "DEBUG_BUNDLE_FAILED",
        message: error?.message || "Debug bundle failed",
        details: {}
      }
    });
  }
}
