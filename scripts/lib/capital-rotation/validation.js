/**
 * Capital Rotation Monitor — Output Validation
 */

import { PARAMS_V1 } from './params.js';

/**
 * Check staleness based on data date vs now.
 * @param {string} asOfDate - YYYY-MM-DD
 * @returns {'fresh'|'stale'|'critical_stale'}
 */
export function checkStaleness(asOfDate) {
  if (!asOfDate) return 'critical_stale';
  const now = new Date();
  const dataDate = new Date(asOfDate + 'T23:59:59Z');
  const diffMs = now - dataDate;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  // Approximate trading days (weekdays only)
  let tradingDays = 0;
  const current = new Date(dataDate);
  while (current < now) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) tradingDays++;
  }

  if (tradingDays <= 1) return 'fresh';
  if (tradingDays <= PARAMS_V1.staleTradingDaysSoft) return 'fresh';
  if (tradingDays <= PARAMS_V1.staleTradingDaysHard) return 'stale';
  return 'critical_stale';
}

/**
 * Compute coverage: fraction of enabled ratios that have valid results.
 */
export function checkCoverage(ratioResults, expectedCount) {
  const valid = Object.values(ratioResults).filter(r => r && Number.isFinite(r.composite)).length;
  return expectedCount > 0 ? Math.round((valid / expectedCount) * 100) / 100 : 0;
}

/**
 * Validate output document structure.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateOutputDoc(doc) {
  const errors = [];

  if (!doc) { errors.push('Document is null'); return { valid: false, errors }; }
  if (!doc.data) errors.push('Missing data field');
  if (!doc.metadata) errors.push('Missing metadata field');

  const data = doc.data || {};
  if (!data.globalScore) errors.push('Missing globalScore');
  if (!data.blocks) errors.push('Missing blocks');
  if (!data.cycle) errors.push('Missing cycle');
  if (!data.narrative) errors.push('Missing narrative');
  if (!data.ratios) errors.push('Missing ratios');
  if (!data.meta) errors.push('Missing data.meta');

  if (data.globalScore) {
    const gs = data.globalScore;
    if (typeof gs.value !== 'number' || gs.value < 0 || gs.value > 100) {
      errors.push(`globalScore.value out of range: ${gs.value}`);
    }
  }

  if (data.ratios) {
    for (const [id, r] of Object.entries(data.ratios)) {
      if (r.composite != null && (r.composite < 0 || r.composite > 100)) {
        errors.push(`Ratio ${id} composite out of range: ${r.composite}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
