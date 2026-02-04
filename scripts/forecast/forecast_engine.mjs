/**
 * Forecast System v3.0 — Forecast Engine
 * 
 * Loads champion spec and generates probabilistic forecasts.
 * Implements logistic baseline model with calibration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { computeDigest, canonicalJSON } from '../lib/digest.js';

const POLICY_PATH = 'policies/forecast.v3.json';
const CHAMPION_PATH = 'mirrors/forecast/champion/current.json';

// ─────────────────────────────────────────────────────────────────────────────
// Policy & Champion Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load forecast policy
 * @param {string} repoRoot - Repository root path
 * @returns {object} Policy object
 */
export function loadPolicy(repoRoot) {
    const policyPath = path.join(repoRoot, POLICY_PATH);
    if (!fs.existsSync(policyPath)) {
        throw new Error(`Policy not found: ${policyPath}`);
    }
    const content = fs.readFileSync(policyPath, 'utf8');
    return JSON.parse(content);
}

/**
 * Load champion spec
 * @param {string} repoRoot - Repository root path
 * @returns {object} Champion spec
 */
export function loadChampion(repoRoot) {
    const championPath = path.join(repoRoot, CHAMPION_PATH);
    if (!fs.existsSync(championPath)) {
        throw new Error(`Champion spec not found: ${championPath}`);
    }
    const content = fs.readFileSync(championPath, 'utf8');
    return JSON.parse(content);
}

/**
 * Compute policy hash
 * @param {string} repoRoot - Repository root path
 * @returns {string} SHA256 hash
 */
export function computePolicyHash(repoRoot) {
    const policyPath = path.join(repoRoot, POLICY_PATH);
    const content = fs.readFileSync(policyPath, 'utf8');
    return computeDigest(JSON.parse(content));
}

/**
 * Compute champion spec hash
 * @param {object} spec - Champion spec object
 * @returns {string} SHA256 hash
 */
export function computeChampionHash(spec) {
    return computeDigest(spec);
}

// ─────────────────────────────────────────────────────────────────────────────
// Logistic Model (Baseline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple logistic regression prediction
 * Uses feature weights learned from historical data.
 * 
 * @param {object} features - Feature snapshot
 * @param {object} weights - Model weights (feature -> weight)
 * @returns {number} Raw probability [0, 1]
 */
