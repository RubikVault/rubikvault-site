/**
 * Forecast System v3.0 — Snapshot Ingest
 * 
 * Ingests data from RubikVault SSOT artifacts:
 * - Universe from v7 registry/SSOT (fallback: legacy v3 universe)
 * - Prices from v7 registry latests + market snapshot + v3 latest fallback
 * - Creates manifests in mirrors/forecast/snapshots/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeDigest } from '../lib/digest.js';
import { stripExchangeSuffix } from '../utils/symbol-normalize.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Path Constants
// ─────────────────────────────────────────────────────────────────────────────

const V3_UNIVERSE_PATH = 'public/data/v3/universe/universe.json';
const LEGACY_UNIVERSE_PATH = 'public/data/universe/all.json';
const V7_REGISTRY_PATH = 'public/data/universe/v7/registry/registry.ndjson.gz';
const EOD_BATCH_PATTERN = 'public/data/eod/batches/eod.latest.';
const MARKET_PRICES_SNAPSHOT_PATH = 'public/data/snapshots/market-prices/latest.json';
const V3_EOD_LATEST_PATH = 'public/data/v3/eod/US/latest.ndjson.gz';
const V3_ADJUSTED_SERIES_DIR = 'public/data/v3/series/adjusted';
const MIRRORS_SNAPSHOT_BASE = 'mirrors/forecast/snapshots';
const MIRRORS_UNIVERSE_V7_BASE = 'mirrors/universe-v7';
const DEFAULT_MIN_BARS = 200;

let _registryUniverseCache = null;

function normalizeTicker(value) {
    const ticker = String(value || '').trim().toUpperCase();
    return ticker || null;
}

function normalizeCanonicalId(value) {
    const canonicalId = String(value || '').trim().toUpperCase();
    return canonicalId || null;
}

function compareRegistryRows(a, b) {
    const qualityRank = (row) => {
        const basis = String(row?.quality_basis || '').trim().toLowerCase();
        if (basis === 'backfill_real') return 3;
        if (basis === 'daily_bulk_estimate') return 2;
        if (basis === 'estimate') return 1;
        return 0;
    };

    const qa = qualityRank(a);
    const qb = qualityRank(b);
    if (qa !== qb) return qa - qb;

    const ba = Number(a?.bars_count || 0);
    const bb = Number(b?.bars_count || 0);
    if (ba !== bb) return ba - bb;

    const ha = Boolean(a?.history_pack);
    const hb = Boolean(b?.history_pack);
    if (ha !== hb) return Number(ha) - Number(hb);

    const da = String(a?.last_trade_date || '');
    const db = String(b?.last_trade_date || '');
    if (da !== db) return da.localeCompare(db);

    return String(a?.canonical_id || '').localeCompare(String(b?.canonical_id || ''));
}

function registryEntryFromRow(row) {
    const symbol = normalizeTicker(row?.symbol);
    const canonicalId = normalizeCanonicalId(row?.canonical_id);
    if (!symbol || !canonicalId) return null;

    const historyPack = String(row?.pointers?.history_pack || '').trim() || null;
    const barsCount = Number(row?.bars_count || 0);
    const recentCloses = Array.isArray(row?._tmp_recent_closes)
        ? row._tmp_recent_closes.map(toFiniteNumber).filter((value) => value !== null)
        : [];
    const recentVolumes = Array.isArray(row?._tmp_recent_volumes)
        ? row._tmp_recent_volumes.map(toFiniteNumber).filter((value) => value !== null)
        : [];

    return {
        symbol,
        ticker: symbol,
        canonical_id: canonicalId,
        exchange: normalizeTicker(row?.exchange),
        name: row?.name || null,
        last_trade_date: String(row?.last_trade_date || '').slice(0, 10) || null,
        bars_count: Number.isFinite(barsCount) ? barsCount : 0,
        history_pack: historyPack,
        quality_basis: String(row?._quality_basis || '').trim() || null,
        recent_closes: recentCloses,
        recent_volumes: recentVolumes
    };
}

function loadRegistryUniverse(repoRoot) {
    if (_registryUniverseCache) return _registryUniverseCache;

    const registryPath = path.join(repoRoot, V7_REGISTRY_PATH);
    if (!fs.existsSync(registryPath)) {
        _registryUniverseCache = {
            rows: [],
            bySymbol: new Map(),
            byCanonical: new Map()
        };
        return _registryUniverseCache;
    }

    const rows = parseGzipNdjsonFile(registryPath)
        .map((row) => {
            if (String(row?.type_norm || '').trim().toUpperCase() !== 'STOCK') return null;
            return registryEntryFromRow(row);
        })
        .filter(Boolean);

    const bestBySymbol = new Map();
    for (const row of rows) {
        const prev = bestBySymbol.get(row.symbol);
        if (!prev || compareRegistryRows(row, prev) > 0) {
            bestBySymbol.set(row.symbol, row);
        }
    }

    const byCanonical = new Map();
    const bySymbol = new Map();
    const uniqueRows = [...bestBySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const row of uniqueRows) {
        bySymbol.set(row.symbol, row);
        byCanonical.set(row.canonical_id, row);
    }

    _registryUniverseCache = {
        rows: uniqueRows,
        bySymbol,
        byCanonical
    };
    return _registryUniverseCache;
}

function forecastUniverseFilter(row, minBars = DEFAULT_MIN_BARS) {
    const barsCount = Number(row?.bars_count || 0);
    const hasAnyHistory = Boolean(row?.history_pack) || (Array.isArray(row?.recent_closes) && row.recent_closes.length > 0);
    return Boolean(row?.symbol) && barsCount >= minBars && hasAnyHistory;
}

// ─────────────────────────────────────────────────────────────────────────────
// Universe Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load universe (ticker list) from existing data
 * @param {string} repoRoot - Repository root
 * @returns {string[]|object[]} Array of tickers or entries
 */
