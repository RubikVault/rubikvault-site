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
const MAX_FAILURE_PCT = Number.isFinite(Number(process.env.EODHD_BACKFILL_MAX_FAILURE_PCT))
  ? Number(process.env.EODHD_BACKFILL_MAX_FAILURE_PCT)
  : 10;
const RETRIES = 3;

const API_KEY = String(process.env.EODHD_API_KEY || '').trim();
const TIINGO_API_KEY = String(process.env.TIINGO_API_KEY || '').trim();
if (!API_KEY && !TIINGO_API_KEY) {
  console.error('Missing provider keys (EODHD_API_KEY or TIINGO_API_KEY)');
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
  if (!API_KEY) {
    return { ok: false, error: 'eodhd_key_missing', status: null, provider: 'eodhd' };
  }
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
          return { ok: false, fatal: true, status: res.status, error: body || `HTTP ${res.status}`, provider: 'eodhd' };
        }
        lastErr = `${res.status}:${body || 'upstream_error'}`;
        if (res.status === 429 && attempt < RETRIES) {
          await sleep(600 * attempt);
          continue;
        }
        return { ok: false, status: res.status, error: lastErr, provider: 'eodhd' };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, status: res.status, error: 'empty_payload' };
      }
      return { ok: true, data, provider: 'eodhd' };
    } catch (e) {
      lastErr = e?.message || String(e);
      if (attempt < RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }
  return { ok: false, error: lastErr || 'unknown_fetch_error', provider: 'eodhd' };
}

function normalizeTiingoBars(rawBars) {
  if (!Array.isArray(rawBars)) return [];
  return rawBars
    .map((b) => {
      const close = toNumber(b?.close);
      const adjClose = toNumber(b?.adjClose ?? b?.adj_close ?? b?.close);
      const split = toNumber(b?.splitFactor ?? b?.split_factor ?? 1);
      const dividend = toNumber(b?.divCash ?? b?.dividend ?? 0);
      const volume = toNumber(b?.volume);
      const dateRaw = typeof b?.date === 'string' ? b.date.slice(0, 10) : null;
      return {
        date: dateRaw,
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

async function fetchTiingo(symbol) {
  if (!TIINGO_API_KEY) {
    return { ok: false, error: 'tiingo_key_missing', status: null, provider: 'tiingo' };
  }
  const ticker = String(symbol || '').trim().toUpperCase();
  if (!ticker) return { ok: false, error: 'empty_symbol', status: null, provider: 'tiingo' };
  const url = new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices`);
  url.searchParams.set('token', TIINGO_API_KEY);
  url.searchParams.set('startDate', '2010-01-01');
  url.searchParams.set('resampleFreq', 'daily');
  url.searchParams.set('format', 'json');

  let lastErr = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await _fetch(url.toString(), {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        const body = await res.text();
        lastErr = `${res.status}:${body || 'upstream_error'}`;
        if (res.status === 429 && attempt < RETRIES) {
          await sleep(700 * attempt);
          continue;
        }
        return { ok: false, status: res.status, error: lastErr, provider: 'tiingo' };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, status: res.status, error: 'empty_payload', provider: 'tiingo' };
      }
      return { ok: true, data, provider: 'tiingo' };
    } catch (e) {
      lastErr = e?.message || String(e);
      if (attempt < RETRIES) {
        await sleep(600 * attempt);
        continue;
      }
    }
  }
  return { ok: false, error: lastErr || 'unknown_fetch_error', provider: 'tiingo' };
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
  const runStats = {
    total: symbols.length,
    processed: 0,
    success: 0,
    failures: 0
  };
  let fatalAuthError = null;

  for (const symbol of symbols) {
    runStats.processed += 1;
    process.stdout.write(`Processing ${symbol}... `);
    const filePath = path.join(DATA_DIR, `${symbol}.json`);
    const eodRes = await fetchEodhd(symbol);
    let res = eodRes;
    let providerUsed = 'eodhd';
    let finalBars = [];

    if (res.ok) {
      finalBars = normalizeBars(res.data);
    } else if (TIINGO_API_KEY) {
      const tiingoRes = await fetchTiingo(symbol);
      if (tiingoRes.ok) {
        res = tiingoRes;
        providerUsed = 'tiingo';
        finalBars = normalizeTiingoBars(tiingoRes.data);
      } else {
        res = {
          ok: false,
          status: tiingoRes.status ?? eodRes.status ?? null,
          error: `eodhd=${eodRes.error || 'failed'}; tiingo=${tiingoRes.error || 'failed'}`,
          provider: 'provider_chain'
        };
      }
    }

    if (!res.ok) {
      runStats.failures += 1;
      failureSymbols.push({ symbol, status: res.status || null, provider: res.provider || 'unknown', error: res.error || 'unknown' });
      process.stdout.write(`FAILED (${res.provider || 'ERR'}:${res.status || 'ERR'})\n`);
      if (eodRes?.fatal && !TIINGO_API_KEY) {
        fatalAuthError = eodRes.error || `HTTP ${eodRes.status || 'unknown'}`;
        console.error('Fatal auth error from EODHD. Stopping to avoid writing corrupted data.');
        break;
      }
      await sleep(DELAY_MS);
      continue;
    }

    if (!finalBars.length) {
      runStats.failures += 1;
      failureSymbols.push({ symbol, status: null, provider: providerUsed, error: 'normalized_empty' });
      process.stdout.write('FAILED (normalized_empty)\n');
      await sleep(DELAY_MS);
      continue;
    }

    fs.writeFileSync(filePath, JSON.stringify(finalBars, null, 2));
    manifest.symbols[symbol] = {
      count: finalBars.length,
      last_date: finalBars[finalBars.length - 1]?.date || null,
      provider: providerUsed,
      updated_at: new Date().toISOString()
    };
    runStats.success += 1;
    process.stdout.write(`OK (${providerUsed}, ${finalBars.length} bars)\n`);
    await sleep(DELAY_MS);
  }

  const failurePct = runStats.total > 0 ? (runStats.failures / runStats.total) * 100 : 0;
  manifest.stats = {
    total: runStats.total,
    processed: runStats.processed,
    success: runStats.success,
    failures: runStats.failures,
    failure_pct: Number(failurePct.toFixed(3)),
    max_failure_pct: MAX_FAILURE_PCT
  };
  manifest.updated_at = new Date().toISOString();
  manifest.failures = failureSymbols;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (fatalAuthError) {
    console.error(`Backfill aborted due to fatal auth error: ${fatalAuthError}`);
    process.exit(1);
  }

  if (failureSymbols.length && failurePct > MAX_FAILURE_PCT) {
    console.error(
      `Backfill finished with ${failureSymbols.length} failures (${failurePct.toFixed(2)}%), above threshold ${MAX_FAILURE_PCT.toFixed(2)}%.`
    );
    process.exit(1);
  }
  if (failureSymbols.length) {
    console.warn(
      `Backfill finished with tolerated failures: ${failureSymbols.length} (${failurePct.toFixed(2)}% <= ${MAX_FAILURE_PCT.toFixed(2)}%).`
    );
  }
  console.log('Backfill completed successfully.');
}

run().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
