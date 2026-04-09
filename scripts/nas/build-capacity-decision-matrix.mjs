#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const LATEST_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-latest.json');
const MATRIX_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-capacity-decision-matrix.md');
const STAGE_MANIFEST_PATH = path.join(ROOT, 'scripts/nas/stage-manifest.json');
const STAGE4_CANDIDATES_PATH = path.join(ROOT, 'scripts/nas/stage4-candidates.json');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const [latest, manifest, stage4CandidatesDoc] = await Promise.all([
  readJson(LATEST_PATH),
  readJson(STAGE_MANIFEST_PATH),
  readJson(STAGE4_CANDIDATES_PATH)
]);

const policy = manifest?.policy || {};
const stageManifestById = Object.fromEntries((manifest?.stages || []).map((stage) => [stage.id, stage]));
const stage4CandidatesById = Object.fromEntries(
  (stage4CandidatesDoc?.candidates || []).map((candidate) => [`stage4:${candidate.id}`, candidate])
);

function requiredRunsFor(stageId) {
  const stagePolicy = stageManifestById[stageId] || {};
  if (Number.isFinite(stagePolicy.successful_shadow_runs_required)) {
    return stagePolicy.successful_shadow_runs_required;
  }
  if (stageId.startsWith('stage4:')) {
    return 3;
  }
  return 1;
}

function thresholdFor(stageId) {
  const stagePolicy = stageManifestById[stageId] || {};
  const stage4Policy = stage4CandidatesById[stageId] || {};
  const jobType = stage4Policy.job_type || stagePolicy.job_type || 'mixed';
  return policy.job_type_thresholds?.[jobType] || policy.job_type_thresholds?.mixed || { green_max_factor: 6, yellow_max_factor: 10 };
}

function classify(stageId, summary) {
  if (!summary || summary.successful_runs === 0) return 'insufficient_data';
  if (stageId === 'stage5') return 'mac_only';
  if (summary.successful_runs < requiredRunsFor(stageId)) return 'insufficient_data';
  const threshold = thresholdFor(stageId);
  const factor = summary.averages_successful?.factor_nas_vs_local_reference;
  const latestSwap = summary.latest_run?.swap_delta_mb;
  const servicesOk = summary.latest_run?.services_ok;
  const comparesOk = summary.latest_run?.compare_all_ok;
  if (servicesOk === false || comparesOk === false) return 'mac_only';
  if (latestSwap != null && latestSwap > (policy.swap_thresholds_mb?.red_gt ?? 500)) return 'mac_only';
  if (factor == null) return 'nas_shadow_only';
  if (factor <= threshold.green_max_factor) return 'nas_candidate_for_future_offload';
  if (factor <= threshold.yellow_max_factor) return 'nas_shadow_only';
  return 'mac_only';
}

const lines = [
  '# NAS Capacity Decision Matrix',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  '| Stage | Status | Successful Runs | Avg Factor NAS/Mac | Latest Swap Delta MB | Classification |',
  '|---|---:|---:|---:|---:|---|'
];

for (const summary of latest?.stages || []) {
  const classification = classify(summary.stage, summary);
  lines.push(`| ${summary.stage} | ${summary.total_runs} total / ${summary.successful_runs} ok | ${summary.successful_runs} | ${summary.averages_successful?.factor_nas_vs_local_reference ?? 'n/a'} | ${summary.latest_run?.swap_delta_mb ?? 'n/a'} | ${classification} |`);
}

lines.push('');
lines.push('## Legend');
lines.push('');
lines.push('- `insufficient_data`: more validated shadow runs or timing data required');
lines.push('- `nas_shadow_only`: suitable for continued shadow benchmarking only');
lines.push('- `nas_candidate_for_future_offload`: benchmark evidence supports later migration planning');
lines.push('- `mac_only`: keep on Mac');
lines.push('');

await fs.mkdir(path.dirname(MATRIX_PATH), { recursive: true });
await fs.writeFile(MATRIX_PATH, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${MATRIX_PATH}\n`);
