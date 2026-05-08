import { classifyRegion, dateDiffDays, finiteNumber, normalizeAssetType, normalizeId, uniqueStrings } from './shared.mjs';

export const ELIGIBILITY_STATUS = {
  ELIGIBLE: 'ELIGIBLE',
  INCUBATING: 'INCUBATING',
  LIMITED_HISTORY: 'LIMITED_HISTORY',
  NOT_DECISION_GRADE: 'NOT_DECISION_GRADE',
  EXCLUDED: 'EXCLUDED',
};

export function resolveEligibility(row, { targetMarketDate, policy = {} } = {}) {
  const canonicalId = normalizeId(row?.canonical_id || row?.id);
  const assetType = normalizeAssetType(row?.type_norm || row?.asset_class || row?.type);
  const barsCount = finiteNumber(row?.bars_count) || 0;
  const asOfDate = String(row?.last_trade_date || row?.bars_latest_date || '').slice(0, 10) || null;
  const close = latestClose(row);
  const stalenessBd = finiteNumber(row?.computed?.staleness_bd);
  const warnings = [];
  const vetos = [];
  const lifecycleReasons = [];
  const supported = ['STOCK', 'ETF', 'INDEX'].includes(assetType);
  const macroOnly = assetType === 'INDEX' && row?.tradability !== true;

  if (!canonicalId || !supported) {
    return build({
      status: ELIGIBILITY_STATUS.EXCLUDED,
      assetType: supported ? assetType : 'INDEX',
      barsCount,
      asOfDate,
      close,
      vetos: ['MACRO_ONLY_NOT_TRADABLE'],
      warnings,
      lifecycleReasons: ['MACRO_ONLY_NOT_TRADABLE'],
      macroOnly: true,
      row,
    });
  }

  if (macroOnly) {
    lifecycleReasons.push('INDEX_CONTEXT_ONLY');
    return build({
      status: ELIGIBILITY_STATUS.EXCLUDED,
      assetType,
      barsCount,
      asOfDate,
      close,
      vetos: ['INDEX_CONTEXT_ONLY'],
      warnings,
      lifecycleReasons,
      macroOnly: true,
      row,
    });
  }

  if (barsCount < 126) lifecycleReasons.push('INCUBATING_INSUFFICIENT_BARS');
  if (barsCount >= 126 && barsCount < 252) lifecycleReasons.push('LIMITED_HISTORY_NO_BUY');

  const ageDays = dateDiffDays(asOfDate, targetMarketDate);
  if (ageDays != null && ageDays > 10) vetos.push('STALE_PRICE');
  if (stalenessBd != null && stalenessBd > 5) vetos.push('STALE_PRICE');
  if (!asOfDate) vetos.push('CRITICAL_DATA_GAP');
  if (row?.flags?.ghost_price === true) vetos.push('SUSPICIOUS_ADJUSTED_DATA');
  if (close != null && close < Number(policy?.cost_proxy_policy?.min_price || 1)) vetos.push('PRICE_BELOW_MIN');

  const avgVol = finiteNumber(row?.avg_volume_30d ?? row?.avg_volume_10d);
  if (close != null && avgVol != null) {
    const dollarVolume = close * avgVol;
    if (dollarVolume > 0 && dollarVolume < Number(policy?.cost_proxy_policy?.min_dollar_volume_20d || 250000)) {
      warnings.push('DOLLAR_VOLUME_TOO_LOW');
    }
  }

  let status = ELIGIBILITY_STATUS.ELIGIBLE;
  if (barsCount < 126) status = ELIGIBILITY_STATUS.INCUBATING;
  else if (barsCount < 252) status = ELIGIBILITY_STATUS.LIMITED_HISTORY;
  if (vetos.includes('STALE_PRICE') || vetos.includes('CRITICAL_DATA_GAP') || vetos.includes('SUSPICIOUS_ADJUSTED_DATA')) {
    status = ELIGIBILITY_STATUS.NOT_DECISION_GRADE;
  }

  return build({
    status,
    assetType,
    barsCount,
    asOfDate,
    close,
    vetos,
    warnings,
    lifecycleReasons,
    macroOnly: false,
    row,
  });
}

function build({ status, assetType, barsCount, asOfDate, close, vetos, warnings, lifecycleReasons, macroOnly, row }) {
  return {
    eligibility_status: status,
    asset_type: assetType,
    bars_count: barsCount,
    as_of_date: asOfDate,
    close,
    vetos: uniqueStrings(vetos),
    warnings: uniqueStrings(warnings),
    lifecycle_reason_codes: uniqueStrings(lifecycleReasons),
    macro_only: macroOnly,
    region: classifyRegion(row),
  };
}

export function latestClose(row) {
  const values = Array.isArray(row?._tmp_recent_closes) ? row._tmp_recent_closes : [];
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const n = finiteNumber(values[i]);
    if (n != null) return n;
  }
  return finiteNumber(row?.close || row?.last_close || row?.price);
}
