#!/usr/bin/env node

import path from 'node:path';
import {
  DECISION_CORE_PUBLIC_ROOT,
  ROOT,
  isoDate,
  parseArgs,
  readJsonMaybe,
  writeJsonAtomic,
} from './shared.mjs';
import { validateDecisionCoreRoot } from './validate-decision-bundles.mjs';

const LEDGER_PATH = path.join(DECISION_CORE_PUBLIC_ROOT, 'status/shadow-ledger-latest.json');
const SHADOW_ROOT = path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow');
const RANDOM20_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-random20-latest.json');
const FIXTURES_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-fixtures-latest.json');
const SHADOW_DIFF_PATH = path.join(DECISION_CORE_PUBLIC_ROOT, 'shadow-diff-latest.json');

const ALLOWED_ZERO_BUY_CAUSES = new Set([
  'NO_EDGE_FOUND',
  'MARKET_REGIME_RED',
  'LEARNING_SAFETY_RED',
  'PIPELINE_FAILED',
  'REQUIRED_MODULE_STALE',
  'INSUFFICIENT_EVIDENCE',
  'EVENT_RISK_BLOCKED',
  'DECISION_CORE_DISABLED',
]);

function readLedger() {
  return readJsonMaybe(LEDGER_PATH) || {
    schema: 'rv.decision_core_shadow_ledger.v1',
    valid_shadow_trading_days: 0,
    days: [],
  };
}

function sameTarget(report, targetMarketDate) {
  if (!report) return false;
  const target = report.target_market_date
    || report.as_of_date
    || report.decision_core?.target_market_date
    || null;
  return !target || isoDate(target) === targetMarketDate;
}

function isOkReport(report) {
  return report?.status === 'OK' || report?.ok === true;
}

export function evaluateShadowDay({
  targetMarketDate,
  validation,
  status,
  diff,
  random20,
  fixtures,
}) {
  const failures = [];
  const counters = validation?.counters || {};
  const unsafe = [
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
  ];

  if (!targetMarketDate) failures.push('target_market_date_missing');
  if (!validation?.ok) failures.push('schema_or_contract_errors');
  for (const key of unsafe) {
    const value = Number(counters[key] ?? diff?.[key] ?? 0);
    if (value > 0) failures.push(`${key}:${value}`);
  }
  if (status?.policy_manifest_loaded !== true) failures.push('policy_manifest_missing');
  if (status?.reason_code_registry_loaded !== true) failures.push('reason_registry_missing');
  if (status?.feature_manifest_loaded !== true) failures.push('feature_manifest_missing');
  if (status?.no_partial_bundle !== true) failures.push('partial_bundle_detected');
  if (status?.atomic_publish_ok !== true) failures.push('atomic_publish_not_ok');
  if (!sameTarget(status, targetMarketDate)) failures.push('status_target_mismatch');
  if (Number(diff?.critical_diff_rate || 0) > 0.02) failures.push(`critical_diff_rate:${diff.critical_diff_rate}`);
  if (diff?.zero_buy_cause && !ALLOWED_ZERO_BUY_CAUSES.has(diff.zero_buy_cause)) failures.push(`zero_buy_unclassified:${diff.zero_buy_cause}`);
  if (!isOkReport(random20)) failures.push('random20_not_ok');
  if (!isOkReport(fixtures)) failures.push('fixtures_not_ok');

  return {
    target_market_date: targetMarketDate,
    valid: failures.length === 0,
    failures,
    generated_at: new Date().toISOString(),
    critical_diff_rate: Number(diff?.critical_diff_rate || 0),
    zero_buy_cause: diff?.zero_buy_cause || status?.zero_buy_cause || null,
    row_count: validation?.row_count || 0,
    part_size_max_bytes: validation?.part_size_max_bytes || 0,
    row_size_max_bytes: validation?.row_size_max_bytes || 0,
    random20_status: random20?.status || 'MISSING',
    fixture_status: fixtures?.status || 'MISSING',
  };
}

function upsertDay(ledger, day) {
  const days = Array.isArray(ledger.days) ? ledger.days.filter((row) => row.target_market_date !== day.target_market_date) : [];
  days.push(day);
  days.sort((a, b) => String(a.target_market_date).localeCompare(String(b.target_market_date)));
  const validDays = days.filter((row) => row.valid);
  return {
    schema: 'rv.decision_core_shadow_ledger.v1',
    generated_at: new Date().toISOString(),
    valid_shadow_trading_days: validDays.length,
    latest_valid_target_market_date: validDays.at(-1)?.target_market_date || null,
    switch_ready: validDays.length >= 20,
    days,
  };
}

export function updateShadowDayLedger({ targetMarketDate }) {
  const validation = validateDecisionCoreRoot(SHADOW_ROOT);
  const status = readJsonMaybe(path.join(SHADOW_ROOT, 'status.json')) || readJsonMaybe(path.join(DECISION_CORE_PUBLIC_ROOT, 'status/latest.json')) || {};
  const diff = readJsonMaybe(SHADOW_DIFF_PATH) || {};
  const random20 = readJsonMaybe(RANDOM20_PATH) || {};
  const fixtures = readJsonMaybe(FIXTURES_PATH) || {};
  const day = evaluateShadowDay({ targetMarketDate, validation, status, diff, random20, fixtures });
  const ledger = upsertDay(readLedger(), day);
  writeJsonAtomic(LEDGER_PATH, ledger);
  return ledger;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const ledger = updateShadowDayLedger({ targetMarketDate: opts.targetMarketDate });
  console.log(JSON.stringify(ledger, null, 2));
  const latest = ledger.days.find((day) => day.target_market_date === opts.targetMarketDate);
  if (!latest?.valid) process.exit(1);
}
