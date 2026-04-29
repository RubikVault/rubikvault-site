#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const HIST_DIR = path.join(ROOT, 'public/data/hist-probs');
const REPORT_DIR = path.join(ROOT, 'public/data/reports');
const DEFAULT_OUT = path.join(REPORT_DIR, 'hist-probs-current-state-latest.json');

const REPORTS = Object.freeze({
  run_summary: 'public/data/hist-probs/run-summary.json',
  state_snapshot: 'public/data/hist-probs/state-snapshots/state-snapshot-latest.json',
  data_freshness: 'public/data/reports/data-freshness-latest.json',
  system_status: 'public/data/reports/system-status-latest.json',
  pipeline_monitoring: 'public/data/reports/pipeline-monitoring-latest.json',
  pipeline_compute_audit: 'public/data/reports/pipeline-compute-audit-latest.json',
});

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg === name || arg.startsWith(prefix));
  if (!hit) return fallback;
  if (hit === name) return '1';
  return hit.slice(prefix.length);
}

async function readJson(relOrAbs) {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  try {
    return JSON.parse(await fs.readFile(abs, 'utf8'));
  } catch {
    return null;
  }
}

function docTimestamp(name, doc) {
  if (!doc) return null;
  if (name === 'run_summary') return doc.ran_at || null;
  return doc.generated_at || doc.meta?.generated_at || doc.summary?.generated_at || doc.ran_at || null;
}

function ageHours(iso) {
  const ts = Date.parse(String(iso || ''));
  if (!Number.isFinite(ts)) return null;
  return Math.round(((Date.now() - ts) / 36_000) / 10);
}

async function countHistArtifacts(baseDir = HIST_DIR) {
  const knownTopLevel = new Set([
    'regime-daily.json',
    'run-summary.json',
    'retry-summary-latest.json',
    'no-data-tickers.json',
    'error-triage-latest.json',
    'reclassification-apply-latest.json',
  ]);
  const counts = {
    total_files: 0,
    flat_asset_json_files: 0,
    bucket_asset_json_files: 0,
    metadata_json_files: 0,
    bucket_dirs: 0,
    bytes: 0,
  };
  let topEntries = [];
  try {
    topEntries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return { ...counts, missing: true };
  }
  for (const entry of topEntries) {
    const abs = path.join(baseDir, entry.name);
    if (entry.isFile()) {
      const stat = await fs.stat(abs).catch(() => null);
      counts.total_files += 1;
      counts.bytes += stat?.size || 0;
      if (entry.name.endsWith('.json') && !knownTopLevel.has(entry.name) && /^[A-Z0-9._-]+\.json$/.test(entry.name)) {
        counts.flat_asset_json_files += 1;
      } else {
        counts.metadata_json_files += 1;
      }
      continue;
    }
    if (!entry.isDirectory()) continue;
    counts.bucket_dirs += 1;
    const children = await fs.readdir(abs, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isFile()) continue;
      const childPath = path.join(abs, child.name);
      const stat = await fs.stat(childPath).catch(() => null);
      counts.total_files += 1;
      counts.bytes += stat?.size || 0;
      if (child.name.endsWith('.json')) counts.bucket_asset_json_files += 1;
      else counts.metadata_json_files += 1;
    }
  }
  counts.estimated_duplicate_asset_files = Math.min(counts.flat_asset_json_files, counts.bucket_asset_json_files);
  counts.bytes_human = `${(counts.bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  return counts;
}

export async function buildHistProbsCurrentState({ root = ROOT } = {}) {
  const docs = {};
  for (const [name, relPath] of Object.entries(REPORTS)) {
    docs[name] = await readJson(path.join(root, relPath));
  }
  const reportTimestamps = Object.fromEntries(
    Object.entries(docs).map(([name, doc]) => [name, {
      timestamp: docTimestamp(name, doc),
      age_hours: ageHours(docTimestamp(name, doc)),
      present: Boolean(doc),
    }])
  );
  const runTs = reportTimestamps.run_summary.timestamp;
  const drift = Object.fromEntries(
    Object.entries(reportTimestamps)
      .filter(([name]) => name !== 'run_summary')
      .map(([name, info]) => [name, Boolean(runTs && info.timestamp && Date.parse(info.timestamp) < Date.parse(runTs))])
  );
  const artifactCounts = await countHistArtifacts(path.join(root, 'public/data/hist-probs'));
  const run = docs.run_summary || {};
  const coverageRatio = Number(run.tickers_total || 0) > 0
    ? Number(run.tickers_covered || 0) / Number(run.tickers_total || 1)
    : null;
  return {
    schema: 'rv.hist_probs.current_state.v1',
    generated_at: new Date().toISOString(),
    status: Object.values(drift).some(Boolean) ? 'warning' : 'ok',
    reports: reportTimestamps,
    report_drift_after_run_summary: drift,
    artifacts: artifactCounts,
    latest_run: {
      ran_at: run.ran_at || null,
      asset_classes: run.asset_classes || [],
      source_mode: run.source_mode || null,
      tickers_total: run.tickers_total ?? null,
      tickers_covered: run.tickers_covered ?? null,
      tickers_errors: run.tickers_errors ?? null,
      tickers_remaining: run.tickers_remaining ?? null,
      elapsed_seconds: run.elapsed_seconds ?? null,
      workers_used: run.workers_used ?? null,
      rss_at_completion_mb: run.rss_at_completion_mb ?? null,
      hist_probs_write_mode: run.hist_probs_write_mode || 'bucket_only',
      coverage_ratio: coverageRatio == null ? null : Number(coverageRatio.toFixed(6)),
    },
    recommendations: [
      artifactCounts.estimated_duplicate_asset_files > 0 ? 'enable_bucket_only_after_reader_parity' : null,
      Object.values(drift).some(Boolean) ? 'refresh_downstream_reports_after_hist_probs' : null,
      Number(run.tickers_errors || 0) > 0 ? 'run_classify_hist_errors' : null,
    ].filter(Boolean),
  };
}

async function main() {
  const out = argValue('--out', DEFAULT_OUT);
  const doc = await buildHistProbsCurrentState();
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(doc, null, 2));
  await fs.rename(tmp, out);
  console.log(`[hist-probs:audit] wrote ${path.relative(ROOT, out)} status=${doc.status}`);
  if (process.argv.includes('--fail-on-drift') && doc.status !== 'ok') process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[hist-probs:audit] fatal', error);
    process.exit(1);
  });
}
