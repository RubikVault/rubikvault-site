const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function getStore(env, kv) {
  return kv || env?.RV_KV || null;
}

function getMemoryStore() {
  return (globalThis.__RV_CB_STATE ||= new Map());
}

function stateKey(feature) {
  return `cb:${feature}:state`;
}

async function readState(feature, env, kv) {
  const store = getStore(env, kv);
  if (store?.get) {
    try {
      const value = await store.get(stateKey(feature), "json");
      return value || null;
    } catch {
      // fall through
    }
  }
  return getMemoryStore().get(stateKey(feature)) || null;
}

async function writeState(feature, env, kv, state) {
  const store = getStore(env, kv);
  if (store?.put) {
    try {
      await store.put(stateKey(feature), JSON.stringify(state), {
        expirationTtl: DEFAULT_TTL_SECONDS
      });
      return;
    } catch {
      // fall through to memory
    }
  }
  getMemoryStore().set(stateKey(feature), state);
}

function computeBackoffMs(fails) {
  if (fails <= 1) return 5 * 60 * 1000;
  if (fails === 2) return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}

function shouldOpenForFailure(feature, code) {
  if (feature === "congress-trading" && code === "UPSTREAM_403") return true;
  if (feature === "market-health") {
    return ["UPSTREAM_5XX", "UPSTREAM_TIMEOUT", "FETCH_FAILED"].includes(code);
  }
  return false;
}

export async function shouldSkipUpstream(feature, env, kv, nowMs = Date.now()) {
  const state = await readState(feature, env, kv);
  if (!state?.openUntil) return { skip: false, reason: "", untilTs: null };
  if (state.openUntil > nowMs) {
    return {
      skip: true,
      reason: state.lastCode === "UPSTREAM_403" ? "expected_blocked" : "circuit_open",
      untilTs: state.openUntil
    };
  }
  return { skip: false, reason: "", untilTs: null };
}

export async function recordUpstreamResult(
  feature,
  env,
  kv,
  { ok, code, status, nowMs = Date.now() }
) {
  const state = (await readState(feature, env, kv)) || {
    fails: 0,
    lastFailAt: null,
    lastOkAt: null,
    openUntil: null,
    lastCode: "",
    lastStatus: null
  };

  if (ok) {
    const next = {
      ...state,
      fails: 0,
      lastOkAt: nowMs,
      openUntil: null,
      lastCode: "",
      lastStatus: status ?? null
    };
    await writeState(feature, env, kv, next);
    return next;
  }

  const nextFails = (state.fails || 0) + 1;
  let openUntil = state.openUntil || null;
  if (shouldOpenForFailure(feature, code)) {
    if (feature === "congress-trading" && code === "UPSTREAM_403") {
      openUntil = nowMs + DAY_MS;
    } else if (feature === "market-health") {
      openUntil = nowMs + computeBackoffMs(nextFails);
    }
  }

  const next = {
    ...state,
    fails: nextFails,
    lastFailAt: nowMs,
    openUntil,
    lastCode: code || state.lastCode || "",
    lastStatus: status ?? state.lastStatus ?? null
  };
  await writeState(feature, env, kv, next);
  return next;
}
