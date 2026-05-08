#!/usr/bin/env node

import path from 'node:path';
import {
  DECISION_CORE_PUBLIC_ROOT,
  ROOT,
  isoNow,
  parseArgs,
  readJsonMaybe,
  writeJsonAtomic,
} from './shared.mjs';

const OUT_PATH = path.join(DECISION_CORE_PUBLIC_ROOT, 'status/accelerated-certification-latest.json');
const HISTORICAL_PATH = path.join(ROOT, 'public/data/reports/decision-core-historical-replay-latest.json');
const RANDOM20_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-random20-latest.json');
const FIXTURE_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-fixtures-latest.json');
const BUY_BREADTH_PATH = path.join(ROOT, 'public/data/reports/decision-core-buy-breadth-latest.json');
const BUY_BREADTH_UI_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-buy-breadth-latest.json');
const SHADOW_LEDGER_PATH = path.join(DECISION_CORE_PUBLIC_ROOT, 'status/shadow-ledger-latest.json');
const SHADOW_DIFF_PATH = path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow-diff-latest.json');
const FINAL_SEAL_PATH = path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json');

function isOk(doc) {
  return doc?.status === 'OK' || doc?.ok === true;
}

function countLiveShadowDays(ledger) {
  if (Number(ledger?.valid_shadow_trading_days || 0) > 0) return Number(ledger.valid_shadow_trading_days);
  const days = Array.isArray(ledger?.days) ? ledger.days : [];
  return days.filter((day) => day?.valid).length;
}

export function buildAcceleratedCertification({ targetMarketDate = null } = {}) {
  const historical = readJsonMaybe(HISTORICAL_PATH) || {};
  const random20 = readJsonMaybe(RANDOM20_PATH) || {};
  const fixtures = readJsonMaybe(FIXTURE_PATH) || {};
  const buyBreadth = readJsonMaybe(BUY_BREADTH_PATH) || {};
  const buyBreadthUi = readJsonMaybe(BUY_BREADTH_UI_PATH) || {};
  const ledger = readJsonMaybe(SHADOW_LEDGER_PATH) || {};
  const diff = readJsonMaybe(SHADOW_DIFF_PATH) || {};
  const decisionStatus = readJsonMaybe(path.join(DECISION_CORE_PUBLIC_ROOT, 'status/latest.json')) || {};
  const finalSeal = readJsonMaybe(FINAL_SEAL_PATH) || {};
  const liveShadowDays = countLiveShadowDays(ledger);
  const historicalDays = Number(historical.historical_replay_valid_days || 0);
  const unsafeCounters = [
    'buy_without_decision_grade',
    'buy_without_entry_guard',
    'buy_without_invalidation',
    'buy_without_reason_codes',
    'buy_with_tail_risk_high_or_unknown',
    'buy_with_ev_proxy_not_positive',
    'buy_with_analysis_reliability_low',
    'unknown_blocking_reason_code_count',
    'hard_veto_without_ui_mapping',
    'legacy_buy_fallback_count',
  ].reduce((sum, key) => sum + Number(diff[key] || decisionStatus[key] || 0), 0);
  const failures = [];
  if (historicalDays < 60) failures.push('HISTORICAL_REPLAY_BELOW_60');
  if (liveShadowDays < 1) failures.push('LIVE_SHADOW_BELOW_1');
  if (!isOk(random20)) failures.push('RANDOM20_NOT_OK');
  if (!isOk(fixtures)) failures.push('FIXTURES_NOT_OK');
  if (!isOk(buyBreadth)) failures.push('BUY_BREADTH_NOT_OK');
  if (!isOk(buyBreadthUi)) failures.push('BUY_BREADTH_UI_NOT_OK');
  if (Number(buyBreadth.us_stock_etf_buy_count || 0) < 10) failures.push('US_BUY_BREADTH_BELOW_10');
  if (Number(buyBreadth.eu_stock_etf_buy_count || 0) < 10) failures.push('EU_BUY_BREADTH_BELOW_10');
  if (unsafeCounters > 0) failures.push('UNSAFE_BUY_COUNTERS');
  if (Number(diff.critical_diff_rate || 0) > 0.02) failures.push('CRITICAL_DIFF_RATE');
  if (finalSeal?.data_plane_green !== true) failures.push('DATA_PLANE_NOT_GREEN');
  if (decisionStatus.no_partial_bundle !== true) failures.push('PARTIAL_BUNDLE');
  const report = {
    schema: 'rv.decision_core_accelerated_certification.v1',
    status: failures.length ? 'FAILED' : 'OK',
    generated_at: isoNow(),
    target_market_date: targetMarketDate || decisionStatus.target_market_date || finalSeal.target_market_date || null,
    switch_mode: 'accelerated_historical_certification',
    one_time_exception: true,
    live_shadow_days: liveShadowDays,
    historical_replay_valid_days: historicalDays,
    us_stock_etf_buy_count: Number(buyBreadth.us_stock_etf_buy_count || 0),
    eu_stock_etf_buy_count: Number(buyBreadth.eu_stock_etf_buy_count || 0),
    buy_breadth_ui_proof: isOk(buyBreadthUi) ? 'OK' : 'FAILED',
    unsafe_buy_counters: unsafeCounters,
    critical_diff_rate_max: Number(diff.critical_diff_rate || 0),
    random20_status: random20.status || 'MISSING',
    fixture_status: fixtures.status || 'MISSING',
    data_plane_current: finalSeal?.data_plane_green === true,
    no_legacy_buy_fallback: Number(decisionStatus.legacy_buy_fallback_count || diff.legacy_buy_fallback_count || 0) === 0,
    no_partial_bundle: decisionStatus.no_partial_bundle === true,
    p0_safety_certified: failures.length === 0,
    alpha_proof: false,
    failures,
  };
  writeJsonAtomic(OUT_PATH, report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const report = buildAcceleratedCertification({ targetMarketDate: opts.targetMarketDate });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}
