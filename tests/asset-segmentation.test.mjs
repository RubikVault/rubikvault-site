import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssetSegmentationProfile,
  classifyLiquidityBucket,
  classifyMarketCapBucket,
} from '../functions/api/_shared/asset-segmentation.mjs';

test('classifies market cap buckets with mega and micro support', () => {
  assert.equal(classifyMarketCapBucket(500e9, 'stock'), 'mega');
  assert.equal(classifyMarketCapBucket(5e9, 'stock'), 'mid');
  assert.equal(classifyMarketCapBucket(100e6, 'stock'), 'micro');
  assert.equal(classifyMarketCapBucket(null, 'stock'), 'unknown');
  assert.equal(classifyMarketCapBucket(100e9, 'etf'), 'fund');
});

test('classifies liquidity buckets from score fallback', () => {
  assert.equal(classifyLiquidityBucket({ liquidityScore: 90 }), 'high');
  assert.equal(classifyLiquidityBucket({ liquidityScore: 55 }), 'mid');
  assert.equal(classifyLiquidityBucket({ liquidityScore: 20 }), 'low');
});

test('builds blue-chip and peripheral lanes deterministically', () => {
  const blueChip = buildAssetSegmentationProfile({
    ticker: 'AAPL',
    assetClass: 'stock',
    marketCapUsd: 2_000_000_000_000,
    liquidityScore: 95,
  });
  assert.equal(blueChip.learning_lane, 'blue_chip_core');
  assert.equal(blueChip.promotion_eligible, true);

  const micro = buildAssetSegmentationProfile({
    ticker: 'OTCM',
    assetClass: 'stock',
    marketCapUsd: 50_000_000,
    liquidityScore: 15,
  });
  assert.equal(micro.learning_lane, 'peripheral');
  assert.equal(micro.promotion_eligible, false);
  assert.ok(micro.protection_reasons.includes('LOW_LIQUIDITY_SEGMENT'));
});
