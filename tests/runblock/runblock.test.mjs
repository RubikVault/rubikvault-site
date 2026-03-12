/**
 * RUNBLOCK v3.0 — Core Tests
 *
 * Tests for all 5 layers + services.
 * Run: node --test tests/runblock/runblock.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validateBar, validateSeries, reconcileFeeds } from '../../scripts/runblock/layers/01-data-integrity.mjs';
import { evaluateFastRegime, evaluateWeeklyRegime, detectRegimeBreak, tagTrainingWeights } from '../../scripts/runblock/layers/02-regime-detection.mjs';
import { createDecisionLog, persistDecisionLog, createAuditIncident, persistAuditIncident, detectFailurePatterns } from '../../scripts/runblock/layers/03-audit-feedback.mjs';
import { evaluateScientificGates, evaluateForecastGates, evaluateElliottV1Gates, evaluateElliottV2Gates, promotionDecision, monitorCalibration } from '../../scripts/runblock/layers/04-validation-governance.mjs';
import { gateScientificOutput, gateForecastOutput, gateElliottOutput } from '../../scripts/runblock/layers/05-feature-output.mjs';
import { computeGlobalState, enforceGlobalState } from '../../scripts/runblock/services/global-state.mjs';
import { computeFeatureHash, createSnapshot } from '../../scripts/runblock/services/snapshot-freeze.mjs';
import { assertNoLeakage, assertPurgeEmbargo } from '../../scripts/runblock/services/leakage-guard.mjs';
import { classifyBucket, computeNetReturn } from '../../scripts/runblock/services/liquidity-bucket.mjs';
import { executePipeline, loadRunblockConfig } from '../../scripts/runblock/runblock-pipeline.mjs';

// ═══════════════════════════════════════════════════════════════
// LAYER 1: DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════

describe('Layer 1: Data Integrity', () => {
  it('PASS for valid bar', () => {
    const r = validateBar({ open: 100, high: 105, low: 98, close: 102, volume: 1000, timestamp: '2024-01-01' });
    assert.equal(r.state, 'PASS');
  });

  it('FAIL for non-positive price', () => {
    const r = validateBar({ open: 0, high: 105, low: 98, close: 102, volume: 1000 });
    assert.equal(r.state, 'FAIL');
    assert.ok(r.reason_codes.includes('NON_POSITIVE_PRICE'));
  });

  it('FAIL for OHLC inconsistency (high < low)', () => {
    const r = validateBar({ open: 100, high: 95, low: 98, close: 102, volume: 1000 });
    assert.equal(r.state, 'FAIL');
  });

  it('FAIL for negative volume', () => {
    const r = validateBar({ open: 100, high: 105, low: 98, close: 102, volume: -1 });
    assert.equal(r.state, 'FAIL');
  });

  it('FAIL for empty series', () => {
    const r = validateSeries([]);
    assert.equal(r.state, 'FAIL');
  });

  it('detects duplicate candles', () => {
    const bars = [
      { open: 100, high: 105, low: 98, close: 102, volume: 1000, timestamp: '2024-01-01' },
      { open: 101, high: 106, low: 99, close: 103, volume: 1100, timestamp: '2024-01-01' },
    ];
    const r = validateSeries(bars);
    assert.equal(r.state, 'FAIL');
  });

  it('PASS feed reconciliation within tolerance', () => {
    const r = reconcileFeeds({ close: 100 }, { close: 100.05 }, { price_deviation_tolerance_pct: 0.10 });
    assert.equal(r.state, 'PASS');
  });

  it('SUSPECT feed reconciliation above tolerance', () => {
    const r = reconcileFeeds({ close: 100 }, { close: 100.20 }, { price_deviation_tolerance_pct: 0.10 });
    assert.equal(r.state, 'SUSPECT');
  });
});

// ═══════════════════════════════════════════════════════════════
// LAYER 2: REGIME DETECTION
// ═══════════════════════════════════════════════════════════════

describe('Layer 2: Regime Detection', () => {
  it('NORMAL when no thresholds breached', () => {
    const r = evaluateFastRegime({ vix: 15, vix_prev: 14, sp500_5d_return: 1.0, hy_spread_delta_bp: 3 });
    assert.equal(r.regime, 'NORMAL');
  });

  it('STRESS when single threshold breached', () => {
    const r = evaluateFastRegime({ vix: 30, vix_prev: 28, sp500_5d_return: 1.0, hy_spread_delta_bp: 3 });
    assert.equal(r.regime, 'STRESS');
  });

  it('REGIME_SHIFT when multiple thresholds breached', () => {
    const r = evaluateFastRegime({ vix: 35, vix_prev: 20, sp500_5d_return: -6.0, hy_spread_delta_bp: 15 });
    assert.equal(r.regime, 'REGIME_SHIFT');
  });

  it('detects regime break', () => {
    const recent = Array(30).fill({ regime: 'NORMAL', date: '2024-01-01' });
    const r = detectRegimeBreak('STRESS', recent);
    assert.equal(r.break_detected, true);
    assert.equal(r.dominant_regime, 'NORMAL');
    assert.ok(r.cooldown_days > 0);
  });

  it('no break when regime matches', () => {
    const recent = Array(30).fill({ regime: 'NORMAL', date: '2024-01-01' });
    const r = detectRegimeBreak('NORMAL', recent);
    assert.equal(r.break_detected, false);
  });

  it('tags training weights correctly', () => {
    const samples = [
      { regime_tag: 'NORMAL', value: 1 },
      { regime_tag: 'STRESS', value: 2 },
      { regime_tag: 'REGIME_SHIFT', value: 3 },
    ];
    const tagged = tagTrainingWeights(samples, 'NORMAL');
    assert.equal(tagged[0].regime_weight, 1.0);  // current
    assert.equal(tagged[2].regime_weight, 0.1);  // foreign
  });

  it('weekly regime falls back on empty input', () => {
    const r = evaluateWeeklyRegime([], {});
    assert.equal(r.fallback_used, true);
    assert.equal(r.min_global_state, 'ORANGE');
  });
});

// ═══════════════════════════════════════════════════════════════
// LAYER 3: AUDIT & FEEDBACK
// ═══════════════════════════════════════════════════════════════

describe('Layer 3: Audit & Feedback', () => {
  it('creates decision log with UUID', () => {
    const log = createDecisionLog({
      snapshot_id: 'snap-1',
      ticker: 'AAPL',
      feature_name: 'scientific',
      explainability_unavailable_reason: 'RULE_BASED_OUTPUT',
    });
    assert.ok(log.log_id);
    assert.equal(log.ticker, 'AAPL');
    assert.equal(log.realized_outcome, null);
  });

  it('detects repeated fallback pattern', () => {
    const logs = Array(5).fill(null).map(() => ({
      feature_name: 'scientific',
      fallback_used: true,
      data_quality_state: 'PASS',
      reason_codes: [],
    }));
    const r = detectFailurePatterns(logs);
    assert.ok(r.patterns_detected.some(p => p.includes('repeated_fallback')));
  });

  it('append-only audit log rejects overwrite', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runblock-audit-'));
    try {
      const entry = createDecisionLog({
        snapshot_id: 'snap-1',
        ticker: 'AAPL',
        feature_name: 'scientific',
        model_type: 'xgboost',
        top_3_features: ['rsi', 'macd', 'trend'],
        top_3_feature_weights: [0.4, 0.3, 0.3],
      });
      await persistDecisionLog(tmp, entry, { path: 'audit/decisions' });
      await assert.rejects(
        persistDecisionLog(tmp, entry, { path: 'audit/decisions' }),
        /AUDIT_IMMUTABLE_VIOLATION/
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('persists audit incidents append-only', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runblock-incident-'));
    try {
      const incident = createAuditIncident({
        ticker: 'AAPL',
        layer: 'data_integrity',
        code: 'LEAKAGE_ASSERTION_FAIL',
        message: 'Leakage detected',
      });
      const out = await persistAuditIncident(tmp, incident, { incident_path: 'audit/incidents' });
      assert.ok(out.endsWith('.json'));
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// LAYER 4: VALIDATION & GOVERNANCE
// ═══════════════════════════════════════════════════════════════

describe('Layer 4: Validation & Governance', () => {
  it('scientific gates PASS with good metrics', () => {
    const r = evaluateScientificGates({
      oos_accuracy: 0.75, is_accuracy: 0.80,
      brier_score: 0.20, calibration_error: 0.03,
      net_return_after_costs: 0.05, outcome_count: 100,
      leakage_pass: true, structural_instability_flag: false,
      regime_compatible: true,
      primary_window_data_quality: 'PASS',
    });
    assert.equal(r.eligible, true);
    assert.equal(r.blocking_gates.length, 0);
  });

  it('scientific gates FAIL on negative net return', () => {
    const r = evaluateScientificGates({
      oos_accuracy: 0.75, is_accuracy: 0.80,
      brier_score: 0.20, calibration_error: 0.03,
      net_return_after_costs: -0.01, outcome_count: 100,
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blocking_gates.includes('NET_RETURN_NEGATIVE'));
  });

  it('promotion decision: challenger must beat net return', () => {
    const r = promotionDecision(
      { net_return_after_costs: 0.05, brier_score: 0.22, calibration_error: 0.04 },
      { net_return_after_costs: 0.03, brier_score: 0.20, calibration_error: 0.03 }
    );
    assert.equal(r.promote, false);
  });

  it('promotion decision: positive when all criteria met', () => {
    const r = promotionDecision(
      { net_return_after_costs: 0.03, brier_score: 0.22, calibration_error: 0.04 },
      { net_return_after_costs: 0.06, brier_score: 0.18, calibration_error: 0.03 }
    );
    assert.equal(r.promote, true);
  });

  it('calibration monitor flags high brier', () => {
    const r = monitorCalibration({ brier_score: 0.30, calibration_error: 0.02, buckets: {} });
    assert.equal(r.healthy, false);
  });

  it('Elliott non-directional enforcement in V1', () => {
    const r = gateElliottOutput({ globalState: 'GREEN', dataQuality: 'PASS', v2Enabled: false });
    assert.equal(r.no_directional, true);
    assert.equal(r.mode, 'PASSIVE');
  });

  it('forecast gates hard-block missing model_type', () => {
    const r = evaluateForecastGates({
      horizons: {
        '1d': { logloss: 0.10, naive_logloss: 0.20, bucket_60_actual: 60, bucket_70_actual: 70, bucket_80_actual: 80 },
        '5d': { logloss: 0.11, naive_logloss: 0.21, bucket_60_actual: 59, bucket_70_actual: 71, bucket_80_actual: 79 },
        '20d': { logloss: 0.12, naive_logloss: 0.22, bucket_60_actual: 58, bucket_70_actual: 72, bucket_80_actual: 78 },
      },
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blocking_gates.includes('MODEL_TYPE_MISSING'));
  });

  it('Elliott V1 blocks directional score', () => {
    const r = evaluateElliottV1Gates({
      has_directional_score: true,
      invalidation_delay_days: 0,
      confluence_hit_rate: 0.5,
      flip_frequency: 0.2,
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blocking_gates.includes('ELLIOTT_V1_DIRECTIONAL_SCORE_PROHIBITED'));
  });

  it('Elliott V2 requires full statistical evidence', () => {
    const r = evaluateElliottV2Gates({
      confluence_events: 120,
      net_of_costs_evaluated: false,
      regime_separated: false,
      statistical_significance_p: 0.2,
      practical_effect_size: false,
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blocking_gates.length >= 4);
  });
});

// ═══════════════════════════════════════════════════════════════
// LAYER 5: FEATURE OUTPUT
// ═══════════════════════════════════════════════════════════════

describe('Layer 5: Feature Output', () => {
  it('blocks all output on RED', () => {
    const r = gateScientificOutput({ globalState: 'RED', dataQuality: 'PASS' });
    assert.equal(r.allowed, false);
    assert.equal(r.model_state, 'BLOCKED');
  });

  it('allows degraded output on ORANGE', () => {
    const r = gateScientificOutput({ globalState: 'ORANGE', dataQuality: 'PASS' });
    assert.equal(r.allowed, true);
    assert.equal(r.model_state, 'DEGRADED');
  });

  it('forecast blocked on RED', () => {
    const r = gateForecastOutput({ globalState: 'RED', dataQuality: 'PASS', validationReady: true });
    assert.equal(r.allowed, false);
  });

  it('forecast suppressed when validation not ready', () => {
    const r = gateForecastOutput({ globalState: 'GREEN', dataQuality: 'PASS', validationReady: false });
    assert.equal(r.state, 'SUPPRESSED');
  });
});

// ═══════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════

describe('Global State Service', () => {
  it('RED when data integrity fails', () => {
    const r = computeGlobalState({ data_integrity: { state: 'FAIL' } });
    assert.equal(r.global_state, 'RED');
  });

  it('RED when leakage fails', () => {
    const r = computeGlobalState({}, { leakage_fail: true });
    assert.equal(r.global_state, 'RED');
  });

  it('ORANGE when scientific suppressed', () => {
    const r = computeGlobalState({ scientific: { state: 'SUPPRESSED' } });
    assert.equal(r.global_state, 'ORANGE');
  });

  it('YELLOW when elliott invalidated', () => {
    const r = computeGlobalState({ elliott: { state: 'INVALIDATED' } });
    assert.equal(r.global_state, 'YELLOW');
  });

  it('GREEN when all healthy', () => {
    const r = computeGlobalState({
      data_integrity: { state: 'ACTIVE' },
      scientific: { state: 'ACTIVE' },
      forecast: { state: 'ACTIVE' },
      elliott: { state: 'ACTIVE' },
    });
    assert.equal(r.global_state, 'GREEN');
  });

  it('enforcement: RED = not allowed', () => {
    const r = enforceGlobalState('RED', {});
    assert.equal(r.allowed, false);
    assert.equal(r.mode, 'HARD_STOP');
  });
});

describe('Snapshot & Feature Hashing', () => {
  it('produces deterministic hash', () => {
    const h1 = computeFeatureHash({ features: { a: 1, b: 2 }, featureVersion: 'v1', codeVersion: 'abc', asofTimestamp: '2024-01-01', sourceVersions: {} });
    const h2 = computeFeatureHash({ features: { b: 2, a: 1 }, featureVersion: 'v1', codeVersion: 'abc', asofTimestamp: '2024-01-01', sourceVersions: {} });
    assert.equal(h1, h2); // sorted features = same hash
    assert.equal(h1.length, 64); // SHA256 hex
  });

  it('creates snapshot with all required fields', () => {
    const s = createSnapshot({ ticker: 'AAPL', tradingDate: '2024-01-01', asofTimestamp: '2024-01-01T16:00:00Z', features: { close: 150 } });
    assert.ok(s.snapshot_id);
    assert.ok(s.feature_hash);
    assert.ok(s.knowledge_time);
    assert.equal(s.ticker, 'AAPL');
  });
});

describe('Leakage Guards', () => {
  it('PASS when timestamps are valid', () => {
    const r = assertNoLeakage({
      asofTimestamp: '2024-01-01T16:00:00Z',
      labelStartTimestamp: '2024-01-02T09:30:00Z',
      featureTimestamp: '2024-01-01T15:59:00Z',
    });
    assert.equal(r.pass, true);
  });

  it('FAIL when asof >= label start (look-ahead)', () => {
    const r = assertNoLeakage({
      asofTimestamp: '2024-01-02T10:00:00Z',
      labelStartTimestamp: '2024-01-02T09:30:00Z',
      featureTimestamp: '2024-01-01T16:00:00Z',
    });
    assert.equal(r.pass, false);
    assert.ok(r.violations.length > 0);
  });

  it('FAIL when feature timestamp > asof (future data)', () => {
    const r = assertNoLeakage({
      asofTimestamp: '2024-01-01T16:00:00Z',
      labelStartTimestamp: '2024-01-02T09:30:00Z',
      featureTimestamp: '2024-01-01T17:00:00Z',
    });
    assert.equal(r.pass, false);
  });

  it('purge/embargo validation', () => {
    const r = assertPurgeEmbargo({
      trainEnd: '2024-01-01',
      valStart: '2024-01-05',
      purgeDays: 5,
      embargoDays: 5,
    });
    assert.equal(r.pass, false); // 4 calendar days < required ~14
  });
});

describe('Liquidity Buckets', () => {
  it('classifies Bucket A for high ADV', () => {
    const r = classifyBucket(50000000);
    assert.equal(r.bucket, 'A');
    assert.equal(r.tradability, true);
  });

  it('classifies Bucket D for very low ADV', () => {
    const r = classifyBucket(300000);
    assert.equal(r.bucket, 'D');
    assert.equal(r.tradability, false);
  });

  it('computes net return after costs', () => {
    const bucket = classifyBucket(50000000);
    const r = computeNetReturn(0.05, bucket); // 5% gross
    assert.ok(r.net_return_after_costs > 0);
    assert.ok(r.net_return_after_costs < 0.05);
    assert.equal(r.tradability_flag, true);
  });

  it('positive gross with bucket D still untradable', () => {
    const bucket = classifyBucket(300000);
    const r = computeNetReturn(0.05, bucket);
    assert.equal(r.tradability_flag, false);
  });
});

describe('Runblock pipeline integration', () => {
  it('wires weekly regime, snapshot persistence, audit logging and Elliott gates into executePipeline', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runblock-pipeline-'));
    try {
      const result = await executePipeline({
        ticker: 'AAPL',
        bars: [
          { open: 100, high: 102, low: 99, close: 101, volume: 1000000, timestamp: '2026-03-10T21:00:00Z' },
          { open: 101, high: 105, low: 100, close: 104, volume: 1200000, timestamp: '2026-03-11T21:00:00Z' },
        ],
        secondaryBars: [
          { open: 100, high: 102, low: 99, close: 101.01, volume: 999000, timestamp: '2026-03-10T21:00:00Z' },
          { open: 101, high: 105, low: 100, close: 104.02, volume: 1199000, timestamp: '2026-03-11T21:00:00Z' },
        ],
        marketData: { vix: 18, vix_prev: 17, sp500_5d_return: 0.8, hy_spread_delta_bp: 3 },
        weeklyRegimeFeatures: [
          { vix: 17, sp500_ret: 0.4, hy_spread: 3.8, vol_10d: 13 },
          { vix: 18, sp500_ret: 0.6, hy_spread: 3.9, vol_10d: 14 },
          { vix: 19, sp500_ret: 0.5, hy_spread: 4.0, vol_10d: 15 },
          { vix: 18, sp500_ret: 0.3, hy_spread: 3.7, vol_10d: 14 },
          { vix: 20, sp500_ret: 0.1, hy_spread: 4.1, vol_10d: 15 },
          { vix: 19, sp500_ret: 0.2, hy_spread: 4.0, vol_10d: 15 },
        ],
        recentRegimes: Array(30).fill({ regime: 'RANGE', date: '2026-03-01' }),
        recentDecisionLogs: [],
        modelMetrics: {
          scientific: {
            model_version: 'sci-1',
            model_type: 'xgboost',
            calibration_version: 'cal-sci-1',
            oos_accuracy: 0.76,
            is_accuracy: 0.80,
            brier_score: 0.20,
            calibration_error: 0.03,
            exp_ret_10d_gross: 0.08,
            outcome_count: 120,
            top_3_features: ['rsi14', 'macd_hist', 'trend_strength'],
            top_3_feature_weights: [0.4, 0.35, 0.25],
          },
          forecast: {
            model_version: 'fc-1',
            model_type: 'random_forest',
            calibration_version: 'cal-fc-1',
            top_3_features: ['ret_5d', 'volatility', 'breadth'],
            top_3_feature_weights: [0.5, 0.3, 0.2],
            horizons: {
              '1d': { logloss: 0.10, naive_logloss: 0.20, bucket_60_actual: 60, bucket_70_actual: 69, bucket_80_actual: 81 },
              '5d': { logloss: 0.11, naive_logloss: 0.22, bucket_60_actual: 58, bucket_70_actual: 72, bucket_80_actual: 79 },
              '20d': { logloss: 0.12, naive_logloss: 0.24, bucket_60_actual: 61, bucket_70_actual: 68, bucket_80_actual: 82 },
            },
          },
          elliott: {
            model_version: 'elliott-1',
            has_directional_score: false,
            invalidation_delay_days: 1,
            confluence_hit_rate: 0.57,
            flip_frequency: 0.21,
            structural_confidence: 0.72,
            request_directional: false,
          },
        },
        config: {
          pipeline_config: {
            data_integrity: { snapshot_storage: 'snapshots' },
            leakage_guards: { purge_period_days: 5, embargo_period_days: 5 },
          },
          regime_config: {
            schema_version: 'runblock.v3',
            weekly_regime: { model: 'kmeans', min_confidence: 0.5, fallback_regime: 'RANGE', fallback_global_state: 'YELLOW', model_fail_global_state: 'ORANGE' },
            regime_break: { lookback_days: 30, promotion_freeze_days: 10 },
          },
          audit_config: {
            decision_log: { path: 'audit/decisions' },
            incident_path: 'audit/incidents',
            failure_pattern_detection: { threshold_consecutive: 3 },
          },
          promotion_config: {},
          liquidity_buckets: {
            buckets: {
              A: { adv_min_usd: 10000000, spread_proxy_pct: 0.05, slippage_pct: 0.05, market_impact_pct: 0.0, tradability: true },
              B: { adv_min_usd: 1000000, spread_proxy_pct: 0.15, slippage_pct: 0.15, market_impact_pct: 0.0, tradability: true },
              C: { spread_proxy_pct: 0.50, slippage_pct: 0.50, market_impact_pct_per_adv: 0.05, tradability: true },
              D: { adv_max_usd: 500000, spread_threshold_pct: 1.0, spread_proxy_pct: 1.0, slippage_pct: 1.0, tradability: false },
            },
          },
          fallback_config: {},
        },
        rootDir: tmp,
        codeVersion: 'test-commit',
      });

      assert.equal(result.halted, false);
      assert.ok(result.layers.regime_detection.weekly_regime);
      assert.ok(result.layers.validation_governance.elliott_v1_gates);
      assert.ok(result.snapshot_path);
      assert.equal(result.audit.decision_logs.length, 3);
      assert.equal(result.output.elliott.gate.no_directional, true);
      assert.ok(result.layers.validation_governance.forecast_gates);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('halts on leakage and writes audit incident', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runblock-leakage-'));
    try {
      const result = await executePipeline({
        ticker: 'AAPL',
        bars: [
          { open: 100, high: 102, low: 99, close: 101, volume: 1000000, timestamp: '2026-03-11T21:00:00Z' },
        ],
        labelStartTimestamp: '2026-03-11T20:00:00Z',
        featureTimestamp: '2026-03-11T21:00:00Z',
        config: {
          pipeline_config: { data_integrity: {}, leakage_guards: { purge_period_days: 5, embargo_period_days: 5 } },
          audit_config: { incident_path: 'audit/incidents' },
          regime_config: {},
          fallback_config: {},
        },
        rootDir: tmp,
        codeVersion: 'test-commit',
      });

      assert.equal(result.halted, true);
      assert.equal(result.global_state, 'RED');
      assert.match(result.halt_reason, /LEAKAGE_FAIL/);
      assert.equal(result.audit.incidents.length, 1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('prefers yaml config aliases when loading runblock config', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'runblock-config-'));
    try {
      const cfgDir = path.join(tmp, 'config/runblock');
      await fs.mkdir(cfgDir, { recursive: true });
      const files = {
        pipeline_config: { schema_version: 'yaml-test', pipeline_order: ['data_integrity'] },
        regime_config: { schema_version: 'yaml-test' },
        promotion_config: { schema_version: 'yaml-test' },
        liquidity_buckets: { schema_version: 'yaml-test' },
        audit_config: { schema_version: 'yaml-test' },
        fallback_config: { schema_version: 'yaml-test' },
      };
      for (const [name, value] of Object.entries(files)) {
        await fs.writeFile(
          path.join(cfgDir, `${name}.yaml`),
          `${JSON.stringify(value, null, 2)}\n`,
          'utf-8'
        );
      }

      const config = await loadRunblockConfig(tmp);
      assert.equal(config.pipeline_config.schema_version, 'yaml-test');
      assert.deepEqual(config.pipeline_config.pipeline_order, ['data_integrity']);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
