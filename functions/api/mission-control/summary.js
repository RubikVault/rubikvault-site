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

function authFail() {
  const payload = {
    schema_version: '3.0',
    meta: {
      asOf: new Date().toISOString(),
      reason: 'OPS_KEY_MISSING_OR_WRONG'
    },
    metadata: {
      module: MODULE_NAME,
      schema_version: '3.0',
      tier: 'standard',
      domain: 'system',
      source: 'mission-control',
      fetched_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      digest: null,
      served_from: 'RUNTIME',
      request: { debug: false },
      status: 'ERROR',
      warnings: []
    },
    data: null,
    error: buildErrorPayload('FORBIDDEN', 'Live check requires valid OPS_KEY')
  };

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

async function fetchAssetJson(requestUrl, path, fallback = null) {
  try {
    const url = new URL(path, requestUrl);
    const res = await fetch(url.toString(), { cf: { cacheTtl: 30 } });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function isPipelineTruthDoc(doc) {
  return doc && typeof doc === 'object' && typeof doc.universe === 'string' && 'expected' in doc && 'count' in doc && 'missing' in doc;
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizePipelineTruth(doc) {
  if (!isPipelineTruthDoc(doc)) return null;
  return {
    universe: typeof doc.universe === 'string' ? doc.universe : null,
    expected: toIntOrNull(doc.expected),
    count: toIntOrNull(doc.count),
    reason: doc.reason ? String(doc.reason) : null,
    missing: Array.isArray(doc.missing) ? doc.missing : []
  };
}

function lastTradingDayIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchCloudflareWorkerRequests(env) {
  const accountId = env?.CF_ACCOUNT_ID;
  const apiToken = env?.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    return {
      requestsToday: null,
      requestsLast24h: null,
      notes: 'CF analytics not configured'
    };
  }

  const endpoint = 'https://api.cloudflare.com/client/v4/graphql';
  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const query = `query($accountTag: String!, $startToday: DateTime!, $start24h: DateTime!, $end: DateTime!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptiveGroups(
          limit: 1,
          filter: { datetime_geq: $startToday, datetime_leq: $end }
        ) {
          sum { requests }
        }
        workersInvocationsAdaptiveGroupsLast24h: workersInvocationsAdaptiveGroups(
          limit: 1,
          filter: { datetime_geq: $start24h, datetime_leq: $end }
        ) {
          sum { requests }
        }
      }
    }
  }`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: accountId,
          startToday: startToday.toISOString(),
          start24h: start24h.toISOString(),
          end: now.toISOString()
        }
      })
    });

    if (!res.ok) {
      return {
        requestsToday: null,
        requestsLast24h: null,
        notes: `CF analytics query failed (HTTP ${res.status})`
      };
    }

    const payload = await res.json();
    const account = payload?.data?.viewer?.accounts?.[0];
    const today = account?.workersInvocationsAdaptiveGroups?.[0]?.sum?.requests;
    const last24h = account?.workersInvocationsAdaptiveGroupsLast24h?.[0]?.sum?.requests;
    return {
      requestsToday: toNumber(today),
      requestsLast24h: toNumber(last24h),
      notes: 'ok'
    };
  } catch (e) {
    return {
      requestsToday: null,
      requestsLast24h: null,
      notes: `CF analytics query error: ${String(e?.message || e)}`
    };
  }
}

function computeVerdictFromBaseline(baseline) {
  const expected = baseline?.pipeline?.expected;
  const staticReady = baseline?.pipeline?.staticReady;
  const staleCount = baseline?.freshness?.staleCount;
  const missingCount = Array.isArray(baseline?.pipeline?.missing) ? baseline.pipeline.missing.length : 0;
  const hasPipeline = Number.isFinite(Number(expected)) && Number.isFinite(Number(staticReady));
  const pipelineOk = hasPipeline ? Number(staticReady) >= Number(expected) : false;
  const freshnessKnown = staleCount !== null && staleCount !== undefined;
  const freshnessOk = freshnessKnown ? Number(staleCount) === 0 : false;

  if (pipelineOk && freshnessOk) return { verdict: 'HEALTHY', reason: 'OK' };
  if (!pipelineOk) return { verdict: 'RISK', reason: `PIPELINE_STATIC_READY=${staticReady}/${expected} (missing=${missingCount})` };
  if (!freshnessOk) return { verdict: 'RISK', reason: `SNAPSHOT_STALE (stale=${staleCount})` };
  return { verdict: 'DEGRADED', reason: 'UNKNOWN' };
}

