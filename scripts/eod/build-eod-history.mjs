import fs from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../lib/fs-atomic.mjs';

const REPO_ROOT = process.cwd();
const DEFAULT_CHUNK_SIZE = 50; // Smaller chunk size for history
const CONCURRENCY = 3; // Limit concurrency to avoid rate limits
const HISTORY_YEARS = 30;

function isoNow() {
    return new Date().toISOString();
}

function normalizeSymbol(value) {
    return String(value || '').trim().toUpperCase();
}

function parseArgs(argv) {
    const out = {
        universe: 'all', // Default to all
        outDir: 'public/data'
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--universe') {
            out.universe = argv[i + 1] || null;
            i += 1;
        } else if (arg === '--out') {
            out.outDir = argv[i + 1] || out.outDir;
            i += 1;
        }
    }

    return out;
}

async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function extractUniverseSymbols(payload) {
    if (!Array.isArray(payload)) return [];
    const symbols = new Set();
    for (const row of payload) {
        if (typeof row === 'string') {
            const sym = normalizeSymbol(row);
            if (sym) symbols.add(sym);
            continue;
        }
        const sym = normalizeSymbol(row?.ticker ?? row?.symbol ?? row?.code ?? null);
        if (sym) symbols.add(sym);
    }
    return Array.from(symbols).sort();
}

function generateSyntheticHistory(symbol, years = 30) {
    const bars = [];
    const now = new Date();
    const startDate = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
    let currentDate = new Date(startDate);

    // Random start price between 50 and 200
    let currentPrice = 50 + Math.random() * 150;

    while (currentDate <= now) {
        // Skip weekends
        const day = currentDate.getDay();
        if (day !== 0 && day !== 6) {
            // Random daily change (-2% to +2.1% drift)
            const changePct = (Math.random() * 0.041) - 0.02;
            const open = currentPrice;
            const close = currentPrice * (1 + changePct);
            const high = Math.max(open, close) * (1 + Math.random() * 0.01);
            const low = Math.min(open, close) * (1 - Math.random() * 0.01);
            const volume = Math.floor(1000000 + Math.random() * 5000000);

            bars.push({
                date: currentDate.toISOString().slice(0, 10),
                open: Number(open.toFixed(2)),
                high: Number(high.toFixed(2)),
                low: Number(low.toFixed(2)),
                close: Number(close.toFixed(2)),
                volume,
                adjClose: Number(close.toFixed(2)), // Simplify for synthetic
                dividend: 0,
                split: 1
            });

            currentPrice = close;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return bars;
}

async function fetchHistory(symbol, token) {
    if (!token) return null;

    const startDate = new Date(new Date().getFullYear() - HISTORY_YEARS, 0, 1).toISOString().slice(0, 10);
    const url = new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices`);
    url.searchParams.set('token', token);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('resampleFreq', 'daily');

    try {
        const res = await fetch(url.toString());
        if (!res.ok) {
            if (res.status === 429) throw new Error('RATE_LIMIT');
            return null;
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;

        return data.map(d => ({
            date: d.date.slice(0, 10),
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volume,
            adjClose: d.adjClose,
            dividend: d.divCash,
            split: d.splitFactor
        }));
    } catch (err) {
        if (err.message === 'RATE_LIMIT') throw err;
        return null;
    }
}

async function mapWithConcurrency(items, limit, worker) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = worker(item).then(result => {
            executing.splice(executing.indexOf(p), 1);
            return result;
        });
        results.push(p);
        executing.push(p);
        if (executing.length >= limit) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.universe) throw new Error('Missing --universe');

    const outRoot = path.resolve(REPO_ROOT, args.outDir);
    const universePath = path.join(outRoot, 'universe', `${args.universe}.json`);
    const universePayload = await readJson(universePath);

    if (!universePayload) {
        console.error(`Universe file not found: ${universePath}`);
        process.exit(1);
    }

  const symbols = extractUniverseSymbols(universePayload);
  const token = process.env.TIINGO_API_KEY;
  const allowSynthetic = process.env.ALLOW_SYNTHETIC_HISTORY === '1';
  let useSynthetic = !token && allowSynthetic;

  console.log(`Generating history for ${symbols.length} symbols (Universe: ${args.universe})...`);
  if (!token && !allowSynthetic) {
    console.error('MISSING_SECRET:TIINGO_API_KEY (set ALLOW_SYNTHETIC_HISTORY=1 only for explicit local tests)');
    process.exit(1);
  }
  if (useSynthetic) console.log('⚠️  ALLOW_SYNTHETIC_HISTORY=1 active. Using synthetic data.');

  const barsDir = path.join(outRoot, 'eod', 'bars');
  await fs.mkdir(barsDir, { recursive: true });

  let successCount = 0;
  let syntheticCount = 0;
  let failedCount = 0;

  await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
    let bars = null;

        if (!useSynthetic) {
            try {
                bars = await fetchHistory(symbol, token);
            } catch (err) {
                if (err.message === 'RATE_LIMIT') {
                    if (allowSynthetic) {
                        console.warn('⚠️  Rate limit hit. Switching to synthetic data for remaining symbols due to ALLOW_SYNTHETIC_HISTORY=1.');
                        useSynthetic = true;
                    } else {
                        console.error(`RATE_LIMIT:${symbol}`);
                    }
                }
            }
        }

        if (!bars) {
            if (useSynthetic) {
                bars = generateSyntheticHistory(symbol, HISTORY_YEARS);
                syntheticCount++;
            } else {
                failedCount++;
                return;
            }
        }

        if (bars && bars.length > 0) {
            const filePath = path.join(barsDir, `${symbol}.json`);
            await writeJsonAtomic(filePath, bars);
            successCount++;
            if (successCount % 50 === 0) process.stdout.write('.');
        }
    });

    console.log('\n');
  console.log(`✅ Completed: ${successCount} symbols processed.`);
  console.log(`📊 Real Data: ${successCount - syntheticCount}`);
  console.log(`🤖 Synthetic Data: ${syntheticCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

await main();
