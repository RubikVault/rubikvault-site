import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyZeroBuy } from '../../scripts/decision-core/zero-buy-classifier.mjs';

test('zero-buy classifier never uses MARKET_REGIME_RED as generic fallback', () => {
  assert.equal(classifyZeroBuy({ buy_count: 0, eligible_assets: 100, ev_unavailable_count: 80 }), 'INSUFFICIENT_EVIDENCE');
  assert.equal(classifyZeroBuy({ buy_count: 0, eligible_assets: 100, market_regime_red: true }), 'MARKET_REGIME_RED');
  assert.equal(classifyZeroBuy({ buy_count: 2 }), null);
});
