#!/usr/bin/env node

export const PIPELINE_LANES = Object.freeze({
  DATA_PLANE: 'data-plane',
  RELEASE_FULL: 'release-full',
});

export const RELEASE_ONLY_STEP_IDS = Object.freeze([
  'runtime_preflight',
  'stock_analyzer_universe_audit',
  'ui_field_truth_report',
  'final_integrity_seal',
  'build_deploy_bundle',
  'wrangler_deploy',
]);

export const DATA_PLANE_DEFERRED_OBSERVER_STEP_IDS = Object.freeze([
  'data_freshness_report',
  'pipeline_epoch',
]);

export function isDataPlaneLane(value) {
  return value === PIPELINE_LANES.DATA_PLANE;
}

export function isReleaseFullLane(value) {
  return value === PIPELINE_LANES.RELEASE_FULL;
}

export function parsePipelineLane(argv = [], defaultLane = PIPELINE_LANES.RELEASE_FULL) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--lane' && argv[i + 1]) {
      return normalizeLane(argv[i + 1], defaultLane);
    }
    if (arg.startsWith('--lane=')) {
      return normalizeLane(arg.slice('--lane='.length), defaultLane);
    }
  }
  return normalizeLane(process.env.RV_PIPELINE_LANE || process.env.PIPELINE_LANE || defaultLane, defaultLane);
}

export function normalizeLane(value, fallback = PIPELINE_LANES.RELEASE_FULL) {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === PIPELINE_LANES.DATA_PLANE || candidate === PIPELINE_LANES.RELEASE_FULL) {
    return candidate;
  }
  return fallback;
}
