/**
 * RUNBLOCK v3.0 — Layer 2: Regime Detection
 *
 * All model behavior must be regime-aware.
 * No model may train or validate without regime tags.
 */

/**
 * Fast daily regime signal evaluation.
 *
 * @param {Object} marketData - { vix, vix_prev, sp500_5d_return, hy_spread_delta_bp }
 * @param {Object} [config] - From regime-config.v3.json
 * @returns {{ regime: 'NORMAL'|'STRESS'|'REGIME_SHIFT', breached: string[], confidence: number }}
 */
export function evaluateFastRegime(marketData, config = {}) {
  const thresholds = config.fast_regime?.thresholds || {
    vix_stress: 25,
    vix_delta_stress: 5,
    sp500_5d_drawdown_pct: 4.0,
    hy_spread_delta_bp: 10,
  };

  const breached = [];

  if (marketData.vix > thresholds.vix_stress) breached.push('VIX');
  if (marketData.vix - (marketData.vix_prev || 0) > thresholds.vix_delta_stress) breached.push('VIX_DELTA');
  if (Math.abs(marketData.sp500_5d_return || 0) > thresholds.sp500_5d_drawdown_pct) breached.push('SP500_DRAWDOWN');
  if ((marketData.hy_spread_delta_bp || 0) > thresholds.hy_spread_delta_bp) breached.push('HY_SPREAD');

  if (breached.length === 0) {
    return { regime: 'NORMAL', breached, confidence: 0.9 };
  }

  const severity = config.fast_regime?.severity_mapping || {};
  const regime = breached.length >= 2
    ? (severity.multi_breach || 'REGIME_SHIFT')
    : (severity.single_breach || 'STRESS');

  return {
    regime,
    breached,
    confidence: regime === 'REGIME_SHIFT' ? 0.85 : 0.7,
  };
}

// ═══════════════════════════════════════════════════════════════
// FIX #1: Weekly Full Regime Model (Spec 3.2)
// KMeans-based clustering with confidence fallback.
// If confidence < min_confidence → fallback_used = true, Global State = YELLOW min.
// If model fails completely → deterministic fallback, Global State = ORANGE min.
// ═══════════════════════════════════════════════════════════════

/**
 * Weekly full regime classification (KMeans or equivalent robust clustering).
 *
 * @param {Array} featureVectors - Array of { vix, sp500_ret, hy_spread, vol_10d, ... } for recent period
 * @param {Object} [config] - From regime-config.v3.json
 * @returns {{ regime_tag: string, regime_confidence: number, regime_version: string,
 *             shift_detected: boolean, fallback_used: boolean, fallback_reason: string|null,
 *             min_global_state: string|null }}
 */
export function evaluateWeeklyRegime(featureVectors, config = {}) {
  const weeklyConfig = config.weekly_regime || {
    model: 'kmeans',
    min_confidence: 0.50,
    fallback_regime: 'RANGE',
    fallback_global_state: 'YELLOW',
    model_fail_global_state: 'ORANGE',
  };
  const minConfidence = weeklyConfig.min_confidence;
  const regimeVersion = config.schema_version || 'runblock.v3';

  // Guard: no data → complete model failure → deterministic fallback
  if (!featureVectors || featureVectors.length === 0) {
    return {
      regime_tag: weeklyConfig.fallback_regime,
      regime_confidence: 0,
      regime_version: regimeVersion,
      shift_detected: false,
      fallback_used: true,
      fallback_reason: 'MODEL_FAIL_NO_DATA',
      min_global_state: weeklyConfig.model_fail_global_state,
    };
  }

  // ── KMeans-style deterministic regime classification ──
  // Uses threshold-based centroid distances as a robust, reproducible proxy.
  // In production, replace with actual KMeans model output.
  const latest = featureVectors[featureVectors.length - 1];
  const { regime_tag, confidence } = _kmeansProxyClassify(latest, weeklyConfig);

  // Confidence below minimum → fallback
  if (confidence < minConfidence) {
    return {
      regime_tag: weeklyConfig.fallback_regime,
      regime_confidence: confidence,
      regime_version: regimeVersion,
      shift_detected: false,
      fallback_used: true,
      fallback_reason: `CONFIDENCE_BELOW_MIN:${confidence.toFixed(3)}<${minConfidence}`,
      min_global_state: weeklyConfig.fallback_global_state,
    };
  }

  // Shift detection: compare to previous vectors
  const prevRegimes = featureVectors.slice(0, -1).map(v => _kmeansProxyClassify(v, weeklyConfig).regime_tag);
  const dominantPrev = _dominant(prevRegimes);
  const shiftDetected = regime_tag !== dominantPrev && prevRegimes.length >= 5;

  return {
    regime_tag,
    regime_confidence: confidence,
    regime_version: regimeVersion,
    shift_detected: shiftDetected,
    fallback_used: false,
    fallback_reason: null,
    min_global_state: null,
  };
}

