import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const url = `${base}/api/mission-control/summary?debug=1`;

const res = await fetchWithContext(url, {}, { name: 'ops-core-green' });
const doc = await res.json();

const coreApi = doc?.data?.ssot?.core?.api;
const coreAssets = doc?.data?.ssot?.core?.assets;
const health = doc?.data?.health || {};

function requireStatus(label, value) {
  if (value !== 'OK') {
    throw new Error(`${label} must be OK, got ${value}`);
  }
}

requireStatus('ssot.core.api.status', coreApi?.status);
requireStatus('ssot.core.assets.status', coreAssets?.status);
requireStatus('health.api.status', health?.api?.status);
requireStatus('health.assets.status', health?.assets?.status);
requireStatus('health.system.status', health?.system?.status);

console.log('OK: core SSOT checks are GREEN');
