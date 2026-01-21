/**
 * Drop Threshold Validation
 *
 * Prevents silent data loss by enforcing hard drop thresholds.
 * Blocks publish when thresholds are exceeded.
 *
 * THRESHOLDS (constants):
 * - max_drop_abs = 5 (absolute max dropped records)
 * - max_drop_ratio = 0.001 (0.1% max drop ratio)
 *
 * RULE:
 * If dropped_records > min(max_drop_abs, raw_count * max_drop_ratio):
 *   - validation.passed = false
 *   - module publish MUST be blocked
 */

export const MAX_DROP_ABS = 5;
export const MAX_DROP_RATIO = 0.001;

/**
 * Validate drop threshold
 * @param {number} rawCount - Total records before filtering
 * @param {number} droppedRecords - Number of records dropped during validation
 * @returns {object} { passed: boolean, drop_ratio: number, threshold_abs: number, threshold_ratio: number, reason: string|null }
 */
export function validateDropThreshold(rawCount, droppedRecords) {
  if (typeof rawCount !== 'number' || rawCount < 0) {
    throw new Error(`Invalid rawCount: ${rawCount} (must be non-negative number)`);
  }
  
  if (typeof droppedRecords !== 'number' || droppedRecords < 0) {
    throw new Error(`Invalid droppedRecords: ${droppedRecords} (must be non-negative number)`);
  }
  
  // Calculate drop ratio
  const dropRatio = rawCount > 0 ? droppedRecords / rawCount : 0;
  
  // Calculate dynamic threshold based on raw count
  const thresholdAbs = MAX_DROP_ABS;
  const thresholdRatio = rawCount * MAX_DROP_RATIO;
  const effectiveThreshold = Math.min(thresholdAbs, thresholdRatio);
  
  // Check if threshold exceeded
  const passed = droppedRecords <= effectiveThreshold;
  
  let reason = null;
  if (!passed) {
    reason = `DROP_THRESHOLD_EXCEEDED: dropped ${droppedRecords} records (threshold: ${effectiveThreshold.toFixed(2)}, raw_count: ${rawCount}, drop_ratio: ${(dropRatio * 100).toFixed(3)}%)`;
  }
  
  return {
    passed,
    drop_ratio: dropRatio,
    threshold_abs: thresholdAbs,
    threshold_ratio: thresholdRatio,
    effective_threshold: effectiveThreshold,
    reason
  };
}

/**
 * Compute validation metadata with drop threshold enforcement
 * @param {number} rawCount - Total records before filtering
 * @param {number} validCount - Records after filtering
 * @param {number|boolean} droppedRecordsOrOther - Records dropped OR otherValidationPassed (optional)
 * @param {boolean} otherValidationPassed - Whether other validation checks passed (optional)
 * @returns {object} Validation metadata for envelope
 */
export function computeValidationMetadata(rawCount, validCount, droppedRecordsOrOther, otherValidationPassed) {
  let droppedRecords;
  let otherPassed;
  
  // Disambiguate arguments
  if (typeof droppedRecordsOrOther === 'boolean' && otherValidationPassed === undefined) {
    // Called as (rawCount, validCount, otherValidationPassed)
    otherPassed = droppedRecordsOrOther;
    droppedRecords = Math.max(0, rawCount - validCount);
  } else {
    // Called as (rawCount, validCount, droppedRecords, otherValidationPassed) or (rawCount, validCount)
    droppedRecords = (typeof droppedRecordsOrOther === 'number')
      ? droppedRecordsOrOther
      : Math.max(0, rawCount - validCount);
    otherPassed = (typeof otherValidationPassed === 'boolean')
      ? otherValidationPassed
      : true;
  }
  
  const dropCheck = validateDropThreshold(rawCount, droppedRecords);
  
  const limit = dropCheck.effective_threshold;
  const violated = !dropCheck.passed;
  const dropCheckPassed = !violated;

  return {
    dropped_records: droppedRecords,
    drop_ratio: dropCheck.drop_ratio,
    drop_threshold: {
      max_drop_abs: MAX_DROP_ABS,
      max_drop_ratio: MAX_DROP_RATIO,
      limit,
      violated
    },
    drop_check_passed: dropCheckPassed,
    checks: {
      drop_threshold: {
        passed: dropCheckPassed,
        effective_threshold: limit,
        reason: dropCheck.reason
      },
      provided_validation: {
        passed: otherPassed,
        source: "caller"
      }
    }
  };
}

export default {
  validateDropThreshold,
  computeValidationMetadata,
  MAX_DROP_ABS,
  MAX_DROP_RATIO
};
