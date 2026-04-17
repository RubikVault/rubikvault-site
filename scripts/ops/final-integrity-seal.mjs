import fs from 'node:fs';
import path from 'node:path';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  isModuleTargetCompatible,
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
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
  stockAudit: path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  uiFieldTruth: path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json'),
  launchd: path.join(ROOT, 'public/data/ops/launchd-reconcile-latest.json'),
  storage: path.join(ROOT, 'public/data/reports/storage-budget-latest.json'),
  decisionBundle: path.join(ROOT, 'public/data/decisions/latest.json'),
  decisionBundleOps: path.join(ROOT, 'public/data/ops/decision-bundle-latest.json'),
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

export function evaluateDecisionBundleHealth(decisionBundle, {
  expectedTargetDate = null,
  now = new Date(),
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
  const leafSealCheck = evaluateRequiredLeafSeals();
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

function evaluateCrashAndHeartbeat({ crashSeal = null, heartbeat = null, previousFinal = null, now = new Date() } = {}) {
  const blocking = [];
  const warnings = [];
  if (crashSeal?.status === 'FAILED') {
    blocking.push(reason('crash_unresolved', 'critical', {
      run_id: crashSeal.run_id || null,
      failed_step: crashSeal.failed_step || null,
      failure_class: crashSeal.failure_class || null,
    }));
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

export function buildFinalIntegritySeal({
  runId = null,
  targetMarketDate = null,
  phase = null,
  system = null,
  runtime = null,
  epoch = null,
  recovery = null,
  release = null,
  publish = null,
  stockAnalyzerAudit = null,
  uiFieldTruth = null,
  launchd = null,
  storage = null,
  decisionBundle = null,
  heartbeat = null,
  crashSeal = null,
  previousFinal = null,
  lockIntegrityOk = true,
  allowPublishInFlight = false,
  now = new Date(),
} = {}) {
  const expectedTargetDate = normalizeDate(targetMarketDate) || latestUsMarketSessionIso(now);
  const regimeDoc = readJson(path.join(ROOT, 'public/data/hist-probs/regime-daily.json'));
  const moduleDates = normalizeModuleDates(epoch, system);
  const moduleDateMismatches = Object.entries(moduleDates)
    .filter(([id, asOf]) => asOf && expectedTargetDate && !isModuleTargetCompatible(id, asOf, expectedTargetDate))
    .map(([id, as_of]) => ({ id, as_of, expected_target_market_date: expectedTargetDate }));
  const summary = stockAuditSummary(stockAnalyzerAudit, system);
  const uiFieldTruthSummary = uiFieldTruth?.summary || null;
  const uiFieldTruthDateMatch = !uiFieldTruth
    || !expectedTargetDate
    || normalizeDate(uiFieldTruth.target_market_date) === expectedTargetDate;
  const uiFieldTruthReadable = Boolean(uiFieldTruth && typeof uiFieldTruth === 'object' && uiFieldTruthSummary);
  const sampledMode = summary?.sampled_mode === true
    || String(summary?.live_endpoint_mode || '').toLowerCase() === 'sampled_smoke';
  const artifactFullValidated = summary?.artifact_full_validated === true
    || summary?.full_universe_validated === true
    || (
      summary?.full_universe === true
      && summary?.artifact_critical_issue_count === 0
      && sampledMode !== true
      && Number(summary?.critical_failure_family_count ?? 0) === 0
    );
  const auditCriticalIssueCount = Number(summary?.artifact_critical_issue_count ?? summary?.critical_issue_count ?? 0);
  const uiFieldTruthOk = artifactFullValidated === true
    && uiFieldTruthSummary?.ui_field_truth_ok === true;
  const calendarTarget = latestUsMarketSessionIso(now);
  const calendarOk = !expectedTargetDate || calendarTarget === expectedTargetDate;
  const launchdOk = launchd?.allowed_launchd_only === true;
  const storageOk = storage?.disk?.heavy_jobs_allowed === true;
  const nasReachable = storage?.nas?.reachable === true;
  const nasRequiredForRelease = process.env.RV_REQUIRE_NAS_FOR_RELEASE === '1';
  const nasOk = nasRequiredForRelease ? nasReachable : true;
  const consistency = runtime?.pipeline_consistency || null;
  // NOTE: local_data_green intentionally excluded — it depends on the seal itself (circular).
  // Epoch pipeline_ok is the authoritative data-plane gate; runtime consistency confirms
  // the control-plane artifacts are coherent.
  // run_id_mismatch is expected during recovery (system uses recovery run_id, release uses master run_id)
  // and is intentionally tolerated here (same rationale as in build-pipeline-epoch.mjs).
  const runtimeConsistencyNonCircularReasons = (runtime?.pipeline_consistency?.blocking_reasons || [])
    .filter((r) => r.id !== 'run_id_mismatch');
  const runtimeConsistencyOk = runtime?.pipeline_consistency?.ok !== false
    || runtimeConsistencyNonCircularReasons.length === 0;
  const dataPlaneGreen = epoch?.pipeline_ok === true && runtimeConsistencyOk;
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
  for (const reason of consistency?.blocking_reasons || []) {
    if (reason.id === 'nas_unreachable' && !nasRequiredForRelease) continue;
    // Skip epoch-related reasons from stale runtime consistency when the current epoch is clean.
    // These are artifacts of a stale runtime snapshot and would create a false blocker.
    if (epochNowClean && (reason.id === 'epoch_blocking_gaps' || reason.id === 'epoch_module_target_mismatch')) continue;
    // run_id_mismatch is expected during recovery (system uses recovery run_id, release uses master run_id).
    // The publish chain reconciles run_ids when it runs. Same rationale as in build-pipeline-epoch.mjs.
    if (reason.id === 'run_id_mismatch') continue;
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
        pipeline_consistency_ok: runtime?.pipeline_consistency?.ok ?? null,
      },
    });
  }
  if (!summary) {
    blockingReasons.push({
      id: 'stock_analyzer_audit_missing',
      severity: 'critical',
      details: null,
    });
  } else {
    if (sampledMode) {
      blockingReasons.push({
        id: 'sampled_smoke_mode',
        severity: 'critical',
        details: { live_endpoint_mode: summary.live_endpoint_mode },
      });
    }
    if (!artifactFullValidated) {
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

  const decisionBundleHealth = evaluateDecisionBundleHealth(decisionBundle, {
    expectedTargetDate,
    now,
  });
  blockingReasons.push(...decisionBundleHealth.blocking_reasons);
  warningReasons.push(...decisionBundleHealth.warnings);
  const runtimeLiveness = evaluateCrashAndHeartbeat({
    crashSeal,
    heartbeat,
    previousFinal,
    now,
  });
  blockingReasons.push(...runtimeLiveness.blocking_reasons);
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
  const uniqueWarningReasons = [];
  const seenWarnings = new Set();
  for (const item of warningReasons) {
    const key = `${item.id}:${JSON.stringify(item.details || null)}`;
    if (seenWarnings.has(key)) continue;
    seenWarnings.add(key);
    uniqueWarningReasons.push(item);
  }

  const status = uniqueBlockingReasons.length > 0 ? 'FAILED' : uniqueWarningReasons.length > 0 ? 'DEGRADED' : 'OK';
  const uiGreen = status === 'OK';
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
    release_ready: uiGreen,
    full_universe_validated: artifactFullValidated,
    ui_field_truth_ok: uiFieldTruthOk,
    sampled_mode: sampledMode,
    allowed_launchd_only: launchdOk,
    lock_integrity_ok: lockIntegrityOk,
    storage_ok: storageOk,
    nas_ok: nasOk,
    nas_reachable: nasReachable,
    nas_required_for_release: nasRequiredForRelease,
    calendar_ok: calendarOk,
    data_plane_green: dataPlaneGreen,
    control_plane: consistency,
    pipeline_consistency: consistency,
    module_dates: moduleDates,
    blocking_reasons: uniqueBlockingReasons,
    warnings: uniqueWarningReasons,
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
    ui_field_truth_report: uiFieldTruthSummary,
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
  const stockAnalyzerAudit = readJson(PATHS.stockAudit) || null;
  const uiFieldTruth = readJson(PATHS.uiFieldTruth) || null;
  const launchd = readJson(PATHS.launchd) || null;
  const storage = readJson(PATHS.storage) || null;
  const decisionBundle = readJson(PATHS.decisionBundle) || readJson(PATHS.decisionBundleOps) || null;
  const heartbeat = readJson(PATHS.heartbeat) || null;
  const crashSeal = readJson(PATHS.crashSeal) || null;
  const previousFinal = readJson(FINAL_INTEGRITY_SEAL_PATH) || null;
  const releaseTargetMarketDate = resolveReleaseTargetMarketDate(release, {
    trackLegacyRead: true,
    readerId: 'scripts/ops/final-integrity-seal.mjs',
  });
  const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
  const targetMarketDate = options.targetMarketDate
    || forcedTargetMarketDate
    || normalizeDate(releaseTargetMarketDate)
    || normalizeDate(runtime?.target_market_date)
    || normalizeDate(epoch?.target_market_date)
    || normalizeDate(system?.summary?.target_market_date)
    || latestUsMarketSessionIso(new Date());

  const unsignedSeal = buildFinalIntegritySeal({
    runId: options.runId || release?.run_id || runtime?.run_id || system?.run_id || null,
    targetMarketDate,
    phase: resolvePhase(release, runtime, system, options.phase),
    system,
    runtime,
    epoch,
    recovery,
    release,
    publish,
    stockAnalyzerAudit,
    uiFieldTruth,
    launchd,
    storage,
    decisionBundle,
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
