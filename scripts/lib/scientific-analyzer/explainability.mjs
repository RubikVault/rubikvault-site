/**
 * Scientific Stock Analyzer v9.0 - Explainability Module
 * 
 * XAI components for interpretable predictions:
 * - Feature contribution (SHAP-like approximation)
 * - Top positive/negative feature identification
 * - LIME-style local explanations
 * - Counterfactual explanations
 */

/**
 * Compute feature contributions using linear approximation
 * For linear models: contribution = weight * (feature_value - mean)
 * @param {Object} features - Feature values
 * @param {Object} weights - Model weights
 * @param {Object} featureMeans - Mean values from training
 * @returns {Object} Feature contributions
 */
export function computeFeatureContributions(features, weights, featureMeans = {}) {
    const contributions = {};

    for (const [feature, weight] of Object.entries(weights)) {
        const value = features[feature];
        if (value === undefined || value === null || !Number.isFinite(value)) {
            continue;
        }

        const mean = featureMeans[feature] ?? 0;
        contributions[feature] = weight * (value - mean);
    }

    return contributions;
}

/**
 * Get SHAP-style signed contributions
 * @param {Object} features - Feature values
 * @param {Object} weights - Model weights
 * @param {Object} featureMeans - Mean feature values
 * @returns {Object} SHAP-like values
 */
export function computeSHAPValues(features, weights, featureMeans = {}) {
    const contributions = computeFeatureContributions(features, weights, featureMeans);

    // Normalize to sum to prediction - base
    const total = Object.values(contributions).reduce((a, b) => a + b, 0);

    if (Math.abs(total) < 0.0001) {
        return contributions;
    }

    // Return as-is for linear models (already SHAP-consistent)
    return contributions;
}

/**
 * Get top positive and negative contributors
 * @param {Object} contributions - Feature contributions
 * @param {number} topN - Number of top features
 * @returns {Object} Top positive and negative features
 */
export function getTopContributors(contributions, topN = 3) {
    const entries = Object.entries(contributions)
        .filter(([_, v]) => Number.isFinite(v))
        .sort((a, b) => b[1] - a[1]);

    const positive = entries
        .filter(([_, v]) => v > 0)
        .slice(0, topN)
        .map(([feature, value]) => ({ feature, contribution: value }));

    const negative = entries
        .filter(([_, v]) => v < 0)
        .slice(-topN)
        .reverse()
        .map(([feature, value]) => ({ feature, contribution: value }));

    return { positive, negative };
}

/**
 * Generate LIME-style local explanation
 * Identifies which features push prediction up or down
 * @param {Object} features - Feature values
 * @param {Object} weights - Model weights
 * @returns {Object} Local explanation
 */
export function generateLIMEExplanation(features, weights) {
    const positive = [];
    const negative = [];

    for (const [feature, weight] of Object.entries(weights)) {
        const value = features[feature];
        if (value === undefined || !Number.isFinite(value)) continue;

        const impact = weight * value;

        if (impact > 0.01) {
            positive.push(feature);
        } else if (impact < -0.01) {
            negative.push(feature);
        }
    }

    return { positive, negative };
}

/**
 * Generate counterfactual explanations
 * Shows how changing key features would affect prediction
 * @param {Object} features - Current feature values
 * @param {Object} weights - Model weights
 * @param {number} bias - Model bias
 * @param {Object} options - Counterfactual options
 * @returns {Object} Counterfactual explanations
 */
export function generateCounterfactuals(features, weights, bias = 0, options = {}) {
    const {
        targetProbChange = 0.1,
        topK = 3
    } = options;

    const counterfactuals = {};

    // Current logit
    let currentLogit = bias;
    for (const [feature, weight] of Object.entries(weights)) {
        const value = features[feature];
        if (Number.isFinite(value)) {
            currentLogit += weight * value;
        }
    }

    const currentProb = sigmoid(currentLogit);

    // Find features that could flip/change the prediction
    const sortedFeatures = Object.entries(weights)
        .map(([feature, weight]) => ({
            feature,
            weight,
            value: features[feature] ?? 0,
            absWeight: Math.abs(weight)
        }))
        .filter(f => Number.isFinite(f.value))
        .sort((a, b) => b.absWeight - a.absWeight)
        .slice(0, topK);

    for (const { feature, weight, value } of sortedFeatures) {
        if (weight === 0) continue;

        // How much would feature need to change to shift prob by targetProbChange?
        const targetLogitChange = targetProbChange * 4; // Approx for sigmoid
        const neededChange = targetLogitChange / weight;
        const newValue = value + neededChange;

        // Calculate new probability
        const newLogit = currentLogit + weight * neededChange;
        const newProb = sigmoid(newLogit);
        const probChange = newProb - currentProb;

        counterfactuals[`if_${feature}_changed`] = {
            from: value,
            to: newValue,
            changeNeeded: neededChange,
            probChange: probChange,
            newProb: newProb
        };

        // Add simple scenario descriptions
        if (feature === 'vix_level' || feature === 'volatility_20d') {
            counterfactuals[`if_${feature}_lower`] = {
                probChange: -weight * (value * 0.2) > 0 ? 0.05 : -0.05
            };
        }

        if (feature === 'rsi_14') {
            counterfactuals['if_rsi_more_extreme'] = {
                probChange: value > 50
                    ? weight * 10 > 0 ? 0.03 : -0.03
                    : weight * 10 < 0 ? 0.03 : -0.03
            };
        }
    }

    return counterfactuals;
}

/**
 * Sigmoid activation function
 * @param {number} x - Input
 * @returns {number} Sigmoid(x)
 */
function sigmoid(x) {
    if (x > 700) return 1;
    if (x < -700) return 0;
    return 1 / (1 + Math.exp(-x));
}

/**
 * Generate full explainability report
 * @param {Object} features - Feature values
 * @param {Object} weights - Model weights
 * @param {number} bias - Model bias
 * @param {Object} featureMeans - Training means
 * @returns {Object} Complete explanation
 */
export function generateExplainabilityReport(features, weights, bias = 0, featureMeans = {}) {
    const shapValues = computeSHAPValues(features, weights, featureMeans);
    const topContributors = getTopContributors(shapValues, 5);
    const limeExplanation = generateLIMEExplanation(features, weights);
    const counterfactuals = generateCounterfactuals(features, weights, bias);

    return {
        shap_values: shapValues,
        top_features: [
            ...topContributors.positive.map(f => f.feature),
            ...topContributors.negative.map(f => f.feature)
        ].slice(0, 5),
        top_positive: topContributors.positive,
        top_negative: topContributors.negative,
        lime_explanations: limeExplanation,
        counterfactuals
    };
}

/**
 * Format explanation for UI display
 * @param {Object} explanation - From generateExplainabilityReport
 * @returns {Object} UI-friendly format
 */
export function formatExplanationForUI(explanation) {
    return {
        topFeatures: explanation.top_features,
        shapValues: Object.fromEntries(
            Object.entries(explanation.shap_values)
                .filter(([_, v]) => Math.abs(v) > 0.01)
                .map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        limeExplanations: {
            positive: explanation.lime_explanations.positive.slice(0, 3),
            negative: explanation.lime_explanations.negative.slice(0, 3)
        },
        counterfactuals: Object.fromEntries(
            Object.entries(explanation.counterfactuals)
                .filter(([k]) => k.includes('lower') || k.includes('extreme'))
                .map(([k, v]) => [k, { probChange: Math.round((v.probChange || 0) * 100) / 100 }])
        )
    };
}
