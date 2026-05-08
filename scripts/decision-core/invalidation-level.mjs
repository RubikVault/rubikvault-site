import { finiteNumber } from './shared.mjs';

export function buildInvalidationLevel({ action, setup, features } = {}) {
  if (action !== 'BUY' && action !== 'WAIT') return emptyInvalidation();
  const close = finiteNumber(features?.close);
  const atr = finiteNumber(features?.atr14);
  const sma20 = finiteNumber(features?.sma20);
  const sma50 = finiteNumber(features?.sma50);
  if (close == null || atr == null) return emptyInvalidation();
  const base = setup?.primary_setup === 'trend_continuation'
    ? (sma50 ?? close - atr * 2)
    : setup?.primary_setup === 'pullback'
      ? (sma50 ?? close - atr * 1.5)
      : (sma20 ?? close - atr * 1.25);
  const level = Math.min(close - atr, base);
  return {
    invalidation_level: Number(level.toFixed(4)),
    invalidation_reason: setup?.primary_setup === 'none' ? 'No active setup thesis.' : 'Setup fails below key support/ATR structure.',
    setup_failed_if: 'close_below_invalidation_level',
  };
}

export function emptyInvalidation() {
  return {
    invalidation_level: null,
    invalidation_reason: null,
    setup_failed_if: null,
  };
}
