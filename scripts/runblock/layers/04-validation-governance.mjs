/**
 * RUNBLOCK v3.0 — Layer 4: Validation & Governance
 *
 * Champion/Challenger system, promotion gates, calibration monitoring.
 * No promotion based on gross-only edge.
 */

// ── FIX #6: Allowed and prohibited model families (Spec 6.2 / Rule 9) ──
const ALLOWED_FORECAST_MODELS = ['random_forest', 'gradient_boosting', 'xgboost', 'lightgbm'];
const PROHIBITED_DEFAULT_MODELS = ['lstm', 'gru', 'rnn', 'cnn', 'gnn', 'attention', 'transformer', 'reinforcement_learning'];

/**
 * FIX #6: Validate model type against Spec 6.2 / Rule 9.
 * LSTM is never default. Only experimental challenger if cross-sectional setup exists
 * and OOS superiority proven.
 *
 * @param {string} modelType - e.g. 'random_forest', 'lstm'
 * @param {Object} [options] - { is_challenger, oos_superiority_proven }
 * @returns {{ allowed: boolean, reason: string }}
 */
export function validateModelType(modelType, options = {}) {
  const normalized = (modelType || '').toLowerCase().replace(/[\s-]/g, '_');

  if (ALLOWED_FORECAST_MODELS.includes(normalized)) {
    return { allowed: true, reason: 'APPROVED_MODEL_FAMILY' };
  }

  if (PROHIBITED_DEFAULT_MODELS.includes(normalized)) {
    if (options.is_challenger && options.oos_superiority_proven) {
      return { allowed: true, reason: `EXPERIMENTAL_CHALLENGER:${normalized}_OOS_PROVEN` };
    }
    return {
      allowed: false,
      reason: `PROHIBITED_AS_DEFAULT:${normalized}. Spec 6.2: "LSTM is NOT default. Only experimental challenger ` +
              `if cross-sectional/panel setup exists AND OOS superiority proven."`,
    };
  }

  // Unknown model type — flag for review
  return { allowed: false, reason: `UNKNOWN_MODEL_TYPE:${normalized}. Must be one of: ${ALLOWED_FORECAST_MODELS.join(', ')}` };
}

/**
 * Evaluate promotion gates for Scientific Analyzer.
 *
 * FIX #4: Added missing hard gates:
 * - regime_compatible: current regime must be compatible with validation evidence
 * - primary_data_quality_pass: Data Quality in primary training window = PASS only
 *
 * @param {Object} metrics - Model performance metrics
 * @param {Object} [config] - From promotion-config.v3.json
 * @returns {{ eligible: boolean, gate_results: Object, blocking_gates: string[] }}
 */
