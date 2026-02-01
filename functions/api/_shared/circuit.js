const DEFAULT_FAIL_THRESHOLD = 3;
const DEFAULT_OPEN_SECONDS = 300;

function nowMs() {
  return Date.now();
}

function getKey(provider) {
  return `cb:${provider}`;
}

function resolveFailThreshold(env) {
  const n = Number(env?.CB_FAIL_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FAIL_THRESHOLD;
}

function resolveOpenSeconds(env) {
  const n = Number(env?.CB_OPEN_SECONDS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_OPEN_SECONDS;
}

function defaultState() {
  return {
    state: 'closed',
    failures: 0,
    opened_at: null,
    last_failure_at: null,
    last_success_at: null
  };
}

async function loadState(env, provider) {
  const kv = env?.RV_KV;
  if (!kv || typeof kv.get !== 'function') return defaultState();
  try {
    const raw = await kv.get(getKey(provider), { type: 'json' });
    if (raw && typeof raw === 'object') {
      return { ...defaultState(), ...raw };
    }
  } catch {
    return defaultState();
  }
  return defaultState();
}

async function saveState(env, provider, state, ttlSeconds) {
  // KV writes are disabled in functions; keep state ephemeral.
  return false;
}

export async function checkCircuit(env, provider) {
  const openSeconds = resolveOpenSeconds(env);
  const ttlSeconds = Math.max(openSeconds * 4, 300);
  const state = await loadState(env, provider);
  const now = nowMs();

  if (state.state === 'open' && state.opened_at && now - state.opened_at >= openSeconds * 1000) {
    state.state = 'half_open';
    await saveState(env, provider, state, ttlSeconds);
  }

  const allow = state.state !== 'open';
  return { allow, state };
}

export async function recordSuccess(env, provider) {
  const openSeconds = resolveOpenSeconds(env);
  const ttlSeconds = Math.max(openSeconds * 4, 300);
  const state = await loadState(env, provider);
  const now = nowMs();
  state.state = 'closed';
  state.failures = 0;
  state.last_success_at = now;
  await saveState(env, provider, state, ttlSeconds);
  return state;
}

export async function recordFailure(env, provider, errorCode = null) {
  const failThreshold = resolveFailThreshold(env);
  const openSeconds = resolveOpenSeconds(env);
  const ttlSeconds = Math.max(openSeconds * 4, 300);
  const state = await loadState(env, provider);
  const now = nowMs();

  const nextFailures = (state.failures || 0) + 1;
  state.failures = nextFailures;
  state.last_failure_at = now;
  if (errorCode) {
    state.last_error_code = errorCode;
  }

  if (state.state === 'half_open' || nextFailures >= failThreshold) {
    state.state = 'open';
    state.opened_at = now;
  }

  await saveState(env, provider, state, ttlSeconds);
  return state;
}

export function circuitSnapshotForMeta(circuitState, provider) {
  if (!circuitState || typeof circuitState !== 'object') {
    return { provider: provider || 'unknown', state: 'closed', fail_count: 0, opened_at: null };
  }
  return {
    provider: provider || 'unknown',
    state: circuitState.state || 'closed',
    fail_count: circuitState.failures || 0,
    opened_at: circuitState.opened_at ? new Date(circuitState.opened_at).toISOString() : null
  };
}
