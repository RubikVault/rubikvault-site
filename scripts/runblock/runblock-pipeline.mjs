/**
 * RUNBLOCK v3.0 — Main Pipeline Orchestrator
 *
 * Enforces the mandatory 5-layer pipeline order:
 * 1. Data Integrity → 2. Regime Detection → 3. Audit & Feedback →
 * 4. Validation & Governance → 5. Feature Output
 *
 * No layer may be skipped. No feature output without frozen snapshot.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateSeries, reconcileFeeds, detectAnomalies, computeDataQualityScore } from './layers/01-data-integrity.mjs';
import { evaluateFastRegime, evaluateWeeklyRegime, detectRegimeBreak, computeRegimeStability } from './layers/02-regime-detection.mjs';
import { computeStressScore as _computeStressScore } from './layers/02c-stress-monitor.mjs';
import { computeSystemConfidence as _computeSysConf, detectSystemState as _detectSysState } from './services/system-confidence.mjs';
import {
  createDecisionLog,
  createAuditIncident,
  persistDecisionLog,
  persistAuditIncident,
  detectFailurePatterns
} from './layers/03-audit-feedback.mjs';
import {
  evaluateScientificGates,
  evaluateForecastGates,
  evaluateElliottV1Gates,
  evaluateElliottV2Gates,
  promotionDecision
} from './layers/04-validation-governance.mjs';
import { buildFeaturePayload } from './layers/05-feature-output.mjs';
import { computeGlobalState, enforceGlobalState } from './services/global-state.mjs';
import { createSnapshot, persistSnapshot } from './services/snapshot-freeze.mjs';
import { assertNoLeakage, assertPurgeEmbargo } from './services/leakage-guard.mjs';
import { classifyBucket, computeNetReturn } from './services/liquidity-bucket.mjs';

// V6 Layer imports
import { computeEventStreakDays } from './layers/06-event-oracle.mjs';
import { computeFreshnessMultiplier, computeStabilityScore, computeRawEvidenceScore, applyMicroUncertainty, guardCsDoublePenalty } from './layers/07-evidence-scoring.mjs';
import { computeIntraClusterRedundancy, detectClusterConflicts, computeClusterAgreementScore, neutralizeCrossClusterConflicts } from './layers/08-cluster-agreement.mjs';
import { computeDataConfidenceAgg, computeMarketPredictability, computeRawConfidence, computeCrossHorizonConsistency, computeEnsembleBias, computeSummaryState } from './layers/09-confidence-ensemble.mjs';
import { computeRiskExecution } from './layers/10-risk-execution.mjs';
import { buildTickerOutput } from './layers/11-output-report.mjs';
import { evaluateEmergencyConditions, applyEmergencyOverride } from './services/emergency-override.mjs';
import { applyGlobalCaps } from './services/system-confidence.mjs';
import { buildExplainabilityOutput, EXPLAINABILITY_LEVEL } from './services/explainability.mjs';
import { validateCalibrationMode } from '../learning/calibration-holdout.mjs';

import YAML from 'yaml';

/**
 * Load all RUNBLOCK config files.
 */
export async function loadRunblockConfig(rootDir) {
  const configMap = {
    pipeline_config: [
      path.join(rootDir, 'config/runblock/pipeline_config.yaml'),
      path.join(rootDir, 'policies/runblock/pipeline-config.v3.json'),
    ],
    regime_config: [
      path.join(rootDir, 'config/runblock/regime_config.yaml'),
      path.join(rootDir, 'policies/runblock/regime-config.v3.json'),
    ],
    promotion_config: [
      path.join(rootDir, 'config/runblock/promotion_config.yaml'),
      path.join(rootDir, 'policies/runblock/promotion-config.v3.json'),
    ],
    liquidity_buckets: [
      path.join(rootDir, 'config/runblock/liquidity_buckets.yaml'),
      path.join(rootDir, 'policies/runblock/liquidity-buckets.v3.json'),
    ],
    audit_config: [
      path.join(rootDir, 'config/runblock/audit_config.yaml'),
      path.join(rootDir, 'policies/runblock/audit-config.v3.json'),
    ],
    fallback_config: [
      path.join(rootDir, 'config/runblock/fallback_config.yaml'),
      path.join(rootDir, 'policies/runblock/fallback-config.v3.json'),
    ],
  };

  const config = {};
  for (const [key, candidates] of Object.entries(configMap)) {
    let loaded = null;
    for (const filePath of candidates) {
      try {
        const raw = await readFile(filePath, 'utf-8');
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          loaded = YAML.parse(raw);
        } else {
          loaded = JSON.parse(raw);
        }
        break;
      } catch (err) {
        // Try next candidate.
      }
    }
    if (!loaded) {
      console.warn(`RUNBLOCK: Failed to load config for ${key}`);
      loaded = {};
    }
    config[key] = loaded;
  }
  return config;
}

