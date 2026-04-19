#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveApprovedNodeBin } from './approved-node.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/ui-audit-latest.json');
const NODE_BIN = resolveApprovedNodeBin();

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runStep(args) {
  const result = spawnSync(NODE_BIN, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function main() {
  const snapshotRc = runStep(['scripts/ops/verify-best-setups-snapshot-contract.mjs']);
  const detailRc = runStep(['scripts/ops/verify-stock-analyzer-detail-contract.mjs']);
  const frontpageLinksRc = runStep(['scripts/ci/validate-frontpage-signal-links.mjs']);
  const dashboardOpsRc = runStep(['scripts/ops/verify-dashboard-ops-contract.mjs']);
  const runtimePreflightRc = runStep(['scripts/ops/runtime-preflight.mjs', '--ensure-runtime', '--mode=hard']);
  const uiFieldTruthRc = runStep(['scripts/ops/build-ui-field-truth-report.mjs']);
  const snapshot = readJson(path.join(ROOT, 'public/data/reports/frontpage-snapshot-audit-latest.json'));
  const detail = readJson(path.join(ROOT, 'public/data/reports/analyzer-detail-audit-latest.json'));
  const frontpageLinks = readJson(path.join(ROOT, 'public/data/reports/frontpage-signal-link-validation-latest.json'));
  const dashboardOps = readJson(path.join(ROOT, 'public/data/reports/dashboard-ops-audit-latest.json'));
  const uiFieldTruth = readJson(path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json'));

  const failures = [];
  if (snapshotRc !== 0 || snapshot?.status !== 'PASS') {
    failures.push({
      family: 'snapshot_frontpage',
      error: snapshot?.violations?.[0]?.message || `exit_code_${snapshotRc}`,
    });
  }
  if (detailRc !== 0 || detail?.status !== 'PASS') {
    failures.push({
      family: 'analyzer_decision',
      error: detail?.failures?.[0]?.error || `exit_code_${detailRc}`,
    });
  }
  const frontpageLinksPass = frontpageLinksRc === 0 && Number(frontpageLinks?.summary?.failed || 0) === 0;
  if (!frontpageLinksPass) {
    failures.push({
      family: 'catalyst',
      error: frontpageLinks?.rows?.find((row) => row?.ok === false)?.error || `exit_code_${frontpageLinksRc}`,
    });
  }
  if (dashboardOpsRc !== 0 || dashboardOps?.status !== 'PASS') {
    failures.push({
      family: 'ops_dashboard',
      error: dashboardOps?.failures?.[0]?.error || `exit_code_${dashboardOpsRc}`,
    });
  }
  const uiRuntimeFailed = runtimePreflightRc !== 0
    || uiFieldTruth?.summary?.runtime_ok === false
    || Number(uiFieldTruth?.summary?.runtime_failure_count || 0) > 0;
  if (uiRuntimeFailed) {
    failures.push({
      family: 'ui_runtime',
      error: uiFieldTruth?.failures?.[0]?.error || `runtime_preflight_exit_${runtimePreflightRc}`,
    });
  } else if (uiFieldTruthRc !== 0 || uiFieldTruth?.summary?.ui_field_truth_ok !== true) {
    failures.push({
      family: 'ui_field_truth',
      error: uiFieldTruth?.failures?.[0]?.error || `exit_code_${uiFieldTruthRc}`,
    });
  }

  const report = {
    schema: 'rv.ui_audit.v3',
    generated_at: new Date().toISOString(),
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    families: {
      analyzer_decision: detail?.status || 'FAIL',
      catalyst: frontpageLinksPass ? 'PASS' : 'FAIL',
      snapshot_frontpage: snapshot?.status === 'PASS' ? 'PASS' : 'FAIL',
      ops_dashboard: dashboardOps?.status || 'FAIL',
      ui_runtime: uiRuntimeFailed ? 'FAIL' : 'PASS',
      ui_field_truth: !uiRuntimeFailed && uiFieldTruth?.summary?.ui_field_truth_ok === true ? 'PASS' : 'FAIL',
    },
    total_failures: failures.length,
    failures,
    refs: {
      frontpage_snapshot: 'public/data/reports/frontpage-snapshot-audit-latest.json',
      analyzer_detail: 'public/data/reports/analyzer-detail-audit-latest.json',
      catalyst_frontpage_links: 'public/data/reports/frontpage-signal-link-validation-latest.json',
      dashboard_ops: 'public/data/reports/dashboard-ops-audit-latest.json',
      ui_field_truth: 'public/data/reports/ui-field-truth-report-latest.json',
    },
  };
  writeJson(REPORT_PATH, report);
  if (failures.length > 0) process.exit(1);
}

main();
