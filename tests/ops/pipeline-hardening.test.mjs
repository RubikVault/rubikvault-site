import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readHistoryPackRows } from '../../scripts/lib/history-pack-overlay.mjs';
import {
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
  normalizePageCoreOperationalState,
} from '../../functions/api/_shared/page-core-operational-contract.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function writeNdjsonGz(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`));
}

test('history overlay reader keeps base behavior unless deltas are enabled', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-history-overlay-'));
  const relPack = 'history/US/a/sample.ndjson.gz';
  writeNdjsonGz(path.join(tmp, 'mirrors/universe-v7', relPack), [
    { canonical_id: 'US:A', bars: [{ date: '2026-04-27', close: 1 }, { date: '2026-04-28', close: 2 }] },
  ]);
  writeNdjsonGz(path.join(tmp, 'mirrors/universe-v7/history-deltas', `${relPack}.delta-2026-04-28.ndjson.gz`), [
    { canonical_id: 'US:A', bars: [{ date: '2026-04-28', close: 20 }, { date: '2026-04-29', close: 3 }] },
  ]);

  const baseOnly = await readHistoryPackRows(tmp, relPack, { includeDeltas: false });
  assert.deepEqual(baseOnly[0].bars.map((bar) => [bar.date, bar.close]), [
    ['2026-04-27', 1],
    ['2026-04-28', 2],
  ]);

  const overlay = await readHistoryPackRows(tmp, relPack, { includeDeltas: true });
  assert.deepEqual(overlay[0].bars.map((bar) => [bar.date, bar.close]), [
    ['2026-04-27', 1],
    ['2026-04-28', 20],
    ['2026-04-29', 3],
  ]);
});

test('page-core API normalization preserves producer strict blocking reasons', () => {
  const row = {
    canonical_asset_id: 'US:MDRX',
    target_market_date: '2026-05-13',
    ui_banner_state: 'provider_or_data_reason',
    coverage: { ui_renderable: true },
    key_levels_ready: true,
    market_stats_min: {
      latest_bar_date: '2026-05-12',
      price_date: '2026-05-12',
      as_of: '2026-05-12',
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      key_levels_ready: true,
      stats: { rsi14: 52 },
    },
    freshness: { status: 'fresh', as_of: '2026-05-12' },
    summary_min: {
      last_close: 4.65,
      daily_change_pct: 0,
      daily_change_abs: 0,
      governance_status: 'available',
      risk_level: 'HIGH',
    },
    historical_profile_summary: { availability: { status: 'available_via_endpoint' } },
    model_coverage: { status: 'complete' },
    status_contract: {
      strict_operational: false,
      strict_blocking_reasons: ['bars_stale'],
      stock_detail_view_status: 'degraded',
      historical_profile_status: 'available_via_endpoint',
      model_coverage_status: 'complete',
    },
  };

  assert.deepEqual(pageCoreStrictOperationalReasons(row, { latest: { target_market_date: '2026-05-13' } }), [
    'bars_stale',
    'ui_banner_not_operational',
  ]);
  assert.equal(pageCoreClaimsOperational(row), false);
  const normalized = normalizePageCoreOperationalState(row, { latest: { target_market_date: '2026-05-13' } });
  assert.equal(normalized.status_contract.strict_operational, false);
  assert.equal(normalized.status_contract.stock_detail_view_status, 'degraded');
  assert.equal(normalized.ui_banner_state, 'provider_or_data_reason');
});

test('night supervisor exposes safe hardening flags without changing default data semantics', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  const env = fs.readFileSync(path.join(ROOT, 'scripts/nas/nas-env.sh'), 'utf8');
  assert.match(content, /perf_wrapped_command/);
  assert.match(content, /RV_STEP_RESOURCE_SAMPLES:-1/);
  assert.match(content, /--resources-ndjson "\$step_dir\/resources\.ndjson"/);
  assert.match(content, /--write-mode '\$\{RV_HISTORY_WRITE_MODE:-merge\}'/);
  assert.match(content, /--workers '\$\{RV_Q1_WORKERS:-1\}'/);
  assert.match(env, /RV_CLOUDFLARE_ENV_FILE/);
  assert.match(env, /CLOUDFLARE_API_TOKEN/);
});

