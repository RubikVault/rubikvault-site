/**
 * Capital Rotation Monitor — Confirmation Layer
 * Credit / Dollar / Real Rates / VIX checks.
 */

/**
 * Check credit confirmation via HYG/LQD ratio.
 * Rising HYG/LQD = risk-on confirmation.
 */
export function checkCredit(hygLqdResult) {
  if (!hygLqdResult || hygLqdResult.ramComposite == null) {
    return { direction: 'unknown', strength: 0, state: 'unavailable', supportsRotation: 'mixed', source: 'HYG/LQD', warnings: ['Credit data unavailable'] };
  }
  const ram = hygLqdResult.ramComposite;
  const direction = ram > 0.2 ? 'risk-on' : ram < -0.2 ? 'risk-off' : 'neutral';
  const strength = Math.min(Math.abs(ram) / 2, 1);
  const supports = direction === 'risk-on' ? 'yes' : direction === 'risk-off' ? 'no' : 'mixed';
  return {
    direction,
    strength: Math.round(strength * 100) / 100,
    state: `HYG/LQD ${direction === 'risk-on' ? 'rising' : direction === 'risk-off' ? 'falling' : 'flat'}`,
    supportsRotation: supports,
    source: 'HYG/LQD',
    warnings: []
  };
}

/**
 * Check dollar confirmation via UUP trend.
 * Rising dollar (UUP up) = risk-off signal (contradicts risk-on rotation).
 */
export function checkDollar(uupReturns) {
  if (!uupReturns) {
    return { direction: 'unknown', strength: 0, state: 'unavailable', supportsRotation: 'mixed', source: 'UUP (Dollar Proxy)', warnings: ['Dollar proxy data unavailable'] };
  }
  const ret20 = uupReturns[21] ?? 0;
  const ret60 = uupReturns[63] ?? 0;
  const avgRet = (ret20 + ret60) / 2;
  const direction = avgRet > 0.01 ? 'strengthening' : avgRet < -0.01 ? 'weakening' : 'neutral';
  const strength = Math.min(Math.abs(avgRet) / 0.05, 1);
  // Weakening dollar supports risk-on
  const supports = direction === 'weakening' ? 'yes' : direction === 'strengthening' ? 'no' : 'mixed';
  return {
    direction,
    strength: Math.round(strength * 100) / 100,
    state: `Dollar ${direction}`,
    supportsRotation: supports,
    source: 'UUP (Dollar Proxy)',
    warnings: []
  };
}

/**
 * Check real rates via TIP trend.
 * Rising TIP = falling real rates = supports risk-on.
 */
export function checkRealRates(tipReturns) {
  if (!tipReturns) {
    return { direction: 'unknown', strength: 0, state: 'unavailable', supportsRotation: 'mixed', source: 'TIP (Real Rates Proxy)', warnings: ['Real rates proxy data unavailable'] };
  }
  const ret20 = tipReturns[21] ?? 0;
  const ret60 = tipReturns[63] ?? 0;
  const avgRet = (ret20 + ret60) / 2;
  const direction = avgRet > 0.005 ? 'falling' : avgRet < -0.005 ? 'rising' : 'stable';
  const strength = Math.min(Math.abs(avgRet) / 0.03, 1);
  // Falling real rates supports risk-on
  const supports = direction === 'falling' ? 'yes' : direction === 'rising' ? 'no' : 'mixed';
  return {
    direction,
    strength: Math.round(strength * 100) / 100,
    state: `Real rates ${direction}`,
    supportsRotation: supports,
    source: 'TIP (Real Rates Proxy)',
    warnings: []
  };
}

/**
 * Check VIX / volatility confirmation.
 * Rising VIX = risk-off signal.
 */
export function checkVIX(volZ) {
  if (volZ == null) {
    return { direction: 'unknown', strength: 0, state: 'unavailable', supportsRotation: 'mixed', source: 'Volatility Z-Score', warnings: ['VIX proxy data unavailable'] };
  }
  const direction = volZ > 1.0 ? 'elevated' : volZ < -0.5 ? 'suppressed' : 'normal';
  const strength = Math.min(Math.abs(volZ) / 2.5, 1);
  const supports = direction === 'suppressed' ? 'yes' : direction === 'elevated' ? 'no' : 'mixed';
  return {
    direction,
    strength: Math.round(strength * 100) / 100,
    state: `Volatility ${direction} (z: ${volZ.toFixed(2)})`,
    supportsRotation: supports,
    source: 'Volatility Z-Score',
    warnings: []
  };
}
