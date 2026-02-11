import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

function isoNow() {
  return new Date().toISOString();
}

function lastTradingDayIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function readJson(relPath, fallback = null) {
  try {
    const p = path.join(REPO_ROOT, relPath);
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readJsonOptional(relPath) {
  return readJson(relPath, null);
}

async function atomicWriteJson(relPath, value) {
  const full = path.join(REPO_ROOT, relPath);
  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${full}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, full);
}

function isLegacyPipelineDoc(doc) {
  return doc && typeof doc === 'object' && typeof doc.universe === 'string' && 'expected' in doc && 'count' in doc && 'missing' in doc;
}

function isPipelineLatestDoc(doc) {
  return doc
    && typeof doc === 'object'
    && doc.type === 'pipeline.truth'
    && typeof doc.universe === 'string'
    && doc.counts
    && typeof doc.counts === 'object';
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function readLegacyPipelineTruth(relPath) {
  const doc = await readJson(relPath, null);
  if (!doc) {
    return { ok: false, doc: null, reason: 'PIPELINE_TRUTH_FILE_NOT_FOUND' };
  }
  if (!isLegacyPipelineDoc(doc)) {
    return { ok: false, doc: null, reason: 'PIPELINE_TRUTH_INVALID_SCHEMA' };
  }
  return { ok: true, doc, reason: null };
}

async function readPipelineLatest(relPath) {
  const doc = await readJson(relPath, null);
  if (!doc) {
    return { ok: false, doc: null, reason: 'PIPELINE_LATEST_FILE_NOT_FOUND' };
  }
  if (!isPipelineLatestDoc(doc)) {
    return { ok: false, doc: null, reason: 'PIPELINE_LATEST_INVALID_SCHEMA' };
  }
  return { ok: true, doc, reason: null };
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStageCount(count, truthDoc, expected) {
  const value = toIntOrNull(count);
  if (value === 0 && Number.isFinite(expected) && expected > 0) {
    const missing = Array.isArray(truthDoc?.missing) ? truthDoc.missing.length : 0;
    if (missing >= expected) return null;
  }
  return value;
}

function resolveStageOrLatest(stageDoc, expected, latestValue) {
  const latestNum = toIntOrNull(latestValue);
  if (Number.isFinite(latestNum)) return latestNum;
  if (!stageDoc || typeof stageDoc !== 'object') return null;
  const stageNum = normalizeStageCount(stageDoc.count, stageDoc, expected);
  return Number.isFinite(stageNum) ? stageNum : null;
}

async function fetchCloudflareWorkerRequests({ accountId, apiToken }) {
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
      requestsToday: toNumberOrNull(today),
      requestsLast24h: toNumberOrNull(last24h),
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

function buildProvidersBaseline(usageReport) {
  const providers = usageReport?.providers && typeof usageReport.providers === 'object'
    ? usageReport.providers
    : {};
  const limits = usageReport?.limits && typeof usageReport.limits === 'object'
    ? usageReport.limits
    : {};

  const names = new Set([
    ...Object.keys(providers),
    ...Object.keys(limits)
  ]);

  const out = Array.from(names).map((name) => {
    const entry = providers[name] || {};
    const daily = entry?.daily || {};
    const monthly = entry?.monthly || {};
    const limitCfg = limits[name] || {};

    const usedToday = toNumberOrNull(daily.used);
    const usedMonth = toNumberOrNull(monthly.used);
    const limitMonth = toNumberOrNull(monthly.limit ?? limitCfg.monthlyRequests);
    const limitDay = toNumberOrNull(daily.limit ?? limitCfg.dailyRequests);

    const normalizedUsedMonth = usedMonth == null ? 0 : usedMonth;
    const normalizedUsedToday = usedToday == null ? 0 : usedToday;

    const remainingMonth = limitMonth == null || normalizedUsedMonth == null
      ? null
      : Math.max(0, limitMonth - normalizedUsedMonth);
    const remainingPct = limitMonth && normalizedUsedMonth != null
      ? Math.round(((remainingMonth / limitMonth) * 1000)) / 10
      : null;

    return {
      name,
      usedMonth: normalizedUsedMonth,
      limitMonth: limitMonth ?? null,
      remainingMonth,
      remainingPct,
      resetDate: null,
      runtimeCallsToday: normalizedUsedToday
    };
  });

  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

async function main() {
  const asOf = isoNow();

  // --- Phase 3A: Write shared build-meta SSOT ---
  let commitRaw = String(process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').trim() || null;
  if (!commitRaw) {
    try { commitRaw = (await import('node:child_process')).execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim() || null; } catch { /* no git */ }
  }
  const shortCommit = commitRaw ? commitRaw.slice(0, 8) : 'unknown';
  const stamp = asOf.replace(/[-:]/g, '').slice(0, 13);
  const sequence = String(process.env.GITHUB_RUN_NUMBER || 'local');
  const buildId = `${shortCommit}-${stamp}-${sequence}`;
  const buildMetaDoc = {
    meta: { build_id: buildId, commit: commitRaw, generatedAt: asOf },
    data: { build_id: buildId, commit: commitRaw, deploy_target: process.env.GITHUB_RUN_NUMBER ? 'ci' : 'local' }
  };
  await atomicWriteJson('public/data/ops/build-meta.json', buildMetaDoc);
  console.log(`build-meta.json written (build_id=${buildId})`);

  const nasdaq100 = await readJson('public/data/universe/all.json', []);
  const expectedUniverse = Array.isArray(nasdaq100) ? nasdaq100.length : 100;

  const pipelineLatest = await readPipelineLatest('public/data/pipeline/nasdaq100.latest.json');
  const truthFetched = await readLegacyPipelineTruth('public/data/pipeline/nasdaq100.fetched.json');
  const truthValidated = await readLegacyPipelineTruth('public/data/pipeline/nasdaq100.validated.json');
  const truthComputed = await readLegacyPipelineTruth('public/data/pipeline/nasdaq100.computed.json');
  const truthStaticReady = await readLegacyPipelineTruth('public/data/pipeline/nasdaq100.static-ready.json');

  const expectedPipeline = (() => {
    if (truthStaticReady.ok) return toIntOrNull(truthStaticReady.doc.expected);
    if (truthComputed.ok) return toIntOrNull(truthComputed.doc.expected);
    if (truthValidated.ok) return toIntOrNull(truthValidated.doc.expected);
    if (truthFetched.ok) return toIntOrNull(truthFetched.doc.expected);
    if (pipelineLatest.ok) return toIntOrNull(pipelineLatest.doc.counts?.expected);
    return expectedUniverse;
  })();

  const pipelineReason = (() => {
    if (pipelineLatest.ok && pipelineLatest.doc.root_failure?.class) return String(pipelineLatest.doc.root_failure.class);
    const r = truthFetched.ok ? truthFetched.doc.reason : truthFetched.reason;
    if (r) return String(r);
    const r2 = truthValidated.ok ? truthValidated.doc.reason : truthValidated.reason;
    if (r2) return String(r2);
    const r3 = truthComputed.ok ? truthComputed.doc.reason : truthComputed.reason;
    if (r3) return String(r3);
    const r4 = truthStaticReady.ok ? truthStaticReady.doc.reason : truthStaticReady.reason;
    if (r4) return String(r4);
    return null;
  })();

  const pipelineMissing = (() => {
    if (truthStaticReady.ok && Array.isArray(truthStaticReady.doc.missing)) {
      return truthStaticReady.doc.missing;
    }
    if (pipelineLatest.ok && Array.isArray(pipelineLatest.doc.degraded_summary?.sample)) {
      return pipelineLatest.doc.degraded_summary.sample.map((entry) => ({
        ticker: entry.symbol || 'UNKNOWN',
        reason: entry.class || 'DEGRADED'
      }));
    }
    return [];
  })();

  const pipelineOps = (() => {
    if (pipelineLatest.ok) {
      return {
        universe: pipelineLatest.doc.universe,
        counts: pipelineLatest.doc.counts,
        degraded_summary: pipelineLatest.doc.degraded_summary,
        root_failure: pipelineLatest.doc.root_failure || null,
        generated_at: pipelineLatest.doc.generated_at
      };
    }

    const counts = {
      expected: expectedPipeline,
      fetched: truthFetched.ok ? toIntOrNull(truthFetched.doc.count) : null,
      validated: truthValidated.ok ? toIntOrNull(truthValidated.doc.count) : null,
      computed: truthComputed.ok ? toIntOrNull(truthComputed.doc.count) : null,
      static_ready: truthStaticReady.ok ? toIntOrNull(truthStaticReady.doc.count) : null
    };

    return {
      universe: 'nasdaq100',
      counts,
      degraded_summary: {
        count: pipelineMissing.length,
        classes: pipelineMissing.length ? { LEGACY_MISSING: pipelineMissing.length } : {},
        sample: pipelineMissing.slice(0, 25).map((entry) => ({
          symbol: entry.ticker || 'UNKNOWN',
          stage: 'legacy',
          class: 'LEGACY_MISSING',
          hint: entry.reason || 'missing',
          since: asOf
        }))
      },
      root_failure: pipelineReason ? { class: String(pipelineReason), hint: 'Legacy pipeline truth fallback' } : null,
      generated_at: asOf
    };
  })();

  let marketphaseIndex = await readJson('public/data/marketphase/index.json', null);

  // --- Phase 1A: Generate marketphase index.json if missing ---
  if (!marketphaseIndex || !Array.isArray(marketphaseIndex?.data?.symbols)) {
    const universeSymbols = Array.isArray(nasdaq100)
      ? nasdaq100.map(r => String(r?.ticker || r?.symbol || '').trim().toUpperCase()).filter(Boolean)
      : [];
    marketphaseIndex = {
      ok: true,
      feature: 'marketphase',
      meta: { generatedAt: asOf, source: 'build-ops-daily', status: 'ok', build_id: buildId },
      data: { symbols: universeSymbols }
    };
    await atomicWriteJson('public/data/marketphase/index.json', marketphaseIndex);
    console.log(`marketphase/index.json generated (${universeSymbols.length} symbols)`);
  }

  const pricesSnap = await readJson('public/data/snapshots/market-prices/latest.json', null);
  const pricesMeta = pricesSnap?.metadata || {};
  const pricesMetaV3 = pricesSnap?.meta || {};
  const d0 = Array.isArray(pricesSnap?.data) && pricesSnap.data.length ? pricesSnap.data[0] : null;
  const latestSnapshotDate =
    pricesMetaV3.data_date ||
    (typeof pricesMetaV3.asOf === 'string' ? pricesMetaV3.asOf.slice(0, 10) : null) ||
    d0?.date ||
    (typeof pricesMeta.fetched_at === 'string' ? pricesMeta.fetched_at.slice(0, 10) : null) ||
    null;

  const expectedTradingDay = lastTradingDayIso(new Date());

  const staleList = (() => {
    const out = [];
    const symbols = Array.isArray(marketphaseIndex?.data?.symbols) ? marketphaseIndex.data.symbols : [];
    for (const s of symbols) {
      const sym = s?.symbol ? String(s.symbol).toUpperCase() : null;
      const updatedAt = s?.updatedAt ? String(s.updatedAt).slice(0, 10) : null;
      if (!sym || !updatedAt) continue;
      if (updatedAt < expectedTradingDay) out.push(sym);
    }
    out.sort();
    return out;
  })();

  const budgetsConfig = await readJsonOptional('config/rv-budgets.json');
  const usageReport = await readJson('public/data/usage-report.json', null);
  const usageWithLimits = usageReport && typeof usageReport === 'object'
    ? {
      ...usageReport,
      limits: budgetsConfig?.providers || usageReport?.limits || {}
    }
    : { limits: budgetsConfig?.providers || {} };

  const providers = buildProvidersBaseline(usageWithLimits);

  const cf = await fetchCloudflareWorkerRequests({
    accountId: process.env.CF_ACCOUNT_ID,
    apiToken: process.env.CF_API_TOKEN || process.env.CF_API_KEY
  });

  const cfFallback = usageReport?.cloudflare || null;
  const cfRequestsToday = cf.requestsToday ?? toNumberOrNull(cfFallback?.daily?.used);
  const cfRequestsLast24h = cf.requestsLast24h ?? toNumberOrNull(cfFallback?.daily?.used);

  const safetySnapshot = await readJsonOptional('public/data/ops/safety.latest.json');
  const safetyNote = safetySnapshot?.note || 'No active locks detected';
  const safetyKvWrites = Number.isFinite(Number(safetySnapshot?.kvWritesToday))
    ? Number(safetySnapshot.kvWritesToday)
    : 0;

  const opsDaily = {
    schema_version: '1.0',
    asOf,
    baseline: {
      expectedUniverse,
      pipeline: {
        expected: expectedPipeline,
        fetched: resolveStageOrLatest(
          truthFetched.ok ? truthFetched.doc : null,
          expectedPipeline,
          pipelineLatest.ok ? pipelineLatest.doc.counts?.fetched : null
        ),
        validatedStored: resolveStageOrLatest(
          truthValidated.ok ? truthValidated.doc : null,
          expectedPipeline,
          pipelineLatest.ok ? pipelineLatest.doc.counts?.validated : null
        ),
        computed: resolveStageOrLatest(
          truthComputed.ok ? truthComputed.doc : null,
          expectedPipeline,
          pipelineLatest.ok ? pipelineLatest.doc.counts?.computed : null
        ),
        staticReady: resolveStageOrLatest(
          truthStaticReady.ok ? truthStaticReady.doc : null,
          expectedPipeline,
          pipelineLatest.ok ? pipelineLatest.doc.counts?.static_ready : null
        ),
        ...(pipelineReason ? { reason: pipelineReason } : {}),
        missing: pipelineMissing
      },
      freshness: {
        latestSnapshotDate,
        expectedTradingDay,
        staleCount: staleList.length,
        staleList
      },
      providers,
      cloudflare: {
        requestsToday: cfRequestsToday,
        requestsLast24h: cfRequestsLast24h,
        notes: cf.notes
      },
      safety: {
        kvWritesToday: safetyKvWrites,
        note: safetyNote
      }
    },
    ops: {
      pipeline: pipelineOps
    }
  };

  await atomicWriteJson('public/data/ops-daily.json', opsDaily);
}

await main();
