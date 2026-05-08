import { HARD_VETO_CODES, uniqueStrings } from './shared.mjs';

export function splitVetoCodes(codes = []) {
  const vetos = [];
  const blockers = [];
  const warnings = [];
  for (const code of uniqueStrings(codes)) {
    if (HARD_VETO_CODES.has(code)) vetos.push(code);
    else if (code === 'PENDING_EARNINGS_SHORT_TERM' || code === 'EARNINGS_COVERAGE_UNAVAILABLE') blockers.push(code);
    else warnings.push(code);
  }
  return { vetos, blockers, warnings };
}

export function hasHardVeto(codes = []) {
  return uniqueStrings(codes).some((code) => HARD_VETO_CODES.has(code));
}
