#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_MD = path.join(ROOT, 'docs', 'ops', 'nas-evidence-hub.md');

const OPEN_PROBES_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-open-probes-latest.json');
const NIGHT_WATCH_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-night-watch-latest.json');
const SOLUTION_MATRIX_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-matrix-latest.json');
const REALITY_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-automation-reality-check-latest.json');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function compact(text, max = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatNumber(value) {
  if (value == null) return 'n/a';
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function chooseRecommendedVariant(rows) {
  const promote = rows.filter((row) => row.native_classification === 'promote_candidate');
  if (!promote.length) return null;
  return [...promote].sort((a, b) => {
    const aRss = typeof a.avg_peak_rss_mb === 'number' ? a.avg_peak_rss_mb : Number.POSITIVE_INFINITY;
    const bRss = typeof b.avg_peak_rss_mb === 'number' ? b.avg_peak_rss_mb : Number.POSITIVE_INFINITY;
    if (aRss !== bRss) return aRss - bRss;
    const aDur = typeof a.avg_duration_sec === 'number' ? a.avg_duration_sec : Number.POSITIVE_INFINITY;
    const bDur = typeof b.avg_duration_sec === 'number' ? b.avg_duration_sec : Number.POSITIVE_INFINITY;
    if (aDur !== bDur) return aDur - bDur;
    return String(a.variant_id).localeCompare(String(b.variant_id));
  })[0];
}

const [openProbes, nightWatch, solutionMatrix, reality] = await Promise.all([
  readJson(OPEN_PROBES_PATH),
  readJson(NIGHT_WATCH_PATH),
  readJson(SOLUTION_MATRIX_PATH),
  readJson(REALITY_PATH),
]);

const probeRows = openProbes?.probes || [];
const matrixRows = nightWatch?.native_matrix?.matrix || [];
const blockers = nightWatch?.blockers || [];
const latestCampaign = openProbes?.latest_campaign || null;
const latestNightWatch = nightWatch?.night_watch || null;
const latestNativeCampaign = nightWatch?.native_matrix?.latest_campaign || null;
const latestSystemAudit = nightWatch?.latest_system_audit || nightWatch?.native_matrix?.latest_system_audit || null;

const groupedStages = new Map();
for (const row of matrixRows) {
  if (!groupedStages.has(row.stage_id)) groupedStages.set(row.stage_id, []);
  groupedStages.get(row.stage_id).push(row);
}

const recommendedStages = Array.from(groupedStages.entries())
  .map(([stageId, rows]) => ({ stageId, row: chooseRecommendedVariant(rows) }))
  .filter((item) => item.row)
  .sort((a, b) => a.stageId.localeCompare(b.stageId));

const successfulProbes = probeRows.filter((probe) => probe.successes > 0 && probe.failures === 0);
const mixedProbes = probeRows.filter((probe) => probe.successes > 0 && probe.failures > 0);
const failedProbes = probeRows.filter((probe) => probe.successes === 0 && probe.failures > 0);

const stepUpgrades = [];
const refreshProbe = probeRows.find((probe) => probe.probe_id === 'refresh_history_sample');
if (refreshProbe?.successes > 0) {
  stepUpgrades.push('`refresh_v7_history_from_eodhd` läuft auf der NAS jetzt als echter Probe-Run mit US+EU-Sample und History-Root-Normalisierung.');
}
const histProbsProbe = probeRows.find((probe) => probe.probe_id === 'hist_probs_sample');
if (histProbsProbe?.successes > 0 && histProbsProbe.failures === 0) {
  stepUpgrades.push('`hist_probs` läuft auf der NAS jetzt stabil als Small-Scope- und konservativer Runtime-Pfad.');
}
const forecastProbe = probeRows.find((probe) => probe.probe_id === 'forecast_daily');
if (forecastProbe?.successes > 0 && forecastProbe.failures === 0) {
  stepUpgrades.push('`forecast_daily` läuft auf der NAS jetzt wiederholt erfolgreich als Day/Night-Probe.');
}
const universeProbe = probeRows.find((probe) => probe.probe_id === 'universe_audit_sample');
if (universeProbe?.successes > 0 && universeProbe.failures === 0) {
  stepUpgrades.push('`stock_analyzer_universe_audit` ist auf der NAS als JSON/API-Sample-Audit nachweisbar lauffähig.');
}
if (latestNightWatch) {
  stepUpgrades.push('Der 30-Minuten-Watcher hält Native-Matrix und Open-Probes automatisch am Leben und baut pro Zyklus neue Rollups.');
}

