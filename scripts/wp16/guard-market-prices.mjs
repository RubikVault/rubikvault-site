import fs from 'node:fs';

const p = './public/data/snapshots/market-prices/latest.json';
const out = process.env.GITHUB_OUTPUT;
const minRows = Number(process.env.RV_MIN_MARKET_PRICE_ROWS || 517);
const allowedSources = new Set(['stooq', 'last_good', 'stock-analysis-seed']);

const r = { valid: true, reason: 'ok' };
const fail = (msg) => { if (r.valid) { r.valid = false; r.reason = msg; } };

try {
  if (!fs.existsSync(p)) fail('missing');
  else {
    const s = fs.statSync(p);
    if (!s.isFile() || s.size === 0) fail('empty');
    else {
      const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const ms = j?.metadata?.source ?? '';
      const mp = j?.metadata?.provider ?? '';
      const meta = j?.meta?.source ?? '';
      const len = Array.isArray(j?.data) ? j.data.length : 0;
      const recordCount = Number(j?.metadata?.record_count ?? len);
      const asof = j?.asof ?? j?.metadata?.as_of ?? j?.meta?.asOf ?? null;

      if (!allowedSources.has(ms)) fail(`metadata.source unsupported (${ms || 'null'})`);
      if (mp === 'stub' || !mp) fail(`metadata.provider stub/null (${mp || 'null'})`);
      if (!allowedSources.has(meta)) fail(`meta.source unsupported (${meta || 'null'})`);
      if (len <= 0) fail('data_len<=0');
      if (!asof) fail('asof_missing');
      if (Math.max(len, Number.isFinite(recordCount) ? recordCount : 0) < minRows) {
        fail(`coverage_below_min(${Math.max(len, Number.isFinite(recordCount) ? recordCount : 0)}<${minRows})`);
      }
    }
  }
} catch (e) {
  fail(`exception:${String(e?.message || e).replace(/\n/g, ' ')}`);
}

if (!out) throw new Error('GITHUB_OUTPUT missing');
fs.appendFileSync(out, `valid=${r.valid}\nreason=${r.reason}\n`);
if (!r.valid) console.warn(`WP16 guard blocked: ${r.reason}`);
