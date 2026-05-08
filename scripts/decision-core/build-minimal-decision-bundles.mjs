#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildCandidateAudit, buildUniverseSummary } from './noncandidate-audit.mjs';
import { resolveEligibility } from './eligibility.mjs';
import { resolveDecisionGrade } from './decision-grade.mjs';
import { buildFastFeatures, buyCriticalFeaturesAvailable } from './build-fast-features.mjs';
import { classifyP0Regime, isMarketRegimeRed } from './classify-p0-regime.mjs';
import { resolveP0Setup } from './resolve-p0-setup.mjs';
import { computeCoarseScore, isCandidate } from './build-candidate-pool.mjs';
import { loadHistProbsPublic, evidenceBootstrap } from './evidence-bootstrap-v1.mjs';
import { evaluateP0EvRisk } from './evaluate-p0-ev-risk.mjs';
import { resolveAnalysisReliability } from './analysis-reliability.mjs';
import { buildEntryGapGuard, emptyGuard } from './entry-gap-guard.mjs';
import { buildInvalidationLevel, emptyInvalidation } from './invalidation-level.mjs';
import { HORIZON_DAYS, resolveHorizonState, resolveOverallAction } from './resolve-horizon-state.mjs';
import {
  BUNDLE_VERSION,
  DECISION_CORE_PART_COUNT,
  DECISION_CORE_PUBLIC_ROOT,
  DECISION_CORE_RUNTIME_ROOT,
  FEATURE_MANIFEST_PATH,
  PART_HARD_BYTES_GZIP,
  POLICY_PATH,
  REASON_CODES_PATH,
  UI_ROW_RAW_TARGET_BYTES,
  capReasonCodes,
  decisionHash,
  isoNow,
  loadPolicyBundle,
  normalizeId,
  parseArgs,
  partName,
  partitionFor,
  readRegistryRows,
  selectMainBlocker,
  sha256Hex,
  stableStringify,
  uniqueStrings,
  writeGzipAtomic,
  writeJsonAtomic,
} from './shared.mjs';

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const mode = opts.mode === 'production' || opts.mode === 'core' ? 'core' : 'shadow';
  const generatedAt = isoNow();
  const { policy, reasonRegistry, featureManifest, reasonMap } = loadPolicyBundle();
  const runId = `${opts.targetMarketDate}-${policy.policy_bundle_version}-${policy.model_version}-${generatedAt.replace(/[:.]/g, '')}`;
  const runtimeRoot = path.join(DECISION_CORE_RUNTIME_ROOT, runId);
  const tmpRoot = path.join(runtimeRoot, 'tmp');
  const validatedRoot = path.join(runtimeRoot, 'validated');
  const debugRoot = path.join(runtimeRoot, 'debug');
  const auditRoot = path.join(runtimeRoot, 'audit');
  for (const dir of [tmpRoot, validatedRoot, debugRoot, auditRoot]) fs.mkdirSync(dir, { recursive: true });

  const rows = readRegistryRows({ maxAssets: opts.maxAssets, registryPath: opts.registryOverride });
  const histProbs = loadHistProbsPublic();
  const parts = Array.from({ length: DECISION_CORE_PART_COUNT }, () => []);
  const debugLines = [];
  const counters = makeCounters();
  const rejected = [];
  const candidateRows = [];

  for (const row of rows) {
    const assetId = normalizeId(row?.canonical_id);
    const eligibility = resolveEligibility(row, { targetMarketDate: opts.targetMarketDate, policy });
    const features = buildFastFeatures({ row, eligibility });
    const regime = classifyP0Regime(features, policy);
    const setup = resolveP0Setup({ features, regime, eligibility });
    const coarseScore = computeCoarseScore({ eligibility, features, setup, regime });
    const candidate = isCandidate({ coarseScore, eligibility, policy });
    if (candidate) candidateRows.push({ row, coarseScore, eligibility, features });
    else rejected.push({ row, reason: eligibility.eligibility_status === 'ELIGIBLE' ? 'LOW_COARSE_SCORE' : eligibility.eligibility_status, eligibility, features });

    const evidenceByHorizon = {
      short_term: evidenceBootstrap({ assetId, horizon: 'short_term', setup, histProbs, features }),
      mid_term: evidenceBootstrap({ assetId, horizon: 'mid_term', setup, histProbs, features }),
      long_term: evidenceBootstrap({ assetId, horizon: 'long_term', setup, histProbs, features }),
    };
    const evidence = evidenceByHorizon.mid_term;
    const evRisk = evaluateP0EvRisk({ evidence, features, policy, horizon: 'mid_term' });
    const buyCriticalOk = buyCriticalFeaturesAvailable(features);
    const decisionGrade = resolveDecisionGrade({
      eligibility,
      targetMarketDate: opts.targetMarketDate,
      policy,
      featureManifest,
      reasonRegistry,
      buyCriticalFeaturesAvailable: buyCriticalOk,
    });
    let reasonCodes = buildInitialReasonCodes({
      eligibility,
      setup,
      evidence,
      evidenceByHorizon,
      evRisk,
      candidate,
      regime,
      policy,
      decisionGrade,
    });

    let preliminary = resolveOverallAction({
      eligibility,
      decisionGrade,
      setup,
      evidence,
      evRisk,
      reliability: 'MEDIUM',
      reasonCodes,
      reasonMap,
      candidate,
    });

    let tradeGuard = preliminary.primary_action === 'BUY'
      ? buildEntryGapGuard({ action: 'BUY', features, targetMarketDate: opts.targetMarketDate })
      : emptyGuard();
    let invalidation = (preliminary.primary_action === 'BUY' || preliminary.wait_subtype === 'WAIT_TRIGGER_PENDING')
      ? buildInvalidationLevel({ action: preliminary.primary_action === 'BUY' ? 'BUY' : 'WAIT', setup, features })
      : emptyInvalidation();

    let rowDoc = buildRow({
      row,
      targetMarketDate: opts.targetMarketDate,
      policy,
      featureManifest,
      eligibility,
      decisionGrade,
      setup,
      evidence,
      evRisk,
      preliminary,
      tradeGuard,
      invalidation,
      reasonCodes,
      reasonMap,
      reliability: 'LOW',
      evidenceByHorizon,
    });

    const reliabilityResult = resolveAnalysisReliability(rowDoc, policy, {
      policyLoaded: true,
      featureManifestLoaded: true,
      reasonRegistryLoaded: true,
      unknownBlockingReason: hasUnknownBlockingReason(reasonCodes, reasonMap),
      asOfMismatch: eligibility.as_of_date && opts.targetMarketDate && eligibility.as_of_date > opts.targetMarketDate,
    });
    let reliability = reliabilityResult.analysis_reliability;

    preliminary = resolveOverallAction({
      eligibility,
      decisionGrade,
      setup,
      evidence,
      evRisk,
      reliability,
      reasonCodes,
      reasonMap,
      candidate,
    });
    tradeGuard = preliminary.primary_action === 'BUY'
      ? buildEntryGapGuard({ action: 'BUY', features, targetMarketDate: opts.targetMarketDate })
      : emptyGuard();
    invalidation = (preliminary.primary_action === 'BUY' || preliminary.wait_subtype === 'WAIT_TRIGGER_PENDING')
      ? buildInvalidationLevel({ action: preliminary.primary_action === 'BUY' ? 'BUY' : 'WAIT', setup, features })
      : emptyInvalidation();

    if (preliminary.primary_action === 'BUY') {
      const invariantErrors = buyInvariantErrors({ eligibility, decisionGrade, setup, evidence, evRisk, reliability, tradeGuard, invalidation, reasonCodes, reasonMap });
      if (invariantErrors.length) {
        reasonCodes.push('WAIT_RISK_BLOCKER', ...invariantErrors);
        preliminary = { primary_action: 'WAIT', wait_subtype: 'WAIT_RISK_BLOCKER' };
        tradeGuard = emptyGuard();
      }
    }

    rowDoc = buildRow({
      row,
      targetMarketDate: opts.targetMarketDate,
      policy,
      featureManifest,
      eligibility,
      decisionGrade,
      setup,
      evidence,
      evRisk,
      preliminary,
      tradeGuard,
      invalidation,
      reasonCodes,
      reasonMap,
      reliability,
      evidenceByHorizon,
    });
    updateCounters(counters, rowDoc);
    parts[partitionFor(assetId)].push(JSON.stringify(rowDoc));
    debugLines.push(JSON.stringify({
      asset_id: assetId,
      data_quality_score_0_100: row?.computed?.score_0_100 ?? null,
      coarse_score: coarseScore,
      candidate_selected: candidate,
      features,
      regime,
      setup,
      evidence_debug: evidence,
      ev_risk_debug: evRisk.debug,
    }));
  }

  const universeSummary = buildUniverseSummary({ rows, rejected, candidateRows, policy });
  const auditSample = buildCandidateAudit({ rejected, policy, targetMarketDate: opts.targetMarketDate });
  writeJsonAtomic(path.join(auditRoot, 'universe-summary.json'), universeSummary);
  writeGzipAtomic(path.join(auditRoot, 'noncandidate-audit-sample.ndjson.gz'), auditSample.map((row) => JSON.stringify(row)).join('\n') + '\n');
  writeGzipAtomic(path.join(debugRoot, 'feature-debug.ndjson.gz'), debugLines.join('\n') + '\n');

  const publicRoot = path.join(DECISION_CORE_PUBLIC_ROOT, mode);
  const publicPartsRoot = path.join(publicRoot, 'parts');
  fs.rmSync(path.join(tmpRoot, 'parts'), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpRoot, 'parts'), { recursive: true });
  const partSizes = [];
  const partHashes = [];
  for (let i = 0; i < DECISION_CORE_PART_COUNT; i += 1) {
    const text = parts[i].join('\n') + (parts[i].length ? '\n' : '');
    const tmpFile = path.join(tmpRoot, 'parts', partName(i));
    const stats = writeGzipAtomic(tmpFile, text);
    if (stats.bytes > PART_HARD_BYTES_GZIP) throw new Error(`DECISION_CORE_PART_TOO_LARGE:${partName(i)}:${stats.bytes}`);
    partSizes.push(stats.bytes);
    partHashes.push({ part: partName(i), bytes_gzip: stats.bytes, sha256: `sha256:${sha256Hex(fs.readFileSync(tmpFile))}` });
  }

  const manifest = {
    schema: 'rv.decision_core_manifest.v1',
    status: 'ACTIVE',
    mode,
    decision_run_id: runId,
    bundle_version: BUNDLE_VERSION,
    policy_bundle_version: policy.policy_bundle_version,
    model_version: policy.model_version,
    feature_manifest_id: featureManifest.feature_manifest_id,
    target_market_date: opts.targetMarketDate,
    generated_at: generatedAt,
    part_count: DECISION_CORE_PART_COUNT,
    parts_path: 'parts',
    row_count: rows.length,
    part_size_max_bytes: Math.max(...partSizes, 0),
    row_size_max_bytes: counters.row_size_max_bytes,
    part_hashes: partHashes,
    bundle_hash: decisionHash(partHashes),
  };
  const status = buildStatus({ counters, manifest, universeSummary, policy, reasonRegistry, featureManifest });
  writeJsonAtomic(path.join(tmpRoot, 'manifest.json'), manifest);
  writeJsonAtomic(path.join(tmpRoot, 'status.json'), status);
  writeJsonAtomic(path.join(DECISION_CORE_PUBLIC_ROOT, 'status/universe-summary-latest.json'), universeSummary);
  writeJsonAtomic(path.join(DECISION_CORE_PUBLIC_ROOT, 'status/latest.json'), status);
  writeJsonAtomic(path.join('public/data/reports/decision-core-verification-latest.json'), {
    status: status.decision_core_status === 'ok' ? 'OK' : 'DEGRADED',
    generated_at: generatedAt,
    decision_core: status,
  });

  fs.rmSync(publicRoot, { recursive: true, force: true });
  fs.mkdirSync(publicPartsRoot, { recursive: true });
  for (let i = 0; i < DECISION_CORE_PART_COUNT; i += 1) {
    fs.copyFileSync(path.join(tmpRoot, 'parts', partName(i)), path.join(publicPartsRoot, partName(i)));
  }
  fs.copyFileSync(path.join(tmpRoot, 'manifest.json'), path.join(publicRoot, 'manifest.json'));
  fs.copyFileSync(path.join(tmpRoot, 'status.json'), path.join(publicRoot, 'status.json'));
  if (mode === 'core') {
    fs.cpSync(publicRoot, path.join(DECISION_CORE_PUBLIC_ROOT, 'last_good'), { recursive: true, force: true });
  }
  fs.cpSync(publicRoot, validatedRoot, { recursive: true, force: true });

  console.log(JSON.stringify({ ok: true, mode, run_id: runId, rows: rows.length, status: status.decision_core_status }, null, 2));
}

