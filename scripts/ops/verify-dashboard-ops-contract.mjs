#!/usr/bin/env node

import path from 'node:path';
import { readJson, writeJsonAtomic } from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
  dashboardMeta: path.join(ROOT, 'public/dashboard_v6_meta_data.json'),
  dashboardV7Status: path.join(ROOT, 'public/data/ui/dashboard-v7-status.json'),
  output: path.join(ROOT, 'public/data/reports/dashboard-ops-audit-latest.json'),
};

function fileExists(filePath) {
  return Boolean(readJson(filePath));
}

const system = readJson(PATHS.system);
const runtime = readJson(PATHS.runtime);
const epoch = readJson(PATHS.epoch);
const dashboardMeta = readJson(PATHS.dashboardMeta);
const dashboardV7Status = readJson(PATHS.dashboardV7Status);
const failures = [];

if (!system?.summary?.control_plane_ref) failures.push({ family: 'ops_dashboard', error: 'missing_control_plane_ref' });
if (!system?.summary?.epoch_ref) failures.push({ family: 'ops_dashboard', error: 'missing_epoch_ref' });
if (!system?.summary?.monitoring_ref) failures.push({ family: 'ops_dashboard', error: 'missing_monitoring_ref' });
if (!runtime) failures.push({ family: 'ops_dashboard', error: 'missing_runtime_artifact' });
if (!epoch) failures.push({ family: 'ops_dashboard', error: 'missing_epoch_artifact' });
if (!dashboardMeta) failures.push({ family: 'ops_dashboard', error: 'missing_dashboard_meta' });
if (!dashboardV7Status) failures.push({ family: 'ops_dashboard', error: 'missing_dashboard_v7_status' });
if (runtime?.target_market_date && epoch?.target_market_date && runtime.target_market_date !== epoch.target_market_date) {
  failures.push({ family: 'ops_dashboard', error: 'runtime_epoch_target_mismatch' });
}

writeJsonAtomic(PATHS.output, {
  schema: 'rv.dashboard_ops_audit.v1',
  generated_at: new Date().toISOString(),
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  families: {
    ops_dashboard: failures.length === 0 ? 'PASS' : 'FAIL',
  },
  total_failures: failures.length,
  failures,
  refs: {
    system_status: 'public/data/reports/system-status-latest.json',
    pipeline_runtime: 'public/data/pipeline/runtime/latest.json',
    pipeline_epoch: 'public/data/pipeline/epoch.json',
    dashboard_meta: 'public/dashboard_v6_meta_data.json',
    dashboard_v7_status: 'public/data/ui/dashboard-v7-status.json',
  },
});

if (failures.length > 0) process.exit(1);
