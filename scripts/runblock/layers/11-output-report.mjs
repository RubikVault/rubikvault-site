/**
 * V6.0 — Layer 11: Output & Daily Governance Report
 *
 * Builds standardized governance report and per-ticker output.
 */

/**
 * Build daily governance report from pipeline results.
 *
 * @param {Object} params
 * @returns {Object} Governance report
 */
export function buildDailyGovernanceReport({
  reportDate,
  systemVersion = '6.0.0',
  dsrMetrics = {},
  calibrationMetrics = {},
  systemHealth = {},
  decisionQuality = {},
  benchmarkComparison = {},
}) {
  return {
    report_date: reportDate || new Date().toISOString().slice(0, 10),
    system_version: systemVersion,
    overfitting_health: {
      dsr_min_production_signal: dsrMetrics.dsr_min ?? null,
      signals_below_threshold: dsrMetrics.signals_below_threshold ?? 0,
      global_fdr_current_pass_rate: dsrMetrics.fdr_pass_rate ?? null,
    },
    calibration_health: {
      brier_score_30d: calibrationMetrics.brier_30d ?? null,
      monotonicity_violations_30d: calibrationMetrics.monotonicity_violations ?? 0,
    },
    system_health: {
      system_confidence: systemHealth.system_confidence ?? null,
      system_state: systemHealth.system_state ?? 'NORMAL',
      stress_score: systemHealth.stress_score ?? null,
      crash_state: systemHealth.crash_state ?? 'normal',
    },
    decision_quality: {
      high_conviction_hit_rate_90d: decisionQuality.high_conviction_hit_rate ?? null,
      moderate_hit_rate_90d: decisionQuality.moderate_hit_rate ?? null,
      weak_hit_rate_90d: decisionQuality.weak_hit_rate ?? null,
    },
    benchmark_comparison: benchmarkComparison,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Build per-ticker V6 output document.
 *
 * @param {Object} params
 * @returns {Object} V6 output for a single ticker
 */
export function buildTickerOutput({
  assetId,
  ticker,
  date,
  horizons = {},
  ensembleView = {},
  riskExecution = {},
  governance = {},
}) {
  return {
    asset_id: assetId || ticker,
    ticker,
    date,
    horizons,
    ensemble_view: {
      ensemble_bias: ensembleView.ensemble_bias ?? null,
      cross_horizon_consistency_score: ensembleView.cross_horizon_consistency_score ?? null,
      summary_state: ensembleView.summary_state ?? 'neutral_consensus',
    },
    risk_execution: riskExecution,
    governance: {
      oracle_version: governance.oracle_version ?? '6.0.0',
      strategy_version: governance.strategy_version ?? '6.0.0',
      trial_id: governance.trial_id ?? null,
      calibration_mode: governance.calibration_mode ?? 'bootstrap',
    },
  };
}

/**
 * Compute decision quality metrics from decision history.
 *
 * @param {Array} decisionHistory - [{ bucket, outcome_positive: boolean }]
 * @returns {Object} Decision quality metrics
 */
export function computeDecisionQualityMetrics(decisionHistory) {
  const buckets = ['HIGH_CONVICTION', 'MODERATE', 'WEAK', 'NO_TRADE'];
  const metrics = {};

  for (const bucket of buckets) {
    const entries = decisionHistory.filter(d => d.bucket === bucket && d.outcome_positive != null);
    const total = entries.length;
    const hits = entries.filter(d => d.outcome_positive).length;
    metrics[bucket.toLowerCase()] = {
      hit_rate: total > 0 ? Number((hits / total).toFixed(4)) : null,
      total,
      hits,
    };
  }

  // Monotonicity check: HIGH_CONVICTION hit_rate > MODERATE > WEAK
  const hcHr = metrics.high_conviction?.hit_rate ?? 0;
  const modHr = metrics.moderate?.hit_rate ?? 0;
  const weakHr = metrics.weak?.hit_rate ?? 0;
  const monotonicityValid = hcHr >= modHr && modHr >= weakHr;

  return {
    ...metrics,
    monotonicity_valid: monotonicityValid,
    monotonicity_violations: monotonicityValid ? 0 : 1,
  };
}
