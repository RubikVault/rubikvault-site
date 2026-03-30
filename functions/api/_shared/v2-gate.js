import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJsonKV } from './cache-law.js';
import { errorEnvelope } from './envelope.js';

let gatesConfig;
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(__dirname, '../../../config/v2-gates.json'), 'utf8');
  gatesConfig = JSON.parse(raw);
} catch {
  gatesConfig = { global_enabled: false, endpoints: {} };
}

const KV_KEY = 'rv:v2:gates';

/**
 * Check if a V2 endpoint is enabled.
 * Priority: env override > KV runtime override > static config file.
 * @param {object} env - Cloudflare env bindings
 * @param {string} endpointId - e.g. 'v2_summary'
 * @returns {Promise<boolean>}
 */
export async function isV2Enabled(env, endpointId) {
  if (env?.V2_GATE_FORCE_V1 === 'true' || env?.V2_GATE_FORCE_V1 === true) return false;

  // 1. Env override: V2_GATE_V2_SUMMARY=true
  const envKey = `V2_GATE_${endpointId.toUpperCase()}`;
  const envVal = env?.[envKey] || env?.V2_GATE_GLOBAL;
  if (envVal === 'true' || envVal === true) return true;
  if (envVal === 'false' || envVal === false) return false;

  // 2. KV runtime override
  try {
    const kvResult = await getJsonKV(env, KV_KEY);
    if (kvResult?.value && typeof kvResult.value === 'object') {
      const kvGates = kvResult.value;
      if (kvGates.kill_switch_force_v1 === true) return false;
      if (kvGates.global_enabled === false) return false;
      if (kvGates.global_enabled === true) {
        const ep = kvGates.endpoints?.[endpointId];
        if (ep && typeof ep.enabled === 'boolean') return ep.enabled;
        return true;
      }
    }
  } catch {
    // KV unavailable, fall through to static config
  }

  // 3. Static config file
  if (gatesConfig.kill_switch_force_v1 === true) return false;
  if (!gatesConfig.global_enabled) return false;
  const ep = gatesConfig.endpoints?.[endpointId];
  return ep?.enabled === true;
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
