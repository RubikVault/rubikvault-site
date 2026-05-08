const ACTIONS = new Set(['BUY', 'WAIT', 'AVOID', 'UNAVAILABLE', 'INCUBATING']);
const RELIABILITY = new Set(['LOW', 'MEDIUM', 'HIGH']);

export function normalizeDecisionCoreAction(value) {
  const raw = String(value || '').toUpperCase();
  if (ACTIONS.has(raw)) return raw;
  if (raw === 'NOT_DECISION_GRADE' || raw === 'EXCLUDED' || raw === 'WAIT_PIPELINE_INCOMPLETE' || raw === 'N/A' || raw === 'NA') return 'UNAVAILABLE';
  return 'UNAVAILABLE';
}

export function normalizeAnalysisReliability(value) {
  const raw = String(value || '').toUpperCase();
  return RELIABILITY.has(raw) ? raw : 'LOW';
}

export function mapDecisionCoreToUi(row, registry = null) {
  if (!row || typeof row !== 'object') return missingBundleUi();
  const action = normalizeDecisionCoreAction(row?.decision?.primary_action);
  const reliability = normalizeAnalysisReliability(row?.decision?.analysis_reliability);
  const reasonCodes = Array.isArray(row?.decision?.reason_codes) ? row.decision.reason_codes : [];
  const mainBlocker = row?.decision?.main_blocker || firstBlockingReason(reasonCodes, registry);
  const reasons = reasonCodes.slice(0, 3).map((code) => textForReason(code, registry, code)).filter(Boolean);
  const hardVetos = Array.isArray(row?.eligibility?.vetos) ? row.eligibility.vetos : [];
  const unknownBlocking = reasonCodes.some((code) => !reasonMeta(code, registry) && /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/.test(code));
  const safeAction = unknownBlocking && action === 'BUY' ? 'WAIT' : action;
  return {
    action: safeAction,
    rawAction: action,
    bias: row?.decision?.bias || 'NEUTRAL',
    analysisReliability: reliability,
    reliabilityTooltip: 'Analysis reliability describes data and method strength, not probability of profit.',
    headline: headlineFor(safeAction, row),
    summary: summaryFor(safeAction, row, registry),
    bullets: reasons,
    mainBlocker,
    hardVetoBanner: hardVetos.length ? hardVetos.map((code) => textForReason(code, registry, code)).join(' · ') : null,
    tradeGuard: row?.trade_guard || {},
    horizons: row?.horizons || {},
    quantDetails: {
      evidence_raw_n: row?.evidence_summary?.evidence_raw_n ?? null,
      evidence_effective_n: row?.evidence_summary?.evidence_effective_n ?? null,
      evidence_scope: row?.evidence_summary?.evidence_scope || 'none',
      ev_proxy_bucket: row?.evidence_summary?.ev_proxy_bucket || 'unavailable',
      tail_risk_bucket: row?.evidence_summary?.tail_risk_bucket || 'UNKNOWN',
      rank_percentile: row?.rank_summary?.rank_percentile ?? null,
      policy_bundle_version: row?.meta?.policy_bundle_version || null,
      model_version: row?.meta?.model_version || null,
      feature_manifest_id: row?.meta?.feature_manifest_id || null,
      reason_codes: reasonCodes,
    },
    warnings: unknownBlocking ? ['Unmapped blocking reason. Decision kept conservative.'] : [],
  };
}

export function missingBundleUi() {
  return {
    action: 'UNAVAILABLE',
    rawAction: 'UNAVAILABLE',
    bias: 'NEUTRAL',
    analysisReliability: 'LOW',
    reliabilityTooltip: 'Analysis reliability describes data and method strength, not probability of profit.',
    headline: 'Analysis unavailable',
    summary: 'Decision bundle missing or invalid.',
    bullets: ['No legacy BUY fallback is used.'],
    mainBlocker: 'bundle_missing',
    hardVetoBanner: null,
    tradeGuard: {},
    horizons: {},
    quantDetails: {},
    warnings: [],
  };
}

function headlineFor(action, row) {
  if (action === 'BUY') return 'BUY';
  if (action === 'AVOID') return 'AVOID';
  if (action === 'INCUBATING') return 'Incubating';
  if (action === 'UNAVAILABLE') return 'Analysis unavailable';
  const subtype = row?.decision?.wait_subtype;
  if (subtype === 'WAIT_ENTRY_BAD') return 'WAIT - Entry unattractive';
  if (subtype === 'WAIT_TRIGGER_PENDING') return 'WAIT - Trigger pending';
  if (subtype === 'WAIT_PULLBACK_WATCH') return 'WAIT - Pullback watch';
  if (subtype === 'WAIT_LOW_EVIDENCE') return 'WAIT - Evidence too thin';
  if (subtype === 'WAIT_RISK_BLOCKER') return 'WAIT - Risk blocker';
  if (subtype === 'WAIT_EVENT_RISK') return 'WAIT - Event risk';
  if (subtype === 'WAIT_LOW_RANK') return 'WAIT - Better alternatives';
  return 'WAIT';
}

function summaryFor(action, row, registry) {
  if (action === 'BUY') {
    const maxEntry = numberText(row?.trade_guard?.max_entry_price);
    const inval = numberText(row?.trade_guard?.invalidation_level);
    return `Valid only below max entry ${maxEntry}. Setup invalidates below ${inval}.`;
  }
  if (action === 'INCUBATING') return 'Asset is collecting enough history; decision core is offline.';
  if (action === 'UNAVAILABLE') return 'No valid decision can be made today.';
  if (action === 'AVOID') return 'Valid analysis indicates an unfavorable or risky setup.';
  const blocker = row?.decision?.main_blocker;
  return blocker ? textForReason(blocker, registry, 'Waiting protects against poor setup quality.') : 'No attractive action at the current price.';
}

function reasonMeta(code, registry) {
  if (!registry?.codes) return null;
  return registry.codes.find((row) => row.code === code) || null;
}

function textForReason(code, registry, fallback) {
  const meta = reasonMeta(code, registry);
  const key = meta?.public_text_key || meta?.fallback_text_key;
  return (key && registry?.texts?.[key]) || fallback || code;
}

function firstBlockingReason(codes, registry) {
  const rows = codes.map((code) => reasonMeta(code, registry)).filter((row) => row?.is_blocking);
  rows.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  return rows[0]?.code || null;
}

function numberText(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : 'n/a';
}
