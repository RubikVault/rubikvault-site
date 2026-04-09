export const SYSTEM_STATUS_DOC_REF = 'docs/ops/runbook.md';
export const SYSTEM_STATUS_RECOVERY_SCRIPT = 'scripts/ops/run-market-data-recovery.mjs';

export const SYSTEM_STATUS_STEP_CONTRACTS = {
  market_data_refresh: {
    run_command: 'node scripts/universe-v7/build-us-eu-scope.mjs && python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --from-date <YYYY-MM-DD>',
    verify_commands: [
      "jq '{generated_at,to_date,assets_requested,assets_fetched_with_data,fetch_errors_total}' mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json",
      "jq '{schema,exit_code,reason,updated_at}' public/data/universe/v7/reports/run_status.json",
    ],
    outputs: [
      'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json',
      'public/data/universe/v7/reports/run_status.json',
    ],
    ui_surfaces: [
      'dashboard_v7 -> System Health / Operations',
      'analyze-v4 trust bar freshness',
      'frontpage data-updated banner',
    ],
    failure_signals: [
      'output_asof missing or older than the latest trading day',
      'assets_fetched_with_data = 0 with output_asof null (pre-market run or quota exhaustion — re-run after market close)',
      'API_LIMIT_REACHED.lock.json present',
    ],
  },
  q1_delta_ingest: {
    run_command: 'python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>',
    verify_commands: [
      "jq '{updated_at,ingest_date,run_status}' /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json",
    ],
    outputs: [
      '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/ops/q1_daily_delta_ingest/latest_success.json',
    ],
    ui_surfaces: [
      'dashboard_v7 -> System Health / Operations',
      'QuantLab raw freshness in analyze-v4',
    ],
    failure_signals: [
      'latest_success ingest_date does not advance',
      'run_status reports non-zero exit_code',
    ],
  },
  quantlab_daily_report: {
    run_command: 'node scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    verify_commands: [
      "jq '.currentState.dataFreshness.summary,.generatedAt' public/data/quantlab/status/operational-status.json",
      "jq '.currentState.dataFreshness.summary,.reportDate' mirrors/quantlab/reports/v4-daily/latest.json",
    ],
    outputs: [
      'public/data/quantlab/status/operational-status.json',
      'mirrors/quantlab/reports/v4-daily/latest.json',
    ],
    ui_surfaces: [
      'analyze-v4 QuantLab / model evidence',
      'frontpage best-setups candidate quality',
      'dashboard_v7 QuantLab card',
    ],
    failure_signals: [
      'raw canonical or publish as-of lags current market',
      'operational freshness severity != ok',
    ],
  },
  hist_probs: {
    run_command: 'NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs',
    verify_commands: [
      "jq '{ran_at,tickers_total,tickers_processed,tickers_skipped,tickers_errors,tickers_covered,tickers_remaining,regime_date,source_mode,asset_classes,max_tickers}' public/data/hist-probs/run-summary.json",
      "jq '{date,market_regime,volatility_regime,breadth_regime}' public/data/hist-probs/regime-daily.json",
    ],
    outputs: [
      'public/data/hist-probs/run-summary.json',
      'public/data/hist-probs/regime-daily.json',
      'public/data/hist-probs/<TICKER>.json',
    ],
    ui_surfaces: [
      'analyze-v4 Historical Performance',
      'analyze-v4 Historical signal profile',
      'dashboard_v7 hist_probs card',
    ],
    failure_signals: [
      'regime_date stale',
      'run-summary processed count below universe target',
      'ETF tickers not included in asset_classes',
    ],
  },
  forecast_daily: {
    run_command: 'node scripts/forecast/run_daily.mjs',
    verify_commands: [
      "jq '{status,generated_at,data_asof:.data.asof}' public/data/forecast/latest.json",
    ],
    outputs: [
      'public/data/forecast/latest.json',
    ],
    ui_surfaces: [
      'analyze-v4 model consensus / decision inputs',
      'frontpage best-setups candidate pools',
      'dashboard_v7 forecast card',
    ],
    failure_signals: [
      'latest.json missing or status != ok',
      'data.asof stale',
    ],
  },
  scientific_summary: {
    run_command: 'node scripts/build-scientific-summary.mjs',
    verify_commands: [
      "jq '{generated_at,as_of:.source_meta.asof,signals:(.strong_signals|length)}' public/data/supermodules/scientific-summary.json",
    ],
    outputs: [
      'public/data/supermodules/scientific-summary.json',
    ],
    ui_surfaces: [
      'analyze-v4 model consensus / setup evidence',
      'dashboard_v7 scientific card',
    ],
    failure_signals: [
      'source_meta.asof missing or stale',
      'no signals and no source timestamp',
    ],
  },
  learning_daily: {
    run_command: 'node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>',
    verify_commands: [
      "jq '{date,overall_status:.summary.overall_status,learning_status:.summary.learning_status,safety_switch:.summary.safety_switch.level}' public/data/reports/learning-report-latest.json",
    ],
    outputs: [
      'public/data/reports/learning-report-latest.json',
      'public/data/reports/learning-report-latest.js',
    ],
    ui_surfaces: [
      'dashboard_v7 overall learning status',
      'frontpage / analyzer confidence calibration context',
    ],
    failure_signals: [
      'report missing',
      'forecast/scientific source_meta lagging behind market',
    ],
  },
  snapshot: {
    run_command: 'NODE_OPTIONS=--max-old-space-size=6144 node scripts/build-best-setups-v4.mjs',
    verify_commands: [
      "jq '.meta | {generated_at,data_asof,quantlab_asof,rows_emitted,verified_counts,source}' public/data/snapshots/best-setups-v4.json",
      "node scripts/learning/diagnose-best-setups-etf-drop.mjs",
    ],
    outputs: [
      'public/data/snapshots/best-setups-v4.json',
      'public/data/reports/best-setups-etf-diagnostic-latest.json',
    ],
    ui_surfaces: [
      'frontpage Top BUY candidates',
      'frontpage Stocks Breakouts Tracker',
      'dashboard_v7 candidate funnel',
    ],
    failure_signals: [
      'rows_emitted.total = 0 when upstream is healthy',
      'quantlab_asof lags data_asof',
    ],
  },
  stock_analyzer_universe_audit: {
    run_command: 'node scripts/universe-v7/build-us-eu-scope.mjs && node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --asset-classes STOCK,ETF --max-tickers 0',
    verify_commands: [
      "jq '.summary | {severity,total_assets,processed_assets,healthy_assets,affected_assets,failure_family_count,field_checks_total,full_universe}' public/data/reports/stock-analyzer-universe-audit-latest.json",
      "jq '.ordered_recovery[] | {rank,step_id,affected_assets}' public/data/reports/stock-analyzer-universe-audit-latest.json",
    ],
    outputs: [
      'public/data/reports/stock-analyzer-universe-audit-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Stock Analyzer Universe Audit',
      'analyze-v4 all panels',
    ],
    failure_signals: [
      'audit artifact missing',
      'processed_assets below total_assets',
      'failure_family_count > 0',
    ],
  },
  etf_diagnostic: {
    run_command: 'node scripts/learning/diagnose-best-setups-etf-drop.mjs',
    verify_commands: [
      "jq '{generated_at,diagnosis:.diagnosis.code,stage_counts}' public/data/reports/best-setups-etf-diagnostic-latest.json",
    ],
    outputs: [
      'public/data/reports/best-setups-etf-diagnostic-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 ETF funnel diagnosis',
      'frontpage ETF breakout/buy visibility',
    ],
    failure_signals: [
      'snapshot_etf_total = 0',
      'diagnosis code indicates rejection funnel collapse',
    ],
  },
  v1_audit: {
    run_command: 'node scripts/learning/quantlab-v1/daily-audit-report.mjs',
    verify_commands: [
      "jq '{date,timestamp,signals_today,matured_signals,hit_rate_matured}' public/data/reports/quantlab-v1-latest.json",
    ],
    outputs: [
      'public/data/reports/quantlab-v1-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 V1 audit / cutover readiness',
    ],
    failure_signals: [
      'signals_today = 0 for extended periods',
      'matured_signals = 0',
    ],
  },
  cutover_readiness: {
    run_command: 'node scripts/learning/quantlab-v1/cutover-readiness-report.mjs',
    verify_commands: [
      "ls -1 mirrors/learning/quantlab-v1/reports/cutover-readiness-*.json | tail -n 1",
    ],
    outputs: [
      'mirrors/learning/quantlab-v1/reports/cutover-readiness-<DATE>.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Cutover Readiness',
    ],
    failure_signals: [
      'cutover_recommended = false',
      'criteria_failed not empty',
    ],
  },
};

