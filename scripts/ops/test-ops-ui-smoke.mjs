import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const url = `${base}/ops/`;

const res = await fetchWithContext(url, {}, { name: 'ops-ui-smoke' });
const html = await res.text();

if (!html.includes('id="ops-bridge"')) {
  throw new Error('ops UI missing ops-bridge marker');
}
if (html.includes('/ops/pipeline-truth.json')) {
  throw new Error('ops UI references /ops/pipeline-truth.json (should not)');
}

console.log('OK ops-ui-smoke');
