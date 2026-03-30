/**
 * V6.0 — Layer 8B: K-Management
 *
 * Controls shrinkage parameter transitions and trial budgets.
 * Prevents overfitting through strict gating.
 */

const DEFAULT_K = 50;

/**
 * Compute quarterly trial budget.
 * @param {Array} activeTrials - Current active (non-deprecated) trials
 * @param {Object} [config] - { max_active_trials_per_quarter: 20 }
 * @returns {{ budget_remaining: number, total_active: number, budget_exceeded: boolean }}
 */
export function computeKBudget(activeTrials, config = {}) {
  const maxPerQuarter = config.max_active_trials_per_quarter ?? 20;
  const totalActive = activeTrials.length;
  const remaining = Math.max(0, maxPerQuarter - totalActive);

  return {
    budget_remaining: remaining,
    total_active: totalActive,
    max_per_quarter: maxPerQuarter,
    budget_exceeded: remaining === 0,
  };
}

/**
 * Enforce K-budget limit on new trial creation.
 * @param {Array} registry - Full trial registry
 * @param {Object} budget - Output from computeKBudget
 * @returns {{ allowed: boolean, violation: string|null }}
 */
export function enforceKLimit(registry, budget) {
  if (budget.budget_exceeded) {
    return {
      allowed: false,
      violation: `QUARTERLY_BUDGET_EXCEEDED: ${budget.total_active}/${budget.max_per_quarter} active trials`,
    };
  }
  return { allowed: true, violation: null };
}

/**
 * Validate K-value transition (from default K=50 to empirically estimated K).
 * Requires strict out-of-sample validation.
 *
 * @param {Object} params - { n_oos, kOld, kNew, improvementVsBaseline, walkForwardReplicated, governanceReview }
 * @returns {{ approved: boolean, gate_failures: string[], transition_scope: string }}
 */
export function validateKTransition({ n_oos, kOld = DEFAULT_K, kNew, improvementVsBaseline, walkForwardReplicated, governanceReview }) {
  const failures = [];

  if ((n_oos || 0) < 500) failures.push('N_OOS_BELOW_500');
  if (!walkForwardReplicated) failures.push('WALK_FORWARD_NOT_REPLICATED');
  if (!improvementVsBaseline) failures.push('NO_IMPROVEMENT_VS_BASELINE');
  if (!governanceReview) failures.push('GOVERNANCE_REVIEW_MISSING');

  return {
    approved: failures.length === 0,
    gate_failures: failures,
    transition_scope: 'full_recomputation_with_version_bump',
    k_old: kOld,
    k_new: kNew,
  };
}
