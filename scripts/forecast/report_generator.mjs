/**
 * Forecast System v3.0 — Report Generator
 * 
 * Generates daily/weekly/monthly reports and scorecards.
 * Publishes to public/data/forecast/
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { computeGlobalMetrics } from './evaluator.mjs';

const PUBLIC_BASE = 'public/data/forecast';
const STATUS_REL_PATH = 'system/status.json';
const LAST_GOOD_POINTER_REL_PATH = 'system/last_good.json';
const LAST_GOOD_ENVELOPE_REL_PATH = 'last_good.json';
const LATEST_REL_PATH = 'latest.json';
const STOCK_ANALYSIS_REL_PATH = 'public/data/snapshots/stock-analysis.json';

// ─────────────────────────────────────────────────────────────────────────────
// Path Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function atomicWriteJson(filePath, doc) {
    ensureDir(filePath);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(doc, null, 2));
    fs.renameSync(tmpPath, filePath);
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

function buildLatestDoc(latest = {}) {
    return {
        schema: 'rv_envelope_v1',
        ok: latest.ok ?? true,
        feature: 'forecast',
        generated_at: new Date().toISOString(),
        meta: {
            status: latest.status ?? 'ok',
            reason: latest.reason ?? null,
            last_good_ref: latest.last_good_ref ?? null
        },
        data: {
            champion_id: latest.champion_id ?? null,
            asof: latest.asof ?? null,
            forecasts: latest.forecasts ?? [],
            latest_report_ref: latest.latest_report_ref ?? null,
            scorecards_ref: latest.scorecards_ref ?? null,
            maturity_phase: latest.maturity_phase ?? 'BOOTSTRAP'
        }
    };
}

function isValidLatestDoc(doc) {
    return Boolean(
        doc &&
        (doc.schema === 'rv_envelope_v1' || doc.schema === 'rv_envelope') &&
        doc.feature === 'forecast' &&
        doc.meta &&
        typeof doc.meta.status === 'string' &&
        doc.data &&
        Array.isArray(doc.data.forecasts)
    );
}

function deriveDirection(probability) {
    if (!Number.isFinite(probability)) return 'neutral';
    if (probability > 0.53) return 'bullish';
    if (probability < 0.47) return 'bearish';
    return 'neutral';
}

function buildSeedForecastsFromStockAnalysis(repoRoot) {
    const seedPath = path.join(repoRoot, STOCK_ANALYSIS_REL_PATH);
    const doc = readJsonIfExists(seedPath);
    if (!doc || typeof doc !== 'object') {
        return { asof: null, forecasts: [] };
    }

    const asofRaw = doc?._meta?.generated_at ?? doc?._meta?.generatedAt ?? null;
    const asof = typeof asofRaw === 'string' && asofRaw.length >= 10 ? asofRaw.slice(0, 10) : null;
    const forecasts = [];

    for (const [symbol, row] of Object.entries(doc)) {
        if (!symbol || symbol.startsWith('_')) continue;
        if (!row || typeof row !== 'object') continue;
        const probability = Number(row.probability);
        if (!Number.isFinite(probability)) continue;

        const clamped = Math.max(0.01, Math.min(0.99, probability));
        const horizon = {
            direction: deriveDirection(clamped),
            probability: clamped
        };

        forecasts.push({
            symbol: row.ticker ?? symbol,
            name: row.name ?? null,
            horizons: {
                '1d': horizon,
                '5d': horizon,
                '20d': horizon
            }
        });
    }

    forecasts.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    return { asof, forecasts };
}

function getDailyReportPath(repoRoot, date) {
    return path.join(repoRoot, PUBLIC_BASE, 'reports/daily', `${date}.json`);
}

function getWeeklyReportPath(repoRoot, yearWeek) {
    return path.join(repoRoot, PUBLIC_BASE, 'reports/weekly', `${yearWeek}.json`);
}

function getMonthlyReportPath(repoRoot, yearMonth) {
    return path.join(repoRoot, PUBLIC_BASE, 'reports/monthly', `${yearMonth}.json`);
}

function getScorecardsPath(repoRoot) {
    return path.join(repoRoot, PUBLIC_BASE, 'scorecards/tickers.json.gz');
}

function getTickerHistoryPath(repoRoot, ticker) {
    return path.join(repoRoot, PUBLIC_BASE, 'scorecards/history', `${ticker}.json.gz`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate daily report
 * @param {object} params
 * @returns {object} Report object
 */
