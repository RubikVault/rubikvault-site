import { STATIC_FRESHNESS_TTL_V2 } from '../../../config/freshness-ttl.v2.js';

const config = STATIC_FRESHNESS_TTL_V2 || {
  defaults: { cache_ttl_seconds: 21600, swr_mark_ttl_seconds: 120, degrade_after_seconds: 86400, max_stale_days: 14, pending_window_minutes: 120 },
  endpoints: {},
};

const defaults = config.defaults || {};
const endpoints = config.endpoints || {};

/**
 * Get TTL config for a specific endpoint, falling back to defaults.
 * @param {string} endpointId - e.g. 'stock', 'v2_summary', 'v2_historical', 'v2_governance'
 * @returns {{ cache_ttl_seconds: number, swr_mark_ttl_seconds: number, degrade_after_seconds: number, max_stale_days: number, pending_window_minutes: number }}
 */
export function getEndpointTTL(endpointId) {
  const ep = endpoints[endpointId] || {};
  return {
    cache_ttl_seconds: ep.cache_ttl_seconds ?? defaults.cache_ttl_seconds ?? 21600,
    swr_mark_ttl_seconds: ep.swr_mark_ttl_seconds ?? defaults.swr_mark_ttl_seconds ?? 120,
    degrade_after_seconds: ep.degrade_after_seconds ?? defaults.degrade_after_seconds ?? 86400,
    max_stale_days: ep.max_stale_days ?? defaults.max_stale_days ?? 14,
    pending_window_minutes: ep.pending_window_minutes ?? defaults.pending_window_minutes ?? 120,
  };
}

/**
 * Get the default TTL config.
 */
export function getDefaultTTL() {
  return { ...defaults };
}
