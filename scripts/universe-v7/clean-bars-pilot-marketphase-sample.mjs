#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { normalizeFromRawBars, loadDefaultPolicy } from '../../lib/ohlcv/clean-bars.mjs';

const REPO_ROOT = process.cwd();
const REGISTRY_GZ = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/clean_bars_pilot_marketphase_sample.json');

function parseArgs(argv = process.argv.slice(2)) {
  const out = { sampleSize: 25, minBars: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sample-size') out.sampleSize = Math.max(1, Number(argv[++i] || out.sampleSize));
    else if (argv[i] === '--min-bars') out.minBars = Math.max(1, Number(argv[++i] || out.minBars));
  }
  return out;
}

async function writeJsonAtomic(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, filePath);
}

async function sampleCandidates(sampleSize) {
  const out = [];
  const seen = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(REGISTRY_GZ).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (String(row?.type_norm || '').toUpperCase() !== 'STOCK') continue;
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    const cid = String(row?.canonical_id || '').trim().toUpperCase();
    const pack = String(row?.pointers?.history_pack || '').trim();
    const bars = Number(row?.bars_count || 0);
    if (!symbol || !cid || !pack || seen.has(symbol) || bars < 200) continue;
    seen.add(symbol);
    out.push({ symbol, canonical_id: cid, history_pack: pack, bars_count: bars });
    if (out.length >= sampleSize) break;
  }
  return out;
}

async function loadPackBars(absPack, canonicalId) {
  const rl = readline.createInterface({ input: fs.createReadStream(absPack).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (String(row?.canonical_id || '').trim().toUpperCase() !== canonicalId) continue;
    return Array.isArray(row?.bars) ? row.bars : [];
  }
  return [];
}

async function main() {
  const args = parseArgs();
  const policy = await loadDefaultPolicy();
  const candidates = await sampleCandidates(args.sampleSize);
  const rows = [];
  for (const c of candidates) {
    const absPack = path.join(REPO_ROOT, 'mirrors/universe-v7', c.history_pack);
    let rawBars = [];
    try {
      rawBars = await loadPackBars(absPack, c.canonical_id);
    } catch {
      rows.push({ ...c, ok: false, reason: 'PACK_READ_FAILED' });
      continue;
    }
    const strict = normalizeFromRawBars(rawBars, {
      ...policy,
      min_bars: args.minBars
    });
    const relaxed = normalizeFromRawBars(rawBars, {
      ...policy,
      validation: { ...(policy.validation || {}), allow_zero_or_negative_prices: true },
      min_bars: args.minBars
    });
    rows.push({
      ...c,
      strict_ok: Boolean(strict?.ok),
      strict_reason: strict?.reason || null,
      strict_rows_valid: strict?.meta?.rows_valid ?? 0,
      relaxed_ok: Boolean(relaxed?.ok),
      relaxed_reason: relaxed?.reason || null,
      relaxed_rows_valid: relaxed?.meta?.rows_valid ?? 0
    });
  }

  const summary = {
    schema: 'rv_v7_clean_bars_pilot_marketphase_sample_v1',
    generated_at: new Date().toISOString(),
    sample_size_requested: args.sampleSize,
    sample_size_actual: rows.length,
    min_bars: args.minBars,
    strict_pass: rows.filter((r) => r.strict_ok).length,
    relaxed_pass: rows.filter((r) => r.relaxed_ok).length,
    strict_fail_reasons: Object.fromEntries(
      Object.entries(rows.reduce((acc, r) => {
        if (!r.strict_ok) acc[r.strict_reason || 'UNKNOWN'] = (acc[r.strict_reason || 'UNKNOWN'] || 0) + 1;
        return acc;
      }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    ),
    rows
  };

  await writeJsonAtomic(OUT_PATH, summary);
  console.log(JSON.stringify({
    ok: true,
    out: path.relative(REPO_ROOT, OUT_PATH),
    sample_size_actual: summary.sample_size_actual,
    strict_pass: summary.strict_pass,
    relaxed_pass: summary.relaxed_pass
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, reason: error?.message || String(error) }));
  process.exit(1);
});

