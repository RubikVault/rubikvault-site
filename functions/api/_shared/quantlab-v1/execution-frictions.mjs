/**
 * QuantLab V1 — Execution Frictions
 * Estimates real-world trading costs for outcome adjustment.
 */

const SPREAD_BY_LIQUIDITY = Object.freeze({
  high: 0.0003,    // 0.03%
  medium: 0.001,   // 0.10%
  low: 0.003,      // 0.30%
});

const SLIPPAGE_BY_VOL = Object.freeze({
  low: 0.0005,     // 0.05%
  medium: 0.001,   // 0.10%
  high: 0.003,     // 0.30%
});

/**
 * Estimate execution frictions for a signal.
 * @param {Object} params
 * @param {number} params.close
 * @param {number|null} params.atr
 * @param {string} params.volatility_bucket - 'low'|'medium'|'high'
 * @param {string|null} params.liquidity_bucket - 'low'|'medium'|'high'
 * @returns {{ estimated_slippage: number, estimated_spread: number, friction_total: number, friction_pct: number }}
 */
export function estimateFrictions({ close, atr, volatility_bucket, liquidity_bucket }) {
  const liq = liquidity_bucket || 'medium';
  const vol = volatility_bucket || 'medium';

  const spreadPct = SPREAD_BY_LIQUIDITY[liq] || SPREAD_BY_LIQUIDITY.medium;
  const slippagePct = SLIPPAGE_BY_VOL[vol] || SLIPPAGE_BY_VOL.medium;

  // ATR-based slippage boost if ATR is disproportionately large
  let atrBoost = 0;
  if (atr != null && close > 0) {
    const atrPct = atr / close;
    if (atrPct > 0.03) atrBoost = (atrPct - 0.03) * 0.1; // modest extra
  }

  const totalSlippagePct = slippagePct + atrBoost;
  const totalPct = spreadPct + totalSlippagePct;

  return {
    estimated_spread: close > 0 ? close * spreadPct : 0,
    estimated_slippage: close > 0 ? close * totalSlippagePct : 0,
    friction_total: close > 0 ? close * totalPct : 0,
    friction_pct: totalPct,
  };
}

/**
 * Compute net outcome after friction.
 * @param {number|null} grossReturn - Raw return (e.g., 0.05 = +5%)
 * @param {{ friction_pct: number }} frictions
 * @returns {{ gross: number|null, net: number|null, friction_impact: number }}
 */
export function computeNetOutcome(grossReturn, frictions) {
  if (grossReturn == null) return { gross: null, net: null, friction_impact: 0 };
  // Round-trip friction: entry + exit
  const roundTripFriction = (frictions?.friction_pct || 0) * 2;
  return {
    gross: grossReturn,
    net: grossReturn - roundTripFriction,
    friction_impact: roundTripFriction,
  };
}
