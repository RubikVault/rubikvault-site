/**
 * V6.0 — Benchmark & Stress-Window Gates
 *
 * Provides promotion-blocking gates:
 * 1. Candidate must beat baseline Sharpe
 * 2. All stress windows must pass (no severe underperformance)
 */

/**
 * Evaluate stress window performance against a baseline.
 *
 * @param {Array} returns - Array of period returns
 * @param {Array} stressWindows - [{ window_id, start_idx, end_idx, baseline_return }]
 * @param {number} [maxUnderperformance=-0.15] - Maximum allowed underperformance
 * @returns {Array} [{ window_id, performance_vs_baseline, passed }]
 */
export function evaluateStressWindowPerformance(returns, stressWindows, maxUnderperformance = -0.15) {
  if (!stressWindows?.length || !returns?.length) return [];

  return stressWindows.map(window => {
    const slice = returns.slice(window.start_idx, window.end_idx + 1);
    if (!slice.length) {
      return { window_id: window.window_id, performance_vs_baseline: 0, passed: true };
    }

    const cumulativeReturn = slice.reduce((acc, r) => acc * (1 + r), 1) - 1;
    const baseline = window.baseline_return ?? 0;
    const performanceVsBaseline = cumulativeReturn - baseline;

    return {
      window_id: window.window_id,
      cumulative_return: Number(cumulativeReturn.toFixed(6)),
      baseline_return: baseline,
      performance_vs_baseline: Number(performanceVsBaseline.toFixed(6)),
      passed: performanceVsBaseline >= maxUnderperformance,
    };
  });
}

/**
 * Evaluate benchmark gate for trial promotion.
 *
 * Gate 1: Candidate Sharpe must beat baseline Sharpe
 * Gate 2: All stress windows must pass
 *
 * @param {Object} params
 * @param {number} params.candidateSharpe - Candidate strategy Sharpe ratio
 * @param {number} params.baselineSharpe - Baseline (buy-and-hold / benchmark) Sharpe
 * @param {Array} [params.stressWindowResults] - Output from evaluateStressWindowPerformance
 * @param {number} [params.minSharpeMargin=0] - Minimum margin over baseline
 * @returns {{ gate_passed: boolean, failures: string[] }}
 */
export function evaluateBenchmarkGate({
  candidateSharpe,
  baselineSharpe,
  stressWindowResults = [],
  minSharpeMargin = 0,
}) {
  const failures = [];

  if (!Number.isFinite(candidateSharpe) || !Number.isFinite(baselineSharpe)) {
    failures.push('SHARPE_DATA_MISSING');
  } else if (candidateSharpe < baselineSharpe + minSharpeMargin) {
    failures.push('SHARPE_BELOW_BASELINE');
  }

  const failedWindows = stressWindowResults.filter(w => !w.passed);
  if (failedWindows.length > 0) {
    failures.push(`STRESS_WINDOWS_FAILED:${failedWindows.map(w => w.window_id).join(',')}`);
  }

  return {
    gate_passed: failures.length === 0,
    failures,
    candidate_sharpe: candidateSharpe,
    baseline_sharpe: baselineSharpe,
    stress_windows_total: stressWindowResults.length,
    stress_windows_passed: stressWindowResults.filter(w => w.passed).length,
  };
}