test('history refresh supports merge default plus shadow delta artifacts', () => {
  const refresh = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/refresh_v7_history_from_eodhd.py'), 'utf8');
  assert.match(refresh, /choices=\["merge", "delta-shadow", "delta"\]/);
  assert.match(refresh, /default=os\.environ\.get\("RV_HISTORY_WRITE_MODE", "merge"\)/);
  assert.match(refresh, /def write_delta_pack/);
  assert.match(refresh, /history_effective_sha256/);
  assert.match(refresh, /def load_json\(path: Path, default: Any = None\)/);
  assert.match(refresh, /exchange-checkpoint-path/);
  assert.match(refresh, /resume-exchange-checkpoint/);
  assert.match(refresh, /rv_v7_market_refresh_exchange_checkpoint_v1/);
  assert.match(refresh, /completed_exchanges/);
  assert.match(refresh, /skipped_completed_exchanges/);

  const apply = fs.readFileSync(path.join(ROOT, 'scripts/ops/apply-history-touch-report-to-registry.mjs'), 'utf8');
  assert.match(apply, /history_effective_sha256/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /market-refresh-exchange-checkpoint\.json/);
});

test('q1 ingest keeps worker rollout serial by default and can opt into delta reads', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/run_daily_delta_ingest_q1.py'), 'utf8');
  assert.match(content, /--workers/);
  assert.match(content, /effective_workers = 1/);
  assert.match(content, /serial_parent_writes/);
  assert.match(content, /--read-history-deltas/);
  assert.match(content, /iter_history_pack_records/);
});

test('q1 delta proof report exposes touched packs assets rows and delta-only verdict', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-q1-delta-proof-report.mjs'), 'utf8');
  assert.match(script, /rv\.q1_delta_proof_report\.v1/);
  assert.match(script, /delta_only_ok/);
  assert.match(script, /packs_selected/);
  assert.match(script, /assets_emitted_delta/);
  assert.match(script, /rows_emitted_delta/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /q1_delta_proof_report/);
  assert.match(supervisor, /q1-delta-proof-latest\.json/);
});

test('forecast generate phase records load/generate/write timings', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/forecast/run_daily.mjs'), 'utf8');
  assert.match(content, /timings\.load_price_history_ms/);
  assert.match(content, /timings\.generate_forecasts_ms/);
  assert.match(content, /timings\.write_forecast_records_ms/);
  assert.match(content, /timings_ms: timings/);
});

test('hist probs rescue flags support freshness budget and tiered catchup', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'run-hist-probs-turbo.mjs'), 'utf8');
  assert.match(runner, /HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS/);
  assert.match(runner, /HIST_PROBS_MAX_TICKERS/);
  assert.match(runner, /HIST_PROBS_TIER/);
  assert.match(runner, /HIST_PROBS_PROTECTED_TICKERS = new Set\(\['T', 'AAPL', 'MSFT', 'F', 'V', 'TSLA', 'SPY', 'QQQ', 'BRK-B', 'BRK\.B', 'BF-B', 'BF\.B'\]\)/);
  assert.match(runner, /budget_fresh_existing_files/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS='\$\{RV_HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS:-2\}'/);
  assert.match(supervisor, /HIST_PROBS_TIER='\$\{RV_HIST_PROBS_TIER:-all\}'/);
  assert.match(supervisor, /nas-hist-probs-worker-guard\.mjs/);
  assert.match(supervisor, /HIST_PROBS_WORKERS='\$\{RV_HIST_PROBS_WORKERS:-3\}'/);
  assert.match(supervisor, /HIST_PROBS_WORKER_BATCH_SIZE='\$\{RV_HIST_PROBS_WORKER_BATCH_SIZE:-50\}'/);
  assert.match(supervisor, /build-hist-probs-public-projection\.mjs/);

  const freshness = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-data-freshness-report.mjs'), 'utf8');
  assert.match(freshness, /histProbsReadCandidates/);
  assert.match(freshness, /budget_fresh_count/);
});

