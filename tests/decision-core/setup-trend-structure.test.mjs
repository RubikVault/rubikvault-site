import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveP0Setup } from '../../scripts/decision-core/resolve-p0-setup.mjs';

const eligible = { eligibility_status: 'ELIGIBLE' };

test('trend continuation requires bullish MA stack and price above SMA200', () => {
  const setup = resolveP0Setup({
    eligibility: eligible,
    regime: { vol_regime: 'normal' },
    features: { close: 105, sma20: 104, sma50: 100, sma200: 90, rsi14: 55, ret_20d_pct: 0.04 },
  });
  assert.equal(setup.primary_setup, 'trend_continuation');
});

test('trend continuation is blocked when SMA200 is missing', () => {
  const setup = resolveP0Setup({
    eligibility: eligible,
    regime: { vol_regime: 'normal' },
    features: { close: 105, sma20: 104, sma50: 100, sma200: null, rsi14: 55, ret_20d_pct: 0.04 },
  });
  assert.equal(setup.primary_setup, 'none');
});

test('trend continuation is blocked in bearish MA stack even with positive recent return', () => {
  const setup = resolveP0Setup({
    eligibility: eligible,
    regime: { vol_regime: 'normal' },
    features: { close: 95, sma20: 98, sma50: 100, sma200: 110, rsi14: 55, ret_20d_pct: 0.04 },
  });
  assert.equal(setup.primary_setup, 'none');
  assert.equal(setup.bias, 'BEARISH');
});

test('mean reversion requires bullish structure', () => {
  const setup = resolveP0Setup({
    eligibility: eligible,
    regime: { vol_regime: 'normal' },
    features: { close: 95, sma20: 98, sma50: 100, sma200: 110, rsi14: 30, ret_20d_pct: -0.02 },
  });
  assert.notEqual(setup.primary_setup, 'mean_reversion');
});