// SSOT violation contracts — each describes a detectable invariant that, when broken,
// means the system is NOT honoring its own single-source-of-truth rules.
// Fields: id, title, ssot_doc, rule, severity_if_violated, fix_command, success_signal
export const SSOT_VIOLATION_CONTRACTS = [
  {
    id: 'hist_probs_missing_etf_class',
    title: 'hist_probs ran without ETF asset class',
    ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
    rule: 'run_command requires --asset-classes STOCK,ETF. If the last run omitted ETF, ETF historical profiles are missing from analyze-v4.',
    severity_if_violated: 'critical',
    fix_command: 'NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs',
    success_signal: 'run-summary.json asset_classes includes both STOCK and ETF',
  },
  {
    id: 'hist_probs_limited_runner',
    title: 'hist_probs ran with explicit ticker list instead of full registry',
    ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
    rule: 'run_command specifies --max-tickers 0 (unlimited). If last run used source_mode=explicit_tickers with a capped list, coverage is incomplete.',
    severity_if_violated: 'warning',
    fix_command: 'NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs',
    success_signal: 'run-summary.json source_mode=registry and tickers_total matches universe size',
  },
  {
    id: 'quantlab_canonical_lag',
    title: 'QuantLab canonical data exceeds the expected label-window lag',
    ssot_doc: 'docs/ops/runbook.md (Canonical Recovery Order step 2)',
    rule: 'QuantLab canonical partitions structurally lag raw any-data by the forward-label window. Only excess lag beyond the expected window is a violation.',
    severity_if_violated: 'warning',
    fix_command: 'python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>',
    success_signal: 'latestCanonicalRequiredDataDate stays within the expected label-window lag of latestAnyRequiredDataDate',
  },
  {
    id: 'snapshot_quantlab_asof_lag',
    title: 'Snapshot quantlab_asof exceeds the expected label-window lag',
    ssot_doc: 'docs/ops/runbook.md (Step Contract: Best Setups Snapshot)',
    rule: 'Snapshot quantlab_asof may trail market data by the expected QuantLab label window. Only excess lag beyond that window is a violation.',
    severity_if_violated: 'warning',
    fix_command: 'node scripts/quantlab/build_quantlab_v4_daily_report.mjs && node scripts/build-best-setups-v4.mjs',
    success_signal: 'snapshot.meta.quantlab_asof stays within the expected label-window lag of snapshot.meta.data_asof',
  },
  {
    id: 'market_refresh_no_data',
    title: 'Market data refresh ran but returned zero data points',
    ssot_doc: 'docs/ops/runbook.md (Step Contract: Market Data Refresh)',
    rule: 'A refresh run that completes without error must return data for at least 1 asset. Zero assets_fetched_with_data means no data can flow to any downstream step.',
    severity_if_violated: 'warning',
    fix_command: 'python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --allowlist-path public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json --from-date <YYYY-MM-DD>',
    success_signal: 'refresh report assets_fetched_with_data > 0 and output_asof is a valid market date',
  },
];