export function evaluateScientificGates(metrics, config = {}) {
  const gates = config.scientific_gates || {
    oos_accuracy_ratio: 0.85,
    brier_max: 0.25,
    calibration_error_max: 0.05,
    net_return_positive: true,
    min_outcomes: 60,
    regime_compatible: true,
    primary_data_quality_pass: true,
    no_structural_instability: true,
  };

  const results = {};
  const blockers = [];

  // OOS >= IS * ratio
  results.oos_accuracy = {
    pass: (metrics.oos_accuracy || 0) >= (metrics.is_accuracy || 0) * gates.oos_accuracy_ratio,
    value: metrics.oos_accuracy,
    threshold: (metrics.is_accuracy || 0) * gates.oos_accuracy_ratio,
  };
  if (!results.oos_accuracy.pass) blockers.push('OOS_ACCURACY');

  // Brier Score
  results.brier = {
    pass: (metrics.brier_score || 1) < gates.brier_max,
    value: metrics.brier_score,
    threshold: gates.brier_max,
  };
  if (!results.brier.pass) blockers.push('BRIER_SCORE');

  // Calibration Error
  results.calibration = {
    pass: (metrics.calibration_error || 1) < gates.calibration_error_max,
    value: metrics.calibration_error,
    threshold: gates.calibration_error_max,
  };
  if (!results.calibration.pass) blockers.push('CALIBRATION_ERROR');

  // Net return after costs
  results.net_return = {
    pass: gates.net_return_positive ? (metrics.net_return_after_costs || 0) > 0 : true,
    value: metrics.net_return_after_costs,
  };
  if (!results.net_return.pass) blockers.push('NET_RETURN_NEGATIVE');

  // Minimum outcomes
  results.min_outcomes = {
    pass: (metrics.outcome_count || 0) >= gates.min_outcomes,
    value: metrics.outcome_count,
    threshold: gates.min_outcomes,
  };
  if (!results.min_outcomes.pass) blockers.push('INSUFFICIENT_OUTCOMES');

  // Leakage
  results.leakage = {
    pass: metrics.leakage_pass !== false,
  };
  if (!results.leakage.pass) blockers.push('LEAKAGE_FAIL');

  // Structural instability
  results.structural = {
    pass: !metrics.structural_instability_flag,
  };
  if (!results.structural.pass) blockers.push('STRUCTURAL_INSTABILITY');

  // ── FIX #4: Regime compatibility hard gate (Spec 5.8) ──
  if (gates.regime_compatible) {
    const regimeOk = metrics.regime_compatible !== false;
    results.regime_compatible = {
      pass: regimeOk,
      current_regime: metrics.current_regime,
      validation_regime: metrics.validation_regime,
    };
    if (!results.regime_compatible.pass) blockers.push('REGIME_INCOMPATIBLE');
  }

  // ── FIX #4: Primary data quality hard gate (Spec 5.8) ──
  if (gates.primary_data_quality_pass) {
    const dqOk = metrics.primary_window_data_quality === 'PASS';
    results.primary_data_quality = {
      pass: dqOk,
      value: metrics.primary_window_data_quality,
      required: 'PASS',
    };
    if (!results.primary_data_quality.pass) blockers.push('PRIMARY_DATA_QUALITY_NOT_PASS');
  }

  return {
    eligible: blockers.length === 0,
    gate_results: results,
    blocking_gates: blockers,
  };
}

/**
 * Evaluate promotion gates for ML Forecast (per horizon).
 *
 * @param {Object} metrics - { horizons: { '1d': {...}, '5d': {...}, '20d': {...} } }
 * @param {Object} [config] - From promotion-config.v3.json
 * @returns {{ eligible: boolean, horizon_results: Object, blocking_gates: string[] }}
 */
export function evaluateForecastGates(metrics, config = {}) {
  const gates = config.forecast_gates || {};
  const horizons = gates.horizons || ['1d', '5d', '20d'];
  const bucketTolerance = gates.calibration_buckets || { '60_pct_tolerance': 5, '70_pct_tolerance': 5, '80_pct_tolerance': 5 };
  const blockers = [];
  const horizonResults = {};

  // ── FIX #6: Model type validation ──
  if (!metrics.model_type) {
    blockers.push('MODEL_TYPE_MISSING');
  } else {
    const modelCheck = validateModelType(metrics.model_type, {
      is_challenger: metrics.is_challenger,
      oos_superiority_proven: metrics.oos_superiority_proven,
    });
    if (!modelCheck.allowed) {
      blockers.push(`MODEL_TYPE_BLOCKED:${modelCheck.reason}`);
    }
  }

  for (const h of horizons) {
    const hm = metrics.horizons?.[h] || {};
    const results = {};

    // LogLoss below naive baseline
    results.logloss = {
      pass: hm.logloss != null && hm.naive_logloss != null && hm.logloss < hm.naive_logloss,
      value: hm.logloss,
      baseline: hm.naive_logloss,
    };
    if (!results.logloss.pass) blockers.push(`${h}_LOGLOSS`);

    // Calibration buckets
    for (const [bucket, tolerance] of Object.entries(bucketTolerance)) {
      const pctKey = bucket.replace('_pct_tolerance', '');
      const actual = hm[`bucket_${pctKey}_actual`];
      const expected = parseFloat(pctKey);
      if (actual != null) {
        results[`bucket_${pctKey}`] = {
          pass: Math.abs(actual - expected) <= tolerance,
          actual,
          expected,
          tolerance,
        };
        if (!results[`bucket_${pctKey}`].pass) blockers.push(`${h}_CALIBRATION_${pctKey}`);
      }
    }

    horizonResults[h] = results;
  }

  // Global checks
  if (metrics.leakage_pass === false) blockers.push('LEAKAGE_FAIL');
  if (metrics.structural_instability_flag) blockers.push('STRUCTURAL_INSTABILITY');
  if (metrics.promotion_freeze_active) blockers.push('PROMOTION_FREEZE');

  return {
    eligible: blockers.length === 0,
    horizon_results: horizonResults,
    blocking_gates: blockers,
  };
}

