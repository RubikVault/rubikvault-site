/**
 * Forecast System v3.0 — Snapshot Ingest
 * 
 * Ingests data from existing RubikVault sources:
 * - Universe from /data/universe/nasdaq100.json
 * - Prices from /data/eod/batches/eod.latest.*.json
 * - Creates manifests in mirrors/forecast/snapshots/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeDigest } from '../lib/digest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path Constants
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSE_PATH = 'public/data/universe/nasdaq100.json';
const EOD_BATCH_PATTERN = 'public/data/eod/batches/eod.latest.';
const MIRRORS_SNAPSHOT_BASE = 'mirrors/forecast/snapshots';

// ─────────────────────────────────────────────────────────────────────────────
// Universe Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load universe (ticker list) from existing data
 * @param {string} repoRoot - Repository root
 * @returns {string[]} Array of tickers
 */
export function loadUniverse(repoRoot) {
    const universePath = path.join(repoRoot, UNIVERSE_PATH);

    if (!fs.existsSync(universePath)) {
        console.warn(`[Ingest] Universe not found at ${universePath}`);
        return [];
    }

    const content = fs.readFileSync(universePath, 'utf8');
    const data = JSON.parse(content);

    // Handle both array and object formats
    if (Array.isArray(data)) {
        return data.map(item => typeof item === 'string' ? item : item.ticker || item.symbol);
    }

    if (data.tickers) return data.tickers;
    if (data.symbols) return data.symbols;
    if (data.data && Array.isArray(data.data)) {
        return data.data.map(item => item.ticker || item.symbol || item);
    }

    // If object with ticker keys
    return Object.keys(data).filter(k => !['schema', 'metadata', 'generated_at', 'data'].includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Price Data Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load EOD batch data from all available batches
 * @param {string} repoRoot - Repository root
 * @returns {object} Map of ticker -> price data
 */
export function loadEodBatches(repoRoot) {
    const allPrices = {};

    // Try batches 000-009
    for (let i = 0; i < 10; i++) {
        const batchPath = path.join(repoRoot, `${EOD_BATCH_PATTERN}${String(i).padStart(3, '0')}.json`);

        if (!fs.existsSync(batchPath)) continue;

        try {
            const content = fs.readFileSync(batchPath, 'utf8');
            const batch = JSON.parse(content);
            const data = batch.data || batch;

            for (const [ticker, priceData] of Object.entries(data)) {
                if (ticker === 'schema_version' || ticker === 'chunk_id' || ticker === 'generated_at') continue;

                if (!allPrices[ticker]) {
                    allPrices[ticker] = priceData;
                }
            }
        } catch (err) {
            console.warn(`[Ingest] Error reading batch ${batchPath}: ${err.message}`);
        }
    }

    return allPrices;
}

/**
 * Load full price history for tickers
 * Uses EOD batches for latest data
 * @param {string} repoRoot - Repository root
 * @param {string[]} tickers - Tickers to load
 * @param {string} asOfDate - As-of date
 * @returns {object} Map of ticker -> {dates, closes, volumes}
 */
export async function loadPriceHistory(repoRoot, tickers, asOfDate) {
    const history = {};

    // Load EOD batches for latest prices
    const eodData = loadEodBatches(repoRoot);

    for (const ticker of tickers) {
        const tickerData = eodData[ticker];
        if (!tickerData) continue;

        // If single bar (latest), create minimal history
        if (tickerData.date && tickerData.close !== undefined) {
            history[ticker] = {
                dates: [tickerData.date],
                closes: [tickerData.close],
                volumes: [tickerData.volume ?? 0],
                opens: [tickerData.open ?? tickerData.close],
                highs: [tickerData.high ?? tickerData.close],
                lows: [tickerData.low ?? tickerData.close]
            };
        }

        // If array of bars (historical)
        if (Array.isArray(tickerData)) {
            history[ticker] = {
                dates: tickerData.map(b => b.date),
                closes: tickerData.map(b => b.close ?? b.adjClose),
                volumes: tickerData.map(b => b.volume ?? 0),
                opens: tickerData.map(b => b.open),
                highs: tickerData.map(b => b.high),
                lows: tickerData.map(b => b.low)
            };
        }
    }

    // Supplement with historical data from snapshots if available
    const historyPath = path.join(repoRoot, 'public/data/snapshots/market-prices/latest.json');
    if (fs.existsSync(historyPath)) {
        try {
            const content = fs.readFileSync(historyPath, 'utf8');
            const snapshot = JSON.parse(content);
            const data = snapshot.data || snapshot;

            for (const ticker of tickers) {
                if (data[ticker] && !history[ticker]) {
                    history[ticker] = {
                        dates: [data[ticker].date || asOfDate],
                        closes: [data[ticker].close || data[ticker].price],
                        volumes: [data[ticker].volume ?? 0]
                    };
                }
            }
        } catch (err) {
            // Ignore errors
        }
    }

    return history;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create snapshot manifest
 * @param {object} snapshots - Map of snapshot name -> data
 * @param {string} asOf - As-of timestamp
 * @returns {object} Manifest object
 */
export function createManifest(snapshots, asOf) {
    const manifest = {
        schema: 'forecast_snapshot_manifest_v1',
        as_of: asOf,
        snapshots: {}
    };

    for (const [name, data] of Object.entries(snapshots)) {
        const hash = computeDigest(data);
        manifest.snapshots[name] = {
            sha256: hash,
            record_count: Array.isArray(data) ? data.length : Object.keys(data).length
        };
    }

    manifest.manifest_sha256 = computeDigest(manifest.snapshots);

    return manifest;
}

/**
 * Write snapshot to mirrors
 * @param {string} repoRoot - Repository root
 * @param {string} date - Snapshot date
 * @param {string} name - Snapshot name
 * @param {object} data - Snapshot data
 */
export function writeSnapshot(repoRoot, date, name, data) {
    const snapshotDir = path.join(repoRoot, MIRRORS_SNAPSHOT_BASE, date);

    if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
    }

    const snapshotPath = path.join(snapshotDir, `${name}.json.gz`);
    const json = JSON.stringify(data);
    const compressed = zlib.gzipSync(Buffer.from(json, 'utf8'));

    fs.writeFileSync(snapshotPath, compressed);
    return snapshotPath;
}

/**
 * Write manifest to mirrors
 * @param {string} repoRoot - Repository root
 * @param {string} date - Snapshot date
 * @param {object} manifest - Manifest object
 */
export function writeManifest(repoRoot, date, manifest) {
    const snapshotDir = path.join(repoRoot, MIRRORS_SNAPSHOT_BASE, date);

    if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
    }

    const manifestPath = path.join(snapshotDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Ingest Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ingest all snapshots for a trading date
 * @param {string} repoRoot - Repository root
 * @param {string} tradingDate - Trading date
 * @param {object} policy - Forecast policy
 * @returns {object} Ingested data summary
 */
export async function ingestSnapshots(repoRoot, tradingDate, policy) {
    const asOf = new Date().toISOString();

    // Load universe
    const universe = loadUniverse(repoRoot);
    console.log(`[Ingest] Loaded universe: ${universe.length} tickers`);

    // Load prices
    const prices = loadEodBatches(repoRoot);
    const pricesCount = Object.keys(prices).length;
    console.log(`[Ingest] Loaded prices for ${pricesCount} tickers`);

    // Calculate missing data percentage
    const missingCount = universe.filter(t => !prices[t]).length;
    const missingPricePct = universe.length > 0 ? (missingCount / universe.length) * 100 : 0;

    // Create snapshots
    const snapshots = {
        prices,
        universe
    };

    // Create and write manifest
    const manifest = createManifest(snapshots, asOf);
    writeManifest(repoRoot, tradingDate, manifest);

    // Write compressed snapshots
    writeSnapshot(repoRoot, tradingDate, 'prices', prices);
    writeSnapshot(repoRoot, tradingDate, 'universe', universe);

    return {
        universe,
        prices,
        manifest,
        missing_price_pct: missingPricePct,
        as_of: asOf
    };
}

export default {
    loadUniverse,
    loadEodBatches,
    loadPriceHistory,
    createManifest,
    writeSnapshot,
    writeManifest,
    ingestSnapshots
};
