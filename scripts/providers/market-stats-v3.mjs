#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildEnvelope, validateEnvelopeSchema } from '../lib/envelope.js';
import { computeSnapshotDigest } from '../lib/digest.js';
import { buildModuleState } from '../lib/module-state.js';
import { computeValidationMetadata } from '../lib/drop-threshold.js';

const __filename = fileURLToPath(import.meta.url);
const BASE_DIR = process.cwd();
const MODULE_NAME = 'market-stats';
const SOURCE_MODULE = 'market-prices';
const DEFAULT_ARTIFACTS_DIR = join(BASE_DIR, 'tmp/phase1-artifacts/market-stats');
const DEFAULT_BARS_LOOKBACK = 252;
const RETURN_WINDOWS = [1, 5, 21, 63, 126, 252];
const RUN_QUALITY_THRESHOLDS = {
  OK: 0.95,
  DEGRADED: 0.5
};

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const diff = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function readJson(filePath) {
  return readFile(filePath, 'utf-8').then((content) => JSON.parse(content));
}

async function buildModuleConfig(moduleName) {
  const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
  const registry = await readJson(registryPath);
  const config = registry?.modules?.[moduleName];
  if (!config) {
    throw new Error(`MODULE_CONFIG_MISSING:${moduleName}`);
  }
  return config;
}

async function loadUniverseSymbols() {
  const universePath = join(BASE_DIR, 'public/data/registry/universe.v1.json');
  const content = await readJson(universePath);
  const symbols = content?.groups?.index_proxies?.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('UNIVERSE_INDEX_PROXIES_MISSING');
  }
  return symbols.slice();
}

async function loadSourceSnapshots() {
  const barsDir = process.env.BARS_ARTIFACTS_DIR
    ? join(String(process.env.BARS_ARTIFACTS_DIR), SOURCE_MODULE)
    : null;
  const candidates = [];
  if (barsDir) {
    candidates.push(join(barsDir, 'snapshot.json'));
  }
  const publicDir = join(BASE_DIR, 'public/data/snapshots', SOURCE_MODULE);
  candidates.push(join(publicDir, 'latest.json'));

  const snapshots = [];
  for (const path of candidates) {
    try {
      const content = await readJson(path);
      snapshots.push({ path, snapshot: content });
    } catch (err) {
      // ignore missing snapshots
    }
  }
  if (snapshots.length === 0) {
    throw new Error('BARS_SNAPSHOT_MISSING');
  }
  return snapshots;
}

function normalizeBar(bar) {
  if (!bar || typeof bar !== 'object') return null;
  const date = typeof bar.date === 'string' ? bar.date : null;
  const close = safeNumber(bar.close);
  const open = safeNumber(bar.open);
  const high = safeNumber(bar.high);
  const low = safeNumber(bar.low);
  const volume = safeNumber(bar.volume);
  if (!date || close === null || high === null || low === null || open === null) return null;
  return {
    symbol: String(bar.symbol || '').trim(),
    date,
    open,
    high,
    low,
    close,
    volume: volume === null ? null : Math.floor(volume),
    currency: bar.currency || 'USD'
  };
}