// ═══════════════════════════════════════════════════════════════
// FIX #3: Elliott V1/V2 Hard Gates (Spec 5.8)
//
// V1: No directional score. Confluence hit-rate logged. Flip-frequency measured.
//     Invalidation visible within 1 trading day.
// V2: Only after 200+ statistically valid regime-separated confluence events,
//     evaluated net-of-costs, with p < 0.05.
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate Elliott V1 gates.
 * V1 is passive only — no directional score allowed.
 *
 * @param {Object} metrics - { has_directional_score, invalidation_delay_days, confluence_hit_rate, flip_frequency }
 * @returns {{ eligible: boolean, gate_results: Object, blocking_gates: string[] }}
 */
export function evaluateElliottV1Gates(metrics) {
  const results = {};
  const blockers = [];

  // V1: No directional score allowed
  results.no_directional_score = {
    pass: !metrics.has_directional_score,
    value: metrics.has_directional_score,
  };
  if (!results.no_directional_score.pass) blockers.push('ELLIOTT_V1_DIRECTIONAL_SCORE_PROHIBITED');

  // Invalidation must be visible within 1 trading day
  results.invalidation_delay = {
    pass: (metrics.invalidation_delay_days ?? 0) <= 1,
    value: metrics.invalidation_delay_days,
    max_allowed: 1,
  };
  if (!results.invalidation_delay.pass) blockers.push('ELLIOTT_INVALIDATION_DELAY_GT_1D');

  // Confluence hit-rate must be logged (not evaluated, just present)
  results.confluence_logged = {
    pass: metrics.confluence_hit_rate != null,
    value: metrics.confluence_hit_rate,
  };
  if (!results.confluence_logged.pass) blockers.push('ELLIOTT_CONFLUENCE_NOT_LOGGED');

  // Flip-frequency must be measured (not evaluated, just present)
  results.flip_frequency_logged = {
    pass: metrics.flip_frequency != null,
    value: metrics.flip_frequency,
  };
  if (!results.flip_frequency_logged.pass) blockers.push('ELLIOTT_FLIP_FREQUENCY_NOT_LOGGED');

  return {
    eligible: blockers.length === 0,
    gate_results: results,
    blocking_gates: blockers,
  };
}

/**
 * Evaluate Elliott V2 enablement gate.
 * V2 requires hard statistical evidence before directional scoring is allowed.
 *
 * @param {Object} metrics - { confluence_events, net_of_costs_evaluated, regime_separated,
 *                             statistical_significance_p, practical_effect_size }
 * @param {Object} [config] - From promotion-config.v3.json → elliott_gates.v2_enablement
 * @returns {{ eligible: boolean, gate_results: Object, blocking_gates: string[] }}
 */
