#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { mapDecisionCoreToUi, missingBundleUi } from '../../public/js/decision-core-ui-map.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const REPORT_PATH = path.join(ROOT, 'public/data/reports/stock-decision-core-ui-fixtures-latest.json');
const REGISTRY_PATH = path.join(ROOT, 'public/data/decision-core/reason-codes/latest.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function horizon(action, reasonCodes) {
  return {
    horizon_action: action,
    horizon_reason: reasonCodes[0] || 'DECISION_CORE_READY',
    horizon_reliability: action === 'BUY' ? 'MEDIUM' : 'LOW',
    horizon_setup: action === 'BUY' ? 'trend_continuation' : 'none',
    horizon_blockers: reasonCodes.filter((code) => /WAIT|STALE|RISK|LOW|UNKNOWN|UNAVAILABLE/.test(code)).slice(0, 3),
  };
}

function baseRow(overrides = {}) {
  const action = overrides.action || 'WAIT';
  const waitSubtype = overrides.wait_subtype ?? (action === 'WAIT' ? 'WAIT_TRIGGER_PENDING' : null);
  const vetos = overrides.vetos || [];
  const reasonCodes = overrides.reason_codes || (waitSubtype ? [waitSubtype] : ['DECISION_CORE_READY']);
  return {
    meta: {
      decision_id: `fixture-${action}-${waitSubtype || 'none'}`,
      asset_id: overrides.asset_id || 'US:FIXTURE',
      asset_type: overrides.asset_type || 'STOCK',
      as_of_date: '2026-05-07',
      target_market_date: '2026-05-07',
      bundle_version: 'decision-core-v1',
      policy_bundle_version: 'p0-safety-core-v1',
      model_version: 'decision-core-p0-v1',
      feature_manifest_id: 'features-p0-v1',
    },
    eligibility: {
      eligibility_status: overrides.eligibility_status || 'ELIGIBLE',
      decision_grade: overrides.decision_grade ?? action === 'BUY',
      vetos,
      warnings: overrides.warnings || [],
    },
    decision: {
      primary_action: action,
      wait_subtype: waitSubtype,
      bias: overrides.bias || 'NEUTRAL',
      analysis_reliability: overrides.analysis_reliability || (action === 'BUY' ? 'MEDIUM' : 'LOW'),
      reliability_rule_version: 'analysis-reliability-p0-v1',
      primary_setup: overrides.primary_setup || (action === 'BUY' ? 'trend_continuation' : 'none'),
      main_blocker: overrides.main_blocker || null,
      next_trigger: overrides.next_trigger || null,
      reason_codes: reasonCodes,
    },
    evidence_summary: {
      evidence_raw_n: overrides.evidence_raw_n ?? (action === 'BUY' ? 42 : 0),
      evidence_effective_n: overrides.evidence_effective_n ?? (action === 'BUY' ? 20 : 0),
      evidence_scope: overrides.evidence_scope || (action === 'BUY' ? 'peer_group' : 'none'),
      evidence_method: overrides.evidence_method || (action === 'BUY' ? 'hist_probs_bootstrap' : 'unavailable'),
      ev_proxy_bucket: overrides.ev_proxy_bucket || (action === 'BUY' ? 'positive' : 'unavailable'),
      tail_risk_bucket: overrides.tail_risk_bucket || (action === 'BUY' ? 'MEDIUM' : 'UNKNOWN'),
    },
    method_status: {
      data_method_risk: overrides.data_method_risk || 'LOW',
      evidence_method_risk: overrides.evidence_method_risk || 'MEDIUM',
    },
    trade_guard: {
      entry_policy: action === 'BUY' ? 'next_session_limit_or_cancel' : 'not_actionable',
      max_entry_price: action === 'BUY' ? 101.25 : null,
      gap_tolerance_pct: action === 'BUY' ? 1.5 : null,
      cancel_if_open_above: action === 'BUY' ? 101.25 : null,
      entry_valid_until: action === 'BUY' ? '2026-05-08' : null,
      invalidation_level: action === 'BUY' ? 96.5 : null,
      invalidation_reason: action === 'BUY' ? 'Setup failed below support.' : null,
      setup_failed_if: action === 'BUY' ? 'Close below invalidation level.' : null,
    },
    evaluation: {
      evaluation_horizon_days: action === 'BUY' ? 20 : null,
      evaluation_policy: action === 'BUY' ? 'fixed_eod_horizon_no_auto_exit' : 'not_evaluated',
    },
    rank_summary: { rank_percentile: null, rank_scope: null },
    horizons: {
      short_term: horizon(action, reasonCodes),
      mid_term: horizon(action, reasonCodes),
      long_term: horizon(action === 'BUY' ? 'WAIT' : action, reasonCodes),
    },
    ui: {
      severity: action === 'BUY' ? 'positive' : action === 'AVOID' ? 'danger' : action === 'UNAVAILABLE' ? 'unavailable' : 'caution',
      show_override_banner: vetos.length > 0,
      disclaimer_policy_version: 'ui-disclaimer-p0-v1',
    },
  };
}

