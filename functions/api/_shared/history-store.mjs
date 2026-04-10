const historyPackManifestCache = {
    promise: null,
    value: null,
};
const historyPackLookupCache = {
    promise: null,
    value: null,
};
const historyPackRowsCache = new Map();

function buildSymbolCandidates(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return [];
    const candidates = [
        raw,
        raw.includes(':') ? raw.split(':').pop() : raw,
        raw.replace(/[^A-Z0-9.\-]/g, ''),
        raw.replace(/^[A-Z0-9]+:/, '').replace(/[^A-Z0-9.\-]/g, '')
    ].filter(Boolean);
    return [...new Set(candidates)];
}

export async function getStaticBars(symbol, baseUrl, assetFetcher = null) {
    try {
        const candidates = buildSymbolCandidates(symbol);
        const cleanSymbol = candidates[0]?.replace(/[^A-Z0-9.\-]/g, '') || '';
        let mergedBars = [];

        async function fetchGzipNdjson(relPath) {
            const url = baseUrl ? new URL(relPath, baseUrl).toString() : relPath;
            const response = assetFetcher && relPath.startsWith('/data/')
                ? await assetFetcher.fetch(url)
                : await fetch(url);
            if (!response.ok || !response.body) return null;
            const contentEncoding = String(response.headers.get('content-encoding') || '').toLowerCase();
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            const maybeGzip =
                relPath.endsWith('.gz') ||
                contentEncoding.includes('gzip') ||
                contentType.includes('application/gzip') ||
                contentType.includes('application/x-gzip');
            let text = null;

            if (maybeGzip && typeof DecompressionStream !== 'undefined') {
                const responseClone = response.clone();
                try {
                    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
                    text = await new Response(stream).text();
                } catch {
                    try {
                        text = await responseClone.text();
                    } catch {
                        text = null;
                    }
                }
            }

            if (text == null) {
                try {
                    text = await response.text();
                } catch {
                    return null;
                }
            }

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
        }

        async function fetchJson(relPath) {
            try {
                const url = baseUrl ? new URL(relPath, baseUrl).toString() : relPath;
                const response = assetFetcher && relPath.startsWith('/data/')
                    ? await assetFetcher.fetch(url)
                    : await fetch(url);
                if (!response.ok) return null;
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
            let indexed = historyPackRowsCache.get(packPath);
            if (!indexed) {
                const rows = await fetchGzipNdjson(`/data/eod/history/packs/${packPath}`);
                if (!Array.isArray(rows) || !rows.length) return [];
                indexed = new Map();
                for (const row of rows) {
                    const rowCanonicalId = String(row?.canonical_id || '').trim().toUpperCase();
                    if (!rowCanonicalId || indexed.has(rowCanonicalId)) continue;
                    indexed.set(rowCanonicalId, normalizeRows(row?.bars || []));
                }
                historyPackRowsCache.set(packPath, indexed);
            }
            return indexed.get(String(canonicalId).trim().toUpperCase()) || [];
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

        const seriesCandidates = [
            `/data/v3/series/adjusted/US__${cleanSymbol}.ndjson.gz`
        ];
        for (const relPath of seriesCandidates) {
            const rows = await fetchGzipNdjson(relPath);
            mergeInBars(rows);
        }

        // New: Try Sharded History (100% universe fallback)
        const shard = cleanSymbol[0] || '_';
        const shardCandidates = [
            `/data/eod/history/shards/${shard}.json`
        ];

        for (const shardPath of shardCandidates) {
            try {
                const url = baseUrl ? new URL(shardPath, baseUrl).toString() : shardPath;
                const res = assetFetcher && shardPath.startsWith('/data/')
                    ? await assetFetcher.fetch(url)
                    : await fetch(url);
                if (res.ok) {
                    const shardData = await res.json();
                    for (const candidate of candidates) {
                        const tickerBarsRaw = shardData[candidate] || shardData[candidate.replace(/[^A-Z0-9.\-]/g, '')];
                        if (Array.isArray(tickerBarsRaw)) {
                            mergeInBars(tickerBarsRaw.map(b => ({
                                date: b[0],
                                open: b[1],
                                high: b[2],
                                low: b[3],
                                close: b[4],
                                adjClose: b[5],
                                volume: b[6]
                            })));
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        const packEntries = [...lookupEntries, ...manifestEntries]
            .filter(Boolean)
            .filter((entry, index, list) => list.findIndex((candidate) => candidate.pack === entry.pack && candidate.canonical_id === entry.canonical_id) === index);
        for (const entry of packEntries) {
            const bars = await fetchHistoryPackBars(entry.pack, entry.canonical_id);
            if (bars.length) mergedBars = mergeBars(mergedBars, bars);
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

        return mergedBars.length ? mergedBars : null;
    } catch (err) {
        return null;
    }
}

export function mergeBars(existing, incoming) {
    const map = new Map();
    if (Array.isArray(existing)) existing.forEach(b => map.set(b.date, b));
    if (Array.isArray(incoming)) incoming.forEach(b => map.set(b.date, b));

    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