export function evaluateElliottV2Gates(metrics, config = {}) {
  const v2Config = config.elliott_gates?.v2_enablement || {
    min_confluence_events: 200,
    net_of_costs: true,
    regime_separated: true,
    significance_p: 0.05,
    practical_effect_size: true,
  };

  const results = {};
  const blockers = [];

  // Min 200 confluence events
  results.min_confluence_events = {
    pass: (metrics.confluence_events || 0) >= v2Config.min_confluence_events,
    value: metrics.confluence_events,
    threshold: v2Config.min_confluence_events,
  };
  if (!results.min_confluence_events.pass) blockers.push('ELLIOTT_V2_INSUFFICIENT_CONFLUENCE');

  // Evaluated net-of-costs
  results.net_of_costs = {
    pass: v2Config.net_of_costs ? metrics.net_of_costs_evaluated === true : true,
    value: metrics.net_of_costs_evaluated,
  };
  if (!results.net_of_costs.pass) blockers.push('ELLIOTT_V2_NOT_NET_OF_COSTS');

  // Separated by regime state
  results.regime_separated = {
    pass: v2Config.regime_separated ? metrics.regime_separated === true : true,
    value: metrics.regime_separated,
  };
  if (!results.regime_separated.pass) blockers.push('ELLIOTT_V2_NOT_REGIME_SEPARATED');

  // Statistical significance p < 0.05
  results.statistical_significance = {
    pass: (metrics.statistical_significance_p ?? 1) < v2Config.significance_p,
    value: metrics.statistical_significance_p,
    threshold: v2Config.significance_p,
  };
  if (!results.statistical_significance.pass) blockers.push('ELLIOTT_V2_NOT_SIGNIFICANT');

  // Practically relevant effect size
  results.practical_effect_size = {
    pass: v2Config.practical_effect_size ? metrics.practical_effect_size === true : true,
    value: metrics.practical_effect_size,
  };
  if (!results.practical_effect_size.pass) blockers.push('ELLIOTT_V2_NO_PRACTICAL_EFFECT');

  return {
    eligible: blockers.length === 0,
    gate_results: results,
    blocking_gates: blockers,
  };
}

/**
 * Champion/Challenger promotion decision using strict tiebreaker hierarchy.
 *
 * 1. net_return_after_costs (hard blocker)
 * 2. Brier Score
 * 3. Calibration Error
 */
export function promotionDecision(champion, challenger) {
  // Criterion 1: net return (hard blocker)
  if ((challenger.net_return_after_costs || 0) <= 0) {
    return { promote: false, reason: 'challenger_net_return_not_positive' };
  }
  if ((challenger.net_return_after_costs || 0) <= (champion.net_return_after_costs || 0)) {
    return { promote: false, reason: 'challenger_net_return_not_better' };
  }

  // Criterion 2: Brier Score (lower is better)
  const brierImproved = (challenger.brier_score || 1) < (champion.brier_score || 1);

  // Criterion 3: Calibration Error (lower is better)
  const calImproved = (challenger.calibration_error || 1) < (champion.calibration_error || 1);
  const calWorsened = (challenger.calibration_error || 0) > (champion.calibration_error || 0) * 1.1;

  if (calWorsened) {
    return { promote: false, reason: 'calibration_worsened_beyond_threshold' };
  }

  if (brierImproved) {
    return { promote: true, reason: 'net_return_and_brier_improved' };
  }

  if (calImproved) {
    return { promote: true, reason: 'net_return_improved_calibration_improved' };
  }

  return { promote: false, reason: 'no_clear_improvement_in_secondary_metrics' };
}

/**
 * Calibration monitoring.
 */
export function monitorCalibration(calibration, config = {}) {
  const issues = [];
  const brierMax = config.brier_max || 0.25;
  const calMax = config.calibration_error_max || 0.05;
  const bucketTolerance = 5;

  if ((calibration.brier_score || 0) >= brierMax) issues.push(`BRIER_${calibration.brier_score?.toFixed(4)}_GTE_${brierMax}`);
  if ((calibration.calibration_error || 0) >= calMax) issues.push(`CAL_ERROR_${calibration.calibration_error?.toFixed(4)}_GTE_${calMax}`);

  for (const [pct, actual] of Object.entries(calibration.buckets || {})) {
    const expected = parseFloat(pct);
    if (Math.abs(actual - expected) > bucketTolerance) {
      issues.push(`BUCKET_${pct}_DRIFT_${actual.toFixed(1)}_VS_${expected}`);
    }
  }

  return { healthy: issues.length === 0, issues };
}
