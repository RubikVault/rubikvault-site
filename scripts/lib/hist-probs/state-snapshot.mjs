#!/usr/bin/env node
/**
 * State Snapshot for hist_probs runs.
 *
 * Produces a compact, version-hashed snapshot of all ticker states after a run.
 * Both backfill and incremental runs write identical snapshot format.
 *
 * Usage:
 *   import { buildStateSnapshot, writeStateSnapshot, readStateSnapshot } from './state-snapshot.mjs';
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const DEFAULT_SNAPSHOT_DIR = path.join(REPO_ROOT, 'public/data/hist-probs/snapshots');

/**
 * Build a state-snapshot object from checkpoint store data and run summary.
 * @param {object} checkpointStore - The loaded checkpoint store (from checkpoint-store.mjs)
 * @param {object} runSummary - The run-summary.json content
 * @returns {object} snapshot
 */
export function buildStateSnapshot(checkpointStore, runSummary) {
  const tickers = Object.entries(checkpointStore.tickers || {}).map(([ticker, state]) => ({
    ticker,
    status: state.status || 'unknown',
    latest_date: state.latest_date || null,
    version_hash: computeVersionHash({
      schema_version: state.schema_version,
      feature_core_version: state.feature_core_version,
      outcome_logic_version: state.outcome_logic_version,
    }),
    computed_at: state.computed_at || state.updated_at || null,
  }));

  const statusCounts = {};
  for (const t of tickers) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }

  return {
    schema: 'rv_hist_probs_state_snapshot_v1',
    generated_at: new Date().toISOString(),
    run_summary: {
      ran_at: runSummary?.ran_at || null,
      schema_version: runSummary?.schema_version || null,
      feature_core_version: runSummary?.feature_core_version || null,
      outcome_logic_version: runSummary?.outcome_logic_version || null,
      source_mode: runSummary?.source_mode || null,
      asset_classes: runSummary?.asset_classes || [],
      tickers_total: runSummary?.tickers_total ?? null,
      tickers_covered: runSummary?.tickers_covered ?? null,
      tickers_remaining: runSummary?.tickers_remaining ?? null,
      tickers_errors: runSummary?.tickers_errors ?? null,
    },
    status_counts: statusCounts,
    ticker_count: tickers.length,
    tickers,
  };
}

/**
 * Compute a short version hash from version fields.
 * @param {object} versions - { schema_version, feature_core_version, outcome_logic_version }
 * @returns {string} 8-char hex hash
 */
export function computeVersionHash(versions) {
  const input = [
    versions.schema_version || '',
    versions.feature_core_version || '',
    versions.outcome_logic_version || '',
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Write state snapshot to disk. Filename includes date for retention.
 * @param {object} snapshot
 * @param {string} [snapshotDir]
 * @returns {string} written file path
 */
export function writeStateSnapshot(snapshot, snapshotDir = DEFAULT_SNAPSHOT_DIR) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = path.join(snapshotDir, `state-snapshot-${dateStr}.json`);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);

  // Also write latest symlink-equivalent
  const latestPath = path.join(snapshotDir, 'state-snapshot-latest.json');
  const latestTmp = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(latestTmp, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  fs.renameSync(latestTmp, latestPath);

  return filePath;
}

/**
 * Read the latest state snapshot from disk.
 * @param {string} [snapshotDir]
 * @returns {object|null}
 */
export function readStateSnapshot(snapshotDir = DEFAULT_SNAPSHOT_DIR) {
  const latestPath = path.join(snapshotDir, 'state-snapshot-latest.json');
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * List available snapshot files sorted by date (newest first).
 * @param {string} [snapshotDir]
 * @returns {string[]} File paths
 */
export function listSnapshots(snapshotDir = DEFAULT_SNAPSHOT_DIR) {
  try {
    return fs.readdirSync(snapshotDir)
      .filter((name) => /^state-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .reverse()
      .map((name) => path.join(snapshotDir, name));
  } catch {
    return [];
  }
}

/**
 * Cleanup snapshots older than maxAgeDays.
 * @param {object} [options]
 * @param {number} [options.maxAgeDays=30]
 * @param {string} [options.snapshotDir]
 * @returns {{ removed: number }}
 */
export function cleanupSnapshots({ maxAgeDays = 30, snapshotDir = DEFAULT_SNAPSHOT_DIR } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  let removed = 0;
  for (const filePath of listSnapshots(snapshotDir)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed += 1;
      }
    } catch {
      // skip
    }
  }
  return { removed };
}
