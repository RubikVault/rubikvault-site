import { STATIC_V2_GATES } from '../../../config/v2-gates.js';
import { getJsonKV } from './cache-law.js';
import { errorEnvelope } from './envelope.js';

const gatesConfig = STATIC_V2_GATES || { global_enabled: false, endpoints: {} };

const KV_KEY = 'rv:v2:gates';

function isEndpointEnabled(config, endpointId) {
  if (!config || config.global_enabled !== true) return false;
  const ep = config.endpoints?.[endpointId];
  return ep?.enabled === true;
}

/**
 * Check if a V2 endpoint is enabled.
 * Priority: env override > static config > KV runtime opt-in.
 * @param {object} env - Cloudflare env bindings
 * @param {string} endpointId - e.g. 'v2_summary'
 * @returns {Promise<boolean>}
 */
export async function isV2Enabled(env, endpointId) {
  const envKey = `V2_GATE_${endpointId.toUpperCase()}`;
  const envVal = env?.[envKey] ?? env?.V2_GATE_GLOBAL;
  if (envVal === 'true' || envVal === true) return true;
  if (envVal === 'false' || envVal === false) return false;

  if (isEndpointEnabled(gatesConfig, endpointId)) {
    return true;
  }

  try {
    const kvResult = await getJsonKV(env, KV_KEY);
    if (kvResult?.value && typeof kvResult.value === 'object') {
      const kvGates = kvResult.value;
      if (kvGates.global_enabled === false) return false;
      if (kvGates.global_enabled === true) {
        const ep = kvGates.endpoints?.[endpointId];
        if (ep && typeof ep.enabled === 'boolean') return ep.enabled;
        return true;
      }
    }
  } catch {
    // fall through
  }

  return false;
}

/**
 * Return a 503 error response for a disabled V2 endpoint.
 * @param {string} endpointId
 * @returns {Response}
 */
export function v2GateResponse(endpointId) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const envelope = errorEnvelope(
    'V2_DISABLED',
    `Endpoint ${endpointId} is not enabled`,
    { provider: 'v2-gate', data_date: todayUtc, status: 'closed', version: 'v2' }
  );
  return new Response(JSON.stringify(envelope), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