/**
 * KMeans proxy classification using threshold-based centroid distances.
 * Deterministic, reproducible, no external model dependency.
 *
 * Centroids (configurable via regime_config.yaml in production):
 *   NORMAL:       vix ~16, sp500_ret ~0%, hy_spread ~3.5%, vol ~12%
 *   STRESS:       vix ~28, sp500_ret ~-2%, hy_spread ~5%, vol ~22%
 *   REGIME_SHIFT: vix ~40, sp500_ret ~-5%, hy_spread ~7%, vol ~35%
 *   RANGE:        vix ~20, sp500_ret ~0.5%, hy_spread ~4%, vol ~15%
 */
function _kmeansProxyClassify(vector, config = {}) {
  const centroids = {
    NORMAL:       { vix: 16, sp500_ret: 0,   hy_spread: 3.5, vol_10d: 12 },
    RANGE:        { vix: 20, sp500_ret: 0.5, hy_spread: 4.0, vol_10d: 15 },
    STRESS:       { vix: 28, sp500_ret: -2,  hy_spread: 5.0, vol_10d: 22 },
    REGIME_SHIFT: { vix: 40, sp500_ret: -5,  hy_spread: 7.0, vol_10d: 35 },
  };

  // Normalization weights
  const weights = { vix: 1 / 15, sp500_ret: 1 / 5, hy_spread: 1 / 3, vol_10d: 1 / 20 };

  let bestTag = config.fallback_regime || 'RANGE';
  let bestDist = Infinity;
  const distances = {};

  for (const [tag, centroid] of Object.entries(centroids)) {
    let dist = 0;
    for (const key of Object.keys(centroid)) {
      const diff = ((vector[key] ?? centroid[key]) - centroid[key]) * (weights[key] || 1);
      dist += diff * diff;
    }
    dist = Math.sqrt(dist);
    distances[tag] = dist;
    if (dist < bestDist) {
      bestDist = dist;
      bestTag = tag;
    }
  }

  // Confidence: inverse normalized distance (closer = higher confidence)
  const totalDist = Object.values(distances).reduce((a, b) => a + b, 0);
  const confidence = totalDist > 0 ? 1 - (bestDist / totalDist) : 0.5;

  return { regime_tag: bestTag, confidence: Math.max(0, Math.min(1, confidence)) };
}

function _dominant(arr) {
  if (!arr.length) return 'NORMAL';
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Detect regime break from historical regime tags.
 *
 * @param {string} currentRegime - Current regime tag
 * @param {Array} recentRegimes - Array of { regime, date } for last N trading days
 * @param {Object} [config] - From regime-config.v3.json
 * @returns {{ break_detected: boolean, dominant_regime: string, cooldown_days: number }}
 */
export function detectRegimeBreak(currentRegime, recentRegimes, config = {}) {
  const lookback = config.regime_break?.lookback_days || 30;
  const freezeDays = config.regime_break?.promotion_freeze_days || 10;
  const recent = recentRegimes.slice(-lookback);

  if (recent.length === 0) {
    return { break_detected: false, dominant_regime: currentRegime, cooldown_days: 0 };
  }

  // Find dominant regime
  const counts = {};
  for (const r of recent) {
    counts[r.regime] = (counts[r.regime] || 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const breakDetected = currentRegime !== dominant;

  return {
    break_detected: breakDetected,
    dominant_regime: dominant,
    cooldown_days: breakDetected ? freezeDays : 0,
  };
}

/**
 * Tag training samples with regime weights.
 *
 * @param {Array} samples - [{ regime_tag, ...data }]
 * @param {string} currentRegime - Current regime
 * @param {Object} [config] - From regime-config.v3.json
 * @returns {Array} Samples with regime_weight added
 */
export function tagTrainingWeights(samples, currentRegime, config = {}) {
  const weights = config.training_weights || {
    current_regime: 1.0,
    compatible_previous: 0.5,
    structurally_foreign: 0.1,
    diagnostics_only: 0.0,
  };

  // Compatible regimes mapping
  const compatible = {
    NORMAL: ['NORMAL'],
    STRESS: ['STRESS', 'NORMAL'],
    REGIME_SHIFT: ['REGIME_SHIFT', 'STRESS'],
    RANGE: ['RANGE', 'NORMAL'],
  };

  const currentCompatible = compatible[currentRegime] || [currentRegime];

  return samples.map(s => {
    let weight;
    if (s.regime_tag === currentRegime) {
      weight = weights.current_regime;
    } else if (currentCompatible.includes(s.regime_tag)) {
      weight = weights.compatible_previous;
    } else {
      weight = weights.structurally_foreign;
    }
    return { ...s, regime_weight: weight };
  });
}
