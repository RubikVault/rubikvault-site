/**
 * compute-risk-resilience.mjs
 * Pure compute module — no API calls, no I/O.
 * Input:  Array of { symbol, bars: [{ date, close, high, low, volume }] }
 * Output: Array of { symbol, scores, flags, meta }
 */

// ── Helpers ──────────────────────────────────────────────────────────
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round(v, d = 2) { return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; }

function annualizedVolatility(bars) {
    if (!bars || bars.length < 22) return null;
    const returns = [];
    for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1].close;
        const curr = bars[i].close;
        if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
    }
    if (returns.length < 20) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // annualized %
}

function computeDrawdowns(bars) {
    if (!bars || bars.length < 2) return [];
    const episodes = [];
    let peak = bars[0].close;
    let peakDate = bars[0].date;
    let inDrawdown = false;
    let ddStart = null;
    let trough = Infinity;
    let troughDate = null;

    for (let i = 1; i < bars.length; i++) {
        const { close, date } = bars[i];
        if (close >= peak) {
            if (inDrawdown) {
                episodes.push({
                    start: ddStart,
                    trough_date: troughDate,
                    recovery_date: date,
                    drawdown_pct: round(((trough - peak) / peak) * 100, 2),
                    recovery_days: daysBetween(ddStart, date),
                });
                inDrawdown = false;
            }
            peak = close;
            peakDate = date;
            trough = Infinity;
        } else {
            if (!inDrawdown) {
                inDrawdown = true;
                ddStart = peakDate;
            }
            if (close < trough) {
                trough = close;
                troughDate = date;
            }
        }
    }

    // Handle ongoing drawdown
    if (inDrawdown) {
        const lastBar = bars[bars.length - 1];
        episodes.push({
            start: ddStart,
            trough_date: troughDate,
            recovery_date: null, // not recovered
            drawdown_pct: round(((trough - peak) / peak) * 100, 2),
            recovery_days: null,
        });
    }

    return episodes.sort((a, b) => a.drawdown_pct - b.drawdown_pct); // worst first (most negative)
}

function daysBetween(d1, d2) {
    if (!d1 || !d2) return null;
    const ms = new Date(d2).getTime() - new Date(d1).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function maxDrawdown(bars) {
    if (!bars || bars.length < 2) return null;
    let peak = bars[0].close;
    let maxDD = 0;
    for (let i = 1; i < bars.length; i++) {
        if (bars[i].close > peak) peak = bars[i].close;
        const dd = (bars[i].close - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }
    return round(maxDD * 100, 2);
}

function compoundReturn(bars) {
    if (!bars || bars.length < 2) return null;
    const first = bars[0].close;
    const last = bars[bars.length - 1].close;
    if (!first || first <= 0) return null;
    return round(((last - first) / first) * 100, 2);
}

function sharpeProxy(bars) {
    if (!bars || bars.length < 100) return null;
    const returns = [];
    for (let i = 1; i < bars.length; i++) {
        const prev = bars[i - 1].close;
        const curr = bars[i].close;
        if (prev > 0) returns.push((curr - prev) / prev);
    }
    if (returns.length < 50) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    if (std === 0) return null;
    return round((mean / std) * Math.sqrt(252), 2);
}

function barsForYears(bars, years) {
    if (!bars || bars.length < 2) return null;
    const lastDate = bars[bars.length - 1].date;
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const subset = bars.filter((b) => b.date >= cutoffStr);
    return subset.length >= 50 ? subset : null;
}

// ── Risk Score ──────────────────────────────────────────────────────
function computeRiskScore({ maxDD5y, volatility, sharpe, maxDD10y }) {
    // Score 0-100: higher = RISKIER
    let score = 50;

    // Drawdown component (40% weight)
    const dd = Math.abs(maxDD5y ?? maxDD10y ?? 0);
    if (dd > 50) score += 20;
    else if (dd > 30) score += 10;
    else if (dd > 15) score += 5;
    else score -= 10;

    // Volatility component (30% weight)
    const vol = volatility ?? 0;
    if (vol > 40) score += 15;
    else if (vol > 25) score += 5;
    else if (vol < 15) score -= 10;

    // Sharpe component (30% weight)
    const sh = sharpe ?? 0;
    if (sh < 0) score += 15;
    else if (sh < 0.5) score += 5;
    else if (sh > 1.5) score -= 15;
    else if (sh > 1) score -= 5;

    return Math.max(0, Math.min(100, score));
}

// ── Main compute ────────────────────────────────────────────────────
/**
 * @param {Array<{ symbol: string, bars: Array<{ date: string, close: number, high: number, low: number, volume: number }> }>} universe
 * @returns {Array<{ symbol: string, scores: object, flags: string[], meta: object }>}
 */
export function computeRiskResilience(universe) {
    const results = [];

    for (const { symbol, bars } of universe) {
        if (!bars || bars.length < 50) {
            results.push({
                symbol,
                scores: null,
                flags: ['INSUFFICIENT_DATA'],
                meta: { bar_count: bars?.length || 0 },
            });
            continue;
        }

        const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
        const bars5y = barsForYears(sorted, 5);
        const bars3y = barsForYears(sorted, 3);
        const bars1y = barsForYears(sorted, 1);

        const maxDD_full = maxDrawdown(sorted);
        const maxDD_5y = bars5y ? maxDrawdown(bars5y) : null;
        const maxDD_3y = bars3y ? maxDrawdown(bars3y) : null;
        const maxDD_1y = bars1y ? maxDrawdown(bars1y) : null;
        const vol = annualizedVolatility(sorted);
        const vol_1y = bars1y ? annualizedVolatility(bars1y) : null;
        const sharpe = sharpeProxy(sorted);
        const sharpe_1y = bars1y ? sharpeProxy(bars1y) : null;
        const ret_total = compoundReturn(sorted);
        const ret_1y = bars1y ? compoundReturn(bars1y) : null;
        const ret_3y = bars3y ? compoundReturn(bars3y) : null;

        const drawdownEpisodes = computeDrawdowns(sorted);
        const worst5 = drawdownEpisodes.slice(0, 5);

        const riskScore = computeRiskScore({
            maxDD5y: maxDD_5y,
            maxDD10y: maxDD_full,
            volatility: vol,
            sharpe,
        });

        const flags = [];
        if (Math.abs(maxDD_5y ?? maxDD_full ?? 0) > 50) flags.push('EXTREME_DRAWDOWN');
        if ((vol ?? 0) > 40) flags.push('HIGH_VOLATILITY');
        if ((sharpe ?? 0) < 0) flags.push('NEGATIVE_SHARPE');
        if (riskScore >= 75) flags.push('HIGH_RISK');
        if (riskScore <= 25) flags.push('LOW_RISK');

        results.push({
            symbol,
            scores: {
                risk_score: riskScore,
                max_drawdown_full: maxDD_full,
                max_drawdown_5y: maxDD_5y,
                max_drawdown_3y: maxDD_3y,
                max_drawdown_1y: maxDD_1y,
                volatility_ann: round(vol),
                volatility_1y: round(vol_1y),
                sharpe_full: sharpe,
                sharpe_1y: sharpe_1y,
                return_total: ret_total,
                return_1y: ret_1y,
                return_3y: ret_3y,
            },
            drawdown_dna: worst5,
            flags,
            meta: {
                bar_count: sorted.length,
                first_date: sorted[0].date,
                last_date: sorted[sorted.length - 1].date,
                years_of_data: round(sorted.length / 252, 1),
            },
        });
    }

    return results;
}