export function generateDailyReport({
    date,
    outcomes,
    historicalOutcomes = [],
    policy = {},
    meta = {}
}) {
    const globalMetrics = computeGlobalMetrics(outcomes, historicalOutcomes, policy);

    // Determine maturity phase
    const liveDays = meta.live_eval_days ?? 0;
    const bootstrapThreshold = policy?.maturity?.bootstrap_live_eval_days ?? 90;
    const calibrationThreshold = policy?.maturity?.calibration_live_eval_days ?? 180;

    let maturityPhase = 'BOOTSTRAP';
    if (liveDays >= calibrationThreshold) maturityPhase = 'MATURE';
    else if (liveDays >= bootstrapThreshold) maturityPhase = 'CALIBRATION';

    // Count ticker states
    const tickerStates = meta.ticker_states ?? {};
    const tickerCounts = {
        improving: 0,
        flat: 0,
        degrading: 0,
        low_reliability: 0,
        unforecastable: 0
    };

    for (const state of Object.values(tickerStates)) {
        if (state.improving) tickerCounts.improving++;
        else if (state.degrading) tickerCounts.degrading++;
        else tickerCounts.flat++;
        if (state.low_reliability) tickerCounts.low_reliability++;
        if (state.unforecastable) tickerCounts.unforecastable++;
    }

    return {
        schema: 'forecast_report_v3',
        period: {
            type: 'daily',
            id: date
        },
        as_of: new Date().toISOString(),
        maturity_phase: maturityPhase,
        meta: {
            status: meta.circuit_state === 'open' ? 'circuit_open' : (meta.degraded ? 'degraded' : 'ok'),
            reason: meta.reason ?? null,
            data_completeness: {
                missing_price_data_pct: meta.missing_price_pct ?? 0,
                missing_earnings_snapshot: !meta.has_earnings,
                missing_macro_snapshot: !meta.has_macro
            },
            compute: {
                challengers_tested_this_period: meta.challengers_tested ?? 0,
                challengers_promoted_this_period: meta.challengers_promoted ?? 0,
                quota_monthly_min_challengers: policy?.exploration?.monthly_min_challengers ?? 8,
                quota_status: 'pending',
                quota_miss_reason: null
            }
        },
        global_metrics: globalMetrics,
        ticker_heatmap_summary: {
            counts: tickerCounts,
            thresholds: {
                improving_skill_delta_pct: 2.0,
                degrading_skill_delta_pct: -2.0
            }
        },
        top_movers: {
            winners: meta.top_winners ?? [],
            losers: meta.top_losers ?? []
        },
        recent_changes: {
            promotions: meta.recent_promotions ?? [],
            rollbacks: meta.recent_rollbacks ?? []
        },
        diagnostics: {
            stagnation_alert: meta.stagnation_alert ?? false,
            anti_gaming_alert: meta.anti_gaming_alert ?? false,
            notes: meta.notes ?? []
        }
    };
}