test('stock UI hard gate is not swallowed by optional-step handling', () => {
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /stock_ui_integrity_audit_hard_gate_failed/);
  assert.match(supervisor, /RV_STOCK_UI_AUDIT_HARD_GATE:-0/);
  assert.match(supervisor, /optional_step_degraded/);
});

test('deploy bundle writes private top-file size report', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-deploy-bundle.mjs'), 'utf8');
  assert.match(builder, /DEPLOY_BUNDLE_SIZE_REPORT_PATH/);
  assert.match(builder, /rv\.deploy_bundle_size_report\.v1/);
  assert.match(builder, /top_files/);
  assert.match(builder, /top_dirs/);
  assert.match(builder, /computeBundleHash/);
  assert.match(builder, /bundle_hash/);
  assert.match(builder, /RV_DEPLOY_BUNDLE_SIZE_WARN_MB/);
});

test('public history shards support incremental touched-pack rebuilds with strict budgets and canaries', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-public-history-shards.mjs'), 'utf8');
  assert.match(builder, /RV_PUBLIC_HISTORY_INCREMENTAL/);
  assert.match(builder, /String\(next\)\.startsWith\('--'\) \? true : next/);
  assert.match(builder, /history_touch_report\.json/);
  assert.ok(builder.includes("replace(/^history\\//, '')"));
  assert.match(builder, /Array\.isArray\(report\.entries\)/);
  assert.match(builder, /addTouched\(row\?\.history_pack, \[row\?\.canonical_id\]\)/);
  assert.match(builder, /changed_shards/);
  assert.match(builder, /oversized_shards/);
  assert.match(builder, /RV_PUBLIC_HISTORY_SHARD_MAX_BYTES/);
  assert.match(builder, /AAPL,HOOD,SPY,ASML,BASM,000220/);
  assert.match(builder, /canaries/);
  assert.match(builder, /incremental_fallback_reason/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /build-public-history-shards\.mjs .*--incremental/);
});

test('morning acceptance covers dual hosts, proof, historical probes, locks, and rogue processes', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-morning-acceptance-report.mjs'), 'utf8');
  assert.match(script, /rv\.morning_acceptance_report\.v1/);
  assert.match(script, /rubikvault\.com/);
  assert.match(script, /rubikvault-site\.pages\.dev/);
  assert.match(script, /deploy-proof-latest\.json/);
  assert.match(script, /HISTORICAL_TICKERS = \['F', 'AAPL', 'HOOD'\]/);
  assert.match(script, /ROGUE_PATTERNS/);
  assert.match(script, /page-core-minimal-history/);
});

test('nightly wrappers expose help and reject unknown args before starting pipeline', () => {
  const guarded = fs.readFileSync(path.join(ROOT, 'scripts/nas/run-nightly-full-pipeline-if-no-backfill.sh'), 'utf8');
  const full = fs.readFileSync(path.join(ROOT, 'scripts/nas/run-nightly-full-pipeline.sh'), 'utf8');
  for (const script of [guarded, full]) {
    assert.match(script, /Usage: run-nightly-full-pipeline/);
    assert.match(script, /-h\|--help\)/);
    assert.match(script, /unknown_arg=\$arg/);
    assert.match(script, /exit 64/);
  }
  assert.ok(guarded.indexOf('-h|--help)') < guarded.indexOf('nas_ensure_runtime_roots'));
  assert.ok(full.indexOf('-h|--help)') < full.indexOf('nas_ensure_runtime_roots'));
});

