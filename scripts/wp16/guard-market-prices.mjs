import fs from 'node:fs';

const p = './public/data/snapshots/market-prices/latest.json';
const out = process.env.GITHUB_OUTPUT;

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

      if (ms !== 'stooq') fail(`metadata.source!=stooq (${ms || 'null'})`);
      if (mp === 'stub' || !mp) fail(`metadata.provider stub/null (${mp || 'null'})`);
      if (meta === 'stub' || !meta) fail(`meta.source stub/null (${meta || 'null'})`);
      if (len <= 0) fail('data_len<=0');
    }
  }
} catch (e) {
  fail(`exception:${String(e?.message || e).replace(/\n/g, ' ')}`);
}

if (!out) throw new Error('GITHUB_OUTPUT missing');
fs.appendFileSync(out, `valid=${r.valid}\nreason=${r.reason}\n`);
if (!r.valid) console.warn(`WP16 guard blocked: ${r.reason}`);
