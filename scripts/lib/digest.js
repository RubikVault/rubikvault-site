/**
 * Canonical JSON Digest (SHA256)
 * 
 * Produces deterministic hashes for data deduplication.
 * Follows Mission Control v3.0 spec: canonical JSON with sorted keys,
 * no whitespace differences, stable across builds.
 */

import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Canonicalize JSON: sort keys, remove whitespace differences
 * @param {any} obj - Object to canonicalize
 * @returns {string} Canonical JSON string
 */
export function canonicalizeJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Compute SHA256 digest of canonical JSON
 * @param {any} data - Data to hash
 * @returns {string} SHA256 hex digest (prefixed with "sha256:")
 */
export function computeDigest(data) {
  const canonical = canonicalizeJson(data);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute digest for snapshot data only (data + minimal metadata)
 * Minimal metadata: module, schema_version, record_count, fetched_at, source
 * @param {object} envelope - Snapshot envelope
 * @returns {string} Digest string
 */
export function computeSnapshotDigest(envelope) {
  const minimal = {
    schema_version: envelope.schema_version,
    module: envelope.metadata?.module,
    record_count: envelope.metadata?.record_count,
    fetched_at: envelope.metadata?.fetched_at,
    source: envelope.metadata?.source,
    data: envelope.data
  };
  return computeDigest(minimal);
}

/**
 * Compute digest for data array only
 * @param {Array} data - Data array
 * @returns {string} Digest string
 */
export function computeDataDigest(data) {
  return computeDigest(data);
}
