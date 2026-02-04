/**
 * Forecast System v3.0 — Evaluator
 * 
 * Evaluates forecast outcomes and computes metrics.
 * Implements Brier, LogLoss, ECE, Sharpness, and Skill vs Baseline.
 */

import { computeDigest } from '../lib/digest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Outcome Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute binary outcome (y = 1 if price went up)
 * @param {number} priceAtForecast - Price at forecast date
 * @param {number} priceAtOutcome - Price at outcome date
 * @returns {number} 0 or 1
 */
export function computeOutcome(priceAtForecast, priceAtOutcome) {
    if (!Number.isFinite(priceAtForecast) || !Number.isFinite(priceAtOutcome)) {
        return null;
    }
    return priceAtOutcome > priceAtForecast ? 1 : 0;
}

/**
 * Create outcome record from forecast
 * @param {object} forecast - Forecast record
 * @param {number} y - Outcome (0 or 1)
 * @param {string} outcomeTradingDate - Date outcome realized
 * @returns {object} Outcome record
 */
export function createOutcomeRecord(forecast, y, outcomeTradingDate) {
    const brier = (forecast.p_up - y) ** 2;
    const pClamped = Math.max(1e-6, Math.min(1 - 1e-6, forecast.p_up));
    const logloss = -(y * Math.log(pClamped) + (1 - y) * Math.log(1 - pClamped));

    const outcomeContent = `${forecast.forecast_id}|${y}|${outcomeTradingDate}`;
    const outcomeId = computeDigest(outcomeContent);

    return {
        schema: 'outcome_record_v3',
        outcome_id: outcomeId,
        provenance: forecast.provenance,
        forecast_id: forecast.forecast_id,
        ticker: forecast.ticker,
        horizon: forecast.horizon,
        forecast_trading_date: forecast.trading_date,
        outcome_trading_date: outcomeTradingDate,
        y,
        p_up: forecast.p_up,
        neutral_flag: forecast.neutral_flag,
        conf: forecast.conf,
        event_bucket: forecast.event_flags?.event_bucket ?? 'normal_days',
        metrics: {
            brier,
            logloss
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Aggregations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute mean Brier score
 * @param {object[]} outcomes - Outcome records
 * @returns {number|null}
 */
export function computeBrier(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;
    const sum = outcomes.reduce((acc, o) => acc + o.metrics.brier, 0);
    return sum / outcomes.length;
}

/**
 * Compute mean LogLoss
 * @param {object[]} outcomes - Outcome records
 * @returns {number|null}
 */
export function computeLogLoss(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;
    const sum = outcomes.reduce((acc, o) => acc + o.metrics.logloss, 0);
    return sum / outcomes.length;
}

/**
 * Compute Expected Calibration Error (ECE)
 * Uses 10 fixed bins
 * @param {object[]} outcomes - Outcome records
 * @returns {number|null}
 */
export function computeECE(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;

    const numBins = 10;
    const bins = Array(numBins).fill(null).map(() => ({ count: 0, sumP: 0, sumY: 0 }));

    for (const outcome of outcomes) {
        const binIdx = Math.min(numBins - 1, Math.floor(outcome.p_up * numBins));
        bins[binIdx].count++;
        bins[binIdx].sumP += outcome.p_up;
        bins[binIdx].sumY += outcome.y;
    }

    let ece = 0;
    const n = outcomes.length;

    for (const bin of bins) {
        if (bin.count === 0) continue;
        const avgP = bin.sumP / bin.count;
        const avgY = bin.sumY / bin.count;
        ece += (bin.count / n) * Math.abs(avgP - avgY);
    }

    return ece;
}

/**
 * Compute Sharpness (mean distance from 0.5)
 * @param {object[]} outcomes - Outcome records
 * @returns {number|null}
 */
export function computeSharpness(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;
    const sum = outcomes.reduce((acc, o) => acc + Math.abs(o.p_up - 0.5), 0);
    return sum / outcomes.length;
}

/**
 * Compute Neutral Rate (fraction of neutral forecasts)
 * @param {object[]} outcomes - Outcome records
 * @returns {number|null}
 */
export function computeNeutralRate(outcomes) {
    if (!outcomes || outcomes.length === 0) return null;
    const neutral = outcomes.filter(o => o.neutral_flag).length;
    return neutral / outcomes.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline & Skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute baseline probability using regime-adaptive hit rate
 * @param {object[]} historicalOutcomes - Historical outcomes for calibration
 * @param {string} segment - Segment key (e.g., "1d_low_up_normal_days")
 * @param {object} laplaceSmoothingParams - {alpha, beta}
 * @returns {number}
 */
export function computeBaselineProbability(historicalOutcomes, segment = null, laplaceSmoothingParams = { alpha: 1, beta: 1 }) {
    let filtered = historicalOutcomes;

    // Filter by segment if provided (simplified - in production would parse segment key)
    if (segment) {
        // For now, use all outcomes
    }

    if (!filtered || filtered.length === 0) {
        return 0.5; // No data, return neutral
    }

    const successes = filtered.filter(o => o.y === 1).length;
    const n = filtered.length;
    const { alpha, beta } = laplaceSmoothingParams;

    return (successes + alpha) / (n + alpha + beta);
}

/**
 * Compute baseline Brier score
 * @param {object[]} outcomes - Outcomes to evaluate
 * @param {number} baselineP - Baseline probability
 * @returns {number|null}
 */
export function computeBaselineBrier(outcomes, baselineP) {
    if (!outcomes || outcomes.length === 0) return null;
    const sum = outcomes.reduce((acc, o) => acc + (baselineP - o.y) ** 2, 0);
    return sum / outcomes.length;
}

/**
 * Compute Brier Skill Score vs baseline
 * @param {number} modelBrier - Model Brier score
 * @param {number} baselineBrier - Baseline Brier score
 * @param {number} floor - Minimum baseline value to avoid division issues
 * @returns {number|null}
 */
export function computeBrierSkill(modelBrier, baselineBrier, floor = 0.001) {
    if (modelBrier === null || baselineBrier === null) return null;
    const effectiveBaseline = Math.max(baselineBrier, floor);
    return 1 - (modelBrier / effectiveBaseline);
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment-based Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate outcomes by segment
 * @param {object[]} outcomes - Outcome records
 * @param {object[]} historicalOutcomes - Historical outcomes for baseline
 * @param {object} policy - Forecast policy
 * @returns {object} Metrics by segment
 */
export function evaluateBySegment(outcomes, historicalOutcomes = [], policy = {}) {
    const floor = policy?.math_safety?.brier_baseline_floor ?? 0.001;

    // Group by horizon × event_bucket
    const segments = {};

    for (const outcome of outcomes) {
        const key = `${outcome.horizon}_${outcome.event_bucket}`;
        if (!segments[key]) {
            segments[key] = [];
        }
        segments[key].push(outcome);
    }

    const results = {};

    for (const [key, segmentOutcomes] of Object.entries(segments)) {
        const [horizon, bucket] = key.split('_');

        const brier = computeBrier(segmentOutcomes);
        const logloss = computeLogLoss(segmentOutcomes);
        const ece = computeECE(segmentOutcomes);
        const sharpness = computeSharpness(segmentOutcomes);
        const neutralRate = computeNeutralRate(segmentOutcomes);

        // Baseline
        const baselineP = computeBaselineProbability(historicalOutcomes, key);
        const baselineBrier = computeBaselineBrier(segmentOutcomes, baselineP);
        const brierSkill = computeBrierSkill(brier, baselineBrier, floor);

        results[key] = {
            horizon,
            event_bucket: bucket,
            sample_count: segmentOutcomes.length,
            brier,
            logloss,
            ece,
            sharpness,
            neutral_rate: neutralRate,
            baseline_p: baselineP,
            baseline_brier: baselineBrier,
            brier_skill: brierSkill
        };
    }

    return results;
}

/**
 * Compute global metrics (all horizons combined)
 * @param {object[]} outcomes - Outcome records
 * @param {object[]} historicalOutcomes - Historical outcomes for baseline
 * @param {object} policy - Forecast policy
 * @returns {object} Global metrics
 */
export function computeGlobalMetrics(outcomes, historicalOutcomes = [], policy = {}) {
    const bySegment = evaluateBySegment(outcomes, historicalOutcomes, policy);
    const horizons = [...new Set(outcomes.map(o => o.horizon))];

    const result = {
        by_horizon: {}
    };

    for (const horizon of horizons) {
        const normalKey = `${horizon}_normal_days`;
        const eventKey = `${horizon}_event_window`;

        const normalMetrics = bySegment[normalKey] || null;
        const eventMetrics = bySegment[eventKey] || null;

        // Combined metrics for this horizon
        const horizonOutcomes = outcomes.filter(o => o.horizon === horizon);
        const combined = {
            sample_count: horizonOutcomes.length,
            brier: computeBrier(horizonOutcomes),
            logloss: computeLogLoss(horizonOutcomes),
            ece: computeECE(horizonOutcomes),
            sharpness: computeSharpness(horizonOutcomes),
            neutral_rate: computeNeutralRate(horizonOutcomes),
            brier_skill: null // Would need baseline computation
        };

        result.by_horizon[horizon] = {
            normal_days: normalMetrics,
            event_window: eventMetrics,
            combined
        };
    }

    return result;
}

export default {
    computeOutcome,
    createOutcomeRecord,
    computeBrier,
    computeLogLoss,
    computeECE,
    computeSharpness,
    computeNeutralRate,
    computeBaselineProbability,
    computeBaselineBrier,
    computeBrierSkill,
    evaluateBySegment,
    computeGlobalMetrics
};
