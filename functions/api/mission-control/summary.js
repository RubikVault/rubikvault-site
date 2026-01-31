import { sha256Hex } from '../_shared/digest.mjs';
import { buildDashKeys, kvGetJsonKVSafe, computeBudgets, summarizeProviderStats } from '../_shared/telemetry.mjs';
import {
  validateHealthProfiles,
  validateThresholds,
  validateSourceMap,
  validatePipelineArtifact,
  validateSnapshot,
  trimErrors
} from '../_shared/contracts.js';

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
  const expected = toIntOrNull(doc.expected);
  let count = toIntOrNull(doc.count);
  const missing = Array.isArray(doc.missing) ? doc.missing : [];
  if (count == null && Number.isFinite(expected) && expected >= 0 && Array.isArray(missing)) {
    count = Math.max(0, expected - missing.length);
  }
  return {
    universe: typeof doc.universe === 'string' ? doc.universe : null,
    expected,
    count,
    reason: doc.reason ? String(doc.reason) : null,
    missing
  };
}

function normalizePipelineLatest(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const counts = doc.counts && typeof doc.counts === 'object' ? doc.counts : {};
  return {
    universe: typeof doc.universe === 'string' ? doc.universe : null,
    generated_at: typeof doc.generated_at === 'string' ? doc.generated_at : null,
    type: typeof doc.type === 'string' ? doc.type : null,
    counts: {
      expected: toIntOrNull(counts.expected),
      fetched: toIntOrNull(counts.fetched),
      validated: toIntOrNull(counts.validated),
      computed: toIntOrNull(counts.computed),
      static_ready: toIntOrNull(counts.static_ready)
    },
    root_failure: doc.root_failure || null,
    degraded_summary: doc.degraded_summary || null,
    source: '/data/pipeline/nasdaq100.latest.json'
  };
}

