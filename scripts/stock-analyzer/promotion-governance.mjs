export const STOCK_ANALYZER_STATUS = Object.freeze({
  PARITY_NOT_REACHED: 'PARITY_NOT_REACHED',
  PARITY_REACHED: 'PARITY_REACHED',
  PROMOTION_ELIGIBLE: 'PROMOTION_ELIGIBLE',
  PROMOTED: 'PROMOTED',
  ROLLED_BACK: 'ROLLED_BACK',
  BLOCKED: 'BLOCKED',
});

export const STOCK_ANALYZER_RECOMMENDATION = Object.freeze({
  KEEP_CHAMPION: 'KEEP_CHAMPION',
  PROMOTE_V2: 'PROMOTE_V2',
  PROMOTE_V4: 'PROMOTE_V4',
  BLOCK: 'BLOCK',
});

export const STOCK_ANALYZER_THRESHOLDS = Object.freeze({
  significance_p_value_max: 0.05,
  coverage_ratio_global_min: 0.8,
  coverage_ratio_segment_min: 0.6,
  predictions_made_global_min: 100,
  predictions_made_segment_min: 50,
  rollback_accuracy_drop_pct_points: 2.0,
  rollback_brier_delta_max: 0.02,
  rollback_fallback_rate_delta_pct_points: 10.0,
  rollback_null_core_fields_rate_max: 0.01,
});

export function evaluateParity({ nonRegressionPass, baselinePresenceOk, localContractOk }) {
  const blockers = [];
  if (!nonRegressionPass) blockers.push('non_regression_failed');
  if (!baselinePresenceOk) blockers.push('baseline_presence_parity_missing');
  if (!localContractOk) blockers.push('local_contract_incomplete');
  return {
    status: blockers.length ? STOCK_ANALYZER_STATUS.PARITY_NOT_REACHED : STOCK_ANALYZER_STATUS.PARITY_REACHED,
    ok: blockers.length === 0,
    blockers,
  };
}

export function evaluatePromotionEligibility({
  parity,
  killSwitchForceV1 = false,
  manualGoRequired = true,
  manualGoGranted = false,
  metrics = {},
  candidate = 'V4',
}) {
  const blockers = [];
  const warnings = [];
  if (killSwitchForceV1) blockers.push('kill_switch_force_v1');
  if (!parity?.ok) blockers.push(...(parity?.blockers || []));

  const accuracyImproved = metrics.accuracy_improved === true;
  const accuracySignificant = metrics.accuracy_significant === true;
  const calibrationOk = metrics.calibration_not_worse !== false;
  const brierOk = metrics.brier_not_worse !== false;
  const coverageRatio = Number(metrics.coverage_ratio_global);
  const predictionsMade = Number(metrics.predictions_made_global);
  const segmentRegression = metrics.segment_regression === true;
  const regimeRegression = metrics.regime_regression === true;
  const leakagePass = metrics.leakage_pass !== false;
  const driftBlocked = metrics.drift_blocked === true;

  if (!leakagePass) blockers.push('leakage_guard_failed');
  if (driftBlocked) blockers.push('drift_blocked');
  if (!accuracyImproved) blockers.push('accuracy_not_improved');
  if (!accuracySignificant) blockers.push('accuracy_not_significant');
  if (!calibrationOk) blockers.push('calibration_regressed');
  if (!brierOk) blockers.push('brier_regressed');
  if (Number.isFinite(coverageRatio) && coverageRatio < STOCK_ANALYZER_THRESHOLDS.coverage_ratio_global_min) {
    blockers.push('coverage_ratio_below_min');
  }
  if (Number.isFinite(predictionsMade) && predictionsMade < STOCK_ANALYZER_THRESHOLDS.predictions_made_global_min) {
    blockers.push('predictions_made_below_min');
  }
  if (segmentRegression) blockers.push('segment_regression');
  if (regimeRegression) blockers.push('regime_regression');
  if (manualGoRequired && !manualGoGranted) warnings.push('manual_go_pending');

  if (blockers.length) {
    return {
      eligible: false,
      status: killSwitchForceV1 ? STOCK_ANALYZER_STATUS.BLOCKED : (parity?.ok ? STOCK_ANALYZER_STATUS.PARITY_REACHED : STOCK_ANALYZER_STATUS.PARITY_NOT_REACHED),
      recommendation: killSwitchForceV1 ? STOCK_ANALYZER_RECOMMENDATION.BLOCK : STOCK_ANALYZER_RECOMMENDATION.KEEP_CHAMPION,
      blockers,
      warnings,
      candidate,
    };
  }

  return {
    eligible: !manualGoRequired || manualGoGranted,
    status: (!manualGoRequired || manualGoGranted) ? STOCK_ANALYZER_STATUS.PROMOTED : STOCK_ANALYZER_STATUS.PROMOTION_ELIGIBLE,
    recommendation: candidate === 'V2' ? STOCK_ANALYZER_RECOMMENDATION.PROMOTE_V2 : STOCK_ANALYZER_RECOMMENDATION.PROMOTE_V4,
    blockers,
    warnings,
    candidate,
  };
}

export function evaluateRollback({
  accuracyDropPctPoints = 0,
  brierDelta = 0,
  fallbackRateDeltaPctPoints = 0,
  nullCoreFieldsRate = 0,
  driftBlocked = false,
  uiRegression = false,
  dataRegression = false,
}) {
  const triggers = [];
  if (accuracyDropPctPoints >= STOCK_ANALYZER_THRESHOLDS.rollback_accuracy_drop_pct_points) triggers.push('accuracy_drop');
  if (brierDelta >= STOCK_ANALYZER_THRESHOLDS.rollback_brier_delta_max) triggers.push('brier_regression');
  if (fallbackRateDeltaPctPoints >= STOCK_ANALYZER_THRESHOLDS.rollback_fallback_rate_delta_pct_points) triggers.push('fallback_rate_regression');
  if (nullCoreFieldsRate > STOCK_ANALYZER_THRESHOLDS.rollback_null_core_fields_rate_max) triggers.push('null_core_fields_rate');
  if (driftBlocked) triggers.push('drift_blocked');
  if (uiRegression) triggers.push('ui_regression');
  if (dataRegression) triggers.push('data_regression');
  return {
    rollback: triggers.length > 0,
    status: triggers.length > 0 ? STOCK_ANALYZER_STATUS.ROLLED_BACK : STOCK_ANALYZER_STATUS.PROMOTED,
    triggers,
  };
}
