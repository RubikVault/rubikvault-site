#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const CAMPAIGNS_ROOT = path.join(ROOT, 'tmp/nas-campaigns');
const SUPERVISORS_ROOT = path.join(ROOT, 'tmp/nas-supervisors');
const HISTORY_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-shadow-benchmark-history.json');
const MATRIX_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-capacity-decision-matrix.md');
const INPUT_SOURCES_PATH = path.join(ROOT, 'tmp/nas-benchmarks/nas-input-sources-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/nas-morning-report-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/nas-morning-report-latest.md');
const CAMPAIGN_STALE_RUNNING_SEC = 1800;

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

async function latestCampaignStatus() {
  try {
    const dirs = (await fs.readdir(CAMPAIGNS_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const candidates = [];
    for (const dir of dirs) {
      const statusPath = path.join(CAMPAIGNS_ROOT, dir, 'status.json');
      const status = await readJson(statusPath);
      if (!status?.started_at) continue;
      const stat = await fs.stat(statusPath).catch(() => null);
      const startedAt = Date.parse(status.started_at);
      if (!Number.isFinite(startedAt)) continue;
      const lastStatus = String(status.last_status || '');
      const cyclesCompleted = Number(status.cycles_completed || 0);
      const fresh = stat ? ((Date.now() - stat.mtimeMs) / 1000) <= CAMPAIGN_STALE_RUNNING_SEC : false;
      candidates.push({
        dir,
        status,
        startedAt,
        sortWeight:
          (fresh && lastStatus === 'running') ? 4 :
          (fresh && cyclesCompleted > 0) ? 3 :
          (fresh && lastStatus && !lastStatus.startsWith('failed_preflight')) ? 2 :
          cyclesCompleted > 0 ? 1 : 0
      });
    }
    candidates.sort((a, b) => (a.sortWeight - b.sortWeight) || (a.startedAt - b.startedAt));
    const latest = candidates[candidates.length - 1];
    return latest ? { dir: latest.dir, status: latest.status } : null;
  } catch {
    return null;
  }
}

async function latestSupervisorStatus() {
  try {
    const dirs = (await fs.readdir(SUPERVISORS_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== 'test-supervisor')
      .map((entry) => entry.name);
    const candidates = [];
    for (const dir of dirs) {
      const status = await readJson(path.join(SUPERVISORS_ROOT, dir, 'status.json'));
      if (!status?.generated_at) continue;
      const generatedAt = Date.parse(status.generated_at);
      if (!Number.isFinite(generatedAt)) continue;
      candidates.push({ dir, status, generatedAt });
    }
    candidates.sort((a, b) => a.generatedAt - b.generatedAt);
    const latest = candidates[candidates.length - 1];
    return latest ? { dir: latest.dir, status: latest.status } : null;
  } catch {
    return null;
  }
}

function parseStamp(stamp) {
  if (!stamp || String(stamp).length < 15) return NaN;
  const text = String(stamp);
  return Date.parse(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(9, 11)}:${text.slice(11, 13)}:${text.slice(13, 15)}Z`);
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, value) => sum + value, 0) / nums.length) * 100) / 100;
}

const [campaign, supervisor, history, matrixText, inputSources] = await Promise.all([
  latestCampaignStatus(),
  latestSupervisorStatus(),
  readJson(HISTORY_PATH),
  readText(MATRIX_PATH),
  readJson(INPUT_SOURCES_PATH)
]);

const startedAt = campaign?.status?.started_at ? Date.parse(campaign.status.started_at) : NaN;
const runPool = Number.isFinite(startedAt)
  ? (history?.runs || []).filter((run) => parseStamp(run.stamp) >= startedAt)
  : [];
const stageNames = [...new Set(runPool.map((run) => run.stage))].sort();
const stages = stageNames.map((stage) => {
  const runs = runPool.filter((run) => run.stage === stage);
  const successes = runs.filter((run) => run.success);
  const match = matrixText.match(new RegExp(`\\| ${stage.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} \\|[^\\n]*\\| ([a-z_]+) \\|`));
  return {
    stage,
    runs: runs.length,
    successes: successes.length,
    failures: runs.length - successes.length,
    avg_factor_nas_vs_mac: average(successes.map((run) => run.durations?.factor_nas_vs_local_reference ?? null)),
    avg_nas_sec: average(successes.map((run) => run.durations?.nas_sec ?? null)),
    avg_local_sec: average(successes.map((run) => run.durations?.local_reference_sec ?? null)),
    avg_local_max_rss_mb: average(successes.map((run) => run.local_reference_memory?.max_rss_mb ?? null)),
    avg_swap_delta_mb: average(successes.map((run) => run.nas_swap?.used_delta_mb ?? null)),
    classification: match ? match[1] : null
  };
});

const report = {
  schema_version: 'nas.morning.report.v1',
  generated_at: new Date().toISOString(),
  campaign: campaign ? {
    dir: campaign.dir,
    started_at: campaign.status.started_at,
    target_end_local: campaign.status.target_end_local,
    cycles_completed: campaign.status.cycles_completed ?? 0,
    last_job: campaign.status.last_job ?? null,
    last_status: campaign.status.last_status ?? null
  } : null,
  supervisor: supervisor ? {
    dir: supervisor.dir,
    generated_at: supervisor.status.generated_at,
    watched_campaign_stamp: supervisor.status.watched_campaign_stamp ?? null,
    phase: supervisor.status.phase ?? null,
    note: supervisor.status.note ?? null
  } : null,
  input_policy: inputSources ? {
    benchmark_shadow_inputs_repo_relative_only: inputSources.benchmark_shadow_inputs_repo_relative_only,
    benchmark_shadow_inputs_external_volume_free: inputSources.benchmark_shadow_inputs_external_volume_free
  } : null,
  stages
};

const lines = [
  '# NAS Morning Report',
  '',
  `Generated at: ${report.generated_at}`,
  campaign ? `Campaign: ${campaign.dir}` : 'Campaign: none',
  campaign?.status?.last_status ? `Campaign status: ${campaign.status.last_status}` : 'Campaign status: n/a',
  campaign?.status?.cycles_completed != null ? `Cycles completed: ${campaign.status.cycles_completed}` : 'Cycles completed: n/a',
  supervisor ? `Supervisor: ${supervisor.dir} (${supervisor.status.phase || 'n/a'} / ${supervisor.status.note || 'n/a'})` : 'Supervisor: none',
  inputSources ? `External-volume free benchmark inputs: ${inputSources.benchmark_shadow_inputs_external_volume_free ? 'yes' : 'no'}` : 'External-volume free benchmark inputs: unknown',
  '',
  '| Stage | Runs | Success | Avg Factor NAS/Mac | Avg NAS Sec | Avg Local RSS MB | Avg Swap Delta MB | Classification |',
  '|---|---:|---:|---:|---:|---:|---:|---|'
];

for (const stage of stages) {
  lines.push(`| ${stage.stage} | ${stage.runs} | ${stage.successes} | ${stage.avg_factor_nas_vs_mac ?? 'n/a'} | ${stage.avg_nas_sec ?? 'n/a'} | ${stage.avg_local_max_rss_mb ?? 'n/a'} | ${stage.avg_swap_delta_mb ?? 'n/a'} | ${stage.classification ?? 'n/a'} |`);
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
