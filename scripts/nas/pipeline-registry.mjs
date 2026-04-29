#!/usr/bin/env node

import { toCanonicalStepId } from '../ops/canonical-step-ids.mjs';

const RAW_PIPELINE_STEPS = [
  {
    order: 1,
    id: 'refresh_v7_history_from_eodhd',
    label: 'Refresh V7 History From EODHD',
    command: 'python3 scripts/quantlab/refresh_v7_history_from_eodhd.py --env-file "$NAS_DEV_ROOT/.env.local" --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --from-date <YYYY-MM-DD> --to-date <YYYY-MM-DD> --concurrency "${RV_MARKET_REFRESH_CONCURRENCY:-12}" --progress-every "${RV_MARKET_REFRESH_PROGRESS_EVERY:-500}"',
    job_type: 'internet_fetch',
    benchmark_method: 'mac_profile_only',
    benchmark_stage: null,
    outputs: [
      'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json',
      'public/data/universe/v7/*'
    ],
    consumers: ['run_daily_delta_ingest_q1.py', 'dashboard_v7 freshness chain'],
    ui_surfaces: ['dashboard_v7', 'analyze-v4', 'server artifacts'],
    blockers: ['live_api_eodhd', 'quota_sensitive'],
    default_classification: 'blocked_by_live_api_dependency',
  },
  {
    order: 2,
    id: 'run_daily_delta_ingest_q1',
    label: 'Run Daily Delta Ingest Q1',
    command: 'python3 scripts/quantlab/run_daily_delta_ingest_q1.py --ingest-date <YYYY-MM-DD>',
    job_type: 'live_api_plus_compute',
    benchmark_method: 'architecture_only',
    benchmark_stage: null,
    outputs: [
      'QuantLabHot ops/q1_daily_delta_ingest/latest_success.json',
      'QuantLab-derived report inputs'
    ],
    consumers: ['build_quantlab_v4_daily_report.mjs', 'forecast/run_daily.mjs'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: ['quantlabhot_path', 'mac_local_env'],
    default_classification: 'blocked_by_architecture',
  },
  {
    order: 3,
    id: 'build_fundamentals',
    label: 'Build Fundamentals',
    command: 'node scripts/build-fundamentals.mjs --force',
    job_type: 'live_api_plus_compute',
    benchmark_method: 'offline_replay',
    benchmark_stage: null,
    outputs: [
      'public/data/fundamentals/*',
      'public/data/reports/fundamentals*'
    ],
    consumers: ['dashboard_v7', 'stock UI panels', 'downstream summaries'],
    ui_surfaces: ['dashboard_v7', 'analyze-v4', 'server artifacts'],
    blockers: ['live_fundamentals_api', 'heap_pressure'],
    default_classification: 'blocked_by_live_api_dependency',
  },
  {
    order: 4,
    id: 'build_quantlab_v4_daily_report',
    label: 'Build QuantLab V4 Daily Report',
    command: 'node scripts/quantlab/build_quantlab_v4_daily_report.mjs',
    job_type: 'offline_transform',
    benchmark_method: 'offline_replay',
    benchmark_stage: null,
    outputs: [
      'mirrors/quantlab/reports/v4-daily/latest.json',
      'public/data/quantlab/reports/v4-daily-latest.json',
      'public/data/quantlab/status/operational-status.json'
    ],
    consumers: ['forecast/run_daily.mjs', 'generate_meta_dashboard_data.mjs'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: ['quantlab_input_dependency'],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 5,
    id: 'forecast_run_daily',
    label: 'Forecast Daily',
    command: 'node scripts/forecast/run_daily.mjs',
    job_type: 'compute_transform',
    benchmark_method: 'mac_profile_only',
    benchmark_stage: null,
    outputs: [
      'public/data/forecast/latest.json',
      'public/data/forecast/models/*'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'best-setups-v4', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'analyze-v4', 'server artifacts'],
    blockers: ['cpu_heavy', 'quantlab_dependency'],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 6,
    id: 'build_scientific_summary',
    label: 'Build Scientific Summary',
    command: 'node scripts/build-scientific-summary.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage4:scientific_summary',
    outputs: [
      'public/data/supermodules/scientific-summary.json'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 7,
    id: 'run_hist_probs',
    label: 'Run Hist Probs Full Universe',
    command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF}"; node run-hist-probs-turbo.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES"',
    job_type: 'cpu_bound',
    benchmark_method: 'mac_profile_only',
    benchmark_stage: null,
    outputs: [
      'public/data/hist-probs/run-summary.json',
      'public/data/hist-probs/regime-daily.json'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'system-status', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: ['full_universe_cpu_ram'],
    default_classification: 'mac_only',
  },
  {
    order: 8,
    id: 'run_daily_learning_cycle',
    label: 'Run Daily Learning Cycle',
    command: 'node scripts/learning/run-daily-learning-cycle.mjs --date=<YYYY-MM-DD>',
    job_type: 'cpu_bound',
    benchmark_method: 'mac_profile_only',
    benchmark_stage: null,
    outputs: [
      'public/data/reports/learning-report-latest.json',
      'mirrors/learning/*'
    ],
    consumers: ['daily_audit_report', 'cutover_readiness_report', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: ['learning_cycle_cpu_ram'],
    default_classification: 'mac_only',
  },
  {
    order: 9,
    id: 'build_best_setups_v4',
    label: 'Build Best Setups V4',
    command: 'node scripts/build-best-setups-v4.mjs',
    job_type: 'offline_transform',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage4:best_setups_v4',
    outputs: [
      'public/data/snapshots/best-setups-v4.json'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: ['quantlab_publish_dependency'],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 10,
    id: 'diagnose_best_setups_etf_drop',
    label: 'Diagnose Best Setups ETF Drop',
    command: 'node scripts/learning/diagnose-best-setups-etf-drop.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage4:etf_diagnostic',
    outputs: [
      'public/data/reports/best-setups-etf-diagnostic-latest.json'
    ],
    consumers: ['dashboard_v7', 'operator diagnostics'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 11,
    id: 'daily_audit_report',
    label: 'Daily Audit Report',
    command: 'node scripts/learning/quantlab-v1/daily-audit-report.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage4:daily_audit_report',
    outputs: [
      'public/data/reports/quantlab-v1-latest.json',
      'mirrors/learning/quantlab-v1/reports/<TODAY>-internal.json'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 12,
    id: 'cutover_readiness_report',
    label: 'Cutover Readiness Report',
    command: 'node scripts/learning/quantlab-v1/cutover-readiness-report.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage4:cutover_readiness_report',
    outputs: [
      'mirrors/learning/quantlab-v1/reports/cutover-readiness-<TODAY>.json'
    ],
    consumers: ['dashboard_v7', 'operator diagnostics', 'system status'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 13,
    id: 'build_stock_analyzer_universe_audit',
    label: 'Build Stock Analyzer Universe Audit',
    command: 'RV_GLOBAL_ASSET_CLASSES="${RV_GLOBAL_ASSET_CLASSES:-STOCK,ETF}"; node scripts/universe-v7/build-global-scope.mjs --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-history-pack-manifest.mjs --scope global --asset-classes "$RV_GLOBAL_ASSET_CLASSES" && node scripts/ops/build-stock-analyzer-universe-audit.mjs --base-url http://127.0.0.1:8788 --registry-path public/data/universe/v7/registry/registry.ndjson.gz --allowlist-path public/data/universe/v7/ssot/assets.global.canonical.ids.json --asset-classes "$RV_GLOBAL_ASSET_CLASSES" --max-tickers 0',
    job_type: 'ui_gate_local_only',
    benchmark_method: 'architecture_only',
    benchmark_stage: null,
    outputs: [
      'public/data/reports/stock-analyzer-universe-audit-latest.json'
    ],
    consumers: ['build-system-status-report.mjs', 'dashboard_v7 green proof'],
    ui_surfaces: ['dashboard_v7', 'local Pages runtime'],
    blockers: ['localhost_pages_runtime'],
    default_classification: 'blocked_by_architecture',
  },
  {
    order: 14,
    id: 'build_system_status_report',
    label: 'Build System Status Report',
    command: 'node scripts/ops/build-system-status-report.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage3',
    outputs: [
      'public/data/reports/system-status-latest.json'
    ],
    consumers: ['generate_meta_dashboard_data.mjs', 'dashboard_v7'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  },
  {
    order: 15,
    id: 'generate_meta_dashboard_data',
    label: 'Generate Meta Dashboard Data',
    command: 'node scripts/generate_meta_dashboard_data.mjs',
    job_type: 'read_only_aggregation',
    benchmark_method: 'full_shadow_benchmark',
    benchmark_stage: 'stage2',
    outputs: [
      'public/dashboard_v6_meta_data.json'
    ],
    consumers: ['dashboard_v7', 'local root dashboard', 'server artifacts'],
    ui_surfaces: ['dashboard_v7', 'server artifacts'],
    blockers: [],
    default_classification: 'insufficient_evidence_today',
  }
];

export const PIPELINE_STEPS = RAW_PIPELINE_STEPS.map((step) => ({
  ...step,
  canonical_step_id: step.canonical_step_id || toCanonicalStepId(step.id),
}));

export const GREEN_GATES = [
  {
    id: 'system_status_ok',
    source: 'public/data/reports/system-status-latest.json',
    requirement: 'summary.severity = ok',
  },
  {
    id: 'ssot_violations_empty',
    source: 'public/data/reports/system-status-latest.json',
    requirement: 'ssot_violations = []',
  },
  {
    id: 'hist_probs_ok',
    source: 'public/data/reports/system-status-latest.json',
    requirement: 'steps.hist_probs.severity = ok',
  },
  {
    id: 'audit_ok',
    source: 'public/data/reports/system-status-latest.json',
    requirement: 'steps.stock_analyzer_universe_audit.severity = ok',
  },
  {
    id: 'audit_full_universe',
    source: 'public/data/reports/stock-analyzer-universe-audit-latest.json',
    requirement: 'summary.full_universe = true and failure_family_count = 0',
  }
];
