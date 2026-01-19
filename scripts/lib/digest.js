/**
 * Digest Library - Canonical JSON SHA256
 * 
 * Provides deterministic hashing for data integrity and deduplication.
 * 
 * Rules:
 * - Keys are alphabetically sorted
 * - No whitespace variations
 * - Stable across different JSON stringifiers
 * 
 * Usage:
 *   const digest = computeDigest(data);
 *   const match = verifyDigest(data, expectedDigest);
 */

import crypto from 'node:crypto';

/**
 * Canonicalize JSON object for deterministic hashing
 * @param {any} obj - Object to canonicalize
 * @returns {string} Canonical JSON string
 */
export function canonicalJSON(obj) {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJSON(item)).join(',') + ']';
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => {
      const value = canonicalJSON(obj[key]);
      return `"${key}":${value}`;
    });
    return '{' + pairs.join(',') + '}';
  }
  
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  
  return String(obj);
}

/**
 * Compute SHA256 digest of data
 * @param {any} data - Data to hash (will be canonicalized)
 * @returns {string} Digest in format "sha256:..."
 */
export function computeDigest(data) {
  const canonical = canonicalJSON(data);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute digest for snapshot (minimal metadata + data)
 * @param {object} snapshot - Snapshot object with data and metadata
 * @returns {string} Digest
 */
export function computeSnapshotDigest(snapshot) {
  // Only include stable fields in digest
  const digestData = {
    schema_version: snapshot.schema_version || snapshot.metadata?.schema_version,
    module: snapshot.metadata?.module,
    source: snapshot.metadata?.source,
    record_count: snapshot.metadata?.record_count,
    data: snapshot.data
  };
  
  return computeDigest(digestData);
}

/**
 * Verify digest matches data
 * @param {any} data - Data to verify
 * @param {string} expectedDigest - Expected digest
 * @returns {boolean} True if match
 */
export function verifyDigest(data, expectedDigest) {
  const actualDigest = computeDigest(data);
  return actualDigest === expectedDigest;
}

/**
 * Compare two digests
 * @param {string} digest1
 * @param {string} digest2
 * @returns {boolean} True if equal
 */
export function digestsEqual(digest1, digest2) {
  return digest1 === digest2;
}

/**
 * Extract hash from digest (remove "sha256:" prefix)
 * @param {string} digest
 * @returns {string} Hash only
 */
export function extractHash(digest) {
  if (!digest) return '';
  return digest.replace(/^sha256:/, '');
}

/**
 * Validate digest format
 * @param {string} digest
 * @returns {boolean} True if valid format
 */
export function isValidDigest(digest) {
  return /^sha256:[a-f0-9]{64}$/.test(digest);
}

export default {
  canonicalJSON,
  computeDigest,
  computeSnapshotDigest,
  verifyDigest,
  digestsEqual,
  extractHash,
  isValidDigest
};
