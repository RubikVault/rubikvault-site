/**
 * V6.0 — Layer 10: Risk & Execution
 *
 * Transaction costs, tail risk, actionability scoring, short constraints.
 */

/**
 * Compute execution cost penalty.
 * Penalty = transaction_cost / |expected_return|, capped at 1.0.
 *
 * @param {number} transactionCost - Estimated roundtrip cost (spread + fees + slippage)
 * @param {number} expectedReturn - Expected return magnitude
 * @returns {number} Penalty ∈ [0, 1]
 */
export function computeExecutionCostPenalty(transactionCost, expectedReturn) {
  if (!Number.isFinite(transactionCost) || transactionCost <= 0) return 0;
  return Math.min(1.0, transactionCost / Math.max(Math.abs(expectedReturn || 0), 1e-6));
}

/**
 * Compute CVaR at 95th percentile (Conditional Value at Risk).
 * Mean of returns below the 5th percentile.
 *
 * @param {Array} returns - Array of historical returns
 * @returns {number} CVaR95 (always positive, representing loss magnitude)
 */
export function computeCVaR95(returns) {
  if (!returns || returns.length < 20) return 0;

  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.ceil(sorted.length * 0.05));
  const tail = sorted.slice(0, cutoff);

  const cvar = tail.reduce((s, v) => s + v, 0) / tail.length;
  return Math.abs(cvar);
}

/**
 * Compute tail risk penalty.
 * Penalty = CVaR95 / max_acceptable_loss, capped at 1.0.
 *
 * @param {number} cvar95 - CVaR at 95th percentile
 * @param {number} maxAcceptableLoss - Maximum acceptable loss threshold
 * @returns {number} Penalty ∈ [0, 1]
 */
export function computeTailRiskPenalty(cvar95, maxAcceptableLoss) {
  if (!Number.isFinite(maxAcceptableLoss) || maxAcceptableLoss <= 0) return 0;
  return Math.min(1.0, (cvar95 || 0) / maxAcceptableLoss);
}

/**
 * Compute actionability score.
 * Combines bias, confidence, and all risk penalties.
 *
 * @param {number} ensembleBias - Ensemble bias [-1, 1]
 * @param {number} confidence - Confidence [0, 1]
 * @param {number} executionCostPenalty - [0, 1]
 * @param {number} tailRiskPenalty - [0, 1]
 * @param {number} eventRiskPenalty - [0, 1]
 * @returns {number} Actionability score [0, 1]
 */
export function computeActionabilityScore(ensembleBias, confidence, executionCostPenalty = 0, tailRiskPenalty = 0, eventRiskPenalty = 0) {
  return Number((
    Math.abs(ensembleBias || 0) *
    (confidence || 0) *
    (1 - executionCostPenalty) *
    (1 - tailRiskPenalty) *
    (1 - eventRiskPenalty)
  ).toFixed(4));
}

/**
 * Evaluate short constraints for a ticker.
 *
 * @param {string} ticker
 * @param {Object} [constraints] - { restricted_tickers: Set, borrow_fee_threshold: number }
 * @returns {{ is_shortable: boolean, constraints: string[], max_actionability: string }}
 */
export function evaluateShortConstraints(ticker, constraints = {}) {
  const restricted = constraints.restricted_tickers || new Set();
  const issues = [];

  if (restricted.has(ticker)) issues.push('RESTRICTED_TICKER');
  if ((constraints.borrow_fee_annualized || 0) > 0.10) issues.push('HIGH_BORROW_FEE');
  if ((constraints.days_to_cover || 0) > 5) issues.push('HIGH_DAYS_TO_COVER');
  if ((constraints.squeeze_risk_score || 0) > 0.7) issues.push('SQUEEZE_RISK');

  const isShortable = issues.length === 0;
  const maxActionability = isShortable ? 'full' : 'watch';

  return { is_shortable: isShortable, constraints: issues, max_actionability: maxActionability };
}

/**
 * Compute full risk-execution assessment.
 *
 * @param {Object} params
 * @returns {Object} Risk execution result
 */
export function computeRiskExecution({
  returns = [],
  transactionCost = 0,
  expectedReturn = 0,
  maxAcceptableLoss = 0.10,
  ensembleBias = 0,
  confidence = 0,
  eventRiskPenalty = 0,
  crashState = 'normal',
  transitionState = 'stable',
}) {
  const cvar95 = computeCVaR95(returns);
  const execPenalty = computeExecutionCostPenalty(transactionCost, expectedReturn);
  const tailPenalty = computeTailRiskPenalty(cvar95, maxAcceptableLoss);
  let actionability = computeActionabilityScore(ensembleBias, confidence, execPenalty, tailPenalty, eventRiskPenalty);

  // Dampening for stress states
  if (transitionState === 'unstable') actionability *= 0.7;
  if (crashState === 'warning') actionability *= 0.5;
  if (crashState === 'critical') actionability = 0;

  return {
    transaction_cost_estimate: transactionCost,
    cvar_95: Number(cvar95.toFixed(6)),
    execution_cost_penalty: Number(execPenalty.toFixed(4)),
    tail_risk_penalty: Number(tailPenalty.toFixed(4)),
    event_risk_penalty: eventRiskPenalty,
    actionability_score: Number(actionability.toFixed(4)),
    crash_state: crashState,
  };
}
