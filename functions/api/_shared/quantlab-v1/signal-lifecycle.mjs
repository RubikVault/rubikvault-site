/**
 * QuantLab V1 — Signal Lifecycle State Machine
 * Operationalizes lifecycle transitions for outcome tracking.
 */

export const LIFECYCLE_STATES = Object.freeze({
  EMITTED: 'emitted',
  ENTRY_TRIGGERED: 'entry_triggered',
  EXPIRED_WITHOUT_ENTRY: 'expired_without_entry',
  INVALIDATED_BEFORE_ENTRY: 'invalidated_before_entry',
  EXECUTED_AND_MATURED: 'executed_and_matured',
});

/** Trading days TTL per horizon for entry validity. */
export const HORIZON_TTL = Object.freeze({
  short: 2,
  medium: 5,
  long: 10,
});

/**
 * Evaluate lifecycle state and return updated fields.
 * @param {Object} outcome - Current outcome record
 * @param {number|null} currentPrice - Latest market price
 * @param {Object|null} entryZone - { low, high } from trade_signal
 * @returns {Object} Updated lifecycle fields to merge into outcome
 */
export function evaluateLifecycle(outcome, currentPrice, entryZone) {
  const now = new Date();
  const validUntil = new Date(outcome.entry_valid_until);
  const patch = {};

  // Already matured — no changes
  if (outcome.matured) return patch;

  // Already expired
  if (outcome.expired_without_entry) return patch;

  // Check entry trigger
  if (!outcome.entry_triggered && currentPrice != null && entryZone) {
    const inZone = outcome.verdict === 'BUY'
      ? currentPrice >= entryZone.low && currentPrice <= entryZone.high
      : currentPrice <= entryZone.high && currentPrice >= entryZone.low;

    if (inZone) {
      patch.entry_triggered = true;
      patch.entry_triggered_at = now.toISOString();
    }
  }

  // Check expiration
  if (!outcome.entry_triggered && !patch.entry_triggered && now > validUntil) {
    patch.expired_without_entry = true;
    patch.matured = true;
  }

  // Check invalidation (stop hit before entry)
  if (!outcome.entry_triggered && !patch.entry_triggered && currentPrice != null) {
    const ts = outcome.trade_signal;
    if (ts && ts.stop_loss != null) {
      const invalidated = outcome.verdict === 'BUY'
        ? currentPrice < ts.stop_loss
        : currentPrice > ts.stop_loss;
      if (invalidated) {
        patch.expired_without_entry = true;
        patch.matured = true;
        patch._invalidation_reason = 'stop_hit_before_entry';
      }
    }
  }

  return patch;
}

/**
 * Classify the current state of an outcome record.
 * @param {Object} outcome
 * @returns {string} One of LIFECYCLE_STATES
 */
export function classifyOutcomeState(outcome) {
  if (outcome.matured && outcome.entry_triggered) return LIFECYCLE_STATES.EXECUTED_AND_MATURED;
  if (outcome.expired_without_entry && outcome._invalidation_reason) return LIFECYCLE_STATES.INVALIDATED_BEFORE_ENTRY;
  if (outcome.expired_without_entry) return LIFECYCLE_STATES.EXPIRED_WITHOUT_ENTRY;
  if (outcome.entry_triggered) return LIFECYCLE_STATES.ENTRY_TRIGGERED;
  return LIFECYCLE_STATES.EMITTED;
}

/**
 * Compute entry deadline from horizon.
 * @param {string} horizon
 * @param {string} emittedAt - ISO date string
 * @returns {string} ISO date string
 */
export function computeEntryDeadline(horizon, emittedAt) {
  const days = HORIZON_TTL[horizon] || 5;
  return new Date(new Date(emittedAt).getTime() + days * 86400000).toISOString();
}
