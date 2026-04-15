#!/usr/bin/env node
/**
 * build-scientific-summary.mjs
 * Reads stock-analysis.json and produces a lighter scientific summary
 * with explicit provenance/run metadata for downstream gates.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
} from './ops/pipeline-artifact-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC = resolve(ROOT, 'public/data/snapshots/stock-analysis.json');
const OUT = resolve(ROOT, 'public/data/supermodules/scientific-summary.json');
const RELEASE_STATE_PATH = resolve(ROOT, 'public/data/ops/release-state-latest.json');
const RUNTIME_PATH = resolve(ROOT, 'public/data/pipeline/runtime/latest.json');
const SYSTEM_STATUS_PATH = resolve(ROOT, 'public/data/reports/system-status-latest.json');
const GENERATOR_ID = 'scripts/build-scientific-summary.mjs';

function buildArtifactHash(payload) {
  return createHash('sha256').update(JSON.stringify({ ...payload, artifact_hash: null })).digest('hex');
}

function resolveTargetMarketDate() {
  const forced = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
  if (forced) return forced;
  const release = readJson(RELEASE_STATE_PATH);
  const runtime = readJson(RUNTIME_PATH);
  const system = readJson(SYSTEM_STATUS_PATH);
  return forced
    || resolveReleaseTargetMarketDate(release)
    || normalizeDate(runtime?.target_market_date)
    || normalizeDate(system?.summary?.target_market_date)
    || null;
}

function resolveRunId(targetMarketDate) {
  const forced = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim();
  if (forced) return forced;
  const release = readJson(RELEASE_STATE_PATH);
  const runtime = readJson(RUNTIME_PATH);
  const system = readJson(SYSTEM_STATUS_PATH);
  return release?.run_id
    || runtime?.run_id
    || system?.run_id
    || `run-scientific-summary-${targetMarketDate || new Date().toISOString().slice(0, 10)}`;
}

function buildEmptySummary({ runId, targetMarketDate, generatedAt }) {
  const payload = {
    module: 'scientific_analyzer',
    schema_version: 'rv.supermodules.v2',
    generator_id: GENERATOR_ID,
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    source_meta: {
      source: 'stock-analysis.json',
      source_path: 'public/data/snapshots/stock-analysis.json',
      asof: targetMarketDate,
      fresh: false,
      stale_days: null,
      ready: false,
    },
    rows: [],
    universe_stats: { total: 0 },
    strong_signals: [],
    best_setups: [],
    _status: 'NO_SOURCE_DATA',
  };
  return { ...payload, artifact_hash: buildArtifactHash(payload) };
}

const isUSLike = (sym) => /^[A-Z]{1,5}(-[A-Z])?$/.test(sym);

function buildScientificSummary(raw, { runId, targetMarketDate, generatedAt }) {
  const entries = Object.entries(raw || {});
  const all = entries
    .filter(([sym]) => isUSLike(sym))
    .map(([sym, d]) => ({
      symbol: sym,
      name: d.name || null,
      price: d.price ?? null,
      probability: d.probability ?? null,
      signal_strength: d.signal_strength || 'WEAK',
      v4_decision: {
        verdict: d.v4_decision?.verdict || null,
        confidence_bucket: d.v4_decision?.confidence_bucket || null,
      },
      setup: {
        fulfilled: d.setup?.fulfilled ?? false,
        score: d.setup?.score ?? 0,
        conditions_met: d.setup?.conditions_met || '0/5',
        proof_points: (d.setup?.proof_points || []).slice(0, 3),
      },
      trigger: {
        fulfilled: d.trigger?.fulfilled ?? false,
        score: d.trigger?.score ?? 0,
        conditions_met: d.trigger?.conditions_met || '0/4',
        proof_points: (d.trigger?.proof_points || []).slice(0, 3),
      },
      indicators: {
        rsi: d.indicators?.rsi ?? null,
        macd_hist: d.indicators?.macd_hist ?? null,
        volume_ratio: d.indicators?.volume_ratio ?? null,
      },
    }));

  const strong = all
    .filter((entry) => (
      entry.setup.fulfilled
      && entry.trigger.fulfilled
      && entry.v4_decision.verdict === 'BUY'
      && entry.v4_decision.confidence_bucket === 'HIGH'
    ))
    .sort((a, b) => (b.setup.score + b.trigger.score) - (a.setup.score + a.trigger.score))
    .slice(0, 30);

  const bestSetups = all
    .filter((entry) => (
      entry.setup.fulfilled
      && !entry.trigger.fulfilled
      && entry.v4_decision.verdict === 'BUY'
      && entry.v4_decision.confidence_bucket === 'HIGH'
    ))
    .sort((a, b) => b.setup.score - a.setup.score)
    .slice(0, 30);

  const totalSetups = all.filter((entry) => entry.setup.fulfilled).length;
  const totalTriggers = all.filter((entry) => entry.trigger.fulfilled).length;
  const totalStrong = all.filter((entry) => entry.v4_decision.verdict === 'BUY' && entry.v4_decision.confidence_bucket === 'HIGH').length;

  const payload = {
    module: 'scientific_analyzer',
    schema_version: 'rv.supermodules.v2',
    generator_id: GENERATOR_ID,
    run_id: runId,
    target_market_date: targetMarketDate,
    generated_at: generatedAt,
    source_meta: {
      source: 'stock-analysis.json',
      source_path: 'public/data/snapshots/stock-analysis.json',
      asof: targetMarketDate,
      fresh: Boolean(targetMarketDate),
      stale_days: targetMarketDate ? 0 : null,
      ready: true,
    },
    universe_stats: {
      total: all.length,
      setups_fulfilled: totalSetups,
      triggers_fulfilled: totalTriggers,
      strong_signals: totalStrong,
    },
    strong_signals: strong,
    best_setups: bestSetups,
  };
  return { ...payload, artifact_hash: buildArtifactHash(payload) };
}

function main() {
  const generatedAt = new Date().toISOString();
  const targetMarketDate = resolveTargetMarketDate();
  const runId = resolveRunId(targetMarketDate);

  if (!existsSync(SRC)) {
    const empty = buildEmptySummary({ runId, targetMarketDate, generatedAt });
    writeFileSync(OUT, `${JSON.stringify(empty, null, 2)}\n`, 'utf8');
    process.exit(0);
  }

  const raw = JSON.parse(readFileSync(SRC, 'utf8'));
  const payload = buildScientificSummary(raw, { runId, targetMarketDate, generatedAt });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main();
