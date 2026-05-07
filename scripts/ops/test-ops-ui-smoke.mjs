import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const url = `${base}/ops/`;

let res;
res = await fetch(url);
if (res.status === 404) {
  const proofUrl = `${base}/data/status/deploy-proof-latest.json`;
  const proofRes = await fetchWithContext(proofUrl, {}, { name: 'ops-ui-smoke-public-proof' });
  const proof = await proofRes.json();
  if (proof?.smokes_ok !== true || !proof?.deploy_id || !proof?.git_commit_sha) {
    throw new Error('ops UI unavailable and public deploy proof incomplete');
  }
  console.log('OK ops-ui-smoke: /ops/ intentionally not public; deploy proof healthy');
  process.exit(0);
}
if (!res.ok) {
  throw new Error(`ops UI smoke failed: HTTP ${res.status}`);
}
const html = await res.text();

if (!html.includes('id="ops-bridge"')) {
  throw new Error('ops UI missing ops-bridge marker');
}
if (html.includes('/ops/pipeline-truth.json')) {
  throw new Error('ops UI references /ops/pipeline-truth.json (should not)');
}

console.log('OK ops-ui-smoke');
