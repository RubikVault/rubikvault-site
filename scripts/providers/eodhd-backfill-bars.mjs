// Node.js script for backfilling bars from EODHD
// Usage: node scripts/providers/eodhd-backfill-bars.mjs --universe ./public/data/universe/all.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const _fetch = global.fetch || (await import('node-fetch')).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'public/data/eod/bars');
const DELAY_MS = Number.isFinite(Number(process.env.EODHD_BACKFILL_DELAY_MS))
  ? Number(process.env.EODHD_BACKFILL_DELAY_MS)
  : 250;
const RETRIES = 3;

const API_KEY = String(process.env.EODHD_API_KEY || '').trim();
if (!API_KEY) {
  console.error('Missing EODHD_API_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const universeArgIndex = args.indexOf('--universe');
const universePath = universeArgIndex > -1 ? args[universeArgIndex + 1] : null;

if (!universePath) {
  console.log('Usage: node scripts/providers/eodhd-backfill-bars.mjs --universe <path>');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUniverse(p) {
  try {
    const content = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data)) return [];
    const symbols = data
      .map((item) => (typeof item === 'string' ? item : item?.symbol || item?.ticker))
      .filter(Boolean)
      .map((s) => String(s).trim().toUpperCase());
    return [...new Set(symbols)].sort();
  } catch (e) {
    console.error(`Failed to load universe ${p}:`, e.message);
    return [];
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBars(rawBars) {
  if (!Array.isArray(rawBars)) return [];
  return rawBars
    .map((b) => {
      const close = toNumber(b?.close);
      const adjClose = toNumber(b?.adjusted_close ?? b?.adj_close ?? b?.close);
      const split = toNumber(b?.split ?? b?.split_factor ?? 1);
      const dividend = toNumber(b?.dividend ?? b?.dividend_value ?? 0);
      const volume = toNumber(b?.volume);
      return {
        date: typeof b?.date === 'string' ? b.date.slice(0, 10) : null,
        open: toNumber(b?.open),
        high: toNumber(b?.high),
        low: toNumber(b?.low),
        close,
        volume,
        adjClose: adjClose ?? close,
        dividend: dividend ?? 0,
        split: split ?? 1
      };
    })
    .filter((b) => b.date && b.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchEodhd(symbol) {
  let querySymbol = String(symbol || '').trim().toUpperCase();
  if (!querySymbol) {
    return { ok: false, error: 'empty_symbol' };
  }
  // Class shares in this repo use dot form (e.g. BRK.B), EODHD expects dash (BRK-B.US).
  const classShare = querySymbol.match(/^([A-Z0-9]+)\.([A-Z])$/);
  if (classShare) {
    querySymbol = `${classShare[1]}-${classShare[2]}.US`;
  } else if (!querySymbol.includes('.')) {
    querySymbol = `${querySymbol}.US`;
  }
  const url = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(querySymbol)}`);
  url.searchParams.set('api_token', API_KEY);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('order', 'a');

  let lastErr = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await _fetch(url.toString(), {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 401 || res.status === 403) {
          return { ok: false, fatal: true, status: res.status, error: body || `HTTP ${res.status}` };
        }
        lastErr = `${res.status}:${body || 'upstream_error'}`;
        if (res.status === 429 && attempt < RETRIES) {
          await sleep(600 * attempt);
          continue;
        }
        return { ok: false, status: res.status, error: lastErr };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, status: res.status, error: 'empty_payload' };
      }
      return { ok: true, data };
    } catch (e) {
      lastErr = e?.message || String(e);
      if (attempt < RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }
  return { ok: false, error: lastErr || 'unknown_fetch_error' };
}

async function run() {
  const symbols = loadUniverse(universePath);
  if (!symbols.length) {
    console.error(`Universe empty: ${universePath}`);
    process.exit(1);
  }
  console.log(`Loaded ${symbols.length} symbols from ${universePath}`);

  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  let manifest = { symbols: {}, stats: { total: 0, success: 0, failures: 0 } };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      manifest = { symbols: {}, stats: { total: 0, success: 0, failures: 0 } };
    }
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const failureSymbols = [];

  for (const symbol of symbols) {
    process.stdout.write(`Processing ${symbol}... `);
    const filePath = path.join(DATA_DIR, `${symbol}.json`);
    const res = await fetchEodhd(symbol);

    if (!res.ok) {
      manifest.stats.failures += 1;
      failureSymbols.push({ symbol, status: res.status || null, error: res.error || 'unknown' });
      process.stdout.write(`FAILED (${res.status || 'ERR'})\n`);
      if (res.fatal) {
        console.error('Fatal auth error from EODHD. Stopping to avoid writing corrupted data.');
        break;
      }
      await sleep(DELAY_MS);
      continue;
    }

    const finalBars = normalizeBars(res.data);
    if (!finalBars.length) {
      manifest.stats.failures += 1;
      failureSymbols.push({ symbol, status: null, error: 'normalized_empty' });
      process.stdout.write('FAILED (normalized_empty)\n');
      await sleep(DELAY_MS);
      continue;
    }

    fs.writeFileSync(filePath, JSON.stringify(finalBars, null, 2));
    manifest.symbols[symbol] = {
      count: finalBars.length,
      last_date: finalBars[finalBars.length - 1]?.date || null,
      updated_at: new Date().toISOString()
    };
    manifest.stats.success += 1;
    process.stdout.write(`OK (${finalBars.length} bars)\n`);
    await sleep(DELAY_MS);
  }

  manifest.stats.total = symbols.length;
  manifest.updated_at = new Date().toISOString();
  manifest.failures = failureSymbols;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (failureSymbols.length) {
    console.error(`Backfill finished with ${failureSymbols.length} failures.`);
    process.exit(1);
  }
  console.log('Backfill completed successfully.');
}

run().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
