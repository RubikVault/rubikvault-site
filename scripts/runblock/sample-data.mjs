function formatDate(offsetDays) {
  const base = new Date(Date.UTC(2026, 1, 1));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export function buildSampleBars({ count = 30, startClose = 100, volume = 240000 } = {}) {
  const bars = [];
  let priorClose = startClose;
  for (let index = 0; index < count; index += 1) {
    const close = Number((startClose + index * 0.85 + (index % 4) * 0.18).toFixed(2));
    const open = Number((priorClose + 0.15).toFixed(2));
    const high = Number((Math.max(open, close) + 1.1).toFixed(2));
    const low = Number((Math.min(open, close) - 0.9).toFixed(2));
    bars.push({
      timestamp: formatDate(index),
      open,
      high,
      low,
      close,
      volume: volume + index * 2000,
    });
    priorClose = close;
  }
  return bars;
}

export function buildSampleWeeklyRegimeFeatures() {
  return [
    { vix: 17, sp500_ret: 0.4, hy_spread: 3.8, vol_10d: 13 },
    { vix: 18, sp500_ret: 0.2, hy_spread: 3.9, vol_10d: 14 },
    { vix: 16, sp500_ret: 0.6, hy_spread: 3.7, vol_10d: 12 },
    { vix: 18, sp500_ret: 0.3, hy_spread: 4.0, vol_10d: 14 },
    { vix: 17, sp500_ret: 0.5, hy_spread: 3.8, vol_10d: 13 },
    { vix: 19, sp500_ret: 0.1, hy_spread: 4.1, vol_10d: 15 },
  ];
}

export function buildSampleRunblockInput({ ticker = 'AAPL' } = {}) {
  const bars = buildSampleBars();
  const secondaryBars = bars.map((bar, index) => ({
    ...bar,
    close: Number((bar.close * (1 + ((index % 2 === 0 ? 0.0004 : -0.0003)))).toFixed(2)),
  }));

  return {
    ticker,
    bars,
    secondaryBars,
    marketData: {
      vix: 18,
      vix_prev: 17,
      sp500_5d_return: 1.2,
      hy_spread_delta_bp: 4,
    },
    weeklyRegimeFeatures: buildSampleWeeklyRegimeFeatures(),
    recentRegimes: Array.from({ length: 30 }, (_, index) => ({
      regime: 'RANGE',
      date: formatDate(index),
    })),
    recentDecisionLogs: [
      { feature_name: 'scientific', fallback_used: false, data_quality_state: 'PASS', reason_codes: [] },
      { feature_name: 'forecast', fallback_used: false, data_quality_state: 'PASS', reason_codes: [] },
    ],
    modelMetrics: {
      scientific: {
        model_version: 'scientific.rf.v3',
        model_type: 'random_forest',
        calibration_version: 'scientific.cal.v3',
        oos_accuracy: 0.79,
        is_accuracy: 0.84,
        brier_score: 0.18,
        calibration_error: 0.03,
        exp_ret_10d_gross: 0.042,
        outcome_count: 140,
        leakage_pass: true,
        structural_instability_flag: false,
        regime_compatible: true,
        current_regime: 'RANGE',
        validation_regime: 'RANGE',
        primary_window_data_quality: 'PASS',
        p_pos_10d: 0.67,
        exp_dd_10d: 0.018,
        regime_fit: 0.81,
        liquidity_cost_score: 0.89,
        top_3_features: ['rsi_14', 'macd_histogram', 'trend_strength'],
        top_3_feature_weights: [0.42, 0.33, 0.25],
      },
      forecast: {
        model_version: 'forecast.xgb.v3',
        model_type: 'xgboost',
        calibration_version: 'forecast.cal.v3',
        leakage_pass: true,
        structural_instability_flag: false,
        top_3_features: ['return_5d', 'atr_14', 'volume_surge'],
        top_3_feature_weights: [0.39, 0.34, 0.27],
        horizons: {
          '1d': { logloss: 0.10, naive_logloss: 0.20, bucket_60_actual: 60, bucket_70_actual: 69, bucket_80_actual: 79 },
          '5d': { logloss: 0.11, naive_logloss: 0.21, bucket_60_actual: 61, bucket_70_actual: 70, bucket_80_actual: 81 },
          '20d': { logloss: 0.12, naive_logloss: 0.22, bucket_60_actual: 58, bucket_70_actual: 72, bucket_80_actual: 78 },
        },
        outputs: {
          '1d': { direction_prob: 0.58, expected_move_net: 0.006, uncertainty_band: [0.002, 0.010] },
          '5d': { direction_prob: 0.63, expected_move_net: 0.018, uncertainty_band: [0.010, 0.028] },
          '20d': { direction_prob: 0.69, expected_move_net: 0.043, uncertainty_band: [0.024, 0.061] },
        },
      },
      elliott: {
        model_version: 'elliott.passive.v1',
        has_directional_score: false,
        invalidation_delay_days: 1,
        confluence_hit_rate: 0.56,
        flip_frequency: 0.18,
        passive_structure_map: 'Range floor holding with upside alternatives intact.',
        fib_confluence_zones: ['104.5-105.3', '108.8-109.4'],
        invalidation_levels: ['99.2'],
        timeframe_conflict_score: 0.21,
        alternative_structure_hypotheses: ['extended wave-B range'],
        confluence_score: 0.58,
        structural_confidence: 0.62,
        request_directional: false,
      },
    },
    codeVersion: 'local-runblock-v3',
    sourceVersions: {
      primary_feed: 'sample.primary.v1',
      secondary_feed: 'sample.secondary.v1',
    },
    uiPayloadVersion: 'runblock.ui.v3',
  };
}

export function buildShadowEvaluationInput() {
  return {
    shadow_days: 21,
    regime_break_active: false,
    structural_instability_flag: false,
    challenger_leakage_pass: true,
    champion: {
      net_return_after_costs: 0.021,
      brier_score: 0.22,
      calibration_error: 0.04,
    },
    challenger: {
      net_return_after_costs: 0.036,
      brier_score: 0.19,
      calibration_error: 0.032,
    },
  };
}
