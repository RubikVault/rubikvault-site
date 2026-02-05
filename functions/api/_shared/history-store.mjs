export async function getStaticBars(symbol, baseUrl) {
    // In Cloudflare Worker, we can fetch from our own origin or use assets binding if configured.
    // Using fetch() to relative path might work if handled by static asset serving, 
    // but usually in Workers for local assets we might need full URL or specific binding.
    // Assuming standard fetch to public path works for this setup.

    try {
        const cleanSymbol = symbol.replace(/[^a-zA-Z0-9.\-]/g, '').toUpperCase();
        const path = `/data/eod/bars/${cleanSymbol}.json`;

        // Construct full URL if baseUrl provided, otherwise relative (works in some envs, fails in others)
        const url = baseUrl ? new URL(path, baseUrl).toString() : path;

        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        if (!Array.isArray(data)) return null;

        return data;
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
