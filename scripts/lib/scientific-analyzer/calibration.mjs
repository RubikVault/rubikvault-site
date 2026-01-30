/**
 * Scientific Stock Analyzer v9.0 - Calibration Module
 * 
 * Probability calibration for reliable confidence estimates:
 * - Isotonic regression for bin-wise calibration
 * - Platt scaling (sigmoid calibration)
 * - Expected Calibration Error (ECE) metric
 * - Calibration curve generation
 */

/**
 * Compute Expected Calibration Error (ECE)
 * @param {number[]} probabilities - Predicted probabilities
 * @param {number[]} labels - True binary labels (0/1)
 * @param {number} nBins - Number of bins (default 10)
 * @returns {number} ECE value
 */
export function computeECE(probabilities, labels, nBins = 10) {
    if (!probabilities.length || probabilities.length !== labels.length) {
        return null;
    }

    const bins = Array.from({ length: nBins }, () => ({ probs: [], labels: [] }));

    for (let i = 0; i < probabilities.length; i++) {
        const p = probabilities[i];
        const binIdx = Math.min(Math.floor(p * nBins), nBins - 1);
        bins[binIdx].probs.push(p);
        bins[binIdx].labels.push(labels[i]);
    }

    let ece = 0;
    const n = probabilities.length;

    for (const bin of bins) {
        if (bin.probs.length === 0) continue;

        const avgProb = bin.probs.reduce((a, b) => a + b, 0) / bin.probs.length;
        const avgLabel = bin.labels.reduce((a, b) => a + b, 0) / bin.labels.length;
        const weight = bin.probs.length / n;

        ece += weight * Math.abs(avgProb - avgLabel);
    }

    return ece;
}

/**
 * Build calibration curve for visualization
 * @param {number[]} probabilities - Predicted probabilities
 * @param {number[]} labels - True binary labels (0/1)
 * @param {number} nBins - Number of bins (default 10)
 * @returns {Object} Calibration curve data
 */
export function buildCalibrationCurve(probabilities, labels, nBins = 10) {
    if (!probabilities.length || probabilities.length !== labels.length) {
        return null;
    }

    const bins = Array.from({ length: nBins }, (_, i) => ({
        binCenter: (i + 0.5) / nBins,
        probs: [],
        labels: []
    }));

    for (let i = 0; i < probabilities.length; i++) {
        const p = probabilities[i];
        const binIdx = Math.min(Math.floor(p * nBins), nBins - 1);
        bins[binIdx].probs.push(p);
        bins[binIdx].labels.push(labels[i]);
    }

    const curve = bins.map(bin => ({
        binCenter: bin.binCenter,
        meanPredicted: bin.probs.length > 0
            ? bin.probs.reduce((a, b) => a + b, 0) / bin.probs.length
            : null,
        meanActual: bin.labels.length > 0
            ? bin.labels.reduce((a, b) => a + b, 0) / bin.labels.length
            : null,
        count: bin.probs.length
    })).filter(b => b.count > 0);

    return {
        curve,
        ece: computeECE(probabilities, labels, nBins),
        nSamples: probabilities.length
    };
}

/**
 * Fit isotonic regression for probability calibration
 * Simplified piecewise-linear monotonic regression
 * @param {number[]} probabilities - Uncalibrated probabilities
 * @param {number[]} labels - True binary labels
 * @returns {Object} Calibration model
 */
export function fitIsotonicRegression(probabilities, labels) {
    if (!probabilities.length || probabilities.length !== labels.length) {
        return null;
    }

    // Sort by probability
    const pairs = probabilities.map((p, i) => ({ p, label: labels[i] }))
        .sort((a, b) => a.p - b.p);

    // Pool adjacent violators algorithm (PAVA) - simplified
    const blocks = pairs.map(pair => ({
        sumLabel: pair.label,
        count: 1,
        minP: pair.p,
        maxP: pair.p
    }));

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < blocks.length - 1; i++) {
            const avg1 = blocks[i].sumLabel / blocks[i].count;
            const avg2 = blocks[i + 1].sumLabel / blocks[i + 1].count;

            if (avg1 > avg2) {
                // Merge blocks
                blocks[i] = {
                    sumLabel: blocks[i].sumLabel + blocks[i + 1].sumLabel,
                    count: blocks[i].count + blocks[i + 1].count,
                    minP: blocks[i].minP,
                    maxP: blocks[i + 1].maxP
                };
                blocks.splice(i + 1, 1);
                changed = true;
                break;
            }
        }
    }

    // Build lookup table
    const calibrationPoints = blocks.map(b => ({
        pMin: b.minP,
        pMax: b.maxP,
        calibratedValue: b.sumLabel / b.count
    }));

    return {
        type: 'isotonic',
        points: calibrationPoints,
        trainingSamples: probabilities.length
    };
}