test('step resource budgets are centralized and reported by supervisor', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/nas-step-resource-budgets.json'), 'utf8'));
  assert.equal(config.schema, 'rv.nas_step_resource_budgets.v1');
  assert.ok(config.steps.market_data_refresh);
  assert.ok(config.steps.page_core_bundle);
  assert.ok(config.steps.wrangler_deploy);

  const checker = fs.readFileSync(path.join(ROOT, 'scripts/ops/check-step-resource-budgets.mjs'), 'utf8');
  assert.match(checker, /rv\.step_resource_budget_report\.v1/);
  assert.match(checker, /peak_rss_mb_fail/);
  assert.match(checker, /RV_STEP_RESOURCE_BUDGET_HARD_GATE/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /resource_budget_report/);
  assert.match(supervisor, /check-step-resource-budgets\.mjs/);
});

test('weekly hist probs full catchup is separate locked off-hours entrypoint', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/nas/run-weekly-hist-probs-full-catchup.sh'), 'utf8');
  assert.match(script, /hist-probs-weekly-full/);
  assert.match(script, /nas_lock_is_active "night-pipeline"/);
  assert.match(script, /nas_acquire_global_lock "\$LOCK_NAME"/);
  assert.match(script, /RV_HIST_PROBS_WEEKLY_ALLOW_NIGHT_WINDOW/);
  assert.match(script, /HIST_PROBS_MAX_TICKERS=\\"0\\"/);
  assert.match(script, /measure-command\.py/);
});

test('dirty scope guard blocks staged Market and generated runtime artifacts', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/ops/check-dirty-scope.mjs'), 'utf8');
  assert.match(script, /rv\.dirty_scope_report\.v1/);
  assert.match(script, /public\\\/assets\\\/css\\\/market-/);
  assert.match(script, /public\\\/data\\\/public-status\\\.json/);
  assert.match(script, /staged Market\/generated runtime files detected/);
  assert.match(script, /RV_DIRTY_SCOPE_STRICT/);
});

test('provider health preflight classifies EODHD auth, live probe, and daily cap before refresh', () => {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/ops/provider-health-preflight.mjs'), 'utf8');
  assert.match(script, /rv\.provider_health_preflight\.v1/);
  assert.match(script, /missing_api_key/);
  assert.match(script, /daily_cap_below_floor/);
  assert.match(script, /rate_limited/);
  assert.match(script, /provider_unavailable/);
  assert.match(script, /RV_PROVIDER_HEALTH_LIVE/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /provider_health_preflight/);
  assert.match(supervisor, /provider-health-preflight\.mjs/);
  assert.match(supervisor, /provider-health-latest\.json/);
});

test('NAS locks carry owner metadata and audit report classifies stale locks', () => {
  const env = fs.readFileSync(path.join(ROOT, 'scripts/nas/nas-env.sh'), 'utf8');
  assert.match(env, /created_at/);
  assert.match(env, /stale_policy/);
  assert.match(env, /dead_pid_cleanup_allowed/);

  const audit = fs.readFileSync(path.join(ROOT, 'scripts/ops/audit-nas-locks.mjs'), 'utf8');
  assert.match(audit, /rv\.nas_lock_audit\.v1/);
  assert.match(audit, /stale_dead_pid/);
  assert.match(audit, /stale_missing_pid/);
  assert.match(audit, /cleanup-stale/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /lock_policy_report/);
  assert.match(supervisor, /nas-lock-audit-latest\.json/);
});

