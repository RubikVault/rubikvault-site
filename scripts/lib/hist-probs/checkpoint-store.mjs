#!/usr/bin/env node
/**
 * Checkpoint Store for hist_probs per-ticker state.
 *
 * Tracks which tickers have been processed, their schema/feature/outcome versions,
 * and enables version-mismatch detection for forced cold-rebuilds.
 *
 * Storage: single JSON file with per-ticker entries.
 * Atomic writes via tmp+rename.
 *
 * Usage:
 *   import { loadCheckpoints, saveCheckpoints, getTickerState, setTickerState, needsColdRebuild } from './checkpoint-store.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const DEFAULT_CHECKPOINT_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/checkpoints.json');
const PRETTY_CHECKPOINTS = process.env.HIST_PROBS_PRETTY_JSON === '1' || process.env.RV_HIST_PROBS_PRETTY_JSON === '1';

/**
 * Load checkpoint store from disk.
 * @param {string} [checkpointPath]
 * @returns {{ schema: string, updated_at: string|null, tickers: Record<string, object> }}
 */
export function loadCheckpoints(checkpointPath = DEFAULT_CHECKPOINT_PATH) {
  try {
    const raw = fs.readFileSync(checkpointPath, 'utf8');
    const doc = JSON.parse(raw);
    if (doc && typeof doc === 'object' && doc.tickers) return doc;
  } catch {
    // fall through
  }
  return {
    schema: 'rv_hist_probs_checkpoints_v1',
    updated_at: null,
    tickers: {},
  };
}

/**
 * Save checkpoint store atomically.
 * @param {object} store
 * @param {string} [checkpointPath]
 */
export function saveCheckpoints(store, checkpointPath = DEFAULT_CHECKPOINT_PATH) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const payload = {
    ...store,
    schema: 'rv_hist_probs_checkpoints_v1',
    updated_at: new Date().toISOString(),
  };
  const tmpPath = `${checkpointPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${PRETTY_CHECKPOINTS ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)}\n`, 'utf8');
  fs.renameSync(tmpPath, checkpointPath);
}

/**
 * Get the checkpoint state for a single ticker.
 * @param {object} store
 * @param {string} ticker
 * @returns {object|null}
 */
export function getTickerState(store, ticker) {
  return store.tickers[String(ticker).toUpperCase()] || null;
}

/**
 * Set/update the checkpoint state for a single ticker.
 * @param {object} store - mutable
 * @param {string} ticker
 * @param {object} state - { status, latest_date, schema_version, feature_core_version, outcome_logic_version, computed_at }
 */
export function setTickerState(store, ticker, state) {
  const key = String(ticker).toUpperCase();
  store.tickers[key] = {
    ...state,
    ticker: key,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Batch-set multiple ticker states.
 * @param {object} store - mutable
 * @param {Array<{ ticker: string, status: string, latest_date: string|null, schema_version: string, feature_core_version: string, outcome_logic_version: string }>} entries
 */
export function setTickerStates(store, entries) {
  for (const entry of entries) {
    setTickerState(store, entry.ticker, entry);
  }
}

/**
 * Determine if a ticker needs a cold rebuild due to version mismatch.
 * @param {object} store
 * @param {string} ticker
 * @param {object} currentVersions - { schema_version, feature_core_version, outcome_logic_version }
 * @returns {{ needsRebuild: boolean, reason: string|null }}
 */
export function needsColdRebuild(store, ticker, currentVersions) {
  const state = getTickerState(store, ticker);
  if (!state) {
    return { needsRebuild: true, reason: 'no_checkpoint' };
  }
  if (state.status === 'error' || state.status === 'invalid') {
    return { needsRebuild: true, reason: `status_${state.status}` };
  }
  if (state.schema_version !== currentVersions.schema_version) {
    return { needsRebuild: true, reason: `schema_version_mismatch:${state.schema_version}→${currentVersions.schema_version}` };
  }
  if (state.feature_core_version !== currentVersions.feature_core_version) {
    return { needsRebuild: true, reason: `feature_version_mismatch:${state.feature_core_version}→${currentVersions.feature_core_version}` };
  }
  if (state.outcome_logic_version !== currentVersions.outcome_logic_version) {
    return { needsRebuild: true, reason: `outcome_version_mismatch:${state.outcome_logic_version}→${currentVersions.outcome_logic_version}` };
  }
  return { needsRebuild: false, reason: null };
}

/**
 * Count tickers by status.
 * @param {object} store
 * @returns {Record<string, number>}
 */
export function countByStatus(store) {
  const counts = {};
  for (const entry of Object.values(store.tickers)) {
    const status = entry.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

/**
 * List tickers that need cold rebuild given current versions.
 * @param {object} store
 * @param {object} currentVersions
 * @returns {string[]}
 */
export function tickersNeedingRebuild(store, currentVersions) {
  const result = [];
  for (const [ticker] of Object.entries(store.tickers)) {
    const { needsRebuild } = needsColdRebuild(store, ticker, currentVersions);
    if (needsRebuild) result.push(ticker);
  }
  return result;
}