export const STOCK_ANALYZER_WEB_VALIDATION_CHAIN = [
  {
    id: 'provider_to_history',
    label: 'Provider -> canonical v7 history',
    surface: 'dashboard_v7 + analyze-v4 freshness',
    check_command: "jq '.steps.market_data_refresh' public/data/reports/system-status-latest.json",
    fix_command: SYSTEM_STATUS_STEP_CONTRACTS.market_data_refresh.run_command,
    success_signal: 'market_data_refresh severity=ok and output_asof on the latest trading day',
  },
  {
    id: 'history_to_quantlab',
    label: 'v7 history -> delta ingest -> QuantLab publish',
    surface: 'analyze-v4 trust line + frontpage snapshot inputs',
    check_command: "jq '.steps.q1_delta_ingest,.steps.quantlab_daily_report' public/data/reports/system-status-latest.json",
    fix_command: `${SYSTEM_STATUS_STEP_CONTRACTS.q1_delta_ingest.run_command} && ${SYSTEM_STATUS_STEP_CONTRACTS.quantlab_daily_report.run_command}`,
    success_signal: 'q1_delta_ingest and quantlab_daily_report both ok with current as-of dates',
  },
  {
    id: 'model_sources',
    label: 'Forecast + scientific',
    surface: 'model consensus / live decision inputs',
    check_command: "jq '.steps.forecast_daily,.steps.scientific_summary' public/data/reports/system-status-latest.json",
    fix_command: `${SYSTEM_STATUS_STEP_CONTRACTS.forecast_daily.run_command} && ${SYSTEM_STATUS_STEP_CONTRACTS.scientific_summary.run_command}`,
    success_signal: 'forecast and scientific artifacts are current and non-missing',
  },
  {
    id: 'historical_modules',
    label: 'Historical profile generation',
    surface: 'analyze-v4 Historical Performance + Historical signal profile',
    check_command: "jq '.steps.hist_probs' public/data/reports/system-status-latest.json",
    fix_command: SYSTEM_STATUS_STEP_CONTRACTS.hist_probs.run_command,
    success_signal: 'hist_probs freshness ok and coverage target reached for requested asset classes',
  },
  {
    id: 'snapshot_and_frontpage',
    label: 'Snapshot build',
    surface: 'frontpage buy lists + breakouts',
    check_command: "jq '.steps.snapshot' public/data/reports/system-status-latest.json",
    fix_command: SYSTEM_STATUS_STEP_CONTRACTS.snapshot.run_command,
    success_signal: 'snapshot rows emitted and the frontpage candidate source is current',
  },
  {
    id: 'learning_governance',
    label: 'Learning governance state',
    surface: 'dashboard_v7 learning status / analyzer safety context',
    check_command: "jq '.steps.learning_daily' public/data/reports/system-status-latest.json",
    fix_command: SYSTEM_STATUS_STEP_CONTRACTS.learning_daily.run_command,
    success_signal: 'learning report is available when governance/readiness must be refreshed',
  },
  {
    id: 'api_contracts',
    label: 'API contracts -> UI adapters',
    surface: 'analyze-v4 data integrity',
    check_command: 'node --test tests/dashboard_v7_meta.test.mjs tests/system-status-runbook.test.mjs tests/v2-data-integrity.test.mjs',
    fix_command: 'node scripts/ci/verify-stock-ui-artifacts.mjs',
    success_signal: 'contract tests green and stock UI artifacts valid',
  },
  {
    id: 'dashboard_refresh',
    label: 'Status artifact -> dashboard_v7',
    surface: 'http://127.0.0.1:8788/dashboard_v7',
    check_command: 'node scripts/ops/build-system-status-report.mjs && node scripts/generate_meta_dashboard_data.mjs',
    fix_command: 'node scripts/ops/build-system-status-report.mjs && node scripts/generate_meta_dashboard_data.mjs',
    success_signal: 'dashboard_v7 reflects the current status artifacts without stale cache or missing fields',
  },
];
