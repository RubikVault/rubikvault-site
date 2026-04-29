#!/usr/bin/env node

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const defaultOpsRoot = fsSync.existsSync(path.join(repoRoot, 'runtime', 'native-matrix'))
  ? repoRoot
  : repoRoot;
const opsRoot = process.env.OPS_ROOT || process.env.NAS_OPS_ROOT || defaultOpsRoot;
const runtimeRoot = path.join(opsRoot, 'runtime', 'native-matrix');
const runsRoot = path.join(runtimeRoot, 'runs');
const reportsRoot = path.join(opsRoot, 'runtime', 'reports', 'native-matrix');
const localMirrorRoot = path.join(repoRoot, 'tmp', 'nas-native-matrix');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root, suffix, maxDepth = 3) {
  const out = [];
  async function walk(current, depth = 0) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory() && depth < maxDepth) {
        await walk(next, depth + 1);
      } else if (entry.isFile() && next.endsWith(suffix)) {
        out.push(next);
      }
    }
  }
  await walk(root);
  return out.sort();
}

async function latestByMtime(files) {
  if (!files.length) return null;
  const decorated = await Promise.all(files.map(async (filePath) => ({
    filePath,
    mtimeMs: (await fs.stat(filePath)).mtimeMs,
  })));
  decorated.sort((a, b) => a.mtimeMs - b.mtimeMs || a.filePath.localeCompare(b.filePath));
  return decorated.at(-1)?.filePath ?? null;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const remoteWritable = await exists(opsRoot);

function avg(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function classifyNative(bucket) {
  if (!bucket.total) return 'insufficient_data';
  if (bucket.successes >= 2 && bucket.contractFailures === 0 && bucket.guardBlocks === 0 && (bucket.failures / bucket.total) <= 0.25) return 'promote_candidate';
  if (bucket.successes >= 1) return 'keep_for_shadow_only';
  return 'reject';
}

function classifyParity(bucket) {
  if (!bucket.total) return 'insufficient_data';
  if (bucket.successes >= 2 && bucket.parityFailures === 0 && bucket.contractFailures === 0 && bucket.guardBlocks === 0 && (bucket.failures / bucket.total) <= 0.25) return 'promote_candidate';
  if (bucket.successes >= 1) return 'keep_for_shadow_only';
  return 'reject';
}

const resultFiles = await listFiles(runsRoot, 'result.json');
const results = [];
for (const filePath of resultFiles) {
  try {
    results.push(await readJson(filePath));
  } catch {
    // ignore broken partial files
  }
}

const grouped = new Map();
for (const result of results) {
  const key = `${result.stage_id}::${result.variant_id}`;
  if (!grouped.has(key)) {
    grouped.set(key, {
      stage_id: result.stage_id,
      variant_id: result.variant_id,
      total: 0,
      successes: 0,
      driftSuccesses: 0,
      failures: 0,
      guardBlocks: 0,
      contractFailures: 0,
      parityFailures: 0,
      durations: [],
      peakRss: [],
      swapDelta: [],
      latest_stamp: result.stamp,
      latest_status: result.status,
    });
  }
  const bucket = grouped.get(key);
  bucket.total += 1;
  if (result.status === 'success' || result.status === 'success_with_drift') bucket.successes += 1;
  if (result.status === 'success_with_drift') bucket.driftSuccesses += 1;
  if (result.status === 'guard_blocked') bucket.guardBlocks += 1;
  if (result.status !== 'success' && result.status !== 'success_with_drift' && result.status !== 'guard_blocked') bucket.failures += 1;
  if (Number(result.contract_failures || 0) > 0) bucket.contractFailures += 1;
  if (result.outputs_equal === false) bucket.parityFailures += 1;
  if (typeof result.duration_sec === 'number') bucket.durations.push(result.duration_sec);
  if (typeof result.peak_rss_mb === 'number') bucket.peakRss.push(result.peak_rss_mb);
  if (typeof result.swap_delta_mb === 'number') bucket.swapDelta.push(result.swap_delta_mb);
  if (String(result.stamp) > String(bucket.latest_stamp)) {
    bucket.latest_stamp = result.stamp;
    bucket.latest_status = result.status;
  }
}

const latestSystemAuditFiles = await listFiles(path.join(runtimeRoot, 'system-audits'), 'summary.json');
const latestServiceCensusFiles = await listFiles(path.join(runtimeRoot, 'service-census'), 'service-census.json');
const latestCampaignFiles = await listFiles(path.join(runtimeRoot, 'campaigns'), 'status.json');
const latestSupervisorFiles = await listFiles(path.join(runtimeRoot, 'supervisors'), 'status.json');

const latestSystemAuditFile = await latestByMtime(latestSystemAuditFiles);
const latestServiceCensusFile = await latestByMtime(latestServiceCensusFiles);
const latestCampaignFile = await latestByMtime(latestCampaignFiles);
const latestSupervisorFile = await latestByMtime(latestSupervisorFiles);
const productionStatusPath = path.join(opsRoot, 'runtime', 'STATUS.json');

const latestSystemAudit = latestSystemAuditFile ? await readJson(latestSystemAuditFile) : null;
const latestServiceCensus = latestServiceCensusFile ? await readJson(latestServiceCensusFile) : null;
const latestCampaign = latestCampaignFile ? await readJson(latestCampaignFile) : null;
const latestSupervisor = latestSupervisorFile ? await readJson(latestSupervisorFile) : null;
const latestProductionStatus = await exists(productionStatusPath) ? await readJson(productionStatusPath) : null;

const matrix = Array.from(grouped.values())
  .map((bucket) => ({
    stage_id: bucket.stage_id,
    variant_id: bucket.variant_id,
    total_runs: bucket.total,
    successes: bucket.successes,
    drift_successes: bucket.driftSuccesses,
    failures: bucket.failures,
    guard_blocks: bucket.guardBlocks,
    contract_failures: bucket.contractFailures,
    parity_failures: bucket.parityFailures,
    avg_duration_sec: avg(bucket.durations),
    avg_peak_rss_mb: avg(bucket.peakRss),
    avg_swap_delta_mb: avg(bucket.swapDelta),
    latest_stamp: bucket.latest_stamp,
    latest_status: bucket.latest_status,
    native_classification: classifyNative(bucket),
    parity_classification: classifyParity(bucket),
  }))
  .sort((a, b) => a.stage_id.localeCompare(b.stage_id) || a.variant_id.localeCompare(b.variant_id));

const doc = {
  schema_version: 'nas.native.matrix.report.v1',
  generated_at: new Date().toISOString(),
  ops_root: opsRoot,
  remote_writable: remoteWritable,
  total_result_files: results.length,
  latest_system_audit: latestSystemAudit,
  latest_service_census: latestServiceCensus,
  latest_campaign: latestCampaign,
  latest_supervisor: latestSupervisor,
  latest_production_status: latestProductionStatus,
  matrix,
};

const lines = [
  '# NAS Native Matrix Report',
  '',
  `Generated at: ${doc.generated_at}`,
  '',
  `Total result files: ${doc.total_result_files}`,
  '',
  `Remote ops root writable: ${doc.remote_writable ? 'yes' : 'no'}`,
  '',
  '## Runtime Status',
  '',
  `- Latest campaign: ${latestCampaign ? `${latestCampaign.campaign_stamp} / ${latestCampaign.last_status}` : 'n/a'}`,
  `- Latest supervisor: ${latestSupervisor ? `${latestSupervisor.supervisor_stamp} / ${latestSupervisor.phase}` : 'n/a'}`,
  `- Latest production status: ${latestProductionStatus ? `${latestProductionStatus.stamp} / ${latestProductionStatus.overall}` : 'n/a'}`,
  `- Root filesystem: ${latestSystemAudit?.root_fs ? `${latestSystemAudit.root_fs.used} / ${latestSystemAudit.root_fs.size} (${latestSystemAudit.root_fs.use_percent})` : 'n/a'}`,
  `- Volume1 filesystem: ${latestSystemAudit?.volume1 ? `${latestSystemAudit.volume1.used} / ${latestSystemAudit.volume1.size} (${latestSystemAudit.volume1.use_percent})` : 'n/a'}`,
  `- Required services healthy: ${latestServiceCensus ? JSON.stringify(latestServiceCensus.required_health) : 'n/a'}`,
  '',
  '## Stage x Variant Matrix',
  '',
  '| Stage | Variant | Runs | Success | Failed | Guarded | Avg Duration (s) | Avg Peak RSS (MB) | Avg Swap Delta (MB) | Native Class | Parity Class |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|',
  ...matrix.map((row) => `| ${row.stage_id} | ${row.variant_id} | ${row.total_runs} | ${row.successes} (${row.drift_successes} drift) | ${row.failures} | ${row.guard_blocks} | ${row.avg_duration_sec ?? 'n/a'} | ${row.avg_peak_rss_mb ?? 'n/a'} | ${row.avg_swap_delta_mb ?? 'n/a'} | ${row.native_classification} | ${row.parity_classification} |`),
  '',
  '## Best Native Candidates',
  '',
  ...matrix
    .filter((row) => row.native_classification === 'promote_candidate')
    .map((row) => `- ${row.stage_id} with ${row.variant_id}: ${row.successes}/${row.total_runs} successful, avg duration ${row.avg_duration_sec ?? 'n/a'} s`),
  '',
  '## Best Strict-Parity Candidates',
  '',
  ...matrix
    .filter((row) => row.parity_classification === 'promote_candidate')
    .map((row) => `- ${row.stage_id} with ${row.variant_id}: ${row.successes}/${row.total_runs} successful with no frozen-baseline drift`),
  '',
  '## Drift Notes',
  '',
  ...matrix
    .filter((row) => row.drift_successes > 0)
    .map((row) => `- ${row.stage_id} with ${row.variant_id}: ${row.drift_successes}/${row.total_runs} runs completed with frozen-baseline drift`),
];

await fs.mkdir(localMirrorRoot, { recursive: true });

const jsonOut = path.join(reportsRoot, 'nas-native-matrix-latest.json');
const mdOut = path.join(reportsRoot, 'nas-native-matrix-latest.md');
const localJsonOut = path.join(localMirrorRoot, 'nas-native-matrix-latest.json');
const localMdOut = path.join(localMirrorRoot, 'nas-native-matrix-latest.md');

if (remoteWritable) {
  await fs.mkdir(reportsRoot, { recursive: true });
  await fs.writeFile(jsonOut, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  await fs.writeFile(mdOut, lines.join('\n') + '\n', 'utf8');
}

await fs.writeFile(localJsonOut, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(localMdOut, lines.join('\n') + '\n', 'utf8');

if (remoteWritable) {
  process.stdout.write(`${jsonOut}\n${mdOut}\n`);
} else {
  process.stdout.write(`${localJsonOut}\n${localMdOut}\n`);
}
