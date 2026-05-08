export function wouldDemoteUnknownReason(code) {
  return /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/.test(String(code || ''));
}
