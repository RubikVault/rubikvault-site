/**
 * Forecast System v3.0 — Snapshot Ingest
 * 
 * Ingests data from RubikVault SSOT artifacts:
 * - Universe from /data/v3/universe/universe.json (fallback: /data/universe/all.json)
 * - Prices from /data/v3/eod/US/latest.ndjson.gz
 * - Creates manifests in mirrors/forecast/snapshots/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeDigest } from '../lib/digest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Path Constants
// ─────────────────────────────────────────────────────────────────────────────

const V3_UNIVERSE_PATH = 'public/data/v3/universe/universe.json';
const LEGACY_UNIVERSE_PATH = 'public/data/universe/all.json';
const EOD_BATCH_PATTERN = 'public/data/eod/batches/eod.latest.';
const MARKET_PRICES_SNAPSHOT_PATH = 'public/data/snapshots/market-prices/latest.json';
const V3_EOD_LATEST_PATH = 'public/data/v3/eod/US/latest.ndjson.gz';
const V3_ADJUSTED_SERIES_DIR = 'public/data/v3/series/adjusted';
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
    function normalizeTicker(value) {
        const ticker = String(value || '').trim().toUpperCase();
        return ticker || null;
    }

    function tickerFromRow(row) {
        if (typeof row === 'string') return normalizeTicker(row);
        if (!row || typeof row !== 'object') return null;
        const direct = row.ticker ?? row.symbol ?? row.code ?? null;
        if (direct) return normalizeTicker(direct);
        const canonical = String(row.canonical_id ?? row.canonicalId ?? '').trim();
        if (!canonical) return null;
        const parts = canonical.split(':');
        return normalizeTicker(parts[parts.length - 1]);
    }

    function dedupeTickers(rows) {
        const out = [];
        const seen = new Set();
        for (const row of rows) {
            const ticker = tickerFromRow(row);
            if (!ticker || seen.has(ticker)) continue;
            seen.add(ticker);
            out.push(ticker);
        }
        return out;
    }

    function extractTickers(payload) {
        if (Array.isArray(payload)) {
            return dedupeTickers(payload);
        }
        if (!payload || typeof payload !== 'object') {
            return [];
        }
        if (Array.isArray(payload.symbols)) {
            return dedupeTickers(payload.symbols);
        }
        if (Array.isArray(payload.tickers)) {
            return dedupeTickers(payload.tickers);
        }
        if (Array.isArray(payload.data)) {
            return dedupeTickers(payload.data);
        }
        return [];
    }

    const candidates = [V3_UNIVERSE_PATH, LEGACY_UNIVERSE_PATH];
    for (const relPath of candidates) {
        const absPath = path.join(repoRoot, relPath);
        if (!fs.existsSync(absPath)) continue;
        try {
            const content = fs.readFileSync(absPath, 'utf8');
            const parsed = JSON.parse(content);
            const tickers = extractTickers(parsed);
            if (tickers.length > 0) {
                console.log(`[Ingest] Universe loaded from ${relPath} (${tickers.length} tickers)`);
                return tickers;
            }
            console.warn(`[Ingest] Universe file has no tickers: ${relPath}`);
        } catch (err) {
            console.warn(`[Ingest] Failed to parse universe file ${relPath}: ${err.message}`);
        }
    }

    console.warn('[Ingest] No valid universe artifact found');
    return [];
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

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function parseGzipNdjsonFile(absPath) {
    if (!fs.existsSync(absPath)) return [];
    try {
        const gz = fs.readFileSync(absPath);
        const text = zlib.gunzipSync(gz).toString('utf8');
        return text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch (err) {
        console.warn(`[Ingest] Error reading gzip NDJSON ${absPath}: ${err.message}`);
        return [];
    }
}

export function loadV3LatestPrices(repoRoot) {
    const latestPath = path.join(repoRoot, V3_EOD_LATEST_PATH);
    const rows = parseGzipNdjsonFile(latestPath);
    const prices = {};
    for (const row of rows) {
        const ticker = String(row?.ticker || row?.symbol || '').trim().toUpperCase();
        const date = String(row?.trading_date || row?.date || '').slice(0, 10);
        const close = toFiniteNumber(row?.close ?? row?.adj_close ?? row?.adjusted_close);
        if (!ticker || !date || close === null) continue;
        const open = toFiniteNumber(row?.open) ?? close;
        const high = toFiniteNumber(row?.high) ?? close;
        const low = toFiniteNumber(row?.low) ?? close;
        const volume = toFiniteNumber(row?.volume) ?? 0;
        prices[ticker] = { date, open, high, low, close, volume };
    }
    return prices;
}

/**
 * Load published market-prices snapshot as fallback source.
 * @param {string} repoRoot - Repository root
 * @returns {object} Map of ticker -> latest bar-like object
 */
