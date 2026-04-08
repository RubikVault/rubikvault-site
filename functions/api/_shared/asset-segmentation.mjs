const BLUE_CHIP_MARKET_CAP_USD = 100e9;

function toFinite(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeAssetClass(value, fallback = 'stock') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'etf' || normalized === 'stock') return normalized;
  return fallback;
}

export function classifyMarketCapBucket(marketCapUsd, assetClass = 'stock') {
  const normalizedAssetClass = normalizeAssetClass(assetClass, 'stock');
  if (normalizedAssetClass === 'etf') return 'fund';
  const marketCap = toFinite(marketCapUsd);
  if (marketCap == null || marketCap <= 0) return 'unknown';
  if (marketCap >= 200e9) return 'mega';
  if (marketCap >= 10e9) return 'large';
  if (marketCap >= 2e9) return 'mid';
  if (marketCap >= 250e6) return 'small';
  return 'micro';
}

export function classifyLiquidityBucket({
  advUsd = null,
  liquidityScore = null,
  liquidityState = null,
  assetClass = 'stock',
} = {}) {
  const normalizedAssetClass = normalizeAssetClass(assetClass, 'stock');
  const adv = toFinite(advUsd);
  if (adv != null && adv > 0) {
    const highThreshold = normalizedAssetClass === 'etf' ? 5_000_000 : 2_500_000;
    const midThreshold = normalizedAssetClass === 'etf' ? 500_000 : 250_000;
    if (adv >= highThreshold) return 'high';
    if (adv >= midThreshold) return 'mid';
    return 'low';
  }

  const score = toFinite(liquidityScore);
  if (score != null) {
    if (score >= 75) return 'high';
    if (score >= 40) return 'mid';
    return 'low';
  }

  const state = String(liquidityState || '').trim().toUpperCase();
  if (state === 'HIGH') return 'high';
  if (state === 'MODERATE') return 'mid';
  if (state === 'LOW') return 'low';
  return 'unknown';
}

export function isBlueChipCore({
  assetClass = 'stock',
  marketCapUsd = null,
  marketCapBucket = null,
  liquidityBucket = null,
} = {}) {
  if (normalizeAssetClass(assetClass, 'stock') !== 'stock') return false;
  const marketCap = toFinite(marketCapUsd);
  if (liquidityBucket !== 'high') return false;
  if (marketCap != null) return marketCap >= BLUE_CHIP_MARKET_CAP_USD;
  return marketCapBucket === 'mega';
}

export function buildAssetSegmentationProfile({
  ticker = null,
  assetClass = 'stock',
  marketCapUsd = null,
  liquidityScore = null,
  liquidityState = null,
  advUsd = null,
  exchange = null,
} = {}) {
  const normalizedAssetClass = normalizeAssetClass(assetClass, 'stock');
  const market_cap_bucket = classifyMarketCapBucket(marketCapUsd, normalizedAssetClass);
  const liquidity_bucket = classifyLiquidityBucket({
    advUsd,
    liquidityScore,
    liquidityState,
    assetClass: normalizedAssetClass,
  });
  const blue_chip_core = isBlueChipCore({
    assetClass: normalizedAssetClass,
    marketCapUsd,
    marketCapBucket: market_cap_bucket,
    liquidityBucket: liquidity_bucket,
  });

  let learning_lane = 'core';
  if (blue_chip_core) learning_lane = 'blue_chip_core';
  else if (
    liquidity_bucket === 'low'
    || (normalizedAssetClass === 'stock' && market_cap_bucket === 'micro')
  ) {
    learning_lane = 'peripheral';
  }

  const protection_reasons = [];
  if (liquidity_bucket === 'low') protection_reasons.push('LOW_LIQUIDITY_SEGMENT');
  if (normalizedAssetClass === 'stock' && market_cap_bucket === 'micro') protection_reasons.push('MICRO_CAP_SEGMENT');

  return {
    ticker: ticker ? String(ticker).toUpperCase() : null,
    exchange: exchange ? String(exchange).toUpperCase() : null,
    asset_class: normalizedAssetClass,
    market_cap_usd: toFinite(marketCapUsd),
    market_cap_bucket,
    liquidity_bucket,
    blue_chip_core,
    learning_lane,
    primary_learning_eligible: learning_lane !== 'peripheral',
    shadow_learning_only: learning_lane === 'peripheral',
    promotion_eligible: protection_reasons.length === 0,
    protection_reasons,
    segment_key: [
      normalizedAssetClass,
      liquidity_bucket,
      market_cap_bucket,
      learning_lane,
    ].join(':'),
  };
}
