import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateShadowDay } from '../../scripts/decision-core/update-shadow-day-ledger.mjs';

const cleanValidation = {
  ok: true,
  row_count: 10,
  part_size_max_bytes: 1000,
  row_size_max_bytes: 2000,
  counters: {
    buy_without_decision_grade: 0,
    buy_without_entry_guard: 0,
    buy_without_invalidation: 0,
    buy_without_reason_codes: 0,
    buy_with_tail_risk_high_or_unknown: 0,
    buy_with_ev_proxy_not_positive: 0,
    buy_with_analysis_reliability_low: 0,
    unknown_blocking_reason_code_count: 0,
    hard_veto_without_ui_mapping: 0,
    legacy_buy_fallback_count: 0,
  },
};

const cleanStatus = {
  target_market_date: '2026-05-07',
  policy_manifest_loaded: true,
  reason_code_registry_loaded: true,
  feature_manifest_loaded: true,
  no_partial_bundle: true,
  atomic_publish_ok: true,
};

test('shadow day counts only when contract, manifests, UI fixtures and random20 are valid', () => {
  const day = evaluateShadowDay({
    targetMarketDate: '2026-05-07',
    validation: cleanValidation,
    status: cleanStatus,
    diff: { critical_diff_rate: 0, zero_buy_cause: 'PIPELINE_FAILED' },
    random20: { status: 'OK' },
    fixtures: { status: 'OK' },
  });
  assert.equal(day.valid, true);
});

test('shadow day fails on unsafe BUY counter or missing UI fixture proof', () => {
  const day = evaluateShadowDay({
    targetMarketDate: '2026-05-07',
    validation: { ...cleanValidation, counters: { ...cleanValidation.counters, buy_without_entry_guard: 1 } },
    status: cleanStatus,
    diff: { critical_diff_rate: 0, zero_buy_cause: 'PIPELINE_FAILED' },
    random20: { status: 'OK' },
    fixtures: { status: 'FAILED' },
  });
  assert.equal(day.valid, false);
  assert.ok(day.failures.some((failure) => failure.startsWith('buy_without_entry_guard')));
  assert.ok(day.failures.includes('fixtures_not_ok'));
});