/**
 * Write report to file
 * @param {string} repoRoot - Repository root
 * @param {object} report - Report object
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 */
export function writeReport(repoRoot, report, type) {
    let reportPath;
    switch (type) {
        case 'daily':
            reportPath = getDailyReportPath(repoRoot, report.period.id);
            break;
        case 'weekly':
            reportPath = getWeeklyReportPath(repoRoot, report.period.id);
            break;
        case 'monthly':
            reportPath = getMonthlyReportPath(repoRoot, report.period.id);
            break;
        default:
            throw new Error(`Unknown report type: ${type}`);
    }

    ensureDir(reportPath);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`[Report] Written ${type} report to ${reportPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorecards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate ticker scorecards
 * @param {object} params
 * @returns {object} Scorecards data
 */
export function generateScorecards({
    outcomes,
    historicalOutcomes = [],
    policy = {}
}) {
    // Group outcomes by ticker × horizon
    const byTickerHorizon = {};

    for (const outcome of outcomes) {
        const key = `${outcome.ticker}_${outcome.horizon}`;
        if (!byTickerHorizon[key]) {
            byTickerHorizon[key] = [];
        }
        byTickerHorizon[key].push(outcome);
    }

    const scorecards = {};

    for (const [key, tickerOutcomes] of Object.entries(byTickerHorizon)) {
        const [ticker, horizon] = key.split('_');

        if (!scorecards[ticker]) {
            scorecards[ticker] = { ticker, horizons: {} };
        }

        // Compute rolling metrics (30d, 90d, 180d windows)
        const now = new Date();
        const windows = [30, 90, 180];
        const metrics = {};

        for (const days of windows) {
            const cutoff = new Date(now);
            cutoff.setDate(cutoff.getDate() - days);
            const cutoffStr = cutoff.toISOString().slice(0, 10);

            const windowOutcomes = tickerOutcomes.filter(o => o.outcome_trading_date >= cutoffStr);

            if (windowOutcomes.length > 0) {
                const brier = windowOutcomes.reduce((a, o) => a + o.metrics.brier, 0) / windowOutcomes.length;
                metrics[`brier_${days}d`] = brier;
                metrics[`sample_count_${days}d`] = windowOutcomes.length;
            }
        }

        // Determine reliability state
        let reliability = 'normal';
        // Simplified: would need historical skill data

        scorecards[ticker].horizons[horizon] = {
            ...metrics,
            reliability,
            last_updated: new Date().toISOString()
        };
    }

    return {
        schema: 'forecast_scorecards_v1',
        generated_at: new Date().toISOString(),
        ticker_count: Object.keys(scorecards).length,
        tickers: scorecards
    };
}

/**
 * Write scorecards to file
 * @param {string} repoRoot - Repository root
 * @param {object} scorecards - Scorecards data
 */
export function writeScorecards(repoRoot, scorecards) {
    const scorecardsPath = getScorecardsPath(repoRoot);
    ensureDir(scorecardsPath);

    const json = JSON.stringify(scorecards);
    const compressed = zlib.gzipSync(Buffer.from(json, 'utf8'));
    fs.writeFileSync(scorecardsPath, compressed);

    console.log(`[Scorecards] Written to ${scorecardsPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status & Latest Pointers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update status.json
 * @param {string} repoRoot - Repository root
 * @param {object} status - Status data
 */
export function updateStatus(repoRoot, status) {
    const statusPath = path.join(repoRoot, PUBLIC_BASE, STATUS_REL_PATH);

    const statusDoc = {
        schema: 'forecast_status_v1',
        status: status.status ?? 'ok',
        reason: status.reason ?? null,
        generated_at: new Date().toISOString(),
        circuit_state: status.circuit_state ?? 'closed',
        last_run: status.last_run ?? null,
        last_good: status.last_good ?? null,
        capabilities: status.capabilities ?? {}
    };

    atomicWriteJson(statusPath, statusDoc);
    console.log(`[Status] Updated ${statusPath}`);
}

/**
 * Update latest.json entry point
 * @param {string} repoRoot - Repository root
 * @param {object} latest - Latest data
 */
export function updateLatest(repoRoot, latest) {
    const latestPath = path.join(repoRoot, PUBLIC_BASE, LATEST_REL_PATH);
    const latestDoc = buildLatestDoc(latest);
    if (!isValidLatestDoc(latestDoc)) {
        throw new Error('Invalid forecast latest envelope; refusing publish');
    }
    atomicWriteJson(latestPath, latestDoc);
    console.log(`[Latest] Updated ${latestPath} with ${(latest.forecasts ?? []).length} forecasts`);
    return latestDoc;
}

/**
 * Load stable last_good envelope
 * @param {string} repoRoot - Repository root
 * @returns {object|null}
 */
export function loadLastGoodEnvelope(repoRoot) {
    const lastGoodEnvelopePath = path.join(repoRoot, PUBLIC_BASE, LAST_GOOD_ENVELOPE_REL_PATH);
    const doc = readJsonIfExists(lastGoodEnvelopePath);
    if (isValidLatestDoc(doc)) return doc;
    return null;
}

/**
 * Publish latest from last_good fallback (or bootstrap if last_good missing)
 * @param {string} repoRoot - Repository root
 * @param {object} options - Fallback options
 * @returns {object} Latest envelope written
 */
export function publishLatestFromLastGood(repoRoot, options = {}) {
    const reason = options.reason ?? 'Fallback to last_good';
    const status = options.status ?? 'circuit_open';
    const fallback = loadLastGoodEnvelope(repoRoot);
    const latestPath = path.join(repoRoot, PUBLIC_BASE, LATEST_REL_PATH);
    const lastGoodPath = path.join(repoRoot, PUBLIC_BASE, LAST_GOOD_POINTER_REL_PATH);
    const lastGoodEnvelopePath = path.join(repoRoot, PUBLIC_BASE, LAST_GOOD_ENVELOPE_REL_PATH);
    const fallbackCount = Array.isArray(fallback?.data?.forecasts) ? fallback.data.forecasts.length : 0;

    const latestDoc = fallback && fallbackCount > 0
        ? {
            ...fallback,
            ok: false,
            generated_at: new Date().toISOString(),
            meta: {
                ...(fallback.meta ?? {}),
                status,
                reason,
                last_good_ref: `public/data/forecast/${LAST_GOOD_ENVELOPE_REL_PATH}`
            }
        }
        : (() => {
            const seed = buildSeedForecastsFromStockAnalysis(repoRoot);
            if (seed.forecasts.length > 0) {
                const seededDoc = buildLatestDoc({
                    ok: false,
                    status,
                    reason,
                    last_good_ref: `public/data/forecast/${LAST_GOOD_ENVELOPE_REL_PATH}`,
                    forecasts: seed.forecasts,
                    maturity_phase: 'BOOTSTRAP',
                    asof: seed.asof
                });
                atomicWriteJson(lastGoodEnvelopePath, seededDoc);
                atomicWriteJson(lastGoodPath, {
                    schema: 'forecast_last_good_v1',
                    last_good_champion_id: null,
                    last_good_latest_report_ref: null,
                    last_good_as_of: new Date().toISOString(),
                    reason: 'seeded_from_stock_analysis'
                });
                return seededDoc;
            }
            return buildLatestDoc({
                ok: false,
                status: 'bootstrap',
                reason: 'No last_good available yet',
                last_good_ref: null,
                forecasts: [],
                maturity_phase: 'BOOTSTRAP',
                asof: null
            });
        })();

    if (!isValidLatestDoc(latestDoc)) {
        throw new Error('Invalid last_good fallback envelope; refusing publish');
    }
    atomicWriteJson(latestPath, latestDoc);
    console.log(`[Latest] Fallback published to ${latestPath}`);
    return latestDoc;
}

/**
 * Update last_good.json pointer
 * @param {string} repoRoot - Repository root
 * @param {object} lastGood - Last good data
 */
export function updateLastGood(repoRoot, lastGood) {
    const lastGoodPath = path.join(repoRoot, PUBLIC_BASE, LAST_GOOD_POINTER_REL_PATH);
    const lastGoodEnvelopePath = path.join(repoRoot, PUBLIC_BASE, LAST_GOOD_ENVELOPE_REL_PATH);
    const candidateEnvelope = lastGood.latest_envelope ?? readJsonIfExists(path.join(repoRoot, PUBLIC_BASE, LATEST_REL_PATH));
    const forecastCount = Array.isArray(candidateEnvelope?.data?.forecasts) ? candidateEnvelope.data.forecasts.length : 0;

    if (forecastCount === 0) {
        console.warn('[LastGood] Skipped update: latest envelope has zero forecasts');
        return;
    }

    const pointerDoc = {
        schema: 'forecast_last_good_v1',
        last_good_champion_id: lastGood.champion_id ?? null,
        last_good_latest_report_ref: lastGood.report_ref ?? null,
        last_good_as_of: lastGood.as_of ?? new Date().toISOString(),
        reason: lastGood.reason ?? null
    };

    atomicWriteJson(lastGoodPath, pointerDoc);

    if (isValidLatestDoc(candidateEnvelope)) {
        atomicWriteJson(lastGoodEnvelopePath, candidateEnvelope);
        console.log(`[LastGood] Updated ${lastGoodEnvelopePath}`);
    } else {
        console.warn(`[LastGood] Skipped ${lastGoodEnvelopePath}: latest envelope missing/invalid`);
    }

    console.log(`[LastGood] Updated ${lastGoodPath}`);
}

export default {
    generateDailyReport,
    writeReport,
    generateScorecards,
    writeScorecards,
    updateStatus,
    updateLatest,
    updateLastGood,
    loadLastGoodEnvelope,
    publishLatestFromLastGood
};
