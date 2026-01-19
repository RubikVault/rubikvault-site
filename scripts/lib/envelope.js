/**
 * Snapshot Envelope Builder v3.0
 * 
 * Creates Mission Control v3.0 compliant snapshot envelopes
 * with validation metadata, freshness, and upstream tracking.
 */

import { computeSnapshotDigest } from './digest.js';

/**
 * Build a v3.0 snapshot envelope
 * @param {object} params - Envelope parameters
 * @param {string} params.module - Module name
 * @param {string} params.tier - Module tier (critical|standard|experimental)
 * @param {string} params.domain - Domain (macro|stocks|crypto|fx|altdata)
 * @param {string} params.source - Data source identifier
 * @param {Array} params.data - Data array
 * @param {Date|string} params.fetchedAt - Fetch timestamp
 * @param {Date|string} params.publishedAt - Publish timestamp (optional, defaults to fetchedAt)
 * @param {object} params.upstream - Upstream metadata (optional)
 * @param {object} params.validation - Validation results (optional)
 * @param {object} params.freshness - Freshness config (optional)
 * @returns {object} v3.0 Envelope
 */
export function buildEnvelope({
  module,
  tier,
  domain,
  source,
  data,
  fetchedAt,
  publishedAt,
  upstream = {},
  validation = { passed: true, dropped_records: 0, drop_ratio: 0, checks: [], warnings: [] },
  freshness = {}
}) {
  const fetchedAtIso = fetchedAt instanceof Date ? fetchedAt.toISOString() : fetchedAt;
  const publishedAtIso = publishedAt instanceof Date 
    ? publishedAt.toISOString() 
    : (publishedAt || fetchedAtIso);

  const recordCount = Array.isArray(data) ? data.length : (data ? 1 : 0);

  const envelope = {
    schema_version: "3.0",
    metadata: {
      module,
      tier,
      domain,
      source,
      fetched_at: fetchedAtIso,
      published_at: publishedAtIso,
      digest: null, // Will be computed after
      record_count: recordCount,
      expected_count: freshness.expected_count || null,
      validation: {
        passed: validation.passed ?? true,
        dropped_records: validation.dropped_records || 0,
        drop_ratio: validation.drop_ratio || 0,
        checks: validation.checks || [],
        warnings: validation.warnings || []
      },
      freshness: {
        expected_interval_minutes: freshness.expected_interval_minutes || null,
        grace_minutes: freshness.grace_minutes || null,
        policy: freshness.policy || "always",
        age_minutes: null, // Computed at runtime
        next_expected_at: null // Computed at runtime
      },
      upstream: {
        http_status: upstream.http_status || null,
        latency_ms: upstream.latency_ms || null,
        rate_limit_remaining: upstream.rate_limit_remaining || null,
        retry_count: upstream.retry_count || 0
      }
    },
    data: data || [],
    error: null
  };

  // Compute digest after structure is complete
  envelope.metadata.digest = computeSnapshotDigest(envelope);

  return envelope;
}

/**
 * Compute age and freshness metadata
 * @param {object} envelope - Envelope to update
 * @param {object} freshnessConfig - Freshness configuration
 * @returns {object} Updated envelope with computed freshness
 */
export function computeFreshness(envelope, freshnessConfig) {
  if (!envelope.metadata.fetched_at) return envelope;

  const fetchedAt = new Date(envelope.metadata.fetched_at);
  const now = new Date();
  const ageMinutes = Math.floor((now - fetchedAt) / (1000 * 60));

  const expectedInterval = freshnessConfig.expected_interval_minutes || 1440;
  const graceMinutes = freshnessConfig.grace_minutes || 120;
  const nextExpected = new Date(fetchedAt);
  nextExpected.setMinutes(nextExpected.getMinutes() + expectedInterval);

  envelope.metadata.freshness = {
    expected_interval_minutes: expectedInterval,
    grace_minutes: graceMinutes,
    policy: freshnessConfig.policy || "always",
    age_minutes: ageMinutes,
    next_expected_at: nextExpected.toISOString()
  };

  return envelope;
}

/**
 * Validate envelope schema
 * @param {object} envelope - Envelope to validate
 * @returns {object} Validation result { valid: boolean, errors: string[] }
 */
export function validateEnvelopeSchema(envelope) {
  const errors = [];

  if (!envelope.schema_version || envelope.schema_version !== "3.0") {
    errors.push("schema_version must be '3.0'");
  }

  const meta = envelope.metadata;
  if (!meta) {
    errors.push("metadata is required");
    return { valid: false, errors };
  }

  const required = ['module', 'tier', 'domain', 'source', 'fetched_at', 'digest', 'record_count'];
  for (const field of required) {
    if (meta[field] === undefined || meta[field] === null) {
      errors.push(`metadata.${field} is required`);
    }
  }

  if (!Array.isArray(envelope.data)) {
    errors.push("data must be an array");
  }

  if (!meta.validation || typeof meta.validation.passed !== 'boolean') {
    errors.push("metadata.validation.passed must be a boolean");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
