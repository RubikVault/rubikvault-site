/**
 * V6.0 — Layer 6: Event & Oracle Engine
 *
 * Event definition, lifecycle management, streak tracking, and near-duplicate detection.
 */
import { randomUUID } from 'node:crypto';

export const LIFECYCLE_STATE = Object.freeze({
  CANDIDATE: 'candidate',
  VALIDATION: 'validation',
  PRODUCTION: 'production',
  DEPRECATED: 'deprecated',
});

const COOLDOWN_DAYS = Object.freeze({
  same_event_id: 365,
  near_duplicate: 180,
  same_family_new_params: 90,
});

/**
 * Create a new event object.
 * @param {Object} params
 * @returns {Object} Event record
 */
export function createEvent({
  event_id,
  family_id,
  cluster_id,
  signal_type = 'ts',
  trigger_condition = '',
  trigger_logic = 'cross_below',
  max_active_duration_days = 5,
  exit_condition = '',
  lifecycle_state = LIFECYCLE_STATE.CANDIDATE,
  metadata = {},
}) {
  return {
    event_id: event_id || `evt_${randomUUID().slice(0, 8)}`,
    family_id,
    cluster_id,
    signal_type,
    trigger_condition,
    trigger_logic,
    max_active_duration_days,
    exit_condition,
    lifecycle_state,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata,
  };
}

/**
 * Evaluate event lifecycle transitions.
 * @param {Object} event - Current event
 * @param {Object} metrics - { oos_months, oos_sharpe, hit_rate, dsr }
 * @returns {Object} Updated event with new lifecycle_state
 */
export function evaluateEventLifecycle(event, metrics = {}) {
  const updated = { ...event, updated_at: new Date().toISOString() };

  if (event.lifecycle_state === LIFECYCLE_STATE.CANDIDATE) {
    if ((metrics.oos_months || 0) >= 6 &&
        (metrics.oos_sharpe || 0) > 0.5 &&
        (metrics.hit_rate || 0) > 0.55) {
      updated.lifecycle_state = LIFECYCLE_STATE.VALIDATION;
    }
  }

  if (event.lifecycle_state === LIFECYCLE_STATE.VALIDATION) {
    if ((metrics.dsr || 0) > 0 && (metrics.hit_rate || 0) > 0.55) {
      updated.lifecycle_state = LIFECYCLE_STATE.PRODUCTION;
    }
  }

  if (event.lifecycle_state === LIFECYCLE_STATE.PRODUCTION) {
    const shouldDeprecate =
      ((metrics.oos_months || 0) >= 12 && (metrics.hit_rate || 0) < 0.45) ||
      ((metrics.oos_sharpe || 0) < 0.1) ||
      metrics.monotonicity_broken ||
      metrics.stress_collapse ||
      metrics.manual_override;

    if (shouldDeprecate) {
      updated.lifecycle_state = LIFECYCLE_STATE.DEPRECATED;
      updated.deprecated_reason = metrics.monotonicity_broken ? 'MONOTONICITY_BROKEN' :
        metrics.stress_collapse ? 'STRESS_COLLAPSE' :
        metrics.manual_override ? 'MANUAL_OVERRIDE' :
        'PERFORMANCE_DEGRADATION';
    }
  }

  return updated;
}

/**
 * Compute event streak days (consecutive days event is active).
 * @param {Array} eventHistory - [{ date, active: boolean }] sorted by date
 * @param {string} asOfDate - Current date
 * @returns {number} Consecutive active days up to asOfDate
 */
export function computeEventStreakDays(eventHistory, asOfDate) {
  if (!eventHistory?.length) return 0;

  let streak = 0;
  for (let i = eventHistory.length - 1; i >= 0; i--) {
    if (eventHistory[i].date > asOfDate) continue;
    if (eventHistory[i].active) streak++;
    else break;
  }
  return streak;
}

/**
 * Detect near-duplicate events.
 * @param {Object} eventA
 * @param {Object} eventB
 * @returns {{ is_duplicate: boolean, similarity: number }}
 */
export function isNearDuplicate(eventA, eventB) {
  if (!eventA || !eventB) return { is_duplicate: false, similarity: 0 };

  const sameFamily = eventA.family_id === eventB.family_id;
  if (!sameFamily) return { is_duplicate: false, similarity: 0 };

  const paramsA = new Set(Object.keys(eventA.metadata || {}));
  const paramsB = new Set(Object.keys(eventB.metadata || {}));

  const intersection = [...paramsA].filter(k => paramsB.has(k)).length;
  const union = new Set([...paramsA, ...paramsB]).size;
  const similarity = union > 0 ? intersection / union : 0;

  return {
    is_duplicate: similarity > 0.60,
    similarity: Number(similarity.toFixed(4)),
  };
}

/**
 * Get cooldown days for an event based on relationship to deprecated event.
 * @param {string} relationship - "same_event_id" | "near_duplicate" | "same_family_new_params"
 * @returns {number} Cooldown days
 */
export function getCooldownDays(relationship) {
  return COOLDOWN_DAYS[relationship] || 0;
}
