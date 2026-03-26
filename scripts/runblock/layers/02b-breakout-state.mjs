/**
 * RUNBLOCK v3.0 — Layer 2b: Breakout State Machine (Skeleton)
 *
 * Tracks states over time (SETUP, ARMED, TRIGGERED, etc.)
 * Utilizes market_regime to suppress signals in DOWN phase.
 */

/**
 * Evaluate State for a single ticker based on current bar and previous state.
 *
 * @param {Object} tickerData - { bars, current_bar, atr, rvol }
 * @param {Object} previousState - { state, state_age_bars, last_transition_date }
 * @param {Object} regime - { regime_tag: 'UP'|'NEUTRAL'|'DOWN' }
 * @param {Object} config - From breakout_config.yaml
 * @returns {{ state: string, state_age_bars: number, signal_allowed: boolean }}
 */
export function evaluateBreakoutState(tickerData, previousState = {}, regime = {}, config = {}) {
  const cfg = config.state_machine || {
    base_window: 60,
    close_vs_high_min: 0.92,
    breakout_buffer_atr: 0.15,
    rvol_trigger: 1.5,
    max_setup_age_bars: 90,
    max_armed_age_bars: 10,
    failed_cooldown_bars: 10
  };

  const currentState = previousState.state || "NONE";
  let nextState = currentState;
  let ageBars = previousState.state_age_bars || 0;
  let signalAllowed = true;

  // 1. Layer 0: Regime Filter Check
  if (regime.regime_tag === "DOWN") {
    // Suppress active triggers
    if (["TRIGGERED", "CONFIRMED"].includes(currentState)) {
      nextState = currentState; // stay, but suppress
      signalAllowed = false;
    }
  }

  // 2. State Machine Logics (SKELETON)
  // TODO: Implement actual state transition logic here using tickerData and thresholds.
  
  /*
  switch(currentState) {
    case "NONE":
       if (isBaseStructure(tickerData, cfg)) nextState = "SETUP";
       break;
    case "SETUP":
       if (isWithinBuffer(tickerData, cfg)) nextState = "ARMED";
       if (ageBars > cfg.max_setup_age_bars) nextState = "NONE";
       break;
    case "ARMED":
       if (isTriggered(tickerData, cfg)) nextState = "TRIGGERED";
       if (ageBars > cfg.max_armed_age_bars) nextState = "SETUP";
       break;
    // ... etc.
  }
  */

  if (nextState !== currentState) {
    ageBars = 0; // Reset age on transition
  } else {
    ageBars += 1; // Increment age
  }

  return {
    state: nextState,
    state_age_bars: ageBars,
    signal_allowed: signalAllowed,
    regime_suppressed: regime.regime_tag === "DOWN" && !signalAllowed
  };
}