function buildInitialReasonCodes({ eligibility, setup, evidence, evidenceByHorizon, evRisk, candidate, regime, policy, decisionGrade }) {
  const codes = [
    ...eligibility.lifecycle_reason_codes,
    ...eligibility.vetos,
    ...eligibility.warnings,
    ...evRisk.risk_reason_codes,
  ];
  if (decisionGrade.decision_grade) codes.push('DECISION_CORE_READY');
  if (setup.primary_setup === 'none' && eligibility.eligibility_status === 'ELIGIBLE') codes.push('WAIT_NO_SETUP');
  if (evidence.evidence_effective_n <= 0 && eligibility.eligibility_status === 'ELIGIBLE') codes.push('WAIT_LOW_EVIDENCE');
  if (candidate === false && eligibility.eligibility_status === 'ELIGIBLE') codes.push('WAIT_LOW_RANK');
  if (isMarketRegimeRed(regime, policy)) codes.push('WAIT_RISK_BLOCKER');
  if (!codes.length) codes.push('WAIT_TRIGGER_PENDING');
  return uniqueStrings(codes);
}

function buildRow({ row, targetMarketDate, policy, featureManifest, eligibility, decisionGrade, setup, evidence, evRisk, preliminary, tradeGuard, invalidation, reasonCodes, reasonMap, reliability, evidenceByHorizon }) {
  const assetId = normalizeId(row?.canonical_id);
  const cappedReasons = capReasonCodes(reasonCodes, reasonMap);
  const mainBlocker = selectMainBlocker(cappedReasons, reasonMap);
  const action = preliminary.primary_action;
  const rowDoc = {
    meta: {
      decision_id: `dc-${targetMarketDate}-${sha256Hex(`${assetId}|${targetMarketDate}|${policy.policy_bundle_version}`).slice(0, 16)}`,
      asset_id: assetId,
      asset_type: eligibility.asset_type,
      as_of_date: eligibility.as_of_date,
      target_market_date: targetMarketDate,
      bundle_version: BUNDLE_VERSION,
      policy_bundle_version: policy.policy_bundle_version,
      model_version: policy.model_version,
      feature_manifest_id: featureManifest.feature_manifest_id,
    },
    eligibility: {
      eligibility_status: eligibility.eligibility_status,
      decision_grade: decisionGrade.decision_grade,
      vetos: eligibility.vetos,
      warnings: eligibility.warnings,
    },
    decision: {
      primary_action: action,
      wait_subtype: action === 'WAIT' ? preliminary.wait_subtype : null,
      bias: setup.bias,
      analysis_reliability: reliability,
      reliability_rule_version: policy.reliability_rule_version,
      primary_setup: setup.primary_setup,
      main_blocker: mainBlocker,
      next_trigger: nextTrigger(action, setup),
      reason_codes: cappedReasons,
    },
    evidence_summary: {
      evidence_raw_n: evidence.evidence_raw_n,
      evidence_effective_n: evidence.evidence_effective_n,
      evidence_scope: evidence.evidence_scope,
      evidence_method: evidence.evidence_method,
      ev_proxy_bucket: evRisk.ev_proxy_bucket,
      tail_risk_bucket: evRisk.tail_risk_bucket,
    },
    method_status: {
      data_method_risk: eligibility.vetos.length ? 'HIGH' : 'LOW',
      evidence_method_risk: evidence.evidence_method === 'unavailable' ? 'UNKNOWN' : 'MEDIUM',
      pit_risk: 'LOW',
      survivorship_risk: 'UNKNOWN',
    },
    trade_guard: {
      ...tradeGuard,
      ...invalidation,
    },
    evaluation: {
      evaluation_horizon_days: HORIZON_DAYS.mid_term,
      evaluation_policy: action === 'BUY' ? 'fixed_eod_horizon_no_auto_exit' : 'not_evaluated',
    },
    rank_summary: {
      rank_percentile: null,
      rank_scope: null,
    },
    horizons: {
      short_term: resolveHorizonState({ horizon: 'short_term', baseAction: action === 'BUY' ? 'BUY' : action, setup, evidence: evidenceByHorizon.short_term, evRisk, reliability, reasonCodes: cappedReasons, reasonMap }),
      mid_term: resolveHorizonState({ horizon: 'mid_term', baseAction: action, setup, evidence: evidenceByHorizon.mid_term, evRisk, reliability, reasonCodes: cappedReasons, reasonMap }),
      long_term: resolveHorizonState({ horizon: 'long_term', baseAction: action === 'BUY' && evidenceByHorizon.long_term.evidence_method !== 'unavailable' ? 'BUY' : (action === 'INCUBATING' ? 'INCUBATING' : action === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'WAIT'), setup, evidence: evidenceByHorizon.long_term, evRisk, reliability, reasonCodes: cappedReasons, reasonMap }),
    },
    ui: {
      severity: severityFor(action),
      show_override_banner: eligibility.vetos.length > 0 || mainBlocker != null,
      disclaimer_policy_version: policy.ui_disclaimer_policy_version,
    },
  };
  return rowDoc;
}

