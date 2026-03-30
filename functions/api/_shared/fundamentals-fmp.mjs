/**
 * FMP Fundamentals Provider — Stable API (dual-endpoint)
 * /stable/profile       → marketCap, sector, industry, beta, dividendYield
 * /stable/key-metrics-ttm → pe_ttm, eps_ttm, ps_ttm, pb, ev_ebitda, margins
 */

export async function fetchFmpFundamentals(ticker, env) {
    const processEnv = typeof process !== 'undefined' && process?.env ? process.env : {};
    const apiKey = String(env?.FMP_API_KEY || processEnv.FMP_API_KEY || '').trim();
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

    const sym = encodeURIComponent(String(ticker || '').trim().toUpperCase());
    const base = 'https://financialmodelingprep.com/stable';
    const controller = new AbortController();
    const timeoutMs = 8000;
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const [profileRes, ratiosRes, metricsRes] = await Promise.all([
            fetch(`${base}/profile?symbol=${sym}&apikey=${encodeURIComponent(apiKey)}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            }),
            fetch(`${base}/ratios-ttm?symbol=${sym}&apikey=${encodeURIComponent(apiKey)}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            }),
            fetch(`${base}/key-metrics-ttm?symbol=${sym}&apikey=${encodeURIComponent(apiKey)}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller.signal
            })
        ]);

        const latencyMs = Date.now() - started;

        if (!profileRes.ok) {
            return {
                ok: false,
                provider: 'fmp',
                key: { present: true, source: 'FMP_API_KEY' },
                error: { code: profileRes.status === 401 || profileRes.status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR', message: `HTTP ${profileRes.status}` },
                data: null,
                httpStatus: profileRes.status,
                latencyMs
            };
        }

        const profilePayload = await profileRes.json();
        const ratiosPayload = ratiosRes.ok ? await ratiosRes.json().catch(() => null) : null;
        const metricsPayload = metricsRes.ok ? await metricsRes.json().catch(() => null) : null;

        const profile = Array.isArray(profilePayload) && profilePayload.length ? profilePayload[0]
            : (profilePayload && typeof profilePayload === 'object' && !Array.isArray(profilePayload) ? profilePayload : null);

        if (!profile) {
            return {
                ok: false,
                provider: 'fmp',
                key: { present: true, source: 'FMP_API_KEY' },
                error: { code: 'NO_DATA', message: 'No profile data returned' },
                data: null,
                httpStatus: profileRes.status,
                latencyMs
            };
        }

        const ratios = Array.isArray(ratiosPayload) && ratiosPayload.length ? ratiosPayload[0]
            : (ratiosPayload && typeof ratiosPayload === 'object' && !Array.isArray(ratiosPayload) ? ratiosPayload : null);
        const metrics = Array.isArray(metricsPayload) && metricsPayload.length ? metricsPayload[0]
            : (metricsPayload && typeof metricsPayload === 'object' && !Array.isArray(metricsPayload) ? metricsPayload : null);

        const data = normalizeFmp(ticker, profile, ratios, metrics);

        return {
            ok: true,
            provider: 'fmp',
            key: { present: true, source: 'FMP_API_KEY' },
            error: null,
            data,
            httpStatus: profileRes.status,
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

function normalizeFmp(ticker, profile, ratios, metrics) {
    return {
        ticker,
        companyName: profile.companyName || null,
        marketCap: toNumber(profile.marketCap) || toNumber(profile.mktCap) || null,
        pe_ttm: toNumber(ratios?.priceToEarningsRatioTTM) || toNumber(profile.pe) || null,
        ps_ttm: toNumber(ratios?.priceToSalesRatioTTM) || null,
        pb: toNumber(ratios?.priceToBookRatioTTM) || null,
        ev_ebitda: toNumber(metrics?.evToEBITDATTM) || null,
        revenue_ttm: null,
        grossMargin: toNumber(ratios?.grossProfitMarginTTM) || null,
        operatingMargin: toNumber(ratios?.operatingProfitMarginTTM) || null,
        netMargin: toNumber(ratios?.netProfitMarginTTM) || null,
        eps_ttm: toNumber(profile.eps) || null,
        nextEarningsDate: null,
        updatedAt: new Date().toISOString().slice(0, 10),
        sector: profile.sector || null,
        industry: profile.industry || null,
        exchange: profile.exchangeShortName || profile.exchange || null,
        country: profile.country || null,
        dividendYield: toNumber(profile.lastDiv) || null,
        beta: toNumber(profile.beta) || null,
        returnOnEquity: toNumber(metrics?.returnOnEquityTTM) || null,
        returnOnAssets: toNumber(metrics?.returnOnAssetsTTM) || null,
    };
}

export default { fetchFmpFundamentals };
