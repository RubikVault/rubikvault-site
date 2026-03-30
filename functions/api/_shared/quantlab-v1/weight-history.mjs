/**
 * QuantLab V1 — Weight History
 * Versioned weight snapshots with SHA-256 integrity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { hashSnapshot } from './snapshot-integrity.mjs';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
const WEIGHTS_DIR = path.join(REPO_ROOT, 'mirrors/learning/quantlab-v1/weights');

function ensureDir() {
  if (!fs.existsSync(WEIGHTS_DIR)) fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
}

/**
 * Default equal-weight prior for all sources.
 */
const DEFAULT_WEIGHTS = Object.freeze({
  forecast: 0.20,
  scientific: 0.20,
  elliott: 0.15,
  quantlab: 0.15,
  breakout_v2: 0.15,
  hist_probs: 0.15,
});

/**
 * Save a weight snapshot.
 * @param {Object} weights - Source-keyed weight map (can be nested by segment)
 * @param {Object} metadata
 * @param {string} metadata.version
 * @param {string} [metadata.fallback_level]
 * @param {string} [metadata.trigger]
 * @returns {Object} Saved snapshot with hash
 */
export function saveWeightSnapshot(weights, metadata = {}) {
  ensureDir();
  const version = metadata.version || `w-${Date.now()}`;
  const snapshot = {
    version,
    timestamp: new Date().toISOString(),
    fallback_level: metadata.fallback_level || 'none',
    trigger: metadata.trigger || 'manual',
    weights,
    hash: hashSnapshot(weights),
  };
  const filePath = path.join(WEIGHTS_DIR, `${version}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  // Also update latest symlink-style file
  const latestPath = path.join(WEIGHTS_DIR, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  return snapshot;
}

/**
 * Load the latest weight snapshot.
 * Falls back to default equal weights if none exists.
 * @returns {Object} { version, weights, hash, fallback_level, timestamp }
 */
export function loadLatestWeights() {
  const latestPath = path.join(WEIGHTS_DIR, 'latest.json');
  if (fs.existsSync(latestPath)) {
    try {
      return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    } catch {
      // Corrupted — fall through to default
    }
  }
  return {
    version: 'default-prior',
    timestamp: new Date().toISOString(),
    fallback_level: 'global_prior',
    trigger: 'initialization',
    weights: { ...DEFAULT_WEIGHTS },
    hash: hashSnapshot(DEFAULT_WEIGHTS),
  };
}

/**
 * Load the N most recent weight snapshots.
 * @param {number} n
 * @returns {Object[]}
 */
export function loadWeightHistory(n = 10) {
  ensureDir();
  const files = fs.readdirSync(WEIGHTS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'latest.json')
    .sort()
    .slice(-n);

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(WEIGHTS_DIR, f), 'utf8'));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Get the default weight prior.
 * @returns {Object}
 */
export function getDefaultWeights() {
  return { ...DEFAULT_WEIGHTS };
}