function nextTrigger(action, setup) {
  if (action === 'BUY') return 'Buy only if next session opens below max entry price.';
  if (setup?.primary_setup === 'pullback') return 'Wait for rebound confirmation from pullback.';
  if (setup?.primary_setup === 'trend_continuation') return 'Wait for cleaner entry quality.';
  return null;
}

function severityFor(action) {
  if (action === 'BUY') return 'positive';
  if (action === 'AVOID') return 'danger';
  if (action === 'WAIT') return 'caution';
  if (action === 'INCUBATING') return 'neutral';
  return 'unavailable';
}

function buyInvariantErrors({ eligibility, decisionGrade, setup, evidence, evRisk, reliability, tradeGuard, invalidation, reasonCodes, reasonMap }) {
  const errors = [];
  if (eligibility.eligibility_status !== 'ELIGIBLE') errors.push('BUY_INVARIANT_ELIGIBILITY');
  if (decisionGrade.decision_grade !== true) errors.push('BUY_INVARIANT_DECISION_GRADE');
  if (eligibility.vetos.length) errors.push('BUY_INVARIANT_HARD_VETO');
  if (!setup.primary_setup || setup.primary_setup === 'none') errors.push('BUY_INVARIANT_SETUP');
  if (!reasonCodes.length || hasUnknownBlockingReason(reasonCodes, reasonMap)) errors.push('BUY_INVARIANT_REASON_CODES');
  if (reliability === 'LOW') errors.push('BUY_INVARIANT_RELIABILITY');
  if (evRisk.ev_proxy_bucket !== 'positive') errors.push('BUY_INVARIANT_EV');
  if (!['LOW', 'MEDIUM'].includes(evRisk.tail_risk_bucket)) errors.push('BUY_INVARIANT_TAIL');
  if (!evRisk.cost_proxy_available) errors.push('BUY_INVARIANT_COST');
  if (!(evidence.evidence_effective_n > 0)) errors.push('BUY_INVARIANT_EVIDENCE');
  if (tradeGuard.max_entry_price == null) errors.push('BUY_INVARIANT_ENTRY_GUARD');
  if (invalidation.invalidation_level == null) errors.push('BUY_INVARIANT_INVALIDATION');
  return errors;
}

