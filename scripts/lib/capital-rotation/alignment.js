/**
 * Capital Rotation Monitor — Pair Alignment
 * Inner-joins two bar series by date with gap detection.
 */

import { isCrypto, filterToTradingDays, tradingDaysBetween } from './calendars.js';

/**
 * Align two bar arrays on common trading dates.
 * @param {Array<{date:string, close:number}>} barsA
 * @param {Array<{date:string, close:number}>} barsB
 * @param {string} symbolA
 * @param {string} symbolB
 * @param {{maxGapDays?:number}} opts
 * @returns {{aligned:Array<{date:string,closeA:number,closeB:number}>, gaps:number, maxGap:number, coverage:number, warnings:string[]}}
 */
export function alignPair(barsA, barsB, symbolA, symbolB, opts = {}) {
  const maxGapDays = opts.maxGapDays ?? 3;
  const warnings = [];

  if (!barsA?.length || !barsB?.length) {
    return { aligned: [], gaps: 0, maxGap: 0, coverage: 0, warnings: ['No bars for one or both legs'] };
  }

  // Filter crypto to trading days for alignment with TradFi
  let filteredA = isCrypto(symbolA) ? filterToTradingDays(barsA) : barsA;
  let filteredB = isCrypto(symbolB) ? filterToTradingDays(barsB) : barsB;

  // Build date maps
  const mapA = new Map();
  for (const bar of filteredA) {
    if (bar.date && Number.isFinite(bar.close) && bar.close > 0) {
      mapA.set(bar.date, bar.close);
    }
  }
  const mapB = new Map();
  for (const bar of filteredB) {
    if (bar.date && Number.isFinite(bar.close) && bar.close > 0) {
      mapB.set(bar.date, bar.close);
    }
  }

  // Inner join on dates
  const commonDates = [...mapA.keys()].filter(d => mapB.has(d)).sort();

  if (!commonDates.length) {
    return { aligned: [], gaps: 0, maxGap: 0, coverage: 0, warnings: ['No overlapping dates'] };
  }

  // Detect gaps
  let totalGaps = 0;
  let maxGap = 0;
  for (let i = 1; i < commonDates.length; i++) {
    const gap = tradingDaysBetween(commonDates[i - 1], commonDates[i]) - 1;
    if (gap > 0) {
      totalGaps += gap;
      if (gap > maxGap) maxGap = gap;
    }
  }

  if (maxGap > maxGapDays) {
    warnings.push(`Max gap of ${maxGap} trading days exceeds threshold of ${maxGapDays}`);
  }

  // Expected trading days = calendar range
  const expectedDays = tradingDaysBetween(commonDates[0], commonDates[commonDates.length - 1]) + 1;
  const coverage = expectedDays > 0 ? commonDates.length / expectedDays : 0;

  const aligned = commonDates.map(date => ({
    date,
    closeA: mapA.get(date),
    closeB: mapB.get(date)
  }));

  return { aligned, gaps: totalGaps, maxGap, coverage: Math.min(coverage, 1), warnings };
}
