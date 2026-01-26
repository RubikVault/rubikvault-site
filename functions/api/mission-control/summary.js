import { sha256Hex } from '../_shared/digest.mjs';
import { buildDashKeys, kvGetJsonKVSafe, computeBudgets, summarizeProviderStats } from '../_shared/telemetry.mjs';

const MODULE_NAME = 'mission-control-summary';
const SNAPSHOT_MODULES_HINT = ['universe', 'market-prices', 'market-stats', 'market-score'];
const SNAPSHOT_PATHS = [
  (moduleName) => `/data/snapshots/${moduleName}/latest.json`,
  (moduleName) => `/data/snapshots/${moduleName}.json`
];

let LAST_CACHE = null;
let LAST_CACHE_AT_MS = 0;
const CACHE_TTL_MS = 10_000;

async function computeDigest(input) {
  const canonical = JSON.stringify(input);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

function buildErrorPayload(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isoMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function toInt(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function kvGetInt(env, key) {
  const kv = env?.RV_KV;
  const hasKV = kv && typeof kv.get === 'function';
  if (!hasKV) return { ok: false, value: 0, reason: 'BINDING_MISSING' };
  try {
    const raw = await kv.get(key);
    return { ok: true, value: toInt(raw), reason: null };
  } catch {
    return { ok: false, value: 0, reason: 'KV_ERROR' };
  }
}

async function fetchBuildInfo(requestUrl) {
  try {
    const url = new URL('/build-info.json', requestUrl);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const sha = json?.gitSha || json?.git_sha || json?.sha || json?.commit || null;
    const ts = json?.buildTs || json?.build_ts || json?.builtAt || json?.built_at || json?.timestamp || null;
    return { gitSha: sha ? String(sha) : null, buildTs: ts ? String(ts) : null };
  } catch {
    return null;
  }
}

async function fetchSnapshotInfo(requestUrl, moduleName) {
  for (const builder of SNAPSHOT_PATHS) {
    const path = builder(moduleName);
    const url = new URL(path, requestUrl);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) continue;
      const payload = await response.json();
      const metadata = payload?.metadata || {};
      const asOf = metadata?.as_of || metadata?.published_at || metadata?.fetched_at || null;
      return {
        ok: true,
        path,
        served_from: metadata.served_from || 'ASSET',
        schema_version: payload?.schema_version || null,
        module: metadata.module || moduleName,
        as_of: asOf,
        status: metadata?.status || null,
        record_count: metadata?.record_count ?? null
      };
    } catch {
      continue;
    }
  }
  return { ok: false, paths_checked: SNAPSHOT_PATHS.map((builder) => builder(moduleName)) };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isDebug = url.searchParams.get('debug') === '1';
  const startedAtIso = new Date().toISOString();
  const now = new Date();

  if (!isDebug && LAST_CACHE && Date.now() - LAST_CACHE_AT_MS < CACHE_TTL_MS) {
    return new Response(LAST_CACHE, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60'
      }
    });
  }

  const kv = env?.RV_KV || null;
  const hasKV = kv && typeof kv.get === 'function' && typeof kv.put === 'function';

  const dash = buildDashKeys(now);
  const [dayTotal, weekTotal, monthTotal] = await Promise.all([
    kvGetInt(env, dash.callsDay),
    kvGetInt(env, dash.callsWeek),
    kvGetInt(env, dash.callsMonth)
  ]);

  const endpointsMapRes = await kvGetJsonKVSafe(env, dash.endpointsDay, {});
  const endpointsMap = endpointsMapRes.value && typeof endpointsMapRes.value === 'object' ? endpointsMapRes.value : {};
  const endpointsDayTop = Object.entries(endpointsMap)
    .map(([endpoint, calls]) => ({ endpoint, calls: toInt(calls) }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 12);

  const kvOpsRes = await kvGetJsonKVSafe(env, dash.kvOpsDay, null);
  const kvOpsDay = kvOpsRes.value && typeof kvOpsRes.value === 'object' ? kvOpsRes.value : null;

  const providersRes = await kvGetJsonKVSafe(env, dash.providersDay, {});
  const providersRaw = providersRes.value && typeof providersRes.value === 'object' ? providersRes.value : {};
  const providersDay = Object.fromEntries(
    Object.entries(providersRaw).map(([k, v]) => [k, summarizeProviderStats(v)])
  );

  let failuresDay = [];
  let snapshots = [];
  let liveApis = { items: [] };
  if (isDebug) {
    const failuresRes = await kvGetJsonKVSafe(env, dash.failuresRingDay, []);
    const failuresArr = Array.isArray(failuresRes.value) ? failuresRes.value : [];
    failuresDay = failuresArr.slice(Math.max(0, failuresArr.length - 20)).reverse();

    for (const moduleName of SNAPSHOT_MODULES_HINT) {
      const info = await fetchSnapshotInfo(request.url, moduleName);
      if (!info.ok) continue;
      snapshots.push({
        module: moduleName,
        ok: true,
        asOf: info.as_of,
        status: info.status,
        records: info.record_count,
        type: 'snapshot',
        note: null
      });
    }

    // live API checks removed (avoid request amplification)
  }

  const budgetsLimits = {
    workersRequests: 100000,
    kvReads: 20000,
    kvWrites: 20000
  };
  const workersUsedToday = dayTotal.value;
  const kvReadsToday = kvOpsDay ? toInt(kvOpsDay.reads) : null;
  const kvWritesToday = kvOpsDay ? toInt(kvOpsDay.writes) : null;
  const budgets = {
    asOf: startedAtIso,
    workersRequests: {
      usedToday: workersUsedToday,
      limitToday: budgetsLimits.workersRequests,
      pctUsed: budgetsLimits.workersRequests ? Math.round((workersUsedToday / budgetsLimits.workersRequests) * 1000) / 10 : null,
      pctRemaining: budgetsLimits.workersRequests ? Math.round(((budgetsLimits.workersRequests - workersUsedToday) / budgetsLimits.workersRequests) * 1000) / 10 : null
    },
    kvReads: {
      usedToday: kvReadsToday,
      limitToday: budgetsLimits.kvReads,
      pctUsed: kvReadsToday == null ? null : (budgetsLimits.kvReads ? Math.round((kvReadsToday / budgetsLimits.kvReads) * 1000) / 10 : null)
    },
    kvWrites: {
      usedToday: kvWritesToday,
      limitToday: budgetsLimits.kvWrites,
      pctUsed: kvWritesToday == null ? null : (budgetsLimits.kvWrites ? Math.round((kvWritesToday / budgetsLimits.kvWrites) * 1000) / 10 : null)
    }
  };

  const deploy = await fetchBuildInfo(request.url);

  const warnings = [];
  if (!hasKV) warnings.push('KV_NOT_BOUND');

  const payload = {
    schema_version: '3.0',
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      tier: 'standard',
      domain: 'system',
      source: 'mission-control',
      fetched_at: startedAtIso,
      published_at: startedAtIso,
      digest: null,
      served_from: 'RUNTIME',
      request: {
        debug: isDebug
      },
      status: 'OK',
      warnings
    },
    data: {
      hasKV,
      asOf: startedAtIso,
      calls: { day: dayTotal.value, week: weekTotal.value, month: monthTotal.value },
      endpoints: { dayTop: endpointsDayTop },
      kvOps: { day: kvOpsDay },
      providers: { day: providersDay },
      failures: { day: failuresDay },
      budgets,
      deploy,
      snapshots: { items: snapshots },
      liveApis
    },
    error: null
  };

  if (!hasKV) {
    payload.metadata.status = 'PARTIAL';
  }

  payload.metadata.digest = await computeDigest(payload);

  const body = JSON.stringify(payload, null, 2) + '\n';
  if (!isDebug) {
    LAST_CACHE = body;
    LAST_CACHE_AT_MS = Date.now();
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=60'
    }
  });
}