export function loadMarketPricesSnapshot(repoRoot) {
    const snapshotPath = path.join(repoRoot, MARKET_PRICES_SNAPSHOT_PATH);
    if (!fs.existsSync(snapshotPath)) return {};

    try {
        const raw = fs.readFileSync(snapshotPath, 'utf8');
        const doc = JSON.parse(raw);
        const asOf = doc?.asof ?? doc?.metadata?.as_of ?? doc?.meta?.asOf ?? doc?.meta?.data_date ?? null;
        const inferredDate = typeof asOf === 'string' && asOf.length >= 10 ? asOf.slice(0, 10) : null;

        const rows = Array.isArray(doc?.data)
            ? doc.data
            : Array.isArray(doc?.rows)
                ? doc.rows
                : [];

        const prices = {};
        for (const row of rows) {
            const ticker = row?.symbol ?? row?.ticker ?? null;
            if (!ticker || typeof ticker !== 'string') continue;

            const close = toFiniteNumber(row?.close ?? row?.price ?? row?.last ?? row?.adj_close);
            if (close === null) continue;

            const open = toFiniteNumber(row?.open) ?? close;
            const high = toFiniteNumber(row?.high) ?? close;
            const low = toFiniteNumber(row?.low) ?? close;
            const volume = toFiniteNumber(row?.volume) ?? 0;
            const rowDate = typeof row?.date === 'string' && row.date.length >= 10
                ? row.date.slice(0, 10)
                : inferredDate;

            prices[ticker] = {
                date: rowDate,
                open,
                high,
                low,
                close,
                volume
            };
        }

        return prices;
    } catch (err) {
        console.warn(`[Ingest] Error reading market-prices snapshot ${snapshotPath}: ${err.message}`);
        return {};
    }
}

/**
 * Load full price history for tickers from v3 adjusted series.
 * @param {string} repoRoot - Repository root
 * @param {string[]} tickers - Tickers to load
 * @param {string} asOfDate - As-of date
 * @returns {object} Map of ticker -> {dates, closes, volumes}
 */
export async function loadPriceHistory(repoRoot, tickers, asOfDate) {
    const history = {};
    const latestPrices = loadV3LatestPrices(repoRoot);
    const seriesDir = path.join(repoRoot, V3_ADJUSTED_SERIES_DIR);

    for (const ticker of tickers) {
        const seriesPath = path.join(seriesDir, `US__${ticker}.ndjson.gz`);
        const rows = parseGzipNdjsonFile(seriesPath);
        if (!rows.length) continue;

        const normalized = rows
            .map((row) => {
                const date = String(row?.trading_date || row?.date || '').slice(0, 10);
                const close = toFiniteNumber(row?.adjusted_close ?? row?.adj_close ?? row?.close);
                if (!date || close === null) return null;
                return { date, close };
            })
            .filter(Boolean)
            .sort((a, b) => a.date.localeCompare(b.date));

        const recent = normalized
            .filter((row) => row.date <= asOfDate)
            .slice(Math.max(0, normalized.length - 500));

        if (!recent.length) {
            continue;
        }

        history[ticker] = {
            dates: recent.map(row => row.date),
            closes: recent.map(row => row.close),
            volumes: recent.map(() => 0),
            opens: recent.map(row => row.close),
            highs: recent.map(row => row.close),
            lows: recent.map(row => row.close)
        };
    }

    // Supplement with latest v3 EOD snapshot for any missing tickers
    for (const ticker of tickers) {
        if (history[ticker]) continue;

        const tickerData = latestPrices[ticker];
        if (!tickerData) continue;

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
    }

    console.log(`[Ingest] Loaded price history for ${Object.keys(history).length} tickers`);
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

    // Load prices from canonical v3 EOD latest snapshot
    const prices = loadV3LatestPrices(repoRoot);
    const pricesCount = Object.keys(prices).length;
    console.log(`[Ingest] Loaded prices for ${pricesCount} tickers from ${V3_EOD_LATEST_PATH}`);

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
    loadV3LatestPrices,
    loadMarketPricesSnapshot,
    loadPriceHistory,
    createManifest,
    writeSnapshot,
    writeManifest,
    ingestSnapshots
};
