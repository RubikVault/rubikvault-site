/**
 * RUNBLOCK v3.0 — Liquidity Bucket Classification
 *
 * Classifies tickers by ADV (Average Daily Volume) in USD.
 * Bucket D = untradable (informational only).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

let _cachedBuckets = null;

/**
 * Load bucket definitions from policy.
 */
export async function loadBucketConfig(rootDir) {
  if (_cachedBuckets) return _cachedBuckets;
  const configPath = path.join(rootDir, 'policies/runblock/liquidity-buckets.v3.json');
  const raw = await readFile(configPath, 'utf-8');
  _cachedBuckets = JSON.parse(raw);
  return _cachedBuckets;
}

/**
 * Classify a ticker into a liquidity bucket.
 *
 * @param {number} advUsd - Average Daily Volume in USD
 * @param {number} [spreadPct] - Observed spread percentage
 * @param {Object} [bucketConfig] - Pre-loaded config (optional)
 * @returns {{ bucket: string, label: string, spread_proxy_pct: number, slippage_pct: number, market_impact_pct: number, tradability: boolean }}
 */
export function classifyBucket(advUsd, spreadPct, bucketConfig) {
  const buckets = bucketConfig?.buckets || {};

  // Bucket D: ADV < 500k or spread > 1%
  if (advUsd < (buckets.D?.adv_max_usd || 500000) || (spreadPct != null && spreadPct > (buckets.D?.spread_threshold_pct || 1.0))) {
    const d = buckets.D || {};
    return {
      bucket: 'D',
      label: d.label || 'Untradable',
      spread_proxy_pct: d.spread_proxy_pct || 1.0,
      slippage_pct: d.slippage_pct || 1.0,
      market_impact_pct: 0,
      tradability: false,
    };
  }

  // Bucket C: ADV < 1M
  if (advUsd < (buckets.B?.adv_min_usd || 1000000)) {
    const c = buckets.C || {};
    return {
      bucket: 'C',
      label: c.label || 'Low Liquidity',
      spread_proxy_pct: c.spread_proxy_pct || 0.50,
      slippage_pct: c.slippage_pct || 0.50,
      market_impact_pct: c.market_impact_pct_per_adv || 0.05,
      tradability: true,
    };
  }

  // Bucket B: ADV 1M-10M
  if (advUsd < (buckets.A?.adv_min_usd || 10000000)) {
    const b = buckets.B || {};
    return {
      bucket: 'B',
      label: b.label || 'Medium Liquidity',
      spread_proxy_pct: b.spread_proxy_pct || 0.15,
      slippage_pct: b.slippage_pct || 0.15,
      market_impact_pct: b.market_impact_pct || 0,
      tradability: true,
    };
  }

  // Bucket A: ADV > 10M
  const a = buckets.A || {};
  return {
    bucket: 'A',
    label: a.label || 'High Liquidity',
    spread_proxy_pct: a.spread_proxy_pct || 0.05,
    slippage_pct: a.slippage_pct || 0.05,
    market_impact_pct: a.market_impact_pct || 0,
    tradability: true,
  };
}

/**
 * Compute net return after transaction costs.
 *
 * @param {number} grossReturn - Gross return (decimal, e.g. 0.05 = 5%)
 * @param {Object} bucket - Result from classifyBucket
 * @returns {{ gross_return: number, estimated_spread: number, estimated_slippage: number, estimated_market_impact: number, net_return_after_costs: number, tradability_flag: boolean }}
 */
export function computeNetReturn(grossReturn, bucket) {
  const totalCost = (bucket.spread_proxy_pct + bucket.slippage_pct + bucket.market_impact_pct) / 100;
  return {
    gross_return: grossReturn,
    estimated_spread: bucket.spread_proxy_pct / 100,
    estimated_slippage: bucket.slippage_pct / 100,
    estimated_market_impact: bucket.market_impact_pct / 100,
    net_return_after_costs: grossReturn - totalCost,
    tradability_flag: bucket.tradability,
  };
}
