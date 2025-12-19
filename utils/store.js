const cache = new Map();

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs = 0) {
  cache.set(key, {
    value,
    expiresAt: ttlMs ? Date.now() + ttlMs : 0
  });
  return value;
}

export async function getOrFetch(key, fetcher, { ttlMs = 0 } = {}) {
  const cached = getCached(key);
  if (cached !== null) return cached;

  const value = await fetcher();
  return setCached(key, value, ttlMs);
}
