/**
 * V2-specific observability helpers.
 * Extends existing patterns from observability.js and telemetry.mjs.
 */

const PREFIX = '[RV_V2]';

/**
 * Log a V2 request event as structured JSON.
 */
export function logV2Request({ endpoint, ticker, durationMs, status, stale, fallbackUsed, source }) {
  console.log(`${PREFIX} ${JSON.stringify({
    event: 'v2_request',
    endpoint: endpoint || null,
    ticker: ticker || null,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    status: status || null,
    stale: Boolean(stale),
    fallback_used: Boolean(fallbackUsed),
    source: source || null,
    ts: new Date().toISOString(),
  })}`);
}

/**
 * Log a V2 fallback event.
 */
export function logV2Fallback({ endpoint, ticker, reason, durationMs }) {
  console.log(`${PREFIX} ${JSON.stringify({
    event: 'v2_fallback',
    endpoint: endpoint || null,
    ticker: ticker || null,
    reason: reason || null,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    ts: new Date().toISOString(),
  })}`);
}

/**
 * Log a V2 gate check result.
 */
export function logV2Gate({ endpoint, enabled }) {
  console.log(`${PREFIX} ${JSON.stringify({
    event: 'v2_gate',
    endpoint: endpoint || null,
    enabled: Boolean(enabled),
    ts: new Date().toISOString(),
  })}`);
}

/**
 * Build debug metadata for V2 responses (shown when ?debug=1).
 */
export function buildV2DebugMeta({ endpoint, timings, cacheStatus, gateChecked, source }) {
  return {
    v2_debug: {
      endpoint,
      timings: timings || {},
      cache_status: cacheStatus || null,
      gate_checked: Boolean(gateChecked),
      source: source || null,
    },
  };
}
