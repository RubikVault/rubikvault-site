const DEFAULT_REQUIRED_FIELD_COVERAGE_MIN = 0.90;

function bool(value) {
  return value === true;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function reason(id, severity = 'critical', details = null) {
  return details == null ? { id, severity } : { id, severity, details };
}

function readFalseGreenCount(stockUiState = null) {
  return num(
    stockUiState?.false_green_ui_render
    ?? stockUiState?.false_green_ui_render_count
    ?? stockUiState?.counts?.false_green_ui_render
    ?? stockUiState?.counts?.false_green_ui_render_count
    ?? 0
  );
}

export function buildReleaseGateModel({
  coreReleaseReady = false,
  pageCoreReady = false,
  searchReady = true,
  universeReady = true,
  stockUiState = null,
  stockUiReleaseEligible = null,
  histReady = null,
  previewSmokeOk = true,
  requiredFieldCoverageMin = DEFAULT_REQUIRED_FIELD_COVERAGE_MIN,
} = {}) {
  const releaseEligible = stockUiReleaseEligible == null
    ? (stockUiState?.ui_renderable_release_eligible ?? stockUiState?.release_eligible) === true
    : bool(stockUiReleaseEligible);
  const coverage = num(stockUiState?.ui_renderable_ratio ?? stockUiState?.ui_operational_ratio, releaseEligible ? 1 : 0);
  const contractViolations = num(stockUiState?.counts?.contract_violation_total ?? 0);
  const missingScopeRows = num(stockUiState?.missing_scope_rows ?? 0);
  const falseGreenCount = readFalseGreenCount(stockUiState);

  const blockingReasons = [];
  if (!bool(coreReleaseReady)) blockingReasons.push(reason('core_release_not_ready'));
  if (!bool(pageCoreReady)) blockingReasons.push(reason('page_core_not_ready'));
  if (!bool(searchReady)) blockingReasons.push(reason('search_not_ready'));
  if (!bool(universeReady)) blockingReasons.push(reason('universe_not_ready'));
  if (!releaseEligible) blockingReasons.push(reason('stock_ui_not_release_eligible'));
  if (coverage < requiredFieldCoverageMin) {
    blockingReasons.push(reason('required_field_coverage_below_minimum', 'critical', {
      coverage,
      required: requiredFieldCoverageMin,
    }));
  }
  if (contractViolations > 0) blockingReasons.push(reason('stock_ui_contract_violations', 'critical', { count: contractViolations }));
  if (missingScopeRows > 0) blockingReasons.push(reason('stock_ui_missing_scope_rows', 'critical', { count: missingScopeRows }));
  if (falseGreenCount > 0) blockingReasons.push(reason('false_green_ui_render', 'critical', { count: falseGreenCount }));
  if (!bool(previewSmokeOk)) blockingReasons.push(reason('preview_smoke_not_ok'));

  const warningReasons = [];
  if (histReady === false) warningReasons.push(reason('hist_probs_not_release_green', 'warning'));

  const releaseUiReady = blockingReasons.length === 0;
  return {
    schema: 'rv.release_gate_model.v1',
    release_ui_ready: releaseUiReady,
    deploy_allowed: releaseUiReady,
    ui_green: releaseUiReady,
    required_field_coverage: coverage,
    required_field_coverage_minimum: requiredFieldCoverageMin,
    false_green_count: falseGreenCount,
    contract_violation_total: contractViolations,
    missing_scope_rows: missingScopeRows,
    hist_ready: histReady,
    hist_release_blocking: false,
    blocking_reasons: blockingReasons,
    warning_reasons: warningReasons,
  };
}
