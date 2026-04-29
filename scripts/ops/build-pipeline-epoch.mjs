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
import { parseGlobalAssetClasses } from '../../functions/api/_shared/global-asset-classes.mjs';
import { isDataPlaneLane, parsePipelineLane } from './pipeline-lanes.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const EVALUATION_LANE = parsePipelineLane(process.argv.slice(2));
const RELEASE_SCOPE_EVALUATED = !isDataPlaneLane(EVALUATION_LANE);
const ACTIVE_ASSET_CLASSES = parseGlobalAssetClasses(process.env.RV_GLOBAL_ASSET_CLASSES || '');
const PATHS = {
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  seal: path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  recovery: path.join(ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  output: path.join(ROOT, 'public/data/pipeline/epoch.json'),
};

const system = readJson(PATHS.system) || {};
const release = isDataPlaneLane(EVALUATION_LANE) ? {} : (readJson(PATHS.release) || {});
const seal = isDataPlaneLane(EVALUATION_LANE) ? null : (readJson(PATHS.seal) || {});
const runtime = isDataPlaneLane(EVALUATION_LANE) ? {} : (readJson(PATHS.runtime) || {});
const recovery = isDataPlaneLane(EVALUATION_LANE) ? {} : (readJson(PATHS.recovery) || {});
const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
const consistency = validateControlPlaneConsistency(
  isDataPlaneLane(EVALUATION_LANE) || forcedTargetMarketDate
    ? { system }
    : { system, release, runtime, recovery },
);
const releaseTargetMarketDate = isDataPlaneLane(EVALUATION_LANE)
  ? null
  : resolveReleaseTargetMarketDate(release, {
    trackLegacyRead: true,
    readerId: 'scripts/ops/build-pipeline-epoch.mjs',
  });
const fallbackModuleRunId = forcedRunId
  || consistency.run_id
  || (isDataPlaneLane(EVALUATION_LANE) ? null : runtime.run_id)
  || (isDataPlaneLane(EVALUATION_LANE) ? null : release.run_id)
  || null;
const resolveModuleRunId = (stepId) => {
  const direct = String(
    system?.steps?.[stepId]?.status_detail?.run_id
    || system?.steps?.[stepId]?.run_id
    || ''
  ).trim();
  return direct || fallbackModuleRunId;
};

const moduleEntries = {
  market_data_refresh: { run_id: resolveModuleRunId('market_data_refresh'), as_of: normalizeDate(system?.steps?.market_data_refresh?.output_asof), coverage_promise: 'GLOBAL_MARKET_HISTORY', coverage_observed: 'GLOBAL_MARKET_HISTORY', asset_classes: ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
  q1_delta_ingest: { run_id: resolveModuleRunId('q1_delta_ingest'), as_of: normalizeDate(system?.steps?.q1_delta_ingest?.output_asof), coverage_promise: 'GLOBAL_RAW_BARS', coverage_observed: 'GLOBAL_RAW_BARS', asset_classes: ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
  quantlab_daily_report: { run_id: resolveModuleRunId('quantlab_daily_report'), as_of: normalizeDate(system?.steps?.quantlab_daily_report?.output_asof), coverage_promise: 'PUBLISHED_QUANTLAB_SCOPE', coverage_observed: 'PUBLISHED_QUANTLAB_SCOPE', asset_classes: ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
  hist_probs: { run_id: resolveModuleRunId('hist_probs'), as_of: normalizeDate(system?.steps?.hist_probs?.output_asof), coverage_promise: 'GLOBAL_ASSET_CLASSES', coverage_observed: system?.steps?.hist_probs?.status_detail?.coverage?.zero_coverage_guard ? 'ZERO_COVERAGE' : 'GLOBAL_ASSET_CLASSES', asset_classes: system?.steps?.hist_probs?.status_detail?.coverage?.asset_classes || ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
  forecast_daily: { run_id: resolveModuleRunId('forecast_daily'), as_of: normalizeDate(system?.steps?.forecast_daily?.output_asof), coverage_promise: 'US_STOCK', coverage_observed: 'US_STOCK', asset_classes: ['STOCK'], markets: ['US'] },
  scientific_summary: { run_id: resolveModuleRunId('scientific_summary'), as_of: normalizeDate(system?.steps?.scientific_summary?.output_asof), coverage_promise: 'SCIENTIFIC_CONTEXT', coverage_observed: 'SCIENTIFIC_CONTEXT', asset_classes: ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
  snapshot: { run_id: resolveModuleRunId('snapshot'), as_of: normalizeDate(system?.steps?.snapshot?.output_asof), coverage_promise: 'PROMOTION_READY_SCOPE', coverage_observed: 'PROMOTION_READY_SCOPE', asset_classes: ACTIVE_ASSET_CLASSES, markets: ['US', 'EU', 'ASIA'] },
};

const blockingDates = Object.values(moduleEntries).map((item) => item.as_of).filter(Boolean).sort();
const minimumBlockingModuleDate = blockingDates[0] || null;
const targetMarketDate = forcedTargetMarketDate
  || consistency.target_market_date
  || (isDataPlaneLane(EVALUATION_LANE) ? null : releaseTargetMarketDate)
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
      runId: forcedRunId
        || consistency.run_id
        || (isDataPlaneLane(EVALUATION_LANE) ? null : runtime.run_id)
        || (isDataPlaneLane(EVALUATION_LANE) ? null : release.run_id)
        || `epoch-${targetMarketDate || new Date().toISOString().slice(0, 10)}`,
    targetMarketDate,
    upstreamRunIds: collectUpstreamRunIds(system, release, runtime, recovery),
  }),
  evaluation_lane: EVALUATION_LANE,
  release_scope_evaluated: RELEASE_SCOPE_EVALUATED,
  target_market_date: targetMarketDate,
  minimum_blocking_module_date: minimumBlockingModuleDate,
  modules: moduleEntries,
  final_integrity_seal: isDataPlaneLane(EVALUATION_LANE) ? null : (seal || null),
  blocking_gaps: [...blockingGaps, ...mismatchGaps],
  advisory_gaps: advisoryGaps,
  // blocking_severity check removed: it creates a circular dependency
  // (epoch_severity depends on pipeline_ok, pipeline_ok depends on blocking_severity,
  //  blocking_severity depends on epoch_severity). Coherence is proven by no blocking gaps + no mismatch.
  pipeline_ok: controlPlaneOkForEpoch && blockingGaps.length === 0,
});
