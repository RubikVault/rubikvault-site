import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRow } from '../scripts/ops/build-stock-analyzer-ui-state-summary.mjs';

function baseRow(action = 'AVOID') {
  return {
    canonical_asset_id: 'US:TEST',
    display_ticker: 'TEST',
    target_market_date: '2026-05-07',
    coverage: { ui_renderable: true, bars: 252 },
    status_contract: {
      breakout_status: 'available',
      fundamentals_status: 'available',
      forecast_status: 'available',
      catalysts_status: 'available',
    },
    identity: { asset_class: 'STOCK' },
    market_stats_min: {
      latest_bar_date: '2026-05-07',
      price_date: '2026-05-07',
      as_of: '2026-05-07',
      price_source: 'historical',
      stats_source: 'historical',
      key_levels_ready: true,
      stats: { low_52w: 80, high_52w: 120 },
    },
    key_levels_ready: true,
    module_links: { historical: '/api/v2/page/TEST?asset_id=US%3ATEST' },
    summary_min: {
      decision_verdict: action,
      quality_status: 'OK',
      risk_level: 'UNKNOWN',
      last_close: 100,
      daily_change_abs: 1,
      daily_change_pct: 0.01010101,
    },
    governance_summary: { status: 'ok', blocking_reasons: ['WAIT_RISK_BLOCKER'] },
    decision_core_min: {
      decision: { primary_action: action },
      trade_guard: { max_entry_price: action === 'BUY' ? 101 : null, invalidation_level: action === 'BUY' ? 95 : null },
    },
  };
}

test('Decision-Core AVOID is a valid rendered decision state, not legacy decision_not_buy_or_wait', () => {
  const out = classifyRow(baseRow('AVOID'));
  assert.equal(out.ui_renderable, true);
  assert.equal(out.decision_ready, true);
  assert.equal(out.reasons.includes('decision_not_buy_or_wait'), false);
  assert.equal(out.reasons.includes('risk_unknown'), false);
});

test('Decision-Core BUY still requires public trade guards', () => {
  const row = baseRow('BUY');
  row.decision_core_min.trade_guard = {};
  const out = classifyRow(row);
  assert.equal(out.decision_ready, false);
  assert.equal(out.reasons.includes('decision_core_buy_entry_guard_missing'), true);
  assert.equal(out.reasons.includes('decision_core_buy_invalidation_missing'), true);
});
