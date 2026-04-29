#!/usr/bin/env node

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PIPELINE_STEPS } from './pipeline-registry.mjs';

const ROOT = process.cwd();
const defaultRemoteRoot = fsSync.existsSync(path.join(ROOT, 'runtime', 'open-probes'))
  ? ROOT
  : ROOT;
const remoteRoot = process.env.OPS_ROOT || process.env.NAS_OPS_ROOT || defaultRemoteRoot;
const remoteCampaignsRoot = path.join(remoteRoot, 'runtime', 'open-probes', 'campaigns');
const remoteRunsRoot = path.join(remoteRoot, 'runtime', 'open-probes', 'runs');
const remoteReportsRoot = path.join(remoteRoot, 'runtime', 'reports', 'open-probes');

const localCampaignsRoot = path.join(ROOT, 'tmp', 'nas-open-probes', 'campaigns');
const localRunsRoot = path.join(ROOT, 'tmp', 'nas-open-probes', 'runs');
const localReportsRoot = path.join(ROOT, 'tmp', 'nas-benchmarks');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function listResultFiles(root) {
  const out = [];
  async function walk(current, depth = 0) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory() && depth < 2) {
        await walk(next, depth + 1);
      } else if (entry.isFile() && entry.name === 'result.json') {
        out.push(next);
      }
    }
  }
  await walk(root);
  return out.sort();
}

async function latestStatus(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statusPath = path.join(root, entry.name, 'status.json');
      const status = await readJson(statusPath);
      if (!status) continue;
      const stamp = Date.parse(status.last_heartbeat_at || status.generated_at || status.started_at || '') || 0;
      candidates.push({ stamp, status });
    }
    candidates.sort((a, b) => a.stamp - b.stamp);
    return candidates.at(-1)?.status ?? null;
  } catch {
    return null;
  }
}

