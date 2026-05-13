import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const REPO_ROOT = (() => {
    const envRoot = typeof process !== 'undefined' ? String(process.env?.RV_REPO_ROOT || '').trim() : '';
    if (envRoot) return envRoot;
    try {
        const currentUrl = String(import.meta.url || '');
        if (currentUrl.startsWith('file:')) {
            return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
        }
    } catch {
        // fall through
    }
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
        return process.cwd();
    }
    return '.';
})();

const historyPackManifestCache = {
    promise: null,
    value: null,
};
const historyPackLookupCache = {
    promise: null,
    value: null,
};
const historyPackRowsCache = new Map();
const HISTORY_PACK_CACHE_LIMIT = 32;
const KNOWN_EODHD_SUFFIXES = new Set([
    'AS', 'AT', 'AX', 'BE', 'BK', 'BO', 'BR', 'CO', 'DE', 'DU', 'F', 'HA', 'HE', 'HK', 'HM',
    'IR', 'IS', 'JK', 'JO', 'KL', 'KQ', 'KS', 'L', 'LS', 'MC', 'MI', 'MX', 'OL', 'PA', 'PR',
    'SA', 'SG', 'SN', 'SR', 'SS', 'ST', 'SW', 'SZ', 'T', 'TA', 'TO', 'TW', 'V', 'VI', 'WA',
]);

function withoutKnownExchangeSuffix(value) {
    const raw = String(value || '').trim().toUpperCase();
    const match = raw.match(/^(.+)\.([A-Z0-9]{1,4})$/);
    if (!match || !KNOWN_EODHD_SUFFIXES.has(match[2])) return null;
    return match[1];
}

function buildSymbolCandidates(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return [];
    const strippedExchangeSuffix = withoutKnownExchangeSuffix(raw);
    const candidates = [
        raw,
        raw.includes(':') ? raw.split(':').pop() : raw,
        strippedExchangeSuffix,
        raw.replace(/[^A-Z0-9.\-]/g, ''),
        raw.replace(/^[A-Z0-9]+:/, '').replace(/[^A-Z0-9.\-]/g, ''),
        strippedExchangeSuffix ? strippedExchangeSuffix.replace(/[^A-Z0-9.\-]/g, '') : ''
    ].filter(Boolean);
    return [...new Set(candidates)];
}

function latestMergedDate(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    return typeof latest?.date === 'string' ? latest.date : null;
}

function hasRenderableHistory(rows, minBars = 60) {
    return Array.isArray(rows) && rows.length >= minBars;
}

async function responseTextMaybeGzip(response, relPath) {
    const contentEncoding = String(response.headers.get('content-encoding') || '').toLowerCase();
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const maybeGzip =
        relPath.endsWith('.gz') ||
        contentEncoding.includes('gzip') ||
        contentType.includes('application/gzip') ||
        contentType.includes('application/x-gzip');

    if (maybeGzip && typeof response.arrayBuffer === 'function') {
        const responseClone = response.clone();
        try {
            return gunzipSync(Buffer.from(await responseClone.arrayBuffer())).toString('utf8');
        } catch {
            // Fall through; some runtimes auto-decode gzip before userland reads.
        }
    }

    if (maybeGzip && typeof DecompressionStream !== 'undefined' && response.body) {
        const responseClone = response.clone();
        try {
            const stream = responseClone.body.pipeThrough(new DecompressionStream('gzip'));
            return await new Response(stream).text();
        } catch {
            // Fall through to arrayBuffer/text fallback below.
        }
    }

    try {
        return await response.text();
    } catch {
        return null;
    }
}

function isLocalOrigin(baseUrl) {
    try {
        const { hostname } = new URL(baseUrl);
        return hostname === '127.0.0.1' || hostname === 'localhost';
    } catch {
        return false;
    }
}

