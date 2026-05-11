#!/usr/bin/env node
/**
 * Build Public Dashboard V7 Report
 *
 * Public, compact, privacy-safe projection for /dashboard_v7.html.
 * Raw ops/dashboard artifacts stay local/NAS-only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/data/status/dashboard-v7-public-latest.json');

const PATHS = {
  publicStatus: 'public/data/public-status.json',
  deployProof: 'public/data/status/deploy-proof-latest.json',
  finalSeal: 'public/data/ops/final-integrity-seal-latest.json',
  stageHealth: 'public/data/ops/nas-stage-health-latest.json',
  watchdog: 'public/data/ops/night-pipeline-watchdog-latest.json',
  scheduler: 'public/data/ops/nas-scheduler-latest.json',
  cron: 'public/data/ops/nas-cron-health-latest.json',
  disk: 'public/data/ops/nas-disk-health-latest.json',
  budget: 'public/data/ops/eodhd-budget-latest.json',
  bundle: 'public/data/ops/cloudflare-bundle-preflight-latest.json',
  stale: 'public/data/ops/stale-data-latest.json',
  reasonDrift: 'public/data/ops/reason-code-registry-drift-latest.json',
  connectivity: 'public/data/ops/connectivity-health-latest.json',
  buyBreadth: 'public/data/reports/decision-core-buy-breadth-latest.json',
  buyUi: 'public/data/reports/stock-decision-core-ui-buy-breadth-latest.json',
  random20: 'public/data/reports/stock-decision-core-ui-random20-latest.json',
  random50: 'public/data/reports/stock-analyzer-ui-random50-proof-latest.json',
  frontpageProof: 'public/data/reports/frontpage-best-setups-ui-proof-latest.json',
  bestSetups: 'public/data/snapshots/best-setups-v4.json',
  moduleScorecard: 'public/data/status/decision-module-scorecard-latest.json',
};

function readJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return value === true;
}

function statusOf(value) {
  return typeof value === 'string' && value ? value : 'UNKNOWN';
}

function compactAsset(row = {}) {
  return {
    asset_id: String(row.asset_id || row.canonical_id || '').slice(0, 80) || null,
    ticker: String(row.symbol || row.ticker || '').slice(0, 32) || null,
    asset_type: String(row.asset_type || row.asset_class || '').toUpperCase().slice(0, 16) || null,
    region: String(row.region || '').toUpperCase().slice(0, 12) || null,
    horizon: row.horizon ? String(row.horizon).slice(0, 16) : null,
    analysis_reliability: row.analysis_reliability || row.confidence || null,
    signal_quality_score: finiteNumber(row.signal_quality_score ?? row.rank_score ?? row.score ?? row.metric_value),
    max_entry_price: finiteNumber(row.max_entry_price),
    invalidation_level: finiteNumber(row.invalidation_level),
    best_setups_present: row.best_setups_present === true ? true : undefined,
    analyzer_url: row.ticker || row.symbol ? `/analyze/${encodeURIComponent(row.ticker || row.symbol)}` : null,
  };
}

function compactBuyBreadth(report) {
  const us = Array.isArray(report?.us_buy_assets) ? report.us_buy_assets : [];
  const eu = Array.isArray(report?.eu_buy_assets) ? report.eu_buy_assets : [];
  const asia = Array.isArray(report?.asia_buy_assets) ? report.asia_buy_assets : [];
  return {
    status: statusOf(report?.status),
    target_market_date: report?.target_market_date || null,
    proof_mode: report?.proof_mode || null,
    total_buy_count: finiteNumber(report?.total_buy_count),
    selected_counts: {
      us_stock_etf: finiteNumber(report?.us_stock_etf_buy_count),
      eu_stock_etf: finiteNumber(report?.eu_stock_etf_buy_count),
      asia_stock_etf: finiteNumber(report?.asia_stock_etf_buy_count),
    },
    available_counts: {
      us_stock_etf: finiteNumber(report?.available_us_stock_etf_buy_count),
      eu_stock_etf: finiteNumber(report?.available_eu_stock_etf_buy_count),
      asia_stock_etf: finiteNumber(report?.available_asia_stock_etf_buy_count),
    },
    sample_assets: {
      us: us.slice(0, 10).map(compactAsset),
      eu: eu.slice(0, 10).map(compactAsset),
      asia: asia.slice(0, 10).map(compactAsset),
    },
    best_setups_core_only: report?.best_setups_core_only !== false,
    legacy_buy_count: finiteNumber(report?.legacy_buy_count) ?? 0,
    unsafe_buy_counters: report?.unsafe_buy_counters || 0,
  };
}

function compactUiProof(report) {
  return {
    status: statusOf(report?.status),
    target_market_date: report?.target_market_date || null,
    counts: report?.counts || {
      total: finiteNumber(report?.total),
      ok: finiteNumber(report?.ok),
      failed: finiteNumber(report?.failed),
    },
    coverage: report?.region_class_coverage || {
      us_assets: finiteNumber(report?.us_assets),
      eu_assets: finiteNumber(report?.eu_assets),
      asia_assets: finiteNumber(report?.asia_assets),
    },
  };
}

function compactBestSetups(snapshot) {
  const groups = snapshot?.data || {};
  const horizons = {};
  for (const horizon of ['short', 'medium', 'long']) {
    const rows = [
      ...(Array.isArray(groups?.stocks?.[horizon]) ? groups.stocks[horizon] : []),
      ...(Array.isArray(groups?.etfs?.[horizon]) ? groups.etfs[horizon] : []),
    ];
    horizons[horizon] = rows.slice(0, 20).map(compactAsset);
  }
  return {
    status: snapshot?.ok === true ? 'OK' : 'UNKNOWN',
    source: snapshot?.meta?.source || null,
    target_market_date: snapshot?.meta?.data_asof || snapshot?.meta?.decision_bundle?.target_market_date || null,
    rows_emitted: snapshot?.meta?.rows_emitted || null,
    candidate_counts: snapshot?.meta?.candidate_counts || null,
    verified_counts: snapshot?.meta?.verified_counts || null,
    horizons,
  };
}

function compactStages(stageHealth) {
  const stages = {};
  for (const [id, stage] of Object.entries(stageHealth?.stages || {})) {
    stages[id] = {
      status: statusOf(stage?.status),
      total: finiteNumber(stage?.total),
      completed: finiteNumber(stage?.completed),
      warning_count: Array.isArray(stage?.warning_steps) ? stage.warning_steps.length : 0,
      critical_count: Array.isArray(stage?.critical_steps) ? stage.critical_steps.length : 0,
      failed_count: Array.isArray(stage?.failed_steps) ? stage.failed_steps.length : 0,
    };
  }
  return {
    status: statusOf(stageHealth?.status),
    target_market_date: stageHealth?.target_market_date || null,
    generated_at: stageHealth?.generated_at || null,
    release_ready: bool(stageHealth?.release_ready),
    release_blocking: bool(stageHealth?.release_blocking),
    warning_step_count: finiteNumber(stageHealth?.warning_step_count),
    critical_step_count: finiteNumber(stageHealth?.critical_step_count),
    stages,
  };
}

function compactModules(scorecard) {
  const moduleOut = {};
  const horizonMap = { short: '1d', mid: '5d', long: '20d' };
  for (const [id, module] of Object.entries(scorecard?.modules || {})) {
    const horizons = {};
    for (const [label, sourceKey] of Object.entries(horizonMap)) {
      const h = module?.horizons?.[sourceKey] || {};
      horizons[label] = {
        source_horizon: sourceKey,
        status: statusOf(h.status),
        sample_n: finiteNumber(h.sample_n),
        hit_rate: finiteNumber(h.hit_rate),
        precision_50: finiteNumber(h.precision_50),
        brier: finiteNumber(h.brier),
        max_drawdown: finiteNumber(h.max_drawdown),
      };
    }
    moduleOut[id] = {
      id,
      name: String(module?.name || id).slice(0, 80),
      type: module?.type || null,
      status: statusOf(module?.status),
      source_asof: module?.source_meta?.asof || null,
      source_fresh: module?.source_meta?.fresh === true,
      stale_days: finiteNumber(module?.source_meta?.stale_days),
      horizons,
    };
  }
  return {
    target_market_date: scorecard?.target_market_date || null,
    generated_at: scorecard?.generated_at || null,
    horizons: ['short', 'mid', 'long'],
    modules: moduleOut,
    alpha_proof: false,
  };
}

function compactConnectivity(report) {
  const probes = {};
  for (const [id, probe] of Object.entries(report?.probes || {})) {
    probes[id] = { status: statusOf(probe?.status), ok: probe?.ok === true };
  }
  return { status: statusOf(report?.status), generated_at: report?.generated_at || null, probes };
}

function build() {
  const publicStatus = readJson(PATHS.publicStatus);
  const deployProof = readJson(PATHS.deployProof);
  const finalSeal = readJson(PATHS.finalSeal);
  const stageHealth = readJson(PATHS.stageHealth);
  const stale = readJson(PATHS.stale);

  const report = {
    schema: 'rv.public_dashboard_v7_report.v1',
    generated_at: new Date().toISOString(),
    target_market_date: publicStatus?.target_market_date || finalSeal?.target_market_date || null,
    status: publicStatus?.status || (finalSeal?.release_ready ? 'OK' : 'DEGRADED'),
    public_truth: {
      release_ready: bool(publicStatus?.release_ready ?? finalSeal?.release_ready),
      ui_green: bool(publicStatus?.ui_green ?? finalSeal?.ui_green),
      decision_ready: bool(publicStatus?.decision_ready ?? finalSeal?.decision_ready),
      data_plane_green: bool(publicStatus?.data_plane_green ?? finalSeal?.data_plane_green),
      decision_core_switch_mode: publicStatus?.decision_core_switch_mode || null,
      alpha_proof: false,
    },
    final_seal: {
      status: statusOf(finalSeal?.status),
      release_ready: bool(finalSeal?.release_ready),
      ui_green: bool(finalSeal?.ui_green),
      decision_ready: bool(finalSeal?.decision_ready),
      data_plane_green: bool(finalSeal?.data_plane_green),
      blocker_count: Array.isArray(finalSeal?.blockers) ? finalSeal.blockers.length : 0,
      warning_count: Array.isArray(finalSeal?.warnings) ? finalSeal.warnings.length : 0,
      generated_at: finalSeal?.generated_at || null,
    },
    deploy: {
      smokes_ok: bool(deployProof?.smokes_ok),
      release_ready: bool(deployProof?.release_ready),
      deployment_id: deployProof?.deployment_id || null,
      git_commit_sha: deployProof?.git_commit_sha || null,
      target_market_date: deployProof?.target_market_date || null,
      generated_at: deployProof?.generated_at || null,
    },
    decision_core: compactBuyBreadth(readJson(PATHS.buyBreadth)),
    ui_proofs: {
      buy_breadth: compactUiProof(readJson(PATHS.buyUi)),
      random20: compactUiProof(readJson(PATHS.random20)),
      random50: compactUiProof(readJson(PATHS.random50)),
      frontpage_best_setups: compactUiProof(readJson(PATHS.frontpageProof)),
    },
    best_setups: compactBestSetups(readJson(PATHS.bestSetups)),
    pipeline: {
      stage_health: compactStages(stageHealth),
      watchdog: {
        status: statusOf(readJson(PATHS.watchdog)?.status),
        active: readJson(PATHS.watchdog)?.active === true,
        last_seen_age_hours: finiteNumber(readJson(PATHS.watchdog)?.last_seen_age_hours),
      },
      scheduler: {
        status: statusOf(readJson(PATHS.scheduler)?.status),
        schedule_policy: readJson(PATHS.scheduler)?.schedule_policy || null,
        monday_allowed: readJson(PATHS.scheduler)?.monday_allowed === true,
        saturday_allowed: readJson(PATHS.scheduler)?.saturday_allowed === true,
        dynamic_freshness_gate_present: readJson(PATHS.scheduler)?.dynamic_freshness_gate_present === true,
      },
      cron: {
        status: statusOf(readJson(PATHS.cron)?.status),
        stale: readJson(PATHS.cron)?.stale === true,
        old_pipeline_master_active: readJson(PATHS.cron)?.old_pipeline_master_active === true,
      },
      disk: {
        status: statusOf(readJson(PATHS.disk)?.status),
        free_gb: finiteNumber(readJson(PATHS.disk)?.free_gb),
        abort_below_gb: finiteNumber(readJson(PATHS.disk)?.abort_below_gb),
      },
      eodhd_budget: {
        status: statusOf(readJson(PATHS.budget)?.status),
        budget_guard_ok: readJson(PATHS.budget)?.budget_guard_ok === true,
        used_pct: finiteNumber(readJson(PATHS.budget)?.used_pct),
      },
      cloudflare_bundle: {
        status: statusOf(readJson(PATHS.bundle)?.status),
        privacy_gate_ok: readJson(PATHS.bundle)?.privacy_gate_ok === true,
        file_count: finiteNumber(readJson(PATHS.bundle)?.file_count),
        max_file_bytes: finiteNumber(readJson(PATHS.bundle)?.max_file_bytes),
      },
      stale_data: {
        status: statusOf(stale?.status),
        stale_input_count: Array.isArray(stale?.stale_inputs) ? stale.stale_inputs.length : 0,
        actionable_stale_input_count: Array.isArray(stale?.actionable_stale_inputs) ? stale.actionable_stale_inputs.length : 0,
        stale_actionable_buy_forbidden: stale?.stale_actionable_buy_forbidden === true,
        inputs: stale?.inputs || {},
      },
      reason_code_drift: {
        status: statusOf(readJson(PATHS.reasonDrift)?.status),
        unknown_codes: finiteNumber(readJson(PATHS.reasonDrift)?.unknown_codes),
        unknown_blocking_or_demoting_codes: finiteNumber(readJson(PATHS.reasonDrift)?.unknown_blocking_or_demoting_codes),
      },
      connectivity: compactConnectivity(readJson(PATHS.connectivity)),
    },
    module_scorecards: compactModules(readJson(PATHS.moduleScorecard)),
    caveats: [
      'P0 Decision Core is a safety gate, not alpha proof.',
      'Module hit rates are empirical backtest/outcome metrics and are not profit guarantees.',
      'Raw ops reports remain private; this file is a public sanitized projection.',
    ],
  };

  writeJsonAtomic(OUT, report);
  console.log(`[public-dashboard-v7] wrote ${path.relative(ROOT, OUT)}`);
}

build();