function avg(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

const probeMeta = {
  refresh_history_sample: {
    pipeline_id: 'refresh_v7_history_from_eodhd',
    label: 'Refresh V7 History Sample',
  },
  q1_delta_ingest_smoke: {
    pipeline_id: 'run_daily_delta_ingest_q1',
    label: 'Q1 Delta Ingest Smoke',
  },
  q1_delta_cache_health: {
    pipeline_id: 'run_daily_delta_ingest_q1',
    label: 'Q1 Delta Cache Health',
  },
  fundamentals_sample: {
    pipeline_id: 'build_fundamentals',
    label: 'Fundamentals Sample',
  },
  quantlab_v4_daily_report: {
    pipeline_id: 'build_quantlab_v4_daily_report',
    label: 'QuantLab V4 Daily Report',
  },
  forecast_daily: {
    pipeline_id: 'forecast_run_daily',
    label: 'Forecast Daily',
  },
  hist_probs_sample: {
    pipeline_id: 'run_hist_probs',
    label: 'Hist Probs Sample',
  },
  hist_probs_sample_w1: {
    pipeline_id: 'run_hist_probs',
    label: 'Hist Probs Sample W1',
  },
  hist_probs_sample_w2: {
    pipeline_id: 'run_hist_probs',
    label: 'Hist Probs Sample W2',
  },
  daily_learning_cycle: {
    pipeline_id: 'run_daily_learning_cycle',
    label: 'Daily Learning Cycle',
  },
  best_setups_v4_smoke: {
    pipeline_id: 'build_best_setups_v4',
    label: 'Best Setups V4 Smoke',
  },
  etf_diagnostic_smoke: {
    pipeline_id: 'diagnose_best_setups_etf_drop',
    label: 'ETF Diagnostic Smoke',
  },
  daily_audit_report_smoke: {
    pipeline_id: 'daily_audit_report',
    label: 'Daily Audit Report Smoke',
  },
  cutover_readiness_smoke: {
    pipeline_id: 'cutover_readiness_report',
    label: 'Cutover Readiness Smoke',
  },
  q1_delta_preflight: {
    pipeline_id: 'run_daily_delta_ingest_q1',
    label: 'Q1 Delta Preflight',
  },
  quantlab_boundary_audit: {
    pipeline_id: 'build_quantlab_v4_daily_report',
    label: 'QuantLab Boundary Audit',
  },
  runtime_control_probe: {
    pipeline_id: 'run_daily_learning_cycle',
    label: 'Runtime Control Probe',
  },
  ui_contract_probe: {
    pipeline_id: 'build_stock_analyzer_universe_audit',
    label: 'UI Contract Probe',
  },
  universe_audit_sample: {
    pipeline_id: 'build_stock_analyzer_universe_audit',
    label: 'Universe Audit Sample',
  },
};

const stepById = new Map(PIPELINE_STEPS.map((step) => [step.id, step]));
const deprecatedProbes = new Set(['q1_delta_ingest_smoke']);

const writableRoot = await exists(remoteRoot);
const campaignsRoot = writableRoot ? remoteCampaignsRoot : localCampaignsRoot;
const runsRoot = writableRoot ? remoteRunsRoot : localRunsRoot;
const reportsRoot = writableRoot ? remoteReportsRoot : localReportsRoot;

const resultFiles = await listResultFiles(runsRoot);
const grouped = new Map();
for (const filePath of resultFiles) {
  const result = await readJson(filePath);
  if (!result) continue;
  const key = result.probe_id;
  if (deprecatedProbes.has(key) && process.env.INCLUDE_DEPRECATED_PROBES !== '1') continue;
  if (!grouped.has(key)) {
    const meta = probeMeta[key] || {};
    const step = stepById.get(meta.pipeline_id);
    grouped.set(key, {
      probe_id: key,
      label: meta.label || key,
      pipeline_id: meta.pipeline_id || null,
      default_classification: step?.default_classification || null,
      blockers: step?.blockers || [],
      total_runs: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      durations: [],
      peakRss: [],
      latest_status: result.status || null,
      latest_run_stamp: result.run_stamp || null,
      latest_exit_code: result.exit_code ?? null,
      latest_status_reason: result.status_reason || null,
      latest_stderr_tail: '',
    });
  }
  const bucket = grouped.get(key);
  bucket.total_runs += 1;
  if (result.status === 'success') bucket.successes += 1;
  else bucket.failures += 1;
  if (result.metrics?.timed_out) bucket.timeouts += 1;
  if (typeof result.metrics?.duration_sec === 'number') bucket.durations.push(result.metrics.duration_sec);
  if (typeof result.metrics?.peak_rss_mb === 'number') bucket.peakRss.push(result.metrics.peak_rss_mb);
  if (!bucket.latest_run_stamp || String(result.run_stamp) > String(bucket.latest_run_stamp)) {
    bucket.latest_run_stamp = result.run_stamp || null;
    bucket.latest_status = result.status || null;
    bucket.latest_exit_code = result.exit_code ?? null;
    bucket.latest_status_reason = result.status_reason || null;
    bucket.latest_stderr_tail = result.stderr_tail || '';
  }
}

const probes = Array.from(grouped.values())
  .map((bucket) => ({
    ...bucket,
    avg_duration_sec: avg(bucket.durations),
    avg_peak_rss_mb: avg(bucket.peakRss),
  }))
  .sort((a, b) => a.probe_id.localeCompare(b.probe_id));

const latestCampaign = await latestStatus(campaignsRoot);
const doc = {
  schema_version: 'nas.open.probe.report.v1',
  generated_at: new Date().toISOString(),
  remote_writable: writableRoot,
  latest_campaign: latestCampaign,
  probes,
};

const lines = [
  '# NAS Open Probe Report',
  '',
  `Generated at: ${doc.generated_at}`,
  `Latest campaign: ${latestCampaign ? `${latestCampaign.campaign_stamp} / ${latestCampaign.last_status}` : 'n/a'}`,
  '',
  '| Probe | Pipeline Step | Runs | Success | Fail | Timeout | Avg Duration (s) | Avg Peak RSS (MB) | Latest | Default Classification |',
  '|---|---|---:|---:|---:|---:|---:|---:|---|---|',
  ...probes.map((probe) => `| ${probe.label} | ${probe.pipeline_id ?? 'n/a'} | ${probe.total_runs} | ${probe.successes} | ${probe.failures} | ${probe.timeouts} | ${probe.avg_duration_sec ?? 'n/a'} | ${probe.avg_peak_rss_mb ?? 'n/a'} | ${probe.latest_status ?? 'n/a'} (${probe.latest_run_stamp ?? 'n/a'}) | ${probe.default_classification ?? 'n/a'} |`),
  '',
  '## Latest Failure Notes',
  '',
  ...probes
    .filter((probe) => probe.latest_status === 'failed')
    .map((probe) => {
      const stderrNote = String(probe.latest_stderr_tail || '').split('\n').filter(Boolean).slice(-1)[0] || 'no stderr tail captured';
      const reason = probe.latest_status_reason ? `${probe.latest_status_reason}: ` : '';
      return `- ${probe.label}: ${reason}${stderrNote}`;
    }),
];

await fs.mkdir(reportsRoot, { recursive: true });
const jsonOut = path.join(reportsRoot, writableRoot ? 'nas-open-probes-latest.json' : 'nas-open-probes-latest.json');
const mdOut = path.join(reportsRoot, writableRoot ? 'nas-open-probes-latest.md' : 'nas-open-probes-latest.md');
await fs.writeFile(jsonOut, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(mdOut, lines.join('\n') + '\n', 'utf8');
