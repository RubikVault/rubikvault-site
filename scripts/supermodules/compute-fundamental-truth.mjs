/**
 * compute-fundamental-truth.mjs
 * Pure compute module — no API calls, no I/O.
 * Input:  EODHD fundamentals response (normalized by fetchFundamentals)
 * Output: { symbol, scores, flags, meta }
 */

// ── Helpers ──────────────────────────────────────────────────────────
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round(v, d = 2) { return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; }

function pctChange(newer, older) {
    if (older === null || older === undefined || older === 0) return null;
    if (newer === null || newer === undefined) return null;
    return ((newer - older) / Math.abs(older)) * 100;
}

function cagr(startVal, endVal, years) {
    if (!startVal || startVal <= 0 || !endVal || endVal <= 0 || !years || years <= 0) return null;
    return (Math.pow(endVal / startVal, 1 / years) - 1) * 100;
}

function median(arr) {
    const valid = arr.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (!valid.length) return null;
    valid.sort((a, b) => a - b);
    const mid = Math.floor(valid.length / 2);
    return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function stdDev(arr) {
    const valid = arr.filter((v) => v !== null && Number.isFinite(v));
    if (valid.length < 3) return null;
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const variance = valid.reduce((a, v) => a + (v - mean) ** 2, 0) / (valid.length - 1);
    return Math.sqrt(variance);
}

function marginStability(margins) {
    // Coefficient of variation (lower = more stable)
    const s = stdDev(margins);
    const m = median(margins);
    if (s === null || m === null || m === 0) return null;
    return round(Math.abs(s / m) * 100, 2);
}

// ── Earnings Quality ────────────────────────────────────────────────
function earningsQualityScore(income, cashflow) {
    if (!income?.length || !cashflow?.length) return { score: null, components: {} };

    // Match years
    const incomeByYear = new Map(income.map((r) => [r.date.slice(0, 4), r]));
    const cfByYear = new Map(cashflow.map((r) => [r.date.slice(0, 4), r]));

    const accruals = [];
    const fcfRatios = [];

    for (const [year, inc] of incomeByYear) {
        const cf = cfByYear.get(year);
        if (!cf) continue;

        const netIncome = toNum(inc.netIncome);
        const opCF = toNum(cf.operatingCashflow);
        const fcf = toNum(cf.freeCashFlow);

        // Accruals ratio: (Net Income - Operating CF) / |Net Income|
        if (netIncome !== null && opCF !== null && netIncome !== 0) {
            accruals.push((netIncome - opCF) / Math.abs(netIncome));
        }

        // FCF / Net Income ratio (higher = better quality)
        if (netIncome !== null && fcf !== null && netIncome !== 0) {
            fcfRatios.push(fcf / Math.abs(netIncome));
        }
    }

    const medianAccruals = median(accruals);
    const medianFcfRatio = median(fcfRatios);

    // Score 0-100: higher = better quality
    let score = 50;
    if (medianAccruals !== null) {
        if (medianAccruals < 0.1) score += 20; // low accruals = high quality
        else if (medianAccruals < 0.3) score += 10;
        else if (medianAccruals > 0.5) score -= 15;
        else if (medianAccruals > 0.8) score -= 25;
    }
    if (medianFcfRatio !== null) {
        if (medianFcfRatio > 0.8) score += 15;
        else if (medianFcfRatio > 0.5) score += 5;
        else if (medianFcfRatio < 0) score -= 20;
        else if (medianFcfRatio < 0.3) score -= 10;
    }

    return {
        score: Math.max(0, Math.min(100, score)),
        components: {
            accruals_ratio: round(medianAccruals, 3),
            fcf_to_net_income: round(medianFcfRatio, 3),
        },
    };
}

// ── Revenue & Growth ────────────────────────────────────────────────
function revenueAnalysis(income) {
    if (!income || income.length < 2) return null;

    const revenues = income.map((r) => toNum(r.totalRevenue)).filter((v) => v !== null);
    if (revenues.length < 2) return null;

    const years = income.length;
    const firstRev = revenues[0];
    const lastRev = revenues[revenues.length - 1];
    const revCagr = cagr(firstRev, lastRev, years - 1);

    // YoY growth rates
    const growthRates = [];
    for (let i = 1; i < revenues.length; i++) {
        const g = pctChange(revenues[i], revenues[i - 1]);
        if (g !== null) growthRates.push(g);
    }

    return {
        revenue_cagr: round(revCagr),
        revenue_latest: lastRev,
        revenue_first: firstRev,
        years_of_data: years,
        yoy_growth_rates: growthRates.map((g) => round(g)),
        growth_consistency: round(marginStability(growthRates)),
        median_yoy_growth: round(median(growthRates)),
    };
}

// ── Margin Analysis ─────────────────────────────────────────────────
function marginAnalysis(income) {
    if (!income || income.length < 2) return null;

    const grossMargins = [];
    const opMargins = [];
    const netMargins = [];

    for (const row of income) {
        const rev = toNum(row.totalRevenue);
        if (!rev || rev <= 0) continue;

        const gp = toNum(row.grossProfit);
        const oi = toNum(row.operatingIncome);
        const ni = toNum(row.netIncome);

        if (gp !== null) grossMargins.push((gp / rev) * 100);
        if (oi !== null) opMargins.push((oi / rev) * 100);
        if (ni !== null) netMargins.push((ni / rev) * 100);
    }

    return {
        gross_margin_median: round(median(grossMargins)),
        gross_margin_stability: marginStability(grossMargins),
        op_margin_median: round(median(opMargins)),
        op_margin_stability: marginStability(opMargins),
        net_margin_median: round(median(netMargins)),
        net_margin_stability: marginStability(netMargins),
        gross_margin_latest: round(grossMargins[grossMargins.length - 1]),
        op_margin_latest: round(opMargins[opMargins.length - 1]),
        net_margin_latest: round(netMargins[netMargins.length - 1]),
    };
}

// ── Balance Sheet Health ────────────────────────────────────────────
function balanceSheetHealth(balance) {
    if (!balance || !balance.length) return null;

    const latest = balance[balance.length - 1];
    const totalAssets = toNum(latest.totalAssets);
    const goodwill = toNum(latest.goodwill);
    const intangibles = toNum(latest.intangibleAssets);
    const equity = toNum(latest.totalStockholderEquity);
    const debt = toNum(latest.totalDebt);
    const cash = toNum(latest.cash);

    return {
        goodwill_pct_assets: totalAssets && goodwill ? round((goodwill / totalAssets) * 100) : null,
        intangibles_pct_assets: totalAssets && intangibles ? round((intangibles / totalAssets) * 100) : null,
        debt_to_equity: equity && debt ? round(debt / equity, 2) : null,
        net_debt: debt !== null && cash !== null ? debt - cash : null,
        current_ratio: null, // would need current assets/liabilities
        book_value_total: equity,
    };
}

// ── Composite Fundamental Score ─────────────────────────────────────
function compositeScore({ earningsQuality, revenues, margins, balanceSheet, highlights }) {
    let score = 50;
    let factors = 0;

    // Earnings Quality (25% weight)
    if (earningsQuality?.score !== null) {
        score += (earningsQuality.score - 50) * 0.25;
        factors++;
    }

    // Revenue Growth (20% weight)
    if (revenues?.revenue_cagr !== null) {
        const g = revenues.revenue_cagr;
        if (g > 15) score += 10;
        else if (g > 5) score += 5;
        else if (g < 0) score -= 10;
        else if (g < 3) score -= 3;
        factors++;
    }

    // Margin Quality (20% weight)
    if (margins?.op_margin_median !== null) {
        const m = margins.op_margin_median;
        if (m > 25) score += 10;
        else if (m > 15) score += 5;
        else if (m < 0) score -= 15;
        else if (m < 5) score -= 5;
        factors++;
    }

    // Margin Stability (15% weight)
    if (margins?.gross_margin_stability !== null) {
        const s = margins.gross_margin_stability;
        if (s < 10) score += 8; // very stable
        else if (s < 20) score += 4;
        else if (s > 50) score -= 8; // unstable
        factors++;
    }

    // Balance Sheet (10% weight)
    if (balanceSheet?.goodwill_pct_assets !== null) {
        if (balanceSheet.goodwill_pct_assets > 40) score -= 5;
    }
    if (balanceSheet?.debt_to_equity !== null) {
        if (balanceSheet.debt_to_equity > 3) score -= 5;
        else if (balanceSheet.debt_to_equity < 0.5) score += 3;
        factors++;
    }

    // Valuation sanity (10% weight)
    if (highlights?.pe_ttm !== null) {
        if (highlights.pe_ttm > 60) score -= 5;
        else if (highlights.pe_ttm < 0) score -= 8;
        else if (highlights.pe_ttm < 15) score += 3;
        factors++;
    }

    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        factors_used: factors,
    };
}