function normalizeEodManifest(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const total = toIntOrNull(doc.total_symbols ?? doc.expected ?? null);
  const chunks = Array.isArray(doc.chunks) ? doc.chunks : [];
  const count = chunks.reduce((sum, chunk) => sum + (toIntOrNull(chunk?.count) ?? 0), 0);
  const ok = chunks.reduce((sum, chunk) => sum + (toIntOrNull(chunk?.ok) ?? 0), 0);
  return {
    total,
    count,
    ok,
    generated_at: typeof doc.generated_at === 'string' ? doc.generated_at : null,
    source: '/data/eod/manifest.latest.json'
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

function detectPreviewMode(url, env) {
  const hostname = url?.hostname || '';
  const isPages = hostname.endsWith('.pages.dev');
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isProd = hostname === 'rubikvault.com' || hostname === 'www.rubikvault.com';
  const hasCron = Boolean(env?.CRON_TRIGGER);
  return {
    isPreview: isPages || isLocalhost,
    isProduction: isProd,
    hasCron,
    hostname
  };
}

const HEALTH_STATUS = ['OK', 'INFO', 'WARNING', 'CRITICAL'];

function pickProfile(previewMode, profiles) {
  if (previewMode?.isProduction && profiles?.production) return { key: 'production', profile: profiles.production };
  if (profiles?.preview) return { key: 'preview', profile: profiles.preview };
  return { key: 'preview', profile: null };
}

function toHealthStatus(value) {
  return HEALTH_STATUS.includes(value) ? value : 'INFO';
}

function contractResult(valid, errors = []) {
  return {
    valid: Boolean(valid),
    errors: trimErrors(errors)
  };
}

function parseIsoToMs(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function computeFreshnessStatus(ageHours, thresholds, expected) {
  if (!expected) return { status: 'INFO', reason: 'NOT_EXPECTED' };
  if (!Number.isFinite(ageHours)) return { status: 'WARNING', reason: 'FRESHNESS_UNKNOWN' };
  const warn = thresholds?.freshness_warn_hours;
  const crit = thresholds?.freshness_crit_hours;
  if (Number.isFinite(crit) && ageHours >= crit) return { status: 'CRITICAL', reason: `STALE_${Math.round(ageHours)}h` };
  if (Number.isFinite(warn) && ageHours >= warn) return { status: 'WARNING', reason: `STALE_${Math.round(ageHours)}h` };
  return { status: 'OK', reason: 'FRESH' };
}

function computePipelineStatus(counts, expected, isExpected) {
  if (!isExpected) return { status: 'INFO', reason: 'NOT_EXPECTED' };
  if (!Number.isFinite(expected) || expected <= 0) return { status: 'WARNING', reason: 'EXPECTED_UNKNOWN' };
  const staticReady = Number(counts?.static_ready);
  if (!Number.isFinite(staticReady)) return { status: 'CRITICAL', reason: 'STATIC_READY_UNKNOWN' };
  if (staticReady <= 0) return { status: 'CRITICAL', reason: `STATIC_READY_${staticReady}/${expected}` };
  if (staticReady < expected) return { status: 'WARNING', reason: `STATIC_READY_${staticReady}/${expected}` };
  return { status: 'OK', reason: 'STATIC_READY_OK' };
}

function buildTruthChainStep(id, title, status, evidence, details = null) {
  return { id, title, status, evidence, details };
}

function statusForCount(count, expected) {
  const c = Number(count);
  const e = Number(expected);
  if (!Number.isFinite(c)) return 'UNKNOWN';
  if (!Number.isFinite(e) || e <= 0) {
    return c > 0 ? 'OK' : 'UNKNOWN';
  }
  if (c <= 0) return 'FAIL';
  if (c < e) return 'WARN';
  return 'OK';
}

function buildNasdaq100TruthChain(pipelineTruths, snapshotInfo, runtimeInfo, asOf) {
  const { fetched, validated, computed, staticReady } = pipelineTruths;
  const steps = [];

  // S1 — Provider fetch attempted
  const s1Status = statusForCount(fetched?.count, fetched?.expected);
  steps.push(buildTruthChainStep('S1', 'Provider fetch attempted', s1Status, {
    count: fetched?.count ?? null,
    expected: fetched?.expected ?? null,
    path: '/data/pipeline/nasdaq100.fetched.json'
  }, fetched?.reason || null));

  // S2 — Responses parseable
  const s2Status = statusForCount(validated?.count, validated?.expected);
  steps.push(buildTruthChainStep('S2', 'Responses parseable', s2Status, {
    count: validated?.count ?? null,
    expected: validated?.expected ?? null,
    path: '/data/pipeline/nasdaq100.validated.json'
  }, validated?.reason || null));

  // S3 — EOD fields validated
  const s3Status = statusForCount(validated?.count, validated?.expected);
  steps.push(buildTruthChainStep('S3', 'EOD fields validated', s3Status, {
    validatedCount: validated?.count ?? null,
    note: 'Validation occurs during fetch pipeline'
  }, null));

  // S4 — Stored in public/data
  const snapshotOk = snapshotInfo?.recordCount > 0;
  const s4Status = snapshotOk ? 'OK' : (snapshotInfo?.ok === false ? 'FAIL' : 'UNKNOWN');
  steps.push(buildTruthChainStep('S4', 'Stored in public/data', s4Status, {
    snapshotPath: '/data/snapshots/market-prices/latest.json',
    recordCount: snapshotInfo?.recordCount ?? null,
    asOf: snapshotInfo?.asOf ?? null
  }, snapshotOk ? null : 'Market-prices snapshot may be missing or empty'));

  // S5 — Indicators computed (marketphase)
  const computedExpected = computed?.expected ?? 100;
  const computedCount = computed?.count ?? 0;
  const s5Status = computedCount >= computedExpected ? 'OK' : (computedCount > 0 ? 'WARN' : 'FAIL');
  const missingReasons = computed?.missing?.length > 0
    ? [...new Set(computed.missing.map(m => m.reason))].join(', ')
    : null;
  steps.push(buildTruthChainStep('S5', 'Indicators computed (marketphase)', s5Status, {
    count: computedCount,
    expected: computedExpected,
    missingCount: computed?.missing?.length ?? 0,
    path: '/data/pipeline/nasdaq100.computed.json',
    sampleReasons: missingReasons
  }, s5Status === 'FAIL' ? `Indicator files not generated for ${computedExpected - computedCount} symbols` : null));

  // S6 — Static-ready index
  const staticExpected = staticReady?.expected ?? 100;
  const staticCount = staticReady?.count ?? 0;
  const s6Status = staticCount >= staticExpected ? 'OK' : (staticCount > 0 ? 'WARN' : 'FAIL');
  steps.push(buildTruthChainStep('S6', 'Static-ready index', s6Status, {
    count: staticCount,
    expected: staticExpected,
    path: '/data/pipeline/nasdaq100.static-ready.json'
  }, s6Status !== 'OK' ? `static-ready ${staticCount}/${staticExpected}` : null));

  // S7 — Public serving
  const s7Status = snapshotOk ? 'OK' : 'UNKNOWN';
  steps.push(buildTruthChainStep('S7', 'Public serving', s7Status, {
    note: snapshotOk ? 'Market-prices snapshot accessible' : 'Cannot verify without probe'
  }, null));

  // S8 — Runtime bindings
  const hasKV = runtimeInfo?.hasKV ?? false;
  const s8Status = hasKV ? 'OK' : 'WARN';
  steps.push(buildTruthChainStep('S8', 'Runtime bindings', s8Status, {
    hasKV,
    isPreview: runtimeInfo?.isPreview ?? false,
    hostname: runtimeInfo?.hostname ?? null
  }, hasKV ? null : 'KV binding not available (static/preview mode)'));

  // Determine first blocker
  const firstFail = steps.find(s => s.status === 'FAIL');
  const firstWarn = steps.find(s => s.status === 'WARN');
  const firstStep = firstFail || firstWarn || null;
  const firstBlocker = firstStep
    ? { id: firstStep.id, title: firstStep.title, status: firstStep.status }
    : null;

  return {
    chain_version: 'v1',
    asOf,
    steps,
    first_blocker: firstBlocker,
    first_blocker_id: firstStep?.id || null
  };
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

  const [opsDaily, usageReport, providerState, seedManifest, nasdaq100Universe, marketPhaseIndex, healthProfilesRaw, thresholdsRaw, sourceMapRaw, eodManifestRaw] = await Promise.all([
    fetchAssetJson(request.url, '/data/ops-daily.json', null),
    fetchAssetJson(request.url, '/data/usage-report.json', null),
    fetchAssetJson(request.url, '/data/provider-state.json', null),
    fetchAssetJson(request.url, '/data/seed-manifest.json', null),
    fetchAssetJson(request.url, '/data/universe/nasdaq100.json', []),
    fetchAssetJson(request.url, '/data/marketphase/index.json', null),
    fetchAssetJson(request.url, '/data/ops/health-profiles.v1.json', null),
    fetchAssetJson(request.url, '/data/ops/thresholds.v1.json', null),
    fetchAssetJson(request.url, '/data/ops/source-map.v1.json', null),
    fetchAssetJson(request.url, '/data/eod/manifest.latest.json', null)
  ]);

  const healthProfilesCheck = validateHealthProfiles(healthProfilesRaw);
  const thresholdsCheck = validateThresholds(thresholdsRaw);
  const sourceMapCheck = validateSourceMap(sourceMapRaw);
  const healthProfiles = healthProfilesCheck.valid ? healthProfilesRaw : null;
  const thresholds = thresholdsCheck.valid ? thresholdsRaw : null;
  const sourceMap = sourceMapCheck.valid ? sourceMapRaw : null;

  const previewMode = detectPreviewMode(url, env);
  const profilePick = pickProfile(previewMode, healthProfiles?.profiles || {});
  const profile = profilePick.profile || { expected: { scheduler: !previewMode.isPreview, kv: !previewMode.isPreview, pipeline: !previewMode.isPreview }, not_expected_status: 'INFO' };
  const expectedFlags = profile.expected || { scheduler: !previewMode.isPreview, kv: !previewMode.isPreview, pipeline: !previewMode.isPreview };

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
    const usedMonthRaw = toNumber(monthly.used);
    const limitMonthRaw = toNumber(monthly.limit);
    const remainingMonthRaw = toNumber(monthly.remaining);
    const remainingPctRaw = toNumber(monthly.pctRemaining);
    const usedToday = toNumber(daily.used);

    const limitMonth = Number.isFinite(limitMonthRaw) ? limitMonthRaw : null;
    const usedMonth = usedMonthRaw == null && limitMonth != null ? 0 : usedMonthRaw;
    const remainingMonth = remainingMonthRaw != null
      ? remainingMonthRaw
      : (limitMonth != null && usedMonth != null ? Math.max(0, limitMonth - usedMonth) : null);
    const remainingPct = remainingPctRaw != null
      ? Math.round(remainingPctRaw * 1000) / 10
      : (limitMonth != null && remainingMonth != null
        ? Math.round(((remainingMonth / limitMonth) * 1000)) / 10
        : null);

    return {
      name,
      usedMonth,
      limitMonth,
      remainingMonth,
      remainingPct,
      resetDate: null,
      runtimeCallsToday: usedToday == null ? 0 : usedToday
    };
  });

  if (!opsProviders.some((p) => p.name === 'tiingo')) {
    opsProviders.push({
      name: 'tiingo',
      usedMonth: 0,
      limitMonth: 5000,
      remainingMonth: 5000,
      remainingPct: 100,
      resetDate: null,
      runtimeCallsToday: 0
    });
  }

  const [pipelineFetchedRaw, pipelineValidatedRaw, pipelineComputedRaw, pipelineStaticReadyRaw, pipelineLatestRaw, pipelineTruthRaw] = await Promise.all([
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.fetched.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.validated.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.computed.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.static-ready.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.latest.json', null),
    fetchAssetJson(request.url, '/data/pipeline/nasdaq100.pipeline-truth.json', null)
  ]);

  const pipelineFetched = normalizePipelineTruth(pipelineFetchedRaw);
  const pipelineValidated = normalizePipelineTruth(pipelineValidatedRaw);
  const pipelineComputedTruth = normalizePipelineTruth(pipelineComputedRaw);
  const pipelineStaticReadyTruth = normalizePipelineTruth(pipelineStaticReadyRaw);
  const pipelineLatest = normalizePipelineLatest(pipelineLatestRaw);
  const pipelineTruth = pipelineTruthRaw && typeof pipelineTruthRaw === 'object' ? pipelineTruthRaw : null;

  const pipelineFetchedCheck = pipelineFetchedRaw ? validatePipelineArtifact(pipelineFetchedRaw) : { valid: false, errors: ['artifact missing'] };
  const pipelineValidatedCheck = pipelineValidatedRaw ? validatePipelineArtifact(pipelineValidatedRaw) : { valid: false, errors: ['artifact missing'] };
  const pipelineComputedCheck = pipelineComputedRaw ? validatePipelineArtifact(pipelineComputedRaw) : { valid: false, errors: ['artifact missing'] };
  const pipelineStaticReadyCheck = pipelineStaticReadyRaw ? validatePipelineArtifact(pipelineStaticReadyRaw) : { valid: false, errors: ['artifact missing'] };

  const pipelineLatestCounts = pipelineLatest?.counts && typeof pipelineLatest.counts === 'object'
    ? pipelineLatest.counts
    : null;

  const pipelineExpected =
    (Number.isFinite(Number(pipelineLatestCounts?.expected)) ? Number(pipelineLatestCounts.expected) : null) ??
    pipelineFetched?.expected ??
    pipelineValidated?.expected ??
    pipelineComputedTruth?.expected ??
    pipelineStaticReadyTruth?.expected ??
    (nasdaqExpected || 100);

  const ensureCount = (truthDoc) => {
    if (truthDoc && Number.isFinite(Number(truthDoc.count))) return Number(truthDoc.count);
    if (expectedFlags.pipeline && Number.isFinite(Number(pipelineExpected))) return 0;
    return null;
  };

  const fetched = ensureCount(pipelineFetched);
  const validatedStored = ensureCount(pipelineValidated);
  const computed = ensureCount(pipelineComputedTruth);
  const staticReady = ensureCount(pipelineStaticReadyTruth);
  const missing = pipelineStaticReadyTruth?.missing ?? [];

  const resolveCount = (latestValue, fallbackValue) => {
    if (Number.isFinite(Number(latestValue))) return Number(latestValue);
    if (!expectedFlags.pipeline) return null;
    return fallbackValue;
  };

  const pipelineCounts = {
    expected: pipelineExpected,
    fetched: resolveCount(pipelineLatestCounts?.fetched, fetched),
    validated: resolveCount(pipelineLatestCounts?.validated, validatedStored),
    computed: resolveCount(pipelineLatestCounts?.computed, computed),
    static_ready: resolveCount(pipelineLatestCounts?.static_ready, staticReady)
  };

  const eodManifest = normalizeEodManifest(eodManifestRaw);
  const eodCounts = eodManifest
    ? {
      expected: eodManifest.total,
      fetched: eodManifest.ok,
      validated: eodManifest.ok
    }
    : null;

  const marketPricesSnapshot = await fetchAssetJson(request.url, '/data/snapshots/market-prices/latest.json', null);
  const marketPricesSnapshotCheck = marketPricesSnapshot
    ? validateSnapshot(marketPricesSnapshot)
    : { valid: false, errors: ['artifact missing'] };
  const pricesSnapDate = (() => {
    const snap = marketPricesSnapshot;
    const d0 = Array.isArray(snap?.data) && snap.data.length ? snap.data[0] : null;
    const meta = snap?.metadata || {};
    const metaAsOf = snap?.meta?.asOf || snap?.meta?.as_of || null;
    return (
      (typeof metaAsOf === 'string' ? metaAsOf.slice(0, 10) : null) ||
      d0?.date ||
      (typeof meta.fetched_at === 'string' ? meta.fetched_at.slice(0, 10) : null) ||
      null
    );
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
      fetched: pipelineCounts.fetched,
      validatedStored: pipelineCounts.validated,
      computed: pipelineCounts.computed,
      staticReady: pipelineCounts.static_ready,
      missing
    },
    pipelineLatest,
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
  let opsBaseline = opsDailyBaseline || baselineFromComputed(opsComputed);
  if (!expectedFlags.pipeline && pipelineLatestCounts) {
    opsBaseline = {
      ...opsBaseline,
      pipeline: {
        ...(opsBaseline?.pipeline || {}),
        expected: pipelineCounts.expected,
        fetched: pipelineCounts.fetched,
        validatedStored: pipelineCounts.validated,
        computed: pipelineCounts.computed,
        staticReady: pipelineCounts.static_ready
      }
    };
  }
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
        `Coverage is still low (computed/static-ready is ${staticReadyNum}/${expectedNum}). ` +
        'This is expected during the initial ramp-up until KV bars and ops-daily build analyses for all tickers. ' +
        'RISK remains until static-ready is near expected.';
    }
  }
  const opsBaselineOverall = baselineExplain ? { ...overall, explain: baselineExplain } : overall;

  // Build Truth-Chain for NASDAQ-100 pipeline
  const snapshotInfo = {
    ok: marketPricesSnapshot != null,
    recordCount: Array.isArray(marketPricesSnapshot?.data) ? marketPricesSnapshot.data.length : 0,
    asOf: marketPricesSnapshot?.meta?.asOf || marketPricesSnapshot?.metadata?.fetched_at || marketPricesSnapshot?.metadata?.published_at || null
  };
  const runtimeInfo = {
    hasKV,
    isPreview: previewMode.isPreview,
    isProduction: previewMode.isProduction,
    hostname: previewMode.hostname
  };
  const pipelineTruths = {
    fetched: pipelineFetched,
    validated: pipelineValidated,
    computed: pipelineComputedTruth,
    staticReady: pipelineStaticReadyTruth
  };
  const truthChainNasdaq100 = buildNasdaq100TruthChain(pipelineTruths, snapshotInfo, runtimeInfo, startedAtIso);

  // Runtime context for scheduler expectation
  const schedulerExpected = Boolean(expectedFlags.scheduler);
  const schedulerExpectedReason = schedulerExpected
    ? 'Production: cron expected'
    : 'Preview/Static: cron not expected';

  const opsBaselineRuntime = {
    hasKV,
    isPreview: previewMode.isPreview,
    isProduction: previewMode.isProduction,
    hostname: previewMode.hostname,
    schedulerExpected,
    schedulerExpectedReason,
    kvExpected: expectedFlags.kv,
    pipelineExpected: expectedFlags.pipeline
  };

  const snapshotAsOfIso =
    marketPricesSnapshot?.meta?.asOf ||
    marketPricesSnapshot?.metadata?.published_at ||
    marketPricesSnapshot?.metadata?.fetched_at ||
    null;
  const snapshotAsOfMs = parseIsoToMs(snapshotAsOfIso);
  const ageHours = snapshotAsOfMs ? (Date.now() - snapshotAsOfMs) / (1000 * 60 * 60) : null;
  const thresholdProfile = thresholds?.[profilePick.key] || thresholds?.production || null;

  let pipelineHealth = computePipelineStatus(pipelineCounts, pipelineExpected, expectedFlags.pipeline);
  const pipelineContractOk = pipelineFetchedCheck.valid && pipelineValidatedCheck.valid && pipelineComputedCheck.valid && pipelineStaticReadyCheck.valid;
  if (expectedFlags.pipeline && !pipelineContractOk) {
    pipelineHealth = { status: 'CRITICAL', reason: 'PIPELINE_CONTRACT_INVALID' };
  }

  let freshnessHealth = computeFreshnessStatus(ageHours, thresholdProfile, expectedFlags.pipeline);
  if (expectedFlags.pipeline && !marketPricesSnapshotCheck.valid) {
    freshnessHealth = { status: 'CRITICAL', reason: 'SNAPSHOT_CONTRACT_INVALID' };
  }

  const platformStatus = expectedFlags.kv ? (hasKV ? 'OK' : 'CRITICAL') : toHealthStatus(profile.not_expected_status);
  const apiStatus = 'OK';

  const health = {
    platform: {
      status: platformStatus,
      reason: expectedFlags.kv ? (hasKV ? 'KV_OK' : 'KV_MISSING') : 'NOT_EXPECTED',
      action: {
        url: '/data/ops/health-profiles.v1.json',
        howTo: expectedFlags.kv ? 'Verify KV binding for RV_KV' : 'Preview mode: KV not expected'
      }
    },
    api: {
      status: apiStatus,
      reason: 'SUMMARY_OK',
      action: {
        url: '/api/mission-control/summary',
        howTo: 'Inspect summary output'
      }
    },
    freshness: {
      status: freshnessHealth.status,
      reason: freshnessHealth.reason,
      age_hours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
      asOf: snapshotAsOfIso,
      action: {
        url: '/data/snapshots/market-prices/latest.json',
        howTo: 'Refresh market-prices snapshot'
      }
    },
    pipeline: {
      status: pipelineHealth.status,
      reason: pipelineHealth.reason,
      counts: pipelineCounts,
      first_blocker: pipelineTruth?.first_blocker_id || pipelineTruth?.first_blocker?.id || null,
      action: {
        url: '/data/pipeline/nasdaq100.latest.json',
        howTo: expectedFlags.pipeline ? 'Run scheduler/pipeline jobs' : 'Preview mode: pipeline not expected'
      }
    }
  };

  const contracts = {
    configs: {
      health_profiles: contractResult(healthProfilesCheck.valid, healthProfilesCheck.errors),
      thresholds: contractResult(thresholdsCheck.valid, thresholdsCheck.errors),
      source_map: contractResult(sourceMapCheck.valid, sourceMapCheck.errors)
    },
    snapshots: {
      market_prices: contractResult(marketPricesSnapshotCheck.valid, marketPricesSnapshotCheck.errors)
    },
    pipeline: {
      fetched: contractResult(pipelineFetchedCheck.valid, pipelineFetchedCheck.errors),
      validated: contractResult(pipelineValidatedCheck.valid, pipelineValidatedCheck.errors),
      computed: contractResult(pipelineComputedCheck.valid, pipelineComputedCheck.errors),
      static_ready: contractResult(pipelineStaticReadyCheck.valid, pipelineStaticReadyCheck.errors)
    }
  };

  const contractsOk =
    healthProfilesCheck.valid &&
    thresholdsCheck.valid &&
    sourceMapCheck.valid &&
    marketPricesSnapshotCheck.valid &&
    pipelineContractOk;
  const contractCritical = previewMode.isProduction && !contractsOk;

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
      liveAsOf: startedAtIso
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
      health,
      runtime: {
        env: profilePick.key,
        expected: expectedFlags,
        schedulerExpected,
        schedulerExpectedReason,
        kvExpected: expectedFlags.kv,
        pipelineExpected: expectedFlags.pipeline,
        hostname: previewMode.hostname
      },
      sourceMap,
      contracts,
      calls: { day: dayTotal.value, week: weekTotal.value, month: monthTotal.value },
      endpoints: { dayTop: endpointsDayTop },
      kvOps: { day: kvOpsDay },
      providers: { day: providersDay },
      failures: { day: failuresDay },
      budgets,
      deploy,
      pipeline: {
        counts: pipelineCounts,
        latest: pipelineLatest,
        truth: pipelineTruth,
        missing
      },
      eod: eodManifest
        ? {
          counts: eodCounts,
          manifest: eodManifest
        }
        : null,
      opsBaseline: {
        asOf: opsBaselineAsOf,
        overall: opsBaselineOverall,
        baseline: opsBaseline,
        runtime: opsBaselineRuntime,
        pipelineLatest,
        truthChain: {
          nasdaq100: truthChainNasdaq100
        }
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
  if (contractCritical) {
    payload.metadata.status = 'ERROR';
    payload.metadata.warnings = payload.metadata.warnings || [];
    payload.metadata.warnings.push('CONTRACT_INVALID');
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
