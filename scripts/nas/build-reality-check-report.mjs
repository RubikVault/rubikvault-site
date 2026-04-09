#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/nas-automation-reality-check-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/nas-automation-reality-check-latest.md');
const CAMPAIGNS_ROOT = path.join(ROOT, 'tmp/nas-campaigns');
const SUPERVISORS_ROOT = path.join(ROOT, 'tmp/nas-supervisors');
const FEASIBILITY_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-main-device-feasibility-latest.json');
const MATRIX_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-capacity-decision-matrix.md');
const PROOF_MATRIX_PATH = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-proof-matrix-latest.md');
const SYSTEM_AUDIT_ROOT = path.join(ROOT, 'tmp/nas-system-audit');
const NATIVE_REPORT_PATHS = [
  path.join(ROOT, 'tmp/nas-native-matrix/live/nas-native-matrix-latest.json'),
  path.join(ROOT, 'tmp/nas-native-matrix/nas-native-matrix-latest.json'),
];

const CANONICAL_SSOT = [
  'docs/ops/nas-runbook.md',
  'docs/ops/nas-migration-journal.md',
  'scripts/nas/run-overnight-supervisor.sh',
  'scripts/nas/run-overnight-shadow-campaign.sh',
  'scripts/nas/stage-manifest.json',
  'tmp/nas-benchmarks/nas-capacity-decision-matrix.md',
  'tmp/nas-benchmarks/pipeline-proof-matrix-latest.md',
  'tmp/nas-benchmarks/nas-main-device-feasibility-latest.json',
];

const CLAIMED_EXTERNAL_ARTIFACTS = [
  'docs/ops/nas-master-plan-v3.md',
  'docs/ops/nas-native-matrix.md',
  'scripts/nas/rv-nas-supervisor.sh',
  'scripts/nas/rv-nas-watchdog.sh',
  'scripts/nas/rv-nas-build-7day-proof.sh',
  'config/rv-nas.env',
];

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

async function firstExistingJson(filePaths) {
  for (const filePath of filePaths) {
    const doc = await readJson(filePath);
    if (doc) return { path: filePath, doc };
  }
  return null;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function latestJsonStatus(rootDir, excludeNames = []) {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || excludeNames.includes(entry.name)) continue;
      const statusPath = path.join(rootDir, entry.name, 'status.json');
      const status = await readJson(statusPath);
      if (!status) continue;
      const stamp =
        Date.parse(status.generated_at || status.started_at || status.finished_at || '') ||
        Date.parse(entry.name.replace(/^(\d{4})(\d{2})(\d{2})T/, '$1-$2-$3T').replace(/Z$/, 'Z'));
      candidates.push({ name: entry.name, status, stamp: Number.isFinite(stamp) ? stamp : 0 });
    }
    candidates.sort((a, b) => a.stamp - b.stamp);
    return candidates[candidates.length - 1] || null;
  } catch {
    return null;
  }
}

async function recentCampaignFailures(limit = 5) {
  try {
    const entries = await fs.readdir(CAMPAIGNS_ROOT, { withFileTypes: true });
    const failures = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'test-campaign') continue;
      const statusPath = path.join(CAMPAIGNS_ROOT, entry.name, 'status.json');
      const status = await readJson(statusPath);
      if (!status) continue;
      if (!String(status.last_status || '').startsWith('failed')) continue;
      const startedAt = Date.parse(status.started_at || '') || 0;
      failures.push({
        stamp: entry.name,
        started_at: status.started_at || null,
        last_job: status.last_job || null,
        last_status: status.last_status || null,
        cycles_completed: status.cycles_completed ?? 0,
        sort_at: startedAt,
      });
    }
    failures.sort((a, b) => a.sort_at - b.sort_at);
    return failures.slice(-limit).reverse();
  } catch {
    return [];
  }
}

function parseMatrixClassifications(raw) {
  const lines = raw.split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith('| stage')) continue;
    const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 6) continue;
    rows.push({
      stage: parts[0],
      status: parts[1],
      successful_runs: parts[2],
      avg_factor_nas_vs_mac: parts[3],
      latest_swap_delta_mb: parts[4],
      classification: parts[5],
    });
  }
  return rows;
}

async function latestSystemAuditSummary() {
  try {
    const entries = await fs.readdir(SYSTEM_AUDIT_ROOT, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const dir of dirs.reverse()) {
      const summaryPath = path.join(SYSTEM_AUDIT_ROOT, dir, 'summary.json');
      const summary = await readJson(summaryPath);
      if (summary) {
        return { stamp: dir, summary };
      }
    }
    return null;
  } catch {
    return null;
  }
}

const [latestLegacySupervisor, latestLegacyCampaign, feasibility, matrixRaw, proofMatrixRaw, systemAudit, nativeReportEntry] = await Promise.all([
  latestJsonStatus(SUPERVISORS_ROOT, ['test-supervisor']),
  latestJsonStatus(CAMPAIGNS_ROOT, ['test-campaign']),
  readJson(FEASIBILITY_PATH),
  readText(MATRIX_PATH),
  readText(PROOF_MATRIX_PATH),
  latestSystemAuditSummary(),
  firstExistingJson(NATIVE_REPORT_PATHS),
]);

const canonicalSsot = await Promise.all(CANONICAL_SSOT.map(async (relPath) => ({
  path: relPath,
  exists: await exists(path.join(ROOT, relPath)),
})));

const claimedArtifacts = await Promise.all(CLAIMED_EXTERNAL_ARTIFACTS.map(async (relPath) => ({
  path: relPath,
  exists: await exists(path.join(ROOT, relPath)),
})));

