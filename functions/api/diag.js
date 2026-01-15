import { createTraceId, makeResponse } from "./_shared.js";
import { isProduction, requireDebugToken } from "./_env.js";
import { hash8 } from "../_lib/kv-safe.js";
import { normalizeError } from "../_shared/errorCodes.js";
import { getProviderBudgetState, getProviderBudgetStateRollups } from "../_shared/provider_budget.js";

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
  const envHint =
    env?.CF_PAGES_ENVIRONMENT ||
    (env?.CF_PAGES_BRANCH ? "preview" : env?.CF_PAGES_URL ? "production" : "unknown");
  const host = request?.headers?.get("host") || "";
  const prod = isProduction(env, request);

  if (!requireDebugToken(env, request)) {
    return makeResponse({
      ok: true,
      feature: FEATURE_ID,
      traceId,
      data: {
        status: "redacted",
        reason: "missing_debug_token",
        service: "rubikvault",
        envHint,
        host,
        prod
      },
      error: {
        code: "DEBUG_TOKEN_REQUIRED",
        message: "Debug token required for diag in production",
        details: {}
      }
    });
  }

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

  // Enhanced data for Internal Dashboard
  const blocks = sorted.map(entry => {
    const featureId = entry.path.replace('/api/', '').replace(/-/g, '-');
    return {
      feature_id: featureId,
      title: featureId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
      status: entry.ok ? 'OK' : entry.httpStatus >= 500 ? 'FAIL' : 'PARTIAL',
      data_present: entry.ok,
      quality: entry.ok ? 'OK' : entry.httpStatus >= 500 ? 'FAIL' : 'DEGRADED',
      as_of: new Date().toISOString(),
      source: entry.cacheLayer || 'none',
      cache_layer: entry.cacheLayer || 'none',
      last_error: entry.errorCode || null
    };
  });

  const budgetConfigs = [
    { provider: "coingecko", envKey: "RV_BUDGET_COINGECKO_PER_DAY" },
    { provider: "rss", envKey: "RV_BUDGET_RSS_PER_DAY" },
    { provider: "stooq", envKey: "RV_BUDGET_STOOQ_PER_DAY" },
    { provider: "finnhub", envKey: "RV_BUDGET_FINNHUB_PER_DAY" },
    { provider: "fmp", envKey: "RV_BUDGET_FMP_PER_DAY" },
    { provider: "fred", envKey: "RV_BUDGET_FRED_PER_DAY" },
    { provider: "yahoo", envKey: "RV_BUDGET_YAHOO_PER_DAY" }
  ];
  const apiKeys = await Promise.all(
    budgetConfigs.map(async (cfg) => {
      const hardLimit = Number(env?.[cfg.envKey] || 0) || 0;
      const state = await getProviderBudgetState(env, cfg.provider, hardLimit);
      const rollups = await getProviderBudgetStateRollups(env, cfg.provider, hardLimit);

      const status = hardLimit > 0 ? (state.limited ? "limited" : "present") : "unset";
      const countsToday = state.used ?? 0;
      const countsWeek = rollups?.week?.used ?? 0;
      const countsMonth = rollups?.month?.used ?? 0;

      const weekLimit = hardLimit > 0 ? hardLimit * 7 : 0;
      const monthLimit = hardLimit > 0 ? hardLimit * 30 : 0;
      const remainingWeek = hardLimit > 0 ? Math.max(0, weekLimit - countsWeek) : null;
      const remainingMonth = hardLimit > 0 ? Math.max(0, monthLimit - countsMonth) : null;

      const burnRatePerHour = countsToday / Math.max(1, (new Date().getUTCHours() + 1));

      let hint = "—";
      let recommendedAction = "—";
      if (!env?.RV_KV) {
        hint = "KV missing: budgets are not enforced + counters may be null";
        recommendedAction = "Bind RV_KV in Cloudflare Pages (Production + Preview)";
      } else if (hardLimit <= 0) {
        hint = "No hard limit set (unlimited / not tracked for limit enforcement)";
        recommendedAction = `Set ${cfg.envKey} to enable daily budget + safe fallbacks`;
      } else if (state.limited) {
        hint = "Daily budget exceeded: endpoints should serve stale cache / fallback";
        recommendedAction = "Increase budget or increase cache TTL / reduce refresh frequency";
      }

      return {
        provider: cfg.provider,
        alias: cfg.envKey,
        status,
        counts_today: countsToday,
        counts_week: countsWeek,
        counts_month: countsMonth,
        hard_limit: hardLimit > 0 ? hardLimit : "—",
        remaining: hardLimit > 0 ? state.remaining ?? 0 : "—",
        remaining_week: hardLimit > 0 ? remainingWeek : "—",
        remaining_month: hardLimit > 0 ? remainingMonth : "—",
        burn_rate_per_hour: hardLimit > 0 ? Number(burnRatePerHour.toFixed(2)) : "—",
        last_error: state.limited ? "COVERAGE_LIMIT" : "—",
        last_used: state.used !== null ? new Date().toISOString() : null,
        hint,
        recommended_action: recommendedAction
      };
    })
  );
  const events = sorted
    .filter(entry => !entry.ok)
    .map(entry => ({
      timestamp: new Date().toISOString(),
      type: entry.httpStatus >= 500 ? 'error' : 'warn',
      feature: entry.path.replace('/api/', ''),
      error_code: entry.errorCode || 'UNKNOWN',
      message: `HTTP ${entry.httpStatus}`,
      details: JSON.stringify({ durationMs: entry.durationMs, upstreamStatus: entry.upstreamStatus })
    }))
    .slice(0, 50);

  return makeResponse({
    ok: true,
    feature: FEATURE_ID,
    traceId,
    data: {
      ts: new Date().toISOString(),
      env: { hasKV },
      summary,
      endpoints: sorted,
      // Dashboard-specific data
      overall_status: summary.endpointsFail === 0 ? 'OK' : summary.endpointsFail < sorted.length / 2 ? 'DEGRADED' : 'FAIL',
      blocks,
      api_keys: apiKeys,
      events
    }
  });
}
