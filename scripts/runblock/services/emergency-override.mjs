/**
 * V6.0 — Emergency Override Path
 *
 * Automatic and manual emergency actions when system conditions deteriorate.
 * Provides governance-level circuit breakers.
 */

export const EMERGENCY_ACTION = Object.freeze({
  HALT_ALL: 'halt_all',
  CAP_TO_WEAK: 'cap_to_weak',
  FREEZE_REGISTRY: 'freeze_registry',
  MANUAL_REVIEW: 'manual_review',
});

/**
 * Evaluate emergency conditions and determine required actions.
 *
 * @param {Object} params
 * @returns {{ emergency_active: boolean, actions: string[], trigger_reasons: string[] }}
 */
export function evaluateEmergencyConditions({
  systemState = 'NORMAL',
  stressScore = 0,
  crashState = 'normal',
  hitRate7d = 0.55,
  monotonicityBroken = false,
}) {
  const actions = [];
  const triggerReasons = [];

  if (crashState === 'critical' && stressScore > 0.9) {
    actions.push(EMERGENCY_ACTION.HALT_ALL);
    triggerReasons.push('CRITICAL_CRASH_HIGH_STRESS');
  }

  if (systemState === 'STRUCTURAL_SHIFT') {
    if (!actions.includes(EMERGENCY_ACTION.HALT_ALL)) {
      actions.push(EMERGENCY_ACTION.CAP_TO_WEAK);
    }
    actions.push(EMERGENCY_ACTION.FREEZE_REGISTRY);
    triggerReasons.push('STRUCTURAL_SHIFT_DETECTED');
  }

  if (hitRate7d < 0.30) {
    actions.push(EMERGENCY_ACTION.MANUAL_REVIEW);
    triggerReasons.push(`HIT_RATE_7D_CRITICAL_${hitRate7d.toFixed(2)}`);
  }

  if (monotonicityBroken && hitRate7d < 0.40) {
    if (!actions.includes(EMERGENCY_ACTION.CAP_TO_WEAK) && !actions.includes(EMERGENCY_ACTION.HALT_ALL)) {
      actions.push(EMERGENCY_ACTION.CAP_TO_WEAK);
    }
    triggerReasons.push('MONOTONICITY_BROKEN_LOW_HIT_RATE');
  }

  return {
    emergency_active: actions.length > 0,
    actions: [...new Set(actions)],
    trigger_reasons: triggerReasons,
  };
}

/**
 * Apply emergency override to a decision.
 *
 * @param {Object} decision - V6 decision with bucket
 * @param {Object} emergencyResult - Output from evaluateEmergencyConditions
 * @returns {Object} Modified decision
 */
export function applyEmergencyOverride(decision, emergencyResult) {
  if (!emergencyResult?.emergency_active) return decision;

  const modified = { ...decision };
  const v6 = { ...(modified.v6 || {}) };

  for (const action of emergencyResult.actions) {
    switch (action) {
      case EMERGENCY_ACTION.HALT_ALL:
        v6.bucket = 'NO_TRADE';
        v6.hold_state = 'reduce';
        v6.emergency_override = 'HALT_ALL';
        break;

      case EMERGENCY_ACTION.CAP_TO_WEAK:
        if (v6.bucket === 'HIGH_CONVICTION' || v6.bucket === 'MODERATE') {
          v6.bucket = 'WEAK';
          v6.emergency_override = 'CAP_TO_WEAK';
        }
        break;

      case EMERGENCY_ACTION.MANUAL_REVIEW:
        v6.manual_review_required = true;
        break;

      case EMERGENCY_ACTION.FREEZE_REGISTRY:
        v6.registry_frozen = true;
        break;
    }
  }

  v6.emergency_reasons = emergencyResult.trigger_reasons;
  modified.v6 = v6;
  return modified;
}