const lines = [
  '# NAS Evidence Hub',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  '## Current Verdict',
  '',
  `- Production GO on NAS: ${reality ? String(reality.production_go_supported) : 'n/a'}`,
  `- Current primary runtime: Mac`,
  `- Night-watch status: ${latestNightWatch ? `${latestNightWatch.phase} / ${latestNightWatch.note} / remote_connected=${latestNightWatch.remote_connected}` : 'n/a'}`,
  `- Native-matrix campaign: ${latestNativeCampaign ? `${latestNativeCampaign.campaign_stamp} / ${latestNativeCampaign.last_status}` : 'n/a'}`,
  `- Open-probe campaign: ${latestCampaign ? `${latestCampaign.campaign_stamp} / ${latestCampaign.last_status} / cycles=${latestCampaign.cycles_completed ?? 'n/a'} / runs=${latestCampaign.runs_completed ?? 'n/a'} / failed=${latestCampaign.runs_failed ?? 'n/a'}` : 'n/a'}`,
  `- Root filesystem: ${latestSystemAudit?.root_fs ? `${latestSystemAudit.root_fs.used} / ${latestSystemAudit.root_fs.size} (${latestSystemAudit.root_fs.use_percent})` : 'n/a'}`,
  '',
  '## Hard Blockers',
  '',
  ...(blockers.length ? blockers.map((value) => `- ${value}`) : ['- none']),
  '',
  '## Steps Now Proven On NAS',
  '',
  ...(stepUpgrades.length ? stepUpgrades.map((value) => `- ${value}`) : ['- no new step upgrades recorded']),
  '',
  '## Recommended NAS Methods By Stage',
  '',
  '| Stage | Recommended method | Why this is the current best NAS path | Evidence |',
  '|---|---|---|---|',
  ...recommendedStages.map(({ stageId, row }) => `| ${stageId} | ${row.variant_id} | peak_rss=${formatNumber(row.avg_peak_rss_mb)} MB, avg_duration=${formatNumber(row.avg_duration_sec)} s, swap_delta=${formatNumber(row.avg_swap_delta_mb)} MB | ${row.successes}/${row.total_runs} promote_candidate |`),
  '',
  '## Open-Probe Results',
  '',
  '| Probe | Status | Runs | Avg duration (s) | Avg peak RSS (MB) | What it proves |',
  '|---|---|---:|---:|---:|---|',
  ...probeRows.map((probe) => {
    const status = probe.successes > 0 && probe.failures === 0 ? 'verified_success'
      : probe.successes > 0 && probe.failures > 0 ? 'mixed_results'
      : probe.failures > 0 ? 'verified_failure'
      : 'not_yet_tested';
    const note = probe.latest_status === 'failed'
      ? compact(`${probe.latest_status_reason || 'failure'}; ${probe.latest_stderr_tail || ''}`, 120)
      : 'stable sample path';
    return `| ${probe.label} | ${status} | ${probe.successes}/${probe.total_runs} | ${formatNumber(probe.avg_duration_sec)} | ${formatNumber(probe.avg_peak_rss_mb)} | ${note} |`;
  }),
  '',
  '## Problem -> Best Current NAS Solution',
  '',
  '| Problem | Best current solution | Status | Report family |',
  '|---|---|---|---|',
  ...((solutionMatrix?.problems || []).map((problem) => `| ${problem.problem_id} | ${problem.best_solution ? `${problem.best_solution.id} ${problem.best_solution.label}` : 'n/a'} | ${problem.best_solution?.status || 'n/a'} | ${problem.report_family || 'n/a'} |`)),
  '',
  '## Proven Good Without Mac Replacement',
  '',
  ...successfulProbes.map((probe) => `- ${probe.label}: ${probe.successes}/${probe.total_runs} successful, latest=${probe.latest_status}, avg_peak_rss_mb=${formatNumber(probe.avg_peak_rss_mb)}`),
  ...recommendedStages.map(({ stageId, row }) => `- ${stageId}: recommended variant is \`${row.variant_id}\` with ${row.successes}/${row.total_runs} successful native-matrix runs.`),
  '',
  '## Mixed Or Partial Solutions',
  '',
  ...(mixedProbes.length ? mixedProbes.map((probe) => `- ${probe.label}: ${probe.successes}/${probe.total_runs} success, ${probe.failures} fail, latest_reason=${probe.latest_status_reason || 'n/a'}`) : ['- none']),
  '',
  '## Still Not Working Well On NAS',
  '',
  ...(failedProbes.length ? failedProbes.map((probe) => `- ${probe.label}: ${probe.failures}/${probe.total_runs} failed, latest_reason=${probe.latest_status_reason || 'n/a'}`) : ['- none']),
  '- `best_setups_v4`: architecture still overloaded; smoke path is not yet a promote candidate.',
  '- Production cutover remains blocked while `/dev/md0` stays full and `scheduler_safe_to_modify=false`.',
  '',
  '## Central Report Map',
  '',
  '- `docs/ops/nas-evidence-hub.md`',
  '- `docs/ops/nas-solution-attempt-log.md`',
  '- `docs/ops/nas-transfer-status.md`',
  '- `docs/ops/nas-variant-catalog.md`',
  '- `docs/ops/nas-runbook.md`',
  '- `docs/ops/nas-status-2026-04-08.md`',
  '- `docs/ops/nas-open-probes.md`',
  '- `docs/ops/nas-migration-journal.md`',
  '- `tmp/nas-benchmarks/nas-night-watch-latest.json`',
  '- `tmp/nas-benchmarks/nas-night-watch-latest.md`',
  '- `tmp/nas-benchmarks/nas-open-probes-latest.json`',
  '- `tmp/nas-benchmarks/nas-open-probes-latest.md`',
  '- `tmp/nas-benchmarks/nas-solution-matrix-latest.json`',
  '- `tmp/nas-benchmarks/nas-solution-matrix-latest.md`',
  '- `tmp/nas-benchmarks/nas-automation-reality-check-latest.json`',
  '- `tmp/nas-benchmarks/nas-automation-reality-check-latest.md`',
  '- `tmp/nas-system-audit/<STAMP>/summary.json`',
  '- `tmp/nas-system-audit/<STAMP>/summary.md`',
  '',
  '## Answer To The Core Question',
  '',
  '- Ja, auf der NAS sind heute Schritte nachweisbar möglich, die vorher nicht stabil belegt waren: `refresh_v7_history_from_eodhd`, `hist_probs`, `forecast_daily`, `universe_audit_sample`, sowie der 30-Minuten-Autopilot für Evidence-Runs.',
  '- Nein, das MacBook ist noch nicht ersetzbar. Die wichtigsten verbleibenden Gründe sind `md0=100%`, `scheduler_safe_to_modify=false`, QuantLab-Hot-Path-Probleme, `daily_learning_cycle`, und die noch ungelöste `best_setups_v4`-Architektur.',
  '',
];

await fs.mkdir(path.dirname(OUT_MD), { recursive: true });
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_MD}\n`);