const GLOBAL_STATE_RANK = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

function maxGlobalState(a = 'GREEN', b = 'GREEN') {
  return (GLOBAL_STATE_RANK[a] ?? 0) >= (GLOBAL_STATE_RANK[b] ?? 0) ? a : b;
}

function toIsoTimestamp(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function uniq(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
}

function enrichScientificMetrics(metrics, bucket) {
  if (!metrics || typeof metrics !== 'object') return null;
  const next = { ...metrics };
  const gross =
    next.exp_ret_10d_gross ??
    next.gross_return ??
    next.expected_return_gross ??
    null;
  if (next.net_return_after_costs == null && Number.isFinite(Number(gross))) {
    Object.assign(next, computeNetReturn(Number(gross), bucket));
  }
  if (next.tradability_flag == null) {
    next.tradability_flag = bucket?.tradability ?? false;
  }
  if (next.cost_model_version == null) {
    next.cost_model_version = 'runblock.cost.v3';
  }
  return next;
}

/**
 * Execute the full RUNBLOCK pipeline for a single ticker.
 *
 * @param {Object} params
 * @param {string} params.ticker
 * @param {Array} params.bars - OHLCV bars (primary feed)
 * @param {Array} [params.secondaryBars] - Secondary feed bars (optional)
 * @param {Object} params.marketData - For regime detection
 * @param {Array} params.recentRegimes - Historical regime tags
 * @param {Object} params.modelMetrics - Scientific/Forecast model metrics
 * @param {Object} params.config - Loaded RUNBLOCK config
 * @param {string} params.rootDir - Repo root
 * @returns {Object} Pipeline result
 */
export async function executePipeline({
  ticker,
  bars,
  secondaryBars,
  marketData = {},
  weeklyRegimeFeatures = [],
  recentRegimes = [],
  recentDecisionLogs = [],
  modelMetrics = {},
  config = {},
  rootDir,
  codeVersion,
  labelStartTimestamp,
  featureTimestamp,
  publishTime,
  trainEnd,
  valStart,
  sourceVersions = {},
  uiPayloadVersion = 'runblock.ui.v3',
}) {
  const pipelineConfig = config.pipeline_config || {};
  const regimeConfig = config.regime_config || {};
  const auditConfig = config.audit_config || {};
  const promotionConfig = config.promotion_config || {};
  const fallbackConfig = config.fallback_config || {};
  const latestBar = Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null;
  const asofTimestamp = toIsoTimestamp(latestBar?.timestamp || latestBar?.date);
  const effectiveLabelStart = labelStartTimestamp || new Date(Date.parse(asofTimestamp) + 86400000).toISOString();
  const effectiveFeatureTimestamp = featureTimestamp || asofTimestamp;
  const bucketConfig = config.liquidity_buckets || {};

  const result = {
    ticker,
    pipeline_version: 'runblock.v3+v6',
    layers: {},
    global_state: null,
    output: null,
    halted: false,
    halt_reason: null,
    snapshot: null,
    snapshot_path: null,
    audit: {
      incidents: [],
      decision_logs: [],
    },
  };

  async function recordIncident({ layer, severity = 'RED', code, message, details = {}, snapshotId = null }) {
    const incident = createAuditIncident({
      ticker,
      layer,
      severity,
      code,
      message,
      snapshot_id: snapshotId,
      details,
      dependency_trace: {
        source_data_versions: sourceVersions,
        regime_version: regimeConfig.schema_version || 'runblock.v3',
        ui_payload_version: uiPayloadVersion,
      },
      git_commit_hash: codeVersion || 'unknown',
    });
    if (!rootDir) {
      result.audit.incidents.push({ entry: incident, path: null });
      return null;
    }
    const incidentPath = await persistAuditIncident(rootDir, incident, auditConfig);
    result.audit.incidents.push({ entry: incident, path: incidentPath });
    return incidentPath;
  }

  // ═══ LAYER 1: DATA INTEGRITY ═══
  const dataIntegrity = validateSeries(bars, pipelineConfig.data_integrity);
  const anomalyCheck = detectAnomalies(bars, pipelineConfig.data_integrity);
  let feedState = { state: 'PASS', reason_codes: [] };
  if (secondaryBars && secondaryBars.length > 0 && bars.length > 0) {
    feedState = reconcileFeeds(
      bars[bars.length - 1],
      secondaryBars[secondaryBars.length - 1],
      pipelineConfig.data_integrity
    );
  }

  const leakageCheck = assertNoLeakage({
    asofTimestamp,
    labelStartTimestamp: effectiveLabelStart,
    featureTimestamp: effectiveFeatureTimestamp,
    publishTime,
  });
  const walkForwardCheck = trainEnd && valStart
    ? assertPurgeEmbargo({
        trainEnd,
        valStart,
        purgeDays: pipelineConfig.leakage_guards?.purge_period_days || 5,
        embargoDays: pipelineConfig.leakage_guards?.embargo_period_days || 5,
      })
    : { pass: true, violations: [] };

  // V6: Quantitative data quality score
  const dataQuality = computeDataQualityScore(dataIntegrity, anomalyCheck, feedState.state !== 'PASS' ? feedState : null);

  result.layers.data_integrity = {
    series: dataIntegrity,
    anomaly_detection: anomalyCheck,
    feed_reconciliation: feedState,
    leakage_guard: leakageCheck,
    walk_forward_guard: walkForwardCheck,
    data_quality_score: dataQuality.data_quality_score,
    data_quality_components: dataQuality.components,
    insufficient_evidence_flag: dataQuality.insufficient_evidence_flag,
    effective_state: feedState.state === 'FAIL'
      ? 'FAIL'
      : dataIntegrity.state === 'FAIL'
        ? 'FAIL'
        : (dataIntegrity.state === 'SUSPECT' || feedState.state === 'SUSPECT' || anomalyCheck.state === 'SUSPECT')
          ? 'SUSPECT'
          : 'PASS',
  };

  if (dataIntegrity.state === 'FAIL') {
    result.global_state = 'RED';
    result.halted = true;
    result.halt_reason = `DATA_INTEGRITY_FAIL: ${uniq([...dataIntegrity.reason_codes, ...feedState.reason_codes]).join(', ')}`;
    await recordIncident({
      layer: 'data_integrity',
      code: 'DATA_INTEGRITY_FAIL',
      message: result.halt_reason,
      details: result.layers.data_integrity,
    });
    return result;
  }

  if (feedState.state === 'FAIL') {
    result.global_state = 'RED';
    result.halted = true;
    result.halt_reason = 'FEED_RECONCILIATION_FAIL';
    await recordIncident({
      layer: 'data_integrity',
      code: 'FEED_RECONCILIATION_FAIL',
      message: 'Primary and secondary feeds are unrecoverably inconsistent.',
      details: result.layers.data_integrity,
    });
    return result;
  }

  if (!leakageCheck.pass || !walkForwardCheck.pass) {
    result.global_state = 'RED';
    result.halted = true;
    result.halt_reason = !leakageCheck.pass
      ? `LEAKAGE_FAIL: ${leakageCheck.violations.join(' | ')}`
      : `PURGE_EMBARGO_FAIL: ${walkForwardCheck.violations.join(' | ')}`;
    await recordIncident({
      layer: 'data_integrity',
      code: !leakageCheck.pass ? 'LEAKAGE_ASSERTION_FAIL' : 'PURGE_EMBARGO_FAIL',
      message: result.halt_reason,
      details: result.layers.data_integrity,
    });
    return result;
  }

  // ═══ LAYER 2: REGIME DETECTION ═══
  const fastRegime = evaluateFastRegime(marketData, regimeConfig);
  const weeklyRegime = evaluateWeeklyRegime(weeklyRegimeFeatures, regimeConfig);
  const effectiveRegimeTag = weeklyRegime.regime_tag || fastRegime.regime;
  const effectiveRegimeConfidence = weeklyRegime.regime_confidence ?? fastRegime.confidence ?? 0;
  const regimeBreak = detectRegimeBreak(effectiveRegimeTag, recentRegimes, regimeConfig);

  // V6: Regime stability + stress monitor
  const regimeStability = computeRegimeStability(recentRegimes.map(r => r.regime || r));
  const stressResult = _computeStressScore(marketData, fastRegime);
  const systemConfidence = _computeSysConf({
    calibrationHealth: 0.7,
    regimeStability: regimeStability.regime_stability,
    recentHitRate: 0.55,
    stressScore: stressResult.stress_score,
    monotonicityHealth: 1.0,
  });
  const systemState = _detectSysState({ systemConfidence });

  result.layers.regime_detection = {
    fast_regime: fastRegime,
    weekly_regime: weeklyRegime,
    regime_break: regimeBreak,
    effective_regime_tag: effectiveRegimeTag,
    effective_regime_confidence: effectiveRegimeConfidence,
    regime_stability: regimeStability,
    stress: stressResult,
    system_confidence: systemConfidence,
    system_state: systemState.system_state,
  };

  // ═══ SNAPSHOT FREEZE ═══
  const advUsd = latestBar?.volume && latestBar?.close ? latestBar.volume * latestBar.close : 0;
  const liquidityBucket = classifyBucket(advUsd, null, bucketConfig);
  const scientificMetrics = enrichScientificMetrics(modelMetrics.scientific, liquidityBucket);
  const forecastMetrics = modelMetrics.forecast ? { ...modelMetrics.forecast } : null;
  const elliottMetrics = modelMetrics.elliott ? { ...modelMetrics.elliott } : null;

  const snapshot = createSnapshot({
    ticker,
    tradingDate: asofTimestamp.slice(0, 10),
    asofTimestamp,
    features: {
      close: latestBar?.close ?? null,
      volume: latestBar?.volume ?? null,
      adv_usd: advUsd,
      regime_fast: fastRegime.regime,
      regime_weekly: weeklyRegime.regime_tag,
      regime_confidence: effectiveRegimeConfidence,
      data_quality_state: result.layers.data_integrity.effective_state,
    },
    featureVersion: 'runblock.v3.features',
    ruleVersion: 'runblock.v3.rules',
    regimeVersion: weeklyRegime.regime_version || regimeConfig.schema_version || 'runblock.v3',
    modelVersion: scientificMetrics?.model_version || forecastMetrics?.model_version || 'proxy',
    calibrationVersion: scientificMetrics?.calibration_version || forecastMetrics?.calibration_version || null,
    costModelVersion: scientificMetrics?.cost_model_version || forecastMetrics?.cost_model_version || 'runblock.cost.v3',
    dataQualityState: result.layers.data_integrity.effective_state,
    sourceVersions,
    codeVersion: codeVersion || 'unknown',
  });

  result.snapshot = snapshot;
  try {
    result.snapshot_path = rootDir
      ? await persistSnapshot(rootDir, snapshot, pipelineConfig.data_integrity || {})
      : null;
  } catch (error) {
    result.global_state = 'RED';
    result.halted = true;
    result.halt_reason = `SNAPSHOT_PERSIST_FAIL: ${error.message}`;
    await recordIncident({
      layer: 'data_integrity',
      code: 'SNAPSHOT_PERSIST_FAIL',
      message: result.halt_reason,
      details: { snapshot_id: snapshot.snapshot_id },
      snapshotId: snapshot.snapshot_id,
    });
    return result;
  }

  // ═══ LAYER 3: AUDIT & FEEDBACK ═══
  const auditFeedback = detectFailurePatterns(recentDecisionLogs, auditConfig);
  result.layers.audit_feedback = {
    failure_patterns: auditFeedback,
    recent_log_count: recentDecisionLogs.length,
  };

  if (scientificMetrics) {
    scientificMetrics.structural_instability_flag = Boolean(scientificMetrics.structural_instability_flag || auditFeedback.structural_instability);
    scientificMetrics.regime_compatible = scientificMetrics.regime_compatible ?? !weeklyRegime.fallback_used;
    scientificMetrics.current_regime = scientificMetrics.current_regime || effectiveRegimeTag;
    scientificMetrics.validation_regime = scientificMetrics.validation_regime || effectiveRegimeTag;
    scientificMetrics.primary_window_data_quality = scientificMetrics.primary_window_data_quality || result.layers.data_integrity.effective_state;
    scientificMetrics.leakage_pass = scientificMetrics.leakage_pass ?? true;
  }
  if (forecastMetrics) {
    forecastMetrics.structural_instability_flag = Boolean(forecastMetrics.structural_instability_flag || auditFeedback.structural_instability);
    forecastMetrics.leakage_pass = forecastMetrics.leakage_pass ?? true;
    forecastMetrics.promotion_freeze_active = Boolean(forecastMetrics.promotion_freeze_active || regimeBreak.break_detected);
  }
  if (elliottMetrics) {
    elliottMetrics.reason_codes = uniq(elliottMetrics.reason_codes || []);
  }

  // ═══ LAYER 4: VALIDATION & GOVERNANCE ═══
  const sciGates = scientificMetrics
    ? evaluateScientificGates(scientificMetrics, promotionConfig)
    : null;
  const fcGates = forecastMetrics
    ? evaluateForecastGates(forecastMetrics, promotionConfig)
    : null;
  const elliottV1Gates = elliottMetrics
    ? evaluateElliottV1Gates(elliottMetrics)
    : null;
  const elliottV2Gates = elliottMetrics
    ? evaluateElliottV2Gates(elliottMetrics, promotionConfig)
    : null;
  
  const sciPromotion = scientificMetrics?.is_challenger && scientificMetrics?.champion_metrics
    ? promotionDecision(scientificMetrics.champion_metrics, scientificMetrics)
    : null;
    
  const fcPromotion = forecastMetrics?.is_challenger && forecastMetrics?.champion_metrics
    ? promotionDecision(forecastMetrics.champion_metrics, forecastMetrics)
    : null;

  const elliottDirectionalRequested = Boolean(elliottMetrics?.request_directional);
  const elliottDirectionalEnabled = Boolean(elliottDirectionalRequested && elliottV2Gates?.eligible);

  if (scientificMetrics) {
    scientificMetrics.state = sciGates?.eligible ? (scientificMetrics.state || 'ACTIVE') : 'SUPPRESSED';
    scientificMetrics.reason_codes = uniq([...(scientificMetrics.reason_codes || []), ...(sciGates?.blocking_gates || [])]);
  }
  if (forecastMetrics) {
    forecastMetrics.state = fcGates?.eligible ? (forecastMetrics.state || 'ACTIVE') : 'SUPPRESSED';
    forecastMetrics.validation_ready = fcGates?.eligible;
    forecastMetrics.reason_codes = uniq([...(forecastMetrics.reason_codes || []), ...(fcGates?.blocking_gates || [])]);
  }
  if (elliottMetrics) {
    elliottMetrics.state = elliottV1Gates?.eligible ? (elliottDirectionalEnabled ? 'ACTIVE' : 'PASSIVE') : 'INVALIDATED';
    elliottMetrics.reason_codes = uniq([
      ...(elliottMetrics.reason_codes || []),
      ...(elliottV1Gates?.blocking_gates || []),
      ...(elliottDirectionalRequested && !elliottDirectionalEnabled ? (elliottV2Gates?.blocking_gates || []) : []),
    ]);
  }

  const promotionEligible = Boolean(
    (sciGates ? sciGates.eligible : true) &&
    (fcGates ? fcGates.eligible : true) &&
    (elliottV1Gates ? elliottV1Gates.eligible : true) &&
    (!elliottDirectionalRequested || elliottDirectionalEnabled) &&
    !auditFeedback.structural_instability &&
    !regimeBreak.break_detected
  );

  result.layers.validation_governance = {
    scientific_gates: sciGates,
    forecast_gates: fcGates,
    elliott_v1_gates: elliottV1Gates,
    elliott_v2_gates: elliottV2Gates,
    elliott_directional_enabled: elliottDirectionalEnabled,
    scientific_promotion: sciPromotion,
    forecast_promotion: fcPromotion,
    promotion_eligible: promotionEligible,
  };

  // ═══ COMPUTE GLOBAL STATE ═══
  const regimeComponentState = weeklyRegime.min_global_state === 'ORANGE'
    ? 'SUPPRESSED'
    : (fastRegime.regime === 'NORMAL' && !weeklyRegime.fallback_used)
      ? 'ACTIVE'
      : 'STRESS';
  const componentStates = {
    data_integrity: {
      state: result.layers.data_integrity.effective_state === 'PASS'
        ? 'ACTIVE'
        : result.layers.data_integrity.effective_state,
    },
    regime_detection: { state: regimeComponentState },
    scientific: { state: scientificMetrics?.state || 'ACTIVE' },
    forecast: { state: forecastMetrics?.state || 'ACTIVE' },
    elliott: { state: elliottMetrics?.state === 'INVALIDATED' ? 'INVALIDATED' : 'ACTIVE' },
  };

  const globalStateResult = computeGlobalState(componentStates, {
    leakage_fail: false,
    audit_inconsistency: false,
    feeds_unavailable: false,
    regime_break_active: regimeBreak.break_detected,
    suspect_pct: result.layers.data_integrity.series?.stats?.suspect_pct || 0,
    min_global_state: weeklyRegime.min_global_state || null,
  });
  result.global_state = globalStateResult.global_state;
  result.layers.global_state = globalStateResult;

  // ═══ LAYER 5: FEATURE OUTPUT ═══
  result.layers.feature_output = buildFeaturePayload({
    ticker,
    snapshotId: snapshot.snapshot_id,
    globalState: result.global_state,
    dataQuality: result.layers.data_integrity.effective_state,
    regimeTag: effectiveRegimeTag,
    scientific: scientificMetrics,
    forecast: forecastMetrics,
    elliott: elliottMetrics,
    liquidityBucket,
    costModel: { version: scientificMetrics?.cost_model_version || forecastMetrics?.cost_model_version || 'runblock.cost.v3' },
    elliottV2Enabled: elliottDirectionalEnabled,
  });
  result.output = result.layers.feature_output;

  // ═══ V6 LAYERS 06–11 (additive, does not break V1 flow) ═══
  if (!result.halted) {
    try {
      const v6Context = {
        events: [],
        evidenceRecords: [],
        clusterScores: [],
      };

      // LAYER 06: Event Oracle — streak computation
      const eventStreakDays = computeEventStreakDays(v6Context.events, asofTimestamp.slice(0, 10));
      result.layers.event_oracle = { event_streak_days: eventStreakDays };

      // LAYER 07: Evidence Scoring — freshness + stability + raw score
      const freshness = computeFreshnessMultiplier(eventStreakDays, 'mid', 'trend');
      const stability = computeStabilityScore([]);
      result.layers.evidence_scoring = {
        freshness_multiplier: freshness,
        stability: stability,
      };

      // LAYER 08: Cluster Agreement
      const redundancyAdjusted = computeIntraClusterRedundancy(v6Context.evidenceRecords);
      const clusterConflicts = detectClusterConflicts(v6Context.evidenceRecords);
      const neutralized = neutralizeCrossClusterConflicts(v6Context.clusterScores);
      const clusterAgreement = computeClusterAgreementScore(neutralized.neutralized_scores);
      result.layers.cluster_agreement = {
        redundancy_adjusted: redundancyAdjusted,
        conflicts: clusterConflicts,
        neutralization: neutralized,
        agreement: clusterAgreement,
      };

      // LAYER 09: Confidence & Ensemble
      const dataConfAgg = computeDataConfidenceAgg(v6Context.evidenceRecords);
      const marketPred = computeMarketPredictability(
        { regime: effectiveRegimeTag, regime_confidence: effectiveRegimeConfidence },
        stressResult
      );
      const rawConfidence = computeRawConfidence(dataConfAgg, marketPred, clusterAgreement.cluster_agreement_score, stability.stability_score);
      const crossConsistency = computeCrossHorizonConsistency({});
      const ensembleBias = computeEnsembleBias(0, 0, 0, 0, 0, 0);
      const summaryState = computeSummaryState(ensembleBias, crossConsistency.cross_horizon_consistency_score);
      result.layers.confidence_ensemble = {
        data_confidence_agg: dataConfAgg,
        market_predictability: marketPred,
        raw_confidence: rawConfidence,
        cross_horizon_consistency: crossConsistency,
        ensemble_bias: ensembleBias,
        summary_state: summaryState,
      };

      // LAYER 10: Risk & Execution
      const riskResult = computeRiskExecution({
        returns: [],
        ensembleBias,
        confidence: rawConfidence,
        crashState: stressResult.crash_state,
        transitionState: regimeStability.transition_state,
      });
      result.layers.risk_execution = riskResult;

      // Apply global caps from system confidence
      const globalCap = applyGlobalCaps(systemState.system_state, systemConfidence, 'MODERATE');
      result.layers.system_caps = globalCap;

      // Emergency override evaluation
      const emergencyResult = evaluateEmergencyConditions({
        systemState: systemState.system_state,
        stressScore: stressResult.stress_score,
        crashState: stressResult.crash_state,
        hitRate7d: 0.55,
        monotonicityBroken: false,
      });
      result.layers.emergency = emergencyResult;

      // F5: Calibration mode validation with fallback
      const calibrationValidation = validateCalibrationMode('calibrated', true, false);
      const effectiveCalibrationMode = calibrationValidation.effective_mode;

      // F5: Apply bootstrap confidence penalty
      const adjustedConfidence = effectiveCalibrationMode === 'bootstrap'
        ? rawConfidence * 0.85
        : rawConfidence;
      result.layers.confidence_ensemble.adjusted_confidence = adjustedConfidence;
      result.layers.confidence_ensemble.calibration_mode = effectiveCalibrationMode;

      // LAYER 11: Output — ticker V6 document
      result.layers.v6_output = buildTickerOutput({
        ticker,
        date: asofTimestamp.slice(0, 10),
        ensembleView: {
          ensemble_bias: ensembleBias,
          cross_horizon_consistency_score: crossConsistency.cross_horizon_consistency_score,
          summary_state: summaryState,
        },
        riskExecution: riskResult,
        governance: {
          oracle_version: '6.0.0',
          strategy_version: '6.0.0',
          calibration_mode: effectiveCalibrationMode,
          calibration_reason: calibrationValidation.reason,
        },
      });

      // F1: Store decision bucket and apply emergency override
      result.layers.v6_output.decision = {
        bucket: globalCap.capped_bucket,
        hold_state: 'hold_normal',
        confidence: adjustedConfidence,
      };

      if (emergencyResult.emergency_active) {
        const overridden = applyEmergencyOverride(
          { v6: result.layers.v6_output.decision },
          emergencyResult
        );
        result.layers.v6_output.decision = overridden.v6;
      }

      // F2: Explainability SUMMARY in v6_output
      result.layers.v6_output.explainability = buildExplainabilityOutput(
        EXPLAINABILITY_LEVEL.SUMMARY,
        {
          v6Result: result.layers.v6_output.decision,
          evidenceRecords: v6Context.evidenceRecords,
          riskResult,
          stressResult,
          confidenceResult: {
            raw_confidence: adjustedConfidence,
            data_confidence_agg: dataConfAgg,
            market_predictability: marketPred,
          },
        }
      );
    } catch (v6Error) {
      // V6 layers are additive — failure does not halt the V1 pipeline
      result.layers.v6_error = { message: v6Error.message, stack: v6Error.stack?.split('\n').slice(0, 3) };
    }
  }

  // ═══ ENFORCE GLOBAL STATE ═══
  const enforcement = enforceGlobalState(result.global_state, fallbackConfig);
  result.layers.global_state.enforcement = enforcement;
  if (!enforcement.allowed) {
    result.halted = true;
    result.halt_reason = `GLOBAL_STATE_${result.global_state}: ${enforcement.disclaimer}`;
  }

  // ═══ APPEND-ONLY AUDIT LOGGING ═══
  const dependencyTrace = {
    source_data_versions: sourceVersions,
    feature_versions: { runblock: snapshot.feature_version },
    rule_versions: { runblock: snapshot.rule_version },
    regime_version: snapshot.regime_version,
    model_version: {
      scientific: scientificMetrics?.model_version || null,
      forecast: forecastMetrics?.model_version || null,
      elliott: elliottMetrics?.model_version || null,
    },
    calibration_version: {
      scientific: scientificMetrics?.calibration_version || null,
      forecast: forecastMetrics?.calibration_version || null,
    },
    cost_model_version: scientificMetrics?.cost_model_version || forecastMetrics?.cost_model_version || 'runblock.cost.v3',
    ui_payload_version: uiPayloadVersion,
  };

  const featureLogs = [
    scientificMetrics && {
      feature_name: 'scientific',
      metrics: scientificMetrics,
      payload: result.output.scientific,
      model_type: scientificMetrics.model_type || null,
      explainability_reason: scientificMetrics.explainability_unavailable_reason || 'MODEL_TYPE_UNSPECIFIED',
    },
    forecastMetrics && {
      feature_name: 'forecast',
      metrics: forecastMetrics,
      payload: result.output.forecast,
      model_type: forecastMetrics.model_type || null,
      explainability_reason: forecastMetrics.explainability_unavailable_reason || 'MODEL_TYPE_UNSPECIFIED',
    },
    elliottMetrics && {
      feature_name: 'elliott',
      metrics: elliottMetrics,
      payload: result.output.elliott,
      model_type: elliottMetrics.model_type || 'passive_structure_map',
      explainability_reason: elliottMetrics.explainability_unavailable_reason || 'PASSIVE_RULE_BASED_STRUCTURE',
    },
  ].filter(Boolean);

  try {
    for (const item of featureLogs) {
      const entry = createDecisionLog({
        snapshot_id: snapshot.snapshot_id,
        ticker,
        feature_name: item.feature_name,
        feature_version: snapshot.feature_version,
        model_version: item.metrics?.model_version || 'proxy',
        model_type: item.model_type,
        calibration_version: item.metrics?.calibration_version || null,
        regime_version: snapshot.regime_version,
        regime_tag: effectiveRegimeTag,
        regime_confidence: effectiveRegimeConfidence,
        data_quality_state: result.layers.data_integrity.effective_state,
        feature_hash: snapshot.feature_hash,
        prediction_payload: item.payload,
        fallback_used: Boolean(item.metrics?.fallback_used || item.payload?.gate?.model_state === 'SUPPRESSED' || item.payload?.state === 'SUPPRESSED'),
        fallback_reason: item.metrics?.fallback_reason || null,
        champion_id: item.metrics?.champion_id || null,
        challenger_id: item.metrics?.challenger_id || null,
        reason_codes: uniq([
          ...(item.metrics?.reason_codes || []),
          ...(item.payload?.reason_codes || []),
          ...(item.payload?.gate?.reason_codes || []),
          ...(result.layers.global_state.reason_codes || []),
        ]),
        top_3_features: item.metrics?.top_3_features || [],
        top_3_feature_weights: item.metrics?.top_3_feature_weights || [],
        explainability_unavailable_reason: item.metrics?.top_3_features?.length
          ? null
          : item.explainability_reason,
        cost_model_version: item.metrics?.cost_model_version || 'runblock.cost.v3',
        liquidity_bucket: liquidityBucket.bucket,
        tradability_flag: liquidityBucket.tradability,
        global_system_state: result.global_state,
        git_commit_hash: codeVersion || 'unknown',
        dependency_trace: dependencyTrace,
      });
      const filePath = rootDir ? await persistDecisionLog(rootDir, entry, auditConfig.decision_log || {}) : null;
      result.audit.decision_logs.push({ entry, path: filePath });
    }
  } catch (error) {
    result.global_state = maxGlobalState(result.global_state, 'RED');
    result.halted = true;
    result.halt_reason = `AUDIT_LOG_FAIL: ${error.message}`;
    result.layers.global_state = {
      ...result.layers.global_state,
      global_state: result.global_state,
      reason_codes: uniq([...(result.layers.global_state?.reason_codes || []), 'AUDIT_LOG_FAIL']),
    };
    result.layers.feature_output = buildFeaturePayload({
      ticker,
      snapshotId: snapshot.snapshot_id,
      globalState: result.global_state,
      dataQuality: result.layers.data_integrity.effective_state,
      regimeTag: effectiveRegimeTag,
      scientific: scientificMetrics ? { ...scientificMetrics, state: 'SUPPRESSED' } : null,
      forecast: forecastMetrics ? { ...forecastMetrics, state: 'SUPPRESSED' } : null,
      elliott: elliottMetrics ? { ...elliottMetrics, state: 'INVALIDATED' } : null,
      liquidityBucket,
      elliottV2Enabled: false,
    });
    result.output = result.layers.feature_output;
    await recordIncident({
      layer: 'audit_feedback',
      code: 'AUDIT_LOG_FAIL',
      message: result.halt_reason,
      details: { error: error.message },
      snapshotId: snapshot.snapshot_id,
    });
  }

  return result;
}
