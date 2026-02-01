import { computeUiValues } from './lib/ui-values.mjs';
import { sha256Hex } from './lib/hash.mjs';

const ticker = (process.argv[2] || '').toUpperCase();
if (!ticker) {
  console.error('Usage: node scripts/truth-chain/snapshot_ui_values.mjs <TICKER>');
  process.exit(1);
}

const base = process.env.BASE_URL || process.env.TRACE_BASE || process.env.RV_BASE || process.env.OPS_BASE;
if (!base) {
  console.error('Missing BASE_URL/TRACE_BASE/RV_BASE/OPS_BASE for API fetch.');
  process.exit(1);
}

const url = new URL(`/api/stock?ticker=${encodeURIComponent(ticker)}`, base).toString();
const res = await fetch(url, { cache: 'no-store' });
if (!res.ok) {
  const body = await res.text().catch(() => '');
  console.error(`HTTP ${res.status} for ${url}`);
  console.error(body.slice(0, 300));
  process.exit(1);
}
const text = await res.text();
let payload;
try {
  payload = JSON.parse(text);
} catch (err) {
  console.error('Invalid JSON from /api/stock');
  process.exit(1);
}

const values = computeUiValues(payload);
const output = {
  ticker,
  source_url: url,
  response_sha256: sha256Hex(text),
  ui_values: values
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