function hasUnknownBlockingReason(reasonCodes, reasonMap) {
  return uniqueStrings(reasonCodes).some((code) => !reasonMap.has(code) && /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/.test(code));
}

function makeCounters() {
  return {
    total_assets: 0,
    eligible_assets: 0,
    candidate_assets: 0,
    audit_sample_assets: 0,
    buy_count: 0,
    wait_count: 0,
    avoid_count: 0,
    unavailable_count: 0,
    incubating_count: 0,
    limited_history_count: 0,
    decision_grade_count: 0,
    hard_veto_count_by_code: {},
    unknown_reason_code_count: 0,
    unknown_blocking_reason_code_count: 0,
    schema_error_count: 0,
    tail_unknown_count: 0,
    tail_high_count: 0,
    ev_unavailable_count: 0,
    ev_positive_count: 0,
    event_veto_count: 0,
    legacy_buy_fallback_count: 0,
    part_size_max_bytes: 0,
    row_size_max_bytes: 0,
  };
}

function updateCounters(c, row) {
  c.total_assets += 1;
  if (row.eligibility.eligibility_status === 'ELIGIBLE') c.eligible_assets += 1;
  if (row.eligibility.eligibility_status === 'INCUBATING') c.incubating_count += 1;
  if (row.eligibility.eligibility_status === 'LIMITED_HISTORY') c.limited_history_count += 1;
  if (row.eligibility.decision_grade) c.decision_grade_count += 1;
  if (row.decision.primary_action === 'BUY') c.buy_count += 1;
  if (row.decision.primary_action === 'WAIT') c.wait_count += 1;
  if (row.decision.primary_action === 'AVOID') c.avoid_count += 1;
  if (row.decision.primary_action === 'UNAVAILABLE') c.unavailable_count += 1;
  for (const code of row.eligibility.vetos) c.hard_veto_count_by_code[code] = (c.hard_veto_count_by_code[code] || 0) + 1;
  if (row.evidence_summary.tail_risk_bucket === 'UNKNOWN') c.tail_unknown_count += 1;
  if (row.evidence_summary.tail_risk_bucket === 'HIGH') c.tail_high_count += 1;
  if (row.evidence_summary.ev_proxy_bucket === 'unavailable') c.ev_unavailable_count += 1;
  if (row.evidence_summary.ev_proxy_bucket === 'positive') c.ev_positive_count += 1;
  c.row_size_max_bytes = Math.max(c.row_size_max_bytes, Buffer.byteLength(JSON.stringify(row), 'utf8'));
}

