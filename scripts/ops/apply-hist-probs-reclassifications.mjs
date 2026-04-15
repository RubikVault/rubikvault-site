#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadCheckpoints, saveCheckpoints, setTickerState } from '../lib/hist-probs/checkpoint-store.mjs';
import { normalizeDate, readJson } from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  triage: path.join(ROOT, 'public/data/hist-probs/error-triage-latest.json'),
  checkpoints: path.join(ROOT, 'public/data/hist-probs/checkpoints.json'),
  runSummary: path.join(ROOT, 'public/data/hist-probs/run-summary.json'),
  noDataManifest: path.join(ROOT, 'public/data/hist-probs/no-data-tickers.json'),
  output: path.join(ROOT, 'public/data/hist-probs/reclassification-apply-latest.json'),
};

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function normalizeTicker(value) {
  return String(value || '').trim().toUpperCase() || null;
}

function readNoDataManifest() {
  const manifest = readJson(PATHS.noDataManifest);
  return {
    schema: 'rv.hist_probs.no_data_tickers.v1',
    generated_at: new Date().toISOString(),
    mode: manifest?.mode || 'triage_reclassification',
    total_input_tickers: manifest?.total_input_tickers || null,
    excluded_count: Array.isArray(manifest?.tickers) ? manifest.tickers.length : 0,
    min_required_bars: manifest?.min_required_bars || 60,
    tickers: Array.isArray(manifest?.tickers) ? manifest.tickers : [],
  };
}

function writeNoDataManifest(manifest) {
  const payload = {
    ...manifest,
    generated_at: new Date().toISOString(),
    excluded_count: Array.isArray(manifest?.tickers) ? manifest.tickers.length : 0,
  };
  writeJsonAtomic(PATHS.noDataManifest, payload);
}

function versionValue(primary, fallback) {
  return String(primary || fallback || '').trim() || null;
}

function main() {
  const triagePathArg = process.argv.find((arg) => arg.startsWith('--triage-path='))?.split('=')[1]
    || (process.argv.includes('--triage-path') ? process.argv[process.argv.indexOf('--triage-path') + 1] : null);
  const triagePath = triagePathArg ? path.resolve(ROOT, triagePathArg) : PATHS.triage;
  const triage = readJson(triagePath);
  if (!triage) {
    throw new Error(`Missing triage artifact: ${triagePath}`);
  }

  const runSummary = readJson(PATHS.runSummary) || {};
  const checkpointStore = loadCheckpoints(PATHS.checkpoints);
  const noDataManifest = readNoDataManifest();
  const noDataMap = new Map((noDataManifest.tickers || []).map((entry) => [normalizeTicker(entry?.symbol), entry]).filter(([ticker]) => ticker));
  const applied = [];

  const currentSchemaVersion = versionValue(runSummary?.schema_version, 'rv_hist_probs_run_summary_v2');
  const currentFeatureVersion = versionValue(runSummary?.feature_core_version, currentSchemaVersion);
  const currentOutcomeVersion = versionValue(runSummary?.outcome_logic_version, currentSchemaVersion);

  for (const entry of Array.isArray(triage?.reclassify_no_data) ? triage.reclassify_no_data : []) {
    const ticker = normalizeTicker(entry?.ticker);
    if (!ticker) continue;
    setTickerState(checkpointStore, ticker, {
      status: 'no_data',
      latest_date: normalizeDate(entry?.latest_date || entry?.expected_date || null),
      canonical_id: String(entry?.canonical_id || '').trim().toUpperCase() || null,
      schema_version: currentSchemaVersion,
      feature_core_version: currentFeatureVersion,
      outcome_logic_version: currentOutcomeVersion,
      computed_at: new Date().toISOString(),
      reason: entry?.reason || 'triage_auto_reclassification_no_data',
      source: 'scripts/ops/apply-hist-probs-reclassifications.mjs',
    });
    noDataMap.set(ticker, {
      symbol: ticker,
      bars_count: Number.isFinite(Number(entry?.bars_count)) ? Number(entry.bars_count) : null,
      expected_date: normalizeDate(entry?.expected_date || entry?.latest_date || null),
      type_norm: entry?.type_norm || null,
      canonical_ids: Array.isArray(entry?.canonical_ids) ? entry.canonical_ids : (entry?.canonical_id ? [entry.canonical_id] : []),
    });
    applied.push({ ticker, status: 'no_data', reason: entry?.reason || null });
  }

  for (const entry of Array.isArray(triage?.reclassify_inactive) ? triage.reclassify_inactive : []) {
    const ticker = normalizeTicker(entry?.ticker);
    if (!ticker) continue;
    setTickerState(checkpointStore, ticker, {
      status: 'inactive',
      latest_date: normalizeDate(entry?.latest_date || entry?.expected_date || null),
      canonical_id: String(entry?.canonical_id || '').trim().toUpperCase() || null,
      schema_version: currentSchemaVersion,
      feature_core_version: currentFeatureVersion,
      outcome_logic_version: currentOutcomeVersion,
      computed_at: new Date().toISOString(),
      reason: entry?.reason || 'triage_auto_reclassification_inactive',
      source: 'scripts/ops/apply-hist-probs-reclassifications.mjs',
    });
    applied.push({ ticker, status: 'inactive', reason: entry?.reason || null });
  }

  saveCheckpoints(checkpointStore, PATHS.checkpoints);
  noDataManifest.tickers = [...noDataMap.values()].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  writeNoDataManifest(noDataManifest);

  const payload = {
    schema: 'rv.hist_probs.reclassification_apply.v1',
    generated_at: new Date().toISOString(),
    target_market_date: normalizeDate(triage?.target_market_date || null),
    triage_ref: path.relative(ROOT, triagePath),
    summary: {
      applied_total: applied.length,
      no_data_applied: applied.filter((entry) => entry.status === 'no_data').length,
      inactive_applied: applied.filter((entry) => entry.status === 'inactive').length,
    },
    applied,
  };
  writeJsonAtomic(PATHS.output, payload);
  process.stdout.write(`${JSON.stringify(payload.summary)}\n`);
}

main();
