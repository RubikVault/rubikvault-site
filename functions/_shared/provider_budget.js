function isoDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function isoMonth(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  const ww = String(weekNo).padStart(2, "0");
  return `${yyyy}-W${ww}`;
}

function rollupKeys(provider) {
  const p = String(provider || "unknown");
  return {
    dayKey: `rv:budget:${p}:${isoDay()}`,
    weekKey: `rv:budgetw:${p}:${isoWeek()}`,
    monthKey: `rv:budgetm:${p}:${isoMonth()}`
  };
}

function clampInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export async function checkAndIncrementProviderBudget(env, provider, maxPerDay) {
  const limit = clampInt(maxPerDay, 0);
  const { dayKey, weekKey, monthKey } = rollupKeys(provider);

  if (limit <= 0) {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key: dayKey,
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
      key: dayKey,
      used: null,
      max: limit,
      remaining: null,
      limited: false,
      reason: "KV_MISSING"
    };
  }

  let current = 0;
  try {
    const existing = await kv.get(dayKey, "json");
    current = clampInt(existing?.used, 0);
  } catch {
    current = 0;
  }

  if (current >= limit) {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key: dayKey,
      used: current,
      max: limit,
      remaining: 0,
      limited: true,
      reason: "BUDGET_EXCEEDED"
    };
  }

  const next = current + 1;

  const dayTtl = 2 * 24 * 60 * 60;
  const weekTtl = 16 * 24 * 60 * 60;
  const monthTtl = 70 * 24 * 60 * 60;
  try {
    await kv.put(
      dayKey,
      JSON.stringify({ used: next, max: limit, ts: new Date().toISOString() }),
      { expirationTtl: dayTtl }
    );
  } catch {
    // ignore write errors
  }

  const rollupInitPayload = JSON.stringify({ used: 1, max: limit, ts: new Date().toISOString() });
  await Promise.all([
    (async () => {
      try {
        const existing = await kv.get(weekKey, "json");
        const used = clampInt(existing?.used, 0) + 1;
        await kv.put(weekKey, JSON.stringify({ used, max: limit, ts: new Date().toISOString() }), { expirationTtl: weekTtl });
      } catch {
        try {
          await kv.put(weekKey, rollupInitPayload, { expirationTtl: weekTtl });
        } catch {
          // ignore
        }
      }
    })(),
    (async () => {
      try {
        const existing = await kv.get(monthKey, "json");
        const used = clampInt(existing?.used, 0) + 1;
        await kv.put(monthKey, JSON.stringify({ used, max: limit, ts: new Date().toISOString() }), { expirationTtl: monthTtl });
      } catch {
        try {
          await kv.put(monthKey, rollupInitPayload, { expirationTtl: monthTtl });
        } catch {
          // ignore
        }
      }
    })()
  ]);

  return {
    ok: true,
    provider: String(provider || "unknown"),
    key: dayKey,
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

async function getRollupState(env, provider, key, max) {
  const kv = env?.RV_KV;
  if (!kv || typeof kv.get !== "function") {
    return {
      ok: true,
      provider: String(provider || "unknown"),
      key,
      used: null,
      max,
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
    max,
    remaining: max > 0 ? Math.max(0, max - current) : null,
    limited: max > 0 ? current >= max : false,
    reason: max > 0 && current >= max ? "BUDGET_EXCEEDED" : "OK"
  };
}

export async function getProviderBudgetStateRollups(env, provider, maxPerDay) {
  const dayLimit = clampInt(maxPerDay, 0);
  const weekLimit = dayLimit > 0 ? dayLimit * 7 : 0;
  const monthLimit = dayLimit > 0 ? dayLimit * 30 : 0;
  const { dayKey, weekKey, monthKey } = rollupKeys(provider);

  const [day, week, month] = await Promise.all([
    getRollupState(env, provider, dayKey, dayLimit),
    getRollupState(env, provider, weekKey, weekLimit),
    getRollupState(env, provider, monthKey, monthLimit)
  ]);

  return {
    ok: true,
    provider: String(provider || "unknown"),
    day,
    week,
    month,
    derived: {
      weekLimitEstimated: dayLimit > 0,
      monthLimitEstimated: dayLimit > 0
    }
  };
}
