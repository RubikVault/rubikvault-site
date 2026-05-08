import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyP0Regime, isMarketRegimeRed } from '../../scripts/decision-core/classify-p0-regime.mjs';
import { readJson } from './shared-fixtures.mjs';

test('P0 regime classifier is deterministic and red only on policy stress', () => {
  const policy = readJson('public/data/decision-core/policies/latest.json');
  const regime = classifyP0Regime({ close: 110, sma50: 100, ret_20d_pct: 0.04, volatility_percentile: 95 }, policy);
  assert.deepEqual(regime, { method: 'sma50_slope_atr_percentile_v1', trend_regime: 'up', vol_regime: 'stress' });
  assert.equal(isMarketRegimeRed(regime, policy), true);
});
