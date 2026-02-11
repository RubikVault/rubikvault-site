import { getTiingoKeyInfo } from './tiingo-key.mjs';
import { checkCircuit, recordFailure, recordSuccess, circuitSnapshotForMeta } from './circuit.js';
import { fetchBarsViaAdapter } from './provider-adapters.mjs';
// Backward compatibility exports - now just wrappers or re-exports
export { fetchTiingoBarsRaw as fetchTiingoBars, fetchTwelveDataBarsRaw as fetchTwelveDataBars } from './raw-providers.mjs';
import registry from './registry/providers.v1.json' assert { type: 'json' };

export function getForcedProvider(env) {
  const forced = String(env?.RV_FORCE_PROVIDER || '').trim().toLowerCase();
  // Allow any provider ID that is valid in the adapters
  if (forced && forced !== 'unknown') return forced;
  return null;
}

function resolveProviderMode(env) {
  const mode = String(env?.PROVIDER_MODE || 'PRIMARY_ONLY').trim().toUpperCase();
  return mode === 'FAILOVER_ALLOWED' ? 'FAILOVER_ALLOWED' : 'PRIMARY_ONLY';
}

async function guardedFetch(env, provider, fetcher) {
  const circuit = await checkCircuit(env, provider);
  const circuitMeta = circuitSnapshotForMeta(circuit.state, provider);
  if (!circuit.allow) {
    return {
      ok: false,
      provider,
      error: { code: 'CB_OPEN', message: `Circuit open for ${provider}` },
      circuit: circuitMeta
    };
  }

  const result = await fetcher();
  if (result.ok) {
    await recordSuccess(env, provider);
  } else {
    // Determine if we should record failure based on error code
    // Some errors like MISSING_API_KEY might not be circuit-breaking in all philosophies,
    // but generally if a provider fails, we record it.
    await recordFailure(env, provider, result.error?.code || null);
  }
  return { ...result, circuit: circuitMeta };
}

export async function fetchBarsWithProviderChain(symbol, env, options = {}) {
  const forced = getForcedProvider(env);
  const providerMode = resolveProviderMode(env);
  const allowFailover = providerMode === 'FAILOVER_ALLOWED' && options.allowFailover === true;

  // Load chain config from registry or fallback
  let primary = 'eodhd';
  let secondary = 'eodhd';

  if (registry && registry.eod_chain) {
    primary = registry.eod_chain.primary || primary;
    secondary = registry.eod_chain.secondary || secondary;
  }

  const chain = {
    primary,
    secondary,
    forced: forced,
    selected: null,
    fallbackUsed: false,
    failureReason: null,
    primaryFailure: null,
    mode: providerMode,
    allowFailover
  };

  const startDate = options.startDate || null;
  const outputsize = options.outputsize || '260';

  const fetchFromProvider = async (provider) => {
    return fetchBarsViaAdapter(provider, symbol, env, { startDate, outputsize });
  };

  // 1. Forced Provider Logic
  if (forced) {
    const result = await guardedFetch(env, forced, () => fetchFromProvider(forced));
    if (!result.ok) {
      chain.failureReason = 'FORCED_PROVIDER_FAILED';
      chain.primaryFailure = result.error;
      chain.circuit = result.circuit;
      return { ok: false, chain, error: result.error, bars: [], circuit: result.circuit };
    }
    chain.selected = forced;
    chain.circuit = result.circuit;
    return { ok: true, chain, bars: result.bars, provider: forced, circuit: result.circuit };
  }

  // 2. Primary Provider
  const primaryResult = await guardedFetch(env, chain.primary, () => fetchFromProvider(chain.primary));
  if (primaryResult.ok) {
    chain.selected = chain.primary;
    chain.circuit = primaryResult.circuit;
    return { ok: true, chain, bars: primaryResult.bars, provider: chain.primary, circuit: primaryResult.circuit };
  }

  chain.primaryFailure = primaryResult.error;
  chain.circuit = primaryResult.circuit;

  // 3. Fallback / Secondary
  if (allowFailover) {
    const secondaryResult = await guardedFetch(env, chain.secondary, () => fetchFromProvider(chain.secondary));
    if (secondaryResult.ok) {
      chain.selected = chain.secondary;
      chain.fallbackUsed = true;
      chain.failureReason = 'PRIMARY_FAILED_FALLBACK_OK';
      chain.circuit = secondaryResult.circuit;
      return { ok: true, chain, bars: secondaryResult.bars, provider: chain.secondary, circuit: secondaryResult.circuit };
    }

    chain.selected = null;
    chain.fallbackUsed = true;
    chain.failureReason = 'BOTH_FAILED';
    return {
      ok: false,
      chain,
      error: {
        code: 'BOTH_FAILED',
        message: 'Both providers failed',
        details: { primary: primaryResult.error, secondary: secondaryResult.error }
      },
      bars: [],
      circuit: secondaryResult.circuit
    };
  }

  // 4. Failed strictly (Primary Only)
  chain.selected = null;
  return {
    ok: false,
    chain,
    error: {
      code: primaryResult.error?.code || 'PRIMARY_FAILED',
      message: primaryResult.error?.message || 'Primary provider failed',
      details: { primary: primaryResult.error, secondary: null }
    },
    bars: [],
    circuit: primaryResult.circuit
  };
}
