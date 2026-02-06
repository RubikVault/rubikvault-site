#!/usr/bin/env node
/**
 * Fetch Index Constituents from EODHD
 * 
 * Fetches constituents for major indices and creates universe files:
 * - S&P 500 (GSPC.INDX)
 * - Dow Jones 30 (DJI.INDX)
 * - NASDAQ-100 (NDX.INDX)
 * - Russell 2000 (RUT.INDX)
 * 
 * Usage:
 *   EODHD_API_KEY=xxx node scripts/universe/fetch-constituents.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.EODHD_API_KEY;
const BASE_URL = 'https://eodhd.com/api';
const OUTPUT_DIR = 'public/data/universe';

// Index definitions
const INDICES = [
    { id: 'sp500', symbol: 'GSPC.INDX', name: 'S&P 500', expectedMin: 400 },
    { id: 'dowjones', symbol: 'DJI.INDX', name: 'Dow Jones 30', expectedMin: 25 },
    { id: 'nasdaq100', symbol: 'NDX.INDX', name: 'NASDAQ-100', expectedMin: 90 },
    { id: 'russell2000', symbol: 'RUT.INDX', name: 'Russell 2000', expectedMin: 1500 }
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

    const url = `${BASE_URL}/fundamentals/${index.symbol}?api_token=${API_KEY}&fmt=json`;

    try {
        const data = await fetchWithRetry(url);

        // Extract components from fundamentals data
        const components = data?.Components || data?.components || {};
        const symbols = Object.keys(components);

        if (symbols.length < index.expectedMin) {
            console.warn(`  ⚠️ Only ${symbols.length} symbols (expected ≥${index.expectedMin})`);
        }

        // Create universe array with symbol and name
        const universe = symbols.map(symbol => {
            const comp = components[symbol];
            return {
                symbol: symbol.replace('.US', ''), // Remove .US suffix if present
                name: comp?.Name || comp?.name || symbol
            };
        }).sort((a, b) => a.symbol.localeCompare(b.symbol));

        console.log(`  ✅ Found ${universe.length} constituents`);
        return universe;

    } catch (err) {
        console.error(`  ❌ Failed: ${err.message}`);
        return [];
    }
}

function writeUniverseFile(id, universe) {
    const filePath = path.join(OUTPUT_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(universe, null, 2));
    console.log(`  📁 Wrote ${filePath} (${universe.length} symbols)`);
}

function createCombinedUniverse(universes) {
    console.log('\n🔗 Creating combined universe...');

    // Merge all universes
    const symbolMap = new Map();

    for (const [id, universe] of Object.entries(universes)) {
        for (const stock of universe) {
            if (!symbolMap.has(stock.symbol)) {
                symbolMap.set(stock.symbol, {
                    symbol: stock.symbol,
                    name: stock.name,
                    indices: [id]
                });
            } else {
                symbolMap.get(stock.symbol).indices.push(id);
            }
        }
    }

    // Convert to array and sort
    const combined = Array.from(symbolMap.values())
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

    // Write combined file (without indices field for simplicity)
    const simpleFormat = combined.map(s => ({ symbol: s.symbol, name: s.name }));
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
        const universe = await fetchIndexConstituents(index);
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
