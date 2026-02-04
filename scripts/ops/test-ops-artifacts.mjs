import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const assets = [
  { name: 'universe', url: `${base}/data/universe/nasdaq100.json`, check: (doc) => Array.isArray(doc) && doc.length > 0 },
  { name: 'stock-analysis', url: `${base}/data/snapshots/stock-analysis.json`, check: (doc) => Boolean(doc?._meta) },
  { name: 'eod-batch', url: `${base}/data/eod/batches/eod.latest.000.json`, check: (doc) => Array.isArray(doc?.symbols) && doc.symbols.length > 0 },
  { name: 'marketphase-index', url: `${base}/data/marketphase/index.json`, check: (doc) => Array.isArray(doc?.data?.symbols) },
  { name: 'market-prices', url: `${base}/data/snapshots/market-prices/latest.json`, check: (doc) => Array.isArray(doc?.data) }
];

for (const asset of assets) {
  const res = await fetchWithContext(asset.url, {}, { name: `asset:${asset.name}` });
  const doc = await res.json();
  if (!asset.check(doc)) {
    throw new Error(`asset ${asset.name} failed shape check at ${asset.url}`);
  }
}

const stockRes = await fetchWithContext(`${base}/api/stock?ticker=UBER`, {}, { name: 'api-stock' });
const stockDoc = await stockRes.json();
const bar = stockDoc?.data?.latest_bar;
if (!bar || bar.close == null || bar.volume == null || bar.date == null) {
  throw new Error('api/stock missing data.latest_bar fields');
}

const elliottRes = await fetchWithContext(`${base}/api/elliott-scanner`, {}, { name: 'api-elliott-scanner' });
const elliottDoc = await elliottRes.json();
if (!elliottDoc || elliottDoc.ok !== true || !Array.isArray(elliottDoc.setups)) {
  throw new Error('api/elliott-scanner missing setups or ok flag');
}

console.log('OK ops-artifacts: SSOT assets + api/stock + api/elliott-scanner');