function baselineFromComputed(opsComputed) {
  const expectedUniverse = opsComputed?.pipeline?.expected ?? 100;
  return {
    expectedUniverse,
    pipeline: {
      expected: opsComputed?.pipeline?.expected ?? expectedUniverse,
      fetched: opsComputed?.pipeline?.fetched ?? null,
      validatedStored: opsComputed?.pipeline?.validatedStored ?? null,
      computed: opsComputed?.pipeline?.computed ?? null,
      staticReady: opsComputed?.pipeline?.staticReady ?? null,
      missing: Array.isArray(opsComputed?.pipeline?.missing) ? opsComputed.pipeline.missing : []
    },
    freshness: {
      latestSnapshotDate: opsComputed?.freshness?.latestSnapshotDate ?? null,
      expectedTradingDay: opsComputed?.freshness?.expectedTradingDay ?? null,
      staleCount: opsComputed?.freshness?.staleCount ?? null,
      staleList: Array.isArray(opsComputed?.freshness?.staleList) ? opsComputed.freshness.staleList : []
    },
    providers: Array.isArray(opsComputed?.providers) ? opsComputed.providers : [],
    safety: {
      kvWritesToday: opsComputed?.safety?.kvWritesToday ?? null,
      pollingDefaultOff: opsComputed?.safety?.pollingDefaultOff ?? true,
      runtimeWritesDisabled: opsComputed?.safety?.runtimeWritesDisabled ?? true
    },
    cloudflare: {
      requestsToday: null,
      requestsLast24h: null,
      notes: 'CF analytics not configured'
    }
  };
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
  const wantsLive = url.searchParams.get('live') === '1';
  const startedAtIso = new Date().toISOString();
  const now = new Date();

  if (wantsLive) {
    const requiredKey = env?.OPS_KEY;
    const providedKey = request.headers.get('x-ops-key') || request.headers.get('X-OPS-KEY') || '';
    if (!requiredKey || providedKey !== requiredKey) {
      return authFail();
    }
  }

  if (!wantsLive && !isDebug && LAST_CACHE && Date.now() - LAST_CACHE_AT_MS < CACHE_TTL_MS) {
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

  const [opsDaily, usageReport, providerState, seedManifest, nasdaq100Universe, marketPhaseIndex] = await Promise.all([
    fetchAssetJson(request.url, '/data/ops-daily.json', null),
    fetchAssetJson(request.url, '/data/usage-report.json', null),
    fetchAssetJson(request.url, '/data/provider-state.json', null),
    fetchAssetJson(request.url, '/data/seed-manifest.json', null),
    fetchAssetJson(request.url, '/data/universe/nasdaq100.json', []),
    fetchAssetJson(request.url, '/data/marketphase/index.json', null)
  ]);

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

  const nasdaqExpected = Array.isArray(nasdaq100Universe) ? nasdaq100Universe.length : 100;
  const expectedTradingDay = lastTradingDayIso(now);

  const usageProviders = usageReport && typeof usageReport === 'object' && usageReport.providers && typeof usageReport.providers === 'object'
    ? usageReport.providers
    : {};
  const opsProviders = Object.entries(usageProviders).map(([name, entry]) => {
    const daily = entry?.daily || {};
    const monthly = entry?.monthly || {};
    const usedMonth = toNumber(monthly.used);
    const limitMonth = toNumber(monthly.limit);
    const remainingMonth = toNumber(monthly.remaining);
    const remainingPct = toNumber(monthly.pctRemaining);
    const usedToday = toNumber(daily.used);
    return {
      name,
      usedMonth,
      limitMonth,
      remainingMonth,
      remainingPct: remainingPct == null ? null : Math.round(remainingPct * 1000) / 10,
      resetDate: null,
      runtimeCallsToday: usedToday == null ? 0 : usedToday
    };
  });

  if (!opsProviders.some((p) => p.name === 'tiingo')) {
    opsProviders.push({
      name: 'tiingo',
      usedMonth: null,
      limitMonth: null,
      remainingMonth: null,
      remainingPct: null,
      resetDate: null,
      runtimeCallsToday: 0
    });
  }

  const [pipelineFetchedRaw, pipelineValidatedRaw, pipelineComputedRaw, pipelineStaticReadyRaw] = await Promise.all([
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.fetched.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.validated.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.computed.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.static-ready.json', null)
  ]);

  const pipelineFetched = normalizePipelineTruth(pipelineFetchedRaw);
  const pipelineValidated = normalizePipelineTruth(pipelineValidatedRaw);
  const pipelineComputedTruth = normalizePipelineTruth(pipelineComputedRaw);
  const pipelineStaticReadyTruth = normalizePipelineTruth(pipelineStaticReadyRaw);

  const pipelineExpected =
    pipelineFetched?.expected ??
    pipelineValidated?.expected ??
    pipelineComputedTruth?.expected ??
    pipelineStaticReadyTruth?.expected ??
    (nasdaqExpected || 100);

  const fetched = pipelineFetched?.count ?? null;
  const validatedStored = pipelineValidated?.count ?? null;
  const computed = pipelineComputedTruth?.count ?? null;
  const staticReady = pipelineStaticReadyTruth?.count ?? null;
  const missing = pipelineStaticReadyTruth?.missing ?? [];

  const pricesSnapDate = await (async () => {
    const snap = await fetchAssetJson(request.url, '/data/snapshots/market-prices/latest.json', null);
    const d0 = Array.isArray(snap?.data) && snap.data.length ? snap.data[0] : null;
    const meta = snap?.metadata || {};
    return d0?.date || (typeof meta.fetched_at === 'string' ? meta.fetched_at.slice(0, 10) : null) || null;
  })();

  const staleList = (() => {
    const out = [];
    const symbols = Array.isArray(marketPhaseIndex?.data?.symbols) ? marketPhaseIndex.data.symbols : [];
    for (const s of symbols) {
      const sym = s?.symbol ? String(s.symbol).toUpperCase() : null;
      const updatedAt = s?.updatedAt ? String(s.updatedAt).slice(0, 10) : null;
      if (!sym || !updatedAt) continue;
      if (updatedAt < expectedTradingDay) out.push(sym);
    }
    out.sort();
    return out;
  })();

  const opsComputed = {
    providers: opsProviders.sort((a, b) => String(a.name).localeCompare(String(b.name))),
    pipeline: {
      expected: pipelineExpected,
      fetched,
      validatedStored,
      computed,
      staticReady,
      missing
    },
    freshness: {
      latestSnapshotDate: pricesSnapDate,
      expectedTradingDay,
      staleCount: staleList.length,
      staleList
    },
    safety: {
      kvWritesToday,
      pollingDefaultOff: true,
      runtimeWritesDisabled: true
    }
  };

  const opsDailyBaseline = opsDaily?.baseline && typeof opsDaily.baseline === 'object' ? opsDaily.baseline : null;
  const opsBaseline = opsDailyBaseline || baselineFromComputed(opsComputed);
  const opsBaselineAsOf = typeof opsDaily?.asOf === 'string' ? opsDaily.asOf : null;
  const baselineVerdict = computeVerdictFromBaseline(opsBaseline);
  const baselineMissing = !opsDailyBaseline;
  const overall = {
    verdict: baselineMissing ? 'DEGRADED' : baselineVerdict.verdict,
    reason: baselineMissing ? 'OPS_DAILY_MISSING' : baselineVerdict.reason
  };
  let baselineExplain = null;
  if (
    overall.verdict === 'RISK' &&
    typeof overall.reason === 'string' &&
    overall.reason.includes('PIPELINE_STATIC_READY=')
  ) {
    const expectedVal = opsBaseline?.pipeline?.expected;
    const staticReadyVal = opsBaseline?.pipeline?.staticReady;
    const expectedNum = Number(expectedVal);
    const staticReadyNum = Number(staticReadyVal);
    if (Number.isFinite(expectedNum) && Number.isFinite(staticReadyNum) && staticReadyNum < expectedNum) {
      baselineExplain =
        `Coverage ist noch niedrig (computed/static-ready erst ${staticReadyNum}/${expectedNum}). ` +
        'Das ist in der Initialphase erwartbar, bis KV-Bars & Ops-Daily die Analysen für alle Ticker aufgebaut haben. ' +
        'RISK bleibt, bis static-ready ~ expected.';
    }
  }
  const opsBaselineOverall = baselineExplain ? { ...overall, explain: baselineExplain } : overall;

  let opsLiveResolved = null;
  if (wantsLive) {
    const cf = await fetchCloudflareWorkerRequests(env);
    opsLiveResolved = {
      asOf: startedAtIso,
      cloudflare: {
        requestsToday: cf.requestsToday,
        requestsLast24h: cf.requestsLast24h,
        notes: cf.notes
      }
    };
  }

  const payload = {
    schema_version: '3.0',
    meta: {
      asOf: startedAtIso,
      baselineAsOf: opsBaselineAsOf,
      liveAsOf: wantsLive ? startedAtIso : null
    },
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
      request: { debug: isDebug },
      status: 'OK',
      warnings: []
    },
    data: {
      asOf: startedAtIso,
      hasKV,
      calls: { day: dayTotal.value, week: weekTotal.value, month: monthTotal.value },
      endpoints: { dayTop: endpointsDayTop },
      kvOps: { day: kvOpsDay },
      providers: { day: providersDay },
      failures: { day: failuresDay },
      budgets,
      deploy,
      opsBaseline: {
        asOf: opsBaselineAsOf,
        overall: opsBaselineOverall,
        baseline: opsBaseline
      },
      opsComputed: {
        asOf: startedAtIso,
        overall,
        baseline: opsComputed
      },
      opsLive: opsLiveResolved,
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
  if (!wantsLive && !isDebug) {
    LAST_CACHE = body;
    LAST_CACHE_AT_MS = Date.now();
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': wantsLive ? 'no-store' : 'public, max-age=10, s-maxage=10, stale-while-revalidate=60'
    }
  });
}
