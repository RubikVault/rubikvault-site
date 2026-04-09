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

const operationalStatusPath = path.join(ROOT, 'public', 'data', 'quantlab', 'status', 'operational-status.json');
const q1SuccessPath = path.join(ROOT, 'mirrors', 'quantlab', 'ops', 'q1_daily_delta_ingest', 'latest_success.json');
const dailyReportScriptPath = path.join(ROOT, 'scripts', 'quantlab', 'build_quantlab_v4_daily_report.mjs');
const quantlabRoots = [
  '/Users/michaelpuchowezki/QuantLabHot',
  '/volume1/homes/neoboy/QuantLabHot',
  path.join(ROOT, 'mirrors', 'quantlab'),
];

const operationalStatus = readJson(operationalStatusPath);
const q1Success = readJson(q1SuccessPath);
const quantlabRoot = quantlabRoots.find((candidate) => exists(candidate)) || null;

const doc = {
  schema_version: 'nas.quantlab.boundary.audit.v1',
  generated_at: new Date().toISOString(),
  checks: {
    operational_status_present: Boolean(operationalStatus),
    q1_success_marker_present: Boolean(q1Success),
    daily_report_script_present: exists(dailyReportScriptPath),
    quantlab_root_present: Boolean(quantlabRoot),
    quantlab_root: quantlabRoot,
  },
  inference_boundary_ready: Boolean(operationalStatus),
  replay_boundary_ready: Boolean(q1Success || operationalStatus),
  hot_path_ready: Boolean(q1Success && quantlabRoot),
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
process.exit(doc.inference_boundary_ready ? 0 : 2);
