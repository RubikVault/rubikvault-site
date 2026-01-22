#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEnvelope, validateEnvelopeSchema } from '../lib/envelope.js';
import { computeSnapshotDigest, computeDigest } from '../lib/digest.js';
import { buildModuleState } from '../lib/module-state.js';
import { computeValidationMetadata } from '../lib/drop-threshold.js';

const BASE_DIR = process.cwd();
const MODULE_NAME = 'market-score';
const SOURCE_MODULE = 'market-stats';
const SCORE_VERSION = '1.0.0';
const DEFAULT_ARTIFACTS_DIR = join(BASE_DIR, 'tmp/phase1-artifacts/market-score');

const HORIZON_CONFIG = {
  short: [
    { key: 'rsi_14', weight: 0.3, type: 'rsi' },
    { key: 'returns_5d', weight: 0.35, type: 'return', scale: 0.015 },
    { key: 'volatility_21d', weight: 0.35, type: 'penalty', baseline: 0.04 }
  ],
  mid: [
    { key: 'momentum_63d', weight: 0.35, type: 'momentum', scale: 0.03 },
    { key: 'distance_to_sma_20', weight: 0.25, type: 'trend', scale: 0.12 },
    { key: 'distance_to_sma_50', weight: 0.2, type: 'trend', scale: 0.15 },
    { key: 'drawdown_current_252d', weight: 0.2, type: 'drawdown' }
  ],
  long: [
    { key: 'momentum_126d', weight: 0.3, type: 'momentum', scale: 0.025 },
    { key: 'momentum_252d', weight: 0.2, type: 'momentum', scale: 0.02 },
    { key: 'volatility_63d', weight: 0.25, type: 'penalty', baseline: 0.05 },
    { key: 'drawdown_max_252d', weight: 0.25, type: 'drawdown' }
  ]
};

const TOTAL_WEIGHTS = Object.values(HORIZON_CONFIG).flat().reduce((sum, comp) => sum + comp.weight, 0);

function clamp(value, min = -1, max = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function normalizeValue(value, config) {
  if (!Number.isFinite(value)) return null;
  switch (config.type) {
    case 'rsi': {
      const normalized = (50 - value) / 50;
      return clamp(normalized);
    }
    case 'return':
    case 'momentum': {
      const scale = config.scale || 0.05;
      return clamp(value / scale);
    }
    case 'trend': {
      const scale = config.scale || 0.1;
      return clamp((value || 0) / scale);
    }
    case 'penalty': {
      const baseline = config.baseline || 0.05;
      return clamp((baseline - value) / baseline);
    }
    case 'drawdown': {
      const scale = config.scale || 0.2;
      return clamp(-value / scale);
    }
    default:
      return null;
  }
}

function computeHorizon(stats, horizonKey) {
  const config = HORIZON_CONFIG[horizonKey];
  const contributions = [];
  let usedWeight = 0;
  let weightedSum = 0;

  for (const component of config) {
    const rawValue = stats?.stats?.[component.key];
    const normalized = normalizeValue(rawValue, component);
    if (normalized === null) continue;
    const code = component.code || component.key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const points = normalized * component.weight;
    usedWeight += component.weight;
    weightedSum += points;
    contributions.push({
      metric: component.key,
      code,
      weight: component.weight,
      value: rawValue,
      normalized,
      points
    });
  }

  const normalizedScore = usedWeight > 0 ? weightedSum / usedWeight : 0;
  const score = Math.round(((normalizedScore + 1) / 2) * 100);
  const confidence = usedWeight / config.reduce((sum, comp) => sum + comp.weight, 0);
  const reasonsTop = contributions
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 5);

  return {
    score: clamp(score, 0, 100),
    confidence: clamp(confidence, 0, 1),
    contributions: reasonsTop,
    components_used: contributions.map((c) => c.metric)
  };
}

export function computeScoresForStats(symbol, statsEntry) {
  const horizonResults = {};
  const inputsUsed = new Set();
  const confidences = [];
  const reasonsTop = {};
  let coverageRatio = statsEntry?.coverage?.coverage_ratio ?? 0;

  for (const horizon of Object.keys(HORIZON_CONFIG)) {
    const result = computeHorizon(statsEntry, horizon);
    horizonResults[horizon] = result.score;
    confidences.push(result.confidence);
    result.contributions.forEach((contrib) => inputsUsed.add(contrib.metric));
    reasonsTop[horizon] = result.contributions;
  }

  const averageConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  return {
    symbol,
    score_short: horizonResults.short,
    score_mid: horizonResults.mid,
    score_long: horizonResults.long,
    confidence: clamp(Math.round(averageConfidence * 1000) / 1000, 0, 1),
    coverage_ratio: typeof coverageRatio === 'number' ? Number(coverageRatio.toFixed(3)) : 0,
    reasons_top: reasonsTop,
    inputs_used: Array.from(inputsUsed).sort(),
    version: SCORE_VERSION,
    weights_digest: computeDigest(HORIZON_CONFIG)
  };
}

