import { horizonBlockers, uniqueStrings } from './shared.mjs';

export const HORIZON_DAYS = {
  short_term: 5,
  mid_term: 20,
  long_term: 120,
};

export function resolveHorizonState({ horizon, baseAction, setup, evidence, evRisk, reliability, reasonCodes, reasonMap, policy } = {}) {
  let action = baseAction;
  const blockers = horizonBlockers(reasonCodes, reasonMap, horizon);
  const requireLongEvidence = policy?.evidence?.require_long_horizon_profile === true;
  if (horizon === 'long_term' && requireLongEvidence && evidence?.evidence_method === 'unavailable' && !blockers.includes('LONG_HORIZON_EVIDENCE_MISSING')) {
    blockers.unshift('LONG_HORIZON_EVIDENCE_MISSING');
  }
  const cappedBlockers = blockers.slice(0, 3);
  if (blockers.length && action === 'BUY') action = 'WAIT';
  if (horizon === 'long_term' && requireLongEvidence && evidence?.evidence_method === 'unavailable') action = 'WAIT';
  return {
    horizon_action: action,
    horizon_reason: cappedBlockers[0] || reasonCodes?.[0] || null,
    horizon_reliability: reliability,
    horizon_setup: setup?.primary_setup || 'none',
    horizon_blockers: cappedBlockers,
  };
}

export function resolveOverallAction({ eligibility, decisionGrade, setup, evidence, evRisk, reliability, reasonCodes, reasonMap, candidate }) {
  const status = eligibility?.eligibility_status;
  if (status === 'INCUBATING') return { primary_action: 'INCUBATING', wait_subtype: null };
  if (status === 'EXCLUDED' || status === 'NOT_DECISION_GRADE') return { primary_action: 'UNAVAILABLE', wait_subtype: null };
  if (status === 'LIMITED_HISTORY') return { primary_action: 'WAIT', wait_subtype: 'WAIT_LOW_EVIDENCE' };
  if (setup?.bias === 'BEARISH' && decisionGrade?.decision_grade === true) return { primary_action: 'AVOID', wait_subtype: null };
  if (canBuy({ eligibility, decisionGrade, setup, evidence, evRisk, reliability, reasonCodes, candidate })) return { primary_action: 'BUY', wait_subtype: null };
  return { primary_action: 'WAIT', wait_subtype: waitSubtypeFor({ setup, evidence, evRisk, reasonCodes, candidate, reasonMap }) };
}

export function canBuy({ eligibility, decisionGrade, setup, evidence, evRisk, reliability, reasonCodes, candidate }) {
  return eligibility?.eligibility_status === 'ELIGIBLE'
    && decisionGrade?.decision_grade === true
    && candidate === true
    && setup?.primary_setup && setup.primary_setup !== 'none'
    && evidence?.evidence_effective_n > 0
    && evRisk?.ev_proxy_bucket === 'positive'
    && ['LOW', 'MEDIUM'].includes(evRisk?.tail_risk_bucket)
    && evRisk?.cost_proxy_available === true
    && reliability !== 'LOW'
    && !uniqueStrings(reasonCodes).some((code) => [
      'WAIT_LOW_EVIDENCE',
      'COST_PROXY_UNAVAILABLE',
      'COST_PROXY_HIGH',
      'TAIL_RISK_HIGH',
      'TAIL_RISK_UNKNOWN',
      'EV_PROXY_UNAVAILABLE',
      'EV_PROXY_NOT_POSITIVE',
    ].includes(code));
}

function waitSubtypeFor({ setup, evidence, evRisk, reasonCodes, candidate }) {
  const codes = uniqueStrings(reasonCodes);
  if (codes.includes('WAIT_EVENT_RISK') || codes.includes('PENDING_EARNINGS_SHORT_TERM')) return 'WAIT_EVENT_RISK';
  if (codes.includes('WAIT_LOW_EVIDENCE') || evidence?.evidence_effective_n <= 0) return 'WAIT_LOW_EVIDENCE';
  if (codes.includes('COST_PROXY_HIGH') || codes.includes('TAIL_RISK_HIGH') || codes.includes('TAIL_RISK_UNKNOWN')) return 'WAIT_RISK_BLOCKER';
  if (candidate === false) return 'WAIT_LOW_RANK';
  if (setup?.modifiers?.includes('pullback_watch')) return 'WAIT_PULLBACK_WATCH';
  if (setup?.primary_setup === 'none') return 'WAIT_NO_SETUP';
  if (codes.includes('WAIT_ENTRY_BAD')) return 'WAIT_ENTRY_BAD';
  return 'WAIT_TRIGGER_PENDING';
}