const missingClaimedArtifacts = claimedArtifacts.filter((item) => !item.exists);
const recentFailures = await recentCampaignFailures(5);
const nativeReport = nativeReportEntry?.doc || null;
const latestSupervisor = nativeReport?.latest_supervisor ? {
  name: nativeReport.latest_supervisor.supervisor_stamp || null,
  status: nativeReport.latest_supervisor,
  source: 'native_matrix',
} : latestLegacySupervisor ? { ...latestLegacySupervisor, source: 'legacy_shadow' } : null;
const latestCampaign = nativeReport?.latest_campaign ? {
  name: nativeReport.latest_campaign.campaign_stamp || null,
  status: nativeReport.latest_campaign,
  source: 'native_matrix',
} : latestLegacyCampaign ? { ...latestLegacyCampaign, source: 'legacy_shadow' } : null;
const matrixRows = parseMatrixClassifications(matrixRaw);
const nasCandidates = matrixRows.filter((row) => row.classification === 'nas_candidate_for_future_offload').map((row) => row.stage);
const macOnlyStages = matrixRows.filter((row) => row.classification === 'mac_only').map((row) => row.stage);

const reasons = [];
if (missingClaimedArtifacts.length) {
  reasons.push('split_brain_claimed_artifacts_missing_from_repo');
}
if (!nativeReport) {
  reasons.push('native_matrix_report_missing');
}
if (latestSupervisor?.status?.phase && latestSupervisor.status.phase !== 'monitoring') {
  reasons.push(`latest_supervisor_phase_${latestSupervisor.status.phase}`);
}
if (latestCampaign?.status?.last_status && String(latestCampaign.status.last_status).startsWith('failed')) {
  reasons.push('latest_primary_campaign_failed');
}
if ((feasibility?.overall_verdict || '').includes('Mac bleibt täglich operativ nötig')) {
  reasons.push('mac_remains_operationally_required');
}
if (!systemAudit || systemAudit.summary.status !== 'ok') {
  reasons.push('md0_not_yet_verified');
}
if (systemAudit?.summary && systemAudit.summary.scheduler_safe_to_modify === false) {
  reasons.push('scheduler_safe_to_modify_false');
}

const productionGoSupported = reasons.length === 0;

const report = {
  schema_version: 'nas.automation.reality-check.v1',
  generated_at: new Date().toISOString(),
  production_go_supported: productionGoSupported,
  reasons,
  canonical_repo_ssot: canonicalSsot,
  claimed_external_artifacts: claimedArtifacts,
  missing_claimed_artifacts: missingClaimedArtifacts,
  native_matrix_report: nativeReportEntry ? {
    path: path.relative(ROOT, nativeReportEntry.path),
    generated_at: nativeReport?.generated_at || null,
  } : null,
  latest_supervisor: latestSupervisor,
  latest_campaign: latestCampaign,
  legacy_recent_failed_campaigns: recentFailures,
  benchmark_summary: {
    nas_candidates: nasCandidates,
    mac_only: macOnlyStages,
  },
  feasibility: feasibility ? {
    overall_verdict: feasibility.overall_verdict || null,
    hard_blockers: feasibility.hard_blockers || [],
  } : null,
  proof_matrix_present: Boolean(proofMatrixRaw.trim()),
  latest_system_partition_audit: systemAudit,
};

const lines = [
  '# NAS Automation Reality Check',
  '',
  `Generated at: ${report.generated_at}`,
  `Production GO supported: ${report.production_go_supported ? 'yes' : 'no'}`,
  '',
  '## Reasons',
  '',
  ...(reasons.length ? reasons.map((reason) => `- ${reason}`) : ['- none']),
  '',
  '## Canonical Repo SSOT',
  '',
  ...canonicalSsot.map((item) => `- ${item.path}: ${item.exists ? 'present' : 'missing'}`),
  '',
  '## Missing Claimed External Artifacts',
  '',
  ...(missingClaimedArtifacts.length ? missingClaimedArtifacts.map((item) => `- ${item.path}`) : ['- none']),
  '',
  '## Native Matrix Report',
  '',
  nativeReportEntry
    ? `- ${path.relative(ROOT, nativeReportEntry.path)} @ ${nativeReport?.generated_at || 'n/a'}`
    : '- none',
  '',
  '## Latest Supervisor',
  '',
  latestSupervisor
    ? `- ${latestSupervisor.name}: ${latestSupervisor.status.phase || 'n/a'} / ${latestSupervisor.status.note || 'n/a'} [${latestSupervisor.source}]`
    : '- none',
  '',
  '## Latest Campaign',
  '',
  latestCampaign
    ? `- ${latestCampaign.name}: ${latestCampaign.status.last_status || 'n/a'} [${latestCampaign.source}]`
    : '- none',
  '',
  '## Legacy Failed Campaigns',
  '',
  ...(recentFailures.length
    ? recentFailures.map((item) => `- ${item.stamp}: ${item.last_status} (job=${item.last_job || 'n/a'})`)
    : ['- none']),
  '',
  '## Benchmark Classifications',
  '',
  `- NAS candidates: ${nasCandidates.join(', ') || 'none'}`,
  `- Mac only: ${macOnlyStages.join(', ') || 'none'}`,
  '',
  '## Feasibility',
  '',
  `- Overall verdict: ${feasibility?.overall_verdict || 'unknown'}`,
  '',
  '## System Partition Audit',
  '',
  systemAudit
    ? `- ${systemAudit.stamp}: ${systemAudit.summary.status}${systemAudit.summary.blocked_reason ? ` (${systemAudit.summary.blocked_reason})` : ''}`
    : '- none',
];

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
