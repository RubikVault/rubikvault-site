#!/usr/bin/env node
/**
 * Build a minimal public status artifact from private/local release evidence.
 *
 * Source artifacts stay local/NAS-only. This file is safe for Cloudflare because it
 * exposes only visitor-facing availability state, not pipeline internals.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleaseGateModel } from './lib/release-gate-model.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const FINAL_SEAL_PATH = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const PAGE_CORE_LATEST_PATH = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
const PAGE_CORE_CANDIDATE_LATEST_PATH = path.join(REPO_ROOT, 'public/data/page-core/candidates/latest.candidate.json');
const STOCK_UI_STATE_PATH = path.join(REPO_ROOT, 'public/data/runtime/stock-analyzer-ui-state-summary-latest.json');
const DECISION_CORE_ACCELERATED_CERTIFICATION_PATH = path.join(REPO_ROOT, 'public/data/decision-core/status/accelerated-certification-latest.json');
const DECISION_CORE_BUY_BREADTH_PATH = path.join(REPO_ROOT, 'public/data/reports/decision-core-buy-breadth-latest.json');
const HIST_PROBS_STATUS_PATHS = [
  path.join(REPO_ROOT, 'public/data/runtime/hist-probs-status-summary.json'),
  path.join(REPO_ROOT, 'public/data/hist-probs/status-summary.json'),
];
const OUT_PATH = path.join(REPO_ROOT, 'public/data/public-status.json');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

const seal = readJson(FINAL_SEAL_PATH);
const releaseState = readJson(RELEASE_STATE_PATH);
const activePageCoreLatest = readJson(PAGE_CORE_LATEST_PATH);
const candidatePageCoreLatest = readJson(PAGE_CORE_CANDIDATE_LATEST_PATH);
const stockUiState = readJson(STOCK_UI_STATE_PATH);
const decisionCoreAcceleratedCertification = readJson(DECISION_CORE_ACCELERATED_CERTIFICATION_PATH);
const decisionCoreBuyBreadth = readJson(DECISION_CORE_BUY_BREADTH_PATH);
const histStatus = HIST_PROBS_STATUS_PATHS.map(readJson).find(Boolean) || null;
const releaseEvidenceTarget = seal?.target_market_date || seal?.target_date || releaseState?.target_market_date || releaseState?.target_date || null;
const candidateMatchesRelease = Boolean(
  candidatePageCoreLatest?.schema === 'rv.page_core_latest.v1'
  && candidatePageCoreLatest?.snapshot_id
  && releaseEvidenceTarget
  && candidatePageCoreLatest?.target_market_date === releaseEvidenceTarget
);
const pageCoreLatest = candidateMatchesRelease ? candidatePageCoreLatest : activePageCoreLatest;
const pageCoreSource = candidateMatchesRelease ? 'candidate' : 'active';
const pageCoreTarget = pageCoreLatest?.target_market_date || null;
const targetDate = pageCoreTarget || releaseEvidenceTarget;
const releaseEvidenceFresh = Boolean(!pageCoreTarget || !releaseEvidenceTarget || pageCoreTarget === releaseEvidenceTarget);
const coreSealReady = (seal?.core_release_ready === true || seal?.release_ready === true) && releaseEvidenceFresh;
const pageCoreManifestPath = pageCoreLatest?.snapshot_path
  ? path.join(REPO_ROOT, 'public', String(pageCoreLatest.snapshot_path).replace(/^\/+/, ''), 'manifest.json')
  : null;
// Defense-in-depth freshness gate: weekends + holidays can legitimately sit at ~72h, so the
// default 96h threshold tolerates Sun/Mon while still catching multi-day stalls. Override via
// RV_PUBLIC_STATUS_MAX_STALENESS_HOURS (e.g. 48 for stricter weekday-only checks).
const MAX_STALENESS_HOURS = Number(process.env.RV_PUBLIC_STATUS_MAX_STALENESS_HOURS || 96);
let pageCoreFreshnessLagHours = null;
let pageCoreFreshnessOk = true;
if (targetDate) {
  const targetMs = Date.parse(`${String(targetDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isFinite(targetMs)) {
    pageCoreFreshnessLagHours = Math.max(0, Math.round((Date.now() - targetMs) / 3600000));
    pageCoreFreshnessOk = pageCoreFreshnessLagHours <= MAX_STALENESS_HOURS;
  }
}
const pageCoreStructureGreen = Boolean(
  pageCoreLatest?.schema === 'rv.page_core_latest.v1'
  && pageCoreLatest?.snapshot_id
  && Number(pageCoreLatest?.alias_shard_count) === 64
  && Number(pageCoreLatest?.page_shard_count) === 256
  && pageCoreManifestPath
  && fs.existsSync(pageCoreManifestPath)
);
const pageCoreGreen = Boolean(pageCoreStructureGreen && pageCoreFreshnessOk);
const dataPlaneGreen = seal?.data_plane_green !== false;
const decisionPublicGreen = seal?.decision_public_green === true;
const histProbsMode = histStatus?.hist_probs_mode
  || seal?.hist_probs_mode
  || releaseState?.hist_probs_mode
  || seal?.page_core_smokes?.hist_probs_mode
  || 'unknown';
const catchupStatus = histStatus?.catchup_status
  || seal?.catchup_status
  || releaseState?.catchup_status
  || 'unknown';
const histCoverageRatio = Number(histStatus?.coverage_ratio ?? seal?.hist_probs_coverage_ratio ?? 0);
const histStatusKnown = histProbsMode !== 'unknown' && catchupStatus !== 'unknown';
const histGreen = histStatusKnown
  && histCoverageRatio >= 0.90
  && !['failed', 'unknown'].includes(String(catchupStatus).toLowerCase());
const stockUiStateGreen = (stockUiState?.ui_renderable_release_eligible ?? stockUiState?.release_eligible) === true;
const stockUiContractOk = Boolean(
  stockUiState
  && Number(stockUiState?.missing_scope_rows ?? 0) === 0
  && Number(stockUiState?.counts?.contract_violation_total ?? 0) === 0
);
const coreReleaseReady = Boolean(
  coreSealReady
  && pageCoreGreen
  && stockUiContractOk
  && dataPlaneGreen
  && seal?.core_release_ready !== false
);
const decisionReady = releaseEvidenceFresh && (seal?.decision_ready === true || decisionPublicGreen);
const histReady = releaseEvidenceFresh && (seal?.hist_ready === true || histGreen);
const breakoutReady = seal?.breakout_ready ?? null;
const releaseGate = buildReleaseGateModel({
  coreReleaseReady,
  pageCoreReady: Boolean(seal?.page_core_ready ?? pageCoreGreen),
  searchReady: seal?.search_ready !== false,
  universeReady: seal?.universe_ready !== false,
  stockUiState,
  stockUiReleaseEligible: stockUiStateGreen,
  histReady,
});
const overallUiReady = releaseGate.release_ui_ready;
const uiGreen = overallUiReady;
const ready = releaseGate.deploy_allowed;

const doc = {
  schema: 'rv_public_status_v1',
  generated_at: new Date().toISOString(),
  status: uiGreen ? 'OK' : 'LIMITED',
  ui_green: uiGreen,
  release_ready: Boolean(ready),
  core_release_ready: coreReleaseReady,
  page_core_ready: Boolean(seal?.page_core_ready ?? pageCoreGreen),
  search_ready: seal?.search_ready ?? null,
  universe_ready: seal?.universe_ready ?? null,
  decision_ready: decisionReady,
  risk_ready: seal?.risk_ready ?? decisionReady,
  hist_ready: histReady,
  hist_release_blocking: false,
  breakout_ready: breakoutReady,
  overall_ui_ready: overallUiReady,
  release_gate: releaseGate,
  target_market_date: targetDate,
  release_evidence_target_market_date: releaseEvidenceTarget,
  page_core_target_market_date: pageCoreTarget,
  page_core_source: pageCoreSource,
  release_evidence_fresh: releaseEvidenceFresh,
  page_core_green: pageCoreGreen,
  page_core_freshness_ok: pageCoreFreshnessOk,
  page_core_freshness_lag_hours: pageCoreFreshnessLagHours,
  page_core_freshness_max_hours: MAX_STALENESS_HOURS,
  stock_analyzer_ui_state_green: stockUiStateGreen,
  decision_public_green: decisionPublicGreen,
  decision_core_switch_mode: seal?.decision_core?.switch_mode || decisionCoreAcceleratedCertification?.switch_mode || null,
  decision_core_accelerated_certification_status: decisionCoreAcceleratedCertification?.status || null,
  decision_core_live_shadow_days: decisionCoreAcceleratedCertification?.live_shadow_days ?? null,
  decision_core_historical_replay_days: decisionCoreAcceleratedCertification?.historical_replay_valid_days ?? null,
  decision_core_us_stock_etf_buy_count: decisionCoreBuyBreadth?.us_stock_etf_buy_count ?? null,
  decision_core_eu_stock_etf_buy_count: decisionCoreBuyBreadth?.eu_stock_etf_buy_count ?? null,
  decision_core_buy_breadth_status: decisionCoreBuyBreadth?.status || null,
  data_plane_green: dataPlaneGreen,
  hist_probs_green: histGreen,
  hist_probs_mode: histProbsMode,
  catchup_status: catchupStatus,
  retry_remaining: histStatus?.retry_remaining ?? seal?.retry_remaining ?? null,
  tier_a_count: histStatus?.tier_a_count ?? seal?.tier_a_count ?? null,
  tier_b_pending: histStatus?.tier_b_pending ?? seal?.tier_b_pending ?? null,
  freshness_budget_days: histStatus?.freshness_budget_days ?? seal?.freshness_budget_days ?? null,
  hist_probs_coverage_ratio: histCoverageRatio,
  signal_quality: seal?.signal_quality || (decisionPublicGreen ? 'degraded' : 'suppressed'),
  stock_analyzer: {
    available: overallUiReady,
    page_core_snapshot_id: pageCoreLatest?.snapshot_id || null,
    denominator: stockUiState?.denominator ?? null,
    targetable_total: stockUiState?.counts?.targetable_total ?? null,
    ui_renderable_total: stockUiState?.counts?.ui_renderable_total ?? stockUiState?.counts?.operational_total ?? null,
    decision_ready_total: stockUiState?.counts?.decision_ready_total ?? null,
    exception_total: stockUiState?.counts?.exception_total ?? null,
    verified_provider_exception_total: stockUiState?.counts?.verified_provider_exception_total ?? null,
    ui_operational_ratio: stockUiState?.ui_operational_ratio ?? null,
    ui_renderable_ratio: stockUiState?.ui_renderable_ratio ?? stockUiState?.ui_operational_ratio ?? null,
    decision_ready_ratio: stockUiState?.decision_ready_ratio ?? null,
    ui_state_contract_violations: stockUiState?.counts?.contract_violation_total ?? null,
    overall_ui_ready: overallUiReady,
  },
};

writeJsonAtomic(OUT_PATH, doc);
console.log(`[build-public-status] wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
