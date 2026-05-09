import { finiteNumber } from './shared.mjs';

export function resolveP0Setup({ features = {}, regime = {}, eligibility } = {}) {
  if (eligibility?.eligibility_status !== 'ELIGIBLE') {
    return build('none', ['not_decision_grade'], 'NEUTRAL');
  }
  const close = featureNumber(features.close);
  const sma20 = featureNumber(features.sma20);
  const sma50 = featureNumber(features.sma50);
  const sma200 = featureNumber(features.sma200);
  const rsi = featureNumber(features.rsi14);
  const ret20 = featureNumber(features.ret_20d_pct);
  const modifiers = [];
  const bullishStack = close != null && sma20 != null && sma50 != null && sma200 != null && sma20 > sma50 && sma50 > sma200 && close > sma200;
  const bearishStack = close != null && sma20 != null && sma50 != null && sma200 != null && sma20 < sma50 && sma50 < sma200 && close < sma200;
  if (features.close_to_sma20_pct != null && features.close_to_sma20_pct > 0.04) modifiers.push('overextended');
  if (features.close_to_sma20_pct != null && features.close_to_sma20_pct < -0.03) modifiers.push('pullback_watch');
  if (regime.vol_regime === 'high' || regime.vol_regime === 'stress') modifiers.push('event_risk');

  if (bullishStack && ret20 != null && ret20 > 0.02) {
    if (rsi != null && rsi < 45 && sma20 != null && close < sma20) return build('pullback', modifiers, 'BULLISH');
    return build('trend_continuation', modifiers, 'BULLISH');
  }
  if (bullishStack && rsi != null && rsi < 35) {
    return build('mean_reversion', modifiers, 'BULLISH');
  }
  if (bearishStack || (close != null && sma50 != null && close < sma50 && ret20 != null && ret20 < -0.03)) {
    return build('none', ['defensive'], 'BEARISH');
  }
  return build('none', modifiers, 'NEUTRAL');
}

function build(primary_setup, modifiers, bias) {
  return { primary_setup, modifiers, bias };
}

function featureNumber(value) {
  return value == null || value === '' ? null : finiteNumber(value);
}