test('night pipeline watchdog emits typed alert artifact without owning recovery', () => {
  const watchdog = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-pipeline-watchdog.sh'), 'utf8');
  assert.match(watchdog, /watchdog-alert-latest\.json/);
  assert.match(watchdog, /rv\.nas\.pipeline_watchdog_alert\.v1/);
  assert.match(watchdog, /typed_failure_reason/);
  assert.match(watchdog, /resource_samples_stale/);
  assert.match(watchdog, /step_status_no_progress/);
  assert.match(watchdog, /resolved_reason/);
  assert.match(watchdog, /watchdog_ok/);
  assert.match(watchdog, /previous_alert/);
  assert.match(watchdog, /no_parallel_recovery_owner/);
  assert.match(watchdog, /do_not_start_legacy_pipeline_master/);
});

test('DP8 Market is optional and feature-flagged in NAS supervisor', () => {
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /dp8_market/);
  assert.match(supervisor, /RV_DP8_MARKET_ENABLED:-0/);
  assert.match(supervisor, /npm run dp8:market-hub/);
  assert.match(supervisor, /npm run dp8:market-hub:global/);
  assert.match(supervisor, /npm run dp8:capital-rotation/);
  assert.match(supervisor, /validate-v3-artifacts\.mjs/);
  assert.match(supervisor, /optional_step_degraded/);
});

test('DP8 Market hub rejects stale source rows before using target-date fallbacks', () => {
  const marketHub = fs.readFileSync(path.join(ROOT, 'scripts/dp8/market-hub.v3.mjs'), 'utf8');
  assert.match(marketHub, /function isFreshEnough/);
  assert.match(marketHub, /normalizeDateText\(process\.env\.RV_TARGET_MARKET_DATE\)/);
  assert.match(marketHub, /normalizeDateText\(process\.env\.TARGET_MARKET_DATE\)/);
  assert.match(marketHub, /fromNdjson && isFreshEnough\(fromNdjson\.as_of, defaultAsOf, 3\)/);
  assert.match(marketHub, /cacheAgeDays <= 3/);
  assert.match(marketHub, /isFreshEnough\(bar\.date, defaultAsOf, 3\)/);
  assert.match(marketHub, /target_market_date: defaultAsOf/);
  assert.match(marketHub, /source_eod_us_latest_date: ndjsonDataDate/);
});

test('page core smoke validates candidate artifacts without localhost runtime', () => {
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /--page-core-only/);
  assert.match(supervisor, /--page-core-latest-path public\/data\/page-core\/candidates\/latest\.candidate\.json/);

  const truth = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-ui-field-truth-report.mjs'), 'utf8');
  assert.match(truth, /pageCoreOnly/);
  assert.match(truth, /readPageCoreSmokeLocal/);
  assert.match(truth, /PAGE_CORE_SCHEMA/);

  const releaseGate = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.match(releaseGate, /DEFAULT_CLOUDFLARE_ENV_PATH/);
  assert.match(releaseGate, /loadSecretEnvFile/);
  assert.match(releaseGate, /\*\\.pages\\.dev/);
  assert.match(releaseGate, /pageCoreOnly: true/);
  assert.match(releaseGate, /preview deploy did not return a deployment URL/);

  const envelope = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/envelope.js'), 'utf8');
  assert.match(envelope, /"expired"/);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/runtime-manifest.json'), 'utf8'));
  const pageCoreManifest = manifest.allow.find((entry) => entry.class === 'page-core-manifest');
  assert.ok(pageCoreManifest.maxFileSizeBytes >= 65536);
});

test('page core bundle has conservative incremental same-target reuse with strict recheck', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-page-core-bundle.mjs'), 'utf8');
  assert.match(builder, /RV_PAGE_CORE_INCREMENTAL/);
  assert.match(builder, /incremental_same_target/);
  assert.match(builder, /target_market_date_changed_full_fallback/);
  assert.match(builder, /previousRowReusable/);
  assert.match(builder, /reusePageCoreRow/);
  assert.match(builder, /finalizePageCoreRow/);
  assert.match(builder, /Object\.values\(rawTouched\)\.flat\(\)/);
  assert.match(builder, /pageCoreStrictOperationalReasons/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /build-page-core-bundle\.mjs .*--incremental/);
});