async function readJson(path) {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function loadModuleConfig() {
  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
  const registry = await readJson(registryPath);
  const config = registry?.modules?.[MODULE_NAME];
  if (!config) {
    throw new Error(`MODULE_CONFIG_MISSING:${MODULE_NAME}`);
  }
  return config;
}

async function loadSourceSnapshots() {
  const artifactsDir = process.env.ARTIFACTS_DIR ? join(String(process.env.ARTIFACTS_DIR), SOURCE_MODULE) : null;
  const candidates = [];
  if (process.env.BARS_ARTIFACTS_DIR) {
    candidates.push(join(String(process.env.BARS_ARTIFACTS_DIR), SOURCE_MODULE, 'snapshot.json'));
  }
  if (artifactsDir) {
    candidates.push(join(artifactsDir, 'snapshot.json'));
  }
  candidates.push(join(BASE_DIR, 'public/data/snapshots', SOURCE_MODULE, 'latest.json'));

  const snapshots = [];
  for (const path of candidates) {
    try {
      const payload = await readJson(path);
      snapshots.push({ path, snapshot: payload });
    } catch (err) {
      // ignore missing files
    }
  }
  if (snapshots.length === 0) {
    throw new Error('SCORING_INPUT_MISSING');
  }
  return snapshots;
}

function aggregateStats(snapshots) {
  const map = new Map();
  for (const { snapshot } of snapshots) {
    const data = Array.isArray(snapshot?.data) ? snapshot.data : [];
    for (const entry of data) {
      if (!entry || !entry.symbol) continue;
      map.set(entry.symbol, entry);
    }
  }
  return map;
}

function buildHealth(totalSymbols, scoredSymbols) {
  const coverageRatio = totalSymbols ? Math.min(1, scoredSymbols / totalSymbols) : 0;
  return {
    module: MODULE_NAME,
    total_symbols: totalSymbols,
    symbols_scored: scoredSymbols,
    coverage_ratio: Number(coverageRatio.toFixed(3)),
    run_quality: coverageRatio >= 0.95 ? 'OK' : coverageRatio >= 0.5 ? 'DEGRADED' : 'FAILED'
  };
}

async function main() {
  const artifactsOutDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : process.env.ARTIFACTS_DIR
    ? join(String(process.env.ARTIFACTS_DIR), MODULE_NAME)
    : DEFAULT_ARTIFACTS_DIR;
  await mkdir(artifactsOutDir, { recursive: true });

  const config = await loadModuleConfig();
  const snapshots = await loadSourceSnapshots();
  const statsMap = aggregateStats(snapshots);
  const symbolEntries = Array.from(statsMap.keys()).sort();

  const data = {};
  for (const symbol of symbolEntries) {
    const statsEntry = statsMap.get(symbol);
    data[symbol] = computeScoresForStats(symbol, statsEntry);
  }

  const symbolCount = Object.keys(data).length;
  const validationMeta = computeValidationMetadata(
    Number.isFinite(config.counts?.expected) ? config.counts.expected : symbolCount,
    symbolCount,
    0,
    true
  );

  const now = new Date().toISOString();
  const envelope = buildEnvelope(data, {
    module: MODULE_NAME,
    tier: config.tier || 'standard',
    domain: config.domain || 'stocks',
    source: 'score-engine',
    fetched_at: now,
    published_at: now,
    freshness: config.freshness,
    expected_count: config.counts?.expected || symbolCount,
    validation: {
      ...validationMeta,
      warnings: ['score_from_market_stats']
    }
  });
  envelope.data = data;
  envelope.metadata.record_count = symbolCount;
  envelope.metadata.provider = 'score-engine';
  envelope.metadata.validation = {
    ...envelope.metadata.validation,
    warnings: ['score_from_market_stats']
  };
  envelope.metadata.digest = computeSnapshotDigest(envelope);
  envelope.module = envelope.module || envelope.metadata?.module || MODULE_NAME;

  const schemaCheck = validateEnvelopeSchema(envelope);
  if (!schemaCheck.valid) {
    throw new Error(`ENVELOPE_SCHEMA_INVALID: ${schemaCheck.errors.join('; ')}`);
  }

  const health = buildHealth(symbolCount, symbolCount);
  const state = buildModuleState(
    MODULE_NAME,
    envelope,
    {
      valid: true,
      passed: true,
      errors: [],
      warnings: ['score_from_market_stats']
    },
    config,
    {
      failure_class: null,
      failure_message: null,
      failure_hint: null
    }
  );

  await writeFile(join(artifactsOutDir, 'snapshot.json'), JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(join(artifactsOutDir, 'module-state.json'), JSON.stringify(state, null, 2) + '\n', 'utf-8');
  await writeFile(join(artifactsOutDir, 'market-score-health.json'), JSON.stringify(health, null, 2) + '\n', 'utf-8');

  process.stdout.write(`OK: ${MODULE_NAME} artifacts written\n`);
}

const isDirectRunRaw = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
const isDirectRun = isDirectRunRaw === import.meta.url;
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`FAIL: ${MODULE_NAME}\n${err.stack || err.message}\n`);
    process.exit(1);
  });
}