function fixtures() {
  return [
    ['BUY', baseRow({ action: 'BUY', reason_codes: ['STRICT_BUY_GATES_PASSED', 'DECISION_CORE_READY'] })],
    ['WAIT_ENTRY_BAD', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_ENTRY_BAD', reason_codes: ['WAIT_ENTRY_BAD'] })],
    ['WAIT_TRIGGER_PENDING', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_TRIGGER_PENDING', reason_codes: ['WAIT_TRIGGER_PENDING'] })],
    ['WAIT_PULLBACK_WATCH', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_PULLBACK_WATCH', reason_codes: ['WAIT_PULLBACK_WATCH'] })],
    ['WAIT_LOW_EVIDENCE', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_LOW_EVIDENCE', reason_codes: ['WAIT_LOW_EVIDENCE'] })],
    ['WAIT_RISK_BLOCKER', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_RISK_BLOCKER', reason_codes: ['WAIT_RISK_BLOCKER'] })],
    ['WAIT_EVENT_RISK', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_EVENT_RISK', reason_codes: ['WAIT_EVENT_RISK'] })],
    ['WAIT_LOW_RANK', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_LOW_RANK', reason_codes: ['WAIT_LOW_RANK'] })],
    ['WAIT_NO_SETUP', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_NO_SETUP', reason_codes: ['WAIT_NO_SETUP'] })],
    ['WAIT_CONFLICTING_SIGNALS', baseRow({ action: 'WAIT', wait_subtype: 'WAIT_CONFLICTING_SIGNALS', reason_codes: ['WAIT_CONFLICTING_SIGNALS'] })],
    ['AVOID', baseRow({ action: 'AVOID', wait_subtype: null, reason_codes: ['TAIL_RISK_HIGH'], main_blocker: 'TAIL_RISK_HIGH', tail_risk_bucket: 'HIGH' })],
    ['INCUBATING', baseRow({ action: 'INCUBATING', wait_subtype: null, eligibility_status: 'INCUBATING', reason_codes: ['INCUBATING_INSUFFICIENT_BARS'], decision_grade: false })],
    ['UNAVAILABLE', baseRow({ action: 'UNAVAILABLE', wait_subtype: null, eligibility_status: 'NOT_DECISION_GRADE', reason_codes: ['STALE_PRICE'], vetos: ['STALE_PRICE'], main_blocker: 'STALE_PRICE', decision_grade: false })],
    ['NOT_DECISION_GRADE', baseRow({ action: 'UNAVAILABLE', wait_subtype: null, eligibility_status: 'NOT_DECISION_GRADE', reason_codes: ['STALE_PRICE'], vetos: ['STALE_PRICE'], main_blocker: 'STALE_PRICE', decision_grade: false })],
    ['unknown_reason_fallback', baseRow({ action: 'BUY', wait_subtype: null, reason_codes: ['UNMAPPED_BLOCKING_REASON'], main_blocker: 'UNMAPPED_BLOCKING_REASON' })],
    ['missing_bundle', null],
    ['macro_index_context_only', baseRow({ action: 'UNAVAILABLE', wait_subtype: null, asset_type: 'INDEX', asset_id: 'US:SPX', eligibility_status: 'EXCLUDED', reason_codes: ['INDEX_CONTEXT_ONLY'], decision_grade: false })],
  ];
}

function validateMapped(name, mapped, source) {
  const text = JSON.stringify(mapped);
  const assertions = {
    visible_action_exists: ['BUY', 'WAIT', 'AVOID', 'UNAVAILABLE', 'INCUBATING'].includes(mapped.action),
    no_missing_bundle_wait: name !== 'missing_bundle' || mapped.action === 'UNAVAILABLE',
    unavailable_incubating_not_wait: !(['UNAVAILABLE', 'INCUBATING'].includes(source?.decision?.primary_action) && mapped.action === 'WAIT'),
    buy_has_guard: mapped.action !== 'BUY' || (mapped.tradeGuard?.max_entry_price != null && mapped.tradeGuard?.invalidation_level != null),
    reliability_tooltip: /not probability of profit/i.test(mapped.reliabilityTooltip || ''),
    no_ev_number_header: !/\bev_adj|expected value|cvar/i.test(`${mapped.headline} ${mapped.summary}`),
    no_sell_instruction: !/sell after|sell in/i.test(`${mapped.headline} ${mapped.summary}`),
    unknown_blocking_no_buy: source?.decision?.reason_codes?.includes('UNMAPPED_BLOCKING_REASON') ? mapped.action !== 'BUY' : true,
    no_german_text: !/\b(kaufen|verkaufen|wahrscheinlichkeit|treffer)\b/i.test(text),
  };
  return { name, action: mapped.action, ok: Object.values(assertions).every(Boolean), assertions };
}

function main() {
  const registry = readJson(REGISTRY_PATH);
  const results = fixtures().map(([name, row]) => validateMapped(name, row ? mapDecisionCoreToUi(row, registry) : missingBundleUi(), row));
  const report = {
    schema: 'rv.decision_core_ui_fixtures.v1',
    generated_at: new Date().toISOString(),
    status: results.every((row) => row.ok) ? 'OK' : 'FAILED',
    results,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}

main();