export function logisticPredict(features, weights = {}) {
    // Default weights (baseline - momentum and trend based)
    const defaultWeights = {
        returns_1d: 0.5,
        returns_5d: 0.3,
        returns_20d: 0.2,
        rsi_14: -0.01, // High RSI slightly negative (overbought)
        dist_to_200d: 0.8,
        is_above_200d: 0.3,
        rs_vs_spy_20d: 0.6,
        vol_regime_low: 0.1,
        vol_regime_high: -0.1,
        trend_regime_up: 0.2,
        trend_regime_down: -0.2
    };

    const w = { ...defaultWeights, ...weights };

    let z = 0; // Intercept = 0 (neutral prior)

    // Add weighted features
    for (const [key, weight] of Object.entries(w)) {
        let featureValue = features[key];

        // Handle regime encoding
        if (key.startsWith('vol_regime_')) {
            const regime = key.replace('vol_regime_', '');
            featureValue = features.vol_regime === regime ? 1 : 0;
        }
        if (key.startsWith('trend_regime_')) {
            const regime = key.replace('trend_regime_', '');
            featureValue = features.trend_regime === regime ? 1 : 0;
        }

        if (Number.isFinite(featureValue)) {
            z += weight * featureValue;
        }
    }

    // Sigmoid
    const p = 1 / (1 + Math.exp(-z));
    return Math.max(0.001, Math.min(0.999, p)); // Clamp to avoid log(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Isotonic calibration (simplified)
 * In production, this would use historical calibration data.
 * 
 * @param {number} rawP - Raw probability
 * @param {object} calibrationData - Historical calibration curve
 * @returns {number} Calibrated probability
 */
export function isotonicCalibrate(rawP, calibrationData = null) {
    // Without historical data, apply a mild shrinkage toward 0.5
    // This is conservative and prevents overconfidence
    if (!calibrationData) {
        const shrinkage = 0.1;
        return rawP * (1 - shrinkage) + 0.5 * shrinkage;
    }

    // With calibration data, interpolate from the calibration curve
    const { bins, calibrated } = calibrationData;
    if (!Array.isArray(bins) || !Array.isArray(calibrated)) {
        return rawP;
    }

    for (let i = 0; i < bins.length - 1; i++) {
        if (rawP >= bins[i] && rawP < bins[i + 1]) {
            // Linear interpolation
            const t = (rawP - bins[i]) / (bins[i + 1] - bins[i]);
            return calibrated[i] * (1 - t) + calibrated[i + 1] * t;
        }
    }

    return rawP;
}

/**
 * Apply neutral band
 * @param {number} p - Probability
 * @param {number} neutralBand - Neutral band width (default 0.03)
 * @returns {{p_up: number, neutral_flag: boolean}}
 */
export function applyNeutralBand(p, neutralBand = 0.03) {
    const neutral_flag = Math.abs(p - 0.5) < neutralBand;
    return { p_up: p, neutral_flag };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute forecast confidence
 * @param {object} params
 * @returns {{conf: number, components: object}}
 */
export function computeConfidence({
    baseConfidence = 1.0,
    reliabilityMultiplier = 1.0,
    eventBucket = 'normal_days',
    recentEce = 0.05,
    disagreementMultiplier = 1.0
}) {
    // Event multiplier: reduce confidence during event windows
    const eventMultiplier = eventBucket === 'event_window' ? 0.7 : 1.0;

    // Calibration multiplier: based on recent ECE
    const calibrationMultiplier = Math.max(0.5, Math.min(1.0, 1 - recentEce * 2));

    // Combine multipliers
    const conf = Math.max(0, Math.min(1,
        baseConfidence *
        reliabilityMultiplier *
        eventMultiplier *
        calibrationMultiplier *
        disagreementMultiplier
    ));

    return {
        conf,
        components: {
            base_confidence: baseConfidence,
            reliability_multiplier: reliabilityMultiplier,
            event_multiplier: eventMultiplier,
            calibration_multiplier: calibrationMultiplier,
            disagreement_multiplier: disagreementMultiplier
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Forecast Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate forecast for a single ticker/horizon
 * @param {object} params
 * @returns {object} Forecast record
 */
export function generateForecast({
    ticker,
    tradingDate,
    horizon,
    featureSnapshot,
    championSpec,
    policyHash,
    codeHash,
    snapshotsManifest,
    provenance = 'live',
    asOf = new Date().toISOString(),
    runId = null,
    reliabilityMultiplier = 1.0,
    recentEce = 0.05,
    calibrationData = null
}) {
    const features = featureSnapshot.features;
    const neutralBand = championSpec.neutral_band ?? 0.03;

    // Raw prediction
    const rawP = logisticPredict(features, null);

    // Calibration
    const calibratedP = championSpec.calibration_method === 'isotonic'
        ? isotonicCalibrate(rawP, calibrationData)
        : rawP;

    // Apply neutral band
    const { p_up, neutral_flag } = applyNeutralBand(calibratedP, neutralBand);

    // Compute confidence
    const { conf, components } = computeConfidence({
        reliabilityMultiplier,
        eventBucket: features.event_bucket ?? 'normal_days',
        recentEce
    });

    // Build forecast record
    const forecastContent = {
        trading_date: tradingDate,
        ticker,
        horizon,
        provenance,
        champion_spec_hash: computeChampionHash(championSpec),
        policy_hash: policyHash,
        feature_snapshot_hash: featureSnapshot.feature_snapshot_hash,
        snapshots_manifest_sha256: snapshotsManifest?.manifest_sha256 ?? null
    };

    const forecastId = computeDigest(canonicalJSON(forecastContent));

    return {
        schema: 'forecast_record_v3',
        forecast_id: forecastId,
        provenance,
        run_id: runId,
        as_of: asOf,
        trading_date: tradingDate,
        ticker,
        horizon,
        champion_id: championSpec.champion_id,
        champion_spec_hash: computeChampionHash(championSpec),
        policy_hash: policyHash,
        code_hash: codeHash,
        snapshots: snapshotsManifest ?? {},
        feature_snapshot_hash: featureSnapshot.feature_snapshot_hash,
        enabled_feature_groups: featureSnapshot.feature_groups_enabled,
        event_flags: {
            event_bucket: features.event_bucket ?? 'normal_days',
            earnings_within_5d: features.earnings_within_5d ?? 0,
            macro_today: features.macro_today ?? 0,
            macro_within_2d: features.macro_within_2d ?? 0
        },
        p_up,
        neutral_flag,
        neutral_band: neutralBand,
        conf,
        conf_components: components,
        capabilities: {
            has_spy: featureSnapshot.features.rs_vs_spy_20d !== null,
            has_qqq: false,
            has_sector_map: false,
            has_earnings: (features.earnings_within_5d ?? 0) !== 0,
            has_macro: (features.macro_today ?? 0) !== 0
        }
    };
}

export default {
    loadPolicy,
    loadChampion,
    computePolicyHash,
    computeChampionHash,
    logisticPredict,
    isotonicCalibrate,
    applyNeutralBand,
    computeConfidence,
    generateForecast
};