export function resolveLocalAssetPaths(relPath) {
    const relative = String(relPath || '').startsWith('/') ? String(relPath).slice(1) : String(relPath || '');
    if (!relative.startsWith('data/')) return [];
    const candidates = [path.join(REPO_ROOT, 'public', relative)];
    const historyPackPrefix = 'data/eod/history/packs/';
    if (relative.startsWith(historyPackPrefix)) {
        const packRelative = relative.slice(historyPackPrefix.length);
        if (packRelative) {
            candidates.push(path.join(REPO_ROOT, 'mirrors', 'universe-v7', 'history', packRelative));
            candidates.push(path.join(REPO_ROOT, 'mirrors', 'universe-v7', 'history', 'history', packRelative));
        }
    }
    return candidates;
}

async function readLocalTextMaybe(relPath) {
    const localPaths = resolveLocalAssetPaths(relPath);
    for (const filePath of localPaths) {
        try {
            const buffer = await fs.readFile(filePath);
            return filePath.endsWith('.gz')
                ? gunzipSync(buffer).toString('utf8')
                : buffer.toString('utf8');
        } catch {
            continue;
        }
    }
    return null;
}

async function readLocalJsonMaybe(relPath) {
    const text = await readLocalTextMaybe(relPath);
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export async function getStaticBars(symbol, baseUrl, assetFetcher = null, options = {}) {
    let mergedBars = [];
    try {
        const maxBars = Number.isFinite(Number(options?.maxBars)) && Number(options.maxBars) > 0
            ? Math.floor(Number(options.maxBars))
            : null;
        const optionCandidates = [
            options?.canonicalId,
            options?.canonical_id,
            options?.displayTicker,
            options?.ticker,
        ];
        const candidates = [
            ...buildSymbolCandidates(symbol),
            ...optionCandidates.flatMap((candidate) => buildSymbolCandidates(candidate)),
        ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);
        const cleanSymbol = candidates[0]?.replace(/[^A-Z0-9.\-]/g, '') || '';
        const localMode = isLocalOrigin(baseUrl);

        async function fetchGzipNdjson(relPath) {
            if (localMode) {
                const localText = await readLocalTextMaybe(relPath);
                if (localText) {
                    return localText
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                            try {
                                return JSON.parse(line);
                            } catch {
                                return null;
                            }
                        })
                        .filter(Boolean);
                }
            }
            let response = null;
            try {
                const url = baseUrl ? new URL(relPath, baseUrl).toString() : relPath;
                response = assetFetcher && relPath.startsWith('/data/')
                    ? await assetFetcher.fetch(url)
                    : await fetch(url);
            } catch {
                return null;
            }
            if (!response?.ok || !response.body) return null;
            const text = await responseTextMaybeGzip(response, relPath);

            if (!text) return null;
            return text
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);
        }

        function normalizeRows(rows) {
            if (!Array.isArray(rows)) return [];
            return rows
                .map((row) => {
                    if (Array.isArray(row)) {
                        const date = String(row[0] || '').slice(0, 10);
                        const close = Number(row.length >= 5 ? (row[4] ?? row[5]) : row[1]);
                        if (!date || !Number.isFinite(close)) return null;
                        const open = Number(row.length >= 5 ? row[1] : close);
                        const high = Number(row.length >= 5 ? row[2] : close);
                        const low = Number(row.length >= 5 ? row[3] : close);
                        const adjClose = Number(row.length >= 5 ? row[5] : close);
                        const volume = Number(row.length >= 7 ? row[6] : 0);
                        return {
                            date,
                            open: Number.isFinite(open) ? open : close,
                            high: Number.isFinite(high) ? high : close,
                            low: Number.isFinite(low) ? low : close,
                            close,
                            adjClose: Number.isFinite(adjClose) ? adjClose : close,
                            volume: Number.isFinite(volume) ? volume : 0
                        };
                    }
                    const date = String(row?.date || row?.trading_date || '').slice(0, 10);
                    const close = Number(row?.close ?? row?.adjusted_close ?? row?.adj_close);
                    if (!date || !Number.isFinite(close)) return null;
                    const open = Number(row?.open);
                    const high = Number(row?.high);
                    const low = Number(row?.low);
                    const volume = Number(row?.volume);
                    return {
                        date,
                        open: Number.isFinite(open) ? open : close,
                        high: Number.isFinite(high) ? high : close,
                        low: Number.isFinite(low) ? low : close,
                        close,
                        adjClose: close,
                        volume: Number.isFinite(volume) ? volume : 0
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        function mergeInBars(rows) {
            const normalized = normalizeRows(rows);
            if (!normalized.length) return;
            mergedBars = mergeBars(mergedBars, normalized);
            if (maxBars && mergedBars.length > maxBars) {
                mergedBars = mergedBars.slice(-maxBars);
            }
        }

        async function fetchJson(relPath) {
            if (localMode) {
                const localPayload = await readLocalJsonMaybe(relPath);
                if (localPayload) return localPayload;
            }
            try {
                const url = baseUrl ? new URL(relPath, baseUrl).toString() : relPath;
                const response = assetFetcher && relPath.startsWith('/data/')
                    ? await assetFetcher.fetch(url)
                    : await fetch(url);
                if (!response.ok) return null;
                if (relPath.endsWith('.gz')) {
                    const text = await responseTextMaybeGzip(response, relPath);
                    return text ? JSON.parse(text) : null;
                }
                return await response.json();
            } catch {
                return null;
            }
        }

        async function loadHistoryPackManifest() {
            if (historyPackManifestCache.value) return historyPackManifestCache.value;
            if (!historyPackManifestCache.promise) {
                historyPackManifestCache.promise = fetchJson('/data/eod/history/pack-manifest.us-eu.json')
                    .then((doc) => {
                        historyPackManifestCache.value = doc || null;
                        return historyPackManifestCache.value;
                    })
                    .catch(() => null);
            }
            return historyPackManifestCache.promise;
        }

        async function loadHistoryPackLookup() {
            if (historyPackLookupCache.value) return historyPackLookupCache.value;
            if (!historyPackLookupCache.promise) {
                historyPackLookupCache.promise = fetchJson('/data/eod/history/pack-manifest.us-eu.lookup.json')
                    .then((doc) => {
                        historyPackLookupCache.value = doc || null;
                        return historyPackLookupCache.value;
                    })
                    .catch(() => null);
            }
            return historyPackLookupCache.promise;
        }

        function normalizePackEntry(entry) {
            if (!entry) return null;
            if (Array.isArray(entry)) {
                const canonicalId = String(entry[0] || '').trim().toUpperCase();
                const pack = String(entry[1] || '').trim();
                return canonicalId && pack ? { canonical_id: canonicalId, pack } : null;
            }
            const canonicalId = String(entry.canonical_id || '').trim().toUpperCase();
            const pack = String(entry.pack || '').trim();
            return canonicalId && pack ? { canonical_id: canonicalId, pack } : null;
        }

        async function fetchHistoryPackBars(packPath, canonicalId) {
            if (!packPath || !canonicalId) return [];
            const cacheKey = `${packPath}#${String(canonicalId).trim().toUpperCase()}`;
            if (historyPackRowsCache.has(cacheKey)) {
                return historyPackRowsCache.get(cacheKey) || [];
            }
            const rows = await fetchGzipNdjson(`/data/eod/history/packs/${packPath}`);
            if (!Array.isArray(rows) || !rows.length) return [];
            const wanted = String(canonicalId).trim().toUpperCase();
            const hit = rows.find((row) => String(row?.canonical_id || '').trim().toUpperCase() === wanted);
            const bars = normalizeRows(hit?.bars || []);
            const compactBars = maxBars && bars.length > maxBars ? bars.slice(-maxBars) : bars;
            if (historyPackRowsCache.size >= HISTORY_PACK_CACHE_LIMIT) {
                const oldestKey = historyPackRowsCache.keys().next().value;
                if (oldestKey) historyPackRowsCache.delete(oldestKey);
            }
            historyPackRowsCache.set(cacheKey, compactBars);
            return compactBars;
        }

        const seriesCandidates = [
            `/data/v3/series/adjusted/US__${cleanSymbol}.ndjson.gz`
        ];
        for (const relPath of seriesCandidates) {
            const rows = await fetchGzipNdjson(relPath);
            mergeInBars(rows);
        }

        if (hasRenderableHistory(mergedBars)) {
            return mergedBars;
        }

        const packLookup = await loadHistoryPackLookup();
        const lookupEntries = candidates
            .map((candidate) => normalizePackEntry(
                packLookup?.by_symbol?.[candidate]
                || packLookup?.by_canonical_id?.[candidate]
                || null
            ))
            .filter(Boolean);

        const packManifest = await loadHistoryPackManifest();
        const manifestEntries = candidates
            .map((candidate) => normalizePackEntry(
                packManifest?.by_symbol?.[candidate]
                || packManifest?.by_canonical_id?.[candidate]
                || null
            ))
            .filter(Boolean);

        const packEntries = [...lookupEntries, ...manifestEntries]
            .filter(Boolean)
            .filter((entry, index, list) => list.findIndex((candidate) => candidate.pack === entry.pack && candidate.canonical_id === entry.canonical_id) === index);
        for (const entry of packEntries) {
            const bars = await fetchHistoryPackBars(entry.pack, entry.canonical_id);
            if (bars.length) mergedBars = mergeBars(mergedBars, bars);
        }

        if (hasRenderableHistory(mergedBars)) {
            return mergedBars;
        }

        // Legacy fallback only: alphabet shards can be large enough to hit Worker CPU limits.
        const shard = cleanSymbol[0] || '_';
        const shardCandidates = [
            `/data/eod/history/shards/${shard}.json.gz`,
            `/data/eod/history/shards/${shard}.json`
        ];

        for (const shardPath of shardCandidates) {
            try {
                if (localMode) {
                    const shardData = await readLocalJsonMaybe(shardPath);
                    if (shardData && typeof shardData === 'object') {
                        for (const candidate of candidates) {
                            const tickerBarsRaw = shardData[candidate] || shardData[candidate.replace(/[^A-Z0-9.\-]/g, '')];
                            if (Array.isArray(tickerBarsRaw)) {
                                mergeInBars(tickerBarsRaw);
                            }
                        }
                        continue;
                    }
                }
                const shardData = await fetchJson(shardPath);
                if (shardData && typeof shardData === 'object') {
                    for (const candidate of candidates) {
                        const tickerBarsRaw = shardData[candidate] || shardData[candidate.replace(/[^A-Z0-9.\-]/g, '')];
                        if (Array.isArray(tickerBarsRaw)) {
                            mergeInBars(tickerBarsRaw);
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        const latestCandidates = [
            '/data/v3/eod/US/latest.ndjson.gz'
        ];
        for (const relPath of latestCandidates) {
            const rows = await fetchGzipNdjson(relPath);
            if (!Array.isArray(rows)) continue;
            for (const candidate of candidates) {
                const hit = rows.find((row) => String(row?.ticker || row?.symbol || '').toUpperCase() === candidate);
                mergeInBars(hit ? [hit] : []);
            }
        }

        return mergedBars.length ? (maxBars && mergedBars.length > maxBars ? mergedBars.slice(-maxBars) : mergedBars) : null;
    } catch (err) {
        return mergedBars.length ? (Number.isFinite(Number(options?.maxBars)) && Number(options.maxBars) > 0 ? mergedBars.slice(-Math.floor(Number(options.maxBars))) : mergedBars) : null;
    }
}

export function mergeBars(existing, incoming) {
    const map = new Map();
    if (Array.isArray(existing)) existing.forEach(b => map.set(b.date, b));
    if (Array.isArray(incoming)) incoming.forEach(b => map.set(b.date, b));

    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
