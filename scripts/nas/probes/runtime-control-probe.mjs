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

const runtimeControlPath = path.join(ROOT, 'public', 'data', 'runtime', 'stock-analyzer-control.json');
const dataFreshnessPath = path.join(ROOT, 'public', 'data', 'reports', 'data-freshness-latest.json');

const runtimeControl = readJson(runtimeControlPath);
const dataFreshness = readJson(dataFreshnessPath);

const doc = {
  schema_version: 'nas.runtime.control.probe.v1',
  generated_at: new Date().toISOString(),
  checks: {
    runtime_control_present: Boolean(runtimeControl),
    data_freshness_present: Boolean(dataFreshness),
    learning_status: runtimeControl?.learning_status ?? null,
    safety_switch: runtimeControl?.safety_switch ?? null,
    policy_version: runtimeControl?.policy_version ?? null,
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
process.exit(runtimeControl && dataFreshness ? 0 : 2);
