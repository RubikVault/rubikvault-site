const DAY_TTL_SECONDS = 8 * 24 * 60 * 60;
const WEEK_TTL_SECONDS = 35 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 400 * 24 * 60 * 60;

export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function isoMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

function hasKV(env) {
  const kv = env?.RV_KV;
  return Boolean(kv && typeof kv.get === 'function');
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function buildDashKeys(now = new Date()) {
  const day = isoDay(now);
  const week = isoWeek(now);
  const month = isoMonth(now);
  return {
    day,
    week,
    month,
    callsDay: `DASH:CALLS:DAY:${day}`,
    callsWeek: `DASH:CALLS:WEEK:${week}`,
    callsMonth: `DASH:CALLS:MONTH:${month}`,
    endpointsDay: `DASH:ENDPOINTS:DAY:${day}`,
    providersDay: `DASH:PROVIDERS:DAY:${day}`,
    kvOpsDay: `DASH:KVOPS:DAY:${day}`,
    failuresRingDay: `DASH:FAILURES:RING:DAY:${day}`
  };
}

export function ttlForKey(key) {
  if (String(key).includes(':DAY:')) return DAY_TTL_SECONDS;
  if (String(key).includes(':WEEK:')) return WEEK_TTL_SECONDS;
  if (String(key).includes(':MONTH:')) return MONTH_TTL_SECONDS;
  return DAY_TTL_SECONDS;
}

export async function kvGetJsonKVSafe(env, key, fallback) {
  const kv = env?.RV_KV;
  if (!hasKV(env)) {
    return { ok: false, hasKV: false, value: fallback, error: { code: 'BINDING_MISSING' } };
  }
  try {
    const raw = await kv.get(key);
    const value = safeJsonParse(raw, fallback);
    return { ok: true, hasKV: true, value, error: null };
  } catch {
    return { ok: false, hasKV: true, value: fallback, error: { code: 'KV_READ_ERROR' } };
  }
}

export async function kvPutJsonKVSafe(env, key, value, ttlSeconds) {
  return { ok: false, hasKV: hasKV(env), error: { code: 'KV_WRITES_DISABLED' } };
}

export async function incrCounter(env, key, delta = 1, ttlSeconds) {
  return { ok: false, hasKV: hasKV(env), value: 0, error: { code: 'KV_WRITES_DISABLED' } };
}

export async function bumpMapCounter(env, key, mapKey, delta = 1, ttlSeconds) {
  return { ok: false, hasKV: hasKV(env), value: 0, error: { code: 'KV_WRITES_DISABLED' } };
}

export async function bumpKvOps(env, keys, op, delta = 1) {
  return { ok: false, hasKV: hasKV(env), value: null, error: { code: 'KV_WRITES_DISABLED' } };
}

export function normalizeEndpointPath(pathname) {
  const p = String(pathname || '').trim();
  if (!p.startsWith('/api/')) return p;
  return p.replace(/\/$/, '');
}

export function classifyFailureCode(input) {
  const code = String(input || '').toUpperCase();
  if (!code) return 'UNKNOWN';
  if (code.includes('MISSING_API_KEY')) return 'MISSING_API_KEY';
  if (code.includes('TIMEOUT')) return 'TIMEOUT';
  if (code.includes('429')) return 'HTTP_429';
  if (code.includes('5XX')) return 'HTTP_5XX';
  if (code.includes('PARSE')) return 'PARSE_ERROR';
  if (code.includes('SCHEMA')) return 'SCHEMA_ERROR';
  if (code.includes('AUTH')) return 'AUTH_FAILED';
  if (code.includes('HTTP_ERROR')) return 'HTTP_ERROR';
  if (code.includes('NETWORK')) return 'NETWORK_ERROR';
  return code.slice(0, 32);
}

function redactSecrets(text) {
  const s = String(text || '');
  if (!s) return '';
  const patterns = [
    /(token=)([^&\s]+)/gi,
    /(apikey=)([^&\s]+)/gi,
    /(api_key=)([^&\s]+)/gi,
    /(authorization:\s*bearer\s+)([^\s]+)/gi
  ];
  let out = s;
  for (const re of patterns) {
    out = out.replace(re, '$1[REDACTED]');
  }
  return out;
}

export function sanitizeNote(note, maxLen = 140) {
  const raw = redactSecrets(String(note || '').replace(/[\r\n\t]+/g, ' ').trim());
  if (!raw) return null;
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

export function buildFailureRecord({
  ts,
  endpoint,
  providerPrimary,
  providerSelected,
  errorCode,
  httpStatus,
  latencyMs,
  traceId,
  note
}) {
  return {
    ts: ts || new Date().toISOString(),
    endpoint: normalizeEndpointPath(endpoint),
    providerPrimary: providerPrimary || null,
    providerSelected: providerSelected || null,
    errorCode: classifyFailureCode(errorCode),
    httpStatus: Number.isFinite(Number(httpStatus)) ? Number(httpStatus) : null,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    traceId: traceId ? String(traceId).slice(0, 48) : null,
    note: sanitizeNote(note)
  };
}

export async function recordFailure(env, keys, record, maxEntries = 50) {
  return { ok: false, hasKV: hasKV(env), value: null, error: { code: 'KV_WRITES_DISABLED' } };
}

export function emptyProviderStats() {
  return {
    calls_total: 0,
    primary_wins: 0,
    fallback_wins: 0,
    failures_by_code: {},
    avg_latency_ms: null,
    _lat_sum: 0,
    _lat_n: 0
  };
}

export function applyProviderTelemetry(stats, telemetry) {
  const out = stats && typeof stats === 'object' ? stats : emptyProviderStats();
  const ok = Boolean(telemetry?.ok);
  const latencyMs = Number.isFinite(Number(telemetry?.latencyMs)) ? Number(telemetry.latencyMs) : null;
  const p = telemetry?.provider || {};
  const primary = p.primary || null;
  const selected = p.selected || null;
  const fallbackUsed = Boolean(p.fallbackUsed);
  const failure = classifyFailureCode(p.primaryFailure || telemetry?.errorCode || null);

  out.calls_total = clampInt(out.calls_total + 1, 0, 1_000_000_000);
  if (ok) {
    if (selected && primary && selected === primary && !fallbackUsed) {
      out.primary_wins = clampInt(out.primary_wins + 1, 0, 1_000_000_000);
    } else {
      out.fallback_wins = clampInt(out.fallback_wins + 1, 0, 1_000_000_000);
    }
  } else {
    out.failures_by_code = out.failures_by_code && typeof out.failures_by_code === 'object' ? out.failures_by_code : {};
    out.failures_by_code[failure] = clampInt((out.failures_by_code[failure] || 0) + 1, 0, 1_000_000_000);
  }

  if (latencyMs != null) {
    out._lat_sum = clampInt(out._lat_sum + Math.round(latencyMs), 0, 1_000_000_000_000);
    out._lat_n = clampInt(out._lat_n + 1, 0, 1_000_000_000);
    out.avg_latency_ms = out._lat_n ? Math.round(out._lat_sum / out._lat_n) : null;
  }

  return out;
}

export async function bumpProviderDay(env, keys, providerName, telemetry) {
  return { ok: false, hasKV: hasKV(env), value: null, error: { code: 'KV_WRITES_DISABLED' } };
}

export function summarizeProviderStats(obj) {
  const out = obj && typeof obj === 'object' ? { ...obj } : emptyProviderStats();
  delete out._lat_sum;
  delete out._lat_n;
  return out;
}

export function computeBudgets(limits, usage) {
  const out = { limits: limits || {}, usage: usage || {}, percent: {} };
  for (const [k, lim] of Object.entries(out.limits)) {
    const limitNum = Number(lim);
    const usedNum = Number(out.usage?.[k] ?? 0);
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      out.percent[k] = null;
      continue;
    }
    out.percent[k] = Math.round((Math.max(0, usedNum) / limitNum) * 1000) / 10;
  }
  return out;
}
