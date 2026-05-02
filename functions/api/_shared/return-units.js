// Shared util: normalize daily_change_pct to canonical decimal form.
// Used by both server-side page-core builder and client-side V2 transformer
// so the API serves canonical decimals and the client only needs detection
// as defense-in-depth (idempotent for already-decimal values).

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeReturnDecimal({ pct = null, abs = null, close = null } = {}) {
  const raw = finiteNumber(pct);
  if (raw == null) return { value: null, status: 'missing', reason: 'return missing' };
  const absChange = finiteNumber(abs);
  const lastClose = finiteNumber(close);
  if (absChange != null && lastClose != null) {
    const prevClose = lastClose - absChange;
    if (prevClose > 0) {
      const expected = absChange / prevClose;
      if (Math.abs(raw - expected) <= 0.0005) {
        return { value: Number(expected.toFixed(8)), status: 'ok', reason: null, expected };
      }
      if (Math.abs((raw / 100) - expected) <= 0.0005) {
        return {
          value: Number(expected.toFixed(8)),
          status: 'normalized_percent_unit',
          reason: 'daily_change_pct percent-unit normalized to decimal',
          raw,
          expected,
        };
      }
      return {
        value: raw,
        status: 'mismatch',
        reason: 'daily_change_pct mismatches daily_change_abs and last_close',
        raw,
        expected,
      };
    }
  }
  return {
    value: raw,
    status: Math.abs(raw) > 1 ? 'implausible' : 'ok',
    reason: Math.abs(raw) > 1 ? 'return plausibility failed' : null,
  };
}

export function normalizeChangeObject(change = {}, close = null) {
  const result = normalizeReturnDecimal({
    pct: change?.pct ?? change?.daily_change_pct,
    abs: change?.abs ?? change?.daily_change_abs,
    close,
  });
  return {
    ...change,
    pct: result.value,
    daily_change_pct: result.value,
    _rv_return_integrity: result,
  };
}
