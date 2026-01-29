import { kvGetJson, kvPutJson } from "../../_lib/kv-safe.js";

export const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
export const SWR_MARK_TTL_SECONDS = 120;
export const DEGRADE_AFTER_SECONDS = 24 * 60 * 60;

export function nowUtcIso() {
  return new Date().toISOString();
}

export function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export function parseIsoDateToMs(value) {
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function computeAgeSeconds(generatedAt) {
  const ms = parseIsoDateToMs(generatedAt);
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

export function makeCacheKey(kind, id) {
  const safeKind = String(kind || "").trim();
  const safeId = String(id || "").trim();
  if (!safeKind || !safeId) return "";
  const normalized = safeKind.toLowerCase();
  if (normalized === "meta" || normalized === "swr") {
    return `${normalized}:${safeId}`;
  }
  return `eod:${safeKind}:${safeId}`;
}

// Legacy helpers (keep for compatibility with existing cache keys)
export function dataKey(uuid) {
  return `eod:${uuid}`;
}

export function metaKey(uuid) {
  return `eodmeta:${uuid}`;
}

export function lockKey(uuid) {
  return `lock:${uuid}`;
}

export async function getJsonKV(env, key) {
  if (!key) return null;
  if (typeof kvGetJson === "function") {
    const result = await kvGetJson(env, key);
    return { value: result?.value ?? null, meta: result };
  }
  const kv = env?.RV_KV || null;
  if (!kv || typeof kv.get !== "function") return null;
  try {
    const value = await kv.get(key, { type: "json" });
    return { value, meta: { hit: value != null } };
  } catch {
    return null;
  }
}

export async function putJsonKV(env, key, value, ttlSeconds) {
  if (!key) return;
  if (typeof kvPutJson === "function") {
    await kvPutJson(env, key, value, ttlSeconds);
    return;
  }
  const kv = env?.RV_KV || null;
  if (!kv || typeof kv.put !== "function") return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {
    // best-effort
  }
}

export async function tryMarkSWR(env, swrKey, ttlSeconds) {
  if (!swrKey) return false;
  // best-effort, not strict mutex
  const existing = await getJsonKV(env, swrKey);
  if (existing?.meta?.hit) return false;
  await putJsonKV(env, swrKey, { marked_at: nowUtcIso() }, ttlSeconds);
  return true;
}

export function buildCacheMeta({ mode, key_kind, hit, stale, age_s, ttl_s, swr_marked } = {}) {
  const swr =
    swr_marked === true ? "marked" : swr_marked === false ? "skipped" : "none";
  const output = {
    mode: mode === "swr" ? "swr" : "kv",
    hit: Boolean(hit),
    stale: Boolean(stale),
    age_s: Number.isFinite(age_s) ? age_s : null,
    ttl_s: Number.isFinite(ttl_s) ? ttl_s : null,
    swr
  };
  if (key_kind) output.key_kind = key_kind;
  return output;
}

export function createCache(env) {
  const kv = env?.RV_KV || null;

  return {
    dataKey,
    metaKey,
    lockKey,

    async readCached(uuid) {
      if (!kv || typeof kv.get !== "function") return null;
      const data = await getJsonKV(env, dataKey(uuid));
      if (!data?.meta?.hit) return null;
      const metaLike = (await getJsonKV(env, metaKey(uuid)))?.value || null;
      return { data: data.value, metaLike };
    },

    async writeCached(uuid, payload, ttlSeconds, metaLike = {}) {
      const metaOut = {
        ...(metaLike && typeof metaLike === "object" ? metaLike : {}),
        generated_at: metaLike?.generated_at || nowUtcIso()
      };
      await Promise.all([
        putJsonKV(env, dataKey(uuid), payload, ttlSeconds),
        putJsonKV(env, metaKey(uuid), metaOut, ttlSeconds)
      ]);
      return { ok: true };
    },

    async acquireLock(uuid, lockTtlSeconds) {
      if (!kv || typeof kv.get !== "function") return true;
      const key = lockKey(uuid);
      const existing = await getJsonKV(env, key);
      if (existing?.meta?.hit) return false;
      await putJsonKV(env, key, { locked_at: nowUtcIso() }, lockTtlSeconds);
      return true;
    },

    async releaseLock(uuid) {
      if (!kv || typeof kv.delete !== "function") return false;
      try {
        await kv.delete(lockKey(uuid));
        return true;
      } catch {
        return false;
      }
    }
  };
}
