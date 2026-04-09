#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MIRROR_ROOT = path.join(ROOT, 'tmp', 'nas-native-matrix', 'live');
const SYSTEM_AUDIT_ROOT = path.join(ROOT, 'tmp', 'nas-system-audit');
const NIGHT_WATCH_STATUS = path.join(ROOT, 'tmp', 'nas-night-watch', 'latest.json');
const REALITY_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-automation-reality-check-latest.json');
const OPEN_PROBES_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-open-probes-latest.json');
const SOLUTION_MATRIX_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-matrix-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-night-watch-latest.json');
const OUT_MD = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-night-watch-latest.md');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function latestSummaryJson(root) {
  async function walk(current, out) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(next, out);
      } else if (entry.isFile() && entry.name === 'summary.json') {
        const stat = await fs.stat(next);
        out.push({ filePath: next, mtimeMs: stat.mtimeMs });
      }
    }
  }
  const files = [];
  await walk(root, files);
  files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.filePath.localeCompare(b.filePath));
  return files.at(-1)?.filePath ?? null;
}

const nativeMatrixPath = path.join(MIRROR_ROOT, 'nas-native-matrix-latest.json');
const statusPath = path.join(MIRROR_ROOT, 'STATUS.json');

const nativeMatrix = (await exists(nativeMatrixPath)) ? await readJson(nativeMatrixPath) : null;
const productionStatus = (await exists(statusPath)) ? await readJson(statusPath) : null;
const nightWatch = (await exists(NIGHT_WATCH_STATUS)) ? await readJson(NIGHT_WATCH_STATUS) : null;
const reality = (await exists(REALITY_PATH)) ? await readJson(REALITY_PATH) : null;
const openProbes = (await exists(OPEN_PROBES_PATH)) ? await readJson(OPEN_PROBES_PATH) : null;
const solutionMatrix = (await exists(SOLUTION_MATRIX_PATH)) ? await readJson(SOLUTION_MATRIX_PATH) : null;
const latestSystemAuditPath = await latestSummaryJson(SYSTEM_AUDIT_ROOT);
const latestSystemAudit = latestSystemAuditPath ? await readJson(latestSystemAuditPath) : null;

const blockers = [];
if (reality?.production_go_supported === false) {
  for (const reason of reality.blocking_reasons || []) blockers.push(reason);
}
if (latestSystemAudit?.scheduler_safe_to_modify === false) blockers.push('scheduler_safe_to_modify_false');
if (latestSystemAudit?.root_fs?.use_percent === '100%') blockers.push('root_fs_100_percent');

const doc = {
  schema_version: 'nas.night.watch.report.v1',
  generated_at: new Date().toISOString(),
  night_watch: nightWatch,
  native_matrix: nativeMatrix,
  open_probes: openProbes,
  solution_matrix: solutionMatrix,
  production_status: productionStatus,
  latest_system_audit: latestSystemAudit,
  reality_check: reality,
  blockers: Array.from(new Set(blockers)),
};

const lines = [
  '# NAS Night Watch Report',
  '',
  `Generated at: ${doc.generated_at}`,
  '',
  '## Overview',
  '',
  `- Night watch status: ${nightWatch ? `${nightWatch.phase} / ${nightWatch.note}` : 'n/a'}`,
  `- Remote connected: ${nightWatch ? String(nightWatch.remote_connected) : 'n/a'}`,
  `- Native matrix latest campaign: ${nativeMatrix?.latest_campaign ? `${nativeMatrix.latest_campaign.campaign_stamp} / ${nativeMatrix.latest_campaign.last_status}` : 'n/a'}`,
  `- Open probe latest campaign: ${openProbes?.latest_campaign ? `${openProbes.latest_campaign.campaign_stamp} / ${openProbes.latest_campaign.last_status}` : 'n/a'}`,
  `- Solution matrix summary: ${solutionMatrix ? `success=${solutionMatrix.summary?.verified_success ?? 0}, mixed=${solutionMatrix.summary?.mixed_results ?? 0}, failed=${solutionMatrix.summary?.verified_failure ?? 0}` : 'n/a'}`,
  `- Native matrix latest supervisor: ${nativeMatrix?.latest_supervisor ? `${nativeMatrix.latest_supervisor.supervisor_stamp} / ${nativeMatrix.latest_supervisor.phase}` : 'n/a'}`,
  `- Production STATUS overall: ${productionStatus?.overall ?? 'n/a'}`,
  `- Reality GO supported: ${reality ? String(reality.production_go_supported) : 'n/a'}`,
  `- Root filesystem: ${latestSystemAudit?.root_fs ? `${latestSystemAudit.root_fs.used} / ${latestSystemAudit.root_fs.size} (${latestSystemAudit.root_fs.use_percent})` : 'n/a'}`,
  '',
  '## Key Blockers',
  '',
  ...(doc.blockers.length ? doc.blockers.map((value) => `- ${value}`) : ['- none']),
  '',
  '## Promote Candidates',
  '',
  ...((nativeMatrix?.matrix || [])
    .filter((row) => row.native_classification === 'promote_candidate')
    .map((row) => `- ${row.stage_id} / ${row.variant_id}: ${row.successes}/${row.total_runs} successful`)),
  '',
  '## Open Probes',
  '',
  ...((openProbes?.probes || []).map((probe) => `- ${probe.label}: ${probe.successes}/${probe.total_runs} success, latest=${probe.latest_status ?? 'n/a'}, avg_peak_rss_mb=${probe.avg_peak_rss_mb ?? 'n/a'}`)),
  '',
  '## Solution Matrix',
  '',
  ...((solutionMatrix?.problems || []).slice(0, 15).map((problem) => `- ${problem.problem_id}: ${problem.best_solution ? `${problem.best_solution.id} / ${problem.best_solution.status}` : 'n/a'}`)),
];

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
