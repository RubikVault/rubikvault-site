#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PATHS = {
  forecastCalibration: path.join(ROOT, 'mirrors/forecast/champion/calibration_latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  output: path.join(ROOT, 'public/data/reports/stock-analyzer-probability-calibration-latest.json'),
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const forecastCalibration = readJson(PATHS.forecastCalibration) || {};
const epoch = readJson(PATHS.epoch) || {};
const system = readJson(PATHS.system) || {};

writeJson(PATHS.output, {
  schema: 'rv_stock_analyzer_probability_calibration_v1',
  generated_at: new Date().toISOString(),
  target_market_date: epoch?.target_market_date || null,
  coverage: {
    forecast_daily: epoch?.modules?.forecast_daily || null,
    hist_probs: epoch?.modules?.hist_probs || null,
    system_blocking_severity: system?.summary?.blocking_severity || null,
    system_coverage_ready: system?.summary?.coverage_ready ?? null,
  },
  forecast_daily: forecastCalibration,
  notes: [
    'Promotion requires calibrated probability plus coverage/finality gates.',
    'Unsupported scope may render but is not promotable.',
  ],
});
