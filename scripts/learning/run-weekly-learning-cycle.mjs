#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'mirrors/learning/reports');
const PUBLIC_OUT = path.join(ROOT, 'public/data/reports/learning-weekly-latest.json');
const POLICY_PATH = path.join(ROOT, 'policies/best-setups.v1.json');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function isoDate(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function daysAgo(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function avg(values) {
  const nums = values.filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 10000) / 10000;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function sumGateBreakdowns(reports) {
  const out = {};
  for (const report of reports) {
    const breakdown = report?.features?.stock_analyzer?.gate_rejection_breakdown || {};
    for (const [horizon, row] of Object.entries(breakdown)) {
      if (!out[horizon]) out[horizon] = {};
      for (const [key, value] of Object.entries(row || {})) {
        out[horizon][key] = (out[horizon][key] || 0) + Number(value || 0);
      }
    }
  }
  return out;
}

function determineSafetyStatus(latestReport, policy) {
  const latestFeatureSwitch = latestReport?.features?.stock_analyzer?.safety_switch;
  if (latestFeatureSwitch?.level) {
    return latestFeatureSwitch;
  }
  const latest = latestReport?.features?.stock_analyzer || {};
  const thresholds = policy?.safety_switch_thresholds?.defaults || {};
  const precision10 = finiteOrNull(latest?.precision_10);
  const ece7d = finiteOrNull(latest?.ece_7d);
  const coverageToday = finiteOrNull(latest?.predictions_today) ?? 0;
  const coverageAvg = finiteOrNull(latest?.coverage_per_day) ?? 0;
  const coverageDropPct = coverageAvg > 0 ? ((coverageAvg - coverageToday) / coverageAvg) * 100 : 0;

  if (precision10 == null && ece7d == null) {
    return { level: 'BOOTSTRAP', reason: 'no_mature_analyzer_metrics_yet' };
  }

  if (precision10 != null && precision10 < Number(thresholds?.red?.precision_at_10_lt ?? 0.5)) {
    return { level: 'RED', reason: 'precision_at_10_below_red_threshold' };
  }
  if (precision10 != null && precision10 < Number(thresholds?.orange?.precision_at_10_lt ?? 0.54)) {
    return { level: 'ORANGE', reason: 'precision_at_10_below_orange_threshold' };
  }
  if ((ece7d != null && ece7d > Number(thresholds?.yellow?.ece_gt ?? 0.08)) || coverageDropPct > Number(thresholds?.yellow?.coverage_drop_pct ?? 20)) {
    return { level: 'YELLOW', reason: 'ece_or_coverage_warning' };
  }
  return { level: 'GREEN', reason: 'within_default_thresholds' };
}

function determinePromotionReadiness(latestReport) {
  const analyzer = latestReport?.features?.stock_analyzer || {};
  const minimumN = analyzer?.minimum_n_status || {};
  const safety = analyzer?.safety_switch || {};
  const learningStatus = analyzer?.learning_status || 'BOOTSTRAP';
  const eligible = learningStatus === 'ACTIVE'
    && String(safety?.level || '').toUpperCase() === 'GREEN'
    && minimumN?.ready_for_safety === true;
  return {
    minimum_n_satisfied: minimumN?.ready_for_safety === true,
    eligible_for_promotion: eligible,
    freeze_reason: eligible ? null : (safety?.trigger || learningStatus || 'not_ready'),
    rollback_candidate: ['RED', 'ORANGE'].includes(String(safety?.level || '').toUpperCase()),
  };
}

function loadReports(endDate, windowDays) {
  const reports = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = daysAgo(endDate, i);
    const report = readJson(path.join(REPORT_DIR, `${date}.json`));
    if (report) reports.push(report);
  }
  return reports;
}

function main() {
  const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='));
  const latestDaily = readJson(path.join(REPORT_DIR, 'latest.json'));
  const endDate = dateArg ? dateArg.split('=')[1] : (latestDaily?.date || isoDate(new Date()));
  const policy = readJson(POLICY_PATH) || {};
  const reports = loadReports(endDate, 7);
  const latest = reports[reports.length - 1] || latestDaily || null;

  const weekly = {
    schema_version: 'rv.learning.weekly.v1',
    generated_at: new Date().toISOString(),
    week_end: endDate,
    days_covered: reports.length,
    safety_status: determineSafetyStatus(latest, policy),
    promotion_readiness: determinePromotionReadiness(latest),
    summary: {
      status: latest?.summary?.overall_status || null,
      features_tracked: latest?.summary?.features_tracked || null,
      analyzer_predictions_avg: avg(reports.map((report) => report?.features?.stock_analyzer?.predictions_today)),
      analyzer_precision_10_avg: avg(reports.map((report) => report?.features?.stock_analyzer?.precision_10)),
      analyzer_brier_7d_avg: avg(reports.map((report) => report?.features?.stock_analyzer?.brier_7d)),
    },
    analyzer: {
      avg_predictions_today: avg(reports.map((report) => report?.features?.stock_analyzer?.predictions_today)),
      avg_precision_10: avg(reports.map((report) => report?.features?.stock_analyzer?.precision_10)),
      avg_precision_50: avg(reports.map((report) => report?.features?.stock_analyzer?.precision_50)),
      avg_brier_7d: avg(reports.map((report) => report?.features?.stock_analyzer?.brier_7d)),
      avg_ece_7d: avg(reports.map((report) => report?.features?.stock_analyzer?.ece_7d)),
      avg_stock_stability: avg(reports.map((report) => report?.features?.stock_analyzer?.stability)),
      latest_learning_status: latest?.features?.stock_analyzer?.learning_status || null,
      latest_gate_rejection_breakdown: latest?.features?.stock_analyzer?.gate_rejection_breakdown || null,
      latest_false_positive_classes_30d: latest?.features?.stock_analyzer?.false_positive_classes_30d || {},
      gate_rejection_breakdown_7d_sum: sumGateBreakdowns(reports),
      latest_by_horizon: latest?.features?.stock_analyzer?.by_horizon || {},
      latest_by_asset_class: latest?.features?.stock_analyzer?.by_asset_class || {},
      latest_source_meta: latest?.features?.stock_analyzer?.source_meta || null,
    },
    forecast: {
      avg_accuracy_7d: avg(reports.map((report) => report?.features?.forecast?.accuracy_7d)),
      avg_brier_7d: avg(reports.map((report) => report?.features?.forecast?.brier_7d)),
    },
    scientific: {
      avg_accuracy_7d: avg(reports.map((report) => report?.features?.scientific?.accuracy_7d)),
      avg_hit_rate_7d: avg(reports.map((report) => report?.features?.scientific?.hit_rate_7d)),
    },
    elliott: {
      avg_accuracy_7d: avg(reports.map((report) => report?.features?.elliott?.accuracy_7d)),
    },
    notes: {
      drift_basis: 'daily_learning_reports',
      champion_vs_challenger: 'forecast-specific champion/challenger remains managed by forecast weekly pipeline; this report summarizes learning-layer impact.',
      error_taxonomy: 'gate rejection deltas and 30d stock-analyzer false-positive classes included.',
    },
  };

  const outPath = path.join(REPORT_DIR, 'weekly', `${endDate}.json`);
  writeJson(outPath, weekly);
  writeJson(path.join(REPORT_DIR, 'weekly', 'latest.json'), weekly);
  writeJson(PUBLIC_OUT, weekly);

  console.log(`[learning-weekly] wrote ${path.relative(ROOT, outPath)}`);
  console.log(`[learning-weekly] safety=${weekly.safety_status.level} days=${weekly.days_covered} analyzer_p10=${weekly.analyzer.avg_precision_10}`);
}

main();
