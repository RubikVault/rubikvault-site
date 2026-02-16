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
const POLICY_UNIVERSE_PATH = 'policies/universe/universe.v3.json';
const POLICY_MAPPING_PATH = 'policies/universe/symbol-mapping.v3.json';
const ISHARES_IWM_HOLDINGS_URL = 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund';

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

function parseCsvLine(line) {
    const out = [];
    let value = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                value += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(value.trim());
            value = '';
            continue;
        }
        value += ch;
    }
    out.push(value.trim());
    return out;
}

async function fetchRussell2000FromIshares() {
    console.log('  ↪️  Russell fallback: iShares IWM holdings');
    try {
        const response = await fetch(ISHARES_IWM_HOLDINGS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csv = await response.text();
        const lines = csv.split(/\r?\n/).filter(Boolean);
        const headerIdx = lines.findIndex((line) => /^Ticker,Name,Sector,Asset Class,/i.test(line));
        if (headerIdx < 0) {
            throw new Error('CSV header not found');
        }

        const headers = parseCsvLine(lines[headerIdx]).map((h) => String(h || '').trim().toLowerCase());
        const tickerIdx = headers.indexOf('ticker');
        const nameIdx = headers.indexOf('name');
        const assetClassIdx = headers.indexOf('asset class');
        if (tickerIdx < 0 || nameIdx < 0) throw new Error('ticker/name columns missing');

        const map = new Map();
        for (let i = headerIdx + 1; i < lines.length; i += 1) {
            const row = parseCsvLine(lines[i]);
            if (!row.length) continue;
            const ticker = String(row[tickerIdx] || '').trim().toUpperCase();
            const name = String(row[nameIdx] || '').trim();
            const assetClass = assetClassIdx >= 0 ? String(row[assetClassIdx] || '').trim().toLowerCase() : '';
            if (!ticker || ticker === '-' || ticker === 'N/A') continue;
            if (!/^[A-Z0-9.\-]{1,15}$/.test(ticker)) continue;
            if (assetClass && assetClass !== 'equity') continue;
            if (!map.has(ticker)) map.set(ticker, { ticker, name: name || ticker });
        }

        const universe = Array.from(map.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
        console.log(`  ✅ Russell fallback loaded ${universe.length} symbols from iShares`);
        return universe;
    } catch (err) {
        console.warn(`  ⚠️ Russell fallback failed: ${err.message}`);
        return [];
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

function writeV3PolicyUniverse(combined) {
    const symbols = combined.map((row) => ({
        canonical_id: `US:${row.ticker}`,
        ticker: row.ticker,
        name: row.name || row.ticker
    }));
    const universeDoc = {
        schema_version: 'v3',
        universe_id: 'all-us',
        expected_count: symbols.length,
        canonical_id_format: 'US:{ticker}',
        symbols
    };
    const mappingDoc = {
        schema_version: 'v3',
        generated_from: 'public/data/universe/all.json',
        coverage: {
            expected: symbols.length,
            mapped: symbols.length,
            percent: 100
        },
        mappings: Object.fromEntries(
            symbols.map((row) => [
                row.canonical_id,
                {
                    ticker: row.ticker,
                    exchange: 'US',
                    currency: 'USD',
                    provider_ids: {
                        eodhd: `${row.ticker}.US`,
                        tiingo: row.ticker
                    },
                    status: 'active'
                }
            ])
        )
    };

    fs.writeFileSync(POLICY_UNIVERSE_PATH, JSON.stringify(universeDoc, null, 2));
    fs.writeFileSync(POLICY_MAPPING_PATH, JSON.stringify(mappingDoc, null, 2));
    console.log(`  📁 Wrote ${POLICY_UNIVERSE_PATH} (${symbols.length} symbols)`);
    console.log(`  📁 Wrote ${POLICY_MAPPING_PATH} (${symbols.length} mappings)`);
}

async function main() {
    console.log('═'.repeat(50));
    console.log('🌐 EODHD Index Constituents Fetcher');
    console.log('═'.repeat(50));

    if (!API_KEY) {
        console.warn('⚠️ EODHD_API_KEY not set; using fallbacks + existing files where available.');
    }

    // Ensure output directory exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Fetch all indices
    const universes = {};
    for (const index of INDICES) {
        let universe = API_KEY ? await fetchIndexConstituents(index) : [];

        if (index.id === 'russell2000' && universe.length < index.expectedMin) {
            const fromIshares = await fetchRussell2000FromIshares();
            if (fromIshares.length > universe.length) {
                universe = fromIshares;
            }
        }

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
        const combined = createCombinedUniverse(universes);
        writeV3PolicyUniverse(combined);
    }

    console.log('\n═'.repeat(50));
    console.log('✅ DONE');
    console.log('═'.repeat(50));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
