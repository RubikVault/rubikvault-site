import crypto from 'node:crypto';

export const DECISION_PARTITION_COUNT = 64;
export const DEFAULT_MIN_HISTORY_BARS = 200;
export const DECISION_SCHEMA = 'rv.asset_daily_decision.v1';

export const DECISION_REASON_CODES = new Set([
  'target_date_mismatch',
  'bundle_missing',
  'bundle_stale',
  'bundle_hash_mismatch',
  'manifest_missing',
  'summary_missing',
  'index_missing',
  'part_missing',
  'asset_missing',
  'bars_missing',
  'bars_stale',
  'bars_insufficient_history',
  'bars_fingerprint_mismatch',
  'risk_unknown',
  'hist_probs_missing',
  'hist_probs_stale',
  'quantlab_missing',
  'forecast_missing',
  'scientific_missing',
  'breakout_missing',
  'provider_no_data',
  'inactive_asset',
  'macro_index_only',
  'zero_buy_anomaly',
  'crash_unresolved',
  'heartbeat_stale',
  'nas_required_unmet',
  'mac_prod_blocked',
  'publish_chain_not_ok',
  'unclassified_missing',
]);

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Prefix(value) {
  return `sha256:${sha256Hex(value)}`;
}

export function normalizeIsoDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function decisionHash(decision) {
  return sha256Prefix(stableStringify(decision));
}

export function hashMod64(canonicalId) {
  const hex = sha256Hex(String(canonicalId || '').toUpperCase());
  const value = Number.parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(value) ? value % DECISION_PARTITION_COUNT : 0;
}

export function partName(partition) {
  const value = Number(partition);
  if (!Number.isInteger(value) || value < 0 || value >= DECISION_PARTITION_COUNT) {
    throw new Error(`INVALID_DECISION_PARTITION:${partition}`);
  }
  return `part-${String(value).padStart(3, '0')}.ndjson.gz`;
}

export function buildSnapshotId({ runId, targetMarketDate, manifestSeed = '' }) {
  const target = normalizeIsoDate(targetMarketDate);
  if (!target) throw new Error('SNAPSHOT_ID_TARGET_MARKET_DATE_REQUIRED');
  const shortHash = sha256Hex(`${runId || ''}|${target}|${manifestSeed || ''}`).slice(0, 12);
  return `dec-${target.replaceAll('-', '')}-${shortHash}`;
}

export function classifyCoverage(row, {
  minHistoryBars = DEFAULT_MIN_HISTORY_BARS,
  targetMarketDate = null,
  staleAfterCalendarDays = 10,
} = {}) {
  const canonicalId = String(row?.canonical_id || row?.id || '').trim().toUpperCase();
  const symbol = String(row?.symbol || canonicalId.split(':').pop() || '').trim().toUpperCase();
  const assetClass = String(row?.asset_class || row?.type_norm || row?.type || '').trim().toUpperCase();
  const barsCount = Number.isFinite(Number(row?.bars_count)) ? Number(row.bars_count) : 0;
  const lastTradeDate = normalizeIsoDate(row?.last_trade_date || row?.bars_latest_date || row?.as_of || null);
  const target = normalizeIsoDate(targetMarketDate);
  const isIndex = assetClass === 'INDEX';
  const tradability = assetClass === 'STOCK' || assetClass === 'ETF' || row?.tradability === true;
  const evaluationRole = isIndex && row?.tradability !== true ? 'macro' : 'tradable';
  const reasonCodes = [];
  const warnings = [];
  let coverageClass = 'eligible';
  let pipelineStatus = 'OK';
  let verdict = 'WAIT';

  if (!canonicalId || !symbol || !assetClass) {
    return {
      canonicalId,
      symbol,
      assetClass: assetClass || 'UNKNOWN',
      tradability: false,
      evaluationRole: 'unknown',
      coverageClass: 'unclassified_missing',
      pipelineStatus: 'FAILED',
      verdict: 'WAIT_PIPELINE_INCOMPLETE',
      reasonCodes: ['unclassified_missing'],
      warnings,
      barsCount,
      lastTradeDate,
    };
  }

  if (evaluationRole === 'macro') {
    coverageClass = 'macro_only';
    pipelineStatus = 'DEGRADED';
    verdict = 'WAIT_PIPELINE_INCOMPLETE';
    reasonCodes.push('macro_index_only');
  } else if (!tradability) {
    coverageClass = 'inactive';
    pipelineStatus = 'DEGRADED';
    verdict = 'WAIT_PIPELINE_INCOMPLETE';
    reasonCodes.push('inactive_asset');
  } else if (barsCount <= 0) {
    coverageClass = 'provider_no_data';
    pipelineStatus = 'DEGRADED';
    verdict = 'WAIT_PIPELINE_INCOMPLETE';
    reasonCodes.push('bars_missing', 'provider_no_data');
  } else if (barsCount < minHistoryBars) {
    coverageClass = 'insufficient_history';
    pipelineStatus = 'DEGRADED';
    verdict = 'WAIT_PIPELINE_INCOMPLETE';
    reasonCodes.push('bars_insufficient_history');
  } else if (target && lastTradeDate) {
    const ageMs = Date.parse(`${target}T00:00:00Z`) - Date.parse(`${lastTradeDate}T00:00:00Z`);
    const ageDays = Number.isFinite(ageMs) ? Math.floor(ageMs / 86400000) : 0;
    if (ageDays > staleAfterCalendarDays) {
      pipelineStatus = 'FAILED';
      verdict = 'WAIT_PIPELINE_INCOMPLETE';
      reasonCodes.push('bars_stale');
    } else if (ageDays > 0) {
      warnings.push('bars_stale');
    }
  }

  return {
    canonicalId,
    symbol,
    assetClass,
    tradability,
    evaluationRole,
    coverageClass,
    pipelineStatus,
    verdict,
    reasonCodes,
    warnings,
    barsCount,
    lastTradeDate,
  };
}

