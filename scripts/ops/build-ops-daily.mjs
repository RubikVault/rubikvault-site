import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(REPO_ROOT, 'public', 'data');

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

async function atomicWriteJson(relPath, value) {
  const full = path.join(REPO_ROOT, relPath);
  const dir = path.dirname(full);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${full}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  await fs.rename(tmp, full);
}

async function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

function looksLikePipelineArtifact(rel) {
  const s = rel.replace(/\\/g, '/');
  if (!s.endsWith('.json')) return false;
  if (s === 'ops-daily.json') return false;
  if (s.includes('/pipeline/')) return true;
  if (s.includes('/mission-control/')) return true;
  if (/nasdaq[-_]?100/i.test(s)) return true;
  return false;
}

function extractPipelineCounts(obj) {
  const candidate = obj && typeof obj === 'object' && obj.pipeline && typeof obj.pipeline === 'object'
    ? obj.pipeline
    : null;
  const p = candidate;
  if (!p) return null;

  const expected = toNumberOrNull(p.expected);
  const fetched = toNumberOrNull(p.fetched);
  const validatedStored = toNumberOrNull(p.validatedStored);
  const computed = toNumberOrNull(p.computed);
  const staticReady = toNumberOrNull(p.staticReady);

  const hasAny = [expected, fetched, validatedStored, computed, staticReady].some((v) => v !== null);
  if (!hasAny) return null;

  return {
    expected,
    fetched,
    validatedStored,
    computed,
    staticReady
  };
}

async function discoverPipelineFromArtifacts() {
  const files = await walkFiles(PUBLIC_DATA_ROOT);
  const candidates = [];

  for (const full of files) {
    const rel = path.relative(PUBLIC_DATA_ROOT, full);
    if (!looksLikePipelineArtifact(rel)) continue;
    if (!full.endsWith('.json')) continue;
    candidates.push(full);
  }

  const withMtime = await Promise.all(candidates.map(async (full) => {
    try {
      const st = await fs.stat(full);
      return { full, mtimeMs: st.mtimeMs };
    } catch {
      return null;
    }
  }));

  const sorted = withMtime.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const item of sorted.slice(0, 50)) {
    try {
      const raw = await fs.readFile(item.full, 'utf-8');
      const json = JSON.parse(raw);
      const data = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? json.data : json;
      const extracted = extractPipelineCounts(data);
      if (extracted) return extracted;
    } catch {
      continue;
    }
  }

  return null;
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

  const out = Object.entries(providers).map(([name, entry]) => {
    const daily = entry?.daily || {};
    const monthly = entry?.monthly || {};
    const usedMonth = toNumberOrNull(monthly.used);
    const limitMonth = toNumberOrNull(monthly.limit);
    const remainingMonth = toNumberOrNull(monthly.remaining);
    const pctRemaining = toNumberOrNull(monthly.pctRemaining);

    const usedToday = toNumberOrNull(daily.used);

    return {
      name,
      usedMonth,
      limitMonth,
      remainingMonth,
      remainingPct: pctRemaining == null ? null : Math.round(pctRemaining * 1000) / 10,
      resetDate: null,
      runtimeCallsToday: usedToday
    };
  });

  if (!out.some((p) => p.name === 'tiingo')) {
    out.push({
      name: 'tiingo',
      usedMonth: null,
      limitMonth: null,
      remainingMonth: null,
      remainingPct: null,
      resetDate: null,
      runtimeCallsToday: null
    });
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

async function main() {
  const asOf = isoNow();

  const nasdaq100 = await readJson('public/data/universe/nasdaq100.json', []);
  const expectedUniverse = Array.isArray(nasdaq100) ? nasdaq100.length : 100;

  const marketphaseIndex = await readJson('public/data/marketphase/index.json', null);
  const marketphaseSymbols = Array.isArray(marketphaseIndex?.data?.symbols)
    ? marketphaseIndex.data.symbols
        .map((s) => (s?.symbol ? String(s.symbol).toUpperCase() : null))
        .filter(Boolean)
    : [];

  const marketphaseSet = new Set(marketphaseSymbols);
  const missing = Array.isArray(nasdaq100)
    ? nasdaq100
        .map((row) => {
          const t = row?.ticker ? String(row.ticker).toUpperCase() : null;
          if (!t) return null;
          if (marketphaseSet.has(t)) return null;
          return { ticker: t, reason: 'NO_STATIC_ANALYSIS' };
        })
        .filter(Boolean)
    : [];

  const discoveredPipeline = await discoverPipelineFromArtifacts();

  const pricesSnap = await readJson('public/data/snapshots/market-prices/latest.json', null);
  const pricesMeta = pricesSnap?.metadata || {};
  const d0 = Array.isArray(pricesSnap?.data) && pricesSnap.data.length ? pricesSnap.data[0] : null;
  const latestSnapshotDate = d0?.date || (typeof pricesMeta.fetched_at === 'string' ? pricesMeta.fetched_at.slice(0, 10) : null) || null;

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

  const usageReport = await readJson('public/data/usage-report.json', null);
  const providers = buildProvidersBaseline(usageReport);

  const cf = await fetchCloudflareWorkerRequests({
    accountId: process.env.CF_ACCOUNT_ID,
    apiToken: process.env.CF_API_TOKEN
  });

  const opsDaily = {
    schema_version: '1.0',
    asOf,
    baseline: {
      expectedUniverse,
      pipeline: {
        expected: discoveredPipeline && discoveredPipeline.expected != null ? discoveredPipeline.expected : expectedUniverse,
        fetched: discoveredPipeline ? discoveredPipeline.fetched : null,
        validatedStored: discoveredPipeline ? discoveredPipeline.validatedStored : null,
        computed: discoveredPipeline ? discoveredPipeline.computed : null,
        staticReady: discoveredPipeline ? discoveredPipeline.staticReady : null,
        reason: discoveredPipeline ? null : 'PIPELINE_ARTIFACT_NOT_FOUND',
        missing
      },
      freshness: {
        latestSnapshotDate,
        expectedTradingDay,
        staleCount: staleList.length,
        staleList
      },
      providers,
      cloudflare: {
        requestsToday: cf.requestsToday,
        requestsLast24h: cf.requestsLast24h,
        notes: cf.notes
      }
    }
  };

  await atomicWriteJson('public/data/ops-daily.json', opsDaily);
}

await main();
