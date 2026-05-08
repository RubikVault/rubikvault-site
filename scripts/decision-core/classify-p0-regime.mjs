import { finiteNumber } from './shared.mjs';

export function classifyP0Regime(features = {}, policy = {}) {
  const close = finiteNumber(features.close);
  const sma50 = finiteNumber(features.sma50);
  const ret20 = finiteNumber(features.ret_20d_pct);
  let trend_regime = 'unknown';
  if (close != null && sma50 != null && ret20 != null) {
    if (close > sma50 && ret20 > 0.01) trend_regime = 'up';
    else if (close < sma50 && ret20 < -0.01) trend_regime = 'down';
    else trend_regime = 'sideways';
  }
  const vol = finiteNumber(features.volatility_percentile);
  const stressMin = Number(policy?.regime_policy?.stress_vol_percentile || 90);
  let vol_regime = 'unknown';
  if (vol != null) {
    if (vol >= stressMin) vol_regime = 'stress';
    else if (vol >= 75) vol_regime = 'high';
    else if (vol <= 25) vol_regime = 'low';
    else vol_regime = 'normal';
  }
  return {
    method: 'sma50_slope_atr_percentile_v1',
    trend_regime,
    vol_regime,
  };
}

export function isMarketRegimeRed(regime, policy = {}) {
  return regime?.vol_regime === 'stress' && policy?.regime_policy?.red_conditions?.includes?.('vol_regime=stress');
}
