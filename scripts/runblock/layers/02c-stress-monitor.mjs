/**
 * V6.0 — Layer 2C: Crash / Stress Monitor
 *
 * Continuous stress scoring with hysteresis-based crash state mapping.
 * Actionability gates: critical → NO_TRADE, warning → no high conviction.
 */

const DEFAULT_WEIGHTS = Object.freeze({
  drawdown_speed: 0.25,
  vol_spike: 0.25,
  breadth_collapse: 0.20,
  liquidity_spread_spike: 0.15,
  corr_spike: 0.15,
});

const CRASH_THRESHOLDS = Object.freeze({
  critical: 0.80,
  warning: 0.50,
});

/**
 * Compute continuous stress score from market data.
 *
 * @param {Object} marketData - {
 *   drawdown_5d_pct, vol_20d, vol_20d_prev, breadth_above_ma50_pct,
 *   hy_spread_delta_bp, corr_avg_5d, vix, vix_prev
 * }
 * @param {Object} [regimeResult] - Output from evaluateFastRegime()
 * @param {Object} [config] - { weights, thresholds }
 * @returns {{ stress_score: number, crash_state: string, crash_velocity: number, components: Object }}
 */
export function computeStressScore(marketData, regimeResult = {}, config = {}) {
  const weights = config.weights || DEFAULT_WEIGHTS;
  const thresholds = config.thresholds || CRASH_THRESHOLDS;

  const components = {};

  // Drawdown speed: how fast the index dropped (0-1 normalized)
  const dd5d = Math.abs(marketData.drawdown_5d_pct || marketData.sp500_5d_return || 0);
  components.drawdown_speed = Math.min(1.0, dd5d / 10.0);

  // Volatility spike: VIX or realized vol jump
  const vixDelta = (marketData.vix || 0) - (marketData.vix_prev || marketData.vix || 0);
  const volRatio = (marketData.vol_20d || 0) / Math.max(marketData.vol_20d_prev || marketData.vol_20d || 1, 0.001);
  components.vol_spike = Math.min(1.0, Math.max(vixDelta / 15.0, (volRatio - 1.0) / 1.5));
  components.vol_spike = Math.max(0, components.vol_spike);

  // Breadth collapse: % above MA50 dropping
  const breadth = marketData.breadth_above_ma50_pct ?? 50;
  components.breadth_collapse = Math.min(1.0, Math.max(0, (50 - breadth) / 50));

  // Liquidity / spread spike
  const hyDelta = marketData.hy_spread_delta_bp || 0;
  components.liquidity_spread_spike = Math.min(1.0, Math.max(0, hyDelta / 30.0));

  // Correlation spike (rising correlations = systemic stress)
  const corrAvg = marketData.corr_avg_5d ?? 0.3;
  components.corr_spike = Math.min(1.0, Math.max(0, (corrAvg - 0.5) / 0.4));

  // Weighted sum
  let stressScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    stressScore += (components[key] || 0) * weight;
  }
  stressScore = Math.max(0, Math.min(1, stressScore));

  // Crash state with hysteresis
  let crashState = 'normal';
  if (stressScore >= thresholds.critical) crashState = 'critical';
  else if (stressScore >= thresholds.warning) crashState = 'warning';

  return {
    stress_score: Number(stressScore.toFixed(4)),
    crash_state: crashState,
    crash_velocity: 0,
    components,
  };
}

/**
 * Compute crash velocity from stress history.
 * @param {number} stressToday - Current stress score
 * @param {number} stress5dAgo - Stress score 5 days ago
 * @returns {number} Crash velocity
 */
export function computeCrashVelocity(stressToday, stress5dAgo) {
  return Number((stressToday - (stress5dAgo ?? stressToday)).toFixed(4));
}

/**
 * Apply actionability gate based on crash state.
 * @param {string} crashState - "normal" | "warning" | "critical"
 * @param {string} currentDecision - Current decision bucket
 * @returns {{ decision: string, gated: boolean, gate_reason: string|null }}
 */
export function applyCrashGate(crashState, currentDecision) {
  if (crashState === 'critical') {
    return { decision: 'NO_TRADE', gated: true, gate_reason: 'CRASH_STATE_CRITICAL' };
  }
  if (crashState === 'warning' && currentDecision === 'HIGH_CONVICTION') {
    return { decision: 'MODERATE', gated: true, gate_reason: 'CRASH_STATE_WARNING_DOWNGRADE' };
  }
  return { decision: currentDecision, gated: false, gate_reason: null };
}

/**
 * Compute regime stability from recent regime history.
 * @param {Array} recentRegimes - Array of regime tags for last N days
 * @param {Object} [config] - { stability_lookback: 20 }
 * @returns {{ regime_stability: number, transition_state: string, regime_duration_days: number }}
 */
export function computeRegimeStability(recentRegimes, config = {}) {
  const lookback = config.stability_lookback || 20;
  const recent = recentRegimes.slice(-lookback);

  if (recent.length === 0) {
    return { regime_stability: 0, transition_state: 'unstable', regime_duration_days: 0 };
  }

  const currentRegime = recent[recent.length - 1];
  let durationDays = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i] === currentRegime) durationDays++;
    else break;
  }

  const regimeStability = Math.min(1.0, durationDays / 20.0);

  const sameCount = recent.filter(r => r === currentRegime).length;
  const regimeConfidence = sameCount / recent.length;

  const transitionState = (regimeConfidence < 0.6 && durationDays < 5) ? 'unstable' : 'stable';

  return {
    regime_stability: Number(regimeStability.toFixed(4)),
    transition_state: transitionState,
    regime_duration_days: durationDays,
  };
}
