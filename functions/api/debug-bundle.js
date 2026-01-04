import { createTraceId } from "./_shared.js";
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
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const text = await response.text();
    clearTimeout(timer);
    try {
      return { ok: true, status: response.status, json: JSON.parse(text) };
    } catch (error) {
      return { ok: false, status: response.status, error: "SCHEMA_INVALID" };
    }
  } catch (error) {
    clearTimeout(timer);
    return { ok: false, status: 0, error: "FETCH_FAILED" };
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
  const traceId = data?.traceId || createTraceId(request);
  const url = new URL(request.url);
  const host = request.headers.get("host") || "";
  const envHint = host.endsWith(".pages.dev")
    ? "preview"
    : host
      ? "prod"
      : env?.CF_PAGES_ENVIRONMENT || (env?.CF_PAGES_BRANCH ? "preview" : "prod");
  const version = env?.CF_PAGES_COMMIT_SHA || env?.GIT_SHA || null;

  const bindingPresent = Boolean(env?.RV_KV && typeof env.RV_KV.get === "function");
  const debugAllowed = requireDebugToken(env, request);
  const prod = isProduction(env, request);
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

  const hasKV = bindingPresent;
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

  if (!debugAllowed) {
    const bundle = {
      schema: SCHEMA,
      meta: { ts: new Date().toISOString(), envHint, host, version, traceId },
      infra,
      health: { status: "ok", service: "rubikvault", envHint, host },
      diag: {},
      recentEvents: [],
      data: { status: "redacted", reason: "missing_debug_token", prod, host },
      client: {},
      correlations: [],
      summary: { status: "FAIL", topErrorCodes: [], blocksDown: [], endpointsDown: [] }
    };
    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  const origin = url.origin;
  const health = await fetchJsonSafe(`${origin}/api/health`);
  const diag = await fetchJsonSafe(`${origin}/api/diag`);

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

  const diagSummary = diag.json?.data?.summary || null;
  if (diagSummary?.endpointsFail > 0) summaryBase.status = hasKV ? "DEGRADED" : "FAIL";
  const diagEndpoints = diag.json?.data?.endpoints || diag.json?.endpoints || [];
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

  const bundle = {
    schema: SCHEMA,
    meta: { ts: new Date().toISOString(), envHint, host, version, traceId },
    infra,
    health: sanitize(health.json || {}),
    diag: sanitize(diag.json || {}),
    recentEvents: sanitize(recentEvents),
    data: { prod, host },
    client: {},
    correlations: [],
    summary
  };

  const response = new Response(JSON.stringify(bundle), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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
}
