function isoDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function clampInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export async function checkAndIncrementProviderBudget(env, provider, maxPerDay) {
  const limit = clampInt(maxPerDay, 0);
  const key = `rv:budget:${String(provider || "unknown")}:${isoDay()}`;

  if (limit <= 0) {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key,
      used: null,
      max: 0,
      remaining: null,
      limited: false,
      reason: "UNLIMITED"
    };
  }

  const kv = env?.RV_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key,
      used: null,
      max: limit,
      remaining: null,
      limited: false,
      reason: "KV_MISSING"
    };
  }

  let current = 0;
  try {
    const existing = await kv.get(key, "json");
    current = clampInt(existing?.used, 0);
  } catch {
    current = 0;
  }

  if (current >= limit) {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key,
      used: current,
      max: limit,
      remaining: 0,
      limited: true,
      reason: "BUDGET_EXCEEDED"
    };
  }

  const next = current + 1;
  const ttl = 2 * 24 * 60 * 60;
  try {
    await kv.put(key, JSON.stringify({ used: next, max: limit, ts: new Date().toISOString() }), {
      expirationTtl: ttl
    });
  } catch {
    // ignore write errors
  }

  return {
    ok: true,
    provider: String(provider || "unknown"),
    key,
    used: next,
    max: limit,
    remaining: limit > 0 ? Math.max(0, limit - next) : null,
    limited: false,
    reason: "OK"
  };
}

export async function getProviderBudgetState(env, provider, maxPerDay) {
  const limit = clampInt(maxPerDay, 0);
  const key = `rv:budget:${String(provider || "unknown")}:${isoDay()}`;

  const kv = env?.RV_KV;
  if (!kv || typeof kv.get !== "function") {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key,
      used: null,
      max: limit,
      remaining: null,
      limited: false,
      reason: "KV_MISSING"
    };
  }

  let current = 0;
  try {
    const existing = await kv.get(key, "json");
    current = clampInt(existing?.used, 0);
  } catch {
    current = 0;
  }

  return {
    ok: true,
    provider: String(provider || "unknown"),
    key,
    used: current,
    max: limit,
    remaining: limit > 0 ? Math.max(0, limit - current) : null,
    limited: limit > 0 ? current >= limit : false,
    reason: limit > 0 && current >= limit ? "BUDGET_EXCEEDED" : "OK"
  };
}
