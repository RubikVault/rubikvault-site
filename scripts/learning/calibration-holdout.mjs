/**
 * V6.0 — OOS Calibration Holdout
 *
 * Enforces strict temporal separation between train, calibration, and evaluation windows.
 * Prevents information leakage from calibration into evaluation.
 */

/**
 * Enforce calibration holdout: no overlap between calibration and evaluation windows.
 *
 * @param {Object} params
 * @param {string} params.trainEnd - End of training window (ISO date)
 * @param {string} params.calibrationStart - Start of calibration window
 * @param {string} params.calibrationEnd - End of calibration window
 * @param {string} params.evaluationStart - Start of evaluation window
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function enforceCalibrationHoldout({ trainEnd, calibrationStart, calibrationEnd, evaluationStart }) {
  const violations = [];

  if (!trainEnd || !calibrationStart || !calibrationEnd || !evaluationStart) {
    violations.push('MISSING_WINDOW_DATES');
    return { valid: false, violations };
  }

  if (calibrationStart <= trainEnd) {
    violations.push('CALIBRATION_OVERLAPS_TRAINING');
  }

  if (evaluationStart <= calibrationEnd) {
    violations.push('EVALUATION_OVERLAPS_CALIBRATION');
  }

  if (calibrationEnd <= calibrationStart) {
    violations.push('CALIBRATION_WINDOW_INVALID');
  }

  if (evaluationStart <= trainEnd) {
    violations.push('EVALUATION_OVERLAPS_TRAINING');
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Compute calibration window from training end date.
 *
 * @param {Object} params
 * @param {string} params.trainEnd - End of training window (ISO date)
 * @param {number} [params.holdoutDays=30] - Days between train end and calibration start
 * @param {number} [params.calibrationDays=60] - Length of calibration window
 * @param {number} [params.gapDays=5] - Gap between calibration end and evaluation start
 * @returns {{ calibration_start: string, calibration_end: string, evaluation_start: string }}
 */
export function computeCalibrationWindow({ trainEnd, holdoutDays = 30, calibrationDays = 60, gapDays = 5 }) {
  const trainEndMs = new Date(trainEnd).getTime();

  const calibrationStart = new Date(trainEndMs + holdoutDays * 86400000).toISOString().slice(0, 10);
  const calibrationEnd = new Date(trainEndMs + (holdoutDays + calibrationDays) * 86400000).toISOString().slice(0, 10);
  const evaluationStart = new Date(trainEndMs + (holdoutDays + calibrationDays + gapDays) * 86400000).toISOString().slice(0, 10);

  return { calibration_start: calibrationStart, calibration_end: calibrationEnd, evaluation_start: evaluationStart };
}

/**
 * Validate calibration mode.
 *
 * @param {string} mode - 'bootstrap' or 'calibrated'
 * @param {boolean} hasBootstrap - Whether bootstrap calibration is available
 * @param {boolean} hasCalibratedModel - Whether a calibrated model exists
 * @returns {{ valid: boolean, effective_mode: string, reason: string|null }}
 */
export function validateCalibrationMode(mode, hasBootstrap, hasCalibratedModel) {
  if (mode === 'calibrated') {
    if (!hasCalibratedModel) {
      return { valid: false, effective_mode: 'bootstrap', reason: 'CALIBRATED_MODEL_UNAVAILABLE' };
    }
    return { valid: true, effective_mode: 'calibrated', reason: null };
  }

  if (mode === 'bootstrap' || !mode) {
    return { valid: true, effective_mode: 'bootstrap', reason: null };
  }

  return { valid: false, effective_mode: 'bootstrap', reason: `UNKNOWN_MODE_${mode}` };
}
