/**
 * RUNBLOCK v3.0 — Weighted Global System State
 *
 * States: GREEN | YELLOW | ORANGE | RED
 *
 * Criticality tiers:
 *   Tier 1 (critical): Data Integrity, Regime Detection, Scientific Analyzer
 *   Tier 2 (high):     ML Forecast
 *   Tier 3 (context):  Elliott Structure Map
 */

const TIERS = {
  data_integrity:    1,
  regime_detection:  1,
  scientific:        1,
  forecast:          2,
  elliott:           3,
};

const STATES = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
const STATE_RANK = Object.fromEntries(STATES.map((s, i) => [s, i]));

function rank(state) {
  return STATE_RANK[state] ?? 0;
}

function max(a, b) {
  return rank(a) >= rank(b) ? a : b;
}

/**
 * Compute weighted global system state from component states.
 *
 * @param {Object} components - { data_integrity, regime_detection, scientific, forecast, elliott }
 *   Each value: { state: 'ACTIVE'|'DEGRADED'|'SUPPRESSED'|'INVALIDATED'|'FAIL', reason?: string }
 * @param {Object} [flags] - { leakage_fail, audit_inconsistency, feeds_unavailable, suspect_pct, regime_break_active }
 * @returns {{ global_state: string, reason_codes: string[], components: Object }}
 */
export function computeGlobalState(components = {}, flags = {}) {
  let state = 'GREEN';
  const reasons = [];

  // ── RED triggers (hard stop) ──
  if (flags.leakage_fail) {
    state = 'RED';
    reasons.push('LEAKAGE_ASSERTION_FAIL');
  }
  if (flags.audit_inconsistency) {
    state = 'RED';
    reasons.push('AUDIT_LINEAGE_INCONSISTENCY');
  }
  if (flags.feeds_unavailable) {
    state = 'RED';
    reasons.push('FEEDS_UNAVAILABLE');
  }
  const diState = components.data_integrity?.state;
  if (diState === 'FAIL') {
    state = 'RED';
    reasons.push('DATA_INTEGRITY_FAIL');
  }

  if (state === 'RED') {
    return { global_state: 'RED', reason_codes: reasons, components };
  }

  // ── ORANGE triggers (degraded core) ──
  const sciState = components.scientific?.state;
  const fcState = components.forecast?.state;
  const suspectPct = Number(flags.suspect_pct || 0);

  if (sciState === 'SUPPRESSED') {
    state = max(state, 'ORANGE');
    reasons.push('SCIENTIFIC_SUPPRESSED');
  }
  if (fcState === 'SUPPRESSED') {
    state = max(state, 'ORANGE');
    reasons.push('FORECAST_SUPPRESSED');
  }
  if (flags.regime_break_active) {
    state = max(state, 'ORANGE');
    reasons.push('REGIME_BREAK_COOLDOWN');
  }
  if (flags.min_global_state) {
    state = max(state, flags.min_global_state);
    reasons.push(`MIN_GLOBAL_STATE_${String(flags.min_global_state).toUpperCase()}`);
  }
  if (suspectPct > 10) {
    state = max(state, 'ORANGE');
    reasons.push('SUSPECT_DATA_GT_10PCT');
  }

  // ── YELLOW triggers (warning) ──
  if (sciState === 'DEGRADED') {
    state = max(state, 'YELLOW');
    reasons.push('SCIENTIFIC_DEGRADED');
  }
  if (fcState === 'DEGRADED') {
    state = max(state, 'YELLOW');
    reasons.push('FORECAST_DEGRADED');
  }
  const ewState = components.elliott?.state;
  if (ewState === 'INVALIDATED') {
    // Tier 3 alone cannot exceed YELLOW
    state = max(state, 'YELLOW');
    reasons.push('ELLIOTT_INVALIDATED');
  }
  if (diState === 'SUSPECT') {
    state = max(state, 'YELLOW');
    reasons.push('DATA_INTEGRITY_SUSPECT');
  }
  const regState = components.regime_detection?.state;
  if (regState === 'STRESS') {
    state = max(state, 'YELLOW');
    reasons.push('REGIME_STRESS');
  }

  return { global_state: state, reason_codes: reasons, components };
}

/**
 * Enforce global state rules on feature outputs.
 *
 * @param {string} globalState - GREEN|YELLOW|ORANGE|RED
 * @param {Object} fallbackConfig - from fallback-config.v3.json
 * @returns {{ allowed: boolean, disclaimer?: string, mode: string }}
 */
export function enforceGlobalState(globalState, fallbackConfig = {}) {
  switch (globalState) {
    case 'RED':
      return {
        allowed: false,
        mode: 'HARD_STOP',
        disclaimer: fallbackConfig.global_red?.ui_message || 'System halted — data error mode.',
      };
    case 'ORANGE':
      return {
        allowed: true,
        mode: 'DEGRADED',
        disclaimer: fallbackConfig.global_orange?.disclaimer_text || 'Degraded mode — limited outputs.',
        promotions_frozen: true,
      };
    case 'YELLOW':
      return {
        allowed: true,
        mode: 'WARNING',
        disclaimer: fallbackConfig.global_yellow?.warning_text || 'Warning — some components degraded.',
      };
    default:
      return { allowed: true, mode: 'NORMAL' };
  }
}

/**
 * Get the tier for a component name.
 */
export function getTier(componentName) {
  return TIERS[componentName] ?? 3;
}
