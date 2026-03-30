/**
 * V6.0 — Alpha-Budget Gate
 *
 * Enforces quarterly trial budget limits to prevent alpha decay from overfitting.
 * Acts as a CI-gate before any new OOS trial can be started.
 */

import { computeKBudget, enforceKLimit } from './k-management.mjs';

/**
 * Separate research-only trials from production trials.
 *
 * @param {Array} registry - Full trial registry
 * @returns {{ research_trials: Array, production_trials: Array }}
 */
export function separateResearchFromProduction(registry) {
  const research = [];
  const production = [];

  for (const trial of registry) {
    if (trial.research_only) {
      research.push(trial);
    } else {
      production.push(trial);
    }
  }

  return { research_trials: research, production_trials: production };
}

/**
 * Enforce the alpha-budget gate before allowing new OOS trial creation.
 *
 * @param {Array} registry - Full trial registry
 * @param {Object} [config] - { max_active_trials_per_quarter: 20 }
 * @returns {{ gate_passed: boolean, budget_status: Object, blocked_reason: string|null }}
 */
export function enforceAlphaBudgetGate(registry, config = {}) {
  const { production_trials } = separateResearchFromProduction(registry);

  const activeTrials = production_trials.filter(
    t => t.status !== 'deprecated' && t.oos_touched
  );

  const budget = computeKBudget(activeTrials, config);
  const { allowed, violation } = enforceKLimit(registry, budget);

  return {
    gate_passed: allowed,
    budget_status: budget,
    blocked_reason: allowed ? null : violation,
  };
}

/**
 * Record that a trial consumed alpha-budget.
 *
 * @param {Array} registry - Full trial registry
 * @param {string} trialId - ID of the trial consuming budget
 * @returns {{ debited: boolean, remaining_budget: number }}
 */
export function debitAlphaBudget(registry, trialId, config = {}) {
  const trial = registry.find(t => t.trial_id === trialId);
  if (!trial) return { debited: false, remaining_budget: 0 };

  const { production_trials } = separateResearchFromProduction(registry);
  const activeTrials = production_trials.filter(
    t => t.status !== 'deprecated' && t.oos_touched
  );

  const budget = computeKBudget(activeTrials, config);

  return {
    debited: true,
    remaining_budget: budget.budget_remaining,
    trial_id: trialId,
    timestamp: new Date().toISOString(),
  };
}
