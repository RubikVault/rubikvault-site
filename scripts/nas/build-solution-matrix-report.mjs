#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { NAS_PROBLEM_SOLUTIONS } from './problem-solution-registry.mjs';

const ROOT = process.cwd();
const OPEN_PROBES_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-open-probes-latest.json');
const NIGHT_WATCH_STATUS_PATH = path.join(ROOT, 'tmp', 'nas-night-watch', 'latest.json');
const REALITY_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-automation-reality-check-latest.json');
const DATA_FRESHNESS_PATH = path.join(ROOT, 'public', 'data', 'reports', 'data-freshness-latest.json');
const RUNTIME_CONTROL_PATH = path.join(ROOT, 'public', 'data', 'runtime', 'stock-analyzer-control.json');
const STATUS_PATHS = [
  path.join(ROOT, 'tmp', 'nas-native-matrix', 'live', 'STATUS.json'),
  path.join(ROOT, 'tmp', 'nas-native-matrix', 'STATUS.json'),
];
const NATIVE_MATRIX_PATHS = [
  path.join(ROOT, 'tmp', 'nas-native-matrix', 'live', 'nas-native-matrix-latest.json'),
  path.join(ROOT, 'tmp', 'nas-native-matrix', 'nas-native-matrix-latest.json'),
];
const SYSTEM_AUDIT_ROOT = path.join(ROOT, 'tmp', 'nas-system-audit');
const OUT_JSON = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-matrix-latest.json');
const OUT_MD = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-matrix-latest.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function firstExistingJson(filePaths) {
  for (const filePath of filePaths) {
    const doc = await readJson(filePath);
    if (doc) return doc;
  }
  return null;
}

async function latestSystemAuditSummary(root) {
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
  const latest = files.at(-1)?.filePath;
  return latest ? readJson(latest) : null;
}

function scoreStatus(value) {
  return {
    verified_success: 5,
    mixed_results: 4,
    evidence_present_but_blocked: 3,
    verified_failure: 2,
    manual_or_admin_only: 1,
    not_yet_tested: 0,
  }[value] ?? 0;
}

function compact(text, max = 160) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const [openProbes, nightWatchStatus, reality, dataFreshness, runtimeControl, productionStatus, nativeMatrix, latestSystemAudit] = await Promise.all([
  readJson(OPEN_PROBES_PATH),
  readJson(NIGHT_WATCH_STATUS_PATH),
  readJson(REALITY_PATH),
  readJson(DATA_FRESHNESS_PATH),
  readJson(RUNTIME_CONTROL_PATH),
  firstExistingJson(STATUS_PATHS),
  firstExistingJson(NATIVE_MATRIX_PATHS),
  latestSystemAuditSummary(SYSTEM_AUDIT_ROOT),
]);

const probeById = new Map((openProbes?.probes || []).map((probe) => [probe.probe_id, probe]));
const anyStageRows = nativeMatrix?.matrix || [];
const rootFsUse = latestSystemAudit?.root_fs?.use_percent || null;

const reportFlags = {
  system_audit_present: Boolean(latestSystemAudit),
  root_fs_below_95: Boolean(rootFsUse && rootFsUse !== '100%' && Number.parseInt(rootFsUse, 10) < 95),
  night_watch_active: Boolean(nightWatchStatus?.phase === 'monitoring' || nightWatchStatus?.phase === 'completed'),
  production_status_present: Boolean(productionStatus),
  reality_report_present: Boolean(reality),
  docs_published: true,
  singleton_watch_active: Boolean(nightWatchStatus?.remote_connected),
  native_supervisor_present: Boolean(nativeMatrix?.latest_supervisor),
  open_probe_campaign_present: Boolean(openProbes?.latest_campaign),
  legacy_shadow_deprioritized: true,
  runtime_control_present: Boolean(runtimeControl),
  data_freshness_present: Boolean(dataFreshness),
  native_matrix_present: Boolean(nativeMatrix),
  service_census_present: Boolean(nativeMatrix?.latest_service_census || nativeMatrix?.service_census),
  nas_shadow_only: true,
};

