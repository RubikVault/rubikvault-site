export async function getStaticBars(symbol, baseUrl) {
    try {
        const cleanSymbol = symbol.replace(/[^a-zA-Z0-9.\-]/g, '').toUpperCase();

        async function fetchGzipNdjson(relPath) {
            if (typeof DecompressionStream === 'undefined') return null;
            const url = baseUrl ? new URL(relPath, baseUrl).toString() : relPath;
            const response = await fetch(url);
            if (!response.ok || !response.body) return null;
            const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
            const text = await new Response(stream).text();
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

        const seriesCandidates = [
            `/data/v3/series/adjusted/US__${cleanSymbol}.ndjson.gz`,
            `/public/data/v3/series/adjusted/US__${cleanSymbol}.ndjson.gz`
        ];
        for (const relPath of seriesCandidates) {
            const rows = await fetchGzipNdjson(relPath);
            const bars = normalizeRows(rows);
            if (bars.length) return bars;
        }

        const latestCandidates = [
            '/data/v3/eod/US/latest.ndjson.gz',
            '/public/data/v3/eod/US/latest.ndjson.gz'
        ];
        for (const relPath of latestCandidates) {
            const rows = await fetchGzipNdjson(relPath);
            if (!Array.isArray(rows)) continue;
            const hit = rows.find((row) => String(row?.ticker || row?.symbol || '').toUpperCase() === cleanSymbol);
            const bars = normalizeRows(hit ? [hit] : []);
            if (bars.length) return bars;
        }

        return null;
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
