#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { PIPELINE_STEPS } from './pipeline-registry.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const BENCHMARK_LATEST_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-latest.json');
const MATRIX_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-capacity-decision-matrix.md');
const SYSTEM_STATUS_PATH = path.join(ROOT, 'public/data/reports/system-status-latest.json');
const AUDIT_PATH = path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-census-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-census-latest.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseMatrixClassifications(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*([a-z_]+)\s*\|$/);
    if (!match) continue;
    map.set(match[1].trim(), match[2].trim());
  }
  return map;
}

const [benchmarkLatest, matrixText, systemStatus, auditStatus] = await Promise.all([
  readJson(BENCHMARK_LATEST_PATH),
  readText(MATRIX_PATH),
  readJson(SYSTEM_STATUS_PATH),
  readJson(AUDIT_PATH),
]);

const latestByStage = new Map((benchmarkLatest?.stages || []).map((stage) => [stage.stage, stage]));
const classifications = parseMatrixClassifications(matrixText);

const steps = PIPELINE_STEPS.map((step) => {
  const benchmark = step.benchmark_stage ? latestByStage.get(step.benchmark_stage) || null : null;
  const classification = step.benchmark_stage
    ? (classifications.get(step.benchmark_stage) || step.default_classification)
    : step.default_classification;
  return {
    ...step,
    current_classification: classification,
    benchmark: benchmark ? {
      stage: step.benchmark_stage,
      total_runs: benchmark.total_runs,
      successful_runs: benchmark.successful_runs,
      failed_runs: benchmark.failed_runs,
      avg_factor_nas_vs_mac: benchmark.averages_successful?.factor_nas_vs_local_reference ?? null,
      avg_nas_sec: benchmark.averages_successful?.nas_duration_sec ?? null,
      avg_local_sec: benchmark.averages_successful?.local_reference_duration_sec ?? null,
      avg_local_max_rss_mb: benchmark.averages_successful?.local_reference_max_rss_mb ?? null,
      avg_swap_delta_mb: benchmark.averages_successful?.swap_delta_mb ?? null,
      latest_success_stamp: benchmark.latest_success?.stamp ?? null,
    } : null,
  };
});

const report = {
  schema_version: 'nas.pipeline.census.v1',
  generated_at: new Date().toISOString(),
  dashboard_state: {
    system_status_severity: systemStatus?.summary?.severity || null,
    ssot_violations_count: Array.isArray(systemStatus?.ssot_violations) ? systemStatus.ssot_violations.length : null,
    hist_probs_severity: systemStatus?.steps?.hist_probs?.severity || null,
    stock_analyzer_universe_audit_severity: systemStatus?.steps?.stock_analyzer_universe_audit?.severity || null,
    audit_full_universe: auditStatus?.summary?.full_universe ?? null,
    audit_failure_family_count: auditStatus?.summary?.failure_family_count ?? null,
  },
  steps,
};

const lines = [
  '# Pipeline Census',
  '',
  `Generated at: ${report.generated_at}`,
  '',
  `Dashboard severity: ${report.dashboard_state.system_status_severity ?? 'n/a'}`,
  `SSOT violations: ${report.dashboard_state.ssot_violations_count ?? 'n/a'}`,
  `Hist probs severity: ${report.dashboard_state.hist_probs_severity ?? 'n/a'}`,
  `Universe audit severity: ${report.dashboard_state.stock_analyzer_universe_audit_severity ?? 'n/a'}`,
  `Universe audit full_universe: ${report.dashboard_state.audit_full_universe ?? 'n/a'}`,
  '',
  '| # | Step | Type | Benchmark Method | Classification | Avg Factor NAS/Mac | Outputs | Main Blockers |',
  '|---:|---|---|---|---|---:|---|---|',
];

for (const step of steps) {
  lines.push(
    `| ${step.order} | ${step.id} | ${step.job_type} | ${step.benchmark_method} | ${step.current_classification} | ${step.benchmark?.avg_factor_nas_vs_mac ?? 'n/a'} | ${step.outputs.join('<br>')} | ${(step.blockers || []).join(', ') || 'none'} |`
  );
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
