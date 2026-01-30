/**
 * Scientific Stock Analyzer v9.0 - Drift Detection Module
 * 
 * Monitor model stability and detect distribution drift:
 * - PSI (Population Stability Index)
 * - KL Divergence (Kullback-Leibler)
 * - KS Test (Kolmogorov-Smirnov)
 * - PELT change-point detection (simplified)
 */

/**
 * Compute Population Stability Index (PSI)
 * Measures shift in distribution between reference and current data
 * PSI < 0.1: No significant change
 * PSI 0.1-0.25: Moderate change
 * PSI > 0.25: Significant change, consider retraining
 * 
 * @param {number[]} reference - Reference distribution (training data)
 * @param {number[]} current - Current distribution (inference data)
 * @param {number} nBins - Number of bins (default 10)
 * @returns {Object} PSI result
 */
export function computePSI(reference, current, nBins = 10) {
    if (!reference.length || !current.length) {
        return { psi: null, status: 'INSUFFICIENT_DATA' };
    }

    // Find global min/max for consistent binning
    const allValues = [...reference, ...current];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    // Create bins
    const refBins = new Array(nBins).fill(0);
    const curBins = new Array(nBins).fill(0);

    for (const v of reference) {
        const binIdx = Math.min(Math.floor((v - min) / range * nBins), nBins - 1);
        refBins[binIdx]++;
    }

    for (const v of current) {
        const binIdx = Math.min(Math.floor((v - min) / range * nBins), nBins - 1);
        curBins[binIdx]++;
    }

    // Convert to proportions with smoothing
    const epsilon = 0.0001;
    const refProbs = refBins.map(c => (c + epsilon) / (reference.length + nBins * epsilon));
    const curProbs = curBins.map(c => (c + epsilon) / (current.length + nBins * epsilon));

    // Compute PSI
    let psi = 0;
    for (let i = 0; i < nBins; i++) {
        const diff = curProbs[i] - refProbs[i];
        const ratio = Math.log(curProbs[i] / refProbs[i]);
        psi += diff * ratio;
    }

    let status = 'STABLE';
    if (psi > 0.25) status = 'SIGNIFICANT_DRIFT';
    else if (psi > 0.1) status = 'MODERATE_DRIFT';

    return { psi, status, nBins };
}

/**
 * Compute KL Divergence between two distributions
 * @param {number[]} p - Reference distribution (probabilities)
 * @param {number[]} q - Current distribution (probabilities)
 * @returns {number} KL divergence
 */
export function computeKLDivergence(p, q) {
    if (p.length !== q.length || p.length === 0) return null;

    const epsilon = 1e-10;
    let kl = 0;

    for (let i = 0; i < p.length; i++) {
        const pi = Math.max(p[i], epsilon);
        const qi = Math.max(q[i], epsilon);
        kl += pi * Math.log(pi / qi);
    }

    return kl;
}

/**
 * Compute KL Divergence from raw values
 * @param {number[]} reference - Reference values
 * @param {number[]} current - Current values
 * @param {number} nBins - Number of bins
 * @returns {Object} KL divergence result
 */
export function computeKLFromValues(reference, current, nBins = 10) {
    if (!reference.length || !current.length) {
        return { kl: null, status: 'INSUFFICIENT_DATA' };
    }

    const allValues = [...reference, ...current];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    const refBins = new Array(nBins).fill(0);
    const curBins = new Array(nBins).fill(0);

    for (const v of reference) {
        const binIdx = Math.min(Math.floor((v - min) / range * nBins), nBins - 1);
        refBins[binIdx]++;
    }

    for (const v of current) {
        const binIdx = Math.min(Math.floor((v - min) / range * nBins), nBins - 1);
        curBins[binIdx]++;
    }

    const epsilon = 0.0001;
    const refProbs = refBins.map(c => (c + epsilon) / (reference.length + nBins * epsilon));
    const curProbs = curBins.map(c => (c + epsilon) / (current.length + nBins * epsilon));

    const kl = computeKLDivergence(refProbs, curProbs);

    let status = 'STABLE';
    if (kl > 0.10) status = 'SIGNIFICANT_DRIFT';
    else if (kl > 0.05) status = 'MODERATE_DRIFT';

    return { kl, status };
}

/**
 * Compute Kolmogorov-Smirnov test statistic
 * @param {number[]} sample1 - First sample
 * @param {number[]} sample2 - Second sample
 * @returns {Object} KS test result
 */
