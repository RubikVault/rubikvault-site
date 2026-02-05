// Node.js script for backfilling bars
// Usage: node scripts/providers/eodhd-backfill-bars.mjs --universe ./public/data/universe/nasdaq100.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple polyfill if fetch not global (Node 18+ has it)
const _fetch = global.fetch || (await import('node-fetch')).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'public/data/eod/bars');
const DELAY_MS = 1000; // Throttle

const API_KEY = process.env.EODHD_API_KEY;

if (!API_KEY) {
    console.error("Missing EODHD_API_KEY");
    process.exit(1);
}

const args = process.argv.slice(2);
const universeArgIndex = args.indexOf('--universe');
const universePath = universeArgIndex > -1 ? args[universeArgIndex + 1] : null;

if (!universePath) {
    console.log("Usage: node scripts/providers/eodhd-backfill-bars.mjs --universe <path>");
    process.exit(1);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadUniverse(p) {
    try {
        const content = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(content);
        // Supports array of strings or objects with symbol property (Forecast style or simple list)
        if (Array.isArray(data)) {
            return data.map(item => (typeof item === 'string' ? item : item.symbol || item.ticker)).filter(Boolean);
        }
        return [];
    } catch (e) {
        console.error(`Failed to load universe ${p}:`, e.message);
        return [];
    }
}

async function fetchEodhd(symbol) {
    let querySymbol = symbol;
    if (!querySymbol.includes('.')) {
        querySymbol = `${querySymbol}.US`;
    }
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(querySymbol)}?api_token=${API_KEY}&fmt=json&order=a`;
    try {
        const res = await _fetch(url);
        if (!res.ok) {
            return { ok: false, status: res.status };
        }
        const data = await res.json();
        return { ok: true, data };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function normalizeBars(rawBars) {
    if (!Array.isArray(rawBars)) return [];
    return rawBars.map(b => ({
        date: b.date,
        open: Number(b.open) || null,
        high: Number(b.high) || null,
        low: Number(b.low) || null,
        close: Number(b.close) || null,
        volume: Number(b.volume) || null
    })).filter(b => b.date && b.close !== null).sort((a, b) => a.date.localeCompare(b.date));
}

async function run() {
    const symbols = loadUniverse(universePath);
    console.log(`Loaded ${symbols.length} symbols from ${universePath}`);

    // Load Manifest
    const manifestPath = path.join(DATA_DIR, 'manifest.json');
    let manifest = { symbols: {}, stats: { total: 0, success: 0, failures: 0 } };
    if (fs.existsSync(manifestPath)) {
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch { }
    }

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    for (const symbol of symbols) {
        console.log(`Processing ${symbol}...`);

        // Check if we have existing file? 
        // Logic: merge? For "backfill/refresh", we usually want latest. 
        // EODHD full history fetch is cheap enough for 100 symbols daily.
        // Or fetch "from" latest date.

        const filePath = path.join(DATA_DIR, `${symbol}.json`);
        let existingBars = [];
        let startDate = null;

        if (fs.existsSync(filePath)) {
            try {
                existingBars = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (existingBars.length > 0) {
                    const lastDate = existingBars[existingBars.length - 1].date;
                    // Start next day
                    // Simplistic logic: Just request full history to be safe and merge? 
                    // EODHD full history is one call.
                }
            } catch { }
        }

        const res = await fetchEodhd(symbol);
        if (res.ok) {
            const newBars = normalizeBars(res.data);
            // Merge logic: Map by date
            const mergedMap = new Map();
            existingBars.forEach(b => mergedMap.set(b.date, b));
            newBars.forEach(b => mergedMap.set(b.date, b));

            const finalBars = Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date));

            fs.writeFileSync(filePath, JSON.stringify(finalBars, null, 2));
            manifest.symbols[symbol] = {
                count: finalBars.length,
                last_date: finalBars.length > 0 ? finalBars[finalBars.length - 1].date : null,
                updated_at: new Date().toISOString()
            };
            manifest.stats.success++;
            console.log(`  Saved ${finalBars.length} bars.`);
        } else {
            console.error(`  Failed: ${res.status || res.error}`);
            manifest.stats.failures++;
        }

        await sleep(DELAY_MS);
    }

    manifest.stats.total = symbols.length;
    manifest.updated_at = new Date().toISOString();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log("Done.");
}

run().catch(console.error);
