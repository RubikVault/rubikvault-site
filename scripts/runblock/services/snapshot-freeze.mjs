/**
 * RUNBLOCK v3.0 — Snapshot Freezing & Feature Hashing
 *
 * Every model decision relies on an immutable frozen snapshot.
 * Snapshots are append-only, never overwritten.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Compute deterministic feature hash.
 *
 * feature_hash = SHA256(sorted_features + feature_version + code_version + asof_timestamp + source_versions)
 */
export function computeFeatureHash({ features, featureVersion, codeVersion, asofTimestamp, sourceVersions }) {
  const sorted = Object.keys(features || {}).sort().map(k => `${k}=${features[k]}`).join('|');
  const payload = [
    sorted,
    String(featureVersion || ''),
    String(codeVersion || ''),
    String(asofTimestamp || ''),
    JSON.stringify(sourceVersions || {}),
  ].join('::');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Create an immutable snapshot record.
 *
 * @param {Object} params
 * @returns {Object} snapshot with snapshot_id and feature_hash
 */
export function createSnapshot({
  ticker,
  tradingDate,
  asofTimestamp,
  features = {},
  featureVersion,
  ruleVersion,
  regimeVersion,
  modelVersion,
  calibrationVersion,
  costModelVersion,
  dataQualityState,
  sourceVersions = {},
  codeVersion,
}) {
  const snapshotId = crypto.randomUUID();
  const knowledgeTime = new Date().toISOString();
  const featureHash = computeFeatureHash({
    features,
    featureVersion,
    codeVersion,
    asofTimestamp,
    sourceVersions,
  });

  return {
    snapshot_id: snapshotId,
    asof_timestamp: asofTimestamp,
    trading_date: tradingDate,
    ticker,
    source_versions: sourceVersions,
    feature_version: featureVersion,
    rule_version: ruleVersion,
    regime_version: regimeVersion,
    model_version: modelVersion,
    calibration_version: calibrationVersion,
    cost_model_version: costModelVersion,
    data_quality_state: dataQualityState,
    feature_hash: featureHash,
    knowledge_time: knowledgeTime,
    valid_time: asofTimestamp,
    features,
  };
}

/**
 * Persist snapshot to append-only storage.
 * Each snapshot gets its own file (immutable, never overwritten).
 */
export async function persistSnapshot(rootDir, snapshot, config = {}) {
  const storageDir = path.join(rootDir, config.snapshot_storage || 'public/data/v3/snapshots');
  const dateDir = path.join(storageDir, snapshot.trading_date || 'unknown');
  await fs.mkdir(dateDir, { recursive: true });

  const fileName = `${snapshot.ticker}_${snapshot.snapshot_id}.json`;
  const filePath = path.join(dateDir, fileName);

  // Append-only: never overwrite
  try {
    await fs.access(filePath);
    throw new Error(`SNAPSHOT_IMMUTABLE_VIOLATION: ${filePath} already exists`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  return filePath;
}
