#!/usr/bin/env node

export const CANONICAL_STEP_ID_ALIASES = Object.freeze({
  refresh_v7_history_from_eodhd: 'market_data_refresh',
  run_daily_delta_ingest_q1: 'q1_delta_ingest',
  build_quantlab_v4_daily_report: 'quantlab_daily_report',
  forecast_run_daily: 'forecast_daily',
  build_scientific_summary: 'scientific_summary',
  run_hist_probs: 'hist_probs',
  run_daily_learning_cycle: 'learning_daily',
  learning_cycle: 'learning_daily',
  build_best_setups_v4: 'snapshot',
  best_setups_v4: 'snapshot',
  diagnose_best_setups_etf_drop: 'etf_diagnostic',
  daily_audit_report: 'v1_audit',
  cutover_readiness_report: 'cutover_readiness',
  build_stock_analyzer_universe_audit: 'stock_analyzer_universe_audit',
  build_system_status_report: 'system_status_report',
  system_status: 'system_status_report',
  build_data_freshness_report: 'data_freshness_report',
  data_freshness: 'data_freshness_report',
  'safe-code-sync': 'safe_code_sync',
  build_global_scope: 'build_global_scope',
  generate_meta_dashboard_data: 'generate_meta_dashboard_data',
});

export function toCanonicalStepId(stepId) {
  const normalized = String(stepId || '').trim();
  return CANONICAL_STEP_ID_ALIASES[normalized] || normalized;
}
