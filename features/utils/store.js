const memoryCache = new Map();
const lastAcceptedTs = new Map();
const rateHistory = new Map();
let shadowDisabled = false;

const SHADOW_INDEX_KEY = "rv_shadow_index";
const SHADOW_PREFIX = "rv_shadow_";

function nowMs() {
  return Date.now();
}

function parseTs(ts) {
  const parsed = Date.parse(ts || "");
  return Number.isNaN(parsed) ? null : parsed;
}

export function getCached(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < nowMs()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs = 0) {
  memoryCache.set(key, {
    value,
    expiresAt: ttlMs ? nowMs() + ttlMs : 0
  });
  return value;
}

function getShadowKey(featureId) {
  return `${SHADOW_PREFIX}${featureId}`;
}

function readShadowIndex() {
  try {
    const raw = window.localStorage?.getItem(SHADOW_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeShadowIndex(keys) {
  try {
    window.localStorage?.setItem(SHADOW_INDEX_KEY, JSON.stringify(keys));
  } catch (error) {
    // ignore
  }
}

function pruneShadowCache(maxEntries = 10) {
  const keys = readShadowIndex();
  while (keys.length > maxEntries) {
    const oldest = keys.shift();
    if (oldest) {
      try {
        window.localStorage?.removeItem(oldest);
      } catch (error) {
        break;
      }
    }
  }
  writeShadowIndex(keys);
}

function readShadow(featureId, logger) {
  if (shadowDisabled || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(getShadowKey(featureId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (error?.name === "SecurityError") {
      shadowDisabled = true;
      logger?.warn("CACHE_DISABLED", { reason: "SecurityError" });
    }
    return null;
  }
}

function writeShadow(featureId, payload, logger) {
  if (shadowDisabled || typeof window === "undefined") return;
  const key = getShadowKey(featureId);
  const entry = { savedAt: new Date().toISOString(), payload };
  try {
    window.localStorage?.setItem(key, JSON.stringify(entry));
    const keys = readShadowIndex().filter((item) => item !== key);
    keys.push(key);
    while (keys.length > 10) {
      const oldest = keys.shift();
      if (oldest) {
        try {
          window.localStorage?.removeItem(oldest);
        } catch (error) {
          break;
        }
      }
    }
    writeShadowIndex(keys);
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      pruneShadowCache(10);
      try {
        window.localStorage?.setItem(key, JSON.stringify(entry));
      } catch (retryError) {
        // ignore
      }
    } else if (error?.name === "SecurityError") {
      shadowDisabled = true;
      logger?.warn("CACHE_DISABLED", { reason: "SecurityError" });
    }
  }
}

function rateLimited(featureId, { maxRequests, windowMs }) {
  if (!maxRequests || !windowMs) return false;
  const now = nowMs();
  const history = rateHistory.get(featureId) || [];
  const fresh = history.filter((ts) => now - ts < windowMs);
  if (fresh.length >= maxRequests) {
    rateHistory.set(featureId, fresh);
    return true;
  }
  fresh.push(now);
  rateHistory.set(featureId, fresh);
  return false;
}

function markStale(payload, reason = "STALE_FALLBACK") {
  const tsMs = parseTs(payload?.ts || payload?.data?.updatedAt);
  const staleAgeMs = tsMs ? nowMs() - tsMs : null;
  const staleMinutes =
    typeof staleAgeMs === "number" ? Math.max(1, Math.round(staleAgeMs / 60000)) : null;
  return {
    ...payload,
    ok: true,
    isStale: true,
    staleAgeMs,
    ...(payload?.error
      ? {
          error: {
            ...payload.error,
            details: {
              ...(payload.error.details || {}),
              staleAgeMs,
              staleMinutes
            }
          }
        }
      : {
          error: {
            code: reason,
            message: "Serving cached fallback data",
            details: { staleAgeMs, staleMinutes }
          }
        })
  };
}

export function getMemorySnapshot() {
  const snapshot = {};
  memoryCache.forEach((value, key) => {
    snapshot[key] = value.value;
  });
  return snapshot;
}

export function getShadowSnapshot() {
  if (typeof window === "undefined") return {};
  const snapshot = {};
  const keys = readShadowIndex();
  keys.forEach((key) => {
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return;
      const entry = JSON.parse(raw);
      snapshot[key] = entry;
    } catch (error) {
      // ignore
    }
  });
  return snapshot;
}

export async function getOrFetch(
  key,
  fetcher,
  {
    ttlMs = 0,
    featureId = key,
    logger,
    rateLimit = { maxRequests: 10, windowMs: 15 * 60 * 1000 }
  } = {}
) {
  const panic = typeof window !== "undefined" && window.RV_CONFIG?.DEBUG_PANIC_MODE;
  const cached = panic ? null : getCached(key);
  if (cached !== null) return cached;

  if (!panic && rateLimited(featureId, rateLimit)) {
    logger?.warn("SELF_RATE_GUARD", { featureId });
    const shadow = readShadow(featureId, logger);
    if (shadow?.payload) {
      return markStale(shadow.payload, "SELF_RATE_GUARD");
    }
  }

  try {
    const value = await fetcher();
    if (value?.ok === false) {
      logger?.warn("api_response_not_ok", { featureId, code: value?.error?.code || "" });
      if (value?.error?.code === "BINDING_MISSING") {
        return value;
      }
      const shadow = readShadow(featureId, logger);
      if (shadow?.payload) {
        return markStale(shadow.payload, value?.error?.code || "STALE_FALLBACK");
      }
      return value;
    }

    const tsMs = parseTs(value?.ts);
    const lastTs = lastAcceptedTs.get(featureId) || 0;

    if (tsMs && tsMs <= lastTs) {
      logger?.warn("stale_response_ignored", { featureId, ts: value?.ts });
      const existing = getCached(key) || readShadow(featureId, logger)?.payload;
      return existing || value;
    }

    if (tsMs) lastAcceptedTs.set(featureId, tsMs);
    if (!panic) {
      setCached(key, value, ttlMs);
      writeShadow(featureId, value, logger);
    }
    return value;
  } catch (error) {
    logger?.error("fetch_failed", { featureId, message: error?.message || "Request failed" });
    if (!panic) {
      const shadow = readShadow(featureId, logger);
      if (shadow?.payload) {
        return markStale(shadow.payload);
      }
    }
    throw error;
  }
}
