import { finiteNumber, nextIsoDate } from './shared.mjs';

export function buildEntryGapGuard({ action, features, targetMarketDate } = {}) {
  if (action !== 'BUY') return emptyGuard();
  const close = finiteNumber(features?.close);
  const atr = finiteNumber(features?.atr14);
  if (close == null || atr == null || close <= 0) return emptyGuard();
  const atrPct = Math.max(0.005, Math.min(0.04, atr / close));
  const gapTolerance = Math.min(0.025, Math.max(0.005, atrPct * 0.5));
  const maxEntry = Number((close * (1 + gapTolerance)).toFixed(4));
  return {
    entry_policy: 'next_session_limit_or_cancel',
    max_entry_price: maxEntry,
    gap_tolerance_pct: Number((gapTolerance * 100).toFixed(3)),
    cancel_if_open_above: maxEntry,
    entry_valid_until: nextIsoDate(targetMarketDate),
  };
}

export function emptyGuard() {
  return {
    entry_policy: 'not_actionable',
    max_entry_price: null,
    gap_tolerance_pct: null,
    cancel_if_open_above: null,
    entry_valid_until: null,
  };
}
