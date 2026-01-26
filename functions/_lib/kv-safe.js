export const ERR_BINDING_MISSING = "BINDING_MISSING";
export const ERR_KV_READ = "KV_READ_ERROR";
export const ERR_KV_WRITE = "KV_WRITE_ERROR";
export const ERR_KV_WRITE_DISABLED = "KV_WRITE_DISABLED";

const MAX_MEM = 200;

const KV_WRITE_FUSE_KEY = "__RV_KV_WRITE_DISABLED_UNTIL";
const DEFAULT_KV_WRITE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const KV_SIMULATE_429_FLAG = "__RV_SIMULATE_KV_429_FIRED";

function getWriteDisabledUntil() {
  const value = globalThis[KV_WRITE_FUSE_KEY];
  return Number.isFinite(value) ? value : 0;
}

function isWriteDisabledNow() {
  return Date.now() < getWriteDisabledUntil();
}

function isKvRateLimitError(error) {
  const status = error?.status ?? error?.code;
  if (status === 429) return true;
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (name.includes("rate") && name.includes("limit")) return true;
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many") ||
    message.includes("exceeded")
  );
}

function tripWriteFuse(env, error, cooldownMs = DEFAULT_KV_WRITE_COOLDOWN_MS) {
  const until = Date.now() + cooldownMs;
  globalThis[KV_WRITE_FUSE_KEY] = until;
  if (env && typeof env === "object") {
    env.__RV_ALLOW_WRITE__ = false;
    env.__RV_KV_WRITE_DISABLED__ = true;
    env.__RV_KV_WRITE_DISABLED_UNTIL__ = until;
    env.__RV_KV_WRITE_DISABLED_REASON__ = error?.message || "rate_limited";
  }
}

function getMemCache() {
  if (!globalThis.RV_MEMCACHE) {
    globalThis.RV_MEMCACHE = new Map();
  }
  return globalThis.RV_MEMCACHE;
}

function memGet(key) {
  const cache = getMemCache();
  if (!cache.has(key)) return { hit: false, value: null };
  const entry = cache.get(key);
  cache.delete(key);
  cache.set(key, entry);
  return { hit: true, value: entry.value };
}

function memSet(key, value) {
  const cache = getMemCache();
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, ts: Date.now() });
  if (cache.size > MAX_MEM) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

export function hash8(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(8, "0").slice(-8);
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0"
    }
  });
}

export async function kvGetJson(env, key) {
  const started = Date.now();
  const missing = !env?.RV_KV || typeof env.RV_KV.get !== "function";
  if (missing) {
    const mem = memGet(key);
    return {
      layer: mem.hit ? "mem" : "none",
      hit: mem.hit,
      value: mem.value,
      durationMs: Date.now() - started,
      error: { code: ERR_BINDING_MISSING, message: "KV binding missing", hash: hash8(key) }
    };
  }
  try {
    const value = await env.RV_KV.get(key, "json");
    return {
      layer: "kv",
      hit: value !== null && value !== undefined,
      value,
      durationMs: Date.now() - started
    };
  } catch (error) {
    const mem = memGet(key);
    return {
      layer: mem.hit ? "mem" : "none",
      hit: mem.hit,
      value: mem.value,
      durationMs: Date.now() - started,
      error: { code: ERR_KV_READ, message: "KV read failed", hash: hash8(key) }
    };
  }
}

export async function kvPutJson(env, key, value, ttlSeconds) {
  const started = Date.now();
  if (!env?.RV_ALLOW_WRITE_ON_VIEW && !env?.__RV_ALLOW_WRITE__) {
    return { layer: "none", hit: false, durationMs: Date.now() - started };
  }

  if (env?.RV_SIMULATE_KV_429 === "1" && !globalThis[KV_SIMULATE_429_FLAG]) {
    globalThis[KV_SIMULATE_429_FLAG] = true;
    const err = new Error("SIMULATED_KV_429");
    err.status = 429;
    tripWriteFuse(env, err);
    memSet(key, value);
    return {
      layer: "mem",
      hit: false,
      durationMs: Date.now() - started,
      error: {
        code: ERR_KV_WRITE_DISABLED,
        message: "KV rate limit exceeded",
        hash: hash8(key)
      }
    };
  }

  if (isWriteDisabledNow()) {
    memSet(key, value);
    return {
      layer: "mem",
      hit: false,
      durationMs: Date.now() - started,
      error: {
        code: ERR_KV_WRITE_DISABLED,
        message: "KV writes disabled",
        hash: hash8(key)
      }
    };
  }
  const missing = !env?.RV_KV || typeof env.RV_KV['put'] !== "function";
  if (missing) {
    memSet(key, value);
    return {
      layer: "mem",
      hit: false,
      durationMs: Date.now() - started,
      error: { code: ERR_BINDING_MISSING, message: "KV binding missing", hash: hash8(key) }
    };
  }
  try {
    await env.RV_KV['put'](key, JSON.stringify(value), {
      expirationTtl: ttlSeconds
    });
    return { layer: "kv", hit: false, durationMs: Date.now() - started };
  } catch (error) {
    if (isKvRateLimitError(error)) {
      tripWriteFuse(env, error);
      memSet(key, value);
      return {
        layer: "mem",
        hit: false,
        durationMs: Date.now() - started,
        error: {
          code: ERR_KV_WRITE_DISABLED,
          message: "KV rate limit exceeded",
          hash: hash8(key)
        }
      };
    }
    memSet(key, value);
    return {
      layer: "mem",
      hit: false,
      durationMs: Date.now() - started,
      error: { code: ERR_KV_WRITE, message: "KV write failed", hash: hash8(key) }
    };
  }
}
