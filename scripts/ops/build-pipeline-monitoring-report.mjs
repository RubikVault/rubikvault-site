#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ledgerSummary } from '../lib/hist-probs/error-ledger.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  computeAudit: path.join(ROOT, 'public/data/reports/pipeline-compute-audit-latest.json'),
  histSummary: path.join(ROOT, 'public/data/hist-probs/run-summary.json'),
  recoveryState: path.join(ROOT, 'mirrors/ops/dashboard-green/state.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  output: path.join(ROOT, 'public/data/reports/pipeline-monitoring-latest.json'),
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

function classifyThreshold(value, warn, critical, higherIsWorse = true) {
  if (!Number.isFinite(value)) return 'unknown';
  if (higherIsWorse) {
    if (value > critical) return 'critical';
    if (value > warn) return 'warning';
  } else {
    if (value < critical) return 'critical';
    if (value < warn) return 'warning';
  }
  return 'ok';
}

const computeAudit = readJson(PATHS.computeAudit) || {};
const histSummary = readJson(PATHS.histSummary) || {};
const recoveryState = readJson(PATHS.recoveryState) || {};
const system = readJson(PATHS.system) || {};

const thresholds = {
  error_rate: { warn: 0.01, critical: 0.05 },
  dlq_rate: { warn: 0.01, critical: 0.05 },
  duration_multiplier: { warn: 1.5, critical: 2.0 },
  rss_usage_ratio: { warn: 0.8, critical: 0.95 },
  restarts_per_day: { warn: 2, critical: 3 },
  sqlite_busy_rate: { warn: 0.01, critical: 0.05 },
};

const histAudit = Array.isArray(computeAudit.runners)
  ? computeAudit.runners.find((item) => item.runner === 'hist_probs_turbo')
  : null;
const histErrorRate = Number(histSummary?.tickers_total || 0) > 0
  ? Number(histSummary?.tickers_errors || 0) / Number(histSummary.tickers_total)
  : null;
const histDlq = ledgerSummary({ maxAgeDays: 7 });
const histDlqRate = Number(histSummary?.tickers_total || 0) > 0
  ? Number(histDlq?.total || 0) / Number(histSummary.tickers_total)
  : null;
const histDurationMultiplier = Number.isFinite(Number(histSummary?.elapsed_seconds)) && Number.isFinite(Number(histAudit?.observed_duration_sec)) && Number(histAudit.observed_duration_sec) > 0
  ? Number(histSummary.elapsed_seconds) / Number(histAudit.observed_duration_sec)
  : null;
const histRssUsageRatio = Number.isFinite(Number(histAudit?.observed_peak_rss_mb)) && Number.isFinite(Number(histAudit?.mac_budget_mb)) && Number(histAudit.mac_budget_mb) > 0
  ? Number(histSummary?.rss_at_completion_mb || histSummary?.rss_complete_mb || histAudit.observed_peak_rss_mb) / Number(histAudit.mac_budget_mb)
  : null;
const histRestartCounts = Object.values(recoveryState?.step_states || {})
  .reduce((sum, step) => sum + Number(step?.restart_count || 0), 0);

writeJson(PATHS.output, {
  schema: 'rv_pipeline_monitoring_v1',
  generated_at: new Date().toISOString(),
  thresholds,
  gates: {
    hist_probs_error_rate: {
      value: histErrorRate,
      status: classifyThreshold(histErrorRate, thresholds.error_rate.warn, thresholds.error_rate.critical),
    },
    hist_probs_dlq_rate: {
      value: histDlqRate,
      status: classifyThreshold(histDlqRate, thresholds.dlq_rate.warn, thresholds.dlq_rate.critical),
    },
    hist_probs_duration_multiplier: {
      value: histDurationMultiplier,
      status: classifyThreshold(histDurationMultiplier, thresholds.duration_multiplier.warn, thresholds.duration_multiplier.critical),
    },
    hist_probs_rss_usage_ratio: {
      value: histRssUsageRatio,
      status: classifyThreshold(histRssUsageRatio, thresholds.rss_usage_ratio.warn, thresholds.rss_usage_ratio.critical),
    },
    recovery_restarts_per_day: {
      value: histRestartCounts,
      status: classifyThreshold(histRestartCounts, thresholds.restarts_per_day.warn, thresholds.restarts_per_day.critical),
    },
    sqlite_busy_rate: {
      value: null,
      status: 'not_applicable',
    },
  },
  refs: {
    compute_audit: 'public/data/reports/pipeline-compute-audit-latest.json',
    hist_probs_run_summary: 'public/data/hist-probs/run-summary.json',
    hist_probs_error_ledger: 'public/data/hist-probs/error-ledger.ndjson',
    recovery_state: 'mirrors/ops/dashboard-green/state.json',
    system_status: 'public/data/reports/system-status-latest.json',
    epoch: system?.summary?.epoch_ref || 'public/data/pipeline/epoch.json',
  },
  evidence: {
    hist_probs_error_ledger_recent_entries: histDlq?.total ?? 0,
    hist_probs_error_ledger_unique_tickers: histDlq?.unique_tickers ?? 0,
    hist_probs_error_ledger_by_error: histDlq?.by_error ?? {},
  },
});
