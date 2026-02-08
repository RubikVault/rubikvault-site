export function runDQChecks({ universeSymbols, barsBySymbol, asofDate, monitoringPolicy }) {
  const total = universeSymbols.length;
  const available = universeSymbols.filter((sym) => Array.isArray(barsBySymbol[sym]) && barsBySymbol[sym].length > 0);
  const covered = available.length;
  const coverage = total > 0 ? covered / total : 0;
  const coverageMin = Number(monitoringPolicy?.coverage_min ?? 0.95);

  const staleSymbols = [];
  for (const sym of available) {
    const rows = barsBySymbol[sym];
    const last = rows[rows.length - 1];
    if (!last?.date || last.date > asofDate) {
      staleSymbols.push(sym);
    }
  }

  const passCoverage = coverage >= coverageMin;
  const passStaleness = staleSymbols.length === 0;
  const pass = passCoverage && passStaleness;

  let reason = null;
  if (!passCoverage) reason = `DQ_COVERAGE_BELOW_MIN:${coverage.toFixed(4)}<${coverageMin}`;
  else if (!passStaleness) reason = 'DQ_STALE_OR_INVALID_BARS';

  return {
    pass,
    circuitOpen: !pass,
    reason,
    metrics: {
      coverage,
      coverage_min: coverageMin,
      covered_symbols: covered,
      total_symbols: total,
      stale_symbols: staleSymbols.slice(0, 50)
    }
  };
}

export default { runDQChecks };
