import { sha256Hex } from '../_shared/digest.mjs';

const MODULE_NAME = 'mission-control-summary';
const MODULES_TO_TRACK = ['universe', 'market-prices', 'market-stats', 'market-score', 'stock'];
const SNAPSHOT_PATHS = [
  (moduleName) => `/data/snapshots/${moduleName}/latest.json`,
  (moduleName) => `/data/snapshots/${moduleName}.json`
];

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

  const kv = env?.RV_KV || null;
  const hasKV = kv && typeof kv.get === 'function' && typeof kv.put === 'function';

  const dayKey = `mc:calls:day:${isoDay(now)}`;
  const weekKey = `mc:calls:week:${isoWeek(now)}`;
  const monthKey = `mc:calls:month:${isoMonth(now)}`;

  const [dayTotal, weekTotal, monthTotal] = await Promise.all([
    kvGetInt(env, dayKey),
    kvGetInt(env, weekKey),
    kvGetInt(env, monthKey)
  ]);

  const topEndpoints = [];
  if (hasKV) {
    const endpoints = [
      '/api/stock',
      '/api/universe',
      '/api/resolve',
      '/api/diagnostics/tiingo',
      '/api/fundamentals'
    ];
    const rows = await Promise.all(
      endpoints.map(async (ep) => {
        const r = await kvGetInt(env, `${dayKey}:${ep}`);
        return { endpoint: ep, day: r.value };
      })
    );
    rows.sort((a, b) => b.day - a.day);
    for (const row of rows) {
      if (row.day > 0) topEndpoints.push(row);
    }
  }

  const snapshots = [];
  for (const moduleName of MODULES_TO_TRACK) {
    const info = await fetchSnapshotInfo(request.url, moduleName);
    snapshots.push({
      module: moduleName,
      ok: Boolean(info.ok),
      as_of: info.ok ? info.as_of : null,
      status: info.ok ? info.status : null,
      record_count: info.ok ? info.record_count : null,
      path: info.ok ? info.path : info.paths_checked
    });
  }

  let tiingoDiag = null;
  try {
    const diagUrl = new URL('/api/diagnostics/tiingo', request.url);
    if (isDebug) diagUrl.searchParams.set('debug', '1');
    const res = await fetch(diagUrl.toString());
    if (res.ok) {
      const payload = await res.json();
      tiingoDiag = payload?.data || null;
    }
  } catch {
    tiingoDiag = null;
  }

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
      kv: {
        hasKV
      },
      calls: {
        day: dayTotal.value,
        week: weekTotal.value,
        month: monthTotal.value
      },
      top_endpoints: topEndpoints,
      snapshots,
      tiingo: tiingoDiag
    },
    error: null
  };

  if (!hasKV) {
    payload.metadata.status = 'PARTIAL';
  }

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
