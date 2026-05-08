import { hasHardVeto } from './hard-vetos.mjs';

export function resolveDecisionGrade({
  eligibility,
  targetMarketDate,
  policy,
  featureManifest,
  reasonRegistry,
  buyCriticalFeaturesAvailable = true,
} = {}) {
  const reasons = [];
  if (!eligibility || eligibility.eligibility_status !== 'ELIGIBLE') reasons.push('eligibility_not_eligible');
  if (!targetMarketDate) reasons.push('target_market_date_missing');
  if (!eligibility?.as_of_date) reasons.push('as_of_date_missing');
  if (eligibility?.as_of_date && targetMarketDate && eligibility.as_of_date > targetMarketDate) reasons.push('as_of_after_target');
  if (hasHardVeto(eligibility?.vetos || [])) reasons.push('hard_veto_active');
  if (!policy?.policy_bundle_version) reasons.push('policy_manifest_missing');
  if (!featureManifest?.feature_manifest_id) reasons.push('feature_manifest_missing');
  if (!reasonRegistry?.codes?.length) reasons.push('reason_registry_missing');
  if (!policy?.adjusted_data_policy) reasons.push('adjusted_data_policy_missing');
  if ((eligibility?.vetos || []).includes('STALE_PRICE')) reasons.push('stale_price');
  if ((eligibility?.vetos || []).includes('CRITICAL_DATA_GAP')) reasons.push('critical_data_gap');
  if ((eligibility?.vetos || []).some((code) => code === 'SUSPECT_SPLIT' || code === 'SUSPICIOUS_ADJUSTED_DATA')) reasons.push('suspect_adjusted_data');
  if ((eligibility?.vetos || []).includes('HALTED_RECENTLY')) reasons.push('recent_halt_or_provider_mismatch');
  if (!buyCriticalFeaturesAvailable) reasons.push('missing_buy_critical_feature');

  return {
    decision_grade: reasons.length === 0,
    decision_grade_blockers: reasons,
  };
}