function aggregateBars(snapshots) {
  const uniqueBars = new Map();
  for (const { snapshot } of snapshots) {
    const data = Array.isArray(snapshot?.data) ? snapshot.data : [];
    for (const entry of data) {
      const normalized = normalizeBar(entry);
      if (!normalized || !normalized.symbol) continue;
      const key = `${normalized.symbol}:${normalized.date}`;
      if (!uniqueBars.has(key)) {
        uniqueBars.set(key, normalized);
      }
    }
  }
  const history = new Map();
  for (const bar of uniqueBars.values()) {
    const list = history.get(bar.symbol) || [];
    list.push(bar);
    history.set(bar.symbol, list);
  }
  for (const [symbol, list] of history.entries()) {
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  return history;
}

function computeLogReturn(latest, past) {
  if (latest === null || past === null || past === 0) return null;
  const ratio = latest / past;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return Math.log(ratio);
}

function computeMomentum(latest, past) {
  if (latest === null || past === null || past === 0) return null;
  const change = (latest - past) / past;
  return Number(change * 100);
}

function computeStd(values) {
  if (!Array.isArray(values) || values.length === 0) return { mean: null, std: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  return { mean, std };
}

function computeVolatility(bars, window) {
  if (bars.length <= window) return null;
  const returns = [];
  for (let i = 0; i < window; i++) {
    const current = bars[i]?.close;
    const previous = bars[i + 1]?.close;
    if (current === undefined || previous === undefined) break;
    const logReturn = computeLogReturn(current, previous);
    if (logReturn === null) continue;
    returns.push(logReturn);
  }
  if (returns.length === 0) return null;
  const { std } = computeStd(returns);
  if (std === null) return null;
  const annualized = std * Math.sqrt(252);
  return Number(annualized);
}

function computeDrawdowns(bars, lookback = 252) {
  const window = bars.slice(0, lookback);
  if (window.length === 0) return { max_drawdown: null, current_drawdown: null };
  let peak = window[window.length - 1].close;
  let maxDrawdown = 0;
  const reversed = [...window].reverse();
  for (const bar of reversed) {
    if (bar.close > peak) peak = bar.close;
    if (peak <= 0) continue;
    const drawdown = (peak - bar.close) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  const latestClose = window[0].close;
  const peakForCurrent = window.reduce((max, bar) => Math.max(max, bar.close), -Infinity);
  const currentDrawdown = peakForCurrent > 0 ? (peakForCurrent - latestClose) / peakForCurrent : null;
  return {
    max_drawdown: Number(maxDrawdown),
    current_drawdown: Number(currentDrawdown ?? 0)
  };
}

function computeSMA(bars, period) {
  if (bars.length < period) return null;
  const subset = bars.slice(0, period);
  const sum = subset.reduce((acc, bar) => acc + bar.close, 0);
  return sum / subset.length;
}

function computeRSI(bars, period = 14) {
  if (bars.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 0; i < period; i++) {
    const current = bars[i]?.close;
    const previous = bars[i + 1]?.close;
    if (current === undefined || previous === undefined) break;
    const diff = current - previous;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeATR(bars, period) {
  if (bars.length <= period) return null;
  let total = 0;
  for (let i = 0; i < period; i++) {
    const current = bars[i];
    const prev = bars[i + 1];
    if (!current || !prev) break;
    const highLow = current.high - current.low;
    const highPrev = Math.abs(current.high - prev.close);
    const lowPrev = Math.abs(current.low - prev.close);
    const tr = Math.max(highLow, highPrev, lowPrev);
    total += tr;
  }
  const value = total / period;
  return Number.isFinite(value) ? value : null;
}

function computeZScore(value, values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const { mean, std } = computeStd(values);
  if (mean === null || std === null || std === 0) return null;
  return (value - mean) / std;
}

export function computeStatsForSymbol(symbol, bars, options = {}) {
  const gaps = [];
  if (!bars || bars.length === 0) {
    return {
      symbol,
      as_of: null,
      stats: {},
      coverage: {
        bars_used: 0,
        bars_expected: options.barsExpected || DEFAULT_BARS_LOOKBACK,
        coverage_ratio: 0,
        coverage_days: 0,
        freshness_days: null
      },
      warnings: ['NO_BARS_AVAILABLE']
    };
  }

  const latestBar = bars[0];
  const stats = {};
  for (const window of RETURN_WINDOWS) {
    const value = computeLogReturn(latestBar.close, bars[window]?.close ?? null);
    stats[`returns_${window}d`] = value;
    if (value === null) gaps.push(`MISSING_WINDOW_${window}d`);
  }

  stats.volatility_21d = computeVolatility(bars, 21);
  stats.volatility_63d = computeVolatility(bars, 63);
  if (stats.volatility_21d === null) gaps.push('MISSING_VOLATILITY_21d');
  if (stats.volatility_63d === null) gaps.push('MISSING_VOLATILITY_63d');

  stats.momentum_21d = computeMomentum(latestBar.close, bars[21]?.close ?? null);
  stats.momentum_63d = computeMomentum(latestBar.close, bars[63]?.close ?? null);
  stats.momentum_252d = computeMomentum(latestBar.close, bars[252]?.close ?? null);
  if (stats.momentum_21d === null) gaps.push('MISSING_MOMENTUM_21d');
  if (stats.momentum_63d === null) gaps.push('MISSING_MOMENTUM_63d');
  if (stats.momentum_252d === null) gaps.push('MISSING_MOMENTUM_252d');

  const drawdowns = computeDrawdowns(bars, 252);
  stats.drawdown_max_252d = drawdowns.max_drawdown;
  stats.drawdown_current_252d = drawdowns.current_drawdown;
  if (stats.drawdown_max_252d === null) gaps.push('MISSING_DRAWDOWN');

  const sma20 = computeSMA(bars, 20);
  const sma50 = computeSMA(bars, 50);
  const sma200 = computeSMA(bars, 200);
  stats.sma_20 = sma20;
  stats.sma_50 = sma50;
  stats.sma_200 = sma200;

  const latestClose = latestBar.close;
  stats.distance_to_sma_20 = sma20 ? Number(((latestClose / sma20 - 1) * 100)) : null;
  stats.distance_to_sma_50 = sma50 ? Number(((latestClose / sma50 - 1) * 100)) : null;
  stats.distance_to_sma_200 = sma200 ? Number(((latestClose / sma200 - 1) * 100)) : null;

  const rsi14 = computeRSI(bars, 14);
  stats.rsi_14 = rsi14;
  if (rsi14 === null) gaps.push('MISSING_RSI14');

  stats.atr_14 = computeATR(bars, 14);
  stats.atr_20 = computeATR(bars, 20);
  if (stats.atr_14 === null) gaps.push('MISSING_ATR14');
  if (stats.atr_20 === null) gaps.push('MISSING_ATR20');

  const closes63 = bars.slice(0, 63).map((bar) => bar.close).filter((c) => Number.isFinite(c));
  stats.close_zscore_63d = closes63.length >= 2 ? computeZScore(latestClose, closes63) : null;

  const returns63 = [];
  for (let i = 0; i < 63; i++) {
    const value = computeLogReturn(bars[i]?.close ?? null, bars[i + 1]?.close ?? null);
    if (value !== null) returns63.push(value);
  }
  stats.return_zscore_63d = returns63.length >= 2 ? computeZScore(returns63[0], returns63) : null;

  if (stats.close_zscore_63d === null) gaps.push('MISSING_CLOSE_ZSCORE');
  if (stats.return_zscore_63d === null) gaps.push('MISSING_RETURN_ZSCORE');

  const barsUsed = bars.length;
  const barsExpected = options.barsExpected || DEFAULT_BARS_LOOKBACK;
  const coverageRatio = barsExpected > 0 ? Math.min(1, barsUsed / barsExpected) : 1;
  const freshnessDays = daysBetween(new Date(), new Date(latestBar.date));

  const coverage = {
    bars_used: barsUsed,
    bars_expected: barsExpected,
    coverage_ratio: Number(coverageRatio.toFixed(4)),
    coverage_days: barsUsed,
    freshness_days: freshnessDays
  };

  return {
    symbol,
    as_of: latestBar.date,
    stats,
    coverage,
    warnings: [...new Set(gaps)]
  };
}

function determineRunQuality(coverageRatio, resolvedCount) {
  if (!resolvedCount || resolvedCount === 0) return 'FAILED';
  if (coverageRatio >= RUN_QUALITY_THRESHOLDS.OK) return 'OK';
  if (coverageRatio >= RUN_QUALITY_THRESHOLDS.DEGRADED) return 'DEGRADED';
  return 'FAILED';
}

function buildReasonSummary(symbolWarnings = {}) {
  const counts = {};
  for (const reasons of Object.values(symbolWarnings)) {
    for (const reason of reasons) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

async function main() {
  const artifactsOutDir = process.env.RV_ARTIFACT_OUT_DIR
    ? String(process.env.RV_ARTIFACT_OUT_DIR)
    : process.env.ARTIFACTS_DIR
    ? join(String(process.env.ARTIFACTS_DIR), MODULE_NAME)
    : DEFAULT_ARTIFACTS_DIR;
  await mkdir(artifactsOutDir, { recursive: true });

  const symbols = await loadUniverseSymbols();
  const config = await buildModuleConfig(MODULE_NAME);
  const expectedCount = Number.isFinite(config.counts?.expected) ? config.counts.expected : symbols.length;
  const minCount = Number.isFinite(config.counts?.min) ? config.counts.min : symbols.length;

  const snapshots = await loadSourceSnapshots();
  const barsBySymbol = aggregateBars(snapshots);

  const data = [];
  const symbolWarnings = {};
  for (const symbol of symbols) {
    const bars = barsBySymbol.get(symbol) || [];
    const result = computeStatsForSymbol(symbol, bars, { barsExpected: DEFAULT_BARS_LOOKBACK });
    data.push(result);
    if (result.warnings.length > 0) {
      symbolWarnings[symbol] = result.warnings;
    }
  }

  const validCount = data.filter((entry) => entry.coverage.bars_used > 0).length;
  const droppedRecords = Math.max(0, expectedCount - validCount);
  const validationMeta = computeValidationMetadata(expectedCount, validCount, droppedRecords, true);
  const coverageRatio = expectedCount > 0 ? validCount / expectedCount : 0;
  const runQuality = determineRunQuality(coverageRatio, validCount);
  const reasonSummary = buildReasonSummary(symbolWarnings);
  const warningList = Object.keys(reasonSummary);

  const nowIso = new Date().toISOString();
  const envelope = buildEnvelope(data, {
    module: MODULE_NAME,
    tier: config.tier || 'standard',
    domain: config.domain || 'stocks',
    source: 'market-stats-derived',
    fetched_at: nowIso,
    published_at: nowIso,
    freshness: config.freshness,
    expected_count: expectedCount,
    validation: {
      ...validationMeta,
      warnings: warningList
    }
  });
  envelope.metadata.provider = 'derived';
  envelope.metadata.record_count = data.length;
  envelope.metadata.validation = {
    ...envelope.metadata.validation,
    warnings: warningList
  };
  envelope.metadata.digest = computeSnapshotDigest(envelope);

  const schemaCheck = validateEnvelopeSchema(envelope);
  if (!schemaCheck.valid) {
    throw new Error(`ENVELOPE_SCHEMA_INVALID: ${schemaCheck.errors.join('; ')}`);
  }

  const validationPassed = validationMeta.drop_check_passed && validCount >= minCount;
  const state = buildModuleState(
    MODULE_NAME,
    envelope,
    {
      valid: validationPassed,
      passed: validationPassed,
      errors: validationPassed ? [] : ['VALIDATION_FAILED'],
      warnings: warningList
    },
    config,
    {
      failure_class: validationPassed ? null : 'VALIDATION_FAILED',
      failure_message: validationPassed ? null : 'Validation failed',
      failure_hint: validationPassed ? null : 'Check coverage and warnings'
    }
  );

  const healthPayload = {
    module: MODULE_NAME,
    total_symbols: symbols.length,
    symbols_resolved: validCount,
    coverage_ratio: Number(Math.min(1, coverageRatio).toFixed(3)),
    fallback_usage_ratio: 0,
    run_quality: runQuality,
    reason_summary: reasonSummary
  };

  const snapshotPath = join(artifactsOutDir, 'snapshot.json');
  const statePath = join(artifactsOutDir, 'module-state.json');
  const healthPath = join(artifactsOutDir, 'market-stats-health.json');

  await writeFile(snapshotPath, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  await writeFile(healthPath, JSON.stringify(healthPayload, null, 2) + '\n', 'utf-8');

  process.stdout.write(`OK: ${MODULE_NAME} artifacts written\n`);
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(`FAIL: ${MODULE_NAME} provider\n${err.stack || err.message || String(err)}\n`);
    process.exit(1);
  });
}
