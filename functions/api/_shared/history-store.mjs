export async function getStaticBars(symbol, baseUrl) {
    // In Cloudflare Worker, we can fetch from our own origin or use assets binding if configured.
    // Using fetch() to relative path might work if handled by static asset serving, 
    // but usually in Workers for local assets we might need full URL or specific binding.
    // Assuming standard fetch to public path works for this setup.

    try {
        const cleanSymbol = symbol.replace(/[^a-zA-Z0-9.\-]/g, '').toUpperCase();
        const candidates = [
            `/data/eod/bars/${cleanSymbol}.json`,
            `/public/data/eod/bars/${cleanSymbol}.json`
        ];

        for (const path of candidates) {
            const url = baseUrl ? new URL(path, baseUrl).toString() : path;
            const response = await fetch(url);
            if (!response.ok) continue;
            const data = await response.json();
            if (Array.isArray(data)) return data;
        }
        return null;
    } catch (err) {
        // Silent fail -> fallback to provider
        return null;
    }
}

export function mergeBars(existing, incoming) {
    const map = new Map();
    if (Array.isArray(existing)) existing.forEach(b => map.set(b.date, b));
    if (Array.isArray(incoming)) incoming.forEach(b => map.set(b.date, b));

    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