export function buildAssetDecision(row, {
  runId,
  snapshotId,
  targetMarketDate,
  generatedAt,
  minHistoryBars = DEFAULT_MIN_HISTORY_BARS,
} = {}) {
  const classified = classifyCoverage(row, { minHistoryBars, targetMarketDate });
  const score = Number.isFinite(Number(row?.computed?.score_0_100)) ? Number(row.computed.score_0_100) : null;
  const riskScore = score == null ? null : Math.max(0, Math.min(100, 100 - score));
  const riskKnown = classified.coverageClass === 'eligible'
    && classified.pipelineStatus !== 'FAILED'
    && Number.isFinite(riskScore);
  const blockingReasons = classified.pipelineStatus === 'FAILED'
    ? classified.reasonCodes.filter((code) => DECISION_REASON_CODES.has(code))
    : [];
  const reasonCodes = [...new Set([
    ...classified.reasonCodes,
    ...(riskKnown ? ['risk_known'] : classified.coverageClass === 'eligible' ? ['risk_unknown'] : []),
    ...(classified.coverageClass === 'eligible' && classified.pipelineStatus === 'OK' ? ['strict_full_coverage'] : []),
  ])];

  let pipelineStatus = classified.pipelineStatus;
  let verdict = classified.verdict;
  if (classified.coverageClass === 'eligible' && !riskKnown) {
    pipelineStatus = 'FAILED';
    verdict = 'WAIT_PIPELINE_INCOMPLETE';
    blockingReasons.push('risk_unknown');
  }

  const decision = {
    schema: DECISION_SCHEMA,
    schema_version: '1.0',
    run_id: runId || null,
    snapshot_id: snapshotId || null,
    target_market_date: normalizeIsoDate(targetMarketDate),
    generated_at: generatedAt || new Date().toISOString(),
    canonical_id: classified.canonicalId,
    symbol: classified.symbol,
    asset_class: classified.assetClass,
    tradability: classified.tradability,
    evaluation_role: classified.evaluationRole,
    coverage_class: classified.coverageClass,
    pipeline_status: pipelineStatus,
    verdict,
    reason_codes: reasonCodes,
    blocking_reasons: [...new Set(blockingReasons)],
    warnings: [...new Set(classified.warnings)],
    risk_assessment: {
      level: riskKnown ? (riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MODERATE' : 'LOW') : 'UNKNOWN',
      score: riskKnown ? Number(riskScore.toFixed(2)) : null,
      reasoning: riskKnown
        ? 'Registry-backed bar coverage is sufficient for the daily core risk estimate.'
        : 'Risk is unavailable until required local bar coverage and receipts are complete.',
    },
    model_coverage: {
      bars: classified.coverageClass === 'eligible' ? (pipelineStatus === 'OK' ? 'OK' : 'DEGRADED') : 'MISSING',
      hist_probs: 'OPTIONAL_V1',
      quantlab: 'OPTIONAL_V1',
      forecast: 'OPTIONAL_V1',
      scientific: 'OPTIONAL_V1',
      breakout: 'OPTIONAL_V1',
      fundamentals: classified.assetClass === 'ETF' ? 'NOT_APPLICABLE' : 'OPTIONAL_V1',
    },
    data_freshness: {
      bars_as_of: classified.lastTradeDate,
      hist_probs_as_of: null,
      quantlab_as_of: null,
      forecast_as_of: null,
      scientific_as_of: null,
    },
    input_fingerprints: {
      bars_fingerprint: row?.pointers?.pack_sha256 || null,
      hist_probs_fingerprint: null,
      model_fingerprint: row?.meta?.run_id ? sha256Prefix(String(row.meta.run_id)) : null,
    },
  };

  if (classified.coverageClass === 'eligible' && pipelineStatus === 'OK') {
    decision.scores = {
      composite: score,
      trend: score,
      entry: score,
      risk: riskKnown ? Number((100 - riskScore).toFixed(2)) : null,
      context: score,
    };
  }
  return decision;
}

export function computeDecisionSummary(decisions) {
  const summary = {
    assets_total_universe: decisions.length,
    assets_tradable_total: 0,
    assets_macro_total: 0,
    assets_expected_for_decision: 0,
    assets_processed: decisions.length,
    assets_eligible: 0,
    assets_insufficient_history: 0,
    assets_provider_no_data: 0,
    assets_inactive: 0,
    assets_macro_only: 0,
    assets_unclassified_missing: 0,
    buy_count: 0,
    wait_count: 0,
    wait_pipeline_incomplete_count: 0,
    eligible_wait_pipeline_incomplete_count: 0,
    pipeline_ok_count: 0,
    pipeline_degraded_count: 0,
    pipeline_failed_count: 0,
    unknown_risk_count: 0,
    eligible_unknown_risk_count: 0,
    strict_full_coverage_count: 0,
    strict_full_coverage_ratio: 0,
    partial_data_count: 0,
    zero_buy_anomaly_status: 'not_evaluated',
    counts_by_asset_class: {},
  };

  for (const decision of decisions) {
    const assetClass = decision.asset_class || 'UNKNOWN';
    summary.counts_by_asset_class[assetClass] = (summary.counts_by_asset_class[assetClass] || 0) + 1;
    if (decision.evaluation_role === 'macro') summary.assets_macro_total += 1;
    if (decision.tradability === true) summary.assets_tradable_total += 1;
    if (decision.tradability === true && decision.evaluation_role === 'tradable') summary.assets_expected_for_decision += 1;

    const coverage = decision.coverage_class;
    if (coverage === 'eligible') summary.assets_eligible += 1;
    if (coverage === 'insufficient_history') summary.assets_insufficient_history += 1;
    if (coverage === 'provider_no_data') summary.assets_provider_no_data += 1;
    if (coverage === 'inactive') summary.assets_inactive += 1;
    if (coverage === 'macro_only') summary.assets_macro_only += 1;
    if (coverage === 'unclassified_missing') summary.assets_unclassified_missing += 1;

    if (decision.verdict === 'BUY') summary.buy_count += 1;
    if (decision.verdict === 'WAIT') summary.wait_count += 1;
    if (decision.verdict === 'WAIT_PIPELINE_INCOMPLETE') {
      summary.wait_pipeline_incomplete_count += 1;
      if (coverage === 'eligible') summary.eligible_wait_pipeline_incomplete_count += 1;
    }

    if (decision.pipeline_status === 'OK') summary.pipeline_ok_count += 1;
    if (decision.pipeline_status === 'DEGRADED') summary.pipeline_degraded_count += 1;
    if (decision.pipeline_status === 'FAILED') summary.pipeline_failed_count += 1;

    const riskLevel = String(decision.risk_assessment?.level || '').toUpperCase();
    if (riskLevel === 'UNKNOWN') {
      summary.unknown_risk_count += 1;
      if (coverage === 'eligible') summary.eligible_unknown_risk_count += 1;
    }
    if (
      coverage === 'eligible'
      && decision.pipeline_status === 'OK'
      && ['BUY', 'WAIT'].includes(decision.verdict)
      && riskLevel !== 'UNKNOWN'
      && (!Array.isArray(decision.blocking_reasons) || decision.blocking_reasons.length === 0)
    ) {
      summary.strict_full_coverage_count += 1;
    }
    if (decision.pipeline_status !== 'OK' || decision.verdict === 'WAIT_PIPELINE_INCOMPLETE') {
      summary.partial_data_count += 1;
    }
  }

  const denominator = summary.assets_expected_for_decision || summary.assets_total_universe || 1;
  summary.strict_full_coverage_ratio = Number((summary.strict_full_coverage_count / denominator).toFixed(6));
  if (summary.buy_count === 0 && summary.strict_full_coverage_ratio >= 0.95) {
    summary.zero_buy_anomaly_status = 'needs_macro_anchor';
  }
  return summary;
}

export function evaluateCoveragePolicy(summary, { requiredLeafFailed = false, bundleCorrupt = false } = {}) {
  const blocking = [];
  const warnings = [];
  const ratio = Number(summary?.strict_full_coverage_ratio ?? 0);
  if (bundleCorrupt) blocking.push('bundle_hash_mismatch');
  if (requiredLeafFailed) blocking.push('required_leaf_failed');
  if (Number(summary?.assets_unclassified_missing || 0) > 0) blocking.push('unclassified_missing');
  if (Number(summary?.eligible_wait_pipeline_incomplete_count || 0) > 0) warnings.push('eligible_wait_pipeline_incomplete');
  if (Number(summary?.eligible_unknown_risk_count || 0) > 0) warnings.push('risk_unknown');
  if (ratio < 0.50) blocking.push('strict_full_coverage_below_50pct');
  if (ratio < 0.95) warnings.push('strict_full_coverage_below_95pct');
  const status = blocking.length > 0 ? 'FAILED' : warnings.length > 0 ? 'DEGRADED' : 'OK';
  return { status, blocking_reasons: blocking, warnings };
}