/**
 * Apply isotonic calibration to probability
 * @param {number} prob - Uncalibrated probability
 * @param {Object} model - Isotonic model from fitIsotonicRegression
 * @returns {number} Calibrated probability
 */
export function applyIsotonicCalibration(prob, model) {
    if (!model || !model.points || model.points.length === 0) {
        return prob;
    }

    // Find matching block
    for (const point of model.points) {
        if (prob >= point.pMin && prob <= point.pMax) {
            return point.calibratedValue;
        }
    }

    // Extrapolate using nearest block
    if (prob < model.points[0].pMin) {
        return model.points[0].calibratedValue;
    }
    if (prob > model.points[model.points.length - 1].pMax) {
        return model.points[model.points.length - 1].calibratedValue;
    }

    // Linear interpolation between blocks
    for (let i = 0; i < model.points.length - 1; i++) {
        if (prob > model.points[i].pMax && prob < model.points[i + 1].pMin) {
            const ratio = (prob - model.points[i].pMax) /
                (model.points[i + 1].pMin - model.points[i].pMax);
            return model.points[i].calibratedValue +
                ratio * (model.points[i + 1].calibratedValue - model.points[i].calibratedValue);
        }
    }

    return prob;
}

/**
 * Fit Platt scaling (sigmoid calibration)
 * P_calibrated = 1 / (1 + exp(A * logit + B))
 * @param {number[]} probabilities - Uncalibrated probabilities
 * @param {number[]} labels - True binary labels
 * @returns {Object} Platt scaling parameters
 */
export function fitPlattScaling(probabilities, labels) {
    if (!probabilities.length || probabilities.length !== labels.length) {
        return { A: 1, B: 0 };
    }

    // Convert to logits
    const logits = probabilities.map(p => {
        const clipped = Math.max(0.001, Math.min(0.999, p));
        return Math.log(clipped / (1 - clipped));
    });

    // Simple gradient descent for A and B
    let A = 1.0;
    let B = 0.0;
    const lr = 0.01;
    const iterations = 1000;

    for (let iter = 0; iter < iterations; iter++) {
        let gradA = 0;
        let gradB = 0;

        for (let i = 0; i < logits.length; i++) {
            const pred = 1 / (1 + Math.exp(-(A * logits[i] + B)));
            const error = pred - labels[i];
            gradA += error * logits[i];
            gradB += error;
        }

        A -= lr * gradA / logits.length;
        B -= lr * gradB / logits.length;
    }

    return { A, B };
}

/**
 * Apply Platt scaling calibration
 * @param {number} prob - Uncalibrated probability
 * @param {Object} params - { A, B } from fitPlattScaling
 * @returns {number} Calibrated probability
 */
export function applyPlattScaling(prob, params) {
    const { A = 1, B = 0 } = params || {};
    const clipped = Math.max(0.001, Math.min(0.999, prob));
    const logit = Math.log(clipped / (1 - clipped));
    return 1 / (1 + Math.exp(-(A * logit + B)));
}

/**
 * Compute confidence intervals for probability bins
 * @param {number[]} probabilities - Predicted probabilities
 * @param {number[]} labels - True labels
 * @param {number} nBins - Number of bins
 * @returns {Object} Confidence intervals per bin
 */
export function computeConfidenceIntervals(probabilities, labels, nBins = 10) {
    const bins = Array.from({ length: nBins }, () => []);

    for (let i = 0; i < probabilities.length; i++) {
        const binIdx = Math.min(Math.floor(probabilities[i] * nBins), nBins - 1);
        bins[binIdx].push(labels[i]);
    }

    const intervals = {};

    for (let i = 0; i < nBins; i++) {
        const binCenter = (i + 0.5) / nBins;
        const binLabels = bins[i];

        if (binLabels.length < 2) {
            intervals[`bin_${binCenter.toFixed(2)}`] = null;
            continue;
        }

        const mean = binLabels.reduce((a, b) => a + b, 0) / binLabels.length;
        const variance = binLabels.reduce((sum, v) => sum + (v - mean) ** 2, 0) / binLabels.length;
        const std = Math.sqrt(variance);
        const se = std / Math.sqrt(binLabels.length);

        // 95% CI using normal approximation
        const ci95 = 1.96 * se;

        intervals[`bin_${binCenter.toFixed(2)}`] = [
            Math.max(0, mean - ci95),
            Math.min(1, mean + ci95)
        ];
    }

    return intervals;
}
