import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_ROW_RAW_TARGET_BYTES } from '../../scripts/decision-core/shared.mjs';

test('worst-case compact row stays near public budget', () => {
  const row = {
    meta: { decision_id: 'x', asset_id: 'US:TEST', asset_type: 'STOCK', as_of_date: '2026-05-07', target_market_date: '2026-05-07', bundle_version: 'decision-core-v1', policy_bundle_version: 'p', model_version: 'm', feature_manifest_id: 'f' },
    eligibility: { eligibility_status: 'ELIGIBLE', decision_grade: true, vetos: [], warnings: [] },
    decision: { primary_action: 'BUY', wait_subtype: null, bias: 'BULLISH', analysis_reliability: 'MEDIUM', reliability_rule_version: 'r', primary_setup: 'trend_continuation', main_blocker: null, next_trigger: 'Buy only if next session opens below max entry price.', reason_codes: ['STRICT_BUY_GATES_PASSED', 'DECISION_CORE_READY'] },
    evidence_summary: { evidence_raw_n: 80, evidence_effective_n: 60, evidence_scope: 'asset_type', evidence_method: 'hist_probs_v2_bootstrap', ev_proxy_bucket: 'positive', tail_risk_bucket: 'LOW' },
    method_status: { data_method_risk: 'LOW', evidence_method_risk: 'MEDIUM', pit_risk: 'LOW', survivorship_risk: 'UNKNOWN' },
    trade_guard: { entry_policy: 'next_session_limit_or_cancel', max_entry_price: 101, gap_tolerance_pct: 1, cancel_if_open_above: 101, entry_valid_until: '2026-05-08', invalidation_level: 95, invalidation_reason: 'Setup fails below key support/ATR structure.', setup_failed_if: 'close_below_invalidation_level' },
    evaluation: { evaluation_horizon_days: 20, evaluation_policy: 'fixed_eod_horizon_no_auto_exit' },
    rank_summary: { rank_percentile: null, rank_scope: null },
    horizons: { short_term: { horizon_action: 'BUY', horizon_reason: null, horizon_reliability: 'MEDIUM', horizon_setup: 'trend_continuation', horizon_blockers: [] }, mid_term: { horizon_action: 'BUY', horizon_reason: null, horizon_reliability: 'MEDIUM', horizon_setup: 'trend_continuation', horizon_blockers: [] }, long_term: { horizon_action: 'WAIT', horizon_reason: 'LONG_HORIZON_EVIDENCE_MISSING', horizon_reliability: 'MEDIUM', horizon_setup: 'trend_continuation', horizon_blockers: ['LONG_HORIZON_EVIDENCE_MISSING'] } },
    ui: { severity: 'positive', show_override_banner: false, disclaimer_policy_version: 'd' },
  };
  assert.ok(Buffer.byteLength(JSON.stringify(row), 'utf8') <= UI_ROW_RAW_TARGET_BYTES);
});
