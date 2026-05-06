import fs from 'node:fs';
import path from 'node:path';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  isModuleTargetCompatible,
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
  validateControlPlaneConsistency,
  writeJsonAtomic,
} from './pipeline-artifact-contract.mjs';
import { latestUsMarketSessionIso } from '../../functions/api/_shared/market-calendar.js';
import {
  ensureSealKeyPair,
  signSealPayload,
} from '../lib/pipeline_authority/gates/release-seal.mjs';
import { resolveRuntimeConfig } from '../lib/pipeline_authority/config/runtime-config.mjs';
import { evaluateCoveragePolicy } from '../lib/decision-bundle-contract.mjs';
import { assertMayWriteProductionTruth } from './prod-runtime-guard.mjs';
import { readLeafSeal, REQUIRED_LEAF_SEAL_STEP_IDS } from '../lib/write-leaf-seal.mjs';
import { buildReleaseGateModel } from './lib/release-gate-model.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
export const FINAL_INTEGRITY_SEAL_PATH = path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json');
export const PIPELINE_INCIDENTS_PATH = path.join(ROOT, 'public/data/reports/pipeline-incidents-latest.json');
const PATHS = {
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
  recovery: path.join(ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  publish: path.join(ROOT, 'public/data/ops/publish-chain-latest.json'),
  runtimePreflight: path.join(ROOT, 'public/data/ops/runtime-preflight-latest.json'),
  stockAudit: path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  stockOperability: path.join(ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json'),
  stockUiState: path.join(ROOT, 'public/data/runtime/stock-analyzer-ui-state-summary-latest.json'),
  searchRegistrySync: path.join(ROOT, 'public/data/universe/v7/reports/search_registry_sync_report.json'),
  uiFieldTruth: path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json'),
  launchd: path.join(ROOT, 'public/data/ops/launchd-reconcile-latest.json'),
  storage: path.join(ROOT, 'public/data/reports/storage-budget-latest.json'),
  decisionBundle: path.join(ROOT, 'public/data/decisions/latest.json'),
  decisionBundleOps: path.join(ROOT, 'public/data/ops/decision-bundle-latest.json'),
  histProbsStatus: path.join(ROOT, 'public/data/runtime/hist-probs-status-summary.json'),
  histProbsStatusLegacy: path.join(ROOT, 'public/data/hist-probs/status-summary.json'),
  heartbeat: path.join(ROOT, 'mirrors/ops/pipeline-master/supervisor-heartbeat.json'),
  crashSeal: path.join(ROOT, 'public/data/ops/crash-seal-latest.json'),
};

function severityRank(value) {
  return { ok: 0, info: 0, warning: 1, critical: 2 }[String(value || '').toLowerCase()] ?? 0;
}

function normalizeModuleDates(epoch = {}, system = {}) {
  const fromEpoch = Object.fromEntries(
    Object.entries(epoch?.modules || {}).map(([id, module]) => [id, normalizeDate(module?.as_of || null)]),
  );
  if (Object.keys(fromEpoch).length > 0) return fromEpoch;
  return Object.fromEntries(
    Object.entries(system?.steps || {}).map(([id, step]) => [id, normalizeDate(step?.output_asof || null)]),
  );
}

function stockAuditSummary(stockAnalyzerAudit = null, system = null) {
  return stockAnalyzerAudit?.summary
    || system?.stock_analyzer_universe_audit?.summary
    || system?.steps?.stock_analyzer_universe_audit?.status_detail?.audit_summary
    || null;
}

function reason(id, severity = 'critical', details = null) {
  return { id, severity, details };
}

function parseTimeMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function normalizeObserverInput(source, doc, expectedTargetDate) {
  const generatedAt = doc?.generated_at || doc?.generatedAt || doc?.updated_at || doc?.last_updated || null;
  const targetMarketDate = normalizeDate(
    doc?.target_market_date
    || doc?.target_date
    || doc?.summary?.target_market_date
    || null
  );
  return {
    source,
    present: Boolean(doc && typeof doc === 'object'),
    generated_at: generatedAt,
    target_market_date: targetMarketDate,
    target_mismatch: Boolean(expectedTargetDate && targetMarketDate && targetMarketDate !== expectedTargetDate),
  };
}

function evaluateObserverFreshness({
  expectedTargetDate = null,
  runtime = null,
  epoch = null,
  recovery = null,
  release = null,
} = {}) {
  const observerInputs = [
    normalizeObserverInput('runtime', runtime, expectedTargetDate),
    normalizeObserverInput('epoch', epoch, expectedTargetDate),
  ];
  const chainInputs = [
    normalizeObserverInput('recovery', recovery, expectedTargetDate),
    normalizeObserverInput('release', release, expectedTargetDate),
  ];
  const activeTargetSeen = chainInputs.some((item) => item.target_market_date === expectedTargetDate);
  const staleSources = observerInputs
    .filter((item) => item.present)
    .filter((item) => item.target_mismatch || (activeTargetSeen && !item.generated_at));
  const generatedTimes = observerInputs
    .map((item) => parseTimeMs(item.generated_at))
    .filter((value) => value != null);
  return {
    stale: staleSources.length > 0,
    generated_at: generatedTimes.length > 0 ? new Date(Math.min(...generatedTimes)).toISOString() : null,
    inputs: [...observerInputs, ...chainInputs],
    stale_sources: staleSources.map((item) => ({
      source: item.source,
      generated_at: item.generated_at,
      target_market_date: item.target_market_date,
      target_mismatch: item.target_mismatch,
    })),
  };
}

function deriveLeadBlockerStep(blockingReasons = [], recovery = null) {
  const top = Array.isArray(blockingReasons) ? blockingReasons[0] || null : null;
  const recoveryLead = recovery?.lead_blocker_step || recovery?.next_step || null;
  if (!top) return null;
  if (top.id === 'runtime_preflight_failed') return 'runtime_preflight';
  if (top.id === 'observer_stale') return recoveryLead || 'pipeline_runtime';
  if (top.id === 'target_market_date_mismatch') return recoveryLead || 'pipeline_runtime';
  if (top.id === 'module_target_date_mismatch') return top.details?.[0]?.id || recoveryLead || 'pipeline_epoch';
  if (top.id === 'data_plane_not_green') return recoveryLead || 'pipeline_epoch';
  if (top.id === 'publish_chain_not_ok') return 'publish';
  if (top.id === 'full_universe_ui_field_truth_missing' || top.id === 'ui_field_truth_failures') return 'stock_analyzer_universe_audit';
  if (String(top.id || '').startsWith('ui_field_truth_report_')) return 'ui_field_truth_report';
  if (String(top.id || '').startsWith('bundle_') || String(top.id || '').startsWith('decision_bundle_')) return 'decision_bundle';
  if (top.id === 'launchd_allowlist_not_satisfied') return 'launchd_reconcile';
  if (top.id === 'storage_blocked' || top.id === 'nas_unreachable') return 'storage_governor';
  return recoveryLead;
}

function deriveNextStep({ leadBlockerStep = null, recovery = null, blockingReasons = [] } = {}) {
  if ((!Array.isArray(blockingReasons) || blockingReasons.length === 0) && !leadBlockerStep) return null;
  return leadBlockerStep
    || recovery?.lead_blocker_step
    || recovery?.next_step
    || blockingReasons?.[0]?.id
    || null;
}

const ADVISORY_ONLY_WARNING_IDS = new Set([
  'policy_neutral_structural_gap',
  'decision_bundle_degraded',
  'eligible_wait_pipeline_incomplete',
  'risk_unknown',
  'strict_full_coverage_below_95pct',
  'decision_internal_not_green',
]);

export function evaluateDecisionBundleHealth(decisionBundle, {
  expectedTargetDate = null,
  now = new Date(),
  requiredLeafFailed = null,
} = {}) {
  if (!decisionBundle || typeof decisionBundle !== 'object') {
    return {
      status: 'FAILED',
      blocking_reasons: [reason('bundle_missing')],
      warnings: [],
      summary: null,
    };
  }
  if (decisionBundle.schema !== 'rv.decision_bundle_latest.v1' && decisionBundle.schema !== 'rv.decision_bundle_seal.v1') {
    return {
      status: 'FAILED',
      blocking_reasons: [reason('bundle_hash_mismatch', 'critical', { schema: decisionBundle.schema || null })],
      warnings: [],
      summary: decisionBundle.summary || null,
    };
  }
  const blocking = [];
  const warnings = [];
  const target = normalizeDate(expectedTargetDate);
  const bundleTarget = normalizeDate(decisionBundle.target_market_date);
  if (target && bundleTarget && target !== bundleTarget) {
    blocking.push(reason('target_date_mismatch', 'critical', { expected: target, actual: bundleTarget }));
  }
  const validUntilMs = parseTimeMs(decisionBundle.valid_until);
  if (validUntilMs != null && validUntilMs < now.getTime()) {
    blocking.push(reason('bundle_stale', 'critical', { valid_until: decisionBundle.valid_until }));
  }
  const leafSealCheck = {
    anyFailed: requiredLeafFailed == null ? evaluateRequiredLeafSeals().anyFailed : requiredLeafFailed === true,
  };
  const summary = decisionBundle.summary || null;
  if (!summary) {
    blocking.push(reason('summary_missing'));
  } else {
    const policy = evaluateCoveragePolicy(summary, {
      requiredLeafFailed: leafSealCheck.anyFailed,
      bundleCorrupt: false,
    });
    for (const id of policy.blocking_reasons || []) {
      blocking.push(reason(id, 'critical', {
        strict_full_coverage_ratio: summary.strict_full_coverage_ratio,
        assets_unclassified_missing: summary.assets_unclassified_missing,
        eligible_wait_pipeline_incomplete_count: summary.eligible_wait_pipeline_incomplete_count,
        eligible_unknown_risk_count: summary.eligible_unknown_risk_count,
      }));
    }
    for (const id of policy.warnings || []) {
      warnings.push(reason(id, 'warning', {
        strict_full_coverage_ratio: summary.strict_full_coverage_ratio,
        strict_full_coverage_count: summary.strict_full_coverage_count,
        assets_expected_for_decision: summary.assets_expected_for_decision,
      }));
    }
  }
  const declaredStatus = String(decisionBundle.status || '').toUpperCase();
  if (declaredStatus === 'FAILED') {
    blocking.push(reason('decision_bundle_failed', 'critical', decisionBundle.blocking_reasons || []));
  } else if (declaredStatus === 'DEGRADED') {
    warnings.push(reason('decision_bundle_degraded', 'warning', decisionBundle.warnings || []));
  }
  const status = blocking.length > 0 ? 'FAILED' : warnings.length > 0 ? 'DEGRADED' : 'OK';
  return { status, blocking_reasons: blocking, warnings, summary };
}

function evaluateCrashAndHeartbeat({ crashSeal = null, heartbeat = null, previousFinal = null, targetMarketDate = null, now = new Date() } = {}) {
  const blocking = [];
  const warnings = [];
  if (crashSeal?.status === 'FAILED') {
    const crashTarget = normalizeDate(crashSeal.target_market_date || null);
    const currentTarget = normalizeDate(targetMarketDate || null);
    if (crashTarget && currentTarget && crashTarget < currentTarget) {
      warnings.push(reason('stale_crash_seal_ignored', 'warning', {
        run_id: crashSeal.run_id || null,
        failed_step: crashSeal.failed_step || null,
        failure_class: crashSeal.failure_class || null,
        crash_target_market_date: crashTarget,
        current_target_market_date: currentTarget,
      }));
    } else {
      blocking.push(reason('crash_unresolved', 'critical', {
        run_id: crashSeal.run_id || null,
        failed_step: crashSeal.failed_step || null,
        failure_class: crashSeal.failure_class || null,
        target_market_date: crashTarget || null,
      }));
    }
  }
  const heartbeatMs = parseTimeMs(heartbeat?.last_seen);
  const heartbeatStale = heartbeatMs == null || (now.getTime() - heartbeatMs) > 45 * 60 * 1000;
  const previousFinalMs = parseTimeMs(previousFinal?.generated_at);
  const previousFinalStale = previousFinalMs == null || (now.getTime() - previousFinalMs) > 30 * 60 * 60 * 1000;
  if (heartbeatStale && previousFinalStale) {
    blocking.push(reason('heartbeat_stale', 'critical', {
      heartbeat_last_seen: heartbeat?.last_seen || null,
      previous_final_generated_at: previousFinal?.generated_at || null,
    }));
  } else if (heartbeatStale) {
    warnings.push(reason('heartbeat_stale', 'warning', {
      heartbeat_last_seen: heartbeat?.last_seen || null,
    }));
  }
  return {
    status: blocking.length > 0 ? 'FAILED' : warnings.length > 0 ? 'DEGRADED' : 'OK',
    blocking_reasons: blocking,
    warnings,
  };
}

function evaluateRequiredLeafSeals() {
  let anyFailed = false;
  const details = {};
  for (const stepId of REQUIRED_LEAF_SEAL_STEP_IDS) {
    const seal = readLeafSeal(stepId);
    const status = String(seal?.status || 'MISSING').toUpperCase();
    details[stepId] = status;
    // Only existing seals with explicit FAILED status block the gate.
    // MISSING means the seal hasn't been written yet (first-run / not-yet-deployed).
    if (status === 'FAILED') anyFailed = true;
  }
  return { anyFailed, details };
}

function evaluateZeroBuyAnomaly(decisionBundleSummary, regimeDoc) {
  const buyCount = Number(decisionBundleSummary?.buy_count ?? -1);
  if (buyCount !== 0) return null; // not a zero-buy situation
  const coverage = Number(decisionBundleSummary?.strict_full_coverage_ratio ?? 0);
  if (coverage < 0.95) {
    // Coverage incomplete → DEGRADED or FAILED per coverage matrix (already handled elsewhere)
    return null;
  }
  // Full coverage, zero BUYs — assess macro context
  const regime = String(regimeDoc?.market_regime || '').toLowerCase();
  const riskOff = ['bear', 'crash', 'extreme_bear', 'risk_off'].includes(regime);
  return riskOff ? 'OK' : 'DEGRADED';
}

function strictDecisionCoverageRatio(summary = null) {
  const direct = Number(summary?.strict_full_coverage_ratio);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(1, direct));
  const count = Number(summary?.strict_full_coverage_count);
  const denominator = Number(summary?.assets_expected_for_decision || summary?.assets_eligible || summary?.assets_processed);
  if (!Number.isFinite(count) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(1, count / denominator));
}

function signalQualityForCoverage(ratio) {
  if (ratio >= 0.95) return 'fresh';
  if (ratio >= 0.90) return 'degraded';
  return 'suppressed';
}

function histProbsStatusSummary(histProbsStatus = null) {
  const mode = String(histProbsStatus?.hist_probs_mode || 'unknown').toLowerCase();
  const catchup = String(histProbsStatus?.catchup_status || 'unknown').toLowerCase();
  const coverage = Number(histProbsStatus?.coverage_ratio ?? histProbsStatus?.artifact_coverage_ratio ?? histProbsStatus?.run_coverage_ratio ?? 0);
  const artifactFreshness = Number(histProbsStatus?.artifact_freshness_ratio ?? histProbsStatus?.artifact_coverage_ratio ?? coverage);
  const minCoverage = Number(histProbsStatus?.min_coverage_ratio ?? 0.95);
  const deferred = histProbsStatus?.deferred === true || Number(histProbsStatus?.deferred_remaining_tickers || 0) > 0;
  const writeMode = String(histProbsStatus?.hist_probs_write_mode || '').toLowerCase();
  const writeModeOk = writeMode === 'bucket_only';
  const known = Boolean(mode && catchup && mode !== 'unknown' && catchup !== 'unknown');
  const green = known
    && Number.isFinite(coverage)
    && Number.isFinite(artifactFreshness)
    && coverage >= minCoverage
    && artifactFreshness >= minCoverage
    && catchup === 'complete'
    && !deferred
    && writeModeOk;
  return {
    green,
    known,
    mode,
    catchup_status: catchup,
    coverage_ratio: Number.isFinite(coverage) ? coverage : 0,
    artifact_freshness_ratio: Number.isFinite(artifactFreshness) ? artifactFreshness : 0,
    min_coverage_ratio: Number.isFinite(minCoverage) ? minCoverage : 0.95,
    deferred,
    deferred_remaining_tickers: Number.isFinite(Number(histProbsStatus?.deferred_remaining_tickers)) ? Number(histProbsStatus.deferred_remaining_tickers) : 0,
    hist_probs_write_mode: writeMode || null,
    write_mode_ok: writeModeOk,
    retry_remaining: Number.isFinite(Number(histProbsStatus?.retry_remaining)) ? Number(histProbsStatus.retry_remaining) : null,
    tier_a_count: Number.isFinite(Number(histProbsStatus?.tier_a_count)) ? Number(histProbsStatus.tier_a_count) : null,
    tier_b_pending: Number.isFinite(Number(histProbsStatus?.tier_b_pending)) ? Number(histProbsStatus.tier_b_pending) : null,
    freshness_budget_days: Number.isFinite(Number(histProbsStatus?.freshness_budget_days)) ? Number(histProbsStatus.freshness_budget_days) : null,
  };
}

export function buildFinalIntegritySeal({
  runId = null,
  targetMarketDate = null,
  enforceCalendarTarget = true,
  phase = null,
  system = null,
  runtime = null,
  epoch = null,
  recovery = null,
  release = null,
  publish = null,
  runtimePreflight = null,
  stockAnalyzerAudit = null,
  stockAnalyzerOperability = null,
  stockAnalyzerUiState = null,
  searchRegistrySync = null,
  uiFieldTruth = null,
  launchd = null,
  storage = null,
  decisionBundle = null,
  histProbsStatus = null,
  heartbeat = null,
  crashSeal = null,
  previousFinal = null,
  controlPlaneConsistency = null,
  lockIntegrityOk = true,
  allowPublishInFlight = false,
  requiredLeafFailed = null,
  now = new Date(),
} = {}) {
  const expectedTargetDate = normalizeDate(targetMarketDate) || latestUsMarketSessionIso(now);
  const regimeDoc = readJson(path.join(ROOT, 'public/data/hist-probs/regime-daily.json'));
  const moduleDates = normalizeModuleDates(epoch, system);
  const moduleDateMismatches = Object.entries(moduleDates)
    .filter(([id, asOf]) => asOf && expectedTargetDate && !isModuleTargetCompatible(id, asOf, expectedTargetDate))
    .map(([id, as_of]) => ({ id, as_of, expected_target_market_date: expectedTargetDate }));
  const summary = stockAuditSummary(stockAnalyzerAudit, system);
  const operabilitySummary = stockAnalyzerOperability?.summary || system?.stock_analyzer_operability?.summary || null;
  const uiFieldTruthSummary = uiFieldTruth?.summary || null;
  const uiStateReleaseEligible = (stockAnalyzerUiState?.ui_renderable_release_eligible ?? stockAnalyzerUiState?.release_eligible) === true;
  const uiFieldTruthReleaseReady = uiStateReleaseEligible && uiFieldTruthSummary?.ui_field_truth_ok === true;
  const uiStateRatio = Number(stockAnalyzerUiState?.ui_operational_ratio ?? NaN);
  const uiStateTargetableAssets = Number(stockAnalyzerUiState?.counts?.targetable_total ?? NaN);
  const uiStateOperationalAssets = Number(stockAnalyzerUiState?.counts?.operational_total ?? NaN);
  const uiStateOperabilitySummary = stockAnalyzerUiState
    ? {
        coverage_denominator: stockAnalyzerUiState.denominator || 'stock_analyzer_ui_state_targetable_scope',
        targetable_assets: Number.isFinite(uiStateTargetableAssets) ? uiStateTargetableAssets : (uiStateReleaseEligible ? 1 : null),
        targetable_operational_assets: Number.isFinite(uiStateOperationalAssets) ? uiStateOperationalAssets : (uiStateReleaseEligible ? 1 : null),
        targetable_green_ratio: Number.isFinite(uiStateRatio) ? uiStateRatio : null,
        release_green_threshold: stockAnalyzerUiState.min_green_ratio ?? 0.90,
        release_blocked: stockAnalyzerUiState.release_eligible !== true,
        verified_exception_count: stockAnalyzerUiState.counts?.exception_total ?? null,
        verified_provider_exception_count: stockAnalyzerUiState.counts?.verified_provider_exception_total ?? null,
      }
    : null;
  const effectiveOperabilitySummary = uiStateReleaseEligible && uiStateOperabilitySummary
    ? uiStateOperabilitySummary
    : operabilitySummary;
  const pageCoreSmokes = uiFieldTruth?.page_core_smokes || null;
  const pageCoreGateRequired = process.env.RV_PAGE_CORE_RELEASE_GATE_REQUIRED === '1'
    || pageCoreSmokes?.enabled === true;
  const pageCoreGateOk = !pageCoreGateRequired || pageCoreSmokes?.release_eligible === true;
  const uiFieldTruthDateMatch = !uiFieldTruth
    || !expectedTargetDate
    || normalizeDate(uiFieldTruth.target_market_date) === expectedTargetDate;
  const uiFieldTruthReadable = Boolean(uiFieldTruth && typeof uiFieldTruth === 'object' && uiFieldTruthSummary);
  const sampledMode = summary?.sampled_mode === true
    || String(summary?.live_endpoint_mode || '').toLowerCase() === 'sampled_smoke';
  const artifactOnlyAudit = String(summary?.live_endpoint_mode || '').toLowerCase() === 'artifact_only';
  const artifactFullValidated = uiFieldTruthReleaseReady === true
    || summary?.artifact_full_validated === true
    || summary?.full_universe_validated === true
    || (
      summary?.full_universe === true
      && summary?.artifact_critical_issue_count === 0
      && sampledMode !== true
      && Number(summary?.critical_failure_family_count ?? 0) === 0
    );
  const artifactReleaseReady = uiFieldTruthReleaseReady === true || summary?.artifact_release_ready === true || artifactFullValidated;
  const policyNeutralStructuralGapsOnly = summary?.policy_neutral_structural_gaps_only === true;
  const auditCriticalIssueCount = uiFieldTruthReleaseReady ? 0 : Number(summary?.artifact_critical_issue_count ?? summary?.critical_issue_count ?? 0);
  const uiFieldTruthOk = artifactReleaseReady === true
    && (artifactOnlyAudit ? pageCoreGateOk : uiFieldTruthSummary?.ui_field_truth_ok === true && pageCoreGateOk);
  const calendarTarget = latestUsMarketSessionIso(now);
  const calendarOk = !enforceCalendarTarget || !expectedTargetDate || calendarTarget === expectedTargetDate;
  const launchdOk = launchd?.allowed_launchd_only === true;
  const storageOk = storage?.disk?.heavy_jobs_allowed === true;
  const nasReachable = storage?.nas?.reachable === true;
  const nasRequiredForRelease = process.env.RV_REQUIRE_NAS_FOR_RELEASE === '1';
  const nasOk = nasRequiredForRelease ? nasReachable : true;
  const consistency = controlPlaneConsistency || validateControlPlaneConsistency({
    system,
    release,
    runtime,
    epoch,
    recovery,
  });
  const observerFreshness = evaluateObserverFreshness({
    expectedTargetDate,
    runtime,
    epoch,
    recovery,
    release,
  });
  // NOTE: local_data_green intentionally excluded — it depends on the seal itself (circular).
  // Epoch pipeline_ok is the authoritative data-plane gate; runtime consistency confirms
  // the control-plane artifacts are coherent.
  // run_id_mismatch is expected during recovery (system uses recovery run_id, release uses master run_id)
  // and is intentionally tolerated here (same rationale as in build-pipeline-epoch.mjs).
  const consistencyNonCircularReasons = (consistency?.blocking_reasons || [])
    .map((entry) => {
      if (entry?.id === 'target_market_date_mismatch' && Array.isArray(entry?.details) && expectedTargetDate) {
        const filtered = entry.details.filter((item) => !['release', 'recovery'].includes(item?.source));
        const distinctTargets = new Set(filtered.map((item) => normalizeDate(item?.target_market_date || null)).filter(Boolean));
        return distinctTargets.size > 1 ? { ...entry, details: filtered } : null;
      }
      if (entry?.id === 'run_id_mismatch' && Array.isArray(entry?.details)) {
        const filtered = entry.details.filter((item) => !['release', 'recovery'].includes(item?.source));
        const distinctRunIds = new Set(filtered.map((item) => String(item?.run_id || '').trim()).filter(Boolean));
        return distinctRunIds.size > 1 ? { ...entry, details: filtered } : null;
      }
      return entry;
    })
    .filter(Boolean)
    .filter((r) => r.id !== 'run_id_mismatch' && r.id !== 'runtime_pipeline_consistency_failed');
  const runtimeConsistencyOk = consistencyNonCircularReasons.length === 0;
  const dataPlaneGreen = epoch?.pipeline_ok === true && runtimeConsistencyOk && observerFreshness.stale !== true;
  const publishInFlightOk = allowPublishInFlight === true
    && Array.isArray(publish?.steps)
    && publish.steps.length > 0
    && publish.steps.every((step) => !['failed', 'skipped'].includes(String(step?.status || '').toLowerCase()));
  const publishOk = publish?.ok === true
    || (
      publishInFlightOk
    );
  const blockingReasons = [];
  const warningReasons = [];
  if (!calendarOk) {
    blockingReasons.push({
      id: 'calendar_target_mismatch',
      severity: 'critical',
      details: { expected_target_market_date: calendarTarget, target_market_date: expectedTargetDate },
    });
  }
  if (!launchdOk) {
    blockingReasons.push({
      id: 'launchd_allowlist_not_satisfied',
      severity: 'critical',
      details: launchd,
    });
  }
  if (!storageOk) {
    blockingReasons.push({
      id: 'storage_blocked',
      severity: 'critical',
      details: storage?.disk || null,
    });
  }
  if (!nasOk) {
    blockingReasons.push({
      id: 'nas_unreachable',
      severity: 'critical',
      details: storage?.nas || null,
    });
  }
  if (!lockIntegrityOk) {
    blockingReasons.push({
      id: 'lock_integrity_failed',
      severity: 'critical',
      details: { lock_integrity_ok: false },
    });
  }
  const epochNowClean = epoch?.pipeline_ok === true && (!Array.isArray(epoch?.blocking_gaps) || epoch.blocking_gaps.length === 0);
  if (observerFreshness.stale) {
    blockingReasons.push({
      id: 'observer_stale',
      severity: 'critical',
      details: {
        expected_target_market_date: expectedTargetDate,
        observer_generated_at: observerFreshness.generated_at,
        observer_inputs: observerFreshness.inputs,
        stale_sources: observerFreshness.stale_sources,
      },
    });
  }
  for (const reason of consistencyNonCircularReasons) {
    if (reason.id === 'nas_unreachable' && !nasRequiredForRelease) continue;
    // Skip epoch-related reasons from stale runtime consistency when the current epoch is clean.
    // These are artifacts of a stale runtime snapshot and would create a false blocker.
    if (epochNowClean && (reason.id === 'epoch_blocking_gaps' || reason.id === 'epoch_module_target_mismatch')) continue;
    blockingReasons.push(reason);
  }
  if (moduleDateMismatches.length > 0) {
    blockingReasons.push({
      id: 'module_target_date_mismatch',
      severity: 'critical',
      details: moduleDateMismatches,
    });
  }
  if (!publishOk) {
    blockingReasons.push({
      id: 'publish_chain_not_ok',
      severity: 'critical',
      details: {
        publish_ok: publish?.ok ?? null,
        publish_inflight_ok: allowPublishInFlight === true ? publishInFlightOk : null,
        steps: publish?.steps || [],
      },
    });
  }
  if (!dataPlaneGreen) {
    blockingReasons.push({
      id: 'data_plane_not_green',
      severity: 'critical',
      details: {
        local_data_green: system?.summary?.local_data_green ?? null,
        pipeline_ok: epoch?.pipeline_ok ?? null,
        pipeline_consistency_ok: consistency?.ok ?? null,
        observer_stale: observerFreshness.stale,
      },
    });
  }
  if (!summary && !uiFieldTruthReleaseReady) {
    blockingReasons.push({
      id: 'stock_analyzer_audit_missing',
      severity: 'critical',
      details: null,
    });
  } else if (summary) {
    if (!uiFieldTruthReleaseReady) {
      if (sampledMode) {
        blockingReasons.push({
          id: 'sampled_smoke_mode',
          severity: 'critical',
          details: { live_endpoint_mode: summary.live_endpoint_mode },
        });
      }
      if (!artifactReleaseReady) {
        blockingReasons.push({
          id: 'full_universe_ui_field_truth_missing',
          severity: 'critical',
          details: summary,
        });
      }
      if (auditCriticalIssueCount > 0) {
        blockingReasons.push({
          id: 'ui_field_truth_failures',
          severity: 'critical',
          details: summary,
        });
      }
    }
    if (policyNeutralStructuralGapsOnly) {
      warningReasons.push({
        id: 'policy_neutral_structural_gap',
        severity: 'warning',
        details: {
          policy_neutral_structural_gap_count: summary?.policy_neutral_structural_gap_count ?? 0,
          policy_blocking_failure_family_count: summary?.policy_blocking_failure_family_count ?? 0,
        },
      });
    }
  }
  if (effectiveOperabilitySummary) {
    const targetableGreenRatio = Number(effectiveOperabilitySummary.targetable_green_ratio ?? 0);
    const targetableAssets = Number(effectiveOperabilitySummary.targetable_assets ?? 0);
    const releaseBlocked = effectiveOperabilitySummary.release_blocked === true
      || targetableAssets <= 0
      || targetableGreenRatio < Number(effectiveOperabilitySummary.release_green_threshold ?? 0.90);
    if (releaseBlocked) {
      blockingReasons.push({
        id: 'targetable_universe_operability_below_policy',
        severity: 'critical',
        details: {
          coverage_denominator: effectiveOperabilitySummary.coverage_denominator || null,
          targetable_assets: effectiveOperabilitySummary.targetable_assets ?? null,
          targetable_operational_assets: effectiveOperabilitySummary.targetable_operational_assets ?? null,
          targetable_green_ratio: effectiveOperabilitySummary.targetable_green_ratio ?? null,
          release_green_threshold: effectiveOperabilitySummary.release_green_threshold ?? 0.90,
        },
      });
    }
  }
  if (!stockAnalyzerUiState) {
    blockingReasons.push({
      id: 'stock_analyzer_ui_state_summary_missing',
      severity: 'critical',
      details: null,
    });
  } else {
    const contractViolationTotal = Number(stockAnalyzerUiState.counts?.contract_violation_total ?? 0);
    const missingScopeRows = Number(stockAnalyzerUiState.missing_scope_rows ?? 0);
    const uiStateTarget = normalizeDate(stockAnalyzerUiState.target_market_date);
    if (uiStateTarget && expectedTargetDate && uiStateTarget !== expectedTargetDate) {
      blockingReasons.push({
        id: 'stock_analyzer_ui_state_target_mismatch',
        severity: 'critical',
        details: { expected: expectedTargetDate, actual: uiStateTarget },
      });
    }
    if ((stockAnalyzerUiState.ui_renderable_release_eligible ?? stockAnalyzerUiState.release_eligible) !== true) {
      blockingReasons.push({
        id: contractViolationTotal > 0 || missingScopeRows > 0
          ? 'stock_analyzer_ui_state_contract_failed'
          : 'stock_analyzer_ui_state_degraded',
        severity: 'critical',
        details: {
          ui_operational_ratio: stockAnalyzerUiState.ui_operational_ratio ?? null,
          min_green_ratio: stockAnalyzerUiState.min_green_ratio ?? null,
          missing_scope_rows: stockAnalyzerUiState.missing_scope_rows ?? null,
          contract_violation_total: contractViolationTotal,
          by_reason: stockAnalyzerUiState.counts?.by_reason || null,
        },
      });
    }
  }
  if (!searchRegistrySync) {
    blockingReasons.push({
      id: 'search_registry_sync_missing',
      severity: 'critical',
      details: null,
    });
  } else if (searchRegistrySync.status !== 'PASS') {
    blockingReasons.push({
      id: 'search_registry_sync_failed',
      severity: 'critical',
      details: {
        search_generated_at: searchRegistrySync.search_generated_at || null,
        registry_mtime: searchRegistrySync.registry_mtime || null,
        search_fresh_against_registry: searchRegistrySync.search_fresh_against_registry ?? null,
        out_of_scope_types: searchRegistrySync.outOfScopeTypes ?? null,
        mismatch_count: searchRegistrySync.mismatchCount ?? null,
        page_core_scoped_count_ok: searchRegistrySync.page_core_scoped_count_ok ?? null,
      },
    });
  }
  if (!artifactOnlyAudit && runtimePreflight?.ok === false) {
    blockingReasons.push({
      id: 'runtime_preflight_failed',
      severity: 'critical',
      details: {
        generated_at: runtimePreflight.generated_at || null,
        failure_reasons: runtimePreflight.failure_reasons || [],
        diag_ok: runtimePreflight.diag_ok ?? null,
        canary_ok: runtimePreflight.canary_ok ?? null,
      },
    });
  }
  if (!artifactOnlyAudit) {
    if (!uiFieldTruth) {
      blockingReasons.push({
        id: 'ui_field_truth_report_missing',
        severity: 'critical',
        details: null,
      });
    } else if (!uiFieldTruthReadable) {
      blockingReasons.push({
        id: 'ui_field_truth_report_unreadable',
        severity: 'critical',
        details: { summary_null: true },
      });
    } else if (!uiFieldTruthDateMatch) {
      blockingReasons.push({
        id: 'ui_field_truth_report_stale',
        severity: 'critical',
        details: { expected: expectedTargetDate, actual: normalizeDate(uiFieldTruth.target_market_date) },
      });
    } else if (uiFieldTruthSummary.ui_field_truth_ok !== true) {
      blockingReasons.push({
        id: 'ui_field_truth_report_failed',
        severity: 'critical',
        details: uiFieldTruthSummary,
      });
    }
  }
  if (pageCoreGateRequired && !pageCoreSmokes) {
    blockingReasons.push({
      id: 'page_core_smoke_missing',
      severity: 'critical',
      details: null,
    });
  } else if (pageCoreGateRequired && pageCoreSmokes?.release_eligible !== true) {
    blockingReasons.push({
      id: 'page_core_smoke_failed',
      severity: 'critical',
      details: pageCoreSmokes,
    });
  }

  const decisionBundleHealth = evaluateDecisionBundleHealth(decisionBundle, {
    expectedTargetDate,
    now,
    requiredLeafFailed,
  });
  const strictFullCoverageRatio = strictDecisionCoverageRatio(decisionBundleHealth.summary);
  const decisionPublicGreen = pageCoreGateOk && dataPlaneGreen && strictFullCoverageRatio >= 0.90;
  const signalQuality = signalQualityForCoverage(strictFullCoverageRatio);
  if (strictFullCoverageRatio < 0.90) {
    warningReasons.push(reason('decision_public_coverage_below_90pct', 'warning', {
      strict_full_coverage_ratio: strictFullCoverageRatio,
      required: 0.90,
    }));
  }
  if (decisionBundleHealth.blocking_reasons.length > 0 && decisionPublicGreen) {
    warningReasons.push(reason('decision_internal_not_green', 'warning', {
      status: decisionBundleHealth.status,
      blocking_reasons: decisionBundleHealth.blocking_reasons,
    }));
  } else {
    warningReasons.push(...decisionBundleHealth.blocking_reasons.map((item) => ({
      ...item,
      severity: 'warning',
    })));
  }
  warningReasons.push(...decisionBundleHealth.warnings);
  const histStatus = histProbsStatusSummary(histProbsStatus);
  if (!histStatus.known) {
    warningReasons.push(reason('hist_probs_status_unknown', 'warning', null));
  } else if (!histStatus.green) {
    warningReasons.push(reason('hist_probs_not_release_green', 'warning', {
      hist_probs_mode: histStatus.mode,
      catchup_status: histStatus.catchup_status,
      coverage_ratio: histStatus.coverage_ratio,
      artifact_freshness_ratio: histStatus.artifact_freshness_ratio,
      min_coverage_ratio: histStatus.min_coverage_ratio,
      deferred: histStatus.deferred,
      deferred_remaining_tickers: histStatus.deferred_remaining_tickers,
      hist_probs_write_mode: histStatus.hist_probs_write_mode,
      write_mode_ok: histStatus.write_mode_ok,
    }));
  }
  const systemHistSeverity = String(system?.steps?.hist_probs?.severity || '').toLowerCase();
  if (systemHistSeverity === 'critical') {
    warningReasons.push(reason('hist_probs_system_status_critical', 'warning', {
      summary: system?.steps?.hist_probs?.summary || null,
      why: system?.steps?.hist_probs?.why || null,
      status_detail: system?.steps?.hist_probs?.status_detail || null,
    }));
  }
  const runtimeLiveness = evaluateCrashAndHeartbeat({
    crashSeal,
    heartbeat,
    previousFinal,
    targetMarketDate: expectedTargetDate,
    now,
  });
  const runtimeCrashBlockers = runtimeLiveness.blocking_reasons.filter((item) => {
    if (item.id === 'crash_unresolved' && String(crashSeal?.failed_step || '').toUpperCase() === 'PUBLISH') {
      if (publish?.ok === true || publishInFlightOk) return false;
    }
    return true;
  });
  blockingReasons.push(...runtimeCrashBlockers);
  warningReasons.push(...runtimeLiveness.warnings);

  const zeroBuyAnomaly = evaluateZeroBuyAnomaly(decisionBundleHealth.summary, regimeDoc);
  if (zeroBuyAnomaly === 'DEGRADED') {
    warningReasons.push(reason('zero_buy_anomaly', 'warning', {
      buy_count: decisionBundleHealth.summary?.buy_count ?? 0,
      market_regime: regimeDoc?.market_regime || null,
      strict_full_coverage_ratio: decisionBundleHealth.summary?.strict_full_coverage_ratio ?? null,
    }));
  }

  const uniqueBlockingReasons = [];
  const seen = new Set();
  for (const reason of blockingReasons) {
    const key = `${reason.id}:${JSON.stringify(reason.details || null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueBlockingReasons.push(reason);
  }
  const dedupedWarningReasons = [];
  const seenWarnings = new Set();
  for (const item of warningReasons) {
    const key = `${item.id}:${JSON.stringify(item.details || null)}`;
    if (seenWarnings.has(key)) continue;
    seenWarnings.add(key);
    dedupedWarningReasons.push(item);
  }
  const advisoryReasons = [];
  const uniqueWarningReasons = [];
  for (const item of dedupedWarningReasons) {
    if (ADVISORY_ONLY_WARNING_IDS.has(String(item?.id || ''))) advisoryReasons.push(item);
    else uniqueWarningReasons.push(item);
  }

  const coreReleaseReady = uniqueBlockingReasons.length === 0;
  const pageCoreReady = pageCoreGateOk && uiFieldTruthOk;
  const searchReady = searchRegistrySync?.status === 'PASS';
  const universeReady = Boolean(summary && !sampledMode && artifactReleaseReady && auditCriticalIssueCount === 0);
  const decisionReady = decisionPublicGreen && decisionBundleHealth.status === 'OK';
  const riskReady = decisionReady;
  const histReady = histStatus.green;
  const breakoutReady = null;
  const releaseGate = buildReleaseGateModel({
    coreReleaseReady,
    pageCoreReady,
    searchReady,
    universeReady,
    stockUiState: stockAnalyzerUiState,
    stockUiReleaseEligible: (stockAnalyzerUiState?.ui_renderable_release_eligible ?? stockAnalyzerUiState?.release_eligible) === true,
    histReady,
  });
  const overallUiReady = releaseGate.release_ui_ready;
  const mergedBlockingReasons = [...uniqueBlockingReasons, ...releaseGate.blocking_reasons];
  const mergedWarningReasons = [...uniqueWarningReasons, ...releaseGate.warning_reasons];
  const status = !overallUiReady ? 'FAILED' : mergedWarningReasons.length === 0 ? 'OK' : 'DEGRADED';
  const uiGreen = overallUiReady;
  const leadBlockerStep = deriveLeadBlockerStep(mergedBlockingReasons, recovery);
  const nextStep = deriveNextStep({
    leadBlockerStep,
    recovery,
    blockingReasons: mergedBlockingReasons,
  });
  return {
    schema: 'rv.final_integrity_seal.v1',
    ...buildArtifactEnvelope({
      producer: 'scripts/ops/final-integrity-seal.mjs',
      runId: runId || runtime?.run_id || release?.run_id || system?.run_id || null,
      targetMarketDate: expectedTargetDate,
      upstreamRunIds: collectUpstreamRunIds(system, runtime, epoch, recovery, release, publish, stockAnalyzerAudit, decisionBundle, crashSeal),
    }),
    phase: phase || release?.phase || null,
    status,
    ui_green: uiGreen,
    global_green: uiGreen,
    release_ready: releaseGate.deploy_allowed,
    core_release_ready: coreReleaseReady,
    page_core_ready: pageCoreReady,
    search_ready: searchReady,
    universe_ready: universeReady,
    decision_ready: decisionReady,
    risk_ready: riskReady,
    hist_ready: histReady,
    hist_release_blocking: false,
    breakout_ready: breakoutReady,
    overall_ui_ready: overallUiReady,
    release_gate: releaseGate,
    full_universe_validated: artifactFullValidated,
    policy_neutral_structural_gaps_only: policyNeutralStructuralGapsOnly,
    ui_field_truth_ok: uiFieldTruthOk,
    page_core_gate_required: pageCoreGateRequired,
    page_core_gate_ok: pageCoreGateOk,
    sampled_mode: sampledMode,
    stock_analyzer_operability: effectiveOperabilitySummary,
    stock_analyzer_ui_state: stockAnalyzerUiState,
    search_registry_sync: searchRegistrySync,
    allowed_launchd_only: launchdOk,
    lock_integrity_ok: lockIntegrityOk,
    storage_ok: storageOk,
    nas_ok: nasOk,
    nas_reachable: nasReachable,
    nas_required_for_release: nasRequiredForRelease,
    calendar_ok: calendarOk,
    data_plane_green: dataPlaneGreen,
    decision_internal_green: decisionBundleHealth.status === 'OK',
    decision_public_green: decisionPublicGreen,
    decision_public_coverage_ratio: strictFullCoverageRatio,
    signal_quality: signalQuality,
    hist_probs_green: histStatus.green,
    hist_probs_mode: histStatus.mode,
    catchup_status: histStatus.catchup_status,
    retry_remaining: histStatus.retry_remaining,
    tier_a_count: histStatus.tier_a_count,
    tier_b_pending: histStatus.tier_b_pending,
    freshness_budget_days: histStatus.freshness_budget_days,
    hist_probs_coverage_ratio: histStatus.coverage_ratio,
    observer_stale: observerFreshness.stale,
    observer_generated_at: observerFreshness.generated_at,
    observer_inputs: observerFreshness.inputs,
    lead_blocker_step: leadBlockerStep,
    next_step: nextStep,
    runtime_preflight_ok: artifactOnlyAudit ? null : runtimePreflight?.ok === true,
    runtime_preflight_ref: 'public/data/ops/runtime-preflight-latest.json',
    control_plane: consistency,
    pipeline_consistency: consistency,
    module_dates: moduleDates,
    blocking_reasons: mergedBlockingReasons,
    warnings: mergedWarningReasons,
    advisories: advisoryReasons,
    decision_bundle: {
      status: decisionBundleHealth.status,
      snapshot_id: decisionBundle?.snapshot_id || null,
      target_market_date: decisionBundle?.target_market_date || null,
      summary: decisionBundleHealth.summary,
    },
    zero_buy_anomaly_status: zeroBuyAnomaly,
    leaf_seals: evaluateRequiredLeafSeals().details,
    runtime_liveness: runtimeLiveness,
    stock_analyzer_universe_audit: summary,
    runtime_preflight: runtimePreflight
      ? {
          ok: runtimePreflight.ok === true,
          generated_at: runtimePreflight.generated_at || null,
          failure_reasons: Array.isArray(runtimePreflight.failure_reasons) ? runtimePreflight.failure_reasons : [],
        }
      : null,
    ui_field_truth_report: uiFieldTruthSummary,
    page_core_smokes: pageCoreSmokes,
    launchd,
    storage,
  };
}

export function writeFinalIntegritySeal(payload) {
  const guard = assertMayWriteProductionTruth({ job: 'final-integrity-seal' });
  if (!guard.ok) {
    throw new Error(`PROD_RUNTIME_BLOCKED:${guard.failures.join(',')}`);
  }
  writeJsonAtomic(FINAL_INTEGRITY_SEAL_PATH, payload);
  return payload;
}

export function writePipelineIncidents({
  phase = null,
  topBlocker = null,
  blockers = [],
  launchd = null,
  storage = null,
  targetMarketDate = null,
  runId = null,
  release = null,
} = {}) {
  const payload = {
    schema: 'rv.pipeline_incidents.v1',
    ...buildArtifactEnvelope({
      producer: 'scripts/ops/final-integrity-seal.mjs',
      runId,
      targetMarketDate,
      upstreamRunIds: collectUpstreamRunIds(release),
    }),
    phase,
    top_blocker: topBlocker || blockers?.[0] || null,
    blocker_count: Array.isArray(blockers) ? blockers.length : 0,
    blockers: blockers || [],
    launchd,
    storage,
    release_phase: release?.phase || null,
  };
  writeJsonAtomic(PIPELINE_INCIDENTS_PATH, payload);
  return payload;
}

export function readFinalIntegritySeal() {
  return readJson(FINAL_INTEGRITY_SEAL_PATH);
}

function parseArgs(argv) {
  return {
    allowPublishInFlight: argv.includes('--allow-publish-inflight'),
    allowUnready: argv.includes('--allow-unready'),
    phase: argv.find((arg) => arg.startsWith('--phase='))?.split('=')[1] || null,
    targetMarketDate: normalizeDate(argv.find((arg) => arg.startsWith('--target-market-date='))?.split('=')[1] || null),
    runId: String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null,
  };
}

function resolvePhase(release, runtime, _system, fallback = null) {
  return fallback || release?.phase || runtime?.phase || null;
}

function readTextMaybe(filePath) {
  if (!filePath) return null;
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch {
    return null;
  }
}

function attachSealSignature(seal) {
  let privateKeyPem = process.env.RV_FINAL_SEAL_PRIVATE_KEY_PEM || readTextMaybe(process.env.RV_FINAL_SEAL_PRIVATE_KEY_PATH);
  let keyId = process.env.RV_FINAL_SEAL_KEY_ID || null;
  if (!privateKeyPem) {
    const runtime = resolveRuntimeConfig({ ensureRuntimeDirs: true });
    const ensured = ensureSealKeyPair({
      privateKeyPath: runtime.finalSealPrivateKeyPath,
      publicKeyPath: runtime.finalSealPublicKeyPath,
    });
    privateKeyPem = ensured.privateKeyPem;
    keyId ||= ensured.keyId;
  }
  const signing = signSealPayload(seal, { privateKeyPem, keyId });
  if (!signing.signature || !signing.key_id) {
    return {
      ...seal,
      status: 'FAILED',
      release_ready: false,
      ui_green: false,
      global_green: false,
      blocking_reasons: [
        ...(Array.isArray(seal.blocking_reasons) ? seal.blocking_reasons : []),
        {
          id: 'seal_signature_missing',
          severity: 'critical',
          details: null,
        },
      ],
    };
  }
  return {
    ...seal,
    ...signing,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const system = readJson(PATHS.system) || null;
  const runtime = readJson(PATHS.runtime) || null;
  const epoch = readJson(PATHS.epoch) || null;
  const recovery = readJson(PATHS.recovery) || null;
  const release = readJson(PATHS.release) || null;
  const publish = readJson(PATHS.publish) || null;
  const runtimePreflight = readJson(PATHS.runtimePreflight) || null;
  const stockAnalyzerAudit = readJson(PATHS.stockAudit) || null;
  const stockAnalyzerOperability = readJson(PATHS.stockOperability) || null;
  const stockAnalyzerUiState = readJson(PATHS.stockUiState) || null;
  const searchRegistrySync = readJson(PATHS.searchRegistrySync) || null;
  const uiFieldTruth = readJson(PATHS.uiFieldTruth) || null;
  const launchd = readJson(PATHS.launchd) || null;
  const storage = readJson(PATHS.storage) || null;
  const decisionBundle = readJson(PATHS.decisionBundle) || readJson(PATHS.decisionBundleOps) || null;
  const histProbsStatus = readJson(PATHS.histProbsStatus) || readJson(PATHS.histProbsStatusLegacy) || null;
  const heartbeat = readJson(PATHS.heartbeat) || null;
  const crashSeal = readJson(PATHS.crashSeal) || null;
  const previousFinal = readJson(FINAL_INTEGRITY_SEAL_PATH) || null;
  const releaseTargetMarketDate = resolveReleaseTargetMarketDate(release, {
    trackLegacyRead: true,
    readerId: 'scripts/ops/final-integrity-seal.mjs',
  });
  const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
  const runtimeTargetMarketDate = normalizeDate(runtime?.target_market_date);
  const epochTargetMarketDate = normalizeDate(epoch?.target_market_date);
  const systemTargetMarketDate = normalizeDate(system?.summary?.target_market_date);
  const calendarFallbackTarget = latestUsMarketSessionIso(new Date());
  const targetMarketDate = options.targetMarketDate
    || forcedTargetMarketDate
    || normalizeDate(releaseTargetMarketDate)
    || runtimeTargetMarketDate
    || epochTargetMarketDate
    || systemTargetMarketDate
    || calendarFallbackTarget;
  const enforceCalendarTarget = !(
    options.targetMarketDate
    || forcedTargetMarketDate
    || normalizeDate(releaseTargetMarketDate)
    || runtimeTargetMarketDate
    || epochTargetMarketDate
    || systemTargetMarketDate
  );

  const unsignedSeal = buildFinalIntegritySeal({
    runId: options.runId || release?.run_id || runtime?.run_id || system?.run_id || null,
    targetMarketDate,
    enforceCalendarTarget,
    phase: resolvePhase(release, runtime, system, options.phase),
    system,
    runtime,
    epoch,
    recovery,
    release,
    publish,
    runtimePreflight,
    stockAnalyzerAudit,
    stockAnalyzerOperability,
    stockAnalyzerUiState,
    searchRegistrySync,
    uiFieldTruth,
    launchd,
    storage,
    decisionBundle,
    histProbsStatus,
    heartbeat,
    crashSeal,
    previousFinal,
    lockIntegrityOk: release?.lock_integrity_ok !== false,
    allowPublishInFlight: options.allowPublishInFlight,
    now: new Date(),
  });
  const seal = attachSealSignature(unsignedSeal);
  writeFinalIntegritySeal(seal);
  writePipelineIncidents({
    phase: seal.phase,
    topBlocker: seal.blocking_reasons?.[0] || null,
    blockers: seal.blocking_reasons || [],
    launchd,
    storage,
    targetMarketDate: seal.target_market_date,
    runId: seal.run_id,
    release,
  });
	  process.stdout.write(`${JSON.stringify({
	    ok: seal.release_ready === true,
	    status: seal.status || null,
	    target_market_date: seal.target_market_date,
	    blocker_count: Array.isArray(seal.blocking_reasons) ? seal.blocking_reasons.length : 0,
	    warning_count: Array.isArray(seal.warnings) ? seal.warnings.length : 0,
	  })}\n`);
  if (!options.allowUnready && seal.release_ready !== true) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
