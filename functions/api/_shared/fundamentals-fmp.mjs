/**
 * FMP Fundamentals Fallback Provider
 * 
 * Used when Tiingo fails (e.g., rate limiting) to provide
 * fundamentals data from Financial Modeling Prep.
 */

export async function fetchFmpFundamentals(ticker, env) {
    const apiKey = String(env?.FMP_API_KEY || '').trim();
    if (!apiKey) {
        return {
            ok: false,
            provider: 'fmp',
            key: { present: false, source: null },
            error: { code: 'MISSING_API_KEY', message: 'Missing FMP_API_KEY' },
            data: null,
            httpStatus: null,
            latencyMs: null
        };
    }

    const controller = new AbortController();
    const timeoutMs = 6000;
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const apiUrl = `https://financialmodelingprep.com/api/v3/profile/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(apiKey)}`;

        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });

        const latencyMs = Date.now() - started;

        if (!res.ok) {
            return {
                ok: false,
                provider: 'fmp',
                key: { present: true, source: 'FMP_API_KEY' },
                error: { code: res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR', message: `HTTP ${res.status}` },
                data: null,
                httpStatus: res.status,
                latencyMs
            };
        }

        const payload = await res.json();
        const profile = Array.isArray(payload) && payload.length ? payload[0] : null;

        if (!profile) {
            return {
                ok: false,
                provider: 'fmp',
                key: { present: true, source: 'FMP_API_KEY' },
                error: { code: 'NO_DATA', message: 'No profile data returned' },
                data: null,
                httpStatus: res.status,
                latencyMs
            };
        }

        // Normalize FMP profile to our fundamentals schema
        const data = normalizeFmpProfile(ticker, profile);

        return {
            ok: true,
            provider: 'fmp',
            key: { present: true, source: 'FMP_API_KEY' },
            error: null,
            data,
            httpStatus: res.status,
            latencyMs
        };
    } catch (error) {
        const msg = String(error?.message || error || 'network_error');
        const latencyMs = Date.now() - started;
        const lower = msg.toLowerCase();
        const code = lower.includes('abort') || lower.includes('timeout') ? 'TIMEOUT' : 'NETWORK_ERROR';
        return {
            ok: false,
            provider: 'fmp',
            key: { present: true, source: 'FMP_API_KEY' },
            error: { code, message: msg },
            data: null,
            httpStatus: null,
            latencyMs
        };
    } finally {
        clearTimeout(timer);
    }
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeFmpProfile(ticker, profile) {
    return {
        ticker,
        companyName: profile.companyName || null,
        marketCap: toNumber(profile.mktCap),
        pe_ttm: toNumber(profile.pe) || toNumber(profile.priceEarningsRatio),
        ps_ttm: toNumber(profile.priceToSalesRatio),
        pb: toNumber(profile.priceToBookRatio),
        ev_ebitda: null, // FMP profile doesn't include this
        revenue_ttm: null, // Requires separate endpoint
        grossMargin: null,
        operatingMargin: null,
        netMargin: null,
        eps_ttm: toNumber(profile.eps),
        nextEarningsDate: null, // Requires earnings calendar endpoint
        updatedAt: new Date().toISOString().slice(0, 10)
    };
}

export default { fetchFmpFundamentals };
