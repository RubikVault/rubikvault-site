#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'mirrors/learning/reports');
const PUBLIC_OUT = path.join(ROOT, 'public/data/reports/learning-monthly-latest.json');

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

function loadReports(endDate, windowDays) {
  const reports = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = daysAgo(endDate, i);
    const report = readJson(path.join(REPORT_DIR, `${date}.json`));
    if (report) reports.push(report);
  }
  return reports;
}

function topGateClasses(reports) {
  const totals = {};
  for (const report of reports) {
    const breakdown = report?.features?.stock_analyzer?.gate_rejection_breakdown || {};
    for (const row of Object.values(breakdown)) {
      for (const [key, value] of Object.entries(row || {})) {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      }
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));
}

function buildRollingWindow(reports, days) {
  const slice = reports.slice(-days);
  return {
    days_requested: days,
    days_covered: slice.length,
    analyzer_precision_10_avg: avg(slice.map((report) => report?.features?.stock_analyzer?.precision_10)),
    analyzer_precision_50_avg: avg(slice.map((report) => report?.features?.stock_analyzer?.precision_50)),
    analyzer_brier_avg: avg(slice.map((report) => report?.features?.stock_analyzer?.brier_7d)),
    analyzer_ece_avg: avg(slice.map((report) => report?.features?.stock_analyzer?.ece_7d)),
    analyzer_predictions_avg: avg(slice.map((report) => report?.features?.stock_analyzer?.predictions_today)),
    forecast_accuracy_avg: avg(slice.map((report) => report?.features?.forecast?.accuracy_7d)),
    scientific_hit_rate_avg: avg(slice.map((report) => report?.features?.scientific?.hit_rate_7d)),
    elliott_accuracy_avg: avg(slice.map((report) => report?.features?.elliott?.accuracy_7d)),
  };
}

function determinePromotionReadiness(latest) {
  const analyzer = latest?.features?.stock_analyzer || {};
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

function main() {
  const dateArg = process.argv.slice(2).find((arg) => arg.startsWith('--date='));
  const latestDaily = readJson(path.join(REPORT_DIR, 'latest.json'));
  const endDate = dateArg ? dateArg.split('=')[1] : (latestDaily?.date || isoDate(new Date()));
  const reports = loadReports(endDate, 180);
  const latest = reports[reports.length - 1] || latestDaily || null;
  const monthId = String(endDate).slice(0, 7);

  const monthly = {
    schema_version: 'rv.learning.monthly.v1',
    generated_at: new Date().toISOString(),
    month_id: monthId,
    end_date: endDate,
    days_covered: reports.length,
    summary: {
      status: latest?.summary?.overall_status || null,
      features_tracked: latest?.summary?.features_tracked || null,
      analyzer_predictions_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.stock_analyzer?.predictions_today)),
      analyzer_precision_10_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.stock_analyzer?.precision_10)),
      analyzer_brier_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.stock_analyzer?.brier_7d)),
    },
    analyzer: {
      latest: latest?.features?.stock_analyzer || null,
      learning_status: latest?.features?.stock_analyzer?.learning_status || null,
      latest_safety_switch: latest?.features?.stock_analyzer?.safety_switch || null,
      latest_false_positive_classes_30d: latest?.features?.stock_analyzer?.false_positive_classes_30d || {},
      latest_gate_rejection_breakdown: latest?.features?.stock_analyzer?.gate_rejection_breakdown || null,
      latest_by_horizon: latest?.features?.stock_analyzer?.by_horizon || {},
      latest_by_asset_class: latest?.features?.stock_analyzer?.by_asset_class || {},
      latest_source_meta: latest?.features?.stock_analyzer?.source_meta || null,
    },
    rolling_windows: {
      d30: buildRollingWindow(reports, 30),
      d90: buildRollingWindow(reports, 90),
      d180: buildRollingWindow(reports, 180),
    },
    source_attribution: {
      analyzer_predictions_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.stock_analyzer?.predictions_today)),
      forecast_predictions_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.forecast?.predictions_today)),
      scientific_predictions_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.scientific?.predictions_today)),
      elliott_predictions_avg_30d: avg(reports.slice(-30).map((report) => report?.features?.elliott?.predictions_today)),
    },
    top_gate_rejection_classes_30d: topGateClasses(reports.slice(-30)),
    promotion_rollback_notes: {
      analyzer: 'promotion/rollback automation not yet enabled; monthly report tracks readiness metrics only.',
      forecast: 'forecast monthly pipeline remains separate and should be reviewed alongside this learning report.',
    },
    promotion_readiness: determinePromotionReadiness(latest),
  };

  const outPath = path.join(REPORT_DIR, 'monthly', `${monthId}.json`);
  writeJson(outPath, monthly);
  writeJson(path.join(REPORT_DIR, 'monthly', 'latest.json'), monthly);
  writeJson(PUBLIC_OUT, monthly);

  console.log(`[learning-monthly] wrote ${path.relative(ROOT, outPath)}`);
  console.log(`[learning-monthly] month=${monthId} d30_p10=${monthly.rolling_windows.d30.analyzer_precision_10_avg}`);
}

main();
