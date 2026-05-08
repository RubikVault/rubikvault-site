export function resolveAnalysisReliability(row, policy = {}, context = {}) {
  const low = lowForcing(row, context);
  if (low.length) return { analysis_reliability: 'LOW', reliability_blockers: low };
  const highEnabled = policy?.reliability_policy?.high_enabled === true
    && String(policy?.reliability_policy?.public_max_reliability || '').toUpperCase() === 'HIGH';
  if (highEnabled && highEligible(row, policy)) return { analysis_reliability: 'HIGH', reliability_blockers: [] };
  return { analysis_reliability: 'MEDIUM', reliability_blockers: [] };
}

export function lowForcing(row, context = {}) {
  const reasons = [];
  if (row?.eligibility?.decision_grade !== true) reasons.push('decision_grade_false');
  if (row?.eligibility?.eligibility_status !== 'ELIGIBLE') reasons.push('eligibility_not_eligible');
  if (Array.isArray(row?.eligibility?.vetos) && row.eligibility.vetos.length) reasons.push('hard_veto_active');
  if (context.policyLoaded === false) reasons.push('missing_policy_manifest');
  if (context.featureManifestLoaded === false) reasons.push('missing_feature_manifest');
  if (context.reasonRegistryLoaded === false) reasons.push('missing_reason_registry');
  if (context.unknownBlockingReason) reasons.push('unknown_blocking_reason');
  if ((row?.decision?.primary_action === 'BUY' || row?.decision?.primary_action === 'WAIT' || row?.decision?.primary_action === 'AVOID') && !(row?.decision?.reason_codes || []).length) reasons.push('missing_required_reason_codes');
  if (Number(row?.evidence_summary?.evidence_effective_n || 0) <= 0) reasons.push('insufficient_effective_n');
  if (row?.evidence_summary?.evidence_scope === 'none') reasons.push('evidence_none');
  if (row?.evidence_summary?.ev_proxy_bucket === 'unavailable') reasons.push('ev_unavailable');
  if (row?.evidence_summary?.tail_risk_bucket === 'HIGH' || row?.evidence_summary?.tail_risk_bucket === 'UNKNOWN') reasons.push('tail_high_or_unknown');
  if (row?.method_status?.data_method_risk === 'HIGH' || row?.method_status?.evidence_method_risk === 'HIGH') reasons.push('critical_method_risk');
  if (row?.decision?.primary_action === 'BUY') {
    if (row?.trade_guard?.max_entry_price == null || row?.trade_guard?.invalidation_level == null) reasons.push('missing_entry_or_invalidation');
  }
  if (context.asOfMismatch) reasons.push('as_of_mismatch');
  return reasons;
}

function highEligible(row, policy = {}) {
  const min = policy?.reliability_policy?.high_effective_n?.mid_term || 80;
  return row?.eligibility?.decision_grade === true
    && row?.eligibility?.eligibility_status === 'ELIGIBLE'
    && Number(row?.evidence_summary?.evidence_effective_n || 0) >= min
    && ['asset', 'peer_group'].includes(row?.evidence_summary?.evidence_scope)
    && ['LOW', 'MEDIUM'].includes(row?.evidence_summary?.tail_risk_bucket)
    && row?.evidence_summary?.ev_proxy_bucket === 'positive'
    && !(row?.eligibility?.vetos || []).length
    && row?.trade_guard?.max_entry_price != null
    && row?.trade_guard?.invalidation_level != null;
}
