import { finiteNumber } from './shared.mjs';

export function computeCoarseScore({ eligibility, features, setup, regime }) {
  if (eligibility?.eligibility_status !== 'ELIGIBLE') return null;
  let score = 50;
  const liq = finiteNumber(features?.liquidity_score);
  const ret20 = finiteNumber(features?.ret_20d_pct);
  const vol = finiteNumber(features?.volatility_percentile);
  if (liq != null) score += (liq - 50) * 0.25;
  if (ret20 != null) score += Math.max(-20, Math.min(20, ret20 * 300));
  if (vol != null && vol > 80) score -= 15;
  if (setup?.primary_setup !== 'none') score += 15;
  if (regime?.vol_regime === 'stress') score -= 25;
  return Math.max(0, Math.min(100, score));
}

export function isCandidate({ coarseScore, eligibility, policy }) {
  if (eligibility?.eligibility_status !== 'ELIGIBLE') return false;
  const min = Number(policy?.candidate_selection_policy?.default_top_bucket_min_percentile || 80);
  return Number(coarseScore) >= Math.max(50, min - 10);
}
