import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDecision } from '../functions/api/_shared/stock-decisions-v1.js';

function bullishInput(segmentationProfile) {
  return {
    states: {
      trend: 'UP',
      momentum: 'BULLISH',
      volatility: 'NORMAL',
      volume: 'ABOVE_AVG',
      liquidity: 'HIGH',
    },
    stats: {
      sma20: 105,
      sma50: 100,
      sma200: 90,
      rsi14: 58,
      macd_hist: 0.7,
      volatility_percentile: 40,
      breakout_energy: 0.8,
      trend_duration_days: 25,
      liquidity_score: 90,
      ret_5d_pct: 0.03,
      ret_20d_pct: 0.08,
    },
    close: 110,
    scientific: {
      setup: { score: 78 },
      trigger: { score: 70 },
    },
    quantlab: {
      consensus: { buyExperts: 8, avoidExperts: 1, strongOrBetterExperts: 7 },
      ranking: { avgTopPercentile: 92 },
    },
    runtimeControl: {
      learning_status: 'ACTIVE',
      safety_switch: { level: 'GREEN', actions: ['normal'] },
    },
    segmentationProfile,
  };
}

test('micro-cap peripheral segment blocks buy eligibility', () => {
  const result = makeDecision(bullishInput({
    asset_class: 'stock',
    liquidity_bucket: 'low',
    market_cap_bucket: 'micro',
    learning_lane: 'peripheral',
    blue_chip_core: false,
    promotion_eligible: false,
    protection_reasons: ['MICRO_CAP_SEGMENT'],
  }));
  assert.equal(result.horizons.medium.verdict, 'BUY');
  assert.equal(result.horizons.medium.buy_eligible, false);
  assert.equal(result.horizons.medium.abstain_reason, 'MICRO_CAP_SEGMENT');
});

test('blue-chip core segment keeps strong setup promotion-eligible', () => {
  const result = makeDecision(bullishInput({
    asset_class: 'stock',
    liquidity_bucket: 'high',
    market_cap_bucket: 'mega',
    learning_lane: 'blue_chip_core',
    blue_chip_core: true,
    promotion_eligible: true,
    protection_reasons: [],
  }));
  assert.equal(result.horizons.medium.verdict, 'BUY');
  assert.equal(result.horizons.medium.buy_eligible, true);
});
