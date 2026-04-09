#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const HOME = os.homedir();
const QUANTLAB_ROOT = path.join(HOME, 'QuantLabHot');
const OUTPUT_PATH = path.join(ROOT, 'public/data/reports/storage-budget-latest.json');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function duKilobytes(targetPath) {
  if (!fs.existsSync(targetPath)) return null;
  const proc = spawnSync('du', ['-sk', targetPath], { encoding: 'utf8' });
  if (proc.status !== 0) return null;
  const first = (proc.stdout || '').trim().split(/\s+/)[0];
  const value = Number(first);
  return Number.isFinite(value) ? value : null;
}

function dfSummary(targetPath) {
  const proc = spawnSync('df', ['-k', targetPath], { encoding: 'utf8' });
  if (proc.status !== 0) return null;
  const lines = (proc.stdout || '').trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[lines.length - 1].trim().split(/\s+/);
  if (cols.length < 6) return null;
  const totalKb = Number(cols[1]);
  const usedKb = Number(cols[2]);
  const availKb = Number(cols[3]);
  const mountedOn = cols[cols.length - 1];
  return {
    filesystem: cols[0],
    mounted_on: mountedOn,
    total_gb: Number.isFinite(totalKb) ? Math.round((totalKb / 1024 / 1024) * 10) / 10 : null,
    used_gb: Number.isFinite(usedKb) ? Math.round((usedKb / 1024 / 1024) * 10) / 10 : null,
    available_gb: Number.isFinite(availKb) ? Math.round((availKb / 1024 / 1024) * 10) / 10 : null,
  };
}

function budgetSeverity(availableGb) {
  if (!Number.isFinite(availableGb)) return 'warning';
  if (availableGb < 20) return 'critical';
  if (availableGb < 40) return 'warning';
  return 'ok';
}

function toEntry(id, targetPath, note = null) {
  const kb = duKilobytes(targetPath);
  return {
    id,
    path: targetPath,
    exists: fs.existsSync(targetPath),
    size_gb: kb == null ? null : Math.round((kb / 1024 / 1024) * 100) / 100,
    note,
  };
}

const disk = dfSummary(HOME);
const targets = [
  toEntry('repo_root', ROOT, 'Local repo working tree'),
  toEntry('forecast_outcomes', path.join(ROOT, 'mirrors/forecast/ledger/outcomes'), 'Largest forecast ledger growth source'),
  toEntry('forecast_forecasts', path.join(ROOT, 'mirrors/forecast/ledger/forecasts'), 'Forecast ledger forecasts partitions'),
  toEntry('hist_probs', path.join(ROOT, 'public/data/hist-probs'), 'Historical probabilities artifacts'),
  toEntry('v3_adjusted_series', path.join(ROOT, 'public/data/v3/series/adjusted'), 'Adjusted series used by stock UI/history'),
  toEntry('public_data', path.join(ROOT, 'public/data'), 'Published repo data artifacts'),
  toEntry('mirrors_root', path.join(ROOT, 'mirrors'), 'Repo mirrors and ledgers'),
  toEntry('quantlab_root', QUANTLAB_ROOT, 'External QuantLab root on the Mac'),
  toEntry('quantlab_feature_store', path.join(QUANTLAB_ROOT, 'rubikvault-quantlab/features/store'), 'QuantLab feature store'),
];

const payload = {
  schema: 'rv.storage_budget.v1',
  generated_at: new Date().toISOString(),
  disk,
  thresholds_gb: {
    warning: 40,
    critical: 20,
  },
  summary: {
    severity: budgetSeverity(disk?.available_gb ?? null),
    available_gb: disk?.available_gb ?? null,
    forecast_growth_projection_gb_per_month: 9,
  },
  targets,
};

writeJsonAtomic(OUTPUT_PATH, payload);
console.log(`STORAGE_BUDGET_OK ${OUTPUT_PATH}`);
