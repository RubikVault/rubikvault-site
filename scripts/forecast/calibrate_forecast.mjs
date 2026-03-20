#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readLedgerRangeAsync } from './ledger_writer.mjs';
import { fitIsotonicRegression } from '../lib/calibration/isotonic.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'mirrors/forecast/champion');
const HORIZONS = ['1d', '5d', '20d'];
const MIN_TRAIN_SAMPLES = 200;

function isoDate(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function mean(values) {
  const nums = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function brier(rows) {
  if (!rows.length) return null;
  return mean(rows.map((row) => (Number(row.p_up || 0.5) - Number(row.y || 0)) ** 2));
}

function evaluateIsotonic(rows, model) {
  if (!rows.length || !model?.points?.length) return null;
  const mapped = rows.map((row) => {
    const p = Number(row.p_up || 0.5);
    let calibrated = p;
    for (const point of model.points) {
      if (p >= point.pMin && p <= point.pMax) {
        calibrated = point.calibratedValue;
        break;
      }
    }
    return { p: calibrated, y: Number(row.y || 0) };
  });
  return mean(mapped.map((row) => (row.p - row.y) ** 2));
}

async function main() {
  const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='));
  const endDate = dateArg ? dateArg.split('=')[1] : isoDate(new Date());
  const trainStart = shiftDays(endDate, -80);
  const evalStart = shiftDays(endDate, -20);
  const outcomes = (await readLedgerRangeAsync(ROOT, 'outcomes', trainStart, endDate)).filter((row) => row?.provenance === 'live');
  const summary = {};

  for (const horizon of HORIZONS) {
    const horizonRows = outcomes.filter((row) => String(row?.horizon || '') === horizon);
    const trainRows = horizonRows.filter((row) => String(row?.outcome_trading_date || '') < evalStart);
    const evalRows = horizonRows.filter((row) => String(row?.outcome_trading_date || '') >= evalStart);
    const probs = trainRows.map((row) => Number(row.p_up || 0.5));
    const labels = trainRows.map((row) => Number(row.y || 0));
    const model = fitIsotonicRegression(probs, labels);
    const artifact = {
      schema: 'forecast_isotonic_calibration_v1',
      generated_at: new Date().toISOString(),
      horizon,
      train_window: { start: trainStart, end: shiftDays(evalStart, -1) },
      eval_window: { start: evalStart, end: endDate },
      sample_count_train: trainRows.length,
      sample_count_eval: evalRows.length,
      minimum_train_samples: MIN_TRAIN_SAMPLES,
      status: trainRows.length >= MIN_TRAIN_SAMPLES ? 'ready' : 'insufficient_samples',
      brier_train_raw: brier(trainRows),
      brier_eval_raw: brier(evalRows),
      brier_eval_calibrated: trainRows.length >= MIN_TRAIN_SAMPLES ? evaluateIsotonic(evalRows, model) : null,
      ...(trainRows.length >= MIN_TRAIN_SAMPLES ? (model || {}) : {}),
    };
    writeJson(path.join(OUT_DIR, `calibration_${horizon}.json`), artifact);
    summary[horizon] = {
      sample_count_train: artifact.sample_count_train,
      sample_count_eval: artifact.sample_count_eval,
      brier_eval_raw: artifact.brier_eval_raw,
      brier_eval_calibrated: artifact.brier_eval_calibrated,
    };
  }

  writeJson(path.join(OUT_DIR, 'calibration_latest.json'), {
    schema: 'forecast_isotonic_calibration_summary_v1',
    generated_at: new Date().toISOString(),
    end_date: endDate,
    horizons: summary,
  });

  console.log(JSON.stringify({ ok: true, end_date: endDate, horizons: summary }));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
