import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const url = `${base}/ops/`;

const res = await fetchWithContext(url, {}, { name: 'ops-ui-smoke' });
const html = await res.text();

if (!html.includes('MarketPhase pipeline')) {
  throw new Error('ops UI missing MarketPhase pipeline marker');
}

console.log('OK ops-ui-smoke');

