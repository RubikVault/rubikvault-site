#!/usr/bin/env node
/**
 * Fetch Index Constituents from Public Sources
 * 
 * Uses reliable GitHub/DataHub sources for index constituents:
 * - S&P 500: GitHub datasets repository
 * - Dow Jones 30: Wikipedia data
 * - Russell 2000: Static list from index provider
 * 
 * Run locally: node scripts/universe/fetch-from-public.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'public/data/universe';

// Source URLs for index constituents
const SOURCES = {
    sp500: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
    nasdaq100: null, // Use existing file
    dowjones: null, // Will be embedded
    russell2000: null // Will use alternative source
};

// Static Dow Jones 30 constituents (stable, rarely changes)
const DOW_JONES_30 = [
    { ticker: 'AAPL', name: 'Apple Inc.' },
    { ticker: 'AMGN', name: 'Amgen Inc.' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.' },
    { ticker: 'AXP', name: 'American Express' },
    { ticker: 'BA', name: 'Boeing' },
    { ticker: 'CAT', name: 'Caterpillar Inc.' },
    { ticker: 'CRM', name: 'Salesforce' },
    { ticker: 'CSCO', name: 'Cisco Systems' },
    { ticker: 'CVX', name: 'Chevron' },
    { ticker: 'DIS', name: 'Walt Disney' },
    { ticker: 'DOW', name: 'Dow Inc.' },
    { ticker: 'GS', name: 'Goldman Sachs' },
    { ticker: 'HD', name: 'Home Depot' },
    { ticker: 'HON', name: 'Honeywell' },
    { ticker: 'IBM', name: 'IBM' },
    { ticker: 'INTC', name: 'Intel' },
    { ticker: 'JNJ', name: 'Johnson & Johnson' },
    { ticker: 'JPM', name: 'JPMorgan Chase' },
    { ticker: 'KO', name: 'Coca-Cola' },
    { ticker: 'MCD', name: 'McDonald\'s' },
    { ticker: 'MMM', name: '3M' },
    { ticker: 'MRK', name: 'Merck' },
    { ticker: 'MSFT', name: 'Microsoft' },
    { ticker: 'NKE', name: 'Nike' },
    { ticker: 'NVDA', name: 'NVIDIA' },
    { ticker: 'PG', name: 'Procter & Gamble' },
    { ticker: 'TRV', name: 'Travelers' },
    { ticker: 'UNH', name: 'UnitedHealth' },
    { ticker: 'V', name: 'Visa' },
    { ticker: 'VZ', name: 'Verizon' },
    { ticker: 'WBA', name: 'Walgreens Boots Alliance' },
    { ticker: 'WMT', name: 'Walmart' }
];

async function fetchCSV(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    const symbolIdx = headers.indexOf('symbol');
    const nameIdx = headers.indexOf('security') !== -1 ? headers.indexOf('security') : headers.indexOf('name');

    if (symbolIdx === -1) throw new Error('No symbol column found');

    const results = [];
    for (let i = 1; i < lines.length; i++) {
        // Handle CSV with quoted values
        const line = lines[i];
        const values = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        const symbol = values[symbolIdx];
        const name = nameIdx !== -1 ? values[nameIdx] : symbol;

        if (symbol && symbol.match(/^[A-Z0-9.]+$/)) {
            results.push({ ticker: symbol, name: name || symbol });
        }
    }

    return results;
}

function writeUniverseFile(id, universe) {
    const filePath = path.join(OUTPUT_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(universe, null, 2));
    console.log(`  📁 Wrote ${filePath} (${universe.length} symbols)`);
}

function readExistingUniverse(id) {
    const filePath = path.join(OUTPUT_DIR, `${id}.json`);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (err) {
        console.warn(`  ⚠️ Could not read ${id}.json: ${err.message}`);
    }
    return null;
}

function createCombinedUniverse(universes) {
    console.log('\n🔗 Creating combined universe...');

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

    const combined = Array.from(symbolMap.values())
        .sort((a, b) => a.ticker.localeCompare(b.ticker));

    // Write simple format for compatibility
    const simpleFormat = combined.map(s => ({ ticker: s.ticker, name: s.name }));
    const filePath = path.join(OUTPUT_DIR, 'all.json');
    fs.writeFileSync(filePath, JSON.stringify(simpleFormat, null, 2));

    console.log(`  ✅ Combined: ${combined.length} unique symbols`);
    console.log(`  📁 Wrote ${filePath}`);

    // Overlap stats
    const overlaps = combined.filter(s => s.indices.length > 1);
    console.log(`  📊 Overlap: ${overlaps.length} symbols in multiple indices`);

    return combined;
}

async function main() {
    console.log('═'.repeat(50));
    console.log('🌐 Index Constituents Fetcher (Public Sources)');
    console.log('═'.repeat(50));

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const universes = {};

    // 1. S&P 500 from GitHub
    console.log('\n📊 Fetching S&P 500...');
    try {
        const csvText = await fetchCSV(SOURCES.sp500);
        const sp500 = parseCSV(csvText);
        if (sp500.length >= 400) {
            universes['sp500'] = sp500;
            writeUniverseFile('sp500', sp500);
        } else {
            console.warn(`  ⚠️ Only ${sp500.length} symbols, expected 500+`);
        }
    } catch (err) {
        console.error(`  ❌ Failed: ${err.message}`);
    }

    // 2. NASDAQ-100 (use existing file)
    console.log('\n📊 Loading NASDAQ-100 (existing)...');
    const nasdaq100 = readExistingUniverse('nasdaq100');
    if (nasdaq100 && nasdaq100.length >= 90) {
        universes['nasdaq100'] = nasdaq100;
        console.log(`  ✅ Loaded ${nasdaq100.length} symbols`);
    } else {
        console.warn('  ⚠️ NASDAQ-100 file not found or incomplete');
    }

    // 3. Dow Jones 30 (static list)
    console.log('\n📊 Writing Dow Jones 30...');
    universes['dowjones'] = DOW_JONES_30;
    writeUniverseFile('dowjones', DOW_JONES_30);
    console.log(`  ✅ ${DOW_JONES_30.length} symbols`);

    // 4. Create combined universe
    createCombinedUniverse(universes);

    console.log('\n═'.repeat(50));
    console.log('✅ DONE');
    console.log('═'.repeat(50));

    // Summary
    console.log('\n📋 Summary:');
    for (const [id, universe] of Object.entries(universes)) {
        console.log(`  ${id}: ${universe.length} symbols`);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
