function nowIso() {
  return new Date().toISOString();
}

function hasKv(env) {
  return Boolean(env?.RV_KV && typeof env.RV_KV.get === 'function' && typeof env.RV_KV.put === 'function');
}

export function dataKey(uuid) {
  return `eod:${uuid}`;
}

export function metaKey(uuid) {
  return `eodmeta:${uuid}`;
}

export function lockKey(uuid) {
  return `lock:${uuid}`;
}

async function readJson(kv, key) {
  try {
    return await kv.get(key, { type: 'json' });
  } catch {
    return null;
  }
}

async function writeJson(kv, key, value, ttlSeconds) {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds
  });
}

export function createCache(env) {
  const kv = env?.RV_KV || null;

  return {
    dataKey,
    metaKey,
    lockKey,

    async readCached(uuid) {
      if (!kv || typeof kv.get !== 'function') return null;
      const data = await readJson(kv, dataKey(uuid));
      if (data == null) return null;
      const metaLike = (await readJson(kv, metaKey(uuid))) || null;
      return { data, metaLike };
    },

    async writeCached(uuid, payload, ttlSeconds, metaLike = {}) {
      if (!hasKv(env)) return { ok: false, reason: 'KV_MISSING' };
      const metaOut = {
        ...(metaLike && typeof metaLike === 'object' ? metaLike : {}),
        generated_at: metaLike?.generated_at || nowIso()
      };
      await Promise.all([
        writeJson(kv, dataKey(uuid), payload, ttlSeconds),
        writeJson(kv, metaKey(uuid), metaOut, ttlSeconds)
      ]);
      return { ok: true };
    },

    async acquireLock(uuid, lockTtlSeconds) {
      if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') return true;
      const key = lockKey(uuid);
      const existing = await kv.get(key);
      if (existing != null) return false;
      try {
        await kv.put(key, JSON.stringify({ locked_at: nowIso() }), {
          expirationTtl: lockTtlSeconds
        });
        return true;
      } catch {
        return false;
      }
    },

    async releaseLock(uuid) {
      if (!kv || typeof kv.delete !== 'function') return false;
      try {
        await kv.delete(lockKey(uuid));
        return true;
      } catch {
        return false;
      }
    }
  };
}