export function computeKSTest(sample1, sample2) {
    if (!sample1.length || !sample2.length) {
        return { ks: null, status: 'INSUFFICIENT_DATA' };
    }

    // Sort samples
    const sorted1 = [...sample1].sort((a, b) => a - b);
    const sorted2 = [...sample2].sort((a, b) => a - b);

    // Combine and sort all values
    const combined = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);

    let maxDiff = 0;

    for (const x of combined) {
        // CDF of sample 1
        const cdf1 = sorted1.filter(v => v <= x).length / sorted1.length;
        // CDF of sample 2
        const cdf2 = sorted2.filter(v => v <= x).length / sorted2.length;

        maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
    }

    // Critical value approximation for alpha=0.05
    const n1 = sample1.length;
    const n2 = sample2.length;
    const criticalValue = 1.36 * Math.sqrt((n1 + n2) / (n1 * n2));

    const significant = maxDiff > criticalValue;

    let status = 'STABLE';
    if (maxDiff > 0.20) status = 'SIGNIFICANT_DRIFT';
    else if (maxDiff > 0.10) status = 'MODERATE_DRIFT';

    return {
        ks: maxDiff,
        criticalValue,
        significant,
        status
    };
}

/**
 * Simplified PELT (Pruned Exact Linear Time) change-point detection
 * Detects points where the distribution changes
 * @param {number[]} values - Time series values
 * @param {number} penalty - Penalty for adding change points
 * @returns {Object} Change points
 */
export function detectChangePoints(values, penalty = 10) {
    if (!values.length || values.length < 10) {
        return { changePoints: [], count: 0 };
    }

    const n = values.length;
    const minSegmentLength = 5;

    // Simplified: look for mean shifts in windows
    const changePoints = [];
    const windowSize = Math.max(10, Math.floor(n / 10));

    for (let i = windowSize; i < n - windowSize; i += windowSize) {
        const leftWindow = values.slice(i - windowSize, i);
        const rightWindow = values.slice(i, i + windowSize);

        const leftMean = leftWindow.reduce((a, b) => a + b, 0) / leftWindow.length;
        const rightMean = rightWindow.reduce((a, b) => a + b, 0) / rightWindow.length;

        const leftVar = leftWindow.reduce((s, v) => s + (v - leftMean) ** 2, 0) / leftWindow.length;
        const rightVar = rightWindow.reduce((s, v) => s + (v - rightMean) ** 2, 0) / rightWindow.length;

        const pooledStd = Math.sqrt((leftVar + rightVar) / 2) || 1;
        const tStat = Math.abs(leftMean - rightMean) / (pooledStd * Math.sqrt(2 / windowSize));

        // Simple threshold for significance
        if (tStat > 2.0) {
            changePoints.push({
                index: i,
                tStatistic: tStat,
                leftMean,
                rightMean
            });
        }
    }

    return { changePoints, count: changePoints.length };
}

/**
 * Comprehensive drift report
 * @param {number[]} reference - Reference distribution
 * @param {number[]} current - Current distribution
 * @returns {Object} Drift report
 */
export function computeDriftReport(reference, current) {
    const psiResult = computePSI(reference, current);
    const klResult = computeKLFromValues(reference, current);
    const ksResult = computeKSTest(reference, current);
    const changePoints = detectChangePoints(current);

    // Overall status
    const statuses = [psiResult.status, klResult.status, ksResult.status];
    let overallStatus = 'STABLE';

    if (statuses.includes('SIGNIFICANT_DRIFT')) {
        overallStatus = 'SIGNIFICANT_DRIFT';
    } else if (statuses.includes('MODERATE_DRIFT')) {
        overallStatus = 'MODERATE_DRIFT';
    }

    // Recommendation
    let recommendation = 'NO_ACTION';
    if (overallStatus === 'SIGNIFICANT_DRIFT') {
        recommendation = 'RETRAIN_MODEL';
    } else if (overallStatus === 'MODERATE_DRIFT' || changePoints.count > 3) {
        recommendation = 'RECALIBRATE';
    }

    return {
        psi: psiResult.psi,
        kl: klResult.kl,
        ks: ksResult.ks,
        changePoints: changePoints.count,
        status: overallStatus,
        recommendation,
        details: {
            psi: psiResult,
            kl: klResult,
            ks: ksResult,
            pelt: changePoints
        }
    };
}
