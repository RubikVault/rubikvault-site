export const SYSTEM_STATUS_DOC_REF = 'docs/ops/runbook.md';
export const SYSTEM_STATUS_RECOVERY_SCRIPT = 'scripts/ops/run-market-data-recovery.mjs';

export const SYSTEM_STATUS_STEP_CONTRACTS = {
  market_data_refresh: {
    run_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; node scripts/universe-v7/build-global-scope.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file "${RV_EODHD_ENV_FILE:-$NAS_DEV_ROOT/.env.local}" --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date <YYYY-MM-DD> --to-date <YYYY-MM-DD> --bulk-last-day --bulk-exchange-cost "${RV_EODHD_BULK_EXCHANGE_COST:-100}" --global-lock-path "${RV_EODHD_GLOBAL_LOCK_PATH:-mirrors/universe-v7/state/eodhd-global.lock}" --max-eodhd-calls "${RV_MARKET_REFRESH_MAX_EODHD_CALLS:-0}" --max-retries "${RV_MARKET_REFRESH_MAX_RETRIES:-1}" --timeout-sec "${RV_MARKET_REFRESH_TIMEOUT_PER_REQUEST_SEC:-60}" --flush-every "${RV_MARKET_REFRESH_FLUSH_EVERY:-250}" --concurrency "${RV_MARKET_REFRESH_CONCURRENCY:-12}" --progress-every "${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"',
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
    lessons_learned: 'Runs during market hours return partial data (EODHD day not yet closed). Schedule at ≥23:00 ET. assets_fetched_with_data=0 before market close is normal — not an error. API_LIMIT_REACHED.lock.json means quota exhausted; wait for reset or swap API key.',
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
    lessons_learned: 'Noop detection is intentional — if no packs changed, ingest skips and downstream QuantLab continues on the same partitions. Only re-run if upstream refresh has actually advanced. evidence_complete=false means the artifact is incomplete and cannot be trusted for release decisions.',
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
    lessons_learned: 'latestCanonicalRequiredDataDate lags latestAnyRequiredDataDate by the ML label window — structural, not a bug. Only excess lag beyond the window is a violation. Report freshness reflects publish asof, not raw-bar asof. latestCanonicalRequiredDataDate was 33 days stale (2026-03-11) due to missing auto-update — monitor this field.',
  },
  hist_probs: {
    run_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; HIST_PROBS_WRITE_MODE="${HIST_PROBS_WRITE_MODE:-bucket_only}" HIST_PROBS_MIN_COVERAGE_RATIO="${HIST_PROBS_MIN_COVERAGE_RATIO:-0.95}" HIST_PROBS_DEFER_IF_REMAINING_OVER="${HIST_PROBS_DEFER_IF_REMAINING_OVER:-10000}" NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES"',
    verify_commands: [
      "jq '{ran_at,tickers_total,tickers_processed,tickers_skipped,tickers_errors,tickers_covered,tickers_remaining,regime_date,source_mode,asset_classes,max_tickers}' public/data/hist-probs/run-summary.json",
      "jq '{date,market_regime,volatility_regime,breadth_regime}' public/data/hist-probs/regime-daily.json",
      "jq '{target_market_date,remaining_tickers,threshold,last_good_regime_date}' public/data/hist-probs/deferred-latest.json 2>/dev/null || true",
    ],
    outputs: [
      'public/data/hist-probs/run-summary.json',
      'public/data/hist-probs/regime-daily.json',
      'public/data/hist-probs/deferred-latest.json',
      'public/data/hist-probs/<TICKER>.json',
    ],
    ui_surfaces: [
      'analyze-v4 Historical Performance',
      'analyze-v4 Historical signal profile',
      'dashboard_v7 hist_probs card',
    ],
    failure_signals: [
      'regime_date stale',
      'deferred-latest.json target_market_date matches current target',
      'artifact_freshness_ratio below 0.95',
      'run-summary processed count below universe target',
      'active RV_GLOBAL_ASSET_CLASSES not included in run-summary asset_classes',
    ],
    lessons_learned: '45–90 min for historical full universe under normal daily deltas; post-backfill runs can be much longer. Always pass the shared RV_GLOBAL_ASSET_CLASSES value into hist-probs; ETF/INDEX omissions are silent coverage gaps. INACTIVE_TOLERANCE=20 trading days (was 5, now fixed). Write-verification added after each file write. fresh_skipped checkpoint enables crash recovery and idempotency.',
  },
  hist_probs_v2_shadow: {
    run_command: 'node scripts/hist-probs-v2/run-daily-shadow-step.mjs --date=<YYYY-MM-DD> --max-assets="${RV_HIST_PROBS_V2_MAX_ASSETS:-300}" --error-assets="${RV_HIST_PROBS_V2_ERROR_ASSETS:-200}" --timeout-ms="${RV_HIST_PROBS_V2_TIMEOUT_MS:-600000}"',
    verify_commands: [
      "jq '{generated_at,status,target_market_date,processed:.coverage.processed_assets,predictions:.coverage.predictions,timed_out:.performance.timed_out}' public/data/reports/hist-probs-v2-latest.json",
      "jq '{status,errors,expected_min_assets}' public/data/reports/hist-probs-v2-validation-latest.json",
    ],
    outputs: [
      'public/data/reports/hist-probs-v2-latest.json',
      'public/data/reports/hist-probs-v2-validation-latest.json',
      'mirrors/hist-probs-v2/runs/latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 hist_probs v2 shadow detail',
      'public/data/reports/hist-probs-comparison-latest.json',
    ],
    failure_signals: [
      'target_market_date stale',
      'processed_assets < 300',
      'predictions = 0',
      'timed_out = true',
      'validation status != ok',
    ],
    lessons_learned: 'v2 is diagnostic only. It must never mutate BUY verdicts or replace v1 until 60 trading-days shadow plus A/B promotion gates pass. Failure is a warning detail, not release-blocking.',
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
    lessons_learned: 'Silent quality degradation when quantlab_daily_report is stale. Always verify data_asof alignment between forecast output and quantlab canonical date before treating forecast as fresh. A data_asof gap > 2 trading days indicates an upstream stale source, not a forecast engine bug.',
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
    lessons_learned: 'source_meta.asof must equal or exceed the QuantLab canonical date. An empty signals array with a fresh asof is valid (regime with no strong setups). An empty signals array with a stale asof means upstream ingest has not advanced.',
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
    lessons_learned: 'Learning cycle is a downstream observer of forecast and scientific summary — it will not advance if either source is stale. safety_switch escalation is intentional when model accuracy drops; do not manually override. overall_status=DEGRADED with safety_switch=ACTIVE means the system is protecting live signal quality.',
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
    lessons_learned: 'rows_emitted.total=0 almost always means quantlab_asof lags data_asof by more than the tolerated window. ETF count drops silently when ETF hist-probs run was omitted. diagnose-best-setups-etf-drop.mjs is the diagnostic tool — run it before re-running build-best-setups-v4. CRITICAL: Snapshot must run AFTER hist-probs is fresh. Assets with minimum_n_not_met=true and stale hist-probs are now gated out of BUY lists at row level.',
  },
  stock_analyzer_universe_audit: {
    run_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; node scripts/universe-v7/build-global-scope.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-stock-analyzer-universe-audit.mjs --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --asset-classes "$RV_GLOBAL_ASSET_CLASSES" --max-tickers 0 --live-sample-size 0 && if [ -f public/data/ops/stock-analyzer-operability-latest.json ]; then node scripts/ops/build-stock-analyzer-operability.mjs; fi',
    verify_commands: [
      "jq '.summary | {severity,total_assets,processed_assets,healthy_assets,affected_assets,failure_family_count,field_checks_total,full_universe}' public/data/reports/stock-analyzer-universe-audit-latest.json",
      "jq '.ordered_recovery[] | {rank,step_id,affected_assets}' public/data/reports/stock-analyzer-universe-audit-latest.json",
      "jq '.summary | {coverage_denominator,targetable_assets,targetable_operational_assets,targetable_green_ratio,release_blocked}' public/data/ops/stock-analyzer-operability-summary-latest.json",
    ],
    outputs: [
      'public/data/reports/stock-analyzer-universe-audit-latest.json',
      'public/data/ops/stock-analyzer-operability-summary-latest.json',
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
    lessons_learned: 'Full audit (--max-tickers 0) is global and must use the active RV_GLOBAL_ASSET_CLASSES contract on assets.global scope. artifact_only mode runs without wrangler and is the default for automated pipelines. artifact_hist_probs_stale is the most common critical family; run hist-probs catch-up first. sampled_mode=true means the audit result can never qualify as release_eligible.',
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
    lessons_learned: 'ETF count in best-setups-v4 can silently drop to zero if hist-probs was run without the active RV_GLOBAL_ASSET_CLASSES contract. Runs fast (< 30 sec) and can be run standalone. diagnosis_code=ETF_HIST_PROBS_MISSING means ETF hist-probs artifact is absent.',
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
    lessons_learned: 'V1 signals mature 5 trading days after entry. signals_today=0 with matured_signals>0 is normal (no new entries today). Persistent matured_signals=0 over multiple days indicates the signal generation pipeline has stalled upstream.',
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
    lessons_learned: 'Cutover is gated on 7 consecutive days of legacy_shadow_write_total=0 and legacy_artifact_read_total=0 in the production context. criteria_failed items are authoritative — do not mark cutover ready manually.',
  },
  system_status_report: {
    run_command: 'node scripts/ops/build-system-status-report.mjs',
    verify_commands: [
      "jq '.summary | {severity,healthy,target_market_date,release_ready,ui_green}' public/data/reports/system-status-latest.json",
    ],
    outputs: [
      'public/data/reports/system-status-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
    ],
    failure_signals: [
      'report missing',
      'tracked_step_ids missing pipeline steps',
    ],
    lessons_learned: 'System status is an observer, not the release authority. It should explain the current control-plane state, never invent it. Rebuild it only after the upstream artifacts for the same target market date exist.',
  },
  data_freshness_report: {
    run_command: 'node scripts/ops/build-data-freshness-report.mjs',
    verify_commands: [
      "jq '.summary | {severity,healthy,expected_eod,unhealthy_families}' public/data/reports/data-freshness-latest.json",
      "jq '.families_by_id.fundamentals_scope | {expected_total,fresh_count,stale_count,missing_count,freshness_limit_trading_days}' public/data/reports/data-freshness-latest.json",
    ],
    outputs: [
      'public/data/reports/data-freshness-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
      'dashboard_v7 fundamentals freshness diagnostics',
    ],
    failure_signals: [
      'expected_eod missing',
      'fundamentals_scope stale_count or missing_count > 0 for prioritized assets',
    ],
    lessons_learned: 'Fundamentals freshness is tracked only for the prioritized scope and is warning-only by policy. Hist-probs and market-history remain blocking; fundamentals do not.',
  },
  pipeline_epoch: {
    run_command: 'node scripts/ops/build-pipeline-epoch.mjs',
    verify_commands: [
      "jq '{target_market_date,pipeline_ok,minimum_blocking_module_date,run_id}' public/data/pipeline/epoch.json",
      "jq '.modules | with_entries(.value |= {as_of,run_id,coverage_promise})' public/data/pipeline/epoch.json",
    ],
    outputs: [
      'public/data/pipeline/epoch.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
    ],
    failure_signals: [
      'pipeline_ok = false',
      'core modules have run_id = null',
      'module as_of mismatches target_market_date',
    ],
    lessons_learned: 'A fresh epoch without module run_ids is not a valid control-plane success. It is only a timestamped shell. Module coherence matters more than file recency.',
  },
  ui_field_truth_report: {
    run_command: 'node scripts/ops/build-ui-field-truth-report.mjs --page-core-only --page-core-latest-path public/data/page-core/candidates/latest.candidate.json --date=<YYYY-MM-DD>',
    verify_commands: [
      "jq '{ui_field_truth_ok,summary:{tickers_checked,failures,advisories},critical_endpoints,optional_endpoints}' public/data/reports/ui-field-truth-report-latest.json",
    ],
    outputs: [
      'public/data/reports/ui-field-truth-report-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
      'Stock Analyzer UI truth gate',
    ],
    failure_signals: [
      'critical endpoint failures present',
      'wrangler offline during live check',
    ],
    lessons_learned: 'Fundamentals is optional in UI truth. A fundamentals miss should be advisory only. If wrangler is offline, that is a runtime/readiness problem, not a field-truth defect in the artifacts themselves.',
  },
  final_integrity_seal: {
    run_command: 'node scripts/ops/final-integrity-seal.mjs',
    verify_commands: [
      "jq '{release_ready,ui_green,target_market_date,blocking_reasons,required_gates,key_id}' public/data/ops/final-integrity-seal-latest.json",
    ],
    outputs: [
      'public/data/ops/final-integrity-seal-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 global status',
      'release gate',
    ],
    failure_signals: [
      'release_ready = false',
      'ui_green = false',
      'blocking_reasons not empty',
    ],
    lessons_learned: 'Final seal is the only release SSOT. NAS reachability is advisory by default; fundamentals are non-blocking by policy. If the seal disagrees with observers, trust the seal and rebuild the observers from the same run.',
  },
  build_deploy_bundle: {
    run_command: 'node scripts/ops/build-deploy-bundle.mjs',
    verify_commands: [
      "jq '{generated_at,target_market_date,bundle_id,release_ready}' dist/pages-prod/data/ops/build-bundle-meta.json",
    ],
    outputs: [
      'dist/pages-prod/data/ops/build-bundle-meta.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
    ],
    failure_signals: [
      'bundle meta missing',
      'bundle target market date mismatches seal',
    ],
    lessons_learned: 'Bundle generation is downstream of the seal. If this step is red while the seal is green, treat it as publish-path drift, not a data-plane failure.',
  },
  wrangler_deploy: {
    run_command: 'node scripts/ops/release-gate-check.mjs && wrangler pages deploy',
    verify_commands: [
      "jq '{generated_at,target_market_date,release_ready,deploy_status,proof_mode}' public/data/ops/deploy-proof-latest.json",
    ],
    outputs: [
      'public/data/ops/deploy-proof-latest.json',
    ],
    ui_surfaces: [
      'dashboard_v7 Operations / Pipeline Waterfall',
    ],
    failure_signals: [
      'deploy proof missing',
      'release gate rejects dirty tree or invalid seal',
    ],
    lessons_learned: 'Deploy is the last mile, not the authority. The release gate must only accept a valid final seal and a clean enough publish context.',
  },
};

export const PIPELINE_STEP_ORDER = [
  'market_data_refresh',
  'q1_delta_ingest',
  'quantlab_daily_report',
  'hist_probs',
  'hist_probs_v2_shadow',
  'forecast_daily',
  'scientific_summary',
  'learning_daily',
  'snapshot',
  'etf_diagnostic',
  'v1_audit',
  'cutover_readiness',
  'stock_analyzer_universe_audit',
  'system_status_report',
  'data_freshness_report',
  'pipeline_epoch',
  'ui_field_truth_report',
  'final_integrity_seal',
  'build_deploy_bundle',
  'wrangler_deploy',
];

// SSOT violation contracts — each describes a detectable invariant that, when broken,
// means the system is NOT honoring its own single-source-of-truth rules.
// Fields: id, title, ssot_doc, rule, severity_if_violated, fix_command, success_signal
export const SSOT_VIOLATION_CONTRACTS = [
  {
    id: 'hist_probs_missing_etf_class',
    title: 'hist_probs ran without a required asset class',
    ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
    rule: 'run_command requires --asset-classes "$RV_GLOBAL_ASSET_CLASSES" with STOCK, ETF, and INDEX unless the global contract is explicitly narrowed. If the last run omitted an active class, historical profiles are missing from analyze-v4.',
    severity_if_violated: 'critical',
    fix_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES"',
    success_signal: 'run-summary.json asset_classes includes STOCK, ETF, and INDEX',
  },
  {
    id: 'hist_probs_limited_runner',
    title: 'hist_probs ran with explicit ticker list instead of full registry',
    ssot_doc: 'scripts/ops/system-status-ssot.mjs (hist_probs.run_command)',
    rule: 'run_command specifies --max-tickers 0 (unlimited). If last run used source_mode=explicit_tickers with a capped list, coverage is incomplete.',
    severity_if_violated: 'warning',
    fix_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; NODE_OPTIONS=--max-old-space-size=6144 node run-hist-probs-turbo.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES"',
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
    fix_command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF,INDEX}"; node scripts/universe-v7/build-global-scope.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file "${RV_EODHD_ENV_FILE:-.env.local}" --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date <YYYY-MM-DD> --to-date <YYYY-MM-DD> --bulk-last-day --bulk-exchange-cost "${RV_EODHD_BULK_EXCHANGE_COST:-100}" --global-lock-path "${RV_EODHD_GLOBAL_LOCK_PATH:-mirrors/universe-v7/state/eodhd-global.lock}" --max-eodhd-calls "${RV_MARKET_REFRESH_MAX_EODHD_CALLS:-0}" --max-retries "${RV_MARKET_REFRESH_MAX_RETRIES:-1}" --timeout-sec "${RV_MARKET_REFRESH_TIMEOUT_PER_REQUEST_SEC:-60}" --flush-every "${RV_MARKET_REFRESH_FLUSH_EVERY:-250}" --concurrency "${RV_MARKET_REFRESH_CONCURRENCY:-12}" --progress-every "${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"',
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

// ─── Release State Schema ─────────────────────────────────────────────────────
//
// Canonical schema for public/data/ops/release-state-latest.json
// Written by: Master supervisor / authority projection only
// Read by:    release-gate-check.mjs, dashboard_v7, monitoring scripts
//
// This is an authoritative control-plane projection. Deploy allow/deny is derived
// from final-integrity-seal-latest.json, not from legacy release phases.

export const RELEASE_STATE_SCHEMA = {
  schema: 'rv_release_state_v3',
  phase: 'WAIT_FOR_SOURCE_DATA',
  target_market_date: null,
  blocker: null,
  blockers: [],
  ui_green: false,
  release_ready: false,
  full_universe_validated: false,
  allowed_launchd_only: false,
  final_integrity_seal_ref: 'public/data/ops/final-integrity-seal-latest.json',
  control_plane: null,
  started_at: null,
  completed_at: null,
  last_updated: null,
};

// ─── Deploy Proof Schema ──────────────────────────────────────────────────────
//
// Canonical schema for public/data/ops/deploy-proof-latest.json
// Written by: scripts/ops/release-gate-check.mjs after successful wrangler deploy
// Read by:    monitoring, dashboard_v7, CI verification

export const DEPLOY_PROOF_SCHEMA = {
  schema: 'rv_deploy_proof_v1',
  // Git commit SHA that was deployed
  deployed_commit: null,
  // Cloudflare deployment ID (from wrangler output)
  deployment_id: null,
  // Cloudflare deployment URL (preview or production)
  deployment_url: null,
  // Smoke test results
  smokes: {
    dashboard_v7: null,    // HTTP status code
    api_diag: null,        // HTTP status code
    api_stock_sample: null, // HTTP status code (sample ticker)
    ops_pulse: null,       // HTTP status code
  },
  // Whether all smokes passed
  smokes_ok: false,
  // When wrangler deploy was requested
  requested_at: null,
  // When deploy was verified (smokes passed)
  verified_at: null,
  // Bundle stats at deploy time
  bundle_file_count: null,
  bundle_size_mb: null,
};

// ─── Pipeline Step Registry ───────────────────────────────────────────────────
//
// Machine-readable registry of all pipeline steps.
// Generated into: public/data/ops/pipeline-step-registry.json
// by:             scripts/ops/build-pipeline-step-registry.mjs

export const PIPELINE_STEP_REGISTRY = Object.entries(SYSTEM_STATUS_STEP_CONTRACTS).map(
  ([id, contract]) => ({
    id,
    run_command: contract.run_command,
    verify_commands: contract.verify_commands || [],
    outputs: contract.outputs || [],
    ui_surfaces: contract.ui_surfaces || [],
    failure_signals: contract.failure_signals || [],
  })
);
