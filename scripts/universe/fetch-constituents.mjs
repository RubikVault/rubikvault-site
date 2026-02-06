#!/usr/bin/env node
/**
 * Fetch Index Constituents from EODHD
 * 
 * Uses EODHD's fundamentals API and screener to get constituents:
 * - S&P 500 (GSPC.INDX)
 * - Dow Jones 30 (DJI.INDX)
 * - NASDAQ-100 (NDX.INDX)
 * - Russell 2000 (RUA.INDX)
 * 
 * Usage:
 *   EODHD_API_KEY=xxx node scripts/universe/fetch-constituents.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.EODHD_API_KEY;
const BASE_URL = 'https://eodhd.com/api';
const OUTPUT_DIR = 'public/data/universe';

// Index definitions with correct EODHD codes
const INDICES = [
    { id: 'sp500', symbol: 'GSPC.INDX', name: 'S&P 500', expectedMin: 400 },
    { id: 'dowjones', symbol: 'DJI.INDX', name: 'Dow Jones 30', expectedMin: 25 },
    { id: 'nasdaq100', symbol: 'NDX.INDX', name: 'NASDAQ-100', expectedMin: 90 },
    { id: 'russell2000', symbol: 'RUA.INDX', name: 'Russell 2000', expectedMin: 1500 }
];

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (err) {
            console.warn(`  Attempt ${i + 1}/${retries} failed: ${err.message}`);
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

async function fetchIndexConstituents(index) {
    console.log(`\n📊 Fetching ${index.name} (${index.symbol})...`);

    // Try fundamentals API first - it has Components for major indices
    const url = `${BASE_URL}/fundamentals/${index.symbol}?api_token=${API_KEY}&fmt=json`;

    try {
        const data = await fetchWithRetry(url);

        // The Components field in EODHD response is an object keyed by ticker
        // e.g., { "AAPL": { "Name": "Apple Inc.", ...}, "MSFT": {...} }
        const components = data?.Components || {};
        const tickers = Object.keys(components);

        if (tickers.length >= index.expectedMin) {
            // Components found - extract them
            const universe = tickers.map(ticker => {
                const comp = components[ticker];
                // Remove .US suffix if present (EODHD uses AAPL.US format)
                const cleanTicker = ticker.replace(/\.US$/i, '');
                return {
                    ticker: cleanTicker,
                    name: comp?.Name || comp?.name || cleanTicker
                };
            }).sort((a, b) => a.ticker.localeCompare(b.ticker));

            console.log(`  ✅ Found ${universe.length} constituents from Components`);
            return universe;
        }

        // If Components is empty or too small, try General.Components (some indices use this)
        const generalComponents = data?.General?.Components || {};
        const generalTickers = Object.keys(generalComponents);

        if (generalTickers.length >= index.expectedMin) {
            const universe = generalTickers.map(ticker => {
                const comp = generalComponents[ticker];
                const cleanTicker = ticker.replace(/\.US$/i, '');
                return {
                    ticker: cleanTicker,
                    name: comp?.Name || comp?.name || cleanTicker
                };
            }).sort((a, b) => a.ticker.localeCompare(b.ticker));

            console.log(`  ✅ Found ${universe.length} constituents from General.Components`);
            return universe;
        }

        console.warn(`  ⚠️ Only ${tickers.length} symbols from Components (expected ≥${index.expectedMin})`);
        console.warn(`  ⚠️ EODHD may not support full constituents for this index`);

        // Return what we have
        if (tickers.length > 0) {
            return tickers.map(ticker => ({
                ticker: ticker.replace(/\.US$/i, ''),
                name: components[ticker]?.Name || ticker
            })).sort((a, b) => a.ticker.localeCompare(b.ticker));
        }

        return [];

    } catch (err) {
        console.error(`  ❌ Failed: ${err.message}`);
        return [];
    }
}

function readExistingUniverse(id) {
    const filePath = path.join(OUTPUT_DIR, `${id}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data) && data.length > 10) {
                console.log(`  📂 Existing ${id}.json has ${data.length} symbols`);
                return data;
            }
        }
    } catch (err) {
        console.warn(`  ⚠️ Could not read existing ${id}.json: ${err.message}`);
    }
    return null;
}

function writeUniverseFile(id, universe) {
    const filePath = path.join(OUTPUT_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(universe, null, 2));
    console.log(`  📁 Wrote ${filePath} (${universe.length} symbols)`);
}

function createCombinedUniverse(universes) {
    console.log('\n🔗 Creating combined universe...');

    // Merge all universes, deduplicating by ticker
    const symbolMap = new Map();

    for (const [id, universe] of Object.entries(universes)) {
        for (const stock of universe) {
            const ticker = stock.ticker || stock.symbol;
            if (!ticker) continue;

            if (!symbolMap.has(ticker)) {
                symbolMap.set(ticker, {
                    ticker: ticker,
                    name: stock.name || ticker,
                    indices: [id]
                });
            } else {
                symbolMap.get(ticker).indices.push(id);
            }
        }
    }

    // Convert to array and sort
    const combined = Array.from(symbolMap.values())
        .sort((a, b) => a.ticker.localeCompare(b.ticker));

    // Write combined file (simple format for compatibility)
    const simpleFormat = combined.map(s => ({ ticker: s.ticker, name: s.name }));
    const filePath = path.join(OUTPUT_DIR, 'all.json');
    fs.writeFileSync(filePath, JSON.stringify(simpleFormat, null, 2));

    console.log(`  ✅ Combined: ${combined.length} unique symbols`);
    console.log(`  📁 Wrote ${filePath}`);

    // Print overlap stats
    const overlaps = combined.filter(s => s.indices.length > 1);
    console.log(`  📊 Overlap: ${overlaps.length} symbols appear in multiple indices`);

    return combined;
}

async function main() {
    console.log('═'.repeat(50));
    console.log('🌐 EODHD Index Constituents Fetcher');
    console.log('═'.repeat(50));

    if (!API_KEY) {
        console.error('❌ EODHD_API_KEY environment variable not set');
        process.exit(1);
    }

    // Ensure output directory exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Fetch all indices
    const universes = {};
    for (const index of INDICES) {
        let universe = await fetchIndexConstituents(index);

        // If EODHD didn't return enough symbols, try to use existing file
        if (universe.length < index.expectedMin) {
            const existing = readExistingUniverse(index.id);
            if (existing && existing.length > universe.length) {
                console.log(`  📌 Using existing ${index.id}.json (${existing.length} symbols)`);
                universe = existing;
            }
        }

        if (universe.length > 0) {
            universes[index.id] = universe;
            writeUniverseFile(index.id, universe);
        }
    }

    // Create combined universe
    if (Object.keys(universes).length > 0) {
        createCombinedUniverse(universes);
    }

    console.log('\n═'.repeat(50));
    console.log('✅ DONE');
    console.log('═'.repeat(50));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