// ── Main compute ────────────────────────────────────────────────────
/**
 * @param {object} fundamentals - Normalized output from fetchFundamentals().data
 * @param {string} symbol - Ticker symbol
 * @returns {{ symbol, scores, flags, meta }}
 */
export function computeFundamentalTruth(symbol, fundamentals) {
    if (!fundamentals) {
        return { symbol, scores: null, flags: ['NO_FUNDAMENTALS_DATA'], meta: {} };
    }

    const { highlights, financials_income, financials_balance, financials_cashflow, general } = fundamentals;

    const eq = earningsQualityScore(financials_income, financials_cashflow);
    const revenues = revenueAnalysis(financials_income);
    const margins = marginAnalysis(financials_income);
    const balanceSheet = balanceSheetHealth(financials_balance);
    const composite = compositeScore({ earningsQuality: eq, revenues, margins, balanceSheet, highlights });

    const flags = [];
    if (eq.score !== null && eq.score < 30) flags.push('LOW_EARNINGS_QUALITY');
    if (eq.score !== null && eq.score > 75) flags.push('HIGH_EARNINGS_QUALITY');
    if (eq.components?.accruals_ratio !== null && eq.components.accruals_ratio > 0.5) flags.push('HIGH_ACCRUALS');
    if (revenues?.revenue_cagr !== null && revenues.revenue_cagr > 20) flags.push('HIGH_GROWTH');
    if (revenues?.revenue_cagr !== null && revenues.revenue_cagr < -5) flags.push('DECLINING_REVENUE');
    if (margins?.op_margin_latest !== null && margins.op_margin_latest < 0) flags.push('OPERATING_LOSS');
    if (margins?.gross_margin_stability !== null && margins.gross_margin_stability < 10) flags.push('STABLE_MARGINS');
    if (balanceSheet?.goodwill_pct_assets !== null && balanceSheet.goodwill_pct_assets > 40) flags.push('GOODWILL_RISK');
    if (balanceSheet?.debt_to_equity !== null && balanceSheet.debt_to_equity > 3) flags.push('HIGH_LEVERAGE');
    if (composite.score >= 75) flags.push('STRONG_FUNDAMENTAL');
    if (composite.score <= 25) flags.push('WEAK_FUNDAMENTAL');

    return {
        symbol,
        scores: {
            fundamental_score: composite.score,
            earnings_quality: eq.score,
            accruals_ratio: eq.components.accruals_ratio,
            fcf_to_net_income: eq.components.fcf_to_net_income,
            ...revenues && {
                revenue_cagr: revenues.revenue_cagr,
                median_yoy_growth: revenues.median_yoy_growth,
            },
            ...margins && {
                gross_margin: margins.gross_margin_latest,
                gross_margin_stability: margins.gross_margin_stability,
                op_margin: margins.op_margin_latest,
                op_margin_stability: margins.op_margin_stability,
                net_margin: margins.net_margin_latest,
            },
            ...balanceSheet && {
                goodwill_pct_assets: balanceSheet.goodwill_pct_assets,
                debt_to_equity: balanceSheet.debt_to_equity,
            },
            ...highlights && {
                pe_ttm: highlights.pe_ttm,
                pb: highlights.pb,
                ps_ttm: highlights.ps_ttm,
                ev_ebitda: highlights.ev_ebitda,
                roe: highlights.return_on_equity,
                roa: highlights.return_on_assets,
                market_cap: highlights.marketCap,
            },
        },
        general: general || null,
        flags,
        meta: {
            income_years: financials_income?.length || 0,
            balance_years: financials_balance?.length || 0,
            cashflow_years: financials_cashflow?.length || 0,
            factors_used: composite.factors_used,
        },
    };
}
