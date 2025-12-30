import { createTraceId, makeResponse } from "./_shared.js";
import { hash8 } from "../_lib/kv-safe.js";
import { normalizeError } from "../_shared/errorCodes.js";

const FEATURE_ID = "diag";
const ENDPOINTS = [
  "news",
  "market-health",
  "hype-divergence",
  "congress-trading",
  "breakout-energy",
  "volume-anomaly",
  "market-regime"
];
const BACKOFFS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHtml(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function fetchWithTimeout(url, timeoutMs) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const text = await response.text();
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status,
      text,
      durationMs: Date.now() - started
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      text: "",
      durationMs: Date.now() - started,
      error
    };
  }
}

async function fetchWithRetry(url, timeoutMs, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await fetchWithTimeout(url, timeoutMs);
    if (result.status === 429 && attempt < retries) {
      const wait = BACKOFFS[Math.min(attempt, BACKOFFS.length - 1)];
      await sleep(wait);
      continue;
    }
    if (!result.ok && result.status === 0 && attempt < retries) {
      await sleep(250);
      continue;
    }
    return result;
  }
  return { ok: false, status: 0, text: "", durationMs: 0 };
}

function severityRank(entry) {
  if (entry.httpStatus === 0) return 0;
  if (entry.httpStatus >= 500) return 1;
  if (entry.errorCode === "BINDING_MISSING") return 2;
  if (entry.httpStatus >= 400) return 3;
  if (entry.ok === false) return 4;
  if (entry.durationMs >= 4000) return 5;
  return 6;
}

async function runQueue(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const runWorker = async () => {
    while (index < items.length) {
      const current = index;
      const item = items[index];
      index += 1;
      results[current] = await worker(item);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}

function buildEndpointResult(path, res) {
  let json = null;
  let parseError = "";
  if (res.text && !isHtml(res.text)) {
    try {
      json = JSON.parse(res.text);
    } catch (error) {
      parseError = error?.message || "SCHEMA_INVALID";
    }
  } else if (res.text && isHtml(res.text)) {
    parseError = "SCHEMA_INVALID";
  }

  const ok = json?.ok === true;
  const parsedError = parseError ? normalizeError({ message: res.text || parseError }, res.status) : null;
  const errorCode = json?.error?.code || (parsedError ? parsedError.code : "");
  return {
    path,
    ok,
    httpStatus: res.status,
    durationMs: res.durationMs,
    errorCode,
    upstreamStatus: json?.upstream?.status ?? null,
    cacheLayer: json?.cache?.layer ?? null
  };
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const origin = new URL(request.url).origin;
  const hasKV = env?.RV_KV && typeof env.RV_KV.get === "function" && typeof env.RV_KV.put === "function";

  const rootProbe = await fetchWithRetry(origin + "/", 8000, 1);
  const rootStatusProbe = {
    status: rootProbe.status,
    durationMs: rootProbe.durationMs
  };

  const targets = ENDPOINTS.map((endpoint) => ({
    path: `/api/${endpoint}`,
    url: `${origin}/api/${endpoint}`
  }));

  const results = await runQueue(targets, 3, async (target) => {
    const res = await fetchWithRetry(target.url, 8000, 2);
    return buildEndpointResult(target.path, res);
  });

  const endpoints = results.map((entry) => ({
    ...entry,
    severityRank: severityRank(entry)
  }));

  const sorted = endpoints.slice().sort((a, b) => {
    if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
    if (a.durationMs !== b.durationMs) return b.durationMs - a.durationMs;
    return a.path.localeCompare(b.path);
  });

  const topErrorCodes = {};
  sorted.forEach((entry) => {
    if (!entry.errorCode) return;
    topErrorCodes[entry.errorCode] = (topErrorCodes[entry.errorCode] || 0) + 1;
  });

  const topErrorList = Object.entries(topErrorCodes)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, hash: hash8(code) }))
    .slice(0, 10);

  const summary = {
    endpointsChecked: sorted.length,
    endpointsFail: sorted.filter((entry) => entry.severityRank < 6).length,
    rootStatusProbe,
    topErrorCodes: topErrorList
  };

  return makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: {
      ts: new Date().toISOString(),
      env: { hasKV },
      summary,
      endpoints: sorted
    }
  });
}
