import { getOpsBase } from './ops/env.config.mjs';
import { fetchWithContext } from './ops/fetch-with-context.mjs';

const base = getOpsBase();
const url = `${base}/api/mission-control/summary`;

const res = await fetchWithContext(url, {}, { name: 'ops-selfcheck' });
const summary = await res.json();

const truthChains = summary?.data?.truthChains;
if (!truthChains) {
  throw new Error('truthChains missing at data.truthChains');
}
const prices = truthChains.prices;
const p6 = prices?.steps?.find((s) => s.id === 'P6_API_CONTRACT');
const p6Path = p6?.evidence?.checked_path || null;

console.log(JSON.stringify({
  base,
  truthChainsKeys: Object.keys(truthChains || {}),
  p6_checked_path: p6Path,
  p6_uber_ok: p6?.evidence?.per_ticker?.UBER?.ok ?? null
}, null, 2));