export function loadUniverse(repoRoot, options = {}) {
    const minBars = Math.max(1, Number(options?.minBars || DEFAULT_MIN_BARS));
    const returnEntries = options?.entries === true;
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

    const registryUniverse = loadRegistryUniverse(repoRoot);
    const registryRows = registryUniverse.rows.filter((row) => forecastUniverseFilter(row, minBars));
    if (registryRows.length > 0) {
        console.log(`[Ingest] Universe loaded from ${V7_REGISTRY_PATH} (${registryRows.length} forecast-eligible tickers)`);
        return returnEntries ? registryRows : registryRows.map((row) => row.symbol);
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
                return returnEntries
                    ? tickers.map((ticker) => ({
                        symbol: ticker,
                        ticker,
                        canonical_id: ticker,
                        exchange: null,
                        bars_count: 0,
                        history_pack: null
                    }))
                    : tickers;
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

export function loadV7RegistryLatestPrices(repoRoot) {
    const registryUniverse = loadRegistryUniverse(repoRoot);
    const prices = {};
    for (const row of registryUniverse.rows) {
        const close = row.recent_closes[row.recent_closes.length - 1];
        if (!row.symbol || !row.last_trade_date || close === null || close === undefined) continue;
        const volume = row.recent_volumes[row.recent_volumes.length - 1];
        prices[row.symbol] = {
            date: row.last_trade_date,
            open: close,
            high: close,
            low: close,
            close,
            volume: volume ?? 0
        };
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
            const ticker = normalizeTicker(row?.symbol ?? row?.ticker ?? null);
            if (!ticker) continue;

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
 * Resolve requested entries against the v7 registry.
 * @param {string} repoRoot - Repository root
 * @param {Array<string|object>} requested - Symbols or partial entries
 * @returns {object[]} Resolved universe entries
 */
function resolveUniverseEntries(repoRoot, requested = []) {
    const registryUniverse = loadRegistryUniverse(repoRoot);
    const out = [];
    const seen = new Set();

    for (const item of Array.isArray(requested) ? requested : []) {
        const directCanonical = normalizeCanonicalId(item?.canonical_id || item?.canonicalId);
        const directSymbol = normalizeTicker(
            typeof item === 'string'
                ? item
                : (item?.symbol || item?.ticker || item?.code || null)
        );
        const symbolBase = directSymbol ? stripExchangeSuffix(directSymbol) : directSymbol;
        const resolved =
            (directCanonical && registryUniverse.byCanonical.get(directCanonical))
            || (symbolBase && registryUniverse.bySymbol.get(symbolBase))
            || null;

        const merged = {
            symbol: resolved?.symbol || symbolBase || directSymbol,
            ticker: resolved?.symbol || symbolBase || directSymbol,
            canonical_id: resolved?.canonical_id || directCanonical || symbolBase || directSymbol,
            exchange: resolved?.exchange || normalizeTicker(item?.exchange),
            name: resolved?.name || item?.name || null,
            last_trade_date: resolved?.last_trade_date || String(item?.last_trade_date || '').slice(0, 10) || null,
            bars_count: Number.isFinite(Number(resolved?.bars_count)) ? Number(resolved.bars_count) : Number(item?.bars_count || 0),
            history_pack: resolved?.history_pack || String(item?.history_pack || '').trim() || null,
            quality_basis: resolved?.quality_basis || null,
            recent_closes: Array.isArray(resolved?.recent_closes) ? resolved.recent_closes : [],
            recent_volumes: Array.isArray(resolved?.recent_volumes) ? resolved.recent_volumes : []
        };

        const dedupeKey = normalizeCanonicalId(merged.canonical_id) || normalizeTicker(merged.symbol);
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(merged);
    }

    return out;
}

function historyKeyFor(entry, keyBy = 'symbol') {
    if (String(keyBy || '').trim().toLowerCase() === 'canonical') {
        return normalizeCanonicalId(entry?.canonical_id) || normalizeTicker(entry?.symbol);
    }
    return normalizeTicker(entry?.symbol) || normalizeCanonicalId(entry?.canonical_id);
}

function parseHistoryBars(rows, asOfDate) {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row) => {
            const date = String(row?.date || row?.trading_date || '').slice(0, 10);
            const close = toFiniteNumber(row?.adjusted_close ?? row?.adj_close ?? row?.close);
            if (!date || close === null) return null;
            return {
                date,
                close,
                open: toFiniteNumber(row?.open) ?? close,
                high: toFiniteNumber(row?.high) ?? close,
                low: toFiniteNumber(row?.low) ?? close,
                volume: toFiniteNumber(row?.volume) ?? 0
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));

    const recent = normalized
        .filter((row) => row.date <= asOfDate)
        .slice(Math.max(0, normalized.length - 500));

    if (!recent.length) return null;
    return {
        dates: recent.map((row) => row.date),
        closes: recent.map((row) => row.close),
        volumes: recent.map((row) => row.volume ?? 0),
        opens: recent.map((row) => row.open ?? row.close),
        highs: recent.map((row) => row.high ?? row.close),
        lows: recent.map((row) => row.low ?? row.close)
    };
}

function readHistoryPack(repoRoot, historyPackRel) {
    const absPath = path.join(repoRoot, MIRRORS_UNIVERSE_V7_BASE, historyPackRel);
    if (!fs.existsSync(absPath)) return new Map();

    const rows = parseGzipNdjsonFile(absPath);
    const map = new Map();
    for (const row of rows) {
        const canonicalId = normalizeCanonicalId(row?.canonical_id);
        if (!canonicalId || !Array.isArray(row?.bars) || !row.bars.length) continue;
        map.set(canonicalId, row.bars);
    }
    return map;
}

/**
 * Load full price history for tickers from v7 history packs with v3 fallback.
 * @param {string} repoRoot - Repository root
 * @param {Array<string|object>} tickers - Tickers or universe entries to load
 * @param {string} asOfDate - As-of date
 * @param {{ keyBy?: 'symbol'|'canonical' }} [options] - Output key mode
 * @returns {object} Map of ticker -> {dates, closes, volumes}
 */
export async function loadPriceHistory(repoRoot, tickers, asOfDate, options = {}) {
    const history = {};
    const resolvedEntries = resolveUniverseEntries(repoRoot, tickers);
    const latestPrices = {
        ...loadV7RegistryLatestPrices(repoRoot),
        ...loadMarketPricesSnapshot(repoRoot),
        ...loadV3LatestPrices(repoRoot)
    };
    const seriesDir = path.join(repoRoot, V3_ADJUSTED_SERIES_DIR);
    const keyBy = String(options?.keyBy || 'symbol').trim().toLowerCase();
    const byPack = new Map();

    for (const entry of resolvedEntries) {
        if (!entry?.history_pack) continue;
        if (!byPack.has(entry.history_pack)) byPack.set(entry.history_pack, []);
        byPack.get(entry.history_pack).push(entry);
    }

    for (const [historyPackRel, entries] of byPack.entries()) {
        const packRows = readHistoryPack(repoRoot, historyPackRel);
        for (const entry of entries) {
            const packBars = packRows.get(normalizeCanonicalId(entry.canonical_id));
            const parsed = parseHistoryBars(packBars, asOfDate);
            if (!parsed) continue;
            history[historyKeyFor(entry, keyBy)] = parsed;
        }
    }

    for (const entry of resolvedEntries) {
        const outKey = historyKeyFor(entry, keyBy);
        if (history[outKey]) continue;

        // Exchange-aware series resolution: try entry's exchange first, then US fallback
        const exchange = entry.exchange || 'US';
        const symbolBase = entry.symbol && entry.symbol.includes('.') ? entry.symbol.split('.')[0] : entry.symbol;
        const seriesToTry = [
            path.join(seriesDir, `${exchange}__${entry.symbol}.ndjson.gz`),
            ...(exchange !== 'US' ? [path.join(seriesDir, `${exchange}__${symbolBase}.ndjson.gz`)] : []),
            ...(exchange !== 'US' ? [path.join(seriesDir, `US__${entry.symbol}.ndjson.gz`)] : []),
            ...(symbolBase !== entry.symbol ? [path.join(seriesDir, `US__${symbolBase}.ndjson.gz`)] : [])
        ];
        let seriesParsed = null;
        for (const sp of seriesToTry) {
            const rows = parseGzipNdjsonFile(sp);
            seriesParsed = parseHistoryBars(rows, asOfDate);
            if (seriesParsed) break;
        }
        if (seriesParsed) {
            history[outKey] = seriesParsed;
            continue;
        }

        // Latest price fallback: try both full symbol and base symbol
        const tickerData = latestPrices[entry.symbol] || latestPrices[symbolBase];
        if (tickerData?.date && tickerData.close !== undefined) {
            history[outKey] = {
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
    const universeEntries = loadUniverse(repoRoot, { entries: true, minBars: policy?.min_history_bars || DEFAULT_MIN_BARS });
    const universe = universeEntries.map((row) => row.symbol);
    console.log(`[Ingest] Loaded universe: ${universe.length} tickers`);

    // Load prices from v7 registry latests with published snapshots and v3 fallback.
    const prices = {
        ...loadV7RegistryLatestPrices(repoRoot),
        ...loadMarketPricesSnapshot(repoRoot),
        ...loadV3LatestPrices(repoRoot)
    };
    const pricesCount = Object.keys(prices).length;
    console.log(`[Ingest] Loaded prices for ${pricesCount} tickers from v7 registry / snapshots / v3 fallback`);

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
    loadV7RegistryLatestPrices,
    loadMarketPricesSnapshot,
    loadPriceHistory,
    createManifest,
    writeSnapshot,
    writeManifest,
    ingestSnapshots
};
