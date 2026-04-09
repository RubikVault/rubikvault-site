#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

const systemStatusPath = path.join(ROOT, 'public', 'data', 'reports', 'system-status-latest.json');
const dataFreshnessPath = path.join(ROOT, 'public', 'data', 'reports', 'data-freshness-latest.json');
const uiSsotPath = path.join(ROOT, 'docs', 'ops', 'stock-analyzer-ui-ssot.md');
const bestSetupsPath = path.join(ROOT, 'public', 'data', 'snapshots', 'best-setups-v4.json');

const systemStatus = readJson(systemStatusPath);
const dataFreshness = readJson(dataFreshnessPath);

const doc = {
  schema_version: 'nas.ui.contract.probe.v1',
  generated_at: new Date().toISOString(),
  checks: {
    system_status_present: Boolean(systemStatus),
    data_freshness_present: Boolean(dataFreshness),
    ui_ssot_present: exists(uiSsotPath),
    best_setups_snapshot_present: exists(bestSetupsPath),
    system_status_overall: systemStatus?.overall ?? null,
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
process.exit(
  doc.checks.system_status_present &&
    doc.checks.data_freshness_present &&
    doc.checks.ui_ssot_present &&
    doc.checks.best_setups_snapshot_present
    ? 0
    : 2,
);
