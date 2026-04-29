export const MAX_STALE_MS = {
  page_core_daily: 48 * 60 * 60 * 1000,
  quote_live: 5 * 60 * 1000,
  governance: 30 * 24 * 60 * 60 * 1000,
  fundamentals: 45 * 24 * 60 * 60 * 1000,
};

export function evaluateFreshness(freshness = {}, maxStaleMs = MAX_STALE_MS.page_core_daily, nowMs = Date.now()) {
  const explicitStatus = String(freshness?.status || '').trim().toLowerCase();
  const asOf = freshness?.as_of || freshness?.generated_at || null;
  const staleAfter = freshness?.stale_after || null;
  const sourceTime = staleAfter || asOf;
  const parsed = sourceTime ? Date.parse(sourceTime) : NaN;
  if (!Number.isFinite(parsed)) {
    return { status: explicitStatus || 'missing', age_ms: null, expired: true };
  }
  const ageMs = Math.max(0, nowMs - parsed);
  const expired = ageMs > maxStaleMs;
  if (expired) return { status: 'expired', age_ms: ageMs, expired: true };
  if (explicitStatus === 'stale' || explicitStatus === 'missing') {
    return { status: explicitStatus, age_ms: ageMs, expired: false };
  }
  return { status: 'fresh', age_ms: ageMs, expired: false };
}
