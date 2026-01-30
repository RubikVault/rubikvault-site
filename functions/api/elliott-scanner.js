/**
 * Elliott Waves Scanner API
 * 
 * DFMSIF v1.0 — Deterministic Fractal Market Structure Inference
 * 
 * Returns wave positions for all NASDAQ-100 stocks based on:
 * - Swing detection from OHLC data
 * - Elliott Wave rule validation (R1, R2, R3)
 * - Fibonacci ratio conformance scoring
 * 
 * This is NOT prediction — it is rule-based historical structure detection.
 */

export async function onRequest(context) {
    const { env } = context;
    const startMs = Date.now();

    try {
        // Load universe and market stats
        const [universeRes, statsRes] = await Promise.all([
            fetch(new URL('/data/universe/nasdaq100.json', context.request.url)),
            fetch(new URL('/data/snapshots/market-prices/latest.json', context.request.url))
        ]);

        if (!universeRes.ok || !statsRes.ok) {
            return jsonResponse({
                ok: false,
                error: { code: 'DATA_UNAVAILABLE', message: 'Unable to load universe or market data' },
                setups: []
            }, 503);
        }

        const universe = await universeRes.json();
        const pricesSnapshot = await statsRes.json();

        const symbolToName = new Map();
        if (Array.isArray(universe)) {
            for (const entry of universe) {
                if (entry?.ticker) symbolToName.set(entry.ticker.toUpperCase(), entry.name || null);
            }
        }

        const pricesBySymbol = new Map();
        if (Array.isArray(pricesSnapshot?.data)) {
            for (const bar of pricesSnapshot.data) {
                if (!bar?.symbol) continue;
                const sym = bar.symbol.toUpperCase();
                if (!pricesBySymbol.has(sym)) pricesBySymbol.set(sym, []);
                pricesBySymbol.get(sym).push(bar);
            }
        }

        // Analyze each symbol
        const setups = [];
        const tickers = Array.from(symbolToName.keys());

        for (const ticker of tickers) {
            const bars = pricesBySymbol.get(ticker) || [];
            if (bars.length < 60) {
                // Need minimum history for swing detection
                setups.push({
                    ticker,
                    name: symbolToName.get(ticker),
                    wavePosition: 'unknown',
                    confidence: 0,
                    direction: 'neutral',
                    fibConformance: null,
                    reason: 'INSUFFICIENT_HISTORY'
                });
                continue;
            }

            // Sort bars by date (oldest first for swing detection)
            const sortedBars = [...bars].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            // Detect swings and evaluate Elliott structure
            const analysis = analyzeElliottStructure(sortedBars);

            setups.push({
                ticker,
                name: symbolToName.get(ticker),
                wavePosition: analysis.wavePosition,
                confidence: analysis.confidence,
                direction: analysis.direction,
                fibConformance: analysis.fibConformance,
                validPattern: analysis.validPattern,
                rules: analysis.rules
            });
        }

        // Sort by confidence descending
        setups.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

        const durationMs = Date.now() - startMs;

        return jsonResponse({
            ok: true,
            meta: {
                asOf: new Date().toISOString(),
                durationMs,
                count: setups.length,
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

// === DFMSIF v1.0 Core Algorithm ===

function round6(n) {
    return typeof n === 'number' && Number.isFinite(n)
        ? Math.round(n * 1_000_000) / 1_000_000
        : n;
}

function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
}

function isPivotHigh(bars, idx, window) {
    const high = bars[idx]?.high;
    if (high == null || !Number.isFinite(high)) return false;
    for (let i = idx - window; i <= idx + window; i++) {
        if (i === idx || i < 0 || i >= bars.length) continue;
        if ((bars[i]?.high ?? -Infinity) > high) return false;
    }
    return true;
}

function isPivotLow(bars, idx, window) {
    const low = bars[idx]?.low;
    if (low == null || !Number.isFinite(low)) return false;
    for (let i = idx - window; i <= idx + window; i++) {
        if (i === idx || i < 0 || i >= bars.length) continue;
        if ((bars[i]?.low ?? Infinity) < low) return false;
    }
    return true;
}

function detectSwings(bars, window = 5) {
    const swings = [];
    for (let i = window; i < bars.length - window; i++) {
        if (isPivotHigh(bars, i, window)) {
            swings.push({ index: i, date: bars[i].date, price: bars[i].high, type: 'high' });
        }
        if (isPivotLow(bars, i, window)) {
            swings.push({ index: i, date: bars[i].date, price: bars[i].low, type: 'low' });
        }
    }
    swings.sort((a, b) => a.index - b.index);
    return swings;
}

function nearestRatioScore(ratio, targets) {
    const closest = targets.reduce((best, target) => {
        const distance = Math.abs(ratio - target);
        return distance < Math.abs(ratio - best) ? target : best;
    }, targets[0]);
    const score = 1 - Math.abs(ratio - closest) / closest;
    return clamp(0, 1, score) * 100;
}

function analyzeElliottStructure(bars) {
    // Adaptive window based on volatility
    const closeStd = computeStd(bars.slice(-30).map(b => b.close));
    const avgClose = bars.slice(-30).reduce((s, b) => s + b.close, 0) / 30;
    const volatilityRatio = closeStd / (avgClose || 1);
    const window = clamp(3, 8, Math.round(5 * (1 + volatilityRatio)));

    const swings = detectSwings(bars, window);

    if (swings.length < 6) {
        return {
            wavePosition: 'unknown',
            confidence: 0,
            direction: 'neutral',
            fibConformance: null,
            validPattern: false,
            rules: {}
        };
    }

    // Analyze last 6 swings for completed 5-wave pattern
    const points = swings.slice(-6);
    const [p0, p1, p2, p3, p4, p5] = points;

    const direction = p5.price >= p0.price ? 'bullish' : 'bearish';

    const w1 = p1.price - p0.price;
    const w2 = p2.price - p1.price;
    const w3 = p3.price - p2.price;
    const w4 = p4.price - p3.price;
    const w5 = p5.price - p4.price;

    const w1a = Math.abs(w1) || 1;
    const w2a = Math.abs(w2);
    const w3a = Math.abs(w3);
    const w4a = Math.abs(w4);
    const w5a = Math.abs(w5);

    // Elliott Wave Rules (Hard Rules)
    const r1 = w2a / w1a < 1;  // Wave 2 retraces less than 100% of Wave 1
    const r2 = !(w3a < w1a && w3a < w5a);  // Wave 3 not shortest
    const r3 = direction === 'bullish' ? p4.price > p1.price : p4.price < p1.price;  // Wave 4 doesn't overlap Wave 1

    const rules = { r1, r2, r3 };
    const rulePasses = Object.values(rules).filter(Boolean).length;
    const validPattern = r1 && r2 && r3;

    // Fibonacci ratios
    const ratios = {
        wave2: w2a / w1a,
        wave3: w3a / w1a,
        wave4: w4a / w3a,
        wave5: w5a / w1a
    };

    // Fib conformance score
    const fibConformance = (
        nearestRatioScore(ratios.wave2, [0.382, 0.5, 0.618, 0.786]) +
        nearestRatioScore(ratios.wave3, [1.618, 2.618]) +
        nearestRatioScore(ratios.wave4, [0.236, 0.382, 0.5]) +
        nearestRatioScore(ratios.wave5, [0.618, 1, 1.618])
    ) / 4;

    // Determine current wave position
    const wavePosition = determineWavePosition(swings, validPattern, direction, ratios);

    // Calculate overall confidence
    const confidence = clamp(0, 100, Math.round(
        rulePasses * 20 + fibConformance * 0.4
    ));

    return {
        wavePosition,
        confidence,
        direction,
        fibConformance: round6(fibConformance),
        validPattern,
        rules
    };
}

function determineWavePosition(swings, validPattern, direction, ratios) {
    if (swings.length < 4) return 'unknown';

    const last = swings[swings.length - 1];
    const prev = swings[swings.length - 2];
    const prev2 = swings[swings.length - 3];

    // Check if we're in an impulsive move after a correction
    const lastMove = last.price - prev.price;
    const prevMove = prev.price - prev2.price;

    // If last 2 swings show alternating pattern with increasing amplitude
    if (validPattern) {
        // Pattern completed, likely in correction or starting new Wave 1
        if (ratios.wave5 > 1.5) {
            return 'in-correction';  // Extended Wave 5 completed
        }
        return 'wave-1-start';  // Starting new impulsive sequence
    }

    // Count swings in current direction
    let impulsiveSwings = 0;
    for (let i = swings.length - 1; i >= Math.max(0, swings.length - 5); i--) {
        const swing = swings[i];
        if (direction === 'bullish' && swing.type === 'high') impulsiveSwings++;
        if (direction === 'bearish' && swing.type === 'low') impulsiveSwings++;
    }

    // Estimate wave position based on swing count and pattern
    if (impulsiveSwings <= 1) {
        return 'wave-1-start';
    } else if (impulsiveSwings === 2) {
        // After Wave 2 correction, before Wave 3
        return 'pre-wave-3';
    } else if (impulsiveSwings === 3 || impulsiveSwings === 4) {
        // After Wave 4 correction, before Wave 5
        return 'pre-wave-5';
    } else {
        return 'in-correction';
    }
}

function computeStd(values) {
    if (!values.length) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}
