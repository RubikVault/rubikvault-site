/**
 * Elliott Waves Scanner API
 * 
 * DFMSIF v1.0 — Deterministic Fractal Market Structure Inference
 * 
 * Scans NASDAQ-100 for Elliott Wave setups using:
 * - Pre-computed marketphase data (AAPL, MSFT)
 * - Heuristic estimation from EOD stats (remaining symbols)
 * 
 * This is NOT prediction — it is rule-based historical structure detection.
 */

export async function onRequest(context) {
    const startMs = Date.now();
    const baseUrl = new URL(context.request.url).origin;

    try {
        // Load universe
        const universeRes = await fetch(`${baseUrl}/data/universe/all.json`);
        if (!universeRes.ok) {
            return jsonResponse({
                ok: false,
                error: { code: 'UNIVERSE_UNAVAILABLE', message: 'Unable to load universe' },
                setups: []
            }, 503);
        }

        const universe = await universeRes.json();
        const symbols = Array.isArray(universe)
            ? universe.map(e => ({ ticker: e.ticker?.toUpperCase(), name: e.name })).filter(e => e.ticker)
            : [];

        // Load EOD batch for basic stats
        const eodRes = await fetch(`${baseUrl}/data/eod/batches/eod.latest.000.json`);
        const eodData = eodRes.ok ? await eodRes.json() : null;
        const eodBySymbol = eodData?.data || {};

        // Load marketphase index
        const mpIndexRes = await fetch(`${baseUrl}/data/marketphase/index.json`);
        const mpIndex = mpIndexRes.ok ? await mpIndexRes.json() : { symbols: [] };
        const mpSymbols = new Set(mpIndex.symbols || []);

        // Analyze each symbol
        const setups = [];

        for (const { ticker, name } of symbols) {
            const eod = eodBySymbol[ticker];

            // Check if we have pre-computed marketphase data
            if (mpSymbols.has(ticker)) {
                try {
                    const mpRes = await fetch(`${baseUrl}/data/marketphase/${ticker}.json`);
                    if (mpRes.ok) {
                        const mp = await mpRes.json();
                        const elliott = mp?.data?.elliott;

                        if (elliott) {
                            const setup = extractSetupFromMarketphase(ticker, name, elliott, eod);
                            setups.push(setup);
                            continue;
                        }
                    }
                } catch {
                    // Fall through to heuristic
                }
            }

            // Heuristic estimation from EOD data
            const setup = estimateWaveFromEOD(ticker, name, eod);
            setups.push(setup);
        }

        // Sort by confidence descending
        setups.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

        return jsonResponse({
            ok: true,
            meta: {
                asOf: new Date().toISOString(),
                durationMs: Date.now() - startMs,
                count: setups.length,
                analyzedFull: mpSymbols.size,
                version: 'DFMSIF_v1.0'
            },
            setups
        });

    } catch (err) {
        return jsonResponse({
            ok: false,
            error: { code: 'SCANNER_ERROR', message: err.message || String(err) },
            setups: []
        }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300'
        }
    });
}

function extractSetupFromMarketphase(ticker, name, elliott, eod) {
    const completed = elliott?.completedPattern || {};
    const developing = elliott?.developingPattern || {};
    const fib = elliott?.fib || {};
    const uncertainty = elliott?.uncertainty || {};

    // Determine wave position from developing pattern
    let wavePosition = 'unknown';
    const possibleWave = developing.possibleWave || '';

    if (possibleWave.includes('4') || possibleWave.includes('ABC')) {
        wavePosition = completed.valid ? 'pre-wave-5' : 'in-correction';
    } else if (completed.valid && fib.conformanceScore > 50) {
        wavePosition = 'wave-1-start';
    } else {
        wavePosition = 'pre-wave-3';
    }

    // Override based on rule analysis
    if (!completed.rules?.r2) {
        wavePosition = 'pre-wave-3';
    }

    const confidence = uncertainty?.confidenceDecay?.adjusted ?? completed.confidence0_100 ?? 0;

    return {
        ticker,
        name,
        wavePosition,
        confidence,
        direction: completed.direction || 'neutral',
        fibConformance: fib.conformanceScore ?? null,
        validPattern: completed.valid ?? false,
        source: 'marketphase'
    };
}

function estimateWaveFromEOD(ticker, name, eod) {
    if (!eod) {
        return {
            ticker,
            name,
            wavePosition: 'unknown',
            confidence: 0,
            direction: 'neutral',
            fibConformance: null,
            validPattern: false,
            source: 'unavailable'
        };
    }

    const close = eod.close;
    const high = eod.high;
    const low = eod.low;
    const open = eod.open;

    if (!Number.isFinite(close)) {
        return {
            ticker,
            name,
            wavePosition: 'unknown',
            confidence: 0,
            direction: 'neutral',
            fibConformance: null,
            validPattern: false,
            source: 'heuristic'
        };
    }

    // Estimate direction from today's bar
    const dayChange = (close - open) / open;
    const direction = dayChange >= 0 ? 'bullish' : 'bearish';

    // Position in day's range
    const range = high - low;
    const positionInRange = range > 0 ? (close - low) / range : 0.5;

    // Calculate Fibonacci conformance based on close position relative to key Fib levels
    // Key Fib retracement levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
    const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

    // Find nearest Fib level
    let minDistance = 1;
    for (const fibLevel of fibLevels) {
        const distance = Math.abs(positionInRange - fibLevel);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    // Convert distance to conformance score (0-100%)
    // Distance 0 = 100% conformance, Distance 0.5 = 0% conformance
    const fibConformance = Math.max(0, Math.min(100, (1 - minDistance * 2) * 100));

    // Heuristic wave position
    let wavePosition;
    let confidence;

    if (positionInRange > 0.8) {
        wavePosition = direction === 'bullish' ? 'in-correction' : 'pre-wave-3';
        confidence = 35;
    } else if (positionInRange < 0.2) {
        wavePosition = direction === 'bearish' ? 'in-correction' : 'pre-wave-3';
        confidence = 35;
    } else if (positionInRange > 0.5) {
        wavePosition = 'pre-wave-5';
        confidence = 25;
    } else {
        wavePosition = 'wave-1-start';
        confidence = 20;
    }

    return {
        ticker,
        name,
        wavePosition,
        confidence,
        direction,
        fibConformance: Math.round(fibConformance * 10) / 10,
        validPattern: false,
        source: 'heuristic'
    };
}
