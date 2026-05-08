#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DECISION_CORE_PUBLIC_ROOT,
  DECISION_CORE_RUNTIME_ROOT,
  ROOT,
  isoNow,
  parseArgs,
  readJsonMaybe,
  writeJsonAtomic,
} from './shared.mjs';
import { buildHistoricalDateSet } from './build-historical-date-set.mjs';
import { loadHistoricalRegistriesAsOfDates, loadHistoricalRegistryAsOf } from './load-historical-bars-asof.mjs';

const REPORT_PATH = path.join(ROOT, 'public/data/reports/decision-core-historical-replay-latest.json');

function numArg(argv, name, fallback) {
  const arg = argv.find((item) => item.startsWith(`--${name}=`));
  if (arg) return Number(arg.split('=')[1] || fallback);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return Number(argv[index + 1] || fallback);
  return Number(fallback);
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, RV_DECISION_CORE_HISTORICAL_REPLAY: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.slice(-4000) || '',
    stderr: result.stderr?.slice(-4000) || '',
  };
}

export function evaluateHistoricalDay({
  targetMarketDate,
  execute = false,
  maxAssets = null,
  allowPartialHistory = false,
  minPitRows = 50000,
  stratifiedSample = false,
  pitOverride = null,
} = {}) {
  const registryOverridePath = execute
    ? path.join(DECISION_CORE_RUNTIME_ROOT, 'historical-replay', `${targetMarketDate}.registry.ndjson.gz`)
    : null;
  const pit = pitOverride || loadHistoricalRegistryAsOf({ targetMarketDate, maxAssets, outPath: registryOverridePath, stratifiedSample });
  const failures = [];
  if (!pit.pit_check.ok) failures.push('PIT_FEATURE_AFTER_TARGET');
  if (!pit.history_root_found) failures.push('HISTORY_PACKS_UNAVAILABLE');
  if (!pit.rows.length) failures.push('PIT_HISTORY_ROWS_UNAVAILABLE');
  if (pit.rows.length < minPitRows) failures.push(`PIT_HISTORY_ROWS_BELOW_MIN:${pit.rows.length}:${minPitRows}`);
  if (pit.history_pack_corrupt_count > 0 && !allowPartialHistory) failures.push(`HISTORY_PACKS_CORRUPT:${pit.history_pack_corrupt_count}`);
  let build = { ok: !execute, skipped: execute };
  let validation = { ok: !execute, skipped: execute };
  let diff = { ok: !execute, skipped: execute };
  if (execute && failures.length === 0) {
    const maxArgs = maxAssets ? [`--max-assets=${maxAssets}`] : [];
    build = runNode([
      'scripts/decision-core/build-minimal-decision-bundles.mjs',
      '--mode', 'shadow',
      '--target-market-date', targetMarketDate,
      '--replace',
      '--pit-replay',
      '--registry-override', registryOverridePath,
      ...maxArgs,
    ]);
    if (!build.ok) failures.push('BUILD_FAILED');
    validation = build.ok
      ? runNode(['scripts/decision-core/validate-decision-bundles.mjs', '--root', 'public/data/decision-core/shadow', '--target-market-date', targetMarketDate])
      : { ok: false, skipped: true };
    if (!validation.ok) failures.push('VALIDATION_FAILED');
    diff = validation.ok
      ? runNode(['scripts/decision-core/shadow-diff-logger.mjs', '--target-market-date', targetMarketDate])
      : { ok: false, skipped: true };
    if (!diff.ok) failures.push('SHADOW_DIFF_FAILED');
  }
  const status = readJsonMaybe(path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow/status.json')) || {};
  const shadowDiff = readJsonMaybe(path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow-diff-latest.json')) || {};
  const unsafeKeys = [
    'buy_without_decision_grade',
    'buy_without_entry_guard',
    'buy_without_invalidation',
    'buy_without_reason_codes',
    'buy_with_tail_risk_high_or_unknown',
    'buy_with_ev_proxy_not_positive',
    'buy_with_analysis_reliability_low',
    'unknown_blocking_reason_code_count',
    'hard_veto_without_ui_mapping',
    'legacy_buy_fallback_count',
  ];
  const unsafeCounters = Object.fromEntries(unsafeKeys.map((key) => [key, Number(shadowDiff[key] || status[key] || 0)]));
  for (const [key, value] of Object.entries(unsafeCounters)) if (value > 0) failures.push(`${key}:${value}`);
  return {
    target_market_date: targetMarketDate,
    valid: failures.length === 0,
    failures,
    source: pit.source,
    registry_override_path: pit.registry_override_path,
    stratified_sample: pit.stratified_sample,
    history_root_found: pit.history_root_found,
    pack_files_loaded: pit.pack_files_loaded,
    history_pack_missing_count: pit.history_pack_missing_count,
    history_pack_row_missing_count: pit.history_pack_row_missing_count,
    history_pack_pointer_missing_count: pit.history_pack_pointer_missing_count,
    history_pack_corrupt_count: pit.history_pack_corrupt_count,
    history_pack_corrupt_candidate_count: pit.history_pack_corrupt_candidate_count,
    history_pack_corrupt_samples: pit.history_pack_corrupt_samples,
    no_bars_asof_count: pit.no_bars_asof_count,
    pit_violation_count: pit.pit_check.violations.length,
    row_count: build.ok ? (status.total_assets || 0) : pit.rows.length,
    buy_count: build.ok ? (status.buy_count || 0) : 0,
    critical_diff_rate: Number(shadowDiff.critical_diff_rate || 0),
    unsafe_counters: unsafeCounters,
    build_status: build.skipped ? 'SKIPPED' : build.ok ? 'OK' : 'FAILED',
    validation_status: validation.skipped ? 'SKIPPED' : validation.ok ? 'OK' : 'FAILED',
    diff_status: diff.skipped ? 'SKIPPED' : diff.ok ? 'OK' : 'FAILED',
  };
}

export function buildHistoricalCertification({
  targetMarketDate,
  minDays = 60,
  preferDays = 120,
  execute = false,
  maxAssets = null,
  allowPartialHistory = false,
  minPitRows = 50000,
  stratifiedSample = false,
  batchPitCache = false,
} = {}) {
  const dateSet = buildHistoricalDateSet({ targetMarketDate, minDays, preferDays });
  const batch = batchPitCache
    ? loadHistoricalRegistriesAsOfDates({
      targetMarketDates: dateSet.selected_dates,
      maxAssets,
      outDir: execute ? path.join(DECISION_CORE_RUNTIME_ROOT, 'historical-replay') : null,
      stratifiedSample,
    })
    : null;
  const days = [];
  for (const [index, date] of dateSet.selected_dates.entries()) {
    if (execute || process.env.RV_DECISION_CORE_HISTORICAL_PROGRESS === '1') {
      console.error(`[historical-certification] day ${index + 1}/${dateSet.selected_dates.length} target=${date}`);
    }
    const day = evaluateHistoricalDay({
      targetMarketDate: date,
      execute,
      maxAssets,
      allowPartialHistory,
      minPitRows,
      stratifiedSample,
      pitOverride: batch?.byDate?.get(date) || null,
    });
    days.push(day);
    if (execute || process.env.RV_DECISION_CORE_HISTORICAL_PROGRESS === '1') {
      console.error(`[historical-certification] target=${date} valid=${day.valid} rows=${day.row_count} buy=${day.buy_count} failures=${day.failures.join('|') || 'none'}`);
    }
    if (execute && days.filter((row) => row.valid).length >= minDays) break;
  }
  const valid = days.filter((day) => day.valid);
  const report = {
    schema: 'rv.decision_core_historical_replay.v1',
    status: valid.length >= minDays ? 'OK' : 'FAILED',
    generated_at: isoNow(),
    target_market_date: targetMarketDate,
    min_days: minDays,
    prefer_days: preferDays,
    mode: execute ? 'executed' : 'preflight_only',
    history_coverage_mode: allowPartialHistory ? 'partial_pit_available_rows' : 'strict_full_pack_readability',
    min_pit_rows: minPitRows,
    max_assets: maxAssets,
    stratified_sample: Boolean(stratifiedSample && maxAssets),
    batch_pit_cache: Boolean(batchPitCache),
    historical_replay_valid_days: valid.length,
    historical_replay_total_days: days.length,
    p0_safety_certified: valid.length >= minDays,
    alpha_proof: false,
    days,
  };
  writeJsonAtomic(REPORT_PATH, report);
  const latestRunId = readJsonMaybe(path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow/manifest.json'))?.decision_run_id;
  if (latestRunId) {
    writeJsonAtomic(path.join(DECISION_CORE_RUNTIME_ROOT, latestRunId, 'audit/historical-replay-summary.json'), report);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const report = buildHistoricalCertification({
    targetMarketDate: opts.targetMarketDate,
    minDays: numArg(argv, 'min-days', 60),
    preferDays: numArg(argv, 'prefer-days', 120),
    execute: hasFlag(argv, 'execute') || hasFlag(argv, 'replace'),
    maxAssets: numArg(argv, 'max-assets', 0) || null,
    allowPartialHistory: hasFlag(argv, 'allow-partial-history'),
    minPitRows: numArg(argv, 'min-pit-rows', 50000),
    stratifiedSample: hasFlag(argv, 'stratified-sample'),
    batchPitCache: hasFlag(argv, 'batch-pit-cache'),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}
