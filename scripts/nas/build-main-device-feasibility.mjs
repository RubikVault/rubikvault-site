#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const CENSUS_PATH = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-census-latest.json');
const BENCHMARK_LATEST_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/nas-main-device-feasibility-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/nas-main-device-feasibility-latest.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const [census, benchmarkLatest] = await Promise.all([
  readJson(CENSUS_PATH),
  readJson(BENCHMARK_LATEST_PATH),
]);

const steps = census?.steps || [];
const classificationCounts = {};
for (const step of steps) {
  classificationCounts[step.current_classification] = (classificationCounts[step.current_classification] || 0) + 1;
}

const hardBlockers = steps.filter((step) => ['mac_only', 'blocked_by_architecture', 'blocked_by_live_api_dependency'].includes(step.current_classification));
const greenCapableCandidates = steps.filter((step) => step.current_classification === 'nas_candidate_for_future_offload');

let overallVerdict = 'Mac bleibt täglich operativ nötig';
if (hardBlockers.length === 0 && steps.every((step) => step.current_classification === 'nas_candidate_for_future_offload')) {
  overallVerdict = 'Mac ist für die Daily-Chain fast vollständig entbehrlich';
} else if (
  hardBlockers.every((step) => step.current_classification === 'blocked_by_live_api_dependency') &&
  greenCapableCandidates.length >= 8
) {
  overallVerdict = 'Mac ist auf 1–2 Stunden pro Tag reduzierbar';
}

const worstBenchmarks = (benchmarkLatest?.stages || [])
  .filter((stage) => stage.averages_successful?.factor_nas_vs_local_reference != null)
  .sort((a, b) => (b.averages_successful?.factor_nas_vs_local_reference || 0) - (a.averages_successful?.factor_nas_vs_local_reference || 0))
  .slice(0, 5)
  .map((stage) => ({
    stage: stage.stage,
    factor_nas_vs_mac: stage.averages_successful?.factor_nas_vs_local_reference ?? null,
    local_max_rss_mb: stage.averages_successful?.local_reference_max_rss_mb ?? null,
    swap_delta_mb: stage.averages_successful?.swap_delta_mb ?? null,
  }));

const report = {
  schema_version: 'nas.main.device.feasibility.v1',
  generated_at: new Date().toISOString(),
  overall_verdict: overallVerdict,
  classification_counts: classificationCounts,
  hard_blockers: hardBlockers.map((step) => ({
    order: step.order,
    id: step.id,
    classification: step.current_classification,
    blockers: step.blockers,
    benchmark_method: step.benchmark_method,
  })),
  nas_candidates: greenCapableCandidates.map((step) => ({
    order: step.order,
    id: step.id,
    benchmark_stage: step.benchmark?.stage || null,
    avg_factor_nas_vs_mac: step.benchmark?.avg_factor_nas_vs_mac ?? null,
    avg_local_max_rss_mb: step.benchmark?.avg_local_max_rss_mb ?? null,
    avg_swap_delta_mb: step.benchmark?.avg_swap_delta_mb ?? null,
  })),
  worst_benchmarks: worstBenchmarks,
};

const lines = [
  '# NAS Main-Device Feasibility',
  '',
  `Generated at: ${report.generated_at}`,
  '',
  `Overall verdict: ${report.overall_verdict}`,
  '',
  '## Classification Counts',
  '',
  '| Classification | Count |',
  '|---|---:|',
  ...Object.entries(classificationCounts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `| ${key} | ${value} |`),
  '',
  '## Hard Blockers',
  '',
  '| # | Step | Classification | Blockers |',
  '|---:|---|---|---|',
  ...hardBlockers.map((step) => `| ${step.order} | ${step.id} | ${step.current_classification} | ${(step.blockers || []).join(', ') || 'none'} |`),
  '',
  '## NAS Candidates',
  '',
  '| # | Step | Avg Factor NAS/Mac | Avg Local RSS MB | Avg Swap Delta MB |',
  '|---:|---|---:|---:|---:|',
  ...greenCapableCandidates.map((step) => `| ${step.order} | ${step.id} | ${step.benchmark?.avg_factor_nas_vs_mac ?? 'n/a'} | ${step.benchmark?.avg_local_max_rss_mb ?? 'n/a'} | ${step.benchmark?.avg_swap_delta_mb ?? 'n/a'} |`),
  '',
  '## Worst Benchmarks',
  '',
  '| Stage | Avg Factor NAS/Mac | Avg Local RSS MB | Avg Swap Delta MB |',
  '|---|---:|---:|---:|',
  ...worstBenchmarks.map((stage) => `| ${stage.stage} | ${stage.factor_nas_vs_mac ?? 'n/a'} | ${stage.local_max_rss_mb ?? 'n/a'} | ${stage.swap_delta_mb ?? 'n/a'} |`),
];

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
