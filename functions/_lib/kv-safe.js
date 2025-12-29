export const ERR_BINDING_MISSING = "BINDING_MISSING";
export const ERR_KV_READ = "KV_READ_ERROR";
export const ERR_KV_WRITE = "KV_WRITE_ERROR";

const MAX_MEM = 200;

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
  const missing = !env?.RV_KV || typeof env.RV_KV.put !== "function";
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
    await env.RV_KV.put(key, JSON.stringify(value), {
      expirationTtl: ttlSeconds
    });
    return { layer: "kv", hit: false, durationMs: Date.now() - started };
  } catch (error) {
    memSet(key, value);
    return {
      layer: "mem",
      hit: false,
      durationMs: Date.now() - started,
      error: { code: ERR_KV_WRITE, message: "KV write failed", hash: hash8(key) }
    };
  }
}
