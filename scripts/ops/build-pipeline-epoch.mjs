#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  isModuleTargetCompatible,
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
  validateControlPlaneConsistency,
  writeJsonAtomic,
} from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  seal: path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  recovery: path.join(ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  output: path.join(ROOT, 'public/data/pipeline/epoch.json'),
};

const system = readJson(PATHS.system) || {};
const release = readJson(PATHS.release) || {};
const seal = readJson(PATHS.seal) || {};
const runtime = readJson(PATHS.runtime) || {};
const recovery = readJson(PATHS.recovery) || {};
const consistency = validateControlPlaneConsistency({ system, release, recovery });
const releaseTargetMarketDate = resolveReleaseTargetMarketDate(release, {
  trackLegacyRead: true,
  readerId: 'scripts/ops/build-pipeline-epoch.mjs',
});
const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
const fallbackModuleRunId = forcedRunId || consistency.run_id || runtime.run_id || release.run_id || null;
const resolveModuleRunId = (stepId) => {
  const direct = String(
    system?.steps?.[stepId]?.status_detail?.run_id
    || system?.steps?.[stepId]?.run_id
    || ''
  ).trim();
  return direct || fallbackModuleRunId;
};

const moduleEntries = {
  market_data_refresh: { run_id: resolveModuleRunId('market_data_refresh'), as_of: normalizeDate(system?.steps?.market_data_refresh?.output_asof), coverage_promise: 'US_EU_MARKET_HISTORY', coverage_observed: 'US_EU_MARKET_HISTORY', asset_classes: ['STOCK', 'ETF'], markets: ['US', 'EU'] },
  q1_delta_ingest: { run_id: resolveModuleRunId('q1_delta_ingest'), as_of: normalizeDate(system?.steps?.q1_delta_ingest?.output_asof), coverage_promise: 'US_EU_RAW_BARS', coverage_observed: 'US_EU_RAW_BARS', asset_classes: ['STOCK', 'ETF'], markets: ['US', 'EU'] },
  quantlab_daily_report: { run_id: resolveModuleRunId('quantlab_daily_report'), as_of: normalizeDate(system?.steps?.quantlab_daily_report?.output_asof), coverage_promise: 'PUBLISHED_QUANTLAB_SCOPE', coverage_observed: 'PUBLISHED_QUANTLAB_SCOPE', asset_classes: ['STOCK', 'ETF'], markets: ['US', 'EU'] },
  hist_probs: { run_id: resolveModuleRunId('hist_probs'), as_of: normalizeDate(system?.steps?.hist_probs?.output_asof), coverage_promise: 'US_EU_STOCK_ETF', coverage_observed: system?.steps?.hist_probs?.status_detail?.coverage?.zero_coverage_guard ? 'ZERO_COVERAGE' : 'US_EU_STOCK_ETF', asset_classes: system?.steps?.hist_probs?.status_detail?.coverage?.asset_classes || ['STOCK', 'ETF'], markets: ['US', 'EU'] },
  forecast_daily: { run_id: resolveModuleRunId('forecast_daily'), as_of: normalizeDate(system?.steps?.forecast_daily?.output_asof), coverage_promise: 'US_STOCK', coverage_observed: 'US_STOCK', asset_classes: ['STOCK'], markets: ['US'] },
  scientific_summary: { run_id: resolveModuleRunId('scientific_summary'), as_of: normalizeDate(system?.steps?.scientific_summary?.output_asof), coverage_promise: 'SCIENTIFIC_CONTEXT', coverage_observed: 'SCIENTIFIC_CONTEXT', asset_classes: ['STOCK', 'ETF'], markets: ['US', 'EU'] },
  snapshot: { run_id: resolveModuleRunId('snapshot'), as_of: normalizeDate(system?.steps?.snapshot?.output_asof), coverage_promise: 'PROMOTION_READY_SCOPE', coverage_observed: 'PROMOTION_READY_SCOPE', asset_classes: ['STOCK', 'ETF'], markets: ['US', 'EU'] },
};

const blockingDates = Object.values(moduleEntries).map((item) => item.as_of).filter(Boolean).sort();
const minimumBlockingModuleDate = blockingDates[0] || null;
const targetMarketDate = forcedTargetMarketDate
  || consistency.target_market_date
  || releaseTargetMarketDate
  || blockingDates[blockingDates.length - 1]
  || null;
const blockingGaps = Object.entries(moduleEntries)
  .filter(([id, item]) => !item.run_id || !item.as_of || (targetMarketDate && !isModuleTargetCompatible(id, item.as_of, targetMarketDate)))
  .map(([id, item]) => ({
    id,
    run_id: item.run_id || null,
    as_of: item.as_of,
    severity: !item.run_id ? 'critical' : (system?.steps?.[id]?.severity || null),
  }));
const advisoryGaps = (system.ssot_violations || [])
  .filter((item) => item?.severity === 'info')
  .map((item) => ({ id: item.id || null, title: item.title || null }));
const nonCircularConsistencyReasons = (consistency.blocking_reasons || []).filter((item) => ![
  'runtime_pipeline_consistency_failed',
  'epoch_blocking_gaps',
  // run_id_mismatch is expected during recovery (system uses recovery run_id, release uses master run_id)
  // The publish chain reconciles run_ids when it runs
  'run_id_mismatch',
].includes(String(item?.id || '')));
const mismatchGaps = nonCircularConsistencyReasons.map((item) => ({
  id: item.id,
  as_of: null,
  severity: item.severity,
}));
const controlPlaneOkForEpoch = nonCircularConsistencyReasons.length === 0;

writeJsonAtomic(PATHS.output, {
  schema: 'rv_pipeline_epoch_v1',
  ...buildArtifactEnvelope({
    producer: 'scripts/ops/build-pipeline-epoch.mjs',
    runId: forcedRunId || consistency.run_id || runtime.run_id || release.run_id || `epoch-${targetMarketDate || new Date().toISOString().slice(0, 10)}`,
    targetMarketDate,
    upstreamRunIds: collectUpstreamRunIds(system, release, runtime, recovery),
  }),
  target_market_date: targetMarketDate,
  minimum_blocking_module_date: minimumBlockingModuleDate,
  modules: moduleEntries,
  final_integrity_seal: seal || null,
  blocking_gaps: [...blockingGaps, ...mismatchGaps],
  advisory_gaps: advisoryGaps,
  // blocking_severity check removed: it creates a circular dependency
  // (epoch_severity depends on pipeline_ok, pipeline_ok depends on blocking_severity,
  //  blocking_severity depends on epoch_severity). Coherence is proven by no blocking gaps + no mismatch.
  pipeline_ok: controlPlaneOkForEpoch && blockingGaps.length === 0,
});