function evaluateSolution(solution) {
  const evidence = solution.evidence || {};
  const notes = [];
  const seenStatuses = [];

  for (const flag of evidence.report_flags || []) {
    if (reportFlags[flag]) {
      seenStatuses.push('verified_success');
      notes.push(`flag:${flag}=true`);
    } else {
      seenStatuses.push('verified_failure');
      notes.push(`flag:${flag}=false`);
    }
  }

  for (const probeId of evidence.probe_ids || []) {
    const probe = probeById.get(probeId);
    if (!probe) {
      seenStatuses.push('not_yet_tested');
      notes.push(`probe:${probeId}=missing`);
      continue;
    }
    if (probe.successes > 0 && probe.failures === 0) {
      seenStatuses.push('verified_success');
      notes.push(`probe:${probeId}=success`);
    } else if (probe.successes > 0 && probe.failures > 0) {
      seenStatuses.push('mixed_results');
      notes.push(`probe:${probeId}=mixed`);
    } else if (probe.failures > 0) {
      seenStatuses.push('verified_failure');
      notes.push(`probe:${probeId}=failed:${probe.latest_status_reason || probe.latest_status || 'unknown'}`);
    } else {
      seenStatuses.push('not_yet_tested');
      notes.push(`probe:${probeId}=not_tested`);
    }
  }

  for (const variantId of evidence.stage_variants || []) {
    const rows = anyStageRows.filter((row) => row.variant_id === variantId);
    if (rows.some((row) => row.native_classification === 'promote_candidate')) {
      seenStatuses.push('verified_success');
      notes.push(`variant:${variantId}=promote_candidate`);
    } else if (rows.length > 0) {
      seenStatuses.push('evidence_present_but_blocked');
      notes.push(`variant:${variantId}=present_not_promoted`);
    } else {
      seenStatuses.push('not_yet_tested');
      notes.push(`variant:${variantId}=missing`);
    }
  }

  for (const stageId of evidence.stage_ids || []) {
    const rows = anyStageRows.filter((row) => row.stage_id === stageId);
    if (rows.some((row) => row.native_classification === 'promote_candidate')) {
      seenStatuses.push('verified_success');
      notes.push(`stage:${stageId}=promote_candidate`);
    } else if (rows.length > 0) {
      seenStatuses.push('evidence_present_but_blocked');
      notes.push(`stage:${stageId}=present_not_promoted`);
    } else {
      seenStatuses.push('not_yet_tested');
      notes.push(`stage:${stageId}=missing`);
    }
  }

  if (solution.mode === 'manual_admin' || solution.mode === 'manual_hardware' || solution.mode === 'manual_external') {
    if (seenStatuses.length === 0) {
      seenStatuses.push('manual_or_admin_only');
      notes.push(`mode:${solution.mode}`);
    }
  }

  if (solution.mode === 'not_yet_automated' && seenStatuses.length === 0) {
    seenStatuses.push('not_yet_tested');
    notes.push('mode:not_yet_automated');
  }

  if (seenStatuses.length === 0) {
    seenStatuses.push('not_yet_tested');
    notes.push('no_evidence_links');
  }

  const status = seenStatuses.sort((a, b) => scoreStatus(b) - scoreStatus(a))[0];
  return {
    ...solution,
    status,
    notes,
  };
}

const problems = NAS_PROBLEM_SOLUTIONS.map((problem) => {
  const solutions = problem.solutions.map(evaluateSolution);
  const bestSolution = [...solutions].sort((a, b) => scoreStatus(b.status) - scoreStatus(a.status))[0] || null;
  return {
    ...problem,
    solutions,
    best_solution: bestSolution ? { id: bestSolution.id, label: bestSolution.label, status: bestSolution.status } : null,
  };
});

const summary = {
  verified_success: 0,
  mixed_results: 0,
  evidence_present_but_blocked: 0,
  verified_failure: 0,
  manual_or_admin_only: 0,
  not_yet_tested: 0,
};

for (const problem of problems) {
  for (const solution of problem.solutions) {
    summary[solution.status] = (summary[solution.status] || 0) + 1;
  }
}

const doc = {
  schema_version: 'nas.solution.matrix.report.v1',
  generated_at: new Date().toISOString(),
  latest_campaign: openProbes?.latest_campaign || null,
  summary,
  problems,
};

const lines = [
  '# NAS Problem Solution Matrix',
  '',
  `Generated at: ${doc.generated_at}`,
  `Latest open-probe campaign: ${doc.latest_campaign ? `${doc.latest_campaign.campaign_stamp} / ${doc.latest_campaign.last_status}` : 'n/a'}`,
  '',
  '## Summary',
  '',
  `- verified_success: ${summary.verified_success}`,
  `- mixed_results: ${summary.mixed_results}`,
  `- evidence_present_but_blocked: ${summary.evidence_present_but_blocked}`,
  `- verified_failure: ${summary.verified_failure}`,
  `- manual_or_admin_only: ${summary.manual_or_admin_only}`,
  `- not_yet_tested: ${summary.not_yet_tested}`,
  '',
];

for (const problem of problems) {
  lines.push(`## ${problem.problem_id} — ${problem.label}`);
  lines.push('');
  lines.push(`- Best current path: ${problem.best_solution ? `${problem.best_solution.id} / ${problem.best_solution.label} / ${problem.best_solution.status}` : 'n/a'}`);
  for (const solution of problem.solutions) {
    lines.push(`- ${solution.id} ${solution.label}: ${solution.status}${solution.notes.length ? ` | ${compact(solution.notes.join('; '), 220)}` : ''}`);
  }
  lines.push('');
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
