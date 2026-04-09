#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const VARIANT_CATALOG_PATH = path.join(ROOT, 'docs', 'ops', 'nas-variant-catalog.md');
const OPEN_PROBES_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-open-probes-latest.json');
const NIGHT_WATCH_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-night-watch-latest.json');
const SOLUTION_MATRIX_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-matrix-latest.json');
const REALITY_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-automation-reality-check-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-transfer-status-latest.json');
const OUT_MD = path.join(ROOT, 'docs', 'ops', 'nas-transfer-status.md');

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

function pct(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function parseVariantCatalog(raw) {
  const lines = raw.split('\n');
  const variants = [];
  const sections = [];
  let currentProblem = null;
  let collectingEvidence = false;
  for (const line of lines) {
    const problemMatch = line.match(/^##\s+(P\d+)\s+(.+)$/);
    if (problemMatch) {
      if (currentProblem) sections.push(currentProblem);
      currentProblem = { id: problemMatch[1], label: problemMatch[2].trim() };
      currentProblem.variants = [];
      currentProblem.current_live_evidence = [];
      collectingEvidence = false;
      continue;
    }
    if (line.match(/^##\s+Cross-Cutting Variants$/)) {
      if (currentProblem) sections.push(currentProblem);
      currentProblem = { id: 'X', label: 'Cross-Cutting Variants', variants: [], current_live_evidence: [] };
      collectingEvidence = false;
      continue;
    }
    if (!currentProblem) continue;
    if (line.trim() === 'Current live evidence:') {
      collectingEvidence = true;
      continue;
    }
    const variantMatch = line.match(/^- `([^`]+)` — `([^`]+)`$/);
    if (variantMatch) {
      variants.push({
        problem_id: currentProblem.id,
        problem_label: currentProblem.label,
        variant: variantMatch[1],
        status: variantMatch[2],
      });
      currentProblem.variants.push({
        variant: variantMatch[1],
        status: variantMatch[2],
      });
      collectingEvidence = false;
      continue;
    }
    const evidenceMatch = line.match(/^- `([^`]+)`$/);
    if (collectingEvidence && evidenceMatch) {
      currentProblem.current_live_evidence.push(evidenceMatch[1]);
    }
  }
  if (currentProblem) sections.push(currentProblem);
  return { variants, sections };
}

function probeIndex(openProbes) {
  return new Map((openProbes?.probes || []).map((probe) => [probe.probe_id, probe]));
}

function solutionIndex(solutionMatrix) {
  return new Map((solutionMatrix?.problems || []).map((problem) => [problem.problem_id, problem]));
}

function stageIndex(nightWatch) {
  return new Map((nightWatch?.native_matrix?.matrix || []).map((row) => [row.stage_id, row]));
}

function classifyStep(status) {
  return status;
}

const [variantCatalogRaw, openProbes, nightWatch, solutionMatrix, reality] = await Promise.all([
  readText(VARIANT_CATALOG_PATH),
  readJson(OPEN_PROBES_PATH),
  readJson(NIGHT_WATCH_PATH),
  readJson(SOLUTION_MATRIX_PATH),
  readJson(REALITY_PATH),
]);

const { variants, sections: variantSections } = parseVariantCatalog(variantCatalogRaw);
const variantSummary = {
  total: variants.length,
  live_probe: variants.filter((v) => v.status === 'live_probe').length,
  covered_by_report: variants.filter((v) => v.status === 'covered_by_report').length,
  queued_design: variants.filter((v) => v.status === 'queued_design').length,
  manual_or_external: variants.filter((v) => v.status === 'manual_or_external').length,
};

const solutionSummary = solutionMatrix?.summary || {
  verified_success: 0,
  mixed_results: 0,
  evidence_present_but_blocked: 0,
  verified_failure: 0,
  manual_or_admin_only: 0,
  not_yet_tested: 0,
};
const trackedTotal = Object.values(solutionSummary).reduce((sum, value) => sum + Number(value || 0), 0);
const trackedFinished =
  (solutionSummary.verified_success || 0) +
  (solutionSummary.mixed_results || 0) +
  (solutionSummary.evidence_present_but_blocked || 0) +
  (solutionSummary.verified_failure || 0) +
  (solutionSummary.manual_or_admin_only || 0);
const trackedRemaining = solutionSummary.not_yet_tested || 0;

const openCampaign = openProbes?.latest_campaign || null;
const nativeMatrix = nightWatch?.native_matrix || null;
const totalEvidenceRuns = Number(openCampaign?.runs_completed || 0) + Number(nativeMatrix?.total_result_files || 0);

const queuedCount = variantSummary.queued_design;
const etaMinDays = Math.max(14, Math.ceil(queuedCount / 4));
const etaMaxDays = Math.max(28, Math.ceil(queuedCount / 2));
const etaText = `${etaMinDays}-${etaMaxDays} days (${Math.ceil(etaMinDays / 7)}-${Math.ceil(etaMaxDays / 7)} weeks)`;

const probes = probeIndex(openProbes);
const solutions = solutionIndex(solutionMatrix);
const stages = stageIndex(nightWatch);
const blockers = new Set(nightWatch?.blockers || []);

function findCatalogSectionsByLabel(...needles) {
  return variantSections.filter((section) => needles.some((needle) => section.label.toLowerCase().includes(String(needle).toLowerCase())));
}

function catalogQueuedCount(...needles) {
  return findCatalogSectionsByLabel(...needles)
    .flatMap((section) => section.variants)
    .filter((variant) => variant.status === 'queued_design')
    .length;
}

function solutionOpenCount(...problemIds) {
  return problemIds
    .flatMap((problemId) => solutions.get(problemId)?.solutions || [])
    .filter((solution) => solution.status === 'not_yet_tested')
    .length;
}

function openCountFor({ catalog = [], solutions: solutionIds = [], fallback = 0 }) {
  const catalogCount = catalog.length ? catalogQueuedCount(...catalog) : 0;
  const solutionCount = solutionIds.length ? solutionOpenCount(...solutionIds) : 0;
  return catalogCount + solutionCount || fallback;
}

function bestSolution(problemId) {
  return solutions.get(problemId)?.best_solution || null;
}

function bestMethodText(problemId, fallback = 'n/a') {
  const best = bestSolution(problemId);
  return best ? `${best.id} ${best.label}` : fallback;
}

function stepStatusApi() {
  const best = bestSolution('P04_api_fetch');
  if (!best) return 'YELLOW';
  return best.status === 'verified_success' ? 'GREEN' : best.status === 'mixed_results' ? 'YELLOW' : 'RED';
}

function stepStatusByProbe(probeId, allowSampleGreen = false) {
  const probe = probes.get(probeId);
  if (!probe) return 'YELLOW';
  if (probe.successes > 0 && probe.failures === 0) return allowSampleGreen ? 'GREEN' : 'YELLOW';
  if (probe.successes > 0 && probe.failures > 0) return 'YELLOW';
  if (probe.failures > 0) return 'RED';
  return 'YELLOW';
}

function stepStatusStage(stageId) {
  const rows = (nightWatch?.native_matrix?.matrix || []).filter((row) => row.stage_id === stageId);
  if (rows.some((row) => row.native_classification === 'promote_candidate')) return 'GREEN';
  return 'YELLOW';
}

function probeHasSuccess(probeId) {
  const probe = probes.get(probeId);
  return Boolean(probe && probe.successes > 0);
}

function bestSolutionHasSuccess(problemId) {
  const best = bestSolution(problemId);
  return Boolean(best && ['verified_success', 'mixed_results'].includes(best.status));
}

function readinessLabel({ transferReady, hasSuccessEvidence, openCount }) {
  const suffix = `(${openCount} offen)`;
  if (transferReady) return `YES ${suffix}`;
  if (hasSuccessEvidence) return `PARTIAL ${suffix}`;
  return `NO ${suffix}`;
}

const stepRows = [
  {
    step: 'Root FS / Scheduler foundation',
    status: blockers.has('root_fs_100_percent') || blockers.has('scheduler_safe_to_modify_false') ? 'RED' : 'GREEN',
    best_method: 'read-only audit + watchdog + external supervisor',
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: bestSolutionHasSuccess('P01_md0_rootfs') || Boolean(nightWatch?.latest_system_audit),
      openCount: openCountFor({ catalog: ['md0 / Root-FS / Scheduler'] }),
    }),
    evidence: 'system-partition audit + night-watch blockers',
  },
  {
    step: 'Orchestration / SSOT / locks',
    status: bestSolution('P02_ssot_split_brain')?.status === 'verified_success' && bestSolution('P03_orchestrator_locking')?.status === 'verified_success' ? 'GREEN' : 'YELLOW',
    best_method: `${bestMethodText('P02_ssot_split_brain')} + ${bestMethodText('P03_orchestrator_locking')}`,
    transfer_ready: readinessLabel({
      transferReady: true,
      hasSuccessEvidence: true,
      openCount: openCountFor({ solutions: ['P02_ssot_split_brain', 'P03_orchestrator_locking'] }),
    }),
    evidence: 'solution matrix + active watcher',
  },
  {
    step: 'API fetch / market data',
    status: stepStatusApi(),
    best_method: bestMethodText('P04_api_fetch'),
    transfer_ready: readinessLabel({
      transferReady: stepStatusApi() === 'GREEN',
      hasSuccessEvidence: bestSolutionHasSuccess('P04_api_fetch') || probeHasSuccess('refresh_history_sample'),
      openCount: openCountFor({ catalog: ['API Fetch / Market Data'] }),
    }),
    evidence: 'refresh_history_sample',
  },
  {
    step: 'History refresh',
    status: stepStatusByProbe('refresh_history_sample'),
    best_method: 'isolated refresh sample + US+EU scope artifacts',
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('refresh_history_sample'),
      openCount: openCountFor({ catalog: ['History Refresh'] }),
    }),
    evidence: 'refresh_history_sample',
  },
  {
    step: 'Fundamentals',
    status: stepStatusByProbe('fundamentals_sample'),
    best_method: bestMethodText('P14_fundamentals'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('fundamentals_sample') || bestSolutionHasSuccess('P14_fundamentals'),
      openCount: openCountFor({ catalog: ['Fundamentals'] }),
    }),
    evidence: 'fundamentals_sample',
  },
  {
    step: 'Q1 delta ingest',
    status: stepStatusByProbe('q1_delta_ingest_smoke'),
    best_method: bestMethodText('P07_quantlab_boundary'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('q1_delta_ingest_smoke') || probeHasSuccess('q1_delta_preflight'),
      openCount: openCountFor({ catalog: ['Q1 Delta Ingest'] }),
    }),
    evidence: 'q1_delta_ingest_smoke + q1_delta_preflight',
  },
  {
    step: 'QuantLab boundary / daily report',
    status: (() => {
      const best = bestSolution('P07_quantlab_boundary');
      return best?.status === 'verified_success' ? 'GREEN' : best?.status === 'mixed_results' ? 'YELLOW' : 'RED';
    })(),
    best_method: bestMethodText('P07_quantlab_boundary'),
    transfer_ready: readinessLabel({
      transferReady: bestSolution('P07_quantlab_boundary')?.status === 'verified_success',
      hasSuccessEvidence: bestSolutionHasSuccess('P07_quantlab_boundary') || probeHasSuccess('quantlab_v4_daily_report'),
      openCount: openCountFor({ catalog: ['QuantLab Integration'] }),
    }),
    evidence: 'quantlab_v4_daily_report + quantlab_boundary_audit',
  },
  {
    step: 'hist_probs',
    status: stepStatusByProbe('hist_probs_sample'),
    best_method: bestMethodText('P11_hist_probs'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('hist_probs_sample') || bestSolutionHasSuccess('P11_hist_probs'),
      openCount: openCountFor({ solutions: ['P11_hist_probs'] }),
    }),
    evidence: 'hist_probs_sample',
  },
  {
    step: 'forecast_daily',
    status: stepStatusByProbe('forecast_daily'),
    best_method: 'forecast daily sample path',
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('forecast_daily'),
      openCount: openCountFor({ solutions: ['P13_daily_chain'], fallback: 0 }),
    }),
    evidence: 'forecast_daily',
  },
  {
    step: 'Learning / runtime control',
    status: probes.get('daily_learning_cycle')?.failures > 0 ? 'YELLOW' : 'GREEN',
    best_method: bestMethodText('P12_learning_governance'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: bestSolutionHasSuccess('P12_learning_governance') || probeHasSuccess('runtime_control_probe'),
      openCount: openCountFor({ catalog: ['Learning Cycle'] }),
    }),
    evidence: 'daily_learning_cycle + runtime_control_probe',
  },
  {
    step: 'best_setups_v4',
    status: bestSolution('P06_best_setups_v4')?.status === 'evidence_present_but_blocked' ? 'RED' : 'YELLOW',
    best_method: bestMethodText('P06_best_setups_v4'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('best_setups_v4_smoke') || bestSolutionHasSuccess('P06_best_setups_v4'),
      openCount: openCountFor({ catalog: ['best_setups_v4'] }),
    }),
    evidence: 'best_setups_v4_smoke + native matrix',
  },
  {
    step: 'Universe audit / API contract',
    status: stepStatusByProbe('universe_audit_sample'),
    best_method: bestMethodText('P05_ui_browser_localhost'),
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('universe_audit_sample') || bestSolutionHasSuccess('P05_ui_browser_localhost'),
      openCount: openCountFor({ catalog: ['UI Audit / Browser Tests'] }),
    }),
    evidence: 'universe_audit_sample',
  },
  {
    step: 'UI contract / rendering',
    status: probes.get('ui_contract_probe') ? stepStatusByProbe('ui_contract_probe') : 'YELLOW',
    best_method: 'UI contract probe without browser',
    transfer_ready: readinessLabel({
      transferReady: false,
      hasSuccessEvidence: probeHasSuccess('ui_contract_probe'),
      openCount: openCountFor({ catalog: ['UI Rendering'] }),
    }),
    evidence: 'ui_contract_probe',
  },
  {
    step: 'Dashboard V7 all green on NAS',
    status: reality?.production_go_supported ? 'GREEN' : 'RED',
    best_method: 'full chain only after blockers clear',
    transfer_ready: readinessLabel({
      transferReady: Boolean(reality?.production_go_supported),
      hasSuccessEvidence: Boolean(reality?.production_go_supported),
      openCount: trackedRemaining,
    }),
    evidence: 'reality-check + blockers',
  },
  {
    step: 'Stage1 ops summary',
    status: stepStatusStage('stage1'),
    best_method: 'node384',
    transfer_ready: readinessLabel({
      transferReady: stepStatusStage('stage1') === 'GREEN',
      hasSuccessEvidence: stepStatusStage('stage1') === 'GREEN',
      openCount: 0,
    }),
    evidence: 'native matrix',
  },
  {
    step: 'Stage2 dashboard/meta',
    status: stepStatusStage('stage2'),
    best_method: 'node384',
    transfer_ready: readinessLabel({
      transferReady: stepStatusStage('stage2') === 'GREEN',
      hasSuccessEvidence: stepStatusStage('stage2') === 'GREEN',
      openCount: 0,
    }),
    evidence: 'native matrix',
  },
  {
    step: 'Stage3 system-status',
    status: stepStatusStage('stage3'),
    best_method: 'node512',
    transfer_ready: readinessLabel({
      transferReady: stepStatusStage('stage3') === 'GREEN',
      hasSuccessEvidence: stepStatusStage('stage3') === 'GREEN',
      openCount: 0,
    }),
    evidence: 'native matrix',
  },
  {
    step: 'Scientific summary',
    status: stepStatusStage('stage4:scientific_summary'),
    best_method: 'baseline_serial',
    transfer_ready: readinessLabel({
      transferReady: stepStatusStage('stage4:scientific_summary') === 'GREEN',
      hasSuccessEvidence: stepStatusStage('stage4:scientific_summary') === 'GREEN',
      openCount: 0,
    }),
    evidence: 'native matrix',
  },
];

const statusCounts = {
  GREEN: stepRows.filter((row) => row.status === 'GREEN').length,
  YELLOW: stepRows.filter((row) => row.status === 'YELLOW').length,
  RED: stepRows.filter((row) => row.status === 'RED').length,
};

const doc = {
  schema_version: 'nas.transfer.status.v1',
  generated_at: new Date().toISOString(),
  active_solution_tracking: {
    total: trackedTotal,
    finished: trackedFinished,
    remaining: trackedRemaining,
    finished_pct: pct(trackedFinished, trackedTotal),
  },
  full_variant_catalog: {
    total: variantSummary.total,
    live_probe: variantSummary.live_probe,
    covered_by_report: variantSummary.covered_by_report,
    queued_design: variantSummary.queued_design,
    manual_or_external: variantSummary.manual_or_external,
  },
  evidence_runs_total: totalEvidenceRuns,
  estimated_remaining_time: etaText,
  step_status_counts: statusCounts,
  step_rows: stepRows,
};

const lines = [
  '# NAS Transfer Status',
  '',
  `Generated at: ${doc.generated_at}`,
  '',
  '## Progress',
  '',
  `- Active tracked solution variants total: ${trackedTotal}`,
  `- Finished/classified: ${trackedFinished}`,
  `- Remaining untested: ${trackedRemaining}`,
  `- Completion: ${doc.active_solution_tracking.finished_pct}%`,
  `- Evidence runs total so far: ${totalEvidenceRuns}`,
  '',
  '## Full Variant Catalog',
  '',
  `- Total catalog variants: ${variantSummary.total}`,
  `- live_probe: ${variantSummary.live_probe}`,
  `- covered_by_report: ${variantSummary.covered_by_report}`,
  `- queued_design: ${variantSummary.queued_design}`,
  `- manual_or_external: ${variantSummary.manual_or_external}`,
  '',
  '## ETA',
  '',
  `- Estimated remaining time until the currently tracked and queued NAS solution space is robustly tested: ${etaText}`,
  '',
  '## Step Table',
  '',
  '| Step | Status | Best current NAS method | NAS replacement status | Evidence |',
  '|---|---|---|---|---|',
  ...stepRows.map((row) => `| ${row.step} | ${classifyStep(row.status)} | ${row.best_method} | ${row.transfer_ready} | ${row.evidence} |`),
  '',
  '## Step Status Summary',
  '',
  `- GREEN: ${statusCounts.GREEN}`,
  `- YELLOW: ${statusCounts.YELLOW}`,
  `- RED: ${statusCounts.RED}`,
  '',
  '## Answer',
  '',
  '- YES means there is a robust, repeatedly evidenced NAS path and the step is currently transfer-ready.',
  '- PARTIAL means at least one NAS-side solution already succeeded, but the step is not yet robust enough to replace the Mac path.',
  '- NO means no NAS-side solution has succeeded yet for this step.',
  '',
];

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
