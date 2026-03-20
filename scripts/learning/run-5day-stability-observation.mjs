#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const QUANT_ROOT = process.env.QUANT_ROOT || '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab';
const REPORT_DIR = path.join(ROOT, 'mirrors/learning/reports');
const PUBLIC_OUT = path.join(ROOT, 'public/data/reports/learning-stability-5d-latest.json');
const MIRROR_OUT = path.join(REPORT_DIR, 'learning-stability-5d-latest.json');
const JOBS_DIR = path.join(QUANT_ROOT, 'jobs');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function daysAgo(dateStr, n) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return isoDate(date);
}

function avg(values) {
  const nums = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 10000) / 10000;
}

function latestRefreshes(limit = 8) {
  let jobDirs = [];
  try {
    jobDirs = fs.readdirSync(JOBS_DIR)
      .map((name) => path.join(JOBS_DIR, name))
      .filter((abs) => fs.statSync(abs).isDirectory())
      .sort()
      .reverse();
  } catch {
    return [];
  }

  const out = [];
  for (const dir of jobDirs) {
    const status = readJson(path.join(dir, 'v5_refresh_status.json'));
    if (!status) continue;
    out.push({
      job_dir: dir,
      mode: status.mode || null,
      status: status.status || null,
      started_at: status.started_at || null,
      finished_at: status.finished_at || null,
      failed_step: status.failed_step || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function main() {
  const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='));
  const latest = readJson(path.join(REPORT_DIR, 'latest.json'));
  const endDate = dateArg ? dateArg.split('=')[1] : (latest?.date || isoDate(new Date()));
  const reports = Array.from({ length: 5 }, (_, index) => {
    const date = daysAgo(endDate, 4 - index);
    return { date, report: readJson(path.join(REPORT_DIR, `${date}.json`)) };
  }).filter((entry) => entry.report);

  const parity = readJson(path.join(REPORT_DIR, 'best-setups-ssot-parity-latest.json'));
  const etf = readJson(path.join(ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json'));
  const snapshot = readJson(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'));

  const payload = {
    schema_version: 'rv.learning.stability_5d.v1',
    generated_at: new Date().toISOString(),
    window_end: endDate,
    days_covered: reports.length,
    analyzer: {
      precision_10_avg: avg(reports.map((entry) => entry.report?.features?.stock_analyzer?.precision_10)),
      precision_50_avg: avg(reports.map((entry) => entry.report?.features?.stock_analyzer?.precision_50)),
      brier_7d_avg: avg(reports.map((entry) => entry.report?.features?.stock_analyzer?.brier_7d)),
      safety_levels: reports.map((entry) => ({
        date: entry.date,
        level: entry.report?.features?.stock_analyzer?.safety_switch?.level || null,
        learning_status: entry.report?.features?.stock_analyzer?.learning_status || null,
      })),
    },
    snapshot_verified_counts: snapshot?.meta?.verified_counts || null,
    etf_diagnostic: etf?.diagnosis || null,
    parity_summary: parity?.summary || null,
    refresh_runs: latestRefreshes(),
  };

  writeJson(MIRROR_OUT, payload);
  writeJson(PUBLIC_OUT, payload);
  console.log(JSON.stringify({ ok: true, path: MIRROR_OUT, days_covered: payload.days_covered }));
}

main();
