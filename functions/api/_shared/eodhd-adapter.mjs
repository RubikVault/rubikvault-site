function toIsoDate(value) {
    if (!value) return null;
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export async function fetchEodhdBarsRaw(symbol, env, options = {}) {
    const apiKey = env?.EODHD_API_KEY || env?.EODHD_API_TOKEN;
    if (!apiKey) {
        return {
            ok: false,
            provider: 'eodhd',
            error: { code: 'MISSING_API_KEY', message: 'Missing EODHD_API_KEY or EODHD_API_TOKEN' }
        };
    }

    // EODHD standard endpoint: https://eodhd.com/api/eod/{SYMBOL}.US
    // Note: We default to US exchange if not specified, but usually symbol handling 
    // needs to be robust. For now, assuming standard ticker format or appending .US if needed?
    // Runbook doesn't specify suffix logic, but defaults often imply US. 
    // Existing providers (Twelvedata/Tiingo) take the ticker as is. 
    // Let's assume input symbol is correct but EODHD often requires exchange code (e.g. AAPL.US).
    // Use heuristic: if no dot, append .US

    let querySymbol = String(symbol || '').trim().toUpperCase();
    const classShare = querySymbol.match(/^([A-Z0-9]+)\.([A-Z])$/);
    if (classShare) {
        querySymbol = `${classShare[1]}-${classShare[2]}.US`;
    } else if (!querySymbol.includes('.')) {
        querySymbol = `${querySymbol}.US`;
    }

    const url = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(querySymbol)}`);
    url.searchParams.set('api_token', apiKey);
    url.searchParams.set('fmt', 'json');
    url.searchParams.set('order', 'a'); // Ascending order

    if (options.startDate) {
        url.searchParams.set('from', options.startDate);
    }

    try {
        const response = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // EODHD returns 403 for invalid token, 404 for ticker not found
            const status = response.status;
            let code = 'HTTP_ERROR';
            if (status === 403) code = 'AUTH_FAILED';
            if (status === 404) code = 'INVALID_TICKER';

            return {
                ok: false,
                provider: 'eodhd',
                error: {
                    code,
                    message: `HTTP ${status}`,
                    details: { status }
                }
            };
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
            return {
                ok: false,
                provider: 'eodhd',
                error: { code: 'BAD_PAYLOAD', message: 'EODHD payload not array' }
            };
        }

        const bars = payload
            .map((row) => {
                const date = toIsoDate(row?.date);
                const close = toNumber(row?.close);
                const open = toNumber(row?.open);
                const high = toNumber(row?.high);
                const low = toNumber(row?.low);
                const volume = toNumber(row?.volume);
                const adjClose = toNumber(row?.adjusted_close ?? row?.adj_close ?? row?.close);
                const dividend = toNumber(row?.dividend ?? row?.dividend_value ?? 0);
                const split = toNumber(row?.split ?? row?.split_factor ?? 1);
                if (!date) return null;
                // Basic integrity check: OHLC must exist
                if (close === null || open === null || high === null || low === null) return null;
                return {
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    adjClose: adjClose ?? close,
                    dividend: dividend ?? 0,
                    split: split ?? 1
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        // Deduping not strictly required if 'order=a' works, but good practice? 
        // Keeping minimal.

        return { ok: true, provider: 'eodhd', bars };
    } catch (error) {
        return {
            ok: false,
            provider: 'eodhd',
            error: { code: 'NETWORK_ERROR', message: error?.message || 'network_error' }
        };
    }
}