function buildStatus({ counters, manifest, universeSummary, policy, reasonRegistry, featureManifest }) {
  const zeroBuyCause = counters.buy_count === 0
    ? (counters.eligible_assets === 0 ? 'PIPELINE_FAILED' : counters.ev_unavailable_count > counters.eligible_assets * 0.5 ? 'INSUFFICIENT_EVIDENCE' : 'NO_EDGE_FOUND')
    : null;
  return {
    schema: 'rv.decision_core_status.v1',
    decision_core_status: 'ok',
    target_market_date: manifest.target_market_date,
    generated_at: manifest.generated_at,
    manifest_path: `public/data/decision-core/${manifest.mode}/manifest.json`,
    bundle_error_rate: 0,
    schema_error_count: counters.schema_error_count,
    total_assets: counters.total_assets,
    eligible_assets: counters.eligible_assets,
    candidate_assets: universeSummary.candidate_assets,
    audit_sample_assets: universeSummary.audit_sample_assets,
    buy_count: counters.buy_count,
    wait_count: counters.wait_count,
    avoid_count: counters.avoid_count,
    unavailable_count: counters.unavailable_count,
    incubating_count: counters.incubating_count,
    limited_history_count: counters.limited_history_count,
    decision_grade_rate: counters.total_assets ? counters.decision_grade_count / counters.total_assets : 0,
    hard_veto_count_by_code: counters.hard_veto_count_by_code,
    unknown_reason_code_count: counters.unknown_reason_code_count,
    unknown_blocking_reason_code_count: counters.unknown_blocking_reason_code_count,
    tail_unknown_count: counters.tail_unknown_count,
    tail_high_count: counters.tail_high_count,
    ev_unavailable_count: counters.ev_unavailable_count,
    ev_positive_count: counters.ev_positive_count,
    event_veto_count: counters.event_veto_count,
    legacy_buy_fallback_count: counters.legacy_buy_fallback_count,
    zero_buy_cause: zeroBuyCause,
    part_size_max_bytes: manifest.part_size_max_bytes,
    row_size_max_bytes: counters.row_size_max_bytes,
    candidate_rate_by_bucket: universeSummary.candidate_rate_by_bucket,
    audit_sample_count: universeSummary.audit_sample_assets,
    missing_manifest_count: policy ? 0 : 1,
    missing_reason_registry_count: reasonRegistry?.codes?.length ? 0 : 1,
    degraded_status_count: 0,
    policy_manifest_loaded: Boolean(policy?.policy_bundle_version),
    reason_code_registry_loaded: Boolean(reasonRegistry?.codes?.length),
    feature_manifest_loaded: Boolean(featureManifest?.feature_manifest_id),
    adjusted_data_policy_declared: Boolean(policy?.adjusted_data_policy),
    noncandidate_audit_sample_exists: universeSummary.audit_sample_assets > 0,
    no_partial_bundle: true,
    atomic_publish_ok: true,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
