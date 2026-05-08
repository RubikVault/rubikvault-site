export const ZERO_BUY_CAUSES = new Set([
  'NO_EDGE_FOUND',
  'MARKET_REGIME_RED',
  'LEARNING_SAFETY_RED',
  'PIPELINE_FAILED',
  'REQUIRED_MODULE_STALE',
  'INSUFFICIENT_EVIDENCE',
  'EVENT_RISK_BLOCKED',
  'DECISION_CORE_DISABLED',
]);

export function classifyZeroBuy(summary = {}) {
  if (Number(summary.buy_count || 0) > 0) return null;
  if (summary.decision_core_disabled) return 'DECISION_CORE_DISABLED';
  if (summary.pipeline_failed || Number(summary.eligible_assets || 0) === 0) return 'PIPELINE_FAILED';
  if (summary.required_module_stale) return 'REQUIRED_MODULE_STALE';
  if (summary.learning_safety_red) return 'LEARNING_SAFETY_RED';
  if (summary.market_regime_red && !summary.pipeline_failed && !summary.required_module_stale) return 'MARKET_REGIME_RED';
  if (Number(summary.ev_unavailable_count || 0) > Number(summary.eligible_assets || 0) * 0.5) return 'INSUFFICIENT_EVIDENCE';
  if (Number(summary.event_veto_count || 0) > 0 && Number(summary.wait_count || 0) > 0) return 'EVENT_RISK_BLOCKED';
  return 'NO_EDGE_FOUND';
}
